import type { TeamsAPI } from '@openchamber/ui/lib/api/types';
import { sendBridgeMessage } from './bridge';

export const createVSCodeTeamsAPI = (): TeamsAPI => ({
  workspacesList: async () => sendBridgeMessage<{ ok: boolean; data?: { workspaces: Record<string, unknown>[] }; error?: { code: string; message: string } }>('api:teams/workspaces:list'),
  workspaceCreate: async (payload) => sendBridgeMessage<{ ok: boolean; data?: { workspaceId: string }; error?: { code: string; message: string } }>('api:teams/workspaces:create', payload),
  workspaceActivate: async (id) => sendBridgeMessage<{ ok: boolean; error?: { code: string; message: string } }>('api:teams/workspaces:activate', { id }),
});
