import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { z } from 'zod';
import type { Event } from '@opencode-ai/sdk/v2';
import { createInputHistoryIdentity, createInputHistorySubmission, useInputHistoryStore } from './useInputHistoryStore';
import { createDeferredSafeJSONStorage } from './utils/safeStorage';
import type { AttachedFile } from './types/sessionTypes';
import { contextPartMetadataSchema, type ContextPartMetadata } from '@/lib/messages/contextParts';
import { updateDesktopSettings } from '@/lib/persistence';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { isVSCodeRuntime } from '@/lib/desktop';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { canonicalizePathIdentity, normalizePath } from '@/lib/pathNormalization';

export type FollowUpBehavior = 'steer' | 'queue';

const DEFAULT_FOLLOW_UP_BEHAVIOR: FollowUpBehavior = 'queue';

export const isFollowUpBehavior = (value: unknown): value is FollowUpBehavior => (
    value === 'steer' || value === 'queue'
);

export const normalizeFollowUpBehavior = (
    value: unknown,
    legacyQueueModeEnabled?: boolean | null,
): FollowUpBehavior => {
    // Follow-up delivery is queue-only. Keep accepting the old persisted
    // values at the boundary so legacy settings cannot re-enable steer.
    void value;
    void legacyQueueModeEnabled;
    return DEFAULT_FOLLOW_UP_BEHAVIOR;
};

type MainSessionSendIntent = 'composer' | 'queued';
type MainSessionSendDisposition = 'send' | 'queue' | 'preserve-queued';

export type MessageQueueDispatchState = {
    head: QueuedMessage | null;
    sendingIds: string[];
};

export const resolveMainSessionSendDisposition = (input: {
    intent: MainSessionSendIntent;
    hasMainSession: boolean;
    isBtwActive: boolean;
    isBusy: boolean;
    canQueue: boolean;
    hasQueuedMessageInFlight?: boolean;
}): MainSessionSendDisposition => {
    if (!input.hasMainSession || input.isBtwActive) return 'send';
    if (input.hasQueuedMessageInFlight) {
        if (input.intent === 'queued' || !input.canQueue) return 'preserve-queued';
        return 'queue';
    }
    if (!input.isBusy || !input.canQueue) return 'send';
    return input.intent === 'queued' ? 'preserve-queued' : 'queue';
};

/**
 * Who delivers the queue. Web, desktop, and mobile talk to an OpenChamber
 * server that owns the queue and sends it whether or not any UI is open. VS
 * Code has no server of its own, so the extension UI keeps the local queue
 * and the foreground auto-send hook.
 */
export const isServerOwnedMessageQueue = (): boolean => !isVSCodeRuntime();

export interface QueuedMessageSendConfig {
    providerID: string;
    modelID: string;
    agent?: string;
    variant?: string;
}

/**
 * Context captured with a queued message: whatever the composer had attached
 * when the message was queued. It leaves the composer with the message, so
 * delivery (by the server, or by the auto-send hook in VS Code) carries it and
 * editing the message brings it back.
 */
export type QueuedContextPart =
    | {
        /** An attached context item: a draft chip or a linked issue/PR. Restored on edit. */
        kind: 'context';
        text: string;
        metadata: ContextPartMetadata;
        /** Delivered as its own synthetic part right before this one (a linked PR's reading instructions). */
        instructions?: string;
    }
    | {
        /** Derived from the message text (the skill instruction); re-derived when the text is sent again, so never restored. */
        kind: 'instruction';
        text: string;
    }
    | {
        /** Handed to the composer by another surface (conflict resolution); restored as pending on edit. */
        kind: 'synthetic';
        text: string;
    };

export interface QueuedMessage {
    id: string;
    /** What the user typed, for display and editing. */
    content: string;
    /** What is delivered: `content` without its leading agent mention, file mentions already resolved. */
    text: string;
    /** Agent mentioned at the start of `content`, delivered as an agent part. */
    agentMention?: string;
    attachments?: AttachedFile[];
    /** Legacy local-queue context shape retained for migration/compatibility. */
    additionalParts?: QueuedMessagePart[];
    capturedContext?: QueuedMessagePart[];
    contextClaimed?: boolean;
    /** Absent on a server projection item; a take brings it back. */
    context?: QueuedContextPart[];
    createdAt: number;
    /** Send config captured at queue time — used as-is when auto-sending */
    sendConfig?: QueuedMessageSendConfig;
}

export type QueuedMessagePart = {
    text: string;
    attachments?: AttachedFile[];
    synthetic?: boolean;
    metadata?: ContextPartMetadata;
};

interface QueuedMessageInput {
    content: string;
    /** Defaults to `content`. */
    text?: string;
    agentMention?: string;
    attachments?: AttachedFile[];
    additionalParts?: QueuedMessagePart[];
    capturedContext?: QueuedMessagePart[];
    contextClaimed?: boolean;
    context?: QueuedContextPart[];
    sendConfig?: QueuedMessageSendConfig;
}

export type MessageQueueTarget = {
    runtimeKey: string;
    directory: string;
    sessionId: string;
};

const MAX_QUEUE_TARGETS = 50;
const MAX_MESSAGES_PER_QUEUE = 20;

export const createMessageQueueTarget = (
    sessionId: string,
    directory: string | null | undefined,
    runtimeKey: string = getRuntimeKey(),
): MessageQueueTarget | null => {
    const normalizedDirectory = normalizePath(directory);
    if (!runtimeKey || !normalizedDirectory || !sessionId) return null;
    return { runtimeKey, directory: normalizedDirectory, sessionId };
};

export const getMessageQueueDirectoryKey = (target: MessageQueueTarget): string =>
    `${target.runtimeKey}\n${canonicalizePathIdentity(target.directory) ?? target.directory}`;

export const getMessageQueueKey = (target: MessageQueueTarget): string =>
    `${getMessageQueueDirectoryKey(target)}\n${target.sessionId}`;

export const isQueueMessageDispatchable = (
    queue: QueuedMessage[],
    sendingIds: string[],
    messageId: string,
): boolean => sendingIds.length === 0 && queue[0]?.id === messageId;

export const isQueueMessageInFlight = (sendingIds: string[], messageId: string): boolean =>
    sendingIds.includes(messageId);

export const parseMessageQueueKey = (key: string): MessageQueueTarget | null => {
    const parts = key.split('\n');
    if (parts.length !== 3) return null;
    const [runtimeKey, directory, sessionId] = parts;
    return createMessageQueueTarget(sessionId, directory, runtimeKey);
};

// ---------------------------------------------------------------------------
// Server contract (packages/web/server/lib/message-queue)
// ---------------------------------------------------------------------------

const serverSendConfigSchema = z.object({
    providerID: z.string().min(1),
    modelID: z.string().min(1),
    agent: z.string().optional(),
    variant: z.string().optional(),
});

const serverAttachmentSchema = z.object({
    id: z.string(),
    filename: z.string(),
    mimeType: z.string(),
    size: z.number(),
    source: z.enum(['local', 'server', 'vscode']),
    serverPath: z.string().optional(),
    /** Present only on a taken item; broadcasts and snapshots omit payloads. */
    dataUrl: z.string().optional(),
});

const serverContextPartSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('context'),
        text: z.string(),
        metadata: contextPartMetadataSchema,
        instructions: z.string().optional(),
    }),
    z.object({ kind: z.literal('instruction'), text: z.string() }),
    z.object({ kind: z.literal('synthetic'), text: z.string() }),
]);

const serverItemSchema = z.object({
    id: z.string().min(1),
    createdAt: z.number(),
    content: z.string(),
    text: z.string(),
    agentMention: z.string().optional(),
    attachments: z.array(serverAttachmentSchema),
    /** Present only on a taken item; broadcasts and snapshots omit it like attachment payloads. */
    context: z.array(serverContextPartSchema).optional(),
    sendConfig: serverSendConfigSchema,
});

const serverSessionSchema = z.object({
    sessionId: z.string().min(1),
    directory: z.string(),
    items: z.array(serverItemSchema),
    sendingId: z.string().nullable(),
});

const serverSnapshotSchema = z.object({
    revision: z.number(),
    sessions: z.array(serverSessionSchema),
});

const serverSessionResponseSchema = z.object({
    revision: z.number(),
    session: serverSessionSchema,
});

const serverEnqueueResponseSchema = serverSessionResponseSchema.extend({
    itemId: z.string().min(1).optional(),
});

const serverTakeResponseSchema = serverSessionResponseSchema.extend({ item: serverItemSchema });
const serverTakeAllResponseSchema = serverSessionResponseSchema.extend({ items: z.array(serverItemSchema) });

type ServerQueueSession = z.infer<typeof serverSessionSchema>;
type ServerQueueItem = z.infer<typeof serverItemSchema>;
type ServerQueueAttachment = z.infer<typeof serverAttachmentSchema>;

const decodeDataUrl = (dataUrl: string): ArrayBuffer | null => {
    const commaIndex = dataUrl.indexOf(',');
    if (!dataUrl.startsWith('data:') || commaIndex === -1) return null;
    const meta = dataUrl.slice(5, commaIndex);
    const payload = dataUrl.slice(commaIndex + 1);
    try {
        if (meta.endsWith(';base64')) {
            const binary = atob(payload);
            const buffer = new ArrayBuffer(binary.length);
            const bytes = new Uint8Array(buffer);
            for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
            return buffer;
        }
        const encoded = new TextEncoder().encode(decodeURIComponent(payload));
        const buffer = new ArrayBuffer(encoded.byteLength);
        new Uint8Array(buffer).set(encoded);
        return buffer;
    } catch {
        return null;
    }
};

/** A taken item carries its payload; a projection item has an empty file. */
const toAttachedFile = (attachment: ServerQueueAttachment): AttachedFile => {
    const dataUrl = attachment.dataUrl ?? '';
    const bytes = dataUrl ? decodeDataUrl(dataUrl) : null;
    const file: AttachedFile = {
        id: attachment.id,
        file: new File(bytes ? [bytes] : [], attachment.filename, { type: attachment.mimeType }),
        dataUrl,
        mimeType: attachment.mimeType,
        filename: attachment.filename,
        size: attachment.size,
        source: attachment.source,
    };
    if (attachment.serverPath) file.serverPath = attachment.serverPath;
    return file;
};

const toQueuedMessage = (item: ServerQueueItem): QueuedMessage => {
    const message: QueuedMessage = {
        id: item.id,
        content: item.content,
        text: item.text,
        createdAt: item.createdAt,
        sendConfig: { ...item.sendConfig },
    };
    if (item.agentMention) message.agentMention = item.agentMention;
    if (item.attachments.length > 0) message.attachments = item.attachments.map(toAttachedFile);
    if (item.context) message.context = item.context;
    return message;
};

type ServerQueueAttachmentInput = Omit<ServerQueueAttachment, 'dataUrl'> & { dataUrl: string };

type ServerQueueItemInput = {
    content: string;
    text: string;
    agentMention?: string;
    attachments: ServerQueueAttachmentInput[];
    context: QueuedContextPart[];
    sendConfig: QueuedMessageSendConfig;
};

type ServerQueueRequestBody =
    | { directory: string; item: ServerQueueItemInput }
    | { itemIds: string[] }
    | { held: boolean };

const toServerAttachment = (attachment: AttachedFile): ServerQueueAttachmentInput => {
    const input: ServerQueueAttachmentInput = {
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        source: attachment.source,
        dataUrl: attachment.dataUrl,
    };
    if (attachment.serverPath) input.serverPath = attachment.serverPath;
    return input;
};

const toServerItemInput = (message: QueuedMessageInput, sendConfig: QueuedMessageSendConfig): ServerQueueItemInput => {
    const item: ServerQueueItemInput = {
        content: message.content,
        text: message.text ?? message.content,
        attachments: (message.attachments ?? []).filter((file) => Boolean(file.dataUrl)).map(toServerAttachment),
        context: message.context ?? [],
        sendConfig,
    };
    if (message.agentMention) item.agentMention = message.agentMention;
    return item;
};

const requestJson = async <T,>(schema: z.ZodType<T>, path: string, init?: RequestInit): Promise<T> => {
    const response = await runtimeFetch(path, init);
    if (!response.ok) {
        const error: Error & { status?: number } = new Error(`Message queue request failed (${response.status})`);
        error.status = response.status;
        throw error;
    }
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new Error('Invalid message queue response');
    return parsed.data;
};

const jsonInit = (method: string, body?: ServerQueueRequestBody): RequestInit => {
    if (body === undefined) return { method };
    return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
};

const sessionPath = (sessionId: string) => `/api/message-queue/sessions/${encodeURIComponent(sessionId)}`;

/** Older queue servers did not return the accepted id; only use an unambiguous response match as a fallback. */
const findAcceptedQueueItemId = (
    session: ServerQueueSession,
    message: QueuedMessageInput,
    sendConfig: QueuedMessageSendConfig,
): string | undefined => {
    const expectedText = message.text ?? message.content;
    const matches = session.items.filter((item) => (
        item.content === message.content
        && item.text === expectedText
        && item.agentMention === message.agentMention
        && item.sendConfig.providerID === sendConfig.providerID
        && item.sendConfig.modelID === sendConfig.modelID
        && item.sendConfig.agent === sendConfig.agent
        && item.sendConfig.variant === sendConfig.variant
    ));
    return matches.length === 1 ? matches[0]?.id : undefined;
};

/**
 * Runtime keys whose queue the server owns, established by a successful
 * hydration. Their entries are a projection and must not be persisted: a
 * stale local copy would resurrect messages the server already delivered.
 */
const serverOwnedRuntimeKeys = new Set<string>();

/** Server revision last applied per queue key; older snapshots are ignored. */
const appliedRevisions = new Map<string, number>();
let hydrationGeneration = 0;

type PendingServerEnqueue = {
    target: MessageQueueTarget;
    removed: boolean;
};

/**
 * The server deliberately omits context from queue projections. Keep the
 * context captured by this window beside the projection so explicit removal
 * can still restore it without fetching a second, potentially stale item.
 */
const localQueueContexts = new Map<string, Map<string, QueuedContextPart[]>>();
const pendingServerEnqueues = new Map<string, PendingServerEnqueue>();

const queueItemEphemeralKey = (queueKey: string, messageId: string): string => JSON.stringify([queueKey, messageId]);

const setLocalQueueContext = (queueKey: string, messageId: string, context: QueuedContextPart[]): void => {
    const contexts = localQueueContexts.get(queueKey) ?? new Map<string, QueuedContextPart[]>();
    contexts.set(messageId, context);
    localQueueContexts.set(queueKey, contexts);
};

const getLocalQueueContext = (queueKey: string, messageId: string): QueuedContextPart[] | undefined =>
    localQueueContexts.get(queueKey)?.get(messageId);

const deleteLocalQueueContext = (queueKey: string, messageId: string): void => {
    const contexts = localQueueContexts.get(queueKey);
    if (!contexts) return;
    contexts.delete(messageId);
    if (contexts.size === 0) localQueueContexts.delete(queueKey);
};

const moveLocalQueueContext = (queueKey: string, fromId: string, toId: string): void => {
    const context = getLocalQueueContext(queueKey, fromId);
    deleteLocalQueueContext(queueKey, fromId);
    if (context && toId !== fromId) setLocalQueueContext(queueKey, toId, context);
};

const reconcileLocalQueueContexts = (queueKey: string, items: readonly ServerQueueItem[]): void => {
    const contexts = localQueueContexts.get(queueKey);
    if (!contexts) return;
    const serverIds = new Set(items.map((item) => item.id));
    for (const messageId of contexts.keys()) {
        if (!serverIds.has(messageId)) contexts.delete(messageId);
    }
    if (contexts.size === 0) localQueueContexts.delete(queueKey);
};

const clearLocalQueueContexts = (queueKey: string): void => {
    localQueueContexts.delete(queueKey);
};

const markPendingServerEnqueueRemoved = (queueKey: string, messageId: string): boolean => {
    const pending = pendingServerEnqueues.get(queueItemEphemeralKey(queueKey, messageId));
    if (!pending) return false;
    pending.removed = true;
    return true;
};

const markPendingServerEnqueuesRemoved = (queueKey: string): void => {
    for (const pending of pendingServerEnqueues.values()) {
        if (getMessageQueueKey(pending.target) === queueKey) pending.removed = true;
    }
};

interface MessageQueueState {
    queuedMessages: Record<string, QueuedMessage[]>; // runtime + directory + session → queue
    quarantinedLegacyMessages: Record<string, QueuedMessage[]>;
    followUpBehavior: FollowUpBehavior;
    /** Invalidates rollback/context restoration after session deletion. */
    queueDeletionGenerations: Record<string, number>;
    /**
     * Queued messages whose send is currently awaiting the server, per target.
     *
     * A queued item is removed only after its send resolves, so between
     * dispatch and resolution it is still visible to every other reader — and
     * a composer submit merges the whole queue into its own send. Over a relay
     * that window is seconds, long enough for the same message to be delivered
     * twice. Dispatchers must skip entries listed here.
     *
     * Never persisted: a restart has no in-flight sends, and a stale flag would
     * strand a queued message permanently. With a server-owned queue this
     * mirrors the server's in-flight item.
     */
    sendingIds: Record<string, string[]>;
}

interface MessageQueueActions {
    addToQueue: (target: MessageQueueTarget, message: QueuedMessageInput) => Promise<void>;
    removeFromQueue: (target: MessageQueueTarget, messageId: string) => QueuedMessage | null;
    reorderQueue: (target: MessageQueueTarget, fromId: string, toId: string) => void;
    /** Removes the message and returns it in full, attachments included. */
    popToInput: (target: MessageQueueTarget, messageId: string) => QueuedMessage | null | Promise<QueuedMessage | null>;
    /**
     * Removes what the composer is about to send itself — one message or every
     * message not already being delivered — and returns it in full.
     */
    takeForSend: (target: MessageQueueTarget, messageId?: string) => Promise<QueuedMessage[]>;
    clearQueue: (target: MessageQueueTarget) => QueuedMessage[];
    /** Drops the local projection only (the session is gone); never a server call. */
    forgetQueue: (target: MessageQueueTarget) => void;
    clearAllQueues: () => void;
    markSending: (target: MessageQueueTarget, messageId: string) => boolean;
    clearSending: (target: MessageQueueTarget, messageId: string) => void;
    completeSending: (target: MessageQueueTarget, messageId: string) => void;
    getSendableQueue: (target: MessageQueueTarget) => QueuedMessage[];
    getQueueDispatchState: (target: MessageQueueTarget) => MessageQueueDispatchState;
    getQueueRestorationGuard: (target: MessageQueueTarget) => MessageQueueRestorationGuard;
    isQueueRestorationGuardCurrent: (target: MessageQueueTarget, guard: MessageQueueRestorationGuard) => boolean;
    restoreQueue: (target: MessageQueueTarget, messages: QueuedMessage[], guard: MessageQueueRestorationGuard) => void;
    clearQueueForSessionDeletion: (target: MessageQueueTarget) => void;
    setFollowUpBehavior: (behavior: FollowUpBehavior) => void;
    getQueueForTarget: (target: MessageQueueTarget) => QueuedMessage[];
    /** Server-owned queue: load the authoritative queue for the active runtime. */
    hydrate: () => Promise<void>;
    /** Server-owned queue: apply one session's authoritative state (broadcast or response). */
    applyServerSession: (session: ServerQueueSession, revision: number, expectedRuntimeKey: string) => void;
    /** Server-owned queue: tell the server to hold or release a session's delivery. */
    setServerHold: (sessionId: string, held: boolean) => Promise<void>;
    resetForRuntimeSwitch: (previousRuntimeKey: string | null | undefined) => void;
}

type MessageQueueStore = MessageQueueState & MessageQueueActions;

export type MessageQueueRestorationGuard = {
    target: MessageQueueTarget;
    deletionGeneration: number;
};

export type RemovedQueueMessages = {
    target: MessageQueueTarget;
    messages: QueuedMessage[];
};

/** Messages persisted before version 3 carried only `content`. */
type PersistedQueuedMessage = Omit<QueuedMessage, 'text'> & { text?: string };

type PersistedMessageQueueState = {
    queuedMessages?: unknown;
    quarantinedLegacyMessages?: unknown;
    followUpBehavior?: FollowUpBehavior;
    queueModeEnabled?: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isPersistedQueuedMessage = (value: unknown): value is PersistedQueuedMessage => {
    if (!isRecord(value)) return false;
    return typeof value.id === 'string'
        && value.id.length > 0
        && typeof value.content === 'string'
        && typeof value.createdAt === 'number'
        && Number.isFinite(value.createdAt);
};

/** Keep the original object when normalizing so migration does not duplicate its payload. */
const validPersistedMessages = (value: unknown): QueuedMessage[] => {
    if (!Array.isArray(value)) return [];
    return value.filter(isPersistedQueuedMessage).map((message) => {
        if (message.text === undefined) message.text = message.content;
        return message as QueuedMessage;
    });
};

const trimQueue = (messages: QueuedMessage[], protectedIds: ReadonlySet<string> = new Set()): QueuedMessage[] => {
    if (messages.length <= MAX_MESSAGES_PER_QUEUE) return messages;
    let overflow = messages.length - MAX_MESSAGES_PER_QUEUE;
    const dropped = new Set<string>();
    for (const message of messages) {
        if (overflow === 0) break;
        if (protectedIds.has(message.id)) continue;
        dropped.add(message.id);
        overflow -= 1;
    }
    return messages.filter((message) => !dropped.has(message.id));
};

export const migrateMessageQueueState = (persistedState: unknown, version: number): Partial<MessageQueueStore> => {
    const state = (persistedState ?? {}) as PersistedMessageQueueState;
    const queuedMessages: Record<string, QueuedMessage[]> = {};
    const quarantinedLegacyMessages: Record<string, QueuedMessage[]> = {};

    const append = (record: Record<string, QueuedMessage[]>, key: string, messages: QueuedMessage[]) => {
        if (messages.length === 0) return;
        record[key] = [...(record[key] ?? []), ...messages];
    };

    const quarantine = (key: string, messages: QueuedMessage[]) => {
        const target = parseMessageQueueKey(key);
        append(quarantinedLegacyMessages, target ? getMessageQueueKey(target) : key, messages);
    };

    if (isRecord(state.quarantinedLegacyMessages)) {
        for (const [key, value] of Object.entries(state.quarantinedLegacyMessages)) {
            const messages = validPersistedMessages(value);
            if (messages.length === 0) continue;
            const target = parseMessageQueueKey(key);
            append(quarantinedLegacyMessages, target ? getMessageQueueKey(target) : key, messages);
        }
    }

    if (isRecord(state.queuedMessages)) {
        for (const [key, value] of Object.entries(state.queuedMessages)) {
            const messages = validPersistedMessages(value);
            if (messages.length === 0) continue;
            const target = version >= 2 ? parseMessageQueueKey(key) : null;
            if (!target) {
                quarantine(key, messages);
                continue;
            }
            append(queuedMessages, getMessageQueueKey(target), messages);
        }
    }

    for (const [key, messages] of Object.entries(queuedMessages)) {
        queuedMessages[key] = trimQueue(messages);
    }
    return {
        queuedMessages,
        quarantinedLegacyMessages,
        followUpBehavior: normalizeFollowUpBehavior(state.followUpBehavior, state.queueModeEnabled ?? null),
    };
};

const withoutKey = <T,>(record: Record<string, T>, key: string): Record<string, T> => {
    const { [key]: _removed, ...rest } = record;
    void _removed;
    return rest;
};

const removeMessageLocally = (
    state: Pick<MessageQueueState, 'queuedMessages'>,
    key: string,
    messageId: string,
): Pick<MessageQueueState, 'queuedMessages'> => {
    const newQueue = (state.queuedMessages[key] ?? []).filter((m) => m.id !== messageId);
    if (newQueue.length === 0) return { queuedMessages: withoutKey(state.queuedMessages, key) };
    return { queuedMessages: { ...state.queuedMessages, [key]: newQueue } };
};

/** Every projection of one session in this runtime, whatever directory it was keyed under. */
const clearSessionProjection = (
    state: Pick<MessageQueueState, 'queuedMessages' | 'sendingIds'>,
    runtimeKey: string,
    sessionId: string,
    revision: number,
): Pick<MessageQueueState, 'queuedMessages' | 'sendingIds'> => {
    let queuedMessages = state.queuedMessages;
    let sendingIds = state.sendingIds;
    for (const key of new Set([...Object.keys(queuedMessages), ...Object.keys(sendingIds)])) {
        const parsed = parseMessageQueueKey(key);
        if (parsed?.runtimeKey !== runtimeKey || parsed.sessionId !== sessionId) continue;
        if ((appliedRevisions.get(key) ?? -1) > revision) continue;
        appliedRevisions.set(key, revision);
        clearLocalQueueContexts(key);
        queuedMessages = withoutKey(queuedMessages, key);
        sendingIds = withoutKey(sendingIds, key);
    }
    return { queuedMessages, sendingIds };
};

export const useMessageQueueStore = create<MessageQueueStore>()(
    devtools(
        persist(
            (set, get) => {
                const applyServerSession = (session: ServerQueueSession, revision: number, expectedRuntimeKey: string) => {
                    if (expectedRuntimeKey !== getRuntimeKey()) return;
                    const target = createMessageQueueTarget(session.sessionId, session.directory, expectedRuntimeKey);
                    if (!target) {
                        // Servers before 1.22.2 drop a session's directory once its
                        // queue is empty. A session id is unique across directories,
                        // so an empty session still says which projection is done.
                        if (session.items.length > 0) return;
                        set((state) => clearSessionProjection(state, expectedRuntimeKey, session.sessionId, revision));
                        return;
                    }
                    const key = getMessageQueueKey(target);
                    if ((appliedRevisions.get(key) ?? -1) > revision) return;
                    appliedRevisions.set(key, revision);
                    reconcileLocalQueueContexts(key, session.items);
                    set((state) => {
                        const queue = session.items.map(toQueuedMessage);
                        const queuedMessages = queue.length > 0
                            ? { ...state.queuedMessages, [key]: queue }
                            : withoutKey(state.queuedMessages, key);
                        const sendingIds = session.sendingId
                            ? { ...state.sendingIds, [key]: [session.sendingId] }
                            : withoutKey(state.sendingIds, key);
                        return { queuedMessages, sendingIds };
                    });
                };

                /** Server state wins; a failed round-trip re-reads it instead of guessing. */
                const refreshSession = async (target: MessageQueueTarget) => {
                    try {
                        const snapshot = await requestJson(serverSnapshotSchema, '/api/message-queue');
                        const session = snapshot.sessions.find((entry) => entry.sessionId === target.sessionId)
                            ?? { sessionId: target.sessionId, directory: target.directory, items: [], sendingId: null };
                        applyServerSession(session, snapshot.revision, target.runtimeKey);
                    } catch {
                        // Offline: keep the optimistic projection; the next broadcast or hydration corrects it.
                    }
                };

                const serverMutation = async (
                    target: MessageQueueTarget,
                    path: string,
                    init: RequestInit,
                ) => {
                    try {
                        const result = await requestJson(serverSessionResponseSchema, path, init);
                        applyServerSession(result.session, result.revision, target.runtimeKey);
                    } catch (error) {
                        console.warn('[queue] server update failed:', error);
                        await refreshSession(target);
                    }
                };

                return {
                    queuedMessages: {},
                    quarantinedLegacyMessages: {},
                    followUpBehavior: DEFAULT_FOLLOW_UP_BEHAVIOR,
                    queueDeletionGenerations: {},
                    sendingIds: {},

                    addToQueue: async (target, message) => {
                        const key = getMessageQueueKey(target);
                        const id = `queued-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                        const queuedMessage: QueuedMessage = {
                            id,
                            content: message.content,
                            text: message.text ?? message.content,
                            createdAt: Date.now(),
                            sendConfig: message.sendConfig,
                        };
                        if (message.agentMention) queuedMessage.agentMention = message.agentMention;
                        if (message.attachments && message.attachments.length > 0) queuedMessage.attachments = message.attachments;
                        if (message.additionalParts && message.additionalParts.length > 0) queuedMessage.additionalParts = message.additionalParts;
                        if (message.capturedContext && message.capturedContext.length > 0) queuedMessage.capturedContext = message.capturedContext;
                        if (message.contextClaimed !== undefined) queuedMessage.contextClaimed = message.contextClaimed;
                        if (message.context && message.context.length > 0) queuedMessage.context = message.context;

                        set((state) => {
                            const currentQueue = state.queuedMessages[key] ?? [];
                            const protectedIds = new Set(state.sendingIds[key] ?? []);
                            const queuedMessages = {
                                ...state.queuedMessages,
                                [key]: trimQueue([...currentQueue, queuedMessage], protectedIds),
                            };
                            const keys = Object.keys(queuedMessages);
                            if (keys.length > MAX_QUEUE_TARGETS) {
                                keys.sort((left, right) => (
                                    (queuedMessages[left]?.[0]?.createdAt ?? 0) - (queuedMessages[right]?.[0]?.createdAt ?? 0)
                                ));
                                for (const staleKey of keys.slice(0, keys.length - MAX_QUEUE_TARGETS)) delete queuedMessages[staleKey];
                            }
                            return { queuedMessages };
                        });

                        if (!isServerOwnedMessageQueue()) return;
                        const enqueueKey = queueItemEphemeralKey(key, id);
                        pendingServerEnqueues.set(enqueueKey, { target: { ...target }, removed: false });
                        if (message.context && message.context.length > 0) {
                            setLocalQueueContext(key, id, message.context);
                        }
                        if (!message.sendConfig) {
                            pendingServerEnqueues.delete(enqueueKey);
                            deleteLocalQueueContext(key, id);
                            set((state) => removeMessageLocally(state, key, id));
                            throw new Error('A queued message needs a provider and model to be delivered later.');
                        }
                        const historyIdentity = createInputHistoryIdentity(target.runtimeKey, target.directory, target.sessionId);
                        const historySubmission = createInputHistorySubmission(message.content, message.attachments ?? []);
                        try {
                            const result = await requestJson(serverEnqueueResponseSchema, `${sessionPath(target.sessionId)}/items`, jsonInit('POST', {
                                directory: target.directory,
                                item: toServerItemInput(message, message.sendConfig),
                            }));
                            const pending = pendingServerEnqueues.get(enqueueKey);
                            pendingServerEnqueues.delete(enqueueKey);
                            const acceptedItemId = result.itemId ?? findAcceptedQueueItemId(result.session, message, message.sendConfig);
                            if (pending?.removed) {
                                // The remove happened before the server had an
                                // id for this item. Do not apply the POST's
                                // projection; remove the accepted server item
                                // instead, then let that response reconcile the
                                // remaining queue authoritatively.
                                if (acceptedItemId) moveLocalQueueContext(key, id, acceptedItemId);
                                set((state) => removeMessageLocally(state, key, id));
                                if (acceptedItemId) {
                                    await serverMutation(
                                        target,
                                        `${sessionPath(target.sessionId)}/items/${encodeURIComponent(acceptedItemId)}`,
                                        jsonInit('DELETE'),
                                    );
                                } else {
                                    await refreshSession(target);
                                }
                                return;
                            }
                            if (acceptedItemId) moveLocalQueueContext(key, id, acceptedItemId);
                            else deleteLocalQueueContext(key, id);
                            // The optimistic entry is replaced by the server's copy of the queue.
                            set((state) => removeMessageLocally(state, key, id));
                            applyServerSession(result.session, result.revision, target.runtimeKey);
                            if (historyIdentity) {
                                useInputHistoryStore.getState().appendSubmissions(historyIdentity, [historySubmission]);
                            }
                        } catch (error) {
                            pendingServerEnqueues.delete(enqueueKey);
                            deleteLocalQueueContext(key, id);
                            set((state) => removeMessageLocally(state, key, id));
                            throw error;
                        }
                    },

                    removeFromQueue: (target, messageId) => {
                        const key = getMessageQueueKey(target);
                        const state = get();
                        if (isQueueMessageInFlight(state.sendingIds[key] ?? [], messageId)) return null;
                        const removed = (state.queuedMessages[key] ?? []).find((message) => message.id === messageId) ?? null;
                        if (!removed) return null;
                        set((currentState) => removeMessageLocally(currentState, key, messageId));
                        const pendingServerEnqueue = isServerOwnedMessageQueue()
                            && markPendingServerEnqueueRemoved(key, messageId);
                        const localContext = getLocalQueueContext(key, messageId);
                        const removedWithContext = !removed.context && localContext
                            ? { ...removed, context: localContext }
                            : removed;
                        if (!isServerOwnedMessageQueue()) deleteLocalQueueContext(key, messageId);
                        if (isServerOwnedMessageQueue() && !pendingServerEnqueue) {
                            void serverMutation(target, `${sessionPath(target.sessionId)}/items/${encodeURIComponent(messageId)}`, jsonInit('DELETE'));
                        }
                        return removedWithContext;
                    },

                    reorderQueue: (target, fromId, toId) => {
                        if (fromId === toId) return;
                        const key = getMessageQueueKey(target);
                        const currentQueue = get().queuedMessages[key];
                        if (!currentQueue) return;
                        const fromIndex = currentQueue.findIndex((m) => m.id === fromId);
                        const toIndex = currentQueue.findIndex((m) => m.id === toId);
                         if ((get().sendingIds[key] ?? []).length > 0 || fromIndex === -1 || toIndex === -1) return;

                        const newQueue = currentQueue.slice();
                        const [moved] = newQueue.splice(fromIndex, 1);
                        newQueue.splice(toIndex, 0, moved);

                        set((state) => ({
                            queuedMessages: {
                                ...state.queuedMessages,
                                [key]: newQueue,
                            },
                        }));
                        if (isServerOwnedMessageQueue()) {
                            const itemIds = newQueue.map((message) => message.id);
                            void serverMutation(target, `${sessionPath(target.sessionId)}/order`, jsonInit('PUT', { itemIds }));
                        }
                    },

                    popToInput: (target, messageId) => {
                        if (isServerOwnedMessageQueue()) {
                            return get().takeForSend(target, messageId).then(([message]) => message ?? null);
                        }
                        const key = getMessageQueueKey(target);
                        const state = get();
                        const sending = state.sendingIds[key] ?? [];
                        const message = (state.queuedMessages[key] ?? []).find((item) => item.id === messageId);
                        if (!message || sending.includes(message.id)) return null;
                        set((currentState) => removeMessageLocally(currentState, key, messageId));
                        return message;
                    },

                    takeForSend: async (target, messageId) => {
                        const key = getMessageQueueKey(target);
                        if (isServerOwnedMessageQueue()) {
                            if (messageId) {
                                const result = await requestJson(
                                    serverTakeResponseSchema,
                                    `${sessionPath(target.sessionId)}/items/${encodeURIComponent(messageId)}/take`,
                                    jsonInit('POST'),
                                );
                                applyServerSession(result.session, result.revision, target.runtimeKey);
                                return [toQueuedMessage(result.item)];
                            }
                            const result = await requestJson(serverTakeAllResponseSchema, `${sessionPath(target.sessionId)}/take`, jsonInit('POST'));
                            applyServerSession(result.session, result.revision, target.runtimeKey);
                            return result.items.map(toQueuedMessage);
                        }

                        const state = get();
                        const sending = state.sendingIds[key] ?? [];
                        const taken = (state.queuedMessages[key] ?? []).filter((message) => (
                            (messageId ? message.id === messageId : true) && !sending.includes(message.id)
                        ));
                        if (taken.length === 0) return [];
                        const takenIds = new Set(taken.map((message) => message.id));
                        set((prevState) => {
                            const remaining = (prevState.queuedMessages[key] ?? []).filter((message) => !takenIds.has(message.id));
                            if (remaining.length === 0) return { queuedMessages: withoutKey(prevState.queuedMessages, key) };
                            return { queuedMessages: { ...prevState.queuedMessages, [key]: remaining } };
                        });
                        return taken;
                    },

                    clearQueue: (target) => {
                        const key = getMessageQueueKey(target);
                        let removed: QueuedMessage[] = [];
                        set((state) => {
                            // Clearing drops what is still queued, never a message
                            // already handed to the server: that send will resolve
                            // and must find its entry to remove or restore.
                            const sending = state.sendingIds[key] ?? [];
                            const currentQueue = state.queuedMessages[key] ?? [];
                            removed = currentQueue.filter((message) => !sending.includes(message.id));
                            const retained = currentQueue.filter((m) => sending.includes(m.id));
                            if (retained.length > 0) {
                                return { queuedMessages: { ...state.queuedMessages, [key]: retained } };
                            }
                            return { queuedMessages: withoutKey(state.queuedMessages, key) };
                        });
                        if (isServerOwnedMessageQueue()) {
                            for (const message of removed) markPendingServerEnqueueRemoved(key, message.id);
                        }
                        if (isServerOwnedMessageQueue()) {
                            void serverMutation(target, sessionPath(target.sessionId), jsonInit('DELETE'));
                        }
                        return removed;
                    },

                    forgetQueue: (target) => {
                        const key = getMessageQueueKey(target);
                        if (isServerOwnedMessageQueue()) markPendingServerEnqueuesRemoved(key);
                        appliedRevisions.delete(key);
                        clearLocalQueueContexts(key);
                        set((state) => ({
                            queuedMessages: withoutKey(state.queuedMessages, key),
                            sendingIds: withoutKey(state.sendingIds, key),
                            queueDeletionGenerations: withoutKey(state.queueDeletionGenerations, key),
                        }));
                    },

                    clearAllQueues: () => {
                        if (isServerOwnedMessageQueue()) {
                            for (const [key, queue] of Object.entries(get().queuedMessages)) {
                                const sending = new Set(get().sendingIds[key] ?? []);
                                for (const message of queue) {
                                    if (!sending.has(message.id)) markPendingServerEnqueueRemoved(key, message.id);
                                }
                            }
                        }
                        set((state) => {
                            const queuedMessages: Record<string, QueuedMessage[]> = {};
                            for (const [key, queue] of Object.entries(state.queuedMessages)) {
                                const sending = new Set(state.sendingIds[key] ?? []);
                                const retained = queue.filter((message) => sending.has(message.id));
                                if (retained.length > 0) queuedMessages[key] = retained;
                            }
                            return { queuedMessages };
                        });
                    },

                    markSending: (target, messageId) => {
                        const key = getMessageQueueKey(target);
                        let claimed = false;
                        set((state) => {
                            const current = state.sendingIds[key] ?? [];
                            const queue = state.queuedMessages[key] ?? [];
                            if (current.length > 0 || (!isServerOwnedMessageQueue() && !isQueueMessageDispatchable(queue, current, messageId))) {
                                return state;
                            }
                            claimed = true;
                            return { sendingIds: { ...state.sendingIds, [key]: [...current, messageId] } };
                        });
                        return claimed;
                    },

                    clearSending: (target, messageId) => {
                        const key = getMessageQueueKey(target);
                        set((state) => {
                            const current = state.sendingIds[key];
                            if (!current || !current.includes(messageId)) return state;
                            const next = current.filter((id) => id !== messageId);
                            if (next.length === 0) return { sendingIds: withoutKey(state.sendingIds, key) };
                            return { sendingIds: { ...state.sendingIds, [key]: next } };
                        });
                    },

                    completeSending: (target, messageId) => {
                        const key = getMessageQueueKey(target);
                        set((state) => {
                            const currentSending = state.sendingIds[key] ?? [];
                            if (!isQueueMessageInFlight(currentSending, messageId)) return state;
                            const queuedMessages = (state.queuedMessages[key] ?? []).filter((message) => message.id !== messageId);
                            const sendingIds = currentSending.filter((id) => id !== messageId);
                            return {
                                queuedMessages: queuedMessages.length > 0
                                    ? { ...state.queuedMessages, [key]: queuedMessages }
                                    : withoutKey(state.queuedMessages, key),
                                sendingIds: sendingIds.length > 0
                                    ? { ...state.sendingIds, [key]: sendingIds }
                                    : withoutKey(state.sendingIds, key),
                            };
                        });
                    },

                    getSendableQueue: (target) => {
                        const key = getMessageQueueKey(target);
                        const state = get();
                        const queue = state.queuedMessages[key] ?? [];
                        const sending = state.sendingIds[key];
                        if (!sending || sending.length === 0) return queue;
                        return [];
                    },

                    getQueueDispatchState: (target) => {
                        const key = getMessageQueueKey(target);
                        const state = get();
                        return {
                            head: (state.queuedMessages[key] ?? [])[0] ?? null,
                            sendingIds: state.sendingIds[key] ?? [],
                        };
                    },

                    getQueueRestorationGuard: (target) => {
                        const key = getMessageQueueKey(target);
                        return { target: { ...target }, deletionGeneration: get().queueDeletionGenerations[key] ?? 0 };
                    },

                    isQueueRestorationGuardCurrent: (target, guard) => {
                        const key = getMessageQueueKey(target);
                        return target.runtimeKey === getRuntimeKey()
                            && guard.target.runtimeKey === target.runtimeKey
                            && guard.target.sessionId === target.sessionId
                            && getMessageQueueKey(guard.target) === key
                            && (get().queueDeletionGenerations[key] ?? 0) === guard.deletionGeneration;
                    },

                    restoreQueue: (target, messages, guard) => {
                        if (messages.length === 0) return;
                        const key = getMessageQueueKey(target);
                        set((state) => {
                            if (
                                !get().isQueueRestorationGuardCurrent(target, guard)
                                || target.runtimeKey !== getRuntimeKey()
                            ) return state;
                            const currentQueue = state.queuedMessages[key] ?? [];
                            const existingIds = new Set(currentQueue.map((message) => message.id));
                            const restored = messages.filter((message) => !existingIds.has(message.id));
                            if (restored.length === 0) return state;
                            const sending = new Set(state.sendingIds[key] ?? []);
                            const inFlight = currentQueue.filter((message) => sending.has(message.id));
                            const later = currentQueue.filter((message) => !sending.has(message.id));
                            const combined = [...inFlight, ...restored, ...later];
                            const overflow = Math.max(0, combined.length - MAX_MESSAGES_PER_QUEUE);
                            const dropped = new Set(
                                combined.filter((message) => !sending.has(message.id)).slice(0, overflow).map((message) => message.id),
                            );
                            return { queuedMessages: { ...state.queuedMessages, [key]: combined.filter((message) => !dropped.has(message.id)) } };
                        });
                    },

                    clearQueueForSessionDeletion: (target) => {
                        const key = getMessageQueueKey(target);
                        if (isServerOwnedMessageQueue()) markPendingServerEnqueuesRemoved(key);
                        clearLocalQueueContexts(key);
                        set((state) => {
                            const queueDeletionGenerations = {
                                ...state.queueDeletionGenerations,
                                [key]: (state.queueDeletionGenerations[key] ?? 0) + 1,
                            };
                            const sending = state.sendingIds[key] ?? [];
                            const retained = (state.queuedMessages[key] ?? []).filter((message) => sending.includes(message.id));
                            return {
                                queuedMessages: retained.length > 0
                                    ? { ...state.queuedMessages, [key]: retained }
                                    : withoutKey(state.queuedMessages, key),
                                queueDeletionGenerations,
                            };
                        });
                    },

                    setFollowUpBehavior: (behavior) => {
                        const normalized = normalizeFollowUpBehavior(behavior);
                        set({ followUpBehavior: normalized });
                        void updateDesktopSettings({ followUpBehavior: normalized });
                    },

                    getQueueForTarget: (target) => {
                        return get().queuedMessages[getMessageQueueKey(target)] ?? [];
                    },

                    hydrate: async () => {
                        if (!isServerOwnedMessageQueue()) return;
                        const runtimeKey = getRuntimeKey();
                        const generation = ++hydrationGeneration;
                        const isCurrent = () => generation === hydrationGeneration && runtimeKey === getRuntimeKey();

                        // Messages queued by an older build live in this browser only.
                        // Hand them to the server once so they are still delivered;
                        // whatever cannot be uploaded is superseded by the server's queue.
                        const legacyEntries = Object.entries(get().queuedMessages)
                            .map(([key, queue]) => ({ target: parseMessageQueueKey(key), queue }))
                            .filter((entry): entry is { target: MessageQueueTarget; queue: QueuedMessage[] } => (
                                entry.target !== null && entry.target.runtimeKey === runtimeKey && !serverOwnedRuntimeKeys.has(runtimeKey)
                            ));
                        for (const { target, queue } of legacyEntries) {
                            for (const message of queue) {
                                if (!message.sendConfig) continue;
                                try {
                                    await requestJson(serverSessionResponseSchema, `${sessionPath(target.sessionId)}/items`, jsonInit('POST', {
                                        directory: target.directory,
                                        item: toServerItemInput(message, message.sendConfig),
                                    }));
                                } catch (error) {
                                    console.warn('[queue] failed to migrate a locally queued message to the server:', error);
                                }
                                if (!isCurrent()) return;
                            }
                        }

                        const snapshot = await requestJson(serverSnapshotSchema, '/api/message-queue');
                        if (!isCurrent()) return;
                        serverOwnedRuntimeKeys.add(runtimeKey);
                        set((state) => {
                            const queuedMessages: Record<string, QueuedMessage[]> = {};
                            const sendingIds: Record<string, string[]> = {};
                            for (const [key, queue] of Object.entries(state.queuedMessages)) {
                                if (parseMessageQueueKey(key)?.runtimeKey !== runtimeKey) queuedMessages[key] = queue;
                            }
                            for (const [key, ids] of Object.entries(state.sendingIds)) {
                                if (parseMessageQueueKey(key)?.runtimeKey !== runtimeKey) sendingIds[key] = ids;
                            }
                            for (const session of snapshot.sessions) {
                                const target = createMessageQueueTarget(session.sessionId, session.directory, runtimeKey);
                                if (!target) continue;
                                const key = getMessageQueueKey(target);
                                if ((appliedRevisions.get(key) ?? -1) > snapshot.revision) {
                                    // A broadcast newer than this snapshot already landed; keep it.
                                    if (state.queuedMessages[key]) queuedMessages[key] = state.queuedMessages[key];
                                    if (state.sendingIds[key]) sendingIds[key] = state.sendingIds[key];
                                    continue;
                                }
                                appliedRevisions.set(key, snapshot.revision);
                                if (session.items.length > 0) queuedMessages[key] = session.items.map(toQueuedMessage);
                                if (session.sendingId) sendingIds[key] = [session.sendingId];
                            }
                            return { queuedMessages, sendingIds };
                        });
                    },

                    applyServerSession,

                    setServerHold: async (sessionId, held) => {
                        if (!isServerOwnedMessageQueue()) return;
                        const response = await runtimeFetch(`${sessionPath(sessionId)}/hold`, jsonInit('PUT', { held }));
                        if (!response.ok) throw new Error(`Message queue hold request failed (${response.status})`);
                    },

                    resetForRuntimeSwitch: (previousRuntimeKey) => {
                        hydrationGeneration += 1;
                        if (!previousRuntimeKey || !serverOwnedRuntimeKeys.has(previousRuntimeKey)) return;
                        // The previous runtime's projection belongs to its server;
                        // switching back re-hydrates it from there.
                        set((state) => {
                            const queuedMessages: Record<string, QueuedMessage[]> = {};
                            const sendingIds: Record<string, string[]> = {};
                            for (const [key, queue] of Object.entries(state.queuedMessages)) {
                                if (parseMessageQueueKey(key)?.runtimeKey === previousRuntimeKey) appliedRevisions.delete(key);
                                else queuedMessages[key] = queue;
                            }
                            for (const [key, ids] of Object.entries(state.sendingIds)) {
                                if (parseMessageQueueKey(key)?.runtimeKey !== previousRuntimeKey) sendingIds[key] = ids;
                            }
                            return { queuedMessages, sendingIds };
                        });
                    },
                };
            },
            {
                name: 'message-queue-store',
                version: 5,
                storage: createDeferredSafeJSONStorage(),
                partialize: (state) => ({
                    queuedMessages: Object.fromEntries(
                        Object.entries(state.queuedMessages).filter(([key]) => {
                            const runtimeKey = parseMessageQueueKey(key)?.runtimeKey;
                            return !runtimeKey || !serverOwnedRuntimeKeys.has(runtimeKey);
                        }),
                    ),
                    quarantinedLegacyMessages: state.quarantinedLegacyMessages,
                    followUpBehavior: state.followUpBehavior,
                }),
                migrate: migrateMessageQueueState,
            },
        ),
        {
            name: 'message-queue-store',
        },
    ),
);

const serverUpdatedEventSchema = z.object({
    properties: z.object({ revision: z.number(), session: serverSessionSchema }),
});

export type MessageQueueUpdatedEvent = {
    type: 'openchamber:message-queue.updated';
    properties: z.infer<typeof serverUpdatedEventSchema>['properties'];
};

/** `openchamber:message-queue.updated` broadcast → projection. */
export const applyMessageQueueUpdatedEvent = (payload: Event | MessageQueueUpdatedEvent, expectedRuntimeKey: string): void => {
    if (!isServerOwnedMessageQueue()) return;
    const parsed = serverUpdatedEventSchema.safeParse(payload);
    if (!parsed.success) return;
    const { session, revision } = parsed.data.properties;
    useMessageQueueStore.getState().applyServerSession(session, revision, expectedRuntimeKey);
};
