// Tool usage types based on OpenCode API
export interface ToolState {
  status: 'pending' | 'running' | 'completed' | 'error';
}

export interface ToolStatePending extends ToolState {
  status: 'pending';
}

export interface ToolStateRunning extends ToolState {
  status: 'running';
  input?: any;
  title?: string;
  metadata?: Record<string, any>;
  time: {
    start: number;
  };
}

export interface ToolStateCompleted extends ToolState {
  status: 'completed';
  input: Record<string, any>;
  output: string;
  title: string;
  metadata: Record<string, any>;
  time: {
    start: number;
    end: number;
  };
}

export interface ToolStateError extends ToolState {
  status: 'error';
  input: Record<string, any>;
  error: string;
  metadata?: Record<string, any>;
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