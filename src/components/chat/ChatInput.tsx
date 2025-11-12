import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { PaperPlaneRight, PauseCircle, HeadCircuit as Brain, Folder as FolderOpen, XCircle } from '@phosphor-icons/react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import type { EditPermissionMode } from '@/stores/types/sessionTypes';
import { getEditModeColors } from '@/lib/permissions/editModeColors';
import { FileAttachmentButton, AttachedFilesList } from './FileAttachment';
import { FileMentionAutocomplete, type FileMentionHandle } from './FileMentionAutocomplete';
import { CommandAutocomplete, type CommandAutocompleteHandle } from './CommandAutocomplete';
import { cn } from '@/lib/utils';
import { ServerFilePicker } from './ServerFilePicker';
import { ModelControls } from './ModelControls';
import { WorkingPlaceholder } from './message/parts/WorkingPlaceholder';
import { useAssistantStatus } from '@/hooks/useAssistantStatus';
import { toast } from 'sonner';
import { useFileStore } from '@/stores/fileStore';

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

    const sendMessage = useSessionStore((state) => state.sendMessage);
    const currentSessionId = useSessionStore((state) => state.currentSessionId);
    const abortCurrentOperation = useSessionStore((state) => state.abortCurrentOperation);
    const acknowledgeSessionAbort = useSessionStore((state) => state.acknowledgeSessionAbort);
    const attachedFiles = useSessionStore((state) => state.attachedFiles);
    const addAttachedFile = useSessionStore((state) => state.addAttachedFile);
    const addServerFile = useSessionStore((state) => state.addServerFile);
    const clearAttachedFiles = useSessionStore((state) => state.clearAttachedFiles);

    const { currentProviderId, currentModelId, currentAgentName, agents, providers, setAgent } = useConfigStore();
    const { isMobile } = useUIStore();
    const { working } = useAssistantStatus();
    const [showAbortStatus, setShowAbortStatus] = React.useState(false);
    const abortTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const prevWasAbortedRef = React.useRef(false);


    const currentAgent = React.useMemo(() => {
        if (!currentAgentName) {
            return undefined;
        }
        return agents.find((agent) => agent.name === currentAgentName);
    }, [agents, currentAgentName]);

    const agentDefaultEditMode = React.useMemo<EditPermissionMode>(() => {
        const agentPermissionRaw = currentAgent?.permission?.edit;
        let defaultMode: EditPermissionMode = 'ask';

        if (agentPermissionRaw === 'allow' || agentPermissionRaw === 'ask' || agentPermissionRaw === 'deny' || agentPermissionRaw === 'full') {
            defaultMode = agentPermissionRaw;
        }

        const editToolConfigured = currentAgent ? (currentAgent.tools?.['edit'] !== false) : false;
        if (!currentAgent || !editToolConfigured) {
            defaultMode = 'deny';
        }

        return defaultMode;
    }, [currentAgent]);

    const canOverrideDefaultEdit = agentDefaultEditMode === 'ask';

    const sessionAgentEditOverride = useSessionStore(
        React.useCallback((state) => {
            if (!currentSessionId || !currentAgentName) {
                return undefined;
            }
            const sessionMap = state.sessionAgentEditModes.get(currentSessionId);
            return sessionMap?.get(currentAgentName);
        }, [currentSessionId, currentAgentName])
    );

    const effectiveEditPermission = React.useMemo<EditPermissionMode>(() => {
        if (canOverrideDefaultEdit && sessionAgentEditOverride) {
            return sessionAgentEditOverride;
        }
        return agentDefaultEditMode;
    }, [agentDefaultEditMode, canOverrideDefaultEdit, sessionAgentEditOverride]);

    const chatInputAccent = React.useMemo(() => getEditModeColors(effectiveEditPermission), [effectiveEditPermission]);

    const notificationModelName = React.useMemo(() => {
        if (!currentProviderId || !currentModelId || providers.length === 0) {
            return currentModelId || null;
        }

        const provider = providers.find((p) => p.id === currentProviderId);
        if (!provider || !Array.isArray(provider.models)) {
            return currentModelId;
        }

        const model = provider.models.find((m: Record<string, unknown>) => (m as Record<string, unknown>).id === currentModelId);
        if (!model) {
            return currentModelId;
        }

        const record = model as Record<string, unknown>;
        const candidateKeys = ['name', 'displayName', 'label', 'title'];
        for (const key of candidateKeys) {
            const value = record?.[key];
            if (typeof value === 'string' && value.trim().length > 0) {
                return value.trim();
            }
        }

        const idValue = record?.id;
        return typeof idValue === 'string' && idValue.trim().length > 0 ? idValue.trim() : currentModelId;
    }, [providers, currentProviderId, currentModelId]);

    const notificationAgentLabel = React.useMemo(() => {
        if (typeof currentAgentName === 'string' && currentAgentName.trim().length > 0) {
            return currentAgentName.trim();
        }
        return 'selected agent';
    }, [currentAgentName]);

    const notificationBody = React.useMemo(() => {
        const modelLabel = notificationModelName || 'selected model';
        const agentLabel = notificationAgentLabel || 'selected agent';
        return `${modelLabel} in ${agentLabel} mode is done working`;
    }, [notificationModelName, notificationAgentLabel]);

    const chatInputWrapperStyle = React.useMemo<React.CSSProperties | undefined>(() => {
        if (!chatInputAccent) {
            return undefined;
        }
        return {
            borderColor: chatInputAccent.border ?? chatInputAccent.text,
            borderWidth: chatInputAccent.borderWidth ?? 1,
        };
    }, [chatInputAccent]);






    // Allow sending if there's content and a session
    // Users can type and send even while another message is streaming
    const hasContent = message.trim() || attachedFiles.length > 0;
    // Show stop button only when the assistant can actually abort the run
    const canAbort = working.canAbort;

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

        const attachmentsToSend = attachedFiles.map((file) => ({ ...file }));
        if (attachmentsToSend.length > 0) {
            clearAttachedFiles();
        }

        setMessage('');

        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        // Send message with await to ensure it completes
        // The improved sendMessage method now handles retries and timeouts properly
        await sendMessage(messageToSend, currentProviderId, currentModelId, currentAgentName, attachmentsToSend)
            .catch(error => {
                console.error('Message send failed:', error?.message || error);
                if (attachmentsToSend.length > 0) {
                    useFileStore.setState({ attachedFiles: attachmentsToSend });
                    toast.error('Message failed to send. Attachments restored.');
                }
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

        // Send with Enter on non-mobile or when we detect physical keyboard
        // On mobile devices, virtual keyboards rarely fire KeyboardEvent
        // If we reach here on mobile, it's likely a physical keyboard attachment
        if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const startAbortIndicator = React.useCallback(() => {
        if (abortTimeoutRef.current) {
            clearTimeout(abortTimeoutRef.current);
            abortTimeoutRef.current = null;
        }

        setShowAbortStatus(true);

        abortTimeoutRef.current = setTimeout(() => {
            setShowAbortStatus(false);
            abortTimeoutRef.current = null;
        }, 1800);
    }, []);

    const handleAbort = React.useCallback(() => {
        startAbortIndicator();

        void abortCurrentOperation();
    }, [abortCurrentOperation, startAbortIndicator]);

    const cycleAgent = () => {
        const primaryAgents = agents.filter(agent => isPrimaryMode(agent.mode));

        if (primaryAgents.length <= 1) return; // No cycling needed

        const currentIndex = primaryAgents.findIndex(agent => agent.name === currentAgentName);
        const nextIndex = (currentIndex + 1) % primaryAgents.length;
        const nextAgent = primaryAgents[nextIndex];


        setAgent(nextAgent.name);
    };

    const adjustTextareaHeight = React.useCallback(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    }, []);

    const updateAutocompleteState = React.useCallback((value: string, cursorPosition: number) => {
        if (value.startsWith('/')) {
            const firstSpace = value.indexOf(' ');
            const firstNewline = value.indexOf('\n');
            const commandEnd = Math.min(
                firstSpace === -1 ? value.length : firstSpace,
                firstNewline === -1 ? value.length : firstNewline
            );

            if (cursorPosition <= commandEnd && firstSpace === -1) {
                const commandText = value.substring(1, commandEnd);
                setCommandQuery(commandText);
                setShowCommandAutocomplete(true);
                setShowFileMention(false);
            } else {
                setShowCommandAutocomplete(false);
            }
            return;
        }

        setShowCommandAutocomplete(false);

        const textBeforeCursor = value.substring(0, cursorPosition);
        const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

        if (lastAtSymbol !== -1) {
            const textAfterAt = textBeforeCursor.substring(lastAtSymbol + 1);
            if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
                setMentionQuery(textAfterAt);
                setShowFileMention(true);
            } else {
                setShowFileMention(false);
            }
        } else {
            setShowFileMention(false);
        }
    }, [setCommandQuery, setMentionQuery, setShowCommandAutocomplete, setShowFileMention]);

    const insertTextAtSelection = React.useCallback((text: string) => {
        if (!text) {
            return;
        }

        const textarea = textareaRef.current;
        if (!textarea) {
            const nextValue = message + text;
            setMessage(nextValue);
            updateAutocompleteState(nextValue, nextValue.length);
            requestAnimationFrame(() => adjustTextareaHeight());
            return;
        }

        const start = textarea.selectionStart ?? message.length;
        const end = textarea.selectionEnd ?? message.length;
        const nextValue = `${message.substring(0, start)}${text}${message.substring(end)}`;
        setMessage(nextValue);
        const cursorPosition = start + text.length;

        requestAnimationFrame(() => {
            const currentTextarea = textareaRef.current;
            if (currentTextarea) {
                currentTextarea.selectionStart = cursorPosition;
                currentTextarea.selectionEnd = cursorPosition;
            }
            adjustTextareaHeight();
        });

        updateAutocompleteState(nextValue, cursorPosition);
    }, [adjustTextareaHeight, message, updateAutocompleteState]);

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        const cursorPosition = e.target.selectionStart ?? value.length;
        setMessage(value);
        adjustTextareaHeight();
        updateAutocompleteState(value, cursorPosition);
    };

    const handlePaste = React.useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const fileMap = new Map<string, File>();

        Array.from(e.clipboardData.files || []).forEach(file => {
            if (file.type.startsWith('image/')) {
                fileMap.set(`${file.name}-${file.size}`, file);
            }
        });

        Array.from(e.clipboardData.items || []).forEach(item => {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    fileMap.set(`${file.name}-${file.size}`, file);
                }
            }
        });

        const imageFiles = Array.from(fileMap.values());
        if (imageFiles.length === 0) {
            return;
        }

        if (!currentSessionId) {
            return;
        }

        e.preventDefault();

        const pastedText = e.clipboardData.getData('text');
        if (pastedText) {
            insertTextAtSelection(pastedText);
        }

        let attachedCount = 0;

        for (const file of imageFiles) {
            const sizeBefore = useSessionStore.getState().attachedFiles.length;
            try {
                await addAttachedFile(file);
                const sizeAfter = useSessionStore.getState().attachedFiles.length;
                if (sizeAfter > sizeBefore) {
                    attachedCount += 1;
                }
            } catch (error) {
                console.error('Clipboard image attach failed', error);
                toast.error(error instanceof Error ? error.message : 'Failed to attach image from clipboard');
            }
        }

        if (attachedCount > 0) {
            toast.success(`Attached ${attachedCount} image${attachedCount > 1 ? 's' : ''} from clipboard`);
        }
    }, [addAttachedFile, currentSessionId, insertTextAtSelection]);

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
        const textareaElement = textareaRef.current as HTMLTextAreaElement & { _commandMetadata?: typeof command };
        if (textareaElement) {
            textareaElement._commandMetadata = command;
        }

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
        let attachedCount = 0;

        for (const file of files) {
            const sizeBefore = useSessionStore.getState().attachedFiles.length;
            try {
                await addAttachedFile(file);
                const sizeAfter = useSessionStore.getState().attachedFiles.length;
                if (sizeAfter > sizeBefore) {
                    attachedCount += 1;
                }
            } catch (error) {
                console.error('File attach failed', error);
                toast.error(error instanceof Error ? error.message : 'Failed to attach file');
            }
        }

        if (attachedCount > 0) {
            toast.success(`Attached ${attachedCount} file${attachedCount > 1 ? 's' : ''}`);
        }
    };

    const handleServerFilesSelected = React.useCallback(async (files: Array<{ path: string; name: string }>) => {
        let attachedCount = 0;

        for (const file of files) {
            const sizeBefore = useSessionStore.getState().attachedFiles.length;
            try {
                await addServerFile(file.path, file.name);
                const sizeAfter = useSessionStore.getState().attachedFiles.length;
                if (sizeAfter > sizeBefore) {
                    attachedCount += 1;
                }
            } catch (error) {
                console.error('Server file attach failed', error);
                toast.error(error instanceof Error ? error.message : 'Failed to attach file');
            }
        }

        if (attachedCount > 0) {
            toast.success(`Attached ${attachedCount} file${attachedCount > 1 ? 's' : ''}`);
        }
    }, [addServerFile]);

    const footerGapClass = 'gap-x-1.5 gap-y-0';
    const footerPaddingClass = isMobile ? 'px-1.5 py-1.5' : 'px-2.5 py-1.5';
    const footerHeightClass = isMobile ? 'h-9 w-9' : 'h-7 w-7';
    const iconSizeClass = isMobile ? 'h-5 w-5' : 'h-[18px] w-[18px]';

    const iconButtonBaseClass = cn(
        footerHeightClass,
        'flex items-center justify-center text-muted-foreground transition-none outline-none focus:outline-none flex-shrink-0'
    );

    const actionButton = (
        <button
            type='submit'
            disabled={!hasContent || !currentSessionId}
            className={cn(
                iconButtonBaseClass,
                hasContent && currentSessionId
                    ? 'text-primary hover:text-primary'
                    : 'opacity-30'
            )}
            aria-label='Send message'
        >
            <PaperPlaneRight className={cn(iconSizeClass)} />
        </button>
    );

    const projectFileButton = (
        <ServerFilePicker onFilesSelected={handleServerFilesSelected} multiSelect>
            <button
                type='button'
                className={iconButtonBaseClass}
                title='Attach files from project'
                aria-label='Attach files from project'
            >
                <FolderOpen className={cn(iconSizeClass, 'text-current')} />
            </button>
        </ServerFilePicker>
    );

    const settingsButton = onOpenSettings ? (
        <button
            type='button'
            onClick={onOpenSettings}
            className={iconButtonBaseClass}
            title='Model and agent settings'
            aria-label='Model and agent settings'
        >
            <Brain className={cn(iconSizeClass, 'text-current')} />
        </button>
    ) : null;

    const attachmentsControls = (
        <>
            <FileAttachmentButton />
            {projectFileButton}
            {settingsButton}
        </>
    );

    const workingStatusText = working.statusText;

    React.useEffect(() => {
        const pendingAbortBanner = Boolean(working.wasAborted);
        if (!prevWasAbortedRef.current && pendingAbortBanner && !showAbortStatus) {
            startAbortIndicator();
            if (currentSessionId) {
                acknowledgeSessionAbort(currentSessionId);
            }
        }
        prevWasAbortedRef.current = pendingAbortBanner;
    }, [
        acknowledgeSessionAbort,
        currentSessionId,
        showAbortStatus,
        startAbortIndicator,
        working.wasAborted,
    ]);

    React.useEffect(() => {
        return () => {
            if (abortTimeoutRef.current) {
                clearTimeout(abortTimeoutRef.current);
                abortTimeoutRef.current = null;
            }
        };
    }, []);

    const shouldRenderPlaceholder = !showAbortStatus && !working.abortActive;

    return (
        <form onSubmit={handleSubmit} className="pt-0 pb-4 bottom-safe-area">
            <div className="chat-column mb-1.5 h-[1.2rem] flex items-center justify-between gap-2 overflow-visible">
                <div className="flex-1 flex items-center overflow-hidden">
                    {showAbortStatus ? (
                        <div className="flex h-full items-center text-[var(--status-error)] pl-[2ch]">
                            <span className="flex items-center gap-1.5 typography-ui-header">
                                <XCircle weight="duotone" size={18} aria-hidden="true" />
                                Aborted
                            </span>
                        </div>
                    ) : shouldRenderPlaceholder ? (
                        <WorkingPlaceholder
                            statusText={workingStatusText}
                            isWaitingForPermission={working.isWaitingForPermission}
                            wasAborted={working.wasAborted}
                            notificationTitle="Task is ready"
                            notificationBody={notificationBody}
                        />
                    ) : null}
                </div>
                {canAbort ? (
                    <div className="flex-shrink-0 pr-[2ch]">
                        <button
                            type='button'
                            onClick={handleAbort}
                            className='inline-flex h-[1.2rem] items-center gap-0.5 rounded-md bg-[var(--status-error)]/70 px-1 text-[0.65rem] font-medium text-white transition-colors hover:bg-[var(--status-error)]/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--status-error)]/40'
                            aria-label='Stop generating'
                        >
                            <PauseCircle weight='duotone' size={11} className='text-white' aria-hidden='true' />
                            Abort
                        </button>
                    </div>
                ) : null}
            </div>
            <div
                ref={dropZoneRef}
                className={cn(
                    "chat-column relative overflow-visible",
                    isDragging && "ring-2 ring-primary ring-offset-2 rounded-xl"
                )}

                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {isDragging && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl">
                        <div className="text-center">
                            <FileAttachmentButton />
                            <p className="mt-2 typography-ui-label text-muted-foreground">Drop files here to attach</p>
                        </div>
                    </div>
                )}
                <AttachedFilesList />
                <div
                    className={cn(
                        "rounded-xl border border-border/20 bg-input/10 dark:bg-input/30 transition-colors",
                        "flex flex-col relative overflow-visible"
                    )}
                    style={chatInputWrapperStyle}
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
                        data-chat-input="true"
                        value={message}
                        onChange={handleTextChange}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        placeholder={currentSessionId ? "@ for files; / for commands" : "Select or create a session to start chatting"}
                        disabled={!currentSessionId}
                        className={cn(
                            'min-h-[52px] max-h-[200px] resize-none border-0 bg-inherit px-3 shadow-none rounded-t-xl rounded-b-none',
                            isMobile ? "py-2.5" : "pt-4 pb-2",
                            "focus-visible:ring-0 focus-visible:outline-none"
                        )}
                        rows={1}
                    />
                    <div
                        className={cn(
                            'bg-inherit rounded-b-xl',
                            footerPaddingClass,
                            isMobile ? 'flex items-center gap-x-1.5' : cn('flex items-center justify-between', footerGapClass)
                        )}
                    >
                        {isMobile ? (
                            <div className="flex w-full items-center gap-x-1.5">
                                <div className="flex items-center flex-shrink-0 gap-x-1">
                                    {attachmentsControls}
                                </div>
                                <div className="flex-1" />
                                <div className="flex items-center gap-x-1 min-w-0">
                                    <ModelControls className={cn('flex items-center justify-end min-w-0')} />
                                    {actionButton}
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className={cn("flex items-center flex-shrink-0", footerGapClass)}>
                                    {attachmentsControls}
                                </div>
                                <div className={cn('flex items-center flex-1 justify-end', footerGapClass, 'md:gap-x-3')}>
                                    <ModelControls className={cn('flex-1 min-w-0 justify-end')} />
                                    {actionButton}
                                </div>
                            </>
                        )}
                    </div>
                </div>


            </div>
        </form>
    );
};
