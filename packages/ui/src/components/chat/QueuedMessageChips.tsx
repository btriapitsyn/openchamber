import React, { memo } from 'react';
import { RiCloseLine, RiMessage2Line } from '@remixicon/react';
import { useMessageQueueStore, type QueuedMessage } from '@/stores/messageQueueStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useFileStore } from '@/stores/fileStore';

interface QueuedMessageChipProps {
    message: QueuedMessage;
    sessionId: string;
    onEdit: (message: QueuedMessage) => void;
}

const QueuedMessageChip = memo(({ message, sessionId, onEdit }: QueuedMessageChipProps) => {
    const removeFromQueue = useMessageQueueStore((state) => state.removeFromQueue);

    // Get first line of message, truncated
    const firstLine = React.useMemo(() => {
        const lines = message.content.split('\n');
        const first = lines[0] || '';
        const maxLength = 50;
        if (first.length > maxLength) {
            return first.substring(0, maxLength) + '...';
        }
        return first + (lines.length > 1 ? '...' : '');
    }, [message.content]);

    const attachmentCount = message.attachments?.length ?? 0;

    return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-muted/30 border border-border/30 rounded-xl typography-meta group">
            <RiMessage2Line className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <button
                type="button"
                onClick={() => onEdit(message)}
                className="flex items-center gap-1.5 hover:text-foreground transition-colors text-left"
                title="Click to edit"
            >
                <span className="truncate max-w-[200px]">
                    {firstLine || '(empty)'}
                </span>
                {attachmentCount > 0 && (
                    <span className="text-muted-foreground flex-shrink-0">
                        +{attachmentCount} file{attachmentCount > 1 ? 's' : ''}
                    </span>
                )}
            </button>
            <button
                type="button"
                onClick={() => removeFromQueue(sessionId, message.id)}
                className="ml-1 hover:text-destructive p-0.5 opacity-60 group-hover:opacity-100 transition-opacity"
                title="Remove from queue"
            >
                <RiCloseLine className="h-3 w-3" />
            </button>
        </div>
    );
});

QueuedMessageChip.displayName = 'QueuedMessageChip';

interface QueuedMessageChipsProps {
    onEditMessage: (content: string, attachments?: QueuedMessage['attachments']) => void;
}

const EMPTY_QUEUE: QueuedMessage[] = [];

export const QueuedMessageChips = memo(({ onEditMessage }: QueuedMessageChipsProps) => {
    const currentSessionId = useSessionStore((state) => state.currentSessionId);
    const queuedMessages = useMessageQueueStore(
        React.useCallback(
            (state) => {
                if (!currentSessionId) return EMPTY_QUEUE;
                return state.queuedMessages[currentSessionId] ?? EMPTY_QUEUE;
            },
            [currentSessionId]
        )
    );
    const popToInput = useMessageQueueStore((state) => state.popToInput);

    const handleEdit = React.useCallback((message: QueuedMessage) => {
        if (!currentSessionId) return;
        
        const popped = popToInput(currentSessionId, message.id);
        if (popped) {
            // Restore attachments to file store if any
            if (popped.attachments && popped.attachments.length > 0) {
                const currentAttachments = useFileStore.getState().attachedFiles;
                useFileStore.setState({ 
                    attachedFiles: [...currentAttachments, ...popped.attachments] 
                });
            }
            onEditMessage(popped.content, popped.attachments);
        }
    }, [currentSessionId, popToInput, onEditMessage]);

    if (queuedMessages.length === 0 || !currentSessionId) {
        return null;
    }

    return (
        <div className="pb-2">
            <div className="flex items-center flex-wrap gap-2 px-3 py-2 bg-muted/30 rounded-xl border border-border/30">
                {queuedMessages.map((message) => (
                    <QueuedMessageChip
                        key={message.id}
                        message={message}
                        sessionId={currentSessionId}
                        onEdit={handleEdit}
                    />
                ))}
            </div>
        </div>
    );
});

QueuedMessageChips.displayName = 'QueuedMessageChips';
