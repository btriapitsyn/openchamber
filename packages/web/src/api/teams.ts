import type { TeamsAPI } from '@openchamber/ui/lib/api/types';

const jsonOrNull = async <T>(response: Response): Promise<T | null> => {
  return (await response.json().catch(() => null)) as T | null;
};

export const createWebTeamsAPI = (): TeamsAPI => ({
  async workspacesList() {
    const response = await fetch('/api/teams/workspaces', { method: 'GET', headers: { Accept: 'application/json' } });
    const payload = await jsonOrNull<{ ok: boolean; data?: { workspaces: Record<string, unknown>[] }; error?: { code: string; message: string } }>(response);
    if (!response.ok || !payload) {
      throw new Error(payload?.error?.message || response.statusText || 'Failed to list workspaces');
    }
    return payload;
  },

  async workspaceCreate(payload) {
    const response = await fetch('/api/teams/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await jsonOrNull<{ ok: boolean; data?: { workspaceId: string }; error?: { code: string; message: string } }>(response);
    if (!result) {
      throw new Error(response.statusText || 'Failed to create workspace');
    }
    return result;
  },

  async workspaceActivate(id) {
    const response = await fetch(`/api/teams/workspaces/${id}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });
    const result = await jsonOrNull<{ ok: boolean; error?: { code: string; message: string } }>(response);
    if (!result) {
      throw new Error(response.statusText || 'Failed to activate workspace');
    }
    return result;
  },
});
