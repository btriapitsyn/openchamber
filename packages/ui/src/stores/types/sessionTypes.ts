import type { Session, Message, Part } from "@opencode-ai/sdk/v2";
import type { PermissionRequest, PermissionResponse } from "@/types/permission";
import type { QuestionRequest } from "@/types/question";

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
    lastUserMessageAt?: number; // Timestamp when user last sent a message
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

// Default memory limits (can be overridden via settings)
export const DEFAULT_MEMORY_LIMITS = {
    MAX_SESSIONS: 3,
    VIEWPORT_MESSAGES: 120,
    HISTORICAL_MESSAGES: 90,
    FETCH_BUFFER: 20,
    STREAMING_BUFFER: Infinity,
    BACKGROUND_STREAMING_BUFFER: 120,
    ZOMBIE_TIMEOUT: 10 * 60 * 1000,
} as const;

export const DEFAULT_ACTIVE_SESSION_WINDOW = 180;

// Dynamic memory limits accessor - reads directly from UI store.
// NOTE: do not use require() here (breaks in browser/desktop runtime bundles).
import { useUIStore } from "../useUIStore";

export const getMemoryLimits = () => {
    const state = useUIStore.getState?.();
    if (!state) {
        return DEFAULT_MEMORY_LIMITS;
    }
    return {
        ...DEFAULT_MEMORY_LIMITS,
        HISTORICAL_MESSAGES: state.memoryLimitHistorical ?? DEFAULT_MEMORY_LIMITS.HISTORICAL_MESSAGES,
        VIEWPORT_MESSAGES: state.memoryLimitViewport ?? DEFAULT_MEMORY_LIMITS.VIEWPORT_MESSAGES,
    };
};

export const getActiveSessionWindow = () => {
    const state = useUIStore.getState?.();
    if (!state) {
        return DEFAULT_ACTIVE_SESSION_WINDOW;
    }
    return state.memoryLimitActiveSession ?? DEFAULT_ACTIVE_SESSION_WINDOW;
};

// Legacy exports for backward compatibility (use getMemoryLimits() for dynamic values)
export const MEMORY_LIMITS = DEFAULT_MEMORY_LIMITS;
export const ACTIVE_SESSION_WINDOW = DEFAULT_ACTIVE_SESSION_WINDOW;

/** Synthetic context parts to attach when sending initial message */
export interface SyntheticContextPart {
    text: string;
    synthetic: true;
}

export type NewSessionDraftState = {
    open: boolean;
    directoryOverride: string | null;
    parentID: string | null;
    title?: string;
    initialPrompt?: string;
    /** Synthetic context parts to include with the initial message */
    syntheticParts?: SyntheticContextPart[];
};

export interface SessionStore {

    sessions: Session[];
    sessionsByDirectory: Map<string, Session[]>;
    currentSessionId: string | null;
    lastLoadedDirectory: string | null;
    messages: Map<string, { info: Message; parts: Part[] }[]>;
    sessionMemoryState: Map<string, SessionMemoryState>;
    messageStreamStates: Map<string, MessageStreamLifecycle>;
    sessionCompactionUntil: Map<string, number>;
    permissions: Map<string, PermissionRequest[]>;
    questions: Map<string, QuestionRequest[]>;
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
    availableWorktreesByProject: Map<string, import('@/types/worktree').WorktreeMetadata[]>;

    currentAgentContext: Map<string, string>;

    sessionContextUsage: Map<string, SessionContextUsage>;

    sessionAgentEditModes: Map<string, Map<string, EditPermissionMode>>;

    // Server-owned session status (mirrors OpenCode SessionStatus: busy|retry|idle).
    // Use as the single source of truth for "assistant working" UI.
    // confirmedAt: timestamp when idle was confirmed locally (prevents race with server polling)
    sessionStatus?: Map<
        string,
        { type: 'idle' | 'busy' | 'retry'; attempt?: number; message?: string; next?: number; confirmedAt?: number }
    >;

    // Server-authoritative session attention state
    // Tracks which sessions need user attention based on server-side logic
    sessionAttentionStates: Map<string, {
        needsAttention: boolean;
        lastUserMessageAt: number | null;
        lastStatusChangeAt: number;
        status: 'idle' | 'busy' | 'retry';
        isViewed: boolean;
    }>;

    userSummaryTitles: Map<string, { title: string; createdAt: number | null }>;

    pendingInputText: string | null;
    pendingInputMode: 'replace' | 'append';
    /** Synthetic context parts to include with the next message sent */
    pendingSyntheticParts: SyntheticContextPart[] | null;

    newSessionDraft: NewSessionDraftState;

    getSessionAgentEditMode: (sessionId: string, agentName: string | undefined, defaultMode?: EditPermissionMode) => EditPermissionMode;
    toggleSessionAgentEditMode: (sessionId: string, agentName: string | undefined, defaultMode?: EditPermissionMode) => void;
    setSessionAgentEditMode: (sessionId: string, agentName: string | undefined, mode: EditPermissionMode, defaultMode?: EditPermissionMode) => void;
    loadSessions: () => Promise<void>;

    openNewSessionDraft: (options?: { directoryOverride?: string | null; parentID?: string | null; title?: string; initialPrompt?: string; syntheticParts?: SyntheticContextPart[] }) => void;
    closeNewSessionDraft: () => void;

    createSession: (title?: string, directoryOverride?: string | null, parentID?: string | null) => Promise<Session | null>;
    createSessionFromAssistantMessage: (sourceMessageId: string) => Promise<void>;

    deleteSession: (id: string, options?: { archiveWorktree?: boolean; deleteRemoteBranch?: boolean; remoteName?: string }) => Promise<boolean>;
    deleteSessions: (ids: string[], options?: { archiveWorktree?: boolean; deleteRemoteBranch?: boolean; remoteName?: string; silent?: boolean }) => Promise<{ deletedIds: string[]; failedIds: string[] }>;
    updateSessionTitle: (id: string, title: string) => Promise<void>;
    shareSession: (id: string) => Promise<Session | null>;
    unshareSession: (id: string) => Promise<Session | null>;
    setCurrentSession: (id: string | null) => void;
    loadMessages: (sessionId: string, limit?: number) => Promise<void>;
    sendMessage: (content: string, providerID: string, modelID: string, agent?: string, attachments?: AttachedFile[], agentMentionName?: string, additionalParts?: Array<{ text: string; attachments?: AttachedFile[]; synthetic?: boolean }>, variant?: string) => Promise<void>;
    abortCurrentOperation: () => Promise<void>;
    acknowledgeSessionAbort: (sessionId: string) => void;
    armAbortPrompt: (durationMs?: number) => number | null;
    clearAbortPrompt: () => void;
    addStreamingPart: (sessionId: string, messageId: string, part: Part, role?: string) => void;
    completeStreamingMessage: (sessionId: string, messageId: string) => void;
    markMessageStreamSettled: (messageId: string) => void;
    updateMessageInfo: (sessionId: string, messageId: string, messageInfo: Message) => void;
    updateSessionCompaction: (sessionId: string, compactingTimestamp?: number | null) => void;
    addPermission: (permission: PermissionRequest) => void;
    respondToPermission: (sessionId: string, requestId: string, response: PermissionResponse) => Promise<void>;

    addQuestion: (question: QuestionRequest) => void;
    dismissQuestion: (sessionId: string, requestId: string) => void;
    respondToQuestion: (sessionId: string, requestId: string, answers: string[] | string[][]) => Promise<void>;
    rejectQuestion: (sessionId: string, requestId: string) => Promise<void>;

    clearError: () => void;
    getSessionsByDirectory: (directory: string) => Session[];
    getDirectoryForSession: (sessionId: string) => string | null;
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
    trimToViewportWindow: (sessionId: string, targetSize?: number) => void;
    evictLeastRecentlyUsed: () => void;
    loadMoreMessages: (sessionId: string, direction: "up" | "down") => Promise<void>;

    saveSessionModelSelection: (sessionId: string, providerId: string, modelId: string) => void;
    getSessionModelSelection: (sessionId: string) => { providerId: string; modelId: string } | null;
    saveSessionAgentSelection: (sessionId: string, agentName: string) => void;
    getSessionAgentSelection: (sessionId: string) => string | null;

    saveAgentModelForSession: (sessionId: string, agentName: string, providerId: string, modelId: string) => void;
    getAgentModelForSession: (sessionId: string, agentName: string) => { providerId: string; modelId: string } | null;

    saveAgentModelVariantForSession: (sessionId: string, agentName: string, providerId: string, modelId: string, variant: string | undefined) => void;
    getAgentModelVariantForSession: (sessionId: string, agentName: string, providerId: string, modelId: string) => string | undefined;
 
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
     removeSessionFromStore: (sessionId: string) => void;

      revertToMessage: (sessionId: string, messageId: string) => Promise<void>;
      handleSlashUndo: (sessionId: string) => Promise<void>;
      handleSlashRedo: (sessionId: string) => Promise<void>;
      forkFromMessage: (sessionId: string, messageId: string) => Promise<void>;
      setPendingInputText: (text: string | null, mode?: 'replace' | 'append') => void;
      consumePendingInputText: () => { text: string; mode: 'replace' | 'append' } | null;
      setPendingSyntheticParts: (parts: SyntheticContextPart[] | null) => void;
     consumePendingSyntheticParts: () => SyntheticContextPart[] | null;
   }
