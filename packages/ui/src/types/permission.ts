export interface Permission {
  id: string;
  type: string;
  pattern?: string | string[];
  patterns?: string[];  // New system: array of specific patterns requesting approval
  always?: string[];    // New system: what will be auto-approved on "always" click
  sessionID: string;
  messageID: string;
  callID?: string;
  title: string;
  metadata: Record<string, unknown>;
  time: {
    created: number;
  };
  tool?: {
    messageID: string;
    callID: string;
  };
}

export interface PermissionEvent {
  type: 'permission.updated';
  properties: Permission;
}

export type PermissionResponse = 'once' | 'always' | 'reject';