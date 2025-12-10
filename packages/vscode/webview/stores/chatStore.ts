import { create } from 'zustand';
import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk';
import type { Session, Message, Part } from '@opencode-ai/sdk';

const getApiUrl = () => window.__VSCODE_CONFIG__?.apiUrl || 'http://localhost:47339';
const getWorkspaceFolder = () => window.__VSCODE_CONFIG__?.workspaceFolder || '';

interface MessageRecord {
  info: Message;
  parts: Part[];
}

interface ChatState {
  // Client
  client: OpencodeClient | null;
  isConnected: boolean;

  // Sessions
  sessions: Session[];
  currentSessionId: string | null;
  isLoadingSessions: boolean;

  // Messages
  messages: Map<string, MessageRecord[]>;
  isLoadingMessages: boolean;
  isSending: boolean;
  streamingSessionId: string | null;

  // Actions
  initialize: () => Promise<void>;
  loadSessions: () => Promise<void>;
  createSession: () => Promise<string | null>;
  selectSession: (sessionId: string) => Promise<void>;
  loadMessages: (sessionId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  abortMessage: () => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  client: null,
  isConnected: false,
  sessions: [],
  currentSessionId: null,
  isLoadingSessions: false,
  messages: new Map(),
  isLoadingMessages: false,
  isSending: false,
  streamingSessionId: null,

  initialize: async () => {
    const apiUrl = getApiUrl();
    const client = createOpencodeClient({ baseUrl: apiUrl });

    // Test connection
    try {
      await client.session.list({ query: { directory: getWorkspaceFolder() } });
      set({ client, isConnected: true });
      await get().loadSessions();
    } catch (error) {
      console.error('Failed to connect to OpenCode API:', error);
      set({ client, isConnected: false });
    }
  },

  loadSessions: async () => {
    const { client } = get();
    if (!client) return;

    set({ isLoadingSessions: true });
    try {
      const response = await client.session.list({ query: { directory: getWorkspaceFolder() } });
      const sessionsArray = Array.isArray(response.data) ? response.data : [];
      const sessions = sessionsArray.sort(
        (a, b) => (b.time?.created || 0) - (a.time?.created || 0)
      );
      set({ sessions, isLoadingSessions: false });
    } catch (error) {
      console.error('Failed to load sessions:', error);
      set({ isLoadingSessions: false });
    }
  },

  createSession: async () => {
    const { client } = get();
    if (!client) return null;

    try {
      const response = await client.session.create({ query: { directory: getWorkspaceFolder() }, body: {} });
      const session = response.data;
      if (!session) throw new Error('No session returned');
      await get().loadSessions();
      set({ currentSessionId: session.id });
      return session.id;
    } catch (error) {
      console.error('Failed to create session:', error);
      return null;
    }
  },

  selectSession: async (sessionId: string) => {
    set({ currentSessionId: sessionId });
    await get().loadMessages(sessionId);
  },

  loadMessages: async (sessionId: string) => {
    const { client, messages } = get();
    if (!client) return;

    set({ isLoadingMessages: true });
    try {
      const response = await client.session.messages({
        path: { id: sessionId },
        query: { directory: getWorkspaceFolder() }
      });
      const messageRecords: MessageRecord[] = (response.data || []).map((msg) => ({
        info: msg.info,
        parts: msg.parts || [],
      }));

      const newMessages = new Map(messages);
      newMessages.set(sessionId, messageRecords);
      set({ messages: newMessages, isLoadingMessages: false });
    } catch (error) {
      console.error('Failed to load messages:', error);
      set({ isLoadingMessages: false });
    }
  },

  sendMessage: async (content: string) => {
    const { client, currentSessionId, messages } = get();
    if (!client || !currentSessionId) return;

    set({ isSending: true, streamingSessionId: currentSessionId });

    try {
      // Add user message optimistically
      const userMessage: MessageRecord = {
        info: {
          id: `temp-${Date.now()}`,
          sessionId: currentSessionId,
          role: 'user',
          parts: [{ type: 'text', text: content }],
          time: { created: Date.now() },
        } as Message,
        parts: [{ type: 'text', text: content }],
      };

      const currentMessages = messages.get(currentSessionId) || [];
      const newMessages = new Map(messages);
      newMessages.set(currentSessionId, [...currentMessages, userMessage]);
      set({ messages: newMessages });

      // Send message via session.prompt
      await client.session.prompt({
        path: { id: currentSessionId },
        query: { directory: getWorkspaceFolder() },
        body: {
          parts: [{ type: 'text', text: content }],
        },
      });

      // Reload messages to get the actual response
      await get().loadMessages(currentSessionId);
      await get().loadSessions(); // Update session title if changed
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      set({ isSending: false, streamingSessionId: null });
    }
  },

  abortMessage: async () => {
    const { client, currentSessionId } = get();
    if (!client || !currentSessionId) return;

    try {
      await client.session.abort({ path: { id: currentSessionId } });
    } catch (error) {
      console.error('Failed to abort:', error);
    }
    set({ isSending: false, streamingSessionId: null });
  },
}));
