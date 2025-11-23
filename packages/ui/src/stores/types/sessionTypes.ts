import type { Session, Message, Part } from "@opencode-ai/sdk";
import type { Permission, PermissionResponse } from "@/types/permission";

// Type for attached files in the UI
export interface AttachedFile {
    id: string;
    file: File;
    dataUrl: string;
    mimeType: string;
    filename: string;
    size: number;
    source: "local" | "server"; // Track where file came from
    serverPath?: string; // Path on server for server files
}

export type EditPermissionMode = 'allow' | 'ask' | 'deny' | 'full';

export type MessageStreamPhase = 'streaming' | 'cooldown' | 'completed';

export interface MessageStreamLifecycle {
    phase: MessageStreamPhase;
    startedAt: number;
    lastUpdateAt: number;
    completedAt?: number;
}

// Session memory state for tracking
export interface SessionMemoryState {
    viewportAnchor: number; // Index of message at viewport center
    isStreaming: boolean;
    streamStartTime?: number;
    lastAccessedAt: number; // For LRU tracking
    backgroundMessageCount: number; // New messages while session in background
    isZombie?: boolean; // Timeout protection flag
    totalAvailableMessages?: number; // Total messages available on server
    hasMoreAbove?: boolean; // Can load more messages by scrolling up
    trimmedHeadMaxId?: string; // Highest (newest) ID that was trimmed from the head
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

// Memory management configuration
export const MEMORY_LIMITS = {
    MAX_SESSIONS: 2, // LRU cache for sessions
    VIEWPORT_MESSAGES: 60, // Messages around viewport during normal state
    STREAMING_BUFFER: Infinity, // No limit during active streaming
    BACKGROUND_STREAMING_BUFFER: 100, // Limit for background sessions
    ZOMBIE_TIMEOUT: 10 * 60 * 1000, // 10 minutes zombie stream protection
} as const;

export const ACTIVE_SESSION_WINDOW = 120; // Soft-trim window for actively viewed sessions

export interface SessionStore {
    // State
    sessions: Session[];
    currentSessionId: string | null;
    lastLoadedDirectory: string | null;
    messages: Map<string, { info: Message; parts: Part[] }[]>;
    sessionMemoryState: Map<string, SessionMemoryState>; // Track memory state per session
    messageStreamStates: Map<string, MessageStreamLifecycle>;
    sessionCompactionUntil: Map<string, number>;
    permissions: Map<string, Permission[]>; // sessionId -> permissions
    sessionAbortFlags: Map<string, { timestamp: number; acknowledged: boolean }>;
    attachedFiles: AttachedFile[]; // Files attached to current message
    abortPromptSessionId: string | null;
    abortPromptExpiresAt: number | null;
    isLoading: boolean;
    error: string | null;
    streamingMessageId: string | null;
    abortController: AbortController | null;
    lastUsedProvider: { providerID: string; modelID: string } | null; // Track last used provider/model
    isSyncing: boolean; // Track when messages are being synced from external source
    pendingUserMessageIds: Set<string>; // Track locally optimistically rendered user messages

    // Session-specific model/agent persistence
    sessionModelSelections: Map<string, { providerId: string; modelId: string }>; // sessionId -> last model (for backward compat)
    sessionAgentSelections: Map<string, string>; // sessionId -> agentName
    // Agent-specific model selections within sessions
    sessionAgentModelSelections: Map<string, Map<string, { providerId: string; modelId: string }>>; // sessionId -> agentName -> model
    // Track OpenChamber-created sessions for proper initialization
    webUICreatedSessions: Set<string>; // sessionIds created by OpenChamber
    worktreeMetadata: Map<string, import('@/types/worktree').WorktreeMetadata>;
    availableWorktrees: import('@/types/worktree').WorktreeMetadata[];
    // Track current agent context for each session (for TUI message analysis)
    currentAgentContext: Map<string, string>; // sessionId -> current agent name
    // Store context usage per session (updated only when messages are complete)
    sessionContextUsage: Map<string, SessionContextUsage>; // sessionId -> context usage
    // Track edit permission overrides per session/agent
    sessionAgentEditModes: Map<string, Map<string, EditPermissionMode>>;

    // Actions
    getSessionAgentEditMode: (sessionId: string, agentName: string | undefined, defaultMode?: EditPermissionMode) => EditPermissionMode;
    toggleSessionAgentEditMode: (sessionId: string, agentName: string | undefined, defaultMode?: EditPermissionMode) => void;
    setSessionAgentEditMode: (sessionId: string, agentName: string | undefined, mode: EditPermissionMode, defaultMode?: EditPermissionMode) => void;
    loadSessions: () => Promise<void>;
    createSession: (title?: string, directoryOverride?: string | null) => Promise<Session | null>;

    deleteSession: (id: string, options?: { archiveWorktree?: boolean; deleteRemoteBranch?: boolean; remoteName?: string }) => Promise<boolean>;
    deleteSessions: (ids: string[], options?: { archiveWorktree?: boolean; deleteRemoteBranch?: boolean; remoteName?: string }) => Promise<{ deletedIds: string[]; failedIds: string[] }>;
    updateSessionTitle: (id: string, title: string) => Promise<void>;
    shareSession: (id: string) => Promise<Session | null>;
    unshareSession: (id: string) => Promise<Session | null>;
    setCurrentSession: (id: string | null) => void;
    loadMessages: (sessionId: string) => Promise<void>;
    sendMessage: (content: string, providerID: string, modelID: string, agent?: string, attachments?: AttachedFile[]) => Promise<void>;
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

    // File attachment actions
    addAttachedFile: (file: File) => Promise<void>;
    addServerFile: (path: string, name: string, content?: string) => Promise<void>;
    removeAttachedFile: (id: string) => void;
    clearAttachedFiles: () => void;

    // Memory management actions
    updateViewportAnchor: (sessionId: string, anchor: number) => void;
    trimToViewportWindow: (sessionId: string, targetSize?: number) => void;
    evictLeastRecentlyUsed: () => void;
    loadMoreMessages: (sessionId: string, direction: "up" | "down") => Promise<void>;

    // Session-specific model/agent persistence
    saveSessionModelSelection: (sessionId: string, providerId: string, modelId: string) => void;
    getSessionModelSelection: (sessionId: string) => { providerId: string; modelId: string } | null;
    saveSessionAgentSelection: (sessionId: string, agentName: string) => void;
    getSessionAgentSelection: (sessionId: string) => string | null;
    // Agent-specific model persistence within sessions
    saveAgentModelForSession: (sessionId: string, agentName: string, providerId: string, modelId: string) => void;
    getAgentModelForSession: (sessionId: string, agentName: string) => { providerId: string; modelId: string } | null;
    // External session analysis with immediate UI update
    analyzeAndSaveExternalSessionChoices: (sessionId: string, agents: Array<{ name: string; [key: string]: unknown }>) => Promise<Map<string, { providerId: string; modelId: string; timestamp: number }>>;
    // Check if session was created by OpenChamber or external (TUI/API)
    isOpenChamberCreatedSession: (sessionId: string) => boolean;
    // Mark session as OpenChamber created
    markSessionAsOpenChamberCreated: (sessionId: string) => void;
    // New OpenChamber session initialization
    initializeNewOpenChamberSession: (sessionId: string, agents: Array<{ name: string; [key: string]: unknown }>) => void;
    // Manage worktree metadata associated with sessions
    setWorktreeMetadata: (sessionId: string, metadata: import('@/types/worktree').WorktreeMetadata | null) => void;
    getWorktreeMetadata: (sessionId: string) => import('@/types/worktree').WorktreeMetadata | undefined;
    // Get context usage for current session
    getContextUsage: (contextLimit: number, outputLimit: number) => SessionContextUsage | null;
    // Update stored context usage for a session
    updateSessionContextUsage: (sessionId: string, contextLimit: number, outputLimit: number) => void;
    // Initialize context usage for a session if not stored or 0
    initializeSessionContextUsage: (sessionId: string, contextLimit: number, outputLimit: number) => void;
     // Debug method to inspect messages for a specific session
     debugSessionMessages: (sessionId: string) => Promise<void>;
     // Poll for token updates in a message (handles async token population)
     pollForTokenUpdates: (sessionId: string, messageId: string, maxAttempts?: number) => void;
     // Remove a pending user message marker once confirmed by server
     clearPendingUserMessage: (messageId: string) => void;
    updateSession: (session: Session) => void;
}
