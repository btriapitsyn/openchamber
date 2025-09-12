export interface Permission {
  id: string;
  type: string;
  pattern?: string;
  sessionID: string;
  messageID: string;
  callID?: string;
  title: string;
  metadata: Record<string, any>;
  time: {
    created: number;
  };
}

export interface PermissionEvent {
  type: 'permission.updated';
  properties: Permission;
}

export type PermissionResponse = 'once' | 'always' | 'reject';