export interface Permission {
  id: string;
  type: string;
  pattern?: string | string[];
  sessionID: string;
  messageID: string;
  callID?: string;
  title: string;
  metadata: Record<string, unknown>;
  time: {
    created: number;
  };
}

export interface PermissionEvent {
  type: 'permission.updated';
  properties: Permission;
}

export type PermissionResponse = 'once' | 'always' | 'reject';