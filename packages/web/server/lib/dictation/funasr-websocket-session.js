/**
 * FunASR transcription with one upstream socket per client segment.
 * A cleared socket cannot publish into a later segment, even without wav_name.
 */
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { z } from 'zod';

const FUNASR_SAMPLE_RATE = 16000;
const CONNECTION_TIMEOUT_MS = 10000;
const FINAL_TIMEOUT_MS = 300000;
const MAX_PENDING_SEGMENTS = 8;
const MAX_BUFFERED_PCM_BYTES = FUNASR_SAMPLE_RATE * 2 * 10;
const MAX_TRANSCRIPT_LENGTH = 1000000;
const FUNASR_CHUNK_SIZE = [5, 10, 5];
const PROTOCOLS = new Set(['python', 'cpp-2pass', 'cpp-offline']);
const responseSchema = z.object({
  text: z.string().optional(),
  mode: z.string().optional(),
  wav_name: z.string().optional(),
  error: z.string().optional(),
  is_final: z.boolean().optional(),
  is_end: z.boolean().optional(),
});

function requireWebSocketUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('FunASR WebSocket URL is not configured');
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error('FunASR WebSocket URL must use ws:// or wss://');
  }
  if (url.username || url.password) {
    throw new Error('Use the FunASR API key field instead of URL credentials');
  }
  return url.toString();
}

export class FunASRWebSocketTranscriptionSession extends EventEmitter {
  /**
   * @param {{ url: string, apiKey?: string, protocol?: 'python' | 'cpp-2pass' | 'cpp-offline', connectionTimeoutMs?: number }} config
   */
  constructor(config) {
    super();
    this.config = config;
    this.protocol = config.protocol ?? 'python';
    if (!PROTOCOLS.has(this.protocol)) throw new Error('Unsupported FunASR server protocol');
    this.requiredSampleRate = FUNASR_SAMPLE_RATE;
    this.connected = false;
    this.activeSegment = null;
    this.segments = new Set();
    this.previousSegmentId = null;
  }

  async connect() {
    if (this.segments.size > 0) throw new Error('FunASR session already connecting or connected');
    const segment = this.createSegment();
    this.activeSegment = segment;
    try {
      await segment.ready;
      this.connected = true;
    } catch (error) {
      this.close();
      throw error;
    }
  }

  createSegment() {
    if (this.segments.size >= MAX_PENDING_SEGMENTS) {
      throw new Error('Too many pending FunASR segments; the server is not keeping up');
    }
    const headers = this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : undefined;
    const options = { maxPayload: 1024 * 1024 };
    if (headers) options.headers = headers;
    const socket = new WebSocket(requireWebSocketUrl(this.config.url), 'binary', options);
    const segment = {
      id: randomUUID(), socket, phase: 'active', started: false, opened: false,
      frames: [], bufferedBytes: 0, confirmedText: '', onlineText: '',
      connectTimer: null, finalTimer: null, closeTimer: null, cancelConnect: null, ready: null,
    };
    this.segments.add(segment);
    segment.ready = new Promise((resolve, reject) => {
      segment.cancelConnect = () => reject(new Error('FunASR connection cancelled'));
      const rejectConnection = (error) => {
        if (segment.phase === 'retired') return;
        clearTimeout(segment.connectTimer);
        reject(error);
        segment.socket.terminate();
      };
      segment.connectTimer = setTimeout(() => {
        rejectConnection(new Error('Timed out connecting to FunASR WebSocket server'));
      }, this.config.connectionTimeoutMs ?? CONNECTION_TIMEOUT_MS);

      socket.once('open', () => {
        if (segment.phase === 'retired') return;
        clearTimeout(segment.connectTimer);
        segment.opened = true;
        resolve();
        if (segment.started) {
          if (!this.sendConfiguration(segment)) return;
          for (const frame of segment.frames) {
            if (!this.sendFrame(segment, frame, true)) return;
          }
          segment.frames = [];
          segment.bufferedBytes = 0;
          if (segment.phase === 'committed') this.sendEnd(segment);
        }
      });
      socket.on('error', (cause) => {
        if (segment.phase === 'retired') return;
        const error = new Error('FunASR WebSocket connection failed', { cause });
        if (!segment.opened) rejectConnection(error);
        else this.fail(error);
      });
      socket.on('close', () => {
        clearTimeout(segment.closeTimer);
        if (segment.phase === 'retired') {
          this.segments.delete(segment);
          return;
        }
        const error = new Error('FunASR WebSocket server disconnected before completing the segment');
        if (!segment.opened) rejectConnection(error);
        else this.fail(error);
      });
      socket.on('message', (data) => this.handleMessage(segment, data));
    });
    return segment;
  }

  getActiveSegment() {
    if (!this.connected) throw new Error('FunASR WebSocket session not connected');
    if (!this.activeSegment) {
      const segment = this.createSegment();
      this.activeSegment = segment;
      segment.ready.catch((error) => {
        if (this.connected && this.activeSegment === segment) this.fail(error);
        else if (this.connected && segment.phase === 'committed') this.fail(error);
      });
    }
    return this.activeSegment;
  }

  appendPcm16(chunk) {
    try {
      const segment = this.getActiveSegment();
      if (!segment.started) {
        segment.started = true;
        if (segment.opened && !this.sendConfiguration(segment)) return;
      }
      if (!segment.opened) {
        if (segment.bufferedBytes + chunk.length > MAX_BUFFERED_PCM_BYTES) {
          throw new Error('FunASR connection audio buffer exceeded 10 seconds');
        }
        segment.frames.push(Buffer.from(chunk));
        segment.bufferedBytes += chunk.length;
      } else {
        this.sendFrame(segment, chunk, true);
      }
    } catch (error) {
      this.fail(error);
    }
  }

  commit() {
    const segment = this.getActiveSegment();
    if (!segment.started) {
      segment.started = true;
      if (segment.opened && !this.sendConfiguration(segment)) return;
    }
    segment.phase = 'committed';
    this.activeSegment = null;
    const previousSegmentId = this.previousSegmentId;
    this.previousSegmentId = segment.id;
    segment.finalTimer = setTimeout(() => {
      this.fail(new Error('Timed out waiting for the FunASR segment end boundary'));
    }, FINAL_TIMEOUT_MS);
    if (segment.opened && !this.sendEnd(segment)) return;
    this.emit('committed', { segmentId: segment.id, previousSegmentId });
  }

  clear() {
    if (this.activeSegment) this.retireSegment(this.activeSegment);
  }

  close() {
    this.connected = false;
    for (const segment of this.segments) this.retireSegment(segment);
    this.previousSegmentId = null;
  }

  retireSegment(segment) {
    if (segment.phase === 'retired') return;
    segment.phase = 'retired';
    clearTimeout(segment.connectTimer);
    clearTimeout(segment.finalTimer);
    if (!segment.opened) segment.cancelConnect?.();
    segment.frames = [];
    segment.bufferedBytes = 0;
    if (this.activeSegment === segment) this.activeSegment = null;
    if (segment.socket.readyState === WebSocket.CLOSED) {
      this.segments.delete(segment);
      return;
    }
    // Closing sockets still count toward the cap until the transport is gone.
    segment.closeTimer = setTimeout(() => segment.socket.terminate(), 1000);
    if (segment.socket.readyState === WebSocket.CONNECTING) segment.socket.terminate();
    else if (segment.socket.readyState === WebSocket.OPEN) segment.socket.close();
  }

  fail(error) {
    this.close();
    this.emit('error', error);
  }

  sendConfiguration(segment) {
    return this.sendFrame(segment, JSON.stringify({
      mode: this.protocol === 'cpp-offline' ? 'offline' : '2pass',
      chunk_size: FUNASR_CHUNK_SIZE,
      chunk_interval: 10,
      encoder_chunk_look_back: 4,
      decoder_chunk_look_back: 1,
      wav_name: segment.id,
      wav_format: 'pcm',
      is_speaking: true,
      hotwords: '',
      itn: true,
      audio_fs: FUNASR_SAMPLE_RATE,
    }), false);
  }

  sendEnd(segment) {
    return this.sendFrame(segment, JSON.stringify({
      wav_name: segment.id, is_speaking: false, is_end: true,
    }), false);
  }

  sendFrame(segment, data, binary) {
    if (segment.phase === 'retired') return false;
    if (segment.socket.bufferedAmount + Buffer.byteLength(data) > MAX_BUFFERED_PCM_BYTES) {
      this.fail(new Error('FunASR socket audio buffer exceeded 10 seconds'));
      return false;
    }
    try {
      segment.socket.send(data, { binary }, (error) => {
        if (error && segment.phase !== 'retired') this.fail(error);
      });
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  handleMessage(segment, data) {
    if (segment.phase === 'retired') return;
    let message;
    try {
      message = responseSchema.parse(JSON.parse(data.toString()));
    } catch {
      this.fail(new Error('FunASR WebSocket server sent an invalid response'));
      return;
    }
    if (message.wav_name !== undefined && message.wav_name !== segment.id) return;
    if (message.error || (message.is_end === true && message.is_final === false)) {
      this.fail(new Error(message.error || 'FunASR failed to finalize the input'));
      return;
    }

    const terminal = segment.phase === 'committed' && (
      (this.protocol === 'python' && message.is_end === true && message.is_final === true)
      || (this.protocol === 'cpp-2pass' && message.is_final === true)
      || (this.protocol === 'cpp-offline' && message.mode === 'offline')
    );
    // Online messages are deltas; offline messages replace the provisional tail.
    // A textless EOS acknowledgement must preserve already corrected sentences.
    if (message.text !== undefined) {
      if (message.mode === '2pass-offline' || message.mode === 'offline') {
        segment.confirmedText += message.text;
        segment.onlineText = '';
      } else if (message.mode === '2pass-online' || message.mode === 'online') {
        segment.onlineText += message.text;
      } else if (terminal && message.text.trim()) {
        segment.confirmedText += message.text;
        segment.onlineText = '';
      }
    }
    if (segment.confirmedText.length + segment.onlineText.length > MAX_TRANSCRIPT_LENGTH) {
      this.fail(new Error('FunASR transcript exceeded the segment limit'));
      return;
    }
    const transcript = (segment.confirmedText + segment.onlineText).trim();
    if (!terminal && message.text === undefined) return;
    if (!terminal && !transcript && message.mode !== '2pass-offline' && message.mode !== 'offline') return;
    if (terminal) this.retireSegment(segment);
    this.emit('transcript', { segmentId: segment.id, transcript, isFinal: terminal });
  }
}
