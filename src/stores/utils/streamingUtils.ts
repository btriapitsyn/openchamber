import type { MessageStreamLifecycle } from "../types/sessionTypes";

// Re-export for convenience
export type { MessageStreamLifecycle };

export const touchStreamingLifecycle = (
    source: Map<string, MessageStreamLifecycle>,
    messageId: string
): Map<string, MessageStreamLifecycle> => {
    const now = Date.now();
    const existing = source.get(messageId);

    const next = new Map(source);
    next.set(messageId, {
        phase: 'streaming',
        startedAt: existing?.startedAt ?? now,
        lastUpdateAt: now,
    });

    return next;
};

export const markLifecycleCooldown = (
    source: Map<string, MessageStreamLifecycle>,
    messageId: string
): Map<string, MessageStreamLifecycle> => {
    const existing = source.get(messageId);
    if (!existing) {
        return source;
    }
    if (existing.phase === 'cooldown') {
        return source;
    }

    const now = Date.now();
    const next = new Map(source);
    next.set(messageId, {
        ...existing,
        phase: 'cooldown',
        completedAt: now,
    });

    return next;
};

export const markLifecycleCompleted = (
    source: Map<string, MessageStreamLifecycle>,
    messageId: string
): Map<string, MessageStreamLifecycle> => {
    const existing = source.get(messageId);
    if (!existing) {
        return source;
    }
    if (existing.phase === 'completed') {
        return source;
    }

    const completion = existing.completedAt ?? Date.now();
    const next = new Map(source);
    next.set(messageId, {
        ...existing,
        phase: 'completed',
        completedAt: completion,
    });

    return next;
};

export const removeLifecycleEntries = (
    source: Map<string, MessageStreamLifecycle>,
    ids: Iterable<string>
): Map<string, MessageStreamLifecycle> => {
    const idsArray = Array.from(ids);
    const shouldClone = idsArray.some((id) => source.has(id));

    if (!shouldClone) {
        return source;
    }

    const next = new Map(source);
    idsArray.forEach((id) => {
        next.delete(id);
    });

    return next;
};

// Timer management for lifecycle completion
const lifecycleCompletionTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const clearLifecycleCompletionTimer = (messageId: string) => {
    const timer = lifecycleCompletionTimers.get(messageId);
    if (timer) {
        clearTimeout(timer);
        lifecycleCompletionTimers.delete(messageId);
    }
};

export const scheduleLifecycleCompletion = (
    messageId: string,
    get: () => any,
    sessionId?: string | null
) => {
    clearLifecycleCompletionTimer(messageId);
    const timer = setTimeout(() => {
        lifecycleCompletionTimers.delete(messageId);
        const state = get();
        const lifecycle = state.messageStreamStates.get(messageId);
        if (!lifecycle || lifecycle.phase === 'completed') {
            return;
        }
        if (typeof state.forceCompleteMessage === 'function') {
            state.forceCompleteMessage(sessionId, messageId, 'cooldown');
        }
        state.markMessageStreamSettled(messageId);
    }, 1600);

    lifecycleCompletionTimers.set(messageId, timer);
};

export const clearLifecycleTimersForIds = (ids: Iterable<string>) => {
    for (const id of ids) {
        clearLifecycleCompletionTimer(id);
    }
};
