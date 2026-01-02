import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSessionStore } from '@/stores/useSessionStore';
import { useMessageStore } from '@/stores/messageStore';
import { cn } from '@/lib/utils';
import { RiLoader4Line, RiSearchLine, RiTimeLine, RiGitBranchLine } from '@remixicon/react';
import type { Part } from '@opencode-ai/sdk';

interface TimelineDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onScrollToMessage?: (messageId: string) => void;
}

// Helper: format relative time (e.g., "2 hours ago")
function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(timestamp).toLocaleDateString();
}

export const TimelineDialog: React.FC<TimelineDialogProps> = ({ open, onOpenChange, onScrollToMessage }) => {
    const currentSessionId = useSessionStore((state) => state.currentSessionId);
    const messages = useMessageStore((state) =>
        currentSessionId ? state.messages.get(currentSessionId) || [] : []
    );
    const revertToMessage = useSessionStore((state) => state.revertToMessage);
    const forkFromMessage = useSessionStore((state) => state.forkFromMessage);
    const loadSessions = useSessionStore((state) => state.loadSessions);

    const [forkingMessageId, setForkingMessageId] = React.useState<string | null>(null);
    const [searchQuery, setSearchQuery] = React.useState('');

    // Filter user messages (reversed for newest first)
    const userMessages = React.useMemo(() => {
        const filtered = messages.filter(m => m.info.role === 'user');
        return filtered.reverse();
    }, [messages]);

    // Filter by search query
    const filteredMessages = React.useMemo(() => {
        if (!searchQuery.trim()) return userMessages;

        const query = searchQuery.toLowerCase();
        return userMessages.filter((message) => {
            const preview = getMessagePreview(message.parts).toLowerCase();
            return preview.includes(query);
        });
    }, [userMessages, searchQuery]);

    // Handle fork with loading state and session refresh
    const handleFork = async (messageId: string) => {
        if (!currentSessionId) return;
        setForkingMessageId(messageId);
        try {
            await forkFromMessage(currentSessionId, messageId);
            await loadSessions();
            onOpenChange(false);
        } finally {
            setForkingMessageId(null);
        }
    };

    if (!currentSessionId) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[70vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <RiTimeLine className="h-5 w-5" />
                        Conversation Timeline
                    </DialogTitle>
                    <DialogDescription>
                        Navigate to any point in the conversation or fork a new session
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center gap-2 mt-2">
                    <RiSearchLine className="h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search messages..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1"
                    />
                </div>

                <div className="flex-1 overflow-y-auto space-y-2">
                    {filteredMessages.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                            {searchQuery ? 'No messages found' : 'No messages in this session yet'}
                        </div>
                    ) : (
                        filteredMessages.map((message) => {
                            const preview = getMessagePreview(message.parts);
                            const timestamp = message.info.time.created;
                            const relativeTime = formatRelativeTime(timestamp);

                            return (
                                <div
                                    key={message.info.id}
                                    className={cn(
                                        "group flex items-start gap-3 p-3 rounded-lg border transition-all",
                                        "hover:border-primary/50 hover:bg-muted/30"
                                    )}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="typography-meta text-muted-foreground">
                                                Message {userMessages.length - userMessages.indexOf(message)}
                                            </span>
                                            <span className="typography-meta text-muted-foreground">
                                                •
                                            </span>
                                            <span className="typography-meta text-muted-foreground">
                                                {relativeTime}
                                            </span>
                                        </div>
                                        <p className="typography-small text-foreground mt-1 line-clamp-2">
                                            {preview || '[No text content]'}
                                        </p>
                                    </div>

                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                onScrollToMessage?.(message.info.id);
                                                onOpenChange(false);
                                            }}
                                        >
                                            Go here
                                        </Button>

                                        <Button
                                            size="sm"
                                            variant="default"
                                            onClick={async () => {
                                                await revertToMessage(currentSessionId, message.info.id);
                                                onOpenChange(false);
                                            }}
                                        >
                                            Revert
                                        </Button>

                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => handleFork(message.info.id)}
                                            disabled={forkingMessageId === message.info.id}
                                        >
                                            {forkingMessageId === message.info.id ? (
                                                <RiLoader4Line className="h-4 w-4 animate-spin" />
                                            ) : 'Fork'}
                                        </Button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-start gap-2 typography-meta text-muted-foreground">
                        <RiGitBranchLine className="h-4 w-4 mt-0.5" />
                        <div>
                            <p className="font-medium mb-1">Actions</p>
                            <p>• <strong>Go here</strong> - Scroll to this message in the conversation</p>
                            <p>• <strong>Revert</strong> - Undo to this point (message text will populate input)</p>
                            <p>• <strong>Fork</strong> - Create a new session starting from here</p>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

function getMessagePreview(parts: Part[]): string {
    const textPart = parts.find(p => p.type === 'text');
    if (!textPart || typeof textPart.text !== 'string') return '';
    return textPart.text.replace(/\n/g, ' ').slice(0, 80);
}
