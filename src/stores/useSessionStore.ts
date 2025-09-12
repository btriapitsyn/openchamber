import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Session, Message, Part } from '@opencode-ai/sdk';
import { opencodeClient } from '@/lib/opencode/client';
import type { Permission, PermissionResponse } from '@/types/permission';

// Type for attached files in the UI
export interface AttachedFile {
  id: string;
  file: File;
  dataUrl: string;
  mimeType: string;
  filename: string;
  size: number;
}

interface SessionStore {
  // State
  sessions: Session[];
  currentSessionId: string | null;
  messages: Map<string, { info: Message; parts: Part[] }[]>;
  permissions: Map<string, Permission[]>; // sessionId -> permissions
  attachedFiles: AttachedFile[]; // Files attached to current message
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
  sendMessage: (content: string, providerID: string, modelID: string, agent?: string) => Promise<void>;
  abortCurrentOperation: () => Promise<void>;
  addStreamingPart: (sessionId: string, messageId: string, part: Part) => void;
  completeStreamingMessage: (sessionId: string, messageId: string) => void;
  addPermission: (permission: Permission) => void;
  respondToPermission: (sessionId: string, permissionId: string, response: PermissionResponse) => Promise<void>;
  clearError: () => void;
  getSessionsByDirectory: (directory: string) => Session[];
  getLastMessageModel: (sessionId: string) => { providerID?: string; modelID?: string } | null;
  
  // File attachment actions
  addAttachedFile: (file: File) => Promise<void>;
  removeAttachedFile: (id: string) => void;
  clearAttachedFiles: () => void;
}

export const useSessionStore = create<SessionStore>()(
  devtools(
    persist(
      (set, get) => ({
      // Initial State
      sessions: [],
      currentSessionId: null,
      messages: new Map(),
      permissions: new Map(),
      attachedFiles: [],
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
      sendMessage: async (content: string, providerID: string, modelID: string, agent?: string) => {
        const { currentSessionId, attachedFiles } = get();
        if (!currentSessionId) {
          set({ error: 'No session selected' });
          return;
        }

        set({ isLoading: true, error: null });
        
        // Build parts array with text and file parts
        const userMessageId = `user-${Date.now()}`;
        const userParts: Part[] = [];
        
        // Add text part if there's content
        if (content.trim()) {
          userParts.push({ 
            type: 'text', 
            text: content,
            id: `part-${Date.now()}`,
            sessionID: currentSessionId,
            messageID: userMessageId
          } as Part);
        }
        
        // Add file parts for attached files (for display purposes)
        attachedFiles.forEach((file, index) => {
          userParts.push({
            type: 'file',
            id: `part-file-${Date.now()}-${index}`,
            sessionID: currentSessionId,
            messageID: userMessageId,
            mime: file.mimeType,
            filename: file.filename,
            url: file.dataUrl
          } as Part);
        });
        
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

          // Send to API with files included
          const message = await opencodeClient.sendMessage({
            id: currentSessionId,
            providerID,
            modelID,
            text: content,
            agent,
            files: attachedFiles.map(f => ({
              type: 'file' as const,
              mime: f.mimeType,
              filename: f.filename,
              url: f.dataUrl
            }))
          });

          // Clear attached files after successful send
          set({ attachedFiles: [] });

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
        
        // Skip file parts for assistant messages - only users attach files
        // Use type assertion since the SDK types might not include 'file' yet
        if ((part as any).type === 'file') {
          console.log('Skipping file part for assistant message:', messageId);
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
            // Also skip creating message for file parts
            if ((part as any).type === 'file') {
              return state;
            }
            
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
              // Add new part - but skip file parts for assistant messages
              if ((part as any).type === 'file' && updatedMessages[messageIndex].info.role === 'assistant') {
                return state;
              }
              
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

      // Add permission request
      addPermission: (permission: Permission) => {
        set((state) => {
          const sessionPermissions = state.permissions.get(permission.sessionID) || [];
          const newPermissions = new Map(state.permissions);
          newPermissions.set(permission.sessionID, [...sessionPermissions, permission]);
          return { permissions: newPermissions };
        });
      },

      // Respond to permission request
      respondToPermission: async (sessionId: string, permissionId: string, response: PermissionResponse) => {
        try {
          await opencodeClient.respondToPermission(sessionId, permissionId, response);
          
          // Remove permission from store after responding
          set((state) => {
            const sessionPermissions = state.permissions.get(sessionId) || [];
            const updatedPermissions = sessionPermissions.filter(p => p.id !== permissionId);
            const newPermissions = new Map(state.permissions);
            newPermissions.set(sessionId, updatedPermissions);
            return { permissions: newPermissions };
          });
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to respond to permission'
          });
          throw error;
        }
      },

      // Clear error
      clearError: () => {
        set({ error: null });
      },

      // Get sessions by directory  
      // Get model info from last message in session
      getLastMessageModel: (sessionId: string) => {
        const { messages } = get();
        const sessionMessages = messages.get(sessionId);
        
        if (!sessionMessages || sessionMessages.length === 0) {
          return null;
        }
        
        // Find the last assistant message (which has model info)
        for (let i = sessionMessages.length - 1; i >= 0; i--) {
          const message = sessionMessages[i];
          if (message.info.role === 'assistant' && 'providerID' in message.info && 'modelID' in message.info) {
            return {
              providerID: (message.info as any).providerID,
              modelID: (message.info as any).modelID
            };
          }
        }
        
        return null;
      },

      getSessionsByDirectory: (directory: string) => {
        const { sessions } = get();
        
        // For now, show all sessions until we can properly track directories
        // The backend accepts directory as a parameter but doesn't return it in session data
        // TODO: Request backend to include directory/path info in session responses
        return sessions;
      },

      // File attachment methods
      addAttachedFile: async (file: File) => {
        try {
          // Check if we already have this file attached (by name and size)
          const { attachedFiles } = get();
          const isDuplicate = attachedFiles.some(
            f => f.filename === file.name && f.size === file.size
          );
          if (isDuplicate) {
            console.log(`File "${file.name}" is already attached`);
            return;
          }

          // Check file size (10MB limit)
          const maxSize = 10 * 1024 * 1024; // 10MB
          if (file.size > maxSize) {
            set({ error: `File "${file.name}" is too large. Maximum size is 10MB.` });
            return;
          }

          // Validate file type (basic check for common types)
          const allowedTypes = [
            'text/', 'application/json', 'application/xml', 'application/pdf',
            'image/', 'video/', 'audio/',
            'application/javascript', 'application/typescript',
            'application/x-python', 'application/x-ruby',
            'application/x-sh', 'application/yaml',
            'application/octet-stream' // For unknown types
          ];
          
          const isAllowed = allowedTypes.some(type => 
            file.type.startsWith(type) || file.type === type || file.type === ''
          );
          
          if (!isAllowed && file.type !== '') {
            console.warn(`File type "${file.type}" might not be supported`);
          }

          // Read file as data URL
          const reader = new FileReader();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          // Extract just the filename from the path (in case of full path)
          const extractFilename = (fullPath: string) => {
            // Handle both forward slashes and backslashes
            const parts = fullPath.replace(/\\/g, '/').split('/');
            return parts[parts.length - 1] || fullPath;
          };

          const attachedFile: AttachedFile = {
            id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            file,
            dataUrl,
            mimeType: file.type || 'application/octet-stream',
            filename: extractFilename(file.name),
            size: file.size
          };

          set((state) => ({
            attachedFiles: [...state.attachedFiles, attachedFile],
            error: null // Clear any previous errors
          }));
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to attach file'
          });
        }
      },

      removeAttachedFile: (id: string) => {
        set((state) => ({
          attachedFiles: state.attachedFiles.filter(f => f.id !== id)
        }));
      },

      clearAttachedFiles: () => {
        set({ attachedFiles: [] });
      }
    }),
    {
      name: 'session-storage',
      partialize: (state) => ({ 
        currentSessionId: state.currentSessionId,
        sessions: state.sessions
      }),
    }
  ),
    {
      name: 'session-store'
    }
  )
);