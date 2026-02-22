import type { MessageStreamLifecycle } from "../types/sessionTypes";

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

/**
 * Touch multiple messageIds in ONE Map allocation instead of one Map per messageId.
 * Use this in the batched flush path where multiple assistant messages may need
 * lifecycle updates within a single animation frame.
 */
export const touchStreamingLifecycleBatch = (
    source: Map<string, MessageStreamLifecycle>,
    messageIds: string[]
): Map<string, MessageStreamLifecycle> => {
    if (messageIds.length === 0) {
        return source;
    }
    const now = Date.now();
    const next = new Map(source);
    for (const messageId of messageIds) {
        const existing = source.get(messageId);
        next.set(messageId, {
            phase: 'streaming',
            startedAt: existing?.startedAt ?? now,
            lastUpdateAt: now,
        });
    }
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

const lifecycleCompletionTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const clearLifecycleCompletionTimer = (messageId: string) => {
    const timer = lifecycleCompletionTimers.get(messageId);
    if (timer) {
        clearTimeout(timer);
        lifecycleCompletionTimers.delete(messageId);
    }
};

export const clearLifecycleTimersForIds = (ids: Iterable<string>) => {
    for (const id of ids) {
        clearLifecycleCompletionTimer(id);
    }
};
