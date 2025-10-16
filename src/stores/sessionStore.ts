import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import type { Session } from "@opencode-ai/sdk";
import { opencodeClient } from "@/lib/opencode/client";
import { getSafeStorage } from "./utils/safeStorage";

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
    isOpenChamberCreatedSession: (sessionId: string) => boolean;
    markSessionAsOpenChamberCreated: (sessionId: string) => void;
    initializeNewOpenChamberSession: (sessionId: string, agents: any[]) => void;
}

type SessionStore = SessionState & SessionActions;

const safeStorage = getSafeStorage();
const SESSION_SELECTION_STORAGE_KEY = "oc.sessionSelectionByDirectory";

type SessionSelectionMap = Record<string, string>;

const readSessionSelectionMap = (): SessionSelectionMap => {
    try {
        const raw = safeStorage.getItem(SESSION_SELECTION_STORAGE_KEY);
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
            return {};
        }
        return Object.entries(parsed as Record<string, unknown>).reduce<SessionSelectionMap>((acc, [directory, sessionId]) => {
            if (typeof directory === "string" && typeof sessionId === "string" && directory.length > 0 && sessionId.length > 0) {
                acc[directory] = sessionId;
            }
            return acc;
        }, {});
    } catch {
        return {};
    }
};

let sessionSelectionCache: SessionSelectionMap | null = null;

const getSessionSelectionMap = (): SessionSelectionMap => {
    if (!sessionSelectionCache) {
        sessionSelectionCache = readSessionSelectionMap();
    }
    return sessionSelectionCache;
};

const persistSessionSelectionMap = (map: SessionSelectionMap) => {
    sessionSelectionCache = map;
    try {
        safeStorage.setItem(SESSION_SELECTION_STORAGE_KEY, JSON.stringify(map));
    } catch {
        // Ignore storage failures – persistence is best effort
    }
};

const getStoredSessionForDirectory = (directory: string | null | undefined): string | null => {
    if (!directory) {
        return null;
    }
    const map = getSessionSelectionMap();
    const selection = map[directory];
    return typeof selection === "string" ? selection : null;
};

const storeSessionForDirectory = (directory: string | null | undefined, sessionId: string | null) => {
    if (!directory) {
        return;
    }
    const map = { ...getSessionSelectionMap() };
    if (sessionId) {
        map[directory] = sessionId;
    } else {
        delete map[directory];
    }
    persistSessionSelectionMap(map);
};

const clearInvalidSessionSelection = (directory: string | null | undefined, validIds: Iterable<string>) => {
    if (!directory) {
        return;
    }
    const storedSelection = getStoredSessionForDirectory(directory);
    if (!storedSelection) {
        return;
    }
    const validSet = new Set(validIds);
    if (!validSet.has(storedSelection)) {
        const map = { ...getSessionSelectionMap() };
        delete map[directory];
        persistSessionSelectionMap(map);
    }
};

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

                        const validSessionIds = new Set(dedupedSessions.map((session) => session.id));

                        if (directory) {
                            clearInvalidSessionSelection(directory, validSessionIds);
                            const storedSelection = getStoredSessionForDirectory(directory);
                            if (storedSelection && validSessionIds.has(storedSelection)) {
                                nextCurrentId = storedSelection;
                            }
                        }

                        set({
                            sessions: dedupedSessions,
                            currentSessionId: nextCurrentId,
                            lastLoadedDirectory: directory,
                            isLoading: false,
                        });

                        if (directory) {
                            storeSessionForDirectory(directory, nextCurrentId);
                        }
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

                        // Mark this session as OpenChamber created
                        set((state) => ({
                            sessions: [...state.sessions, session],
                            currentSessionId: session.id,
                            webUICreatedSessions: new Set([...state.webUICreatedSessions, session.id]),
                            isLoading: false, // Ensure loading is false
                        }));

                        const directory = opencodeClient.getDirectory() ?? null;
                        storeSessionForDirectory(directory, session.id);

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
                            let nextCurrentId: string | null = null;
                            set((state) => {
                                const filteredSessions = state.sessions.filter((s) => s.id !== id);
                                nextCurrentId = state.currentSessionId === id ? null : state.currentSessionId;
                                return {
                                    sessions: filteredSessions,
                                    currentSessionId: nextCurrentId,
                                    isLoading: false,
                                };
                            });

                            const directory = opencodeClient.getDirectory() ?? null;
                            storeSessionForDirectory(directory, nextCurrentId);
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
                    const directory = opencodeClient.getDirectory() ?? null;
                    storeSessionForDirectory(directory, id);
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

                isOpenChamberCreatedSession: (sessionId: string) => {
                    const { webUICreatedSessions } = get();
                    return webUICreatedSessions.has(sessionId);
                },

                markSessionAsOpenChamberCreated: (sessionId: string) => {
                    set((state) => {
                        const newOpenChamberCreatedSessions = new Set(state.webUICreatedSessions);
                        newOpenChamberCreatedSessions.add(sessionId);
                        return {
                            webUICreatedSessions: newOpenChamberCreatedSessions,
                        };
                    });
                },

                // New OpenChamber session initialization
                initializeNewOpenChamberSession: (sessionId: string, agents: any[]) => {
                    const { markSessionAsOpenChamberCreated } = get();

                    // Mark session as OpenChamber created
                    markSessionAsOpenChamberCreated(sessionId);

                    // Save agent defaults as initial selections for new OpenChamber sessions
                    // This would need to be implemented with context store integration
                    // For now, just mark as created
                },
            }),
            {
                name: "session-store",
                storage: createJSONStorage(() => getSafeStorage()),
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
