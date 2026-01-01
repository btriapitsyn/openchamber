import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import type { Session } from "@opencode-ai/sdk";
import { opencodeClient } from "@/lib/opencode/client";
import { getSafeStorage } from "./utils/safeStorage";
import type { WorktreeMetadata } from "@/types/worktree";
import { archiveWorktree, getWorktreeStatus, listWorktrees, mapWorktreeToMetadata } from "@/lib/git/worktreeService";
import { useDirectoryStore } from "./useDirectoryStore";
import { checkIsGitRepository } from "@/lib/gitApi";

interface SessionState {
    sessions: Session[];
    currentSessionId: string | null;
    lastLoadedDirectory: string | null;
    isLoading: boolean;
    error: string | null;
    webUICreatedSessions: Set<string>;
    worktreeMetadata: Map<string, WorktreeMetadata>;
    availableWorktrees: WorktreeMetadata[];
}

interface SessionActions {
    loadSessions: () => Promise<void>;
    createSession: (title?: string, directoryOverride?: string | null, parentID?: string | null) => Promise<Session | null>;
    deleteSession: (id: string, options?: { archiveWorktree?: boolean; deleteRemoteBranch?: boolean; remoteName?: string }) => Promise<boolean>;
    deleteSessions: (ids: string[], options?: { archiveWorktree?: boolean; deleteRemoteBranch?: boolean; remoteName?: string; silent?: boolean }) => Promise<{ deletedIds: string[]; failedIds: string[] }>;
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
    updateSession: (session: Session) => void;
}

type SessionStore = SessionState & SessionActions;

const safeStorage = getSafeStorage();
const SESSION_SELECTION_STORAGE_KEY = "oc.sessionSelectionByDirectory";
const WORKTREE_ROOT = ".openchamber";

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
    } catch { /* ignored */ }
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

const getSessionDirectory = (sessions: Session[], sessionId: string): string | null => {
    const target = sessions.find((session) => session.id === sessionId);
    if (!target) {
        return null;
    }
    return normalizePath((target as { directory?: string | null }).directory ?? null);
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

                sessions: [],
                currentSessionId: null,
                lastLoadedDirectory: null,
                isLoading: false,
                error: null,
                webUICreatedSessions: new Set(),
                worktreeMetadata: new Map(),
                availableWorktrees: [],

                loadSessions: async () => {
                    set({ isLoading: true, error: null });
                    try {
                        const directoryStore = useDirectoryStore.getState();
                        const projectDirectory = directoryStore.currentDirectory ?? opencodeClient.getDirectory() ?? null;
                        const apiClient = opencodeClient.getApiClient();

                        const fetchSessions = async (directoryParam?: string | null): Promise<Session[]> => {
                            const response = await apiClient.session.list({
                                query: directoryParam ? { directory: directoryParam } : undefined,
                            });
                            return Array.isArray(response.data) ? response.data : [];
                        };

                        const normalizedProject = normalizePath(projectDirectory);

                        const isGitRepo = normalizedProject ? await checkIsGitRepository(normalizedProject).catch(() => false) : false;

                        const parentSessions = await fetchSessions(normalizedProject || null);

                        const subdirectorySessions: Session[] = [];
                        let discoveredWorktrees: WorktreeMetadata[] = [];

                        if (projectDirectory && isGitRepo && normalizedProject) {
                            const worktreeRoot = `${normalizedProject}/${WORKTREE_ROOT}`;
                            try {
                                const candidates = new Set<string>();
                                
                                // Check if .openchamber directory exists before trying to list it
                                const projectEntries = await opencodeClient.listLocalDirectory(normalizedProject);
                                const worktreeDirExists = projectEntries.some(
                                    (entry) => entry.isDirectory && entry.name === WORKTREE_ROOT
                                );
                                
                                if (worktreeDirExists) {
                                    const entries = await opencodeClient.listLocalDirectory(worktreeRoot);
                                    entries
                                        .filter((entry) => entry.isDirectory)
                                        .forEach((entry) => {
                                            const isAbsolutePath = /^([A-Za-z]:)?\//.test(entry.path);
                                            const resolvedPath = isAbsolutePath ? entry.path : `${worktreeRoot}/${entry.name}`;
                                            candidates.add(normalizePath(resolvedPath) ?? resolvedPath);
                                        });
                                }

                                const listedWorktrees = await listWorktrees(normalizedProject);
                                if (Array.isArray(listedWorktrees)) {
                                    discoveredWorktrees = listedWorktrees
                                        .map((info) => mapWorktreeToMetadata(normalizedProject, info))
                                        .filter((meta) => meta.path.includes(`/${WORKTREE_ROOT}/`));
                                    discoveredWorktrees.forEach((meta) => candidates.add(meta.path));
                                }

                                if (candidates.size > 0) {
                                    const results = await Promise.allSettled(
                                        Array.from(candidates).map((path) => fetchSessions(path))
                                    );
                                    results.forEach((result) => {
                                        if (result.status === "fulfilled" && Array.isArray(result.value)) {
                                            subdirectorySessions.push(...result.value);
                                        }
                                    });
                                }
                            } catch {

                                discoveredWorktrees = [];
                            }
                        }

                        const validPaths = new Set<string>();
                        if (normalizedProject) {
                            validPaths.add(normalizedProject);
                        }
                        discoveredWorktrees.forEach((meta) => {
                            const normalized = normalizePath(meta.path);
                            if (normalized) {
                                validPaths.add(normalized);
                            }
                        });

                        const mergedSessions = [...parentSessions, ...subdirectorySessions].filter((session) => {
                            const rawDir = (session as { directory?: string | null }).directory ?? normalizedProject ?? null;
                            const normalizedDir = normalizePath(rawDir);
                            if (!normalizedDir) {
                                return false;
                            }
                            return validPaths.has(normalizedDir);
                        });
                        const stateSnapshot = get();

                        const previousDirectory = stateSnapshot.lastLoadedDirectory ?? null;
                        const directoryChanged = projectDirectory !== previousDirectory;

                        let nextSessions = [...mergedSessions];
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

                        if (nextCurrentId && !dedupedSessions.some((session) => session.id === nextCurrentId)) {
                            nextCurrentId = dedupedSessions.length > 0 ? dedupedSessions[0].id : null;
                        }

                        const validSessionIds = new Set(dedupedSessions.map((session) => session.id));

                        const resolveSelectionDirectory = (sessionId: string | null): string | null => {
                            if (!sessionId) {
                                return null;
                            }
                            const sessionDir = getSessionDirectory(dedupedSessions, sessionId);
                            if (sessionDir) {
                                return sessionDir;
                            }
                            const persistedDir = getSessionDirectory(stateSnapshot.sessions, sessionId);
                            if (persistedDir) {
                                return persistedDir;
                            }
                            return null;
                        };

                        const selectionDirectoryKey = resolveSelectionDirectory(nextCurrentId) ?? normalizedProject ?? projectDirectory ?? null;

                        if (projectDirectory) {
                            clearInvalidSessionSelection(projectDirectory, validSessionIds);
                        }

                        if (selectionDirectoryKey) {
                            clearInvalidSessionSelection(selectionDirectoryKey, validSessionIds);
                            const storedSelection = getStoredSessionForDirectory(selectionDirectoryKey);
                            if (storedSelection && validSessionIds.has(storedSelection)) {
                                nextCurrentId = storedSelection;
                            }
                        }

                        let hydratedMetadata: Map<string, WorktreeMetadata> | null = null;
                        try {
                            hydratedMetadata = await hydrateSessionWorktreeMetadata(
                                dedupedSessions,
                                projectDirectory,
                                stateSnapshot.worktreeMetadata
                            );
                        } catch (metadataError) {
                            console.debug("Failed to refresh worktree metadata during session load:", metadataError);
                        }

                        const nextWorktreeMetadata = (() => {
                            const source = hydratedMetadata ?? stateSnapshot.worktreeMetadata;
                            if (!directoryChanged || !normalizedProject) {
                                return source;
                            }

                            const filtered = new Map<string, WorktreeMetadata>();
                            source.forEach((meta, key) => {
                                if (normalizePath(meta.projectDirectory) === normalizedProject) {
                                    filtered.set(key, meta);
                                }
                            });
                            return filtered;
                        })();

                        const resolvedDirectoryForCurrent = (() => {
                            if (!nextCurrentId) {
                                return normalizedProject ?? null;
                            }
                            const metadataPath = nextWorktreeMetadata.get(nextCurrentId)?.path;
                            if (metadataPath) {
                                return normalizePath(metadataPath) ?? metadataPath;
                            }
                            const sessionDir = getSessionDirectory(dedupedSessions, nextCurrentId);
                            if (sessionDir) {
                                return sessionDir;
                            }
                            return normalizedProject ?? null;
                        })();

                        try {
                            opencodeClient.setDirectory(resolvedDirectoryForCurrent ?? undefined);
                        } catch (error) {
                            console.warn("Failed to sync OpenCode directory after session load:", error);
                        }

                        set({
                            sessions: dedupedSessions,
                            currentSessionId: nextCurrentId,
                            lastLoadedDirectory: projectDirectory,
                            isLoading: false,
                            worktreeMetadata: nextWorktreeMetadata,
                            availableWorktrees: discoveredWorktrees,
                        });

                        storeSessionForDirectory(resolvedDirectoryForCurrent ?? projectDirectory, nextCurrentId);
                    } catch (error) {
                        set({
                            error: error instanceof Error ? error.message : "Failed to load sessions",
                            isLoading: false,
                        });
                    }
                },

                createSession: async (title?: string, directoryOverride?: string | null, parentID?: string | null) => {
                    set({ error: null });
                    const directoryStore = useDirectoryStore.getState();
                    const fallbackDirectory = normalizePath(directoryStore.currentDirectory);
                    const targetDirectory = normalizePath(directoryOverride ?? opencodeClient.getDirectory() ?? fallbackDirectory);

                    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                    const previousState = get();
                    const existingIds = new Set(previousState.sessions.map((s) => s.id));
                    const optimisticSession: Session = {
                        id: tempId,
                        title: title || "New session",
                        parentID: parentID ?? undefined,
                        directory: targetDirectory ?? null,
                        projectID: (previousState.sessions[0] as { projectID?: string })?.projectID ?? "",
                        version: "0.0.0",
                        time: {
                            created: Date.now(),
                            updated: Date.now(),
                        },
                        summary: undefined,
                        share: undefined,
                    } as Session;

                    set((state) => ({
                        sessions: [optimisticSession, ...state.sessions],
                        currentSessionId: tempId,
                        webUICreatedSessions: new Set([...state.webUICreatedSessions, tempId]),
                        isLoading: false,
                    }));

                    if (targetDirectory) {
                        try {
                            opencodeClient.setDirectory(targetDirectory);
                        } catch (error) {
                            console.warn("Failed to sync OpenCode directory after session creation:", error);
                        }
                    }

                    const replaceOptimistic = (real: Session) => {
                        set((state) => {
                            const updatedSessions = state.sessions.map((item) => (item.id === tempId ? real : item));
                            return {
                                sessions: updatedSessions,
                                currentSessionId: real.id,
                                webUICreatedSessions: new Set([
                                    ...Array.from(state.webUICreatedSessions).filter((id) => id !== tempId),
                                    real.id,
                                ]),
                            };
                        });
                        storeSessionForDirectory(targetDirectory ?? null, real.id);
                    };

                    const pollForSession = async (): Promise<Session | null> => {
                        const apiClient = opencodeClient.getApiClient();
                        const attempts = 20;
                        for (let attempt = 0; attempt < attempts; attempt += 1) {
                            try {
                                const response = await apiClient.session.list({
                                    query: targetDirectory ? { directory: targetDirectory } : undefined,
                                });
                                const list = Array.isArray(response.data) ? response.data : [];
                                const candidate = list.find((entry) => {
                                    if (existingIds.has(entry.id)) return false;
                                    if (title && entry.title && entry.title !== title) return false;
                                    return true;
                                });
                                if (candidate) {
                                    return candidate as Session;
                                }
                            } catch (pollError) {
                                console.debug("Session poll attempt failed:", pollError);
                            }
                            await new Promise((resolve) => setTimeout(resolve, 2000));
                        }
                        return null;
                    };

                    try {
                        const createRequest = () => opencodeClient.createSession({ title, parentID: parentID ?? undefined });
                        let session: Session | null = null;

                        try {
                            session = targetDirectory
                                ? await opencodeClient.withDirectory(targetDirectory, createRequest)
                                : await createRequest();
                        } catch (creationError) {
                            console.warn("Direct session create failed or timed out, falling back to polling:", creationError);
                        }

                        if (!session) {
                            session = await pollForSession();
                        }

                        if (session) {
                            replaceOptimistic(session);
                            return session;
                        }

                        set((state) => ({
                            sessions: state.sessions.filter((s) => s.id !== tempId),
                            currentSessionId: previousState.currentSessionId,
                            webUICreatedSessions: new Set(
                                Array.from(state.webUICreatedSessions).filter((id) => id !== tempId)
                            ),
                            isLoading: false,
                            error: "Failed to create session",
                        }));
                        return null;
                    } catch (error) {

                        set((state) => ({
                            sessions: state.sessions.filter((s) => s.id !== tempId),
                            currentSessionId: previousState.currentSessionId,
                            webUICreatedSessions: new Set(
                                Array.from(state.webUICreatedSessions).filter((id) => id !== tempId)
                            ),
                            isLoading: false,
                            error: error instanceof Error ? error.message : "Failed to create session",
                        }));
                        return null;
                    }
                },

                deleteSession: async (id: string, options) => {
                    set({ isLoading: true, error: null });
                    const metadata = get().worktreeMetadata.get(id);
                    const sessionDirectory = getSessionDirectory(get().sessions, id);
                    const overrideDirectory = metadata?.path ?? sessionDirectory;
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
                        const success = overrideDirectory
                            ? await opencodeClient.withDirectory(overrideDirectory, deleteRequest)
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
                            const nextAvailableWorktrees = options?.archiveWorktree && metadata
                                ? state.availableWorktrees.filter((entry) => normalizePath(entry.path) !== normalizePath(metadata.path))
                                : state.availableWorktrees;
                            return {
                                sessions: filteredSessions,
                                currentSessionId: nextCurrentId,
                                isLoading: false,
                                worktreeMetadata: nextMetadata,
                                availableWorktrees: nextAvailableWorktrees,
                            };
                        });

                        const directoryToStore = overrideDirectory ?? opencodeClient.getDirectory() ?? null;
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

                deleteSessions: async (
                    ids: string[],
                    options?: { archiveWorktree?: boolean; deleteRemoteBranch?: boolean; remoteName?: string; silent?: boolean }
                ) => {
                    const uniqueIds = Array.from(new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0)));
                    if (uniqueIds.length === 0) {
                        return { deletedIds: [], failedIds: [] };
                    }

                    const silent = options?.silent === true;
                    if (!silent) {
                        set({ isLoading: true, error: null });
                    }
                    const deletedIds: string[] = [];
                    const failedIds: string[] = [];
                    const archivedIds = new Set<string>();

                    const removedWorktrees: Array<{ path: string; projectDirectory: string }> = [];
                    const archivedWorktreePaths = new Set<string>();

                    for (const id of uniqueIds) {
                        try {
                            const metadata = get().worktreeMetadata.get(id);
                            const sessionDirectory = getSessionDirectory(get().sessions, id);
                            const overrideDirectory = metadata?.path ?? sessionDirectory;
                            if (metadata && options?.archiveWorktree && !archivedWorktreePaths.has(metadata.path)) {
                                await archiveSessionWorktree(metadata, {
                                    deleteRemoteBranch: options?.deleteRemoteBranch,
                                    remoteName: options?.remoteName,
                                });
                                archivedIds.add(id);
                                removedWorktrees.push({ path: metadata.path, projectDirectory: metadata.projectDirectory });
                                archivedWorktreePaths.add(metadata.path);
                            }

                            const deleteRequest = () => opencodeClient.deleteSession(id);
                            const success = overrideDirectory
                                ? await opencodeClient.withDirectory(overrideDirectory, deleteRequest)
                                : await deleteRequest();
                            if (success) {
                                deletedIds.push(id);
                                if (metadata?.path && !removedWorktrees.some((entry) => entry.path === metadata.path)) {
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
                            nextCurrentId = null;
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

                        const removedPaths = new Set(
                            removedWorktrees
                                .map((entry) => normalizePath(entry.path))
                                .filter((p): p is string => Boolean(p))
                        );
                        const nextAvailableWorktrees =
                            removedPaths.size > 0
                                ? state.availableWorktrees.filter(
                                      (entry) => !removedPaths.has(normalizePath(entry.path) ?? entry.path)
                                  )
                                : state.availableWorktrees;

                        return {
                            sessions: filteredSessions,
                            currentSessionId: nextCurrentId,
                            ...(silent ? {} : { isLoading: false, error: errorMessage }),
                            worktreeMetadata: nextMetadata,
                            availableWorktrees: nextAvailableWorktrees,
                        };
                    });

                    const directory = opencodeClient.getDirectory() ?? null;
                    storeSessionForDirectory(directory, nextCurrentId);

                    return { deletedIds, failedIds };
                },

                updateSessionTitle: async (id: string, title: string) => {
                    try {
                        const sessionDirectory = getSessionDirectory(get().sessions, id);
                        const metadata = get().worktreeMetadata.get(id);
                        const updateRequest = () => opencodeClient.updateSession(id, title);
                        const overrideDirectory = metadata?.path ?? sessionDirectory;
                        const updatedSession = overrideDirectory
                            ? await opencodeClient.withDirectory(overrideDirectory, updateRequest)
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

                shareSession: async (id: string) => {
                    try {
                        const sessionDirectory = getSessionDirectory(get().sessions, id);
                        const apiClient = opencodeClient.getApiClient();
                        const metadata = get().worktreeMetadata.get(id);
                        const overrideDirectory = metadata?.path ?? sessionDirectory;
                        const shareRequest = async () => {
                            const directory = sessionDirectory ?? opencodeClient.getDirectory();
                            return apiClient.session.share({
                                path: { id },
                                query: directory ? { directory } : undefined,
                            });
                        };
                        const response = overrideDirectory
                            ? await opencodeClient.withDirectory(overrideDirectory, shareRequest)
                            : await shareRequest();

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

                unshareSession: async (id: string) => {
                    try {
                        const sessionDirectory = getSessionDirectory(get().sessions, id);
                        const apiClient = opencodeClient.getApiClient();
                        const metadata = get().worktreeMetadata.get(id);
                        const overrideDirectory = metadata?.path ?? sessionDirectory;
                        const unshareRequest = async () => {
                            const directory = sessionDirectory ?? opencodeClient.getDirectory();
                            return apiClient.session.unshare({
                                path: { id },
                                query: directory ? { directory } : undefined,
                            });
                        };
                        const response = overrideDirectory
                            ? await opencodeClient.withDirectory(overrideDirectory, unshareRequest)
                            : await unshareRequest();

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
                        const mergedTime = metadata.time
                            ? { ...existingSession.time, ...metadata.time }
                            : existingSession.time;
                        const mergedSummary =
                            metadata.summary === undefined
                                ? existingSession.summary
                                : metadata.summary || undefined;
                        const mergedShare =
                            metadata.share === undefined
                                ? existingSession.share
                                : metadata.share || undefined;

                        const mergedSession: Session = {
                            ...existingSession,
                            ...metadata,
                            time: mergedTime,
                            summary: mergedSummary,
                            share: mergedShare,
                        };

                        const hasChanged =
                            mergedSession.title !== existingSession.title ||
                            mergedSession.parentID !== existingSession.parentID ||
                            mergedSession.directory !== existingSession.directory ||
                            mergedSession.version !== existingSession.version ||
                            mergedSession.projectID !== existingSession.projectID ||
                            JSON.stringify(mergedSession.time) !== JSON.stringify(existingSession.time) ||
                            JSON.stringify(mergedSession.summary ?? null) !== JSON.stringify(existingSession.summary ?? null) ||
                            JSON.stringify(mergedSession.share ?? null) !== JSON.stringify(existingSession.share ?? null);

                        const sessions = [...state.sessions];
                        sessions[index] = hasChanged ? mergedSession : existingSession;

                        return hasChanged ? ({ sessions } as Partial<SessionStore>) : state;
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

                initializeNewOpenChamberSession: (sessionId: string) => {
                    const { markSessionAsOpenChamberCreated } = get();

                    markSessionAsOpenChamberCreated(sessionId);

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

                },

                updateSession: (session: Session) => {
                    set((state) => ({
                        sessions: state.sessions.map((s) => (s.id === session.id ? session : s)),
                    }));
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
        availableWorktrees: state.availableWorktrees,
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

        const persistedAvailableWorktrees = Array.isArray(persistedState.availableWorktrees)
            ? (persistedState.availableWorktrees as WorktreeMetadata[])
            : currentState.availableWorktrees;

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
            availableWorktrees: persistedAvailableWorktrees,
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
