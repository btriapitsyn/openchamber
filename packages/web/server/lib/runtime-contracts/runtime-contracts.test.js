import { describe, expect, it } from 'bun:test';

import {
  NEGOTIATION_OUTCOME,
  RUNTIME_EVENT_VERSION,
  createRuntimeEvent,
  isRuntimeEventType,
  negotiateProviderCapabilities,
} from './index.js';

describe('runtime contracts', () => {
  it('creates runtime event envelopes with runtime.event.v1 schema version', () => {
    const event = createRuntimeEvent({
      type: 'runtime.started',
      runtimeID: 'runtime-1',
      payload: { bootMode: 'cold' },
    });

    expect(event.schemaVersion).toBe(RUNTIME_EVENT_VERSION);
    expect(event.type).toBe('runtime.started');
    expect(event.runtimeID).toBe('runtime-1');
    expect(event.payload).toEqual({ bootMode: 'cold' });
    expect(typeof event.occurredAt).toBe('string');
  });

  it('rejects unknown runtime event discriminants', () => {
    expect(() =>
      createRuntimeEvent({
        type: /** @type {import('./index.js').RuntimeEventType} */ ('runtime.unknown'),
        runtimeID: 'runtime-1',
      })
    ).toThrow('Unsupported runtime event type');

    expect(isRuntimeEventType('runtime.started')).toBe(true);
    expect(isRuntimeEventType('runtime.unknown')).toBe(false);
  });

  it('refuses provider negotiation when required non-degradable capabilities are missing', () => {
    const result = negotiateProviderCapabilities({
      required: ['streaming', 'tools'],
      available: ['streaming'],
      degradable: [],
    });

    expect(result.outcome).toBe(NEGOTIATION_OUTCOME.REFUSE);
    expect(result.missingCapabilities).toEqual(['tools']);
    expect(result.degradedCapabilities).toEqual([]);
  });

  it('degrades provider negotiation when only degradable capabilities are missing', () => {
    const result = negotiateProviderCapabilities({
      required: ['streaming', 'images'],
      available: ['streaming'],
      degradable: ['images'],
    });

    expect(result.outcome).toBe(NEGOTIATION_OUTCOME.DEGRADE);
    expect(result.missingCapabilities).toEqual(['images']);
    expect(result.degradedCapabilities).toEqual(['images']);
  });
});
