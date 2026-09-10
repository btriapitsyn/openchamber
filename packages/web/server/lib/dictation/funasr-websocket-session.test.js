import { describe, expect, it } from 'bun:test';
import { WebSocketServer } from 'ws';
import { z } from 'zod';
import { spawn } from 'node:child_process';

import { FunASRWebSocketTranscriptionSession } from './funasr-websocket-session.js';
import { DictationStreamManager } from './stream-manager.js';

function waitFor(predicate, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('waitFor timed out'));
        return;
      }
      setTimeout(tick, 5);
    };
    tick();
  });
}

describe('FunASRWebSocketTranscriptionSession', () => {
  it('uses the FunASR binary protocol and forwards partial and final transcripts', async () => {
    const received = [];
    const connection = {};
    const server = new WebSocketServer({
      host: '127.0.0.1',
      port: 0,
      handleProtocols: (protocols) => (protocols.has('binary') ? 'binary' : false),
    });

    await new Promise((resolve) => server.once('listening', resolve));
    const address = z.object({ port: z.number().int().positive() }).parse(server.address());

    server.on('connection', (socket, request) => {
      connection.protocol = socket.protocol;
      connection.authorization = request.headers.authorization;
      socket.on('message', (data, isBinary) => {
        received.push({ data: isBinary ? Buffer.from(data) : data.toString(), isBinary });
        if (isBinary) {
          socket.send(JSON.stringify({ mode: '2pass-online', text: 'partial' }));
          return;
        }
        const message = JSON.parse(data.toString());
        if (message.is_speaking === false) {
          socket.send(JSON.stringify({ mode: '2pass-offline', text: 'final', is_final: true }));
        }
      });
    });

    const session = new FunASRWebSocketTranscriptionSession({
      url: `ws://127.0.0.1:${address.port}`,
      apiKey: 'test-api-key',
      protocol: 'cpp-2pass',
    });
    const transcripts = [];
    const commits = [];
    session.on('transcript', (event) => transcripts.push(event));
    session.on('committed', (event) => commits.push(event));

    try {
      await session.connect();
      session.appendPcm16(Buffer.from([1, 2, 3, 4]));
      await waitFor(() => transcripts.length === 1);
      session.commit();
      await waitFor(() => transcripts.length === 2 && commits.length === 1);

      expect(connection).toEqual({
        protocol: 'binary',
        authorization: 'Bearer test-api-key',
      });
      expect(JSON.parse(received[0].data)).toMatchObject({
        mode: '2pass',
        chunk_size: [5, 10, 5],
        chunk_interval: 10,
        encoder_chunk_look_back: 4,
        decoder_chunk_look_back: 1,
        is_speaking: true,
        audio_fs: 16000,
      });
      expect(received[1]).toEqual({ data: Buffer.from([1, 2, 3, 4]), isBinary: true });
      expect(JSON.parse(received[2].data)).toMatchObject({ is_speaking: false, is_end: true });
      expect(transcripts.map(({ transcript, isFinal }) => ({ transcript, isFinal }))).toEqual([
        { transcript: 'partial', isFinal: false },
        { transcript: 'final', isFinal: true },
      ]);
    } finally {
      session.close();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe('FunASR Node process cleanup', () => {
  it('releases the final timer after an unexpected committed-socket close', async () => {
    const moduleUrl = new URL('./funasr-websocket-session.js', import.meta.url).href;
    const source = `
      import { createRequire } from 'node:module';
      const { WebSocketServer } = createRequire(${JSON.stringify(moduleUrl)})('ws');
      import { FunASRWebSocketTranscriptionSession } from ${JSON.stringify(moduleUrl)};
      const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
      await new Promise(resolve => server.once('listening', resolve));
      server.on('connection', socket => {
        socket.on('message', (data, binary) => {
          if (!binary && JSON.parse(data.toString()).is_speaking === false) socket.close();
        });
      });
      const session = new FunASRWebSocketTranscriptionSession({
        url: 'ws://127.0.0.1:' + server.address().port, protocol: 'cpp-2pass',
      });
      session.on('error', () => {
        session.close();
        server.close();
        process.stdout.write('observed-close-error');
      });
      await session.connect();
      session.appendPcm16(Buffer.from([0, 4]));
      session.commit();
    `;
    const child = spawn('node', ['--input-type=module', '--eval', source], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let errors = '';
    child.stdout.on('data', data => { output += data.toString(); });
    child.stderr.on('data', data => { errors += data.toString(); });
    const exited = new Promise(resolve => child.once('exit', resolve));
    try {
      await waitFor(() => output.includes('observed-close-error') || child.exitCode !== null, 2000);
      expect(errors).toBe('');
      expect(output).toContain('observed-close-error');
      await waitFor(() => child.exitCode !== null, 1500);
      expect(child.exitCode).toBe(0);
      expect(errors).toBe('');
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
      await exited;
    }
  });
});

describe('FunASR manager segment ordering', () => {
  it('joins committed segments in recording order after clearing silence and receiving reverse-order results', async () => {
    const fixture = await createProtocolFixture();
    const output = [];
    const manager = new DictationStreamManager({
      emit: (event) => output.push(event),
      createSttSession: async () => ({ session: fixture.session }),
      segmentMinSeconds: 0.1,
      segmentMaxSeconds: 0.1,
    });
    try {
      await manager.handleStart('ordered', 'audio/pcm;rate=16000;bits=16');
      manager.handleChunk({ dictationId: 'ordered', seq: 0, audioBase64: speechPcm().toString('base64') });
      await waitFor(() => fixture.ends.length === 1);
      const first = fixture.ends[0];
      manager.handleChunk({ dictationId: 'ordered', seq: 1, audioBase64: Buffer.alloc(3200).toString('base64') });
      manager.handleChunk({ dictationId: 'ordered', seq: 2, audioBase64: speechPcm().toString('base64') });
      manager.handleFinish('ordered', 2);
      await waitFor(() => fixture.ends.length === 2);
      const third = fixture.ends[1];
      third.socket.send(JSON.stringify({ is_final: true, text: 'third' }));
      await waitFor(() => fixture.transcripts.length === 1);
      expect(output.filter((event) => event.type === 'final')).toEqual([]);
      first.socket.send(JSON.stringify({ is_final: true, text: 'first' }));
      await waitFor(() => output.some((event) => event.type === 'final'));
      expect(output.filter((event) => event.type === 'final')).toEqual([
        { type: 'final', payload: { dictationId: 'ordered', text: 'first third' } },
      ]);
      expect(output.filter((event) => event.type === 'error')).toEqual([]);
    } finally {
      manager.cleanupAll();
      await fixture.dispose();
    }
  });
});

describe('FunASR resource and cancellation boundaries', () => {
  it('reports a rejected handshake for an already committed later segment', async () => {
    const fixture = await createProtocolFixture('cpp-2pass', 1);
    try {
      fixture.session.appendPcm16(speechPcm());
      fixture.session.commit();
      await waitFor(() => fixture.ends.length === 1);
      fixture.session.appendPcm16(speechPcm());
      fixture.session.commit();
      await waitFor(() => fixture.errors.length === 1);
      expect(fixture.errors[0]).toBeInstanceOf(Error);
      expect(fixture.ends).toHaveLength(1);
      expect(fixture.transcripts).toEqual([]);
    } finally {
      await fixture.dispose();
    }
  });

  it('preserves spaces between online deltas and removes an empty offline correction', async () => {
    const fixture = await createProtocolFixture('python');
    try {
      fixture.session.appendPcm16(speechPcm());
      await waitFor(() => fixture.starts.length === 1);
      const { socket } = fixture.starts[0];
      socket.send(JSON.stringify({ mode: '2pass-online', text: 'hello ' }));
      socket.send(JSON.stringify({ mode: '2pass-online', text: 'world' }));
      socket.send(JSON.stringify({ mode: '2pass-offline', text: '', is_final: true }));
      await waitFor(() => fixture.transcripts.length === 3);
      expect(fixture.transcripts.map((event) => event.transcript)).toEqual(['hello', 'hello world', '']);
      fixture.session.commit();
      await waitFor(() => fixture.ends.length === 1);
      socket.send(JSON.stringify({ is_end: true, is_final: true }));
      await waitFor(() => fixture.transcripts.length === 4);
      expect(fixture.transcripts[3]).toMatchObject({ transcript: '', isFinal: true });
    } finally {
      await fixture.dispose();
    }
  });

  it('bounds PCM queued during the next connection handshake', async () => {
    const fixture = await createProtocolFixture();
    try {
      fixture.session.appendPcm16(speechPcm());
      fixture.session.commit();
      await waitFor(() => fixture.ends.length === 1);
      fixture.session.appendPcm16(Buffer.alloc(320002));
      expect(fixture.errors).toHaveLength(1);
      expect(fixture.errors[0].message).toContain('buffer exceeded');
    } finally {
      await fixture.dispose();
    }
  });

  it('bounds PCM queued on an open socket', async () => {
    const fixture = await createProtocolFixture();
    try {
      fixture.session.appendPcm16(Buffer.alloc(320002));
      expect(fixture.errors).toHaveLength(1);
      expect(fixture.errors[0].message).toContain('buffer exceeded');
    } finally {
      await fixture.dispose();
    }
  });

  it('bounds pending segments instead of opening unlimited decoding connections', async () => {
    const fixture = await createProtocolFixture();
    try {
      for (let i = 0; i < 8; i += 1) {
        fixture.session.appendPcm16(speechPcm());
        fixture.session.commit();
      }
      await waitFor(() => fixture.ends.length === 8);
      fixture.session.appendPcm16(speechPcm());
      expect(fixture.errors).toHaveLength(1);
      expect(fixture.errors[0].message).toContain('Too many pending');
    } finally {
      await fixture.dispose();
    }
  });

  it('cancels an active handshake without publishing old audio into the next segment', async () => {
    const fixture = await createProtocolFixture();
    try {
      fixture.session.appendPcm16(speechPcm());
      fixture.session.commit();
      await waitFor(() => fixture.ends.length === 1);
      const first = fixture.ends[0];
      fixture.session.appendPcm16(Buffer.alloc(3200));
      fixture.session.clear();
      fixture.session.appendPcm16(speechPcm());
      fixture.session.commit();
      await waitFor(() => fixture.ends.length === 2);
      const third = fixture.ends[1];
      third.socket.send(JSON.stringify({ is_final: true, text: 'third' }));
      first.socket.send(JSON.stringify({ is_final: true, text: 'first' }));
      await waitFor(() => fixture.transcripts.length === 2);
      expect(fixture.starts).toHaveLength(2);
      expect(fixture.errors).toEqual([]);
    } finally {
      await fixture.dispose();
    }
  });

  for (const response of [null, [], { text: 42 }, { is_final: 'true' }]) {
    it(`rejects malformed response ${JSON.stringify(response)}`, async () => {
      const fixture = await createProtocolFixture();
      try {
        fixture.session.appendPcm16(speechPcm());
        await waitFor(() => fixture.starts.length === 1);
        fixture.starts[0].socket.send(JSON.stringify(response));
        await waitFor(() => fixture.errors.length === 1);
        expect(fixture.transcripts).toEqual([]);
      } finally {
        await fixture.dispose();
      }
    });
  }
});

describe('FunASR completion profiles', () => {
  for (const protocol of ['python', 'cpp-2pass']) {
    it(`keeps corrected VAD pieces until the ${protocol} end boundary`, async () => {
      const fixture = await createProtocolFixture(protocol);
      const output = [];
      const manager = new DictationStreamManager({
        emit: (event) => output.push(event),
        createSttSession: async () => ({ session: fixture.session }),
      });
      try {
        await manager.handleStart('vad', 'audio/pcm;rate=16000;bits=16');
        manager.handleChunk({ dictationId: 'vad', seq: 0, audioBase64: speechPcm().toString('base64') });
        await waitFor(() => fixture.starts.length === 1);
        const { socket, message } = fixture.starts[0];
        socket.send(JSON.stringify({ wav_name: message.wav_name, mode: '2pass-online', text: 'rough' }));
        socket.send(JSON.stringify({ wav_name: message.wav_name, mode: '2pass-offline', text: 'First.', is_final: protocol === 'python' }));
        socket.send(JSON.stringify({ wav_name: message.wav_name, mode: '2pass-offline', text: 'Second.', is_final: protocol === 'python' }));
        await waitFor(() => fixture.transcripts.length === 3);
        manager.handleFinish('vad', 0);
        await waitFor(() => fixture.ends.length === 1);
        expect(output.filter((event) => event.type === 'final')).toEqual([]);
        const terminal = { wav_name: message.wav_name, is_final: true };
        if (protocol === 'python') {
          terminal.is_end = true;
          terminal.mode = '2pass';
        }
        socket.send(JSON.stringify(terminal));
        await waitFor(() => output.some((event) => event.type === 'final'));
        expect(output.filter((event) => event.type === 'final')).toEqual([
          { type: 'final', payload: { dictationId: 'vad', text: 'First.Second.' } },
        ]);
        expect(fixture.errors).toEqual([]);
      } finally {
        manager.cleanupAll();
        await fixture.dispose();
      }
    });
  }

  it('reports a Python end-ack error instead of completing with empty text', async () => {
    const fixture = await createProtocolFixture('python');
    const output = [];
    const manager = new DictationStreamManager({
      emit: (event) => output.push(event),
      createSttSession: async () => ({ session: fixture.session }),
    });
    try {
      await manager.handleStart('error', 'audio/pcm;rate=16000;bits=16');
      manager.handleChunk({ dictationId: 'error', seq: 0, audioBase64: speechPcm().toString('base64') });
      manager.handleFinish('error', 0);
      await waitFor(() => fixture.ends.length === 1);
      fixture.ends[0].socket.send(JSON.stringify({ is_end: true, is_final: false, error: 'decode failed' }));
      await waitFor(() => output.some((event) => event.type === 'error'));
      expect(output.filter((event) => event.type === 'final')).toEqual([]);
      expect(output.find((event) => event.type === 'error').payload.error).toContain('decode failed');
    } finally {
      manager.cleanupAll();
      await fixture.dispose();
    }
  });

  it('isolates nameless replies across committed, cleared and new segments', async () => {
    const fixture = await createProtocolFixture();
    try {
      fixture.session.appendPcm16(speechPcm());
      fixture.session.commit();
      await waitFor(() => fixture.ends.length === 1);
      const first = fixture.ends[0];
      fixture.session.appendPcm16(Buffer.alloc(3200));
      await waitFor(() => fixture.starts.length === 2);
      const abandoned = fixture.starts[1];
      abandoned.socket.send(JSON.stringify({ is_final: true, text: 'discarded' }));
      fixture.session.clear();
      fixture.session.appendPcm16(speechPcm());
      fixture.session.commit();
      await waitFor(() => fixture.starts.length === 3 && fixture.ends.length === 2);
      const third = fixture.ends[1];
      third.socket.send(JSON.stringify({ is_final: true, text: 'third' }));
      first.socket.send(JSON.stringify({ is_final: true, text: 'first' }));
      await waitFor(() => fixture.transcripts.length >= 2 && fixture.transcripts.some((event) => event.transcript === 'first'));
      expect(fixture.transcripts).toHaveLength(2);
      expect(fixture.transcripts).toEqual(expect.arrayContaining([
        { segmentId: first.message.wav_name, transcript: 'first', isFinal: true },
        { segmentId: third.message.wav_name, transcript: 'third', isFinal: true },
      ]));
      expect(fixture.errors).toEqual([]);
    } finally {
      await fixture.dispose();
    }
  });
});

async function createProtocolFixture(protocol = 'cpp-2pass', rejectAfterConnections = Infinity) {
  const starts = [];
  const ends = [];
  const transcripts = [];
  const commits = [];
  const errors = [];
  let connections = 0;
  const server = new WebSocketServer({
    host: '127.0.0.1', port: 0,
    verifyClient: (_info, done) => {
      connections += 1;
      if (connections > rejectAfterConnections) done(false, 503, 'Unavailable');
      else done(true);
    },
  });
  await new Promise((resolve) => server.once('listening', resolve));
  server.on('connection', (socket) => {
    socket.on('message', (data, binary) => {
      if (binary) return;
      const message = JSON.parse(data.toString());
      if (message.is_speaking === true) starts.push({ socket, message });
      if (message.is_speaking === false) ends.push({ socket, message });
    });
  });
  const address = z.object({ port: z.number().int().positive() }).parse(server.address());
  const session = new FunASRWebSocketTranscriptionSession({
    url: `ws://127.0.0.1:${address.port}`,
    protocol,
  });
  session.on('transcript', (event) => transcripts.push(event));
  session.on('committed', (event) => commits.push(event));
  session.on('error', (error) => errors.push(error));
  await session.connect();
  return {
    session, starts, ends, transcripts, commits, errors,
    async dispose() {
      session.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function speechPcm() {
  const chunk = Buffer.alloc(3200);
  for (let i = 0; i < chunk.length; i += 2) chunk.writeInt16LE(1200, i);
  return chunk;
}

describe('FunASR dictation lifecycle over real WebSockets', () => {
  for (const [protocol, finalFields] of [
    ['python', { mode: '2pass', is_end: true, is_final: true }],
    ['cpp-offline', { mode: 'offline', is_final: false }],
    ['cpp-2pass', { is_final: true }],
  ]) {
    for (const textFields of [{ text: '' }, { text: '   ' }, {}]) {
      it(`finalizes voiced input with empty final ${JSON.stringify({ ...finalFields, ...textFields })}`, async () => {
        const fixture = await createProtocolFixture(protocol);
        const output = [];
        const manager = new DictationStreamManager({
          emit: (event) => output.push(event),
          createSttSession: async () => ({ session: fixture.session }),
        });
        try {
          await manager.handleStart('empty', 'audio/pcm;rate=16000;bits=16');
          manager.handleChunk({ dictationId: 'empty', seq: 0, audioBase64: speechPcm().toString('base64') });
          manager.handleFinish('empty', 0);
          await waitFor(() => fixture.ends.length === 1);
          const end = fixture.ends[0];
          end.socket.send(JSON.stringify({ wav_name: end.message.wav_name, ...finalFields, ...textFields }));
          await waitFor(() => output.some((event) => event.type === 'final'));
          expect(output.filter((event) => event.type === 'final')).toEqual([
            { type: 'final', payload: { dictationId: 'empty', text: '' } },
          ]);
          expect(output.filter((event) => event.type === 'error')).toEqual([]);
          expect(fixture.commits).toHaveLength(1);
          expect(fixture.errors).toEqual([]);
        } finally {
          manager.cleanupAll();
          await fixture.dispose();
        }
      });
    }
  }

  it('keeps a prior committed result when clearing a later segment and rejects abandoned ids', async () => {
    const fixture = await createProtocolFixture();
    try {
      fixture.session.appendPcm16(speechPcm());
      fixture.session.commit();
      await waitFor(() => fixture.starts.length === 1 && fixture.ends.length === 1);
      const first = fixture.starts[0];
      fixture.session.appendPcm16(Buffer.alloc(3200));
      await waitFor(() => fixture.starts.length === 2);
      const abandoned = fixture.starts[1];
      abandoned.socket.send(JSON.stringify({ wav_name: abandoned.message.wav_name, mode: '2pass-offline', text: 'discarded', is_final: true }));
      fixture.session.clear();
      fixture.session.appendPcm16(speechPcm());
      fixture.session.commit();
      await waitFor(() => fixture.starts.length === 3 && fixture.ends.length === 2);
      const third = fixture.starts[2];
      third.socket.send(JSON.stringify({ wav_name: third.message.wav_name, mode: '2pass-offline', text: 'third', is_final: true }));
      first.socket.send(JSON.stringify({ wav_name: first.message.wav_name, mode: '2pass-offline', text: 'first', is_final: true }));
      await waitFor(() => fixture.transcripts.length >= 2 && fixture.transcripts.some((event) => event.transcript === 'first'));
      expect(fixture.transcripts).toHaveLength(2);
      expect(fixture.transcripts).toEqual(expect.arrayContaining([
        { segmentId: first.message.wav_name, transcript: 'first', isFinal: true },
        { segmentId: third.message.wav_name, transcript: 'third', isFinal: true },
      ]));
      expect(fixture.errors).toEqual([]);
    } finally {
      await fixture.dispose();
    }
  });

  it('does not assign an unknown explicit id to a pending commit', async () => {
    const fixture = await createProtocolFixture();
    try {
      fixture.session.appendPcm16(speechPcm());
      fixture.session.commit();
      await waitFor(() => fixture.ends.length === 1);
      const end = fixture.ends[0];
      end.socket.send(JSON.stringify({ wav_name: 'unknown', mode: '2pass-offline', text: 'wrong', is_final: true }));
      end.socket.send(JSON.stringify({ wav_name: end.message.wav_name, mode: '2pass-offline', text: 'right', is_final: true }));
      await waitFor(() => fixture.transcripts.some((event) => event.transcript === 'right'));
      expect(fixture.transcripts).toEqual([
        { segmentId: end.message.wav_name, transcript: 'right', isFinal: true },
      ]);
    } finally {
      await fixture.dispose();
    }
  });

  it('ignores repeated finals instead of consuming a later commit', async () => {
    const fixture = await createProtocolFixture();
    try {
      fixture.session.appendPcm16(speechPcm());
      fixture.session.commit();
      fixture.session.appendPcm16(speechPcm());
      fixture.session.commit();
      await waitFor(() => fixture.ends.length === 2);
      const [first, second] = fixture.ends;
      const response = { wav_name: first.message.wav_name, mode: '2pass-offline', text: 'first', is_final: true };
      first.socket.send(JSON.stringify(response));
      first.socket.send(JSON.stringify(response));
      second.socket.send(JSON.stringify({ wav_name: second.message.wav_name, mode: '2pass-offline', text: 'second', is_final: true }));
      await waitFor(() => fixture.transcripts.length >= 2 && fixture.transcripts.some((event) => event.transcript === 'second'));
      expect(fixture.transcripts).toHaveLength(2);
      expect(fixture.transcripts).toEqual(expect.arrayContaining([
        { segmentId: first.message.wav_name, transcript: 'first', isFinal: true },
        { segmentId: second.message.wav_name, transcript: 'second', isFinal: true },
      ]));
    } finally {
      await fixture.dispose();
    }
  });
});
