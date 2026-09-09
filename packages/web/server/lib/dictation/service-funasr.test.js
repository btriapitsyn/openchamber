import { describe, expect, it } from 'bun:test';
import { WebSocketServer } from 'ws';
import { z } from 'zod';
import { createDictationService } from './service.js';

describe('FunASR service protocol selection', () => {
  for (const protocol of [undefined, 'python', 'cpp-2pass', 'cpp-offline']) {
    it(`uses ${protocol ?? 'the default Python protocol'} on the wire`, async () => {
      const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
      await new Promise((resolve) => server.once('listening', resolve));
      const { port } = z.object({ port: z.number() }).parse(server.address());
      const starts = [];
      server.on('connection', (socket) => {
        socket.on('message', (data, binary) => {
          if (binary) return;
          const message = JSON.parse(data.toString());
          if (message.is_speaking) starts.push(message);
          if (message.is_speaking === false) {
            const response = protocol === 'cpp-offline'
              ? { mode: 'offline', text: 'done', is_final: false }
              : protocol === 'cpp-2pass'
                ? { mode: '2pass-offline', text: 'done', is_final: true }
                : { mode: '2pass-offline', text: 'done', is_final: true, is_end: true };
            socket.send(JSON.stringify(response));
          }
        });
      });
      const service = createDictationService({ modelsDir: '/unused-funasr-service-test' });
      let session;
      try {
        ({ session } = await service.createSttSession({
          provider: 'funasr-websocket', funasrWebsocket: { url: `ws://127.0.0.1:${port}`, protocol },
        }));
        expect(session).toBeDefined();
        const final = new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('no final transcript')), 1000);
          session.on('transcript', (event) => {
            if (event.isFinal) { clearTimeout(timer); resolve(event); }
          });
        });
        session.appendPcm16(Buffer.from([0, 4]));
        session.commit();
        expect(await final).toMatchObject({ transcript: 'done', isFinal: true });
        expect(starts[0].mode).toBe(protocol === 'cpp-offline' ? 'offline' : '2pass');
      } finally {
        session?.close();
        await new Promise((resolve) => server.close(resolve));
      }
    });
  }

  it('reports an unsupported protocol as a configuration failure', async () => {
    const service = createDictationService({ modelsDir: '/unused-funasr-service-test' });
    const result = await service.createSttSession({
      provider: 'funasr-websocket', funasrWebsocket: { url: 'ws://127.0.0.1:1', protocol: 'auto' },
    });
    expect(result).toMatchObject({ retryable: false, reasonCode: 'stt_not_configured' });
    expect(result.error).toContain('protocol');
  });
});
