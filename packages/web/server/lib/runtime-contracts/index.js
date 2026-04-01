export const RUNTIME_CONTRACT_VERSION = 'runtime.contract.v1';
export const RUNTIME_EVENT_VERSION = 'runtime.event.v1';

export const NEGOTIATION_OUTCOME = Object.freeze({
  ACCEPT: 'accept',
  DEGRADE: 'degrade',
  REFUSE: 'refuse',
});

/** @type {ReadonlyArray<RuntimeEventType>} */
export const RUNTIME_EVENT_TYPES = Object.freeze([
  'runtime.started',
  'runtime.stopped',
  'task.enqueued',
  'task.completed',
  'task.failed',
  'provider.negotiated',
  'provider.error',
]);

/**
 * @param {unknown} value
 * @returns {value is RuntimeEventType}
 */
export function isRuntimeEventType(value) {
  return typeof value === 'string' && RUNTIME_EVENT_TYPES.includes(/** @type {RuntimeEventType} */ (value));
}

/**
 * @param {{ type: RuntimeEventType; runtimeID: string; taskID?: string; providerID?: string; payload?: Record<string, unknown>; occurredAt?: string }} input
 * @returns {RuntimeEvent}
 */
export function createRuntimeEvent(input) {
  if (!isRuntimeEventType(input.type)) {
    throw new Error(`Unsupported runtime event type: ${String(input.type)}`);
  }

  return {
    schemaVersion: RUNTIME_EVENT_VERSION,
    type: input.type,
    runtimeID: input.runtimeID,
    taskID: input.taskID,
    providerID: input.providerID,
    payload: input.payload ?? {},
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };
}

/**
 * @param {ProviderCapabilityMatrix} matrix
 * @returns {CapabilityNegotiationResult}
 */
export function negotiateProviderCapabilities(matrix) {
  const required = new Set(matrix.required ?? []);
  const available = new Set(matrix.available ?? []);
  const degradable = new Set(matrix.degradable ?? []);
  const missing = [];
  const degraded = [];

  for (const capability of required) {
    if (!available.has(capability)) {
      missing.push(capability);
      if (degradable.has(capability)) degraded.push(capability);
    }
  }

  if (missing.length === 0) {
    return {
      outcome: NEGOTIATION_OUTCOME.ACCEPT,
      acceptedCapabilities: [...required],
      missingCapabilities: [],
      degradedCapabilities: [],
      reason: null,
    };
  }

  if (missing.length === degraded.length) {
    return {
      outcome: NEGOTIATION_OUTCOME.DEGRADE,
      acceptedCapabilities: [...required].filter((capability) => available.has(capability)),
      missingCapabilities: missing,
      degradedCapabilities: degraded,
      reason: 'Provider cannot satisfy every required capability and runtime elected degradable fallback.',
    };
  }

  return {
    outcome: NEGOTIATION_OUTCOME.REFUSE,
    acceptedCapabilities: [...required].filter((capability) => available.has(capability)),
    missingCapabilities: missing,
    degradedCapabilities: degraded,
    reason: 'Provider cannot satisfy non-degradable required capabilities.',
  };
}

/**
 * @typedef {'runtime.started' | 'runtime.stopped' | 'task.enqueued' | 'task.completed' | 'task.failed' | 'provider.negotiated' | 'provider.error'} RuntimeEventType
 */

/**
 * @typedef AgentRuntimeHost
 * @property {string} schemaVersion
 * @property {string} runtimeID
 * @property {string} instanceID
 * @property {'web' | 'desktop' | 'vscode'} hostKind
 * @property {string} startedAt
 * @property {'idle' | 'busy' | 'degraded' | 'stopped'} status
 */

/**
 * @typedef TaskRecord
 * @property {string} schemaVersion
 * @property {string} taskID
 * @property {string} runtimeID
 * @property {string} createdAt
 * @property {'queued' | 'running' | 'completed' | 'failed' | 'cancelled'} status
 * @property {Record<string, unknown>} metadata
 */

/**
 * @typedef AgentExecution
 * @property {string} schemaVersion
 * @property {string} executionID
 * @property {string} taskID
 * @property {string} runtimeID
 * @property {'pending' | 'running' | 'completed' | 'failed' | 'cancelled'} phase
 * @property {string | null} providerID
 * @property {string} startedAt
 * @property {string | null} finishedAt
 */

/**
 * @typedef ToolInvocationEnvelope
 * @property {string} schemaVersion
 * @property {string} invocationID
 * @property {string} taskID
 * @property {string} toolName
 * @property {Record<string, unknown>} input
 * @property {'queued' | 'running' | 'completed' | 'failed'} status
 * @property {string} createdAt
 */

/**
 * @typedef RuntimeEvent
 * @property {'runtime.event.v1'} schemaVersion
 * @property {RuntimeEventType} type
 * @property {string} runtimeID
 * @property {string=} taskID
 * @property {string=} providerID
 * @property {Record<string, unknown>} payload
 * @property {string} occurredAt
 */

/**
 * @typedef ProviderAdapter
 * @property {string} providerID
 * @property {string} adapterVersion
 * @property {boolean} supportsStreaming
 * @property {boolean} supportsTools
 * @property {boolean} supportsImages
 */

/**
 * @typedef ProviderCapabilityMatrix
 * @property {ReadonlyArray<string>} required
 * @property {ReadonlyArray<string>} available
 * @property {ReadonlyArray<string>=} degradable
 */

/**
 * @typedef ProviderError
 * @property {string} code
 * @property {string} message
 * @property {boolean} retriable
 * @property {'provider' | 'transport' | 'policy'} source
 */

/**
 * @typedef CapabilityNegotiationResult
 * @property {'accept' | 'degrade' | 'refuse'} outcome
 * @property {ReadonlyArray<string>} acceptedCapabilities
 * @property {ReadonlyArray<string>} missingCapabilities
 * @property {ReadonlyArray<string>} degradedCapabilities
 * @property {string | null} reason
 */
