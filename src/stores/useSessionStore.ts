import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Session, Message, Part } from '@opencode-ai/sdk';
import { opencodeClient } from '@/lib/opencode/client';

interface SessionStore {
  // State
  sessions: Session[];
  currentSessionId: string | null;
  messages: Map<string, { info: Message; parts: Part[] }[]>;
  isLoading: boolean;
  error: string | null;
  streamingMessageId: string | null;
  abortController: AbortController | null;

  // Actions
  loadSessions: () => Promise<void>;
  createSession: (title?: string) => Promise<Session | null>;
  deleteSession: (id: string) => Promise<boolean>;
  updateSessionTitle: (id: string, title: string) => Promise<void>;
  setCurrentSession: (id: string | null) => void;
  loadMessages: (sessionId: string) => Promise<void>;
  sendMessage: (content: string, providerID: string, modelID: string) => Promise<void>;
  abortCurrentOperation: () => Promise<void>;
  addStreamingPart: (sessionId: string, messageId: string, part: Part) => void;
  completeStreamingMessage: (sessionId: string, messageId: string) => void;
  clearError: () => void;
  getSessionsByDirectory: (directory: string) => Session[];
}

export const useSessionStore = create<SessionStore>()(
  devtools(
    (set, get) => ({
      // Initial State
      sessions: [],
      currentSessionId: null,
      messages: new Map(),
      isLoading: false,
      error: null,
      streamingMessageId: null,
      abortController: null,

      // Load all sessions
      loadSessions: async () => {
        set({ isLoading: true, error: null });
        try {
          const sessions = await opencodeClient.listSessions();
          set({ sessions, isLoading: false });
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to load sessions',
            isLoading: false 
          });
        }
      },

      // Create new session
      createSession: async (title?: string) => {
        set({ isLoading: true, error: null });
        try {
          // Directory is now handled globally by the OpenCode client
          const session = await opencodeClient.createSession({ title });
          set((state) => ({
            sessions: [...state.sessions, session],
            currentSessionId: session.id,
            isLoading: false
          }));
          return session;
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to create session',
            isLoading: false 
          });
          return null;
        }
      },

      // Delete session
      deleteSession: async (id: string) => {
        set({ isLoading: true, error: null });
        try {
          const success = await opencodeClient.deleteSession(id);
          if (success) {
            set((state) => {
              const newSessions = state.sessions.filter(s => s.id !== id);
              const newMessages = new Map(state.messages);
              newMessages.delete(id);
              
              return {
                sessions: newSessions,
                messages: newMessages,
                currentSessionId: state.currentSessionId === id ? null : state.currentSessionId,
                isLoading: false
              };
            });
          }
          return success;
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to delete session',
            isLoading: false 
          });
          return false;
        }
      },

      // Update session title
      updateSessionTitle: async (id: string, title: string) => {
        try {
          const updatedSession = await opencodeClient.updateSession(id, title);
          set((state) => ({
            sessions: state.sessions.map(s => s.id === id ? updatedSession : s)
          }));
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to update session title'
          });
        }
      },

      // Set current session
      setCurrentSession: (id: string | null) => {
        set({ currentSessionId: id, error: null });
        if (id) {
          get().loadMessages(id);
        }
      },

      // Load messages for a session
      loadMessages: async (sessionId: string) => {
        set({ isLoading: true, error: null });
        try {
          const messages = await opencodeClient.getSessionMessages(sessionId);
          set((state) => {
            const newMessages = new Map(state.messages);
            newMessages.set(sessionId, messages);
            return { messages: newMessages, isLoading: false };
          });
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to load messages',
            isLoading: false 
          });
        }
      },

      // Send a message
      sendMessage: async (content: string, providerID: string, modelID: string) => {
        const { currentSessionId } = get();
        if (!currentSessionId) {
          set({ error: 'No session selected' });
          return;
        }

        set({ isLoading: true, error: null });
        
        // First, add the user message to the chat
        const userMessageId = `user-${Date.now()}`;
        const userParts: Part[] = [{ 
          type: 'text', 
          text: content,
          id: `part-${Date.now()}`,
          sessionID: currentSessionId,
          messageID: userMessageId
        } as Part];
        
        const userMessage = {
          info: {
            id: userMessageId,
            sessionID: currentSessionId,
            role: 'user' as const,
            time: {
              created: Date.now()
            }
          } as any as Message,
          parts: userParts
        };
        
        // Add user message immediately
        set((state) => {
          const sessionMessages = state.messages.get(currentSessionId) || [];
          const newMessages = new Map(state.messages);
          newMessages.set(currentSessionId, [...sessionMessages, userMessage]);
          return { messages: newMessages };
        });
        
        try {
          // Create abort controller for this operation
          const controller = new AbortController();
          set({ abortController: controller });

          // Then send to API and wait for response
          const message = await opencodeClient.sendMessage({
            id: currentSessionId,
            providerID,
            modelID,
            text: content
          });

          // Set streaming message ID for the assistant's response
          set({ 
            streamingMessageId: message.id,
            isLoading: true
          });

          // Add a timeout to clear loading state if no completion event is received
          setTimeout(() => {
            const state = get();
            if (state.streamingMessageId === message.id && state.isLoading) {
              console.log('Timeout: clearing loading state for message:', message.id);
              set({ 
                streamingMessageId: null,
                isLoading: false,
                abortController: null
              });
            }
          }, 15000); // 15 second timeout
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to send message',
            isLoading: false,
            abortController: null
          });
        }
      },

      // Abort current operation
      abortCurrentOperation: async () => {
        const { currentSessionId, abortController } = get();
        
        if (abortController) {
          abortController.abort();
        }
        
        if (currentSessionId) {
          try {
            await opencodeClient.abortSession(currentSessionId);
            set({ 
              streamingMessageId: null,
              abortController: null,
              isLoading: false
            });
          } catch (error) {
            console.error('Failed to abort session:', error);
          }
        }
      },

      // Add streaming part to a message
      addStreamingPart: (sessionId: string, messageId: string, part: Part) => {
        // Skip if this is trying to update a user message we created locally
        if (messageId.startsWith('user-')) {
          console.log('Skipping update to local user message:', messageId);
          return;
        }
        
        set((state) => {
          const sessionMessages = state.messages.get(sessionId) || [];
          
          // Check if this part's text matches any existing user message
          // This prevents duplicating user messages that come back from the server
          if (part.type === 'text' && part.text) {
            const existingUserMessage = sessionMessages.find(m => 
              m.info.role === 'user' && 
              m.parts.some(p => p.type === 'text' && p.text === part.text)
            );
            if (existingUserMessage) {
              console.log('Skipping duplicate user message from server:', part.text.substring(0, 50));
              return state;
            }
          }
          
          // Track last content for completion detection
          const lastContentKey = `lastContent-${messageId}`;
          const currentContent = part.type === 'text' ? part.text : '';
          const lastContent = (window as any)[lastContentKey];
          
          // If content hasn't changed and we have content, complete immediately
          if (lastContent === currentContent && currentContent && currentContent.length > 0) {
            // Content is stable, complete the message
            const currentState = get();
            if (currentState.streamingMessageId === messageId) {
              console.log('Content stable, completing message:', messageId);
              setTimeout(() => get().completeStreamingMessage(sessionId, messageId), 100);
            }
          }
          (window as any)[lastContentKey] = currentContent;
          
          // Clear any existing timeout for this message
          const timeoutKey = `timeout-${messageId}`;
          if ((window as any)[timeoutKey]) {
            clearTimeout((window as any)[timeoutKey]);
          }
          
          // Set a new timeout to complete the message if no more parts arrive
          (window as any)[timeoutKey] = setTimeout(() => {
            const currentState = get();
            if (currentState.streamingMessageId === messageId && currentState.isLoading) {
              console.log('No new parts for 1s, completing message:', messageId);
              get().completeStreamingMessage(sessionId, messageId);
            }
          }, 1000); // 1 second timeout after last part
          
          const messageIndex = sessionMessages.findIndex(m => m.info.id === messageId);
          
          // Check if this is the user's message being echoed back
          if (messageIndex !== -1) {
            const existingMessage = sessionMessages[messageIndex];
            if (existingMessage.info.role === 'user') {
              console.log('Skipping echo of user message');
              return state;
            }
          }
          
          if (messageIndex === -1) {
            // Only create message if it's actually from the assistant
            // Skip if this appears to be echoing user content
            const newMessage = {
              info: {
                id: messageId,
                sessionID: sessionId,
                role: 'assistant' as const,
                time: {
                  created: Date.now()
                }
              } as any as Message,
              parts: [part]
            };
            
            const newMessages = new Map(state.messages);
            newMessages.set(sessionId, [...sessionMessages, newMessage]);
            return { messages: newMessages };
          } else {
            // Check if this part already exists (by part.id)
            const existingMessage = sessionMessages[messageIndex];
            const existingPartIndex = existingMessage.parts.findIndex(p => p.id === part.id);
            
            const updatedMessages = [...sessionMessages];
            if (existingPartIndex !== -1) {
              // Update existing part (for streaming text updates)
              updatedMessages[messageIndex] = {
                ...updatedMessages[messageIndex],
                parts: updatedMessages[messageIndex].parts.map((p, idx) => 
                  idx === existingPartIndex ? part : p
                )
              };
            } else {
              // Add new part
              updatedMessages[messageIndex] = {
                ...updatedMessages[messageIndex],
                parts: [...updatedMessages[messageIndex].parts, part]
              };
            }
            
            const newMessages = new Map(state.messages);
            newMessages.set(sessionId, updatedMessages);
            return { messages: newMessages };
          }
        });
      },

      // Complete streaming message
      completeStreamingMessage: (sessionId: string, messageId: string) => {
        console.log('Completing streaming message:', messageId);
        set({ 
          streamingMessageId: null,
          abortController: null,
          isLoading: false
        });
      },

      // Clear error
      clearError: () => {
        set({ error: null });
      },

      // Get sessions by directory  
      getSessionsByDirectory: (directory: string) => {
        const { sessions } = get();
        
        // For now, show all sessions until we can properly track directories
        // The backend accepts directory as a parameter but doesn't return it in session data
        // TODO: Request backend to include directory/path info in session responses
        return sessions;
      }
    }),
    {
      name: 'session-store'
    }
  )
);