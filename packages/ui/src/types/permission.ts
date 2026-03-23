export interface PermissionRequest {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  always: string[];
  tool?: {
    messageID: string;
    callID: string;
  };
}

export type PermissionResponse = 'once' | 'always' | 'reject';

export interface PermissionAskedEvent {
  type: 'permission.asked';
  properties: PermissionRequest;
}

export interface PermissionRepliedEvent {
  type: 'permission.replied';
  properties: {
    sessionID: string;
    requestID: string;
    reply: PermissionResponse;
  };
}