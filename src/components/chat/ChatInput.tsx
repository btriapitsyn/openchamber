import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Square, Settings } from 'lucide-react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { FileAttachmentButton, AttachedFilesList } from './FileAttachment';
import { FileMentionAutocomplete, type FileMentionHandle } from './FileMentionAutocomplete';
import { CommandAutocomplete, type CommandAutocompleteHandle } from './CommandAutocomplete';
import { cn } from '@/lib/utils';

interface ChatInputProps {
    onOpenSettings?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onOpenSettings }) => {
    const [message, setMessage] = React.useState('');
    const [isDragging, setIsDragging] = React.useState(false);
    const [showFileMention, setShowFileMention] = React.useState(false);
    const [mentionQuery, setMentionQuery] = React.useState('');
    const [showCommandAutocomplete, setShowCommandAutocomplete] = React.useState(false);
    const [commandQuery, setCommandQuery] = React.useState('');
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const dropZoneRef = React.useRef<HTMLDivElement>(null);
    const mentionRef = React.useRef<FileMentionHandle>(null);
    const commandRef = React.useRef<CommandAutocompleteHandle>(null);

    const {
        sendMessage,
        currentSessionId,
        abortCurrentOperation,
        streamingMessageId,
        isLoading,
        attachedFiles,
        clearAttachedFiles,
        addAttachedFile,

        messages
    } = useSessionStore();

    const { currentProviderId, currentModelId, currentAgentName, agents, setAgent, getCurrentModel } = useConfigStore();
    const { isMobile } = useUIStore();

    // Debug function for token inspection
    const debugLastMessage = () => {
        if (!currentSessionId) {
            return;
        }

        const sessionMessages = useSessionStore.getState().messages.get(currentSessionId) || [];
        const assistantMessages = sessionMessages.filter(m => m.info.role === 'assistant');

        if (assistantMessages.length === 0) {
            return;
        }

        const lastMessage = assistantMessages[assistantMessages.length - 1];

        // Check if tokens are in parts
        const tokenParts = lastMessage.parts.filter(p => (p as any).tokens);
    };



    // Add to window for easy access
    React.useEffect(() => {
        if (typeof window !== 'undefined') {
            (window as any).debugTokens = debugLastMessage;
        }
    }, [currentSessionId]);



    // Allow sending if there's content and a session
    // Users can type and send even while another message is streaming
    const hasContent = message.trim() || attachedFiles.length > 0;
    const isStreaming = streamingMessageId !== null || isLoading;
    const canAbort = streamingMessageId !== null;

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();

        // Check basic requirements
        if (!hasContent || !currentSessionId) return;

        // Preserve internal newlines but trim only leading/trailing empty lines
        const messageToSend = message.replace(/^\n+|\n+$/g, '');

        // Regular message handling (sendMessage now handles commands internally)
        // Check if we have provider and model selected
        if (!currentProviderId || !currentModelId) {
            // Cannot send without provider and model - user must select them
            console.warn('Cannot send message: provider or model not selected');
            return;
        }

        // Allow sending even if streaming - the API will queue it
        // This creates a smoother experience

        setMessage('');

        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        // Send message with await to ensure it completes
        // The improved sendMessage method now handles retries and timeouts properly
        // NOTE: attachedFiles will be cleared by sendMessage AFTER successful send
        await sendMessage(messageToSend, currentProviderId, currentModelId, currentAgentName)
            .catch(error => {
                // The improved sendMessage method handles all error scenarios properly
                // No need to restore message - the retry logic handles timeouts and network issues
                console.error('Message send failed:', error?.message || error);
            });

        // Focus back on input for continuous typing
        textareaRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // If command autocomplete is showing, pass navigation keys to it
        if (showCommandAutocomplete && commandRef.current) {
            if (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Escape' || e.key === 'Tab') {
                e.preventDefault();
                commandRef.current.handleKeyDown(e.key);
                return;
            }
        }

        // If file autocomplete is showing, pass navigation keys to it
        if (showFileMention && mentionRef.current) {
            if (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Escape' || e.key === 'Tab') {
                e.preventDefault();
                mentionRef.current.handleKeyDown(e.key);
                return;
            }
        }

        // Handle TAB key for agent cycling when no autocompletes are active
        if (e.key === 'Tab' && !showCommandAutocomplete && !showFileMention) {
            e.preventDefault();
            cycleAgent();
            return;
        }

        // Normal message submission when autocomplete is not showing
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handleAbort = () => {
        abortCurrentOperation();
    };

    const cycleAgent = () => {
        const primaryAgents = agents.filter(agent => agent.mode === 'primary');

        if (primaryAgents.length <= 1) return; // No cycling needed

        const currentIndex = primaryAgents.findIndex(agent => agent.name === currentAgentName);
        const nextIndex = (currentIndex + 1) % primaryAgents.length;
        const nextAgent = primaryAgents[nextIndex];


        setAgent(nextAgent.name);
    };

    const adjustTextareaHeight = () => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setMessage(value);
        adjustTextareaHeight();

        const cursorPosition = e.target.selectionStart;
        const textBeforeCursor = value.substring(0, cursorPosition);

        // Check for slash command at the beginning
        // Only show autocomplete if:
        // 1. Message starts with /
        // 2. No space yet (still typing command name)
        // 3. Cursor is within the command part
        if (value.startsWith('/')) {
            const firstSpace = value.indexOf(' ');
            const firstNewline = value.indexOf('\n');
            const commandEnd = Math.min(
                firstSpace === -1 ? value.length : firstSpace,
                firstNewline === -1 ? value.length : firstNewline
            );

            // Only show autocomplete if cursor is within command name
            if (cursorPosition <= commandEnd && firstSpace === -1) {
                const commandText = value.substring(1, commandEnd);
                setCommandQuery(commandText);
                setShowCommandAutocomplete(true);
                setShowFileMention(false);
            } else {
                setShowCommandAutocomplete(false);
            }
        } else {
            setShowCommandAutocomplete(false);

            // Check for @ mention
            const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

            if (lastAtSymbol !== -1) {
                const textAfterAt = textBeforeCursor.substring(lastAtSymbol + 1);
                // Check if @ is followed by word characters (no spaces)
                if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
                    setMentionQuery(textAfterAt);
                    setShowFileMention(true);
                } else {
                    setShowFileMention(false);
                }
            } else {
                setShowFileMention(false);
            }
        }
    };

    const handleFileSelect = (file: { name: string; path: string }) => {
        // Replace the @mention with the filename
        const cursorPosition = textareaRef.current?.selectionStart || 0;
        const textBeforeCursor = message.substring(0, cursorPosition);
        const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

        if (lastAtSymbol !== -1) {
            const newMessage =
                message.substring(0, lastAtSymbol) +
                file.name +
                message.substring(cursorPosition);
            setMessage(newMessage);
        }

        setShowFileMention(false);
        setMentionQuery('');

        // Focus back on textarea
        textareaRef.current?.focus();
    };

    const handleCommandSelect = (command: { name: string; description?: string; agent?: string; model?: string }) => {
        // Replace the entire message with the command name
        // The rest of the message after the command will be treated as arguments
        setMessage(`/${command.name} `);

        // Store the command metadata for use when sending
        // This could be used to override agent/model when the command is sent
        (textareaRef.current as any)._commandMetadata = command;

        setShowCommandAutocomplete(false);
        setCommandQuery('');

        // Focus back on textarea and move cursor to end
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
            }
        }, 0);
    };

    React.useEffect(() => {
        // Focus textarea when session changes (desktop only)
        if (currentSessionId && textareaRef.current && !isMobile) {
            textareaRef.current.focus();
        }
    }, [currentSessionId, isMobile]);



    // Drag and drop handlers
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (currentSessionId && !isDragging) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget === e.target) {
            setIsDragging(false);
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (!currentSessionId) return;

        const files = Array.from(e.dataTransfer.files);
        for (const file of files) {
            await addAttachedFile(file);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="pt-0 pb-2 px-4 bottom-safe-area">
            <div
                ref={dropZoneRef}
                className={cn(
                    "max-w-3xl mx-auto relative overflow-visible",
                    isDragging && "ring-2 ring-primary ring-offset-2 rounded-lg"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {isDragging && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
                        <div className="text-center">
                            <FileAttachmentButton />
                            <p className="mt-2 typography-ui-label text-muted-foreground">Drop files here to attach</p>
                        </div>
                    </div>
                )}
                <AttachedFilesList />
                <div className="relative overflow-visible">
                    {/* Command autocomplete */}
                    {showCommandAutocomplete && (
                        <CommandAutocomplete
                            ref={commandRef}
                            searchQuery={commandQuery}
                            onCommandSelect={handleCommandSelect}
                            onClose={() => setShowCommandAutocomplete(false)}
                        />
                    )}
                    {/* File mention autocomplete */}
                    {showFileMention && (
                        <FileMentionAutocomplete
                            ref={mentionRef}
                            searchQuery={mentionQuery}
                            onFileSelect={handleFileSelect}
                            onClose={() => setShowFileMention(false)}
                        />
                    )}
                    <div>
                        <Textarea
                            ref={textareaRef}
                            value={message}
                            onChange={handleTextChange}
                            onKeyDown={handleKeyDown}
                            placeholder={currentSessionId ? "@ to attach files; / for commands" : "Select or create a session to start chatting"}
                            disabled={!currentSessionId}
                            className={cn(
                                "min-h-[52px] max-h-[200px] resize-none pr-20 py-2",
                                !isMobile && "pt-3 pb-4",
                                "focus-visible:ring-2 focus-visible:ring-primary/20",
                                "border-border/20 bg-background"
                            )}
                            rows={1}
                        />
                    </div>

                    <div className="absolute top-1/2 -translate-y-1/2 right-2 flex gap-1">
                        <FileAttachmentButton />
                        {canAbort ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={handleAbort}
                                className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                            >
                                <Square className="h-4 w-4 fill-current" />
                            </Button>
                        ) : (
                            <Button
                                type="submit"
                                size="sm"
                                variant="ghost"
                                disabled={!hasContent || !currentSessionId}
                                className={cn(
                                    "h-8 w-8 p-0 transition-colors",
                                    hasContent && currentSessionId
                                        ? isStreaming
                                            ? "opacity-50 hover:bg-primary/5 hover:text-primary/50"
                                            : "hover:bg-primary/10 hover:text-primary"
                                        : "opacity-30"
                                )}
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>

                {onOpenSettings && (
                    <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={onOpenSettings}
                        className="h-[52px] w-[52px]"
                    >
                        <Settings className="h-4 w-4" />
                    </Button>
                )}


            </div>
        </form>
    );
};
