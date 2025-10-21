import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { PaperPlaneRight, Square, HeadCircuit as Brain, Folder as FolderOpen } from '@phosphor-icons/react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { FileAttachmentButton, AttachedFilesList } from './FileAttachment';
import { FileMentionAutocomplete, type FileMentionHandle } from './FileMentionAutocomplete';
import { CommandAutocomplete, type CommandAutocompleteHandle } from './CommandAutocomplete';
import { cn } from '@/lib/utils';
import { ServerFilePicker } from './ServerFilePicker';
import { ModelControls } from './ModelControls';

interface ChatInputProps {
    onOpenSettings?: () => void;
}

const isPrimaryMode = (mode?: string) => mode === 'primary' || mode === 'all' || mode === undefined || mode === null;

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
        addAttachedFile,
        addServerFile
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
        const primaryAgents = agents.filter(agent => isPrimaryMode(agent.mode));

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

    const handleServerFilesSelected = React.useCallback(async (files: Array<{ path: string; name: string }>) => {
        for (const file of files) {
            try {
                await addServerFile(file.path, file.name);
            } catch (error) {
                console.error('Server file attach failed', error);
            }
        }
    }, [addServerFile]);

    const footerGapClass = isMobile ? 'gap-x-1 gap-y-0.5' : 'gap-x-1.5 gap-y-0';
    const footerPaddingClass = isMobile ? 'px-1 py-1' : 'px-2.5 py-1.5';
    const footerHeightClass = isMobile ? 'h-[18px] w-[18px]' : 'h-7 w-7';
    const iconSizeClass = isMobile ? 'h-[14px] w-[14px]' : 'h-[18px] w-[18px]';

    return (
        <form onSubmit={handleSubmit} className="pt-0 pb-4 px-4 bottom-safe-area">
            <div
                ref={dropZoneRef}
                className={cn(
                    "max-w-3xl mx-auto relative overflow-visible",
                    isDragging && "ring-2 ring-primary ring-offset-2 rounded-2xl"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {isDragging && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-2xl">
                        <div className="text-center">
                            <FileAttachmentButton />
                            <p className="mt-2 typography-ui-label text-muted-foreground">Drop files here to attach</p>
                        </div>
                    </div>
                )}
                <AttachedFilesList />
                <div
                    className={cn(
                        "rounded-xl border border-border/20 bg-input/10 dark:bg-input/30",
                        "flex flex-col relative overflow-visible"
                    )}
                >
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
                    <Textarea
                        ref={textareaRef}
                        value={message}
                        onChange={handleTextChange}
                        onKeyDown={handleKeyDown}
                        placeholder={currentSessionId ? "@ for files; / for commands" : "Select or create a session to start chatting"}
                        disabled={!currentSessionId}
                        className={cn(
                            'min-h-[52px] max-h-[200px] resize-none border-0 bg-inherit px-3 shadow-none rounded-t-xl rounded-b-none',
                            isMobile ? "py-2.5" : "pt-4 pb-2",
                            "focus-visible:ring-0 focus-visible:outline-none"
                        )}
                        rows={1}
                    />
                    <div className={cn(
                        'flex items-center justify-between bg-inherit rounded-b-xl',
                        footerPaddingClass,
                        footerGapClass
                    )}>
                        <div className={cn("flex items-center flex-shrink-0", footerGapClass, isMobile ? 'gap-x-1' : undefined)}>
                            <FileAttachmentButton />
                            <ServerFilePicker onFilesSelected={handleServerFilesSelected} multiSelect>
                                <button
                                    type='button'
                                    className={cn(footerHeightClass, 'flex items-center justify-center text-muted-foreground transition-none outline-none focus:outline-none')}
                                    title='Attach files from project'
                                >
                                    <FolderOpen className={cn(iconSizeClass, 'text-current')} />
                                </button>
                            </ServerFilePicker>
                            {onOpenSettings && (
                                <button
                                    type='button'
                                    onClick={onOpenSettings}
                                    className={cn(footerHeightClass, 'flex items-center justify-center text-muted-foreground transition-none outline-none focus:outline-none')}
                                    title='Model and agent settings'
                                >
                                    <Brain className={cn(iconSizeClass, 'text-current')} />
                                </button>
                            )}
                        </div>
                        <div className={cn('flex items-center flex-1 justify-end', footerGapClass, isMobile ? 'gap-x-1' : 'md:gap-x-3')}>
                            <ModelControls className={cn('flex items-center justify-end', isMobile ? 'gap-x-1.5' : 'gap-x-5', 'flex-1 min-w-0')} />
                            {canAbort ? (
                                <button
                                    type='button'
                                    onClick={handleAbort}
                                    className={cn(footerHeightClass, 'flex items-center justify-center text-muted-foreground transition-none outline-none focus:outline-none flex-shrink-0')}
                                    aria-label='Stop generating'
                                >
                                    <Square className={cn(iconSizeClass, 'fill-current')} />
                                </button>
                            ) : (
                                <button
                                    type='submit'
                                    disabled={!hasContent || !currentSessionId}
                                    className={cn(
                                        footerHeightClass,
                                        'flex items-center justify-center text-muted-foreground transition-none outline-none focus:outline-none flex-shrink-0',
                                        hasContent && currentSessionId ? (isStreaming ? 'opacity-50' : 'text-primary hover:text-primary') : 'opacity-30'
                                    )}
                                    aria-label='Send message'
                                >
                                    <PaperPlaneRight className={cn(iconSizeClass)} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>


            </div>
        </form>
    );
};
