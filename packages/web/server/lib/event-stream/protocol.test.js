import { describe, expect, it } from 'vitest';

import {
  MESSAGE_STREAM_DIRECTORY_WS_PATH,
  MESSAGE_STREAM_GLOBAL_WS_PATH,
  MESSAGE_STREAM_WS_MAX_BUFFERED_BYTES,
  parseSseEventEnvelope,
  sendMessageStreamWsEvent,
  sendMessageStreamWsFrame,
} from './protocol.js';

describe('event stream protocol helpers', () => {
  it('exports stable websocket paths', () => {
    expect(MESSAGE_STREAM_GLOBAL_WS_PATH).toBe('/api/global/event/ws');
    expect(MESSAGE_STREAM_DIRECTORY_WS_PATH).toBe('/api/event/ws');
  });

  it('parses wrapped SSE payloads with event id and directory', () => {
    const envelope = parseSseEventEnvelope(
      'id: evt-1\n' +
      'event: message\n' +
      'data: {"directory":"/tmp/project","payload":{"type":"session.updated"}}\n'
    );

    expect(envelope).toEqual({
      eventId: 'evt-1',
      directory: '/tmp/project',
      payload: { type: 'session.updated' },
    });
  });

  it('derives directory from payload properties when not wrapped', () => {
    const envelope = parseSseEventEnvelope(
      'data: {"type":"openchamber:notification","properties":{"directory":"/tmp/project"}}\n'
    );

    expect(envelope).toEqual({
      eventId: null,
      directory: '/tmp/project',
      payload: {
        type: 'openchamber:notification',
        properties: { directory: '/tmp/project' },
      },
    });
  });

  it('returns null for malformed SSE blocks', () => {
    expect(parseSseEventEnvelope('event: message\n')).toBeNull();
    expect(parseSseEventEnvelope('data: {oops}\n')).toBeNull();
  });

  it('serializes generic websocket frames', () => {
    let rawPayload = null;
    const socket = {
      readyState: 1,
      send(payload) {
        rawPayload = payload;
      },
    };

    const sent = sendMessageStreamWsFrame(socket, { type: 'ready' });

    expect(sent).toBe(true);
    expect(rawPayload).toBe('{"type":"ready"}');
  });

  it('closes slow websocket clients instead of adding more buffered data', () => {
    let closeCall = null;
    let sendCalls = 0;
    const socket = {
      readyState: 1,
      bufferedAmount: MESSAGE_STREAM_WS_MAX_BUFFERED_BYTES + 1,
      send() {
        sendCalls += 1;
      },
      close(code, reason) {
        closeCall = { code, reason };
      },
    };

    const sent = sendMessageStreamWsFrame(socket, { type: 'ready' });

    expect(sent).toBe(false);
    expect(sendCalls).toBe(0);
    expect(closeCall).toEqual({
      code: 1013,
      reason: 'Message stream client is too slow',
    });
  });

  it('serializes event frames with routing metadata', () => {
    let rawPayload = null;
    const socket = {
      readyState: 1,
      send(payload) {
        rawPayload = payload;
      },
    };

    const sent = sendMessageStreamWsEvent(
      socket,
      { type: 'openchamber:heartbeat', timestamp: 1 },
      { eventId: 'evt-2', directory: '/tmp/project' }
    );

    expect(sent).toBe(true);
    expect(JSON.parse(rawPayload)).toEqual({
      type: 'event',
      payload: { type: 'openchamber:heartbeat', timestamp: 1 },
      eventId: 'evt-2',
      directory: '/tmp/project',
    });
  });
});
