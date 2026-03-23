
export interface ToolState {
  status: 'pending' | 'running' | 'completed' | 'error';
}

export interface ToolStatePending extends ToolState {
  status: 'pending';
}

export interface ToolStateRunning extends ToolState {
  status: 'running';
  input?: Record<string, unknown>;
  title?: string;
  metadata?: Record<string, unknown>;
  time: {
    start: number;
  };
}

export interface ToolStateCompleted extends ToolState {
  status: 'completed';
  input: Record<string, unknown>;
  output: string;
  title: string;
  metadata: Record<string, unknown>;
  time: {
    start: number;
    end: number;
  };
}

export interface ToolStateError extends ToolState {
  status: 'error';
  input: Record<string, unknown>;
  error: string;
  metadata?: Record<string, unknown>;
  time: {
    start: number;
    end: number;
  };
}

export type ToolStateUnion = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError;

export interface ToolPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'tool';
  callID: string;
  tool: string;
  state: ToolStateUnion;
}