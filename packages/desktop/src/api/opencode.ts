import { invoke } from '@tauri-apps/api/core';
import type { DesktopOpencodeAPI } from '@openchamber/ui/lib/api/types';

type SendMessageParams = {
  id: string;
  providerID: string;
  modelID: string;
  text: string;
  agent?: string;
  files?: Array<{
    type: 'file';
    mime: string;
    filename?: string;
    url: string;
  }>;
  messageId?: string;
  directory?: string | null;
};

export const createDesktopOpencodeAPI = (): DesktopOpencodeAPI =>
  ({
    async listSessions(directory) {
      return invoke('opencode_session_list', { directory: directory ?? null });
    },

    async createSession(params) {
      return invoke('opencode_session_create', {
        payload: {
          title: params?.title ?? null,
          parent_id: params?.parentID ?? null,
          directory: params?.directory ?? null,
        },
      });
    },

    async getSession(id, directory) {
      return invoke('opencode_session_get', { id, directory: directory ?? null });
    },

    async deleteSession(id, directory) {
      return invoke('opencode_session_delete', { id, directory: directory ?? null });
    },

    async updateSession(id, title, directory) {
      return invoke('opencode_session_update', {
        payload: { id, title: title ?? null, directory: directory ?? null },
      });
    },

    async getSessionMessages(id, directory, limit) {
      return invoke('opencode_session_messages', {
        id,
        limit: limit ?? null,
        directory: directory ?? null,
      });
    },

    async promptSession(payload: SendMessageParams) {
      return invoke('opencode_session_prompt', {
        payload: {
          id: payload.id,
          provider_id: payload.providerID,
          model_id: payload.modelID,
          text: payload.text,
          agent: payload.agent ?? null,
          files: payload.files ?? [],
          message_id: payload.messageId ?? null,
          directory: payload.directory ?? null,
        },
      });
    },

    async commandSession(payload: SendMessageParams) {
      return invoke('opencode_session_command', {
        payload: {
          id: payload.id,
          provider_id: payload.providerID,
          model_id: payload.modelID,
          text: payload.text,
          agent: payload.agent ?? null,
          files: payload.files ?? [],
          message_id: payload.messageId ?? null,
          directory: payload.directory ?? null,
        },
      });
    },

    async shellSession(payload: SendMessageParams) {
      return invoke('opencode_session_shell', {
        payload: {
          id: payload.id,
          provider_id: payload.providerID,
          model_id: payload.modelID,
          text: payload.text,
          agent: payload.agent ?? null,
          directory: payload.directory ?? null,
        },
      });
    },

    async abortSession(id, directory) {
      return invoke('opencode_session_abort', { id, directory: directory ?? null });
    },
  }) as DesktopOpencodeAPI;
