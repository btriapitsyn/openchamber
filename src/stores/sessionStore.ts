import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import type { Session } from "@opencode-ai/sdk";
import { opencodeClient } from "@/lib/opencode/client";
import { getSafeStorage } from "./utils/safeStorage";
import type { WorktreeMetadata } from "@/types/worktree";
import { archiveWorktree, getWorktreeStatus, listWorktrees, mapWorktreeToMetadata } from "@/lib/git/worktreeService";
import { useDirectoryStore } from "./useDirectoryStore";

interface SessionState {
    sessions: Session[];
    currentSessionId: string | null;
    lastLoadedDirectory: string | null;
    isLoading: boolean;
    error: string | null;
    webUICreatedSessions: Set<string>;
    worktreeMetadata: Map<string, WorktreeMetadata>;
}

interface SessionActions {
    loadSessions: () => Promise<void>;
    createSession: (title?: string, directoryOverride?: string | null) => Promise<Session | null>;
    deleteSession: (id: string, options?: { archiveWorktree?: boolean; deleteRemoteBranch?: boolean; remoteName?: string }) => Promise<boolean>;
    deleteSessions: (ids: string[], options?: { archiveWorktree?: boolean; deleteRemoteBranch?: boolean; remoteName?: string }) => Promise<{ deletedIds: string[]; failedIds: string[] }>;
    updateSessionTitle: (id: string, title: string) => Promise<void>;
    shareSession: (id: string) => Promise<Session | null>;
    unshareSession: (id: string) => Promise<Session | null>;
    setCurrentSession: (id: string | null) => void;
    clearError: () => void;
    getSessionsByDirectory: (directory: string) => Session[];
    applySessionMetadata: (sessionId: string, metadata: Partial<Session>) => void;
    isOpenChamberCreatedSession: (sessionId: string) => boolean;
    markSessionAsOpenChamberCreated: (sessionId: string) => void;
    initializeNewOpenChamberSession: (sessionId: string, agents: Record<string, unknown>[]) => void;
    setWorktreeMetadata: (sessionId: string, metadata: WorktreeMetadata | null) => void;
    getWorktreeMetadata: (sessionId: string) => WorktreeMetadata | undefined;
    setSessionDirectory: (sessionId: string, directory: string | null) => void;
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

const archiveSessionWorktree = async (
    metadata: WorktreeMetadata,
    options?: { deleteRemoteBranch?: boolean; remoteName?: string }
) => {
    const status = metadata.status ?? (await getWorktreeStatus(metadata.path).catch(() => undefined));
    await archiveWorktree({
        projectDirectory: metadata.projectDirectory,
        path: metadata.path,
        branch: metadata.branch,
        force: Boolean(status?.isDirty),
        deleteRemote: Boolean(options?.deleteRemoteBranch),
        remote: options?.remoteName,
    });
};

const normalizePath = (value?: string | null): string | null => {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const replaced = trimmed.replace(/\\/g, "/");
    if (replaced === "/") {
        return "/";
    }
    return replaced.length > 1 ? replaced.replace(/\/+$/, "") : replaced;
};

const hydrateSessionWorktreeMetadata = async (
    sessions: Session[],
    projectDirectory: string | null,
    existingMetadata: Map<string, WorktreeMetadata>
): Promise<Map<string, WorktreeMetadata> | null> => {
    const normalizedProject = normalizePath(projectDirectory);
    if (!normalizedProject || sessions.length === 0) {
        return null;
    }

    const sessionsWithDirectory = sessions
        .map((session) => ({ id: session.id, directory: normalizePath((session as { directory?: string }).directory) }))
        .filter((entry): entry is { id: string; directory: string } => Boolean(entry.directory));

    if (sessionsWithDirectory.length === 0) {
        return null;
    }

    let worktreeEntries;
    try {
        worktreeEntries = await listWorktrees(normalizedProject);
    } catch (error) {
        console.debug("Failed to hydrate worktree metadata from git worktree list:", error);
        return null;
    }

    if (!Array.isArray(worktreeEntries) || worktreeEntries.length === 0) {
        let mutated = false;
        const next = new Map(existingMetadata);
        sessionsWithDirectory.forEach(({ id }) => {
            if (next.delete(id)) {
                mutated = true;
            }
        });
        return mutated ? next : null;
    }

    const worktreeMapByPath = new Map<string, WorktreeMetadata>();
    worktreeEntries.forEach((info) => {
        const metadata = mapWorktreeToMetadata(normalizedProject, info);
        const normalizedPath = normalizePath(metadata.path) ?? metadata.path;

        // Skip the primary worktree (same directory as the main project).
        if (normalizedPath === normalizedProject) {
            return;
        }

        worktreeMapByPath.set(normalizedPath, metadata);
    });

    let mutated = false;
    const next = new Map(existingMetadata);

    sessionsWithDirectory.forEach(({ id, directory }) => {
        const metadata = worktreeMapByPath.get(directory);
        if (!metadata) {
            if (next.delete(id)) {
                mutated = true;
            }
            return;
        }

        const previous = next.get(id);
        if (!previous || previous.path !== metadata.path || previous.branch !== metadata.branch || previous.label !== metadata.label) {
            next.set(id, metadata);
            mutated = true;
        }
    });

    return mutated ? next : null;
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
                worktreeMetadata: new Map(),

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

                        let hydratedMetadata: Map<string, WorktreeMetadata> | null = null;
                        try {
                            hydratedMetadata = await hydrateSessionWorktreeMetadata(
                                dedupedSessions,
                                directory,
                                stateSnapshot.worktreeMetadata
                            );
                        } catch (metadataError) {
                            console.debug("Failed to refresh worktree metadata during session load:", metadataError);
                        }

                        set({
                            sessions: dedupedSessions,
                            currentSessionId: nextCurrentId,
                            lastLoadedDirectory: directory,
                            isLoading: false,
                            worktreeMetadata: hydratedMetadata ?? stateSnapshot.worktreeMetadata,
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
                createSession: async (title?: string, directoryOverride?: string | null) => {
                    set({ error: null });
                    try {
                        const createRequest = () => opencodeClient.createSession({ title });
                        const session = directoryOverride
                            ? await opencodeClient.withDirectory(directoryOverride, createRequest)
                            : await createRequest();

                        // Mark this session as OpenChamber created
                        set((state) => ({
                            sessions: [...state.sessions, session],
                            currentSessionId: session.id,
                            webUICreatedSessions: new Set([...state.webUICreatedSessions, session.id]),
                            isLoading: false, // Ensure loading is false
                        }));

                        const directoryToStore = directoryOverride ?? opencodeClient.getDirectory() ?? null;
                        storeSessionForDirectory(directoryToStore, session.id);

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
                deleteSession: async (id: string, options) => {
                    set({ isLoading: true, error: null });
                    const metadata = get().worktreeMetadata.get(id);
                    let archivedMetadata: WorktreeMetadata | null = null;
                    try {
                    if (metadata && options?.archiveWorktree) {
                        await archiveSessionWorktree(metadata, {
                            deleteRemoteBranch: options?.deleteRemoteBranch,
                            remoteName: options?.remoteName,
                        });
                        archivedMetadata = metadata;
                    }

                        const deleteRequest = () => opencodeClient.deleteSession(id);
                        const success = metadata?.path
                            ? await opencodeClient.withDirectory(metadata.path, deleteRequest)
                            : await deleteRequest();
                        if (!success) {
                            set((state) => {
                                const update: Partial<SessionStore> = {
                                    isLoading: false,
                                    error: "Failed to delete session",
                                };
                                if (archivedMetadata) {
                                    const nextMetadata = new Map(state.worktreeMetadata);
                                    nextMetadata.delete(id);
                                    update.worktreeMetadata = nextMetadata;
                                }
                                return update;
                            });
                            return false;
                        }

                        let nextCurrentId: string | null = null;
                        set((state) => {
                            const filteredSessions = state.sessions.filter((s) => s.id !== id);
                            nextCurrentId = state.currentSessionId === id ? null : state.currentSessionId;
                            const nextMetadata = new Map(state.worktreeMetadata);
                            nextMetadata.delete(id);
                            return {
                                sessions: filteredSessions,
                                currentSessionId: nextCurrentId,
                                isLoading: false,
                                worktreeMetadata: nextMetadata,
                            };
                        });

                        const directoryToStore = metadata?.path ?? opencodeClient.getDirectory() ?? null;
                        storeSessionForDirectory(directoryToStore, nextCurrentId);

                        return true;
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Failed to delete session";
                        if (archivedMetadata) {
                            set((state) => {
                                const nextMetadata = new Map(state.worktreeMetadata);
                                nextMetadata.delete(id);
                                return {
                                    worktreeMetadata: nextMetadata,
                                    error: message,
                                    isLoading: false,
                                };
                            });
                        } else {
                            set({
                                error: message,
                                isLoading: false,
                            });
                        }
                        return false;
                    }
                },

                // Delete multiple sessions
                deleteSessions: async (ids: string[], options) => {
                    const uniqueIds = Array.from(new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0)));
                    if (uniqueIds.length === 0) {
                        return { deletedIds: [], failedIds: [] };
                    }

                    set({ isLoading: true, error: null });
                    const deletedIds: string[] = [];
                    const failedIds: string[] = [];
                    const archivedIds = new Set<string>();

                    const removedWorktrees: Array<{ path: string; projectDirectory: string }> = [];

                    for (const id of uniqueIds) {
                        try {
                            const metadata = get().worktreeMetadata.get(id);
                            if (metadata && options?.archiveWorktree) {
                                await archiveSessionWorktree(metadata, {
                                    deleteRemoteBranch: options?.deleteRemoteBranch,
                                    remoteName: options?.remoteName,
                                });
                                archivedIds.add(id);
                                removedWorktrees.push({ path: metadata.path, projectDirectory: metadata.projectDirectory });
                            }

                            const deleteRequest = () => opencodeClient.deleteSession(id);
                            const success = metadata?.path
                                ? await opencodeClient.withDirectory(metadata.path, deleteRequest)
                                : await deleteRequest();
                            if (success) {
                                deletedIds.push(id);
                                if (metadata?.path) {
                                    removedWorktrees.push({ path: metadata.path, projectDirectory: metadata.projectDirectory });
                                }
                            } else {
                                failedIds.push(id);
                            }
                        } catch {
                            failedIds.push(id);
                        }
                    }

                    const directoryStore = useDirectoryStore.getState();
                    removedWorktrees.forEach(({ path, projectDirectory }) => {
                        if (directoryStore.currentDirectory === path) {
                            directoryStore.setDirectory(projectDirectory, { showOverlay: false });
                        }
                    });

                    const deletedSet = new Set(deletedIds);
                    const errorMessage = failedIds.length > 0
                        ? (failedIds.length === uniqueIds.length ? "Failed to delete sessions" : "Failed to delete some sessions")
                        : null;
                    let nextCurrentId: string | null = null;

                    set((state) => {
                        const filteredSessions = state.sessions.filter((session) => !deletedSet.has(session.id));
                        if (state.currentSessionId && deletedSet.has(state.currentSessionId)) {
                            nextCurrentId = filteredSessions.length > 0 ? filteredSessions[0].id : null;
                        } else {
                            nextCurrentId = state.currentSessionId;
                        }

                        const nextMetadata = new Map(state.worktreeMetadata);
                        for (const removedId of deletedSet) {
                            nextMetadata.delete(removedId);
                        }
                        for (const archivedId of archivedIds) {
                            nextMetadata.delete(archivedId);
                        }

                        return {
                            sessions: filteredSessions,
                            currentSessionId: nextCurrentId,
                            isLoading: false,
                            worktreeMetadata: nextMetadata,
                            error: errorMessage,
                        };
                    });

                    const directory = opencodeClient.getDirectory() ?? null;
                    storeSessionForDirectory(directory, nextCurrentId);

                    return { deletedIds, failedIds };
                },

                // Update session title
                updateSessionTitle: async (id: string, title: string) => {
                    try {
                        const metadata = get().worktreeMetadata.get(id);
                        const updateRequest = () => opencodeClient.updateSession(id, title);
                        const updatedSession = metadata?.path
                            ? await opencodeClient.withDirectory(metadata.path, updateRequest)
                            : await updateRequest();
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
                        const metadata = get().worktreeMetadata.get(id);
                        const shareRequest = async () => {
                            const directory = opencodeClient.getDirectory();
                            return apiClient.session.share({
                                path: { id },
                                query: directory ? { directory } : undefined,
                            });
                        };
                        const response = metadata?.path
                            ? await opencodeClient.withDirectory(metadata.path, shareRequest)
                            : await shareRequest();

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
                        const metadata = get().worktreeMetadata.get(id);
                        const unshareRequest = async () => {
                            const directory = opencodeClient.getDirectory();
                            return apiClient.session.unshare({
                                path: { id },
                                query: directory ? { directory } : undefined,
                            });
                        };
                        const response = metadata?.path
                            ? await opencodeClient.withDirectory(metadata.path, unshareRequest)
                            : await unshareRequest();

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

                getSessionsByDirectory: () => {
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
                initializeNewOpenChamberSession: (sessionId: string) => {
                    const { markSessionAsOpenChamberCreated } = get();

                    // Mark session as OpenChamber created
                    markSessionAsOpenChamberCreated(sessionId);

                    // Save agent defaults as initial selections for new OpenChamber sessions
                    // This would need to be implemented with context store integration
                    // For now, just mark as created
                },

                setWorktreeMetadata: (sessionId: string, metadata: WorktreeMetadata | null) => {
                    if (!sessionId) {
                        return;
                    }
                    set((state) => {
                        const next = new Map(state.worktreeMetadata);
                        if (metadata) {
                            next.set(sessionId, metadata);
                        } else {
                            next.delete(sessionId);
                        }
                        return { worktreeMetadata: next };
                    });
                },

                getWorktreeMetadata: (sessionId: string) => {
                    if (!sessionId) {
                        return undefined;
                    }
                    return get().worktreeMetadata.get(sessionId);
                },

                setSessionDirectory: (sessionId: string, directory: string | null) => {
                    if (!sessionId) {
                        return;
                    }

                    const currentSessions = get().sessions;
                    const targetIndex = currentSessions.findIndex((session) => session.id === sessionId);
                    if (targetIndex === -1) {
                        return;
                    }

                    const existingSession = currentSessions[targetIndex];
                    const previousDirectory = existingSession.directory ?? null;
                    const normalizedDirectory = directory ?? undefined;

                    if (previousDirectory === (normalizedDirectory ?? null)) {
                        return;
                    }

                    set((state) => {
                        const sessions = [...state.sessions];
                        const updatedSession = { ...sessions[targetIndex] } as Record<string, unknown>;
                        if (normalizedDirectory !== undefined) {
                            updatedSession.directory = normalizedDirectory;
                        } else {
                            delete updatedSession.directory;
                        }
                        sessions[targetIndex] = updatedSession as Session;
                        return { sessions };
                    });

                    if (previousDirectory) {
                        storeSessionForDirectory(previousDirectory, null);
                    }
                    if (directory) {
                        storeSessionForDirectory(directory, sessionId);
                    }

                    if (get().currentSessionId === sessionId) {
                        try {
                            const directoryState = useDirectoryStore.getState();
                            if (!directoryState.isSwitchingDirectory) {
                                opencodeClient.setDirectory(directory ?? undefined);
                            }
                        } catch (error) {
                            console.warn("Failed to update client directory for session:", error);
                        }
                    }
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
        worktreeMetadata: Array.from(state.worktreeMetadata.entries()),
    }),
    merge: (persistedState, currentState) => {
        const isRecord = (value: unknown): value is Record<string, unknown> =>
            typeof value === "object" && value !== null;

        if (!isRecord(persistedState)) {
            return currentState;
        }

        const persistedSessions = Array.isArray(persistedState.sessions)
            ? (persistedState.sessions as Session[])
            : currentState.sessions;

        const persistedCurrentSessionId =
            typeof persistedState.currentSessionId === "string" || persistedState.currentSessionId === null
                ? (persistedState.currentSessionId as string | null)
                : currentState.currentSessionId;

        const webUiSessionsArray = Array.isArray(persistedState.webUICreatedSessions)
            ? (persistedState.webUICreatedSessions as string[])
            : [];

        const persistedWorktreeEntries = Array.isArray(persistedState.worktreeMetadata)
            ? (persistedState.worktreeMetadata as Array<[string, WorktreeMetadata]>)
            : [];

        const lastLoadedDirectory =
            typeof persistedState.lastLoadedDirectory === "string"
                ? persistedState.lastLoadedDirectory
                : currentState.lastLoadedDirectory ?? null;

        return {
            ...currentState,
            ...persistedState,
            sessions: persistedSessions,
            currentSessionId: persistedCurrentSessionId,
            webUICreatedSessions: new Set(webUiSessionsArray),
            worktreeMetadata: new Map(persistedWorktreeEntries),
            lastLoadedDirectory,
        };
    },
            }
        ),
        {
            name: "session-store",
        }
    )
);
