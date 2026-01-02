import type { Session, Message, Part } from "@opencode-ai/sdk";
import type { Permission, PermissionResponse } from "@/types/permission";

export interface AttachedFile {
    id: string;
    file: File;
    dataUrl: string;
    mimeType: string;
    filename: string;
    size: number;
    source: "local" | "server";
    serverPath?: string;
}

export type EditPermissionMode = 'allow' | 'ask' | 'deny' | 'full';

export type MessageStreamPhase = 'streaming' | 'cooldown' | 'completed';

export interface MessageStreamLifecycle {
    phase: MessageStreamPhase;
    startedAt: number;
    lastUpdateAt: number;
    completedAt?: number;
}

export interface SessionMemoryState {
    viewportAnchor: number;
    isStreaming: boolean;
    streamStartTime?: number;
    lastAccessedAt: number;
    backgroundMessageCount: number;
    isZombie?: boolean;
    totalAvailableMessages?: number;
    hasMoreAbove?: boolean;
    trimmedHeadMaxId?: string;
    streamingCooldownUntil?: number;
    /** Message ID of the user's active turn anchor (for scroll position preservation) */
    activeTurnAnchorId?: string;
    /** Height of the spacer below messages for active turn positioning */
    activeTurnSpacerHeight?: number;
}

export interface SessionContextUsage {
    totalTokens: number;
    percentage: number;
    contextLimit: number;
    outputLimit?: number;
    normalizedOutput?: number;
    thresholdLimit: number;
    lastMessageId?: string;
}

export const MEMORY_LIMITS = {
    MAX_SESSIONS: 3,
    VIEWPORT_MESSAGES: 120,
    STREAMING_BUFFER: Infinity,
    BACKGROUND_STREAMING_BUFFER: 120,
    ZOMBIE_TIMEOUT: 10 * 60 * 1000,
} as const;

export const ACTIVE_SESSION_WINDOW = 180;

export type NewSessionDraftState = {
    open: boolean;
    directoryOverride: string | null;
    parentID: string | null;
    title?: string;
};

export interface SessionStore {

    sessions: Session[];
    currentSessionId: string | null;
    lastLoadedDirectory: string | null;
    messages: Map<string, { info: Message; parts: Part[] }[]>;
    sessionMemoryState: Map<string, SessionMemoryState>;
    messageStreamStates: Map<string, MessageStreamLifecycle>;
    sessionCompactionUntil: Map<string, number>;
    permissions: Map<string, Permission[]>;
    sessionAbortFlags: Map<string, { timestamp: number; acknowledged: boolean }>;
    attachedFiles: AttachedFile[];
    abortPromptSessionId: string | null;
    abortPromptExpiresAt: number | null;
    isLoading: boolean;
    error: string | null;
    streamingMessageIds: Map<string, string | null>;
    abortControllers: Map<string, AbortController>;
    lastUsedProvider: { providerID: string; modelID: string } | null;
    isSyncing: boolean;

    sessionModelSelections: Map<string, { providerId: string; modelId: string }>;
    sessionAgentSelections: Map<string, string>;

    sessionAgentModelSelections: Map<string, Map<string, { providerId: string; modelId: string }>>;

    webUICreatedSessions: Set<string>;
    worktreeMetadata: Map<string, import('@/types/worktree').WorktreeMetadata>;
    availableWorktrees: import('@/types/worktree').WorktreeMetadata[];

    currentAgentContext: Map<string, string>;

    sessionContextUsage: Map<string, SessionContextUsage>;

    sessionAgentEditModes: Map<string, Map<string, EditPermissionMode>>;

    sessionActivityPhase?: Map<string, 'idle' | 'busy' | 'cooldown'>;

    userSummaryTitles: Map<string, { title: string; createdAt: number | null }>;

    pendingInputText: string | null;

    newSessionDraft: NewSessionDraftState;

    getSessionAgentEditMode: (sessionId: string, agentName: string | undefined, defaultMode?: EditPermissionMode) => EditPermissionMode;
    toggleSessionAgentEditMode: (sessionId: string, agentName: string | undefined, defaultMode?: EditPermissionMode) => void;
    setSessionAgentEditMode: (sessionId: string, agentName: string | undefined, mode: EditPermissionMode, defaultMode?: EditPermissionMode) => void;
    loadSessions: () => Promise<void>;

    openNewSessionDraft: (options?: { directoryOverride?: string | null; parentID?: string | null; title?: string }) => void;
    closeNewSessionDraft: () => void;

    createSession: (title?: string, directoryOverride?: string | null, parentID?: string | null) => Promise<Session | null>;
    createSessionFromAssistantMessage: (sourceMessageId: string) => Promise<void>;

    deleteSession: (id: string, options?: { archiveWorktree?: boolean; deleteRemoteBranch?: boolean; remoteName?: string }) => Promise<boolean>;
    deleteSessions: (ids: string[], options?: { archiveWorktree?: boolean; deleteRemoteBranch?: boolean; remoteName?: string; silent?: boolean }) => Promise<{ deletedIds: string[]; failedIds: string[] }>;
    updateSessionTitle: (id: string, title: string) => Promise<void>;
    shareSession: (id: string) => Promise<Session | null>;
    unshareSession: (id: string) => Promise<Session | null>;
    setCurrentSession: (id: string | null) => void;
    loadMessages: (sessionId: string) => Promise<void>;
    sendMessage: (content: string, providerID: string, modelID: string, agent?: string, attachments?: AttachedFile[], agentMentionName?: string, additionalParts?: Array<{ text: string; attachments?: AttachedFile[] }>) => Promise<void>;
    abortCurrentOperation: () => Promise<void>;
    acknowledgeSessionAbort: (sessionId: string) => void;
    armAbortPrompt: (durationMs?: number) => number | null;
    clearAbortPrompt: () => void;
    addStreamingPart: (sessionId: string, messageId: string, part: Part, role?: string) => void;
    completeStreamingMessage: (sessionId: string, messageId: string) => void;
    markMessageStreamSettled: (messageId: string) => void;
    updateMessageInfo: (sessionId: string, messageId: string, messageInfo: Message) => void;
    updateSessionCompaction: (sessionId: string, compactingTimestamp?: number | null) => void;
    addPermission: (permission: Permission) => void;
    respondToPermission: (sessionId: string, permissionId: string, response: PermissionResponse) => Promise<void>;
    clearError: () => void;
    getSessionsByDirectory: (directory: string) => Session[];
    getLastMessageModel: (sessionId: string) => { providerID?: string; modelID?: string } | null;
    getCurrentAgent: (sessionId: string) => string | undefined;
    syncMessages: (sessionId: string, messages: { info: Message; parts: Part[] }[]) => void;
    applySessionMetadata: (sessionId: string, metadata: Partial<Session>) => void;
    setSessionDirectory: (sessionId: string, directory: string | null) => void;

    addAttachedFile: (file: File) => Promise<void>;
    addServerFile: (path: string, name: string, content?: string) => Promise<void>;
    removeAttachedFile: (id: string) => void;
    clearAttachedFiles: () => void;

    updateViewportAnchor: (sessionId: string, anchor: number) => void;
    updateActiveTurnAnchor: (sessionId: string, anchorId: string | null, spacerHeight: number) => void;
    getActiveTurnAnchor: (sessionId: string) => { anchorId: string | null; spacerHeight: number } | null;
    trimToViewportWindow: (sessionId: string, targetSize?: number) => void;
    evictLeastRecentlyUsed: () => void;
    loadMoreMessages: (sessionId: string, direction: "up" | "down") => Promise<void>;

    saveSessionModelSelection: (sessionId: string, providerId: string, modelId: string) => void;
    getSessionModelSelection: (sessionId: string) => { providerId: string; modelId: string } | null;
    saveSessionAgentSelection: (sessionId: string, agentName: string) => void;
    getSessionAgentSelection: (sessionId: string) => string | null;

    saveAgentModelForSession: (sessionId: string, agentName: string, providerId: string, modelId: string) => void;
    getAgentModelForSession: (sessionId: string, agentName: string) => { providerId: string; modelId: string } | null;

    analyzeAndSaveExternalSessionChoices: (sessionId: string, agents: Array<{ name: string; [key: string]: unknown }>) => Promise<Map<string, { providerId: string; modelId: string; timestamp: number }>>;

    isOpenChamberCreatedSession: (sessionId: string) => boolean;

    markSessionAsOpenChamberCreated: (sessionId: string) => void;

    initializeNewOpenChamberSession: (sessionId: string, agents: Array<{ name: string; [key: string]: unknown }>) => void;

    setWorktreeMetadata: (sessionId: string, metadata: import('@/types/worktree').WorktreeMetadata | null) => void;
    getWorktreeMetadata: (sessionId: string) => import('@/types/worktree').WorktreeMetadata | undefined;

    getContextUsage: (contextLimit: number, outputLimit: number) => SessionContextUsage | null;

    updateSessionContextUsage: (sessionId: string, contextLimit: number, outputLimit: number) => void;

    initializeSessionContextUsage: (sessionId: string, contextLimit: number, outputLimit: number) => void;

     debugSessionMessages: (sessionId: string) => Promise<void>;

     pollForTokenUpdates: (sessionId: string, messageId: string, maxAttempts?: number) => void;
     updateSession: (session: Session) => void;

     revertToMessage: (sessionId: string, messageId: string) => Promise<void>;
     handleSlashUndo: (sessionId: string) => Promise<void>;
     handleSlashRedo: (sessionId: string) => Promise<void>;
     forkFromMessage: (sessionId: string, messageId: string) => Promise<void>;
     setPendingInputText: (text: string | null) => void;
     consumePendingInputText: () => string | null;
 }
