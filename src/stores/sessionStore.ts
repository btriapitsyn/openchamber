import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type { Session } from "@opencode-ai/sdk";
import { opencodeClient } from "@/lib/opencode/client";

interface SessionState {
    sessions: Session[];
    currentSessionId: string | null;
    lastLoadedDirectory: string | null;
    isLoading: boolean;
    error: string | null;
    webUICreatedSessions: Set<string>;
}

interface SessionActions {
    loadSessions: () => Promise<void>;
    createSession: (title?: string) => Promise<Session | null>;
    deleteSession: (id: string) => Promise<boolean>;
    updateSessionTitle: (id: string, title: string) => Promise<void>;
    shareSession: (id: string) => Promise<Session | null>;
    unshareSession: (id: string) => Promise<Session | null>;
    setCurrentSession: (id: string | null) => void;
    clearError: () => void;
    getSessionsByDirectory: (directory: string) => Session[];
    applySessionMetadata: (sessionId: string, metadata: Partial<Session>) => void;
    isWebUICreatedSession: (sessionId: string) => boolean;
    markSessionAsWebUICreated: (sessionId: string) => void;
    initializeNewWebUISession: (sessionId: string, agents: any[]) => void;
}

type SessionStore = SessionState & SessionActions;

export const useSessionStore = create<SessionStore>()(
    devtools(
        persist(
            (set, get) => ({
                // Initial State
                sessions: [],
                currentSessionId: null,
                lastLoadedDirectory: null,
                isLoading: false,
                error: null,
                webUICreatedSessions: new Set(),

                // Load all sessions
                loadSessions: async () => {
                    set({ isLoading: true, error: null });
                    try {
                        const fetchedSessions = await opencodeClient.listSessions();
                        const stateSnapshot = get();

                        const directory = opencodeClient.getDirectory() ?? null;
                        const previousDirectory = stateSnapshot.lastLoadedDirectory ?? null;
                        const directoryChanged = directory !== previousDirectory;

                        let nextSessions = [...fetchedSessions];
                        let nextCurrentId = stateSnapshot.currentSessionId;

                        const ensureSessionPresent = (session: Session) => {
                            nextSessions = [session, ...nextSessions.filter((item) => item.id !== session.id)];
                        };

                        if (directoryChanged) {
                            nextCurrentId = nextSessions.length > 0 ? nextSessions[0].id : null;
                        } else {
                            if (nextCurrentId) {
                                const hasCurrent = nextSessions.some((session) => session.id === nextCurrentId);
                                if (!hasCurrent) {
                                    const persistedSession = stateSnapshot.sessions.find((session) => session.id === nextCurrentId);

                                    if (persistedSession) {
                                        ensureSessionPresent(persistedSession);
                                    } else {
                                        try {
                                            const resolvedSession = await opencodeClient.getSession(nextCurrentId);
                                            ensureSessionPresent(resolvedSession);
                                        } catch {
                                            nextCurrentId = nextSessions.length > 0 ? nextSessions[0].id : null;
                                        }
                                    }
                                }
                            } else {
                                nextCurrentId = nextSessions.length > 0 ? nextSessions[0].id : null;
                            }
                        }

                        const dedupedSessions = nextSessions.reduce<Session[]>((accumulator, session) => {
                            if (!accumulator.some((existing) => existing.id === session.id)) {
                                accumulator.push(session);
                            }
                            return accumulator;
                        }, []);

                        // Ensure the current session reference is consistent with the final list
                        if (nextCurrentId && !dedupedSessions.some((session) => session.id === nextCurrentId)) {
                            nextCurrentId = dedupedSessions.length > 0 ? dedupedSessions[0].id : null;
                        }

                        set({
                            sessions: dedupedSessions,
                            currentSessionId: nextCurrentId,
                            lastLoadedDirectory: directory,
                            isLoading: false,
                        });
                    } catch (error) {
                        set({
                            error: error instanceof Error ? error.message : "Failed to load sessions",
                            isLoading: false,
                        });
                    }
                },

                // Create new session
                createSession: async (title?: string) => {
                    set({ error: null });
                    try {
                        // Directory is now handled globally by the OpenCode client
                        const session = await opencodeClient.createSession({ title });

                        // Mark this session as WebUI created
                        set((state) => ({
                            sessions: [...state.sessions, session],
                            currentSessionId: session.id,
                            webUICreatedSessions: new Set([...state.webUICreatedSessions, session.id]),
                            isLoading: false, // Ensure loading is false
                        }));

                        return session;
                    } catch (error) {
                        set({
                            error: error instanceof Error ? error.message : "Failed to create session",
                            isLoading: false,
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
                            set((state) => ({
                                sessions: state.sessions.filter((s) => s.id !== id),
                                currentSessionId: state.currentSessionId === id ? null : state.currentSessionId,
                                isLoading: false,
                            }));
                        }
                        return success;
                    } catch (error) {
                        set({
                            error: error instanceof Error ? error.message : "Failed to delete session",
                            isLoading: false,
                        });
                        return false;
                    }
                },

                // Update session title
                updateSessionTitle: async (id: string, title: string) => {
                    try {
                        const updatedSession = await opencodeClient.updateSession(id, title);
                        set((state) => ({
                            sessions: state.sessions.map((s) => (s.id === id ? updatedSession : s)),
                        }));
                    } catch (error) {
                        set({
                            error: error instanceof Error ? error.message : "Failed to update session title",
                        });
                    }
                },

                // Share session
                shareSession: async (id: string) => {
                    try {
                        const apiClient = opencodeClient.getApiClient();
                        const directory = opencodeClient.getDirectory();
                        const response = await apiClient.session.share({
                            path: { id },
                            query: directory ? { directory } : undefined,
                        });

                        // Update the session in the store if successful
                        if (response.data) {
                            set((state) => ({
                                sessions: state.sessions.map((s) => (s.id === id ? response.data : s)),
                            }));
                            return response.data;
                        }
                        return null;
                    } catch (error) {
                        set({
                            error: error instanceof Error ? error.message : "Failed to share session",
                        });
                        return null;
                    }
                },

                // Unshare session
                unshareSession: async (id: string) => {
                    try {
                        const apiClient = opencodeClient.getApiClient();
                        const directory = opencodeClient.getDirectory();
                        const response = await apiClient.session.unshare({
                            path: { id },
                            query: directory ? { directory } : undefined,
                        });

                        // Update the session in the store to remove the share property
                        if (response.data) {
                            set((state) => ({
                                sessions: state.sessions.map((s) => (s.id === id ? response.data : s)),
                            }));
                            return response.data;
                        }
                        return null;
                    } catch (error) {
                        set({
                            error: error instanceof Error ? error.message : "Failed to unshare session",
                        });
                        return null;
                    }
                },

                // Set current session
                setCurrentSession: (id: string | null) => {
                    set({ currentSessionId: id, error: null });
                },

                clearError: () => {
                    set({ error: null });
                },

                getSessionsByDirectory: (directory: string) => {
                    const { sessions } = get();
                    // For now, show all sessions until we can properly track directories
                    // The backend accepts directory as a parameter but doesn't return it in session data
                    // TODO: Request backend to include directory/path info in session responses
                    return sessions;
                },

                applySessionMetadata: (sessionId, metadata) => {
                    if (!sessionId || !metadata) {
                        return;
                    }

                    set((state) => {
                        const index = state.sessions.findIndex((session) => session.id === sessionId);
                        if (index === -1) {
                            return state;
                        }

                        const existingSession = state.sessions[index];
                        if (metadata.title === undefined || metadata.title === existingSession.title) {
                            return state;
                        }

                        const sessions = [...state.sessions];
                        sessions[index] = {
                            ...existingSession,
                            title: metadata.title,
                        };

                        return { sessions } as Partial<SessionStore>;
                    });
                },

                isWebUICreatedSession: (sessionId: string) => {
                    const { webUICreatedSessions } = get();
                    return webUICreatedSessions.has(sessionId);
                },

                markSessionAsWebUICreated: (sessionId: string) => {
                    set((state) => {
                        const newWebUICreatedSessions = new Set(state.webUICreatedSessions);
                        newWebUICreatedSessions.add(sessionId);
                        return {
                            webUICreatedSessions: newWebUICreatedSessions,
                        };
                    });
                },

                // New WebUI session initialization
                initializeNewWebUISession: (sessionId: string, agents: any[]) => {
                    const { markSessionAsWebUICreated } = get();

                    // Mark session as WebUI created
                    markSessionAsWebUICreated(sessionId);

                    // Save agent defaults as initial selections for new WebUI sessions
                    // This would need to be implemented with context store integration
                    // For now, just mark as created
                },
            }),
            {
                name: "session-store",
                partialize: (state) => ({
                    currentSessionId: state.currentSessionId,
                    sessions: state.sessions,
                    lastLoadedDirectory: state.lastLoadedDirectory,
                    webUICreatedSessions: Array.from(state.webUICreatedSessions),
                }),
                merge: (persistedState: any, currentState) => ({
                    ...currentState,
                    ...(persistedState as object),
                    webUICreatedSessions: new Set(persistedState?.webUICreatedSessions || []),
                    lastLoadedDirectory: persistedState?.lastLoadedDirectory ?? currentState.lastLoadedDirectory ?? null,
                }),
            }
        ),
        {
            name: "session-store",
        }
    )
);