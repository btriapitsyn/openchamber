export type RuntimeContractVersion = 'runtime.contract.v1';
export type RuntimeEventVersion = 'runtime.event.v1';

export declare const RUNTIME_CONTRACT_VERSION: RuntimeContractVersion;
export declare const RUNTIME_EVENT_VERSION: RuntimeEventVersion;

export type RuntimeEventType =
  | 'runtime.started'
  | 'runtime.stopped'
  | 'task.enqueued'
  | 'task.completed'
  | 'task.failed'
  | 'provider.negotiated'
  | 'provider.error';

export interface AgentRuntimeHost {
  schemaVersion: RuntimeContractVersion;
  runtimeID: string;
  instanceID: string;
  hostKind: 'web' | 'desktop' | 'vscode';
  startedAt: string;
  status: 'idle' | 'busy' | 'degraded' | 'stopped';
}

export interface TaskRecord {
  schemaVersion: RuntimeContractVersion;
  taskID: string;
  runtimeID: string;
  createdAt: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  metadata: Record<string, unknown>;
}

export interface AgentExecution {
  schemaVersion: RuntimeContractVersion;
  executionID: string;
  taskID: string;
  runtimeID: string;
  phase: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  providerID: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ToolInvocationEnvelope {
  schemaVersion: RuntimeContractVersion;
  invocationID: string;
  taskID: string;
  toolName: string;
  input: Record<string, unknown>;
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: string;
}

export interface RuntimeEvent {
  schemaVersion: RuntimeEventVersion;
  type: RuntimeEventType;
  runtimeID: string;
  taskID?: string;
  providerID?: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface ProviderAdapter {
  providerID: string;
  adapterVersion: string;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsImages: boolean;
}

export interface ProviderCapabilityMatrix {
  required: ReadonlyArray<string>;
  available: ReadonlyArray<string>;
  degradable?: ReadonlyArray<string>;
}

export interface ProviderError {
  code: string;
  message: string;
  retriable: boolean;
  source: 'provider' | 'transport' | 'policy';
}

export type CapabilityNegotiationResult =
  | {
      outcome: 'accept';
      acceptedCapabilities: ReadonlyArray<string>;
      missingCapabilities: [];
      degradedCapabilities: [];
      reason: null;
    }
  | {
      outcome: 'degrade';
      acceptedCapabilities: ReadonlyArray<string>;
      missingCapabilities: ReadonlyArray<string>;
      degradedCapabilities: ReadonlyArray<string>;
      reason: string;
    }
  | {
      outcome: 'refuse';
      acceptedCapabilities: ReadonlyArray<string>;
      missingCapabilities: ReadonlyArray<string>;
      degradedCapabilities: ReadonlyArray<string>;
      reason: string;
    };

export declare const NEGOTIATION_OUTCOME: Readonly<{
  ACCEPT: 'accept';
  DEGRADE: 'degrade';
  REFUSE: 'refuse';
}>;

export declare const RUNTIME_EVENT_TYPES: ReadonlyArray<RuntimeEventType>;

export declare function isRuntimeEventType(value: unknown): value is RuntimeEventType;

export declare function createRuntimeEvent(input: {
  type: RuntimeEventType;
  runtimeID: string;
  taskID?: string;
  providerID?: string;
  payload?: Record<string, unknown>;
  occurredAt?: string;
}): RuntimeEvent;

export declare function negotiateProviderCapabilities(
  matrix: ProviderCapabilityMatrix
): CapabilityNegotiationResult;
