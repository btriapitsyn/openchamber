import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { RiAiAgentLine, RiCloseCircleLine, RiFileUploadLine, RiSendPlane2Line } from '@remixicon/react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import type { EditPermissionMode } from '@/stores/types/sessionTypes';
import { getEditModeColors } from '@/lib/permissions/editModeColors';
import { FileAttachmentButton, AttachedFilesList } from './FileAttachment';
import { FileMentionAutocomplete, type FileMentionHandle } from './FileMentionAutocomplete';
import { CommandAutocomplete, type CommandAutocompleteHandle } from './CommandAutocomplete';
import { AgentMentionAutocomplete, type AgentMentionAutocompleteHandle } from './AgentMentionAutocomplete';
import { cn } from '@/lib/utils';
import { ServerFilePicker } from './ServerFilePicker';
import { ModelControls } from './ModelControls';
import { parseAgentMentions } from '@/lib/messages/agentMentions';
import { WorkingPlaceholder } from './message/parts/WorkingPlaceholder';
import { useAssistantStatus } from '@/hooks/useAssistantStatus';
import { toast } from 'sonner';
import { useFileStore } from '@/stores/fileStore';
import { calculateEditPermissionUIState, type BashPermissionSetting } from '@/lib/permissions/editPermissionDefaults';

const MAX_VISIBLE_TEXTAREA_LINES = 8;

interface ChatInputProps {
    onOpenSettings?: () => void;
    scrollToBottom?: (options?: { instant?: boolean; force?: boolean }) => void;
}

const isPrimaryMode = (mode?: string) => mode === 'primary' || mode === 'all' || mode === undefined || mode === null;

export const ChatInput: React.FC<ChatInputProps> = ({ onOpenSettings, scrollToBottom }) => {
    const [message, setMessage] = React.useState('');
    const [isDragging, setIsDragging] = React.useState(false);
    const [showFileMention, setShowFileMention] = React.useState(false);
    const [mentionQuery, setMentionQuery] = React.useState('');
    const [showCommandAutocomplete, setShowCommandAutocomplete] = React.useState(false);
    const [commandQuery, setCommandQuery] = React.useState('');
    const [showAgentAutocomplete, setShowAgentAutocomplete] = React.useState(false);
    const [agentQuery, setAgentQuery] = React.useState('');
    const [textareaSize, setTextareaSize] = React.useState<{ height: number; maxHeight: number } | null>(null);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const dropZoneRef = React.useRef<HTMLDivElement>(null);
    const mentionRef = React.useRef<FileMentionHandle>(null);
    const commandRef = React.useRef<CommandAutocompleteHandle>(null);
    const agentRef = React.useRef<AgentMentionAutocompleteHandle>(null);

    const sendMessage = useSessionStore((state) => state.sendMessage);
    const currentSessionId = useSessionStore((state) => state.currentSessionId);
    const abortCurrentOperation = useSessionStore((state) => state.abortCurrentOperation);
    const acknowledgeSessionAbort = useSessionStore((state) => state.acknowledgeSessionAbort);
    const abortPromptSessionId = useSessionStore((state) => state.abortPromptSessionId);
    const abortPromptExpiresAt = useSessionStore((state) => state.abortPromptExpiresAt);
    const clearAbortPrompt = useSessionStore((state) => state.clearAbortPrompt);
    const attachedFiles = useSessionStore((state) => state.attachedFiles);
    const addAttachedFile = useSessionStore((state) => state.addAttachedFile);
    const addServerFile = useSessionStore((state) => state.addServerFile);
    const clearAttachedFiles = useSessionStore((state) => state.clearAttachedFiles);
    const saveSessionAgentSelection = useSessionStore((state) => state.saveSessionAgentSelection);

    const { currentProviderId, currentModelId, currentAgentName, agents, setAgent } = useConfigStore();
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

    const sessionAgentEditOverride = useSessionStore(
        React.useCallback((state) => {
            if (!currentSessionId || !currentAgentName) {
                return undefined;
            }
            const sessionMap = state.sessionAgentEditModes.get(currentSessionId);
            return sessionMap?.get(currentAgentName);
        }, [currentSessionId, currentAgentName])
    );

    const agentWebfetchPermission = currentAgent?.permission?.webfetch;
    const agentBashPermission = currentAgent?.permission?.bash as BashPermissionSetting | undefined;

    const permissionUiState = React.useMemo(() => calculateEditPermissionUIState({
        agentDefaultEditMode,
        webfetchPermission: agentWebfetchPermission,
        bashPermission: agentBashPermission,
    }), [agentDefaultEditMode, agentWebfetchPermission, agentBashPermission]);

    const selectionContextReady = Boolean(currentSessionId && currentAgentName);

    const effectiveEditPermission = React.useMemo<EditPermissionMode>(() => {
        if (selectionContextReady && sessionAgentEditOverride && permissionUiState.modeAvailability[sessionAgentEditOverride]) {
            return sessionAgentEditOverride;
        }
        return permissionUiState.cascadeDefaultMode;
    }, [permissionUiState, selectionContextReady, sessionAgentEditOverride]);

    const chatInputAccent = React.useMemo(() => getEditModeColors(effectiveEditPermission), [effectiveEditPermission]);

    const chatInputWrapperStyle = React.useMemo<React.CSSProperties | undefined>(() => {
        if (!chatInputAccent) {
            return undefined;
        }
        return {
            borderColor: chatInputAccent.border ?? chatInputAccent.text,
            borderWidth: chatInputAccent.borderWidth ?? 1,
        };
    }, [chatInputAccent]);

    const hasContent = message.trim() || attachedFiles.length > 0;

    const canAbort = working.isWorking;

    const isAbortPromptActive = React.useMemo(() => {
        if (!currentSessionId) return false;
        return abortPromptSessionId === currentSessionId && Boolean(abortPromptExpiresAt);
    }, [abortPromptSessionId, abortPromptExpiresAt, currentSessionId]);
    const canShowAbortButton = canAbort && (isMobile || isAbortPromptActive);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();

        if (!hasContent || !currentSessionId) return;

        const messageToSend = message.replace(/^\n+|\n+$/g, '');

        scrollToBottom?.({ instant: true, force: true });

        const normalizedCommand = messageToSend.trimStart();
        if (normalizedCommand.startsWith('/')) {
            const commandName = normalizedCommand
                .slice(1)
                .trim()
                .split(/\s+/)[0]
                ?.toLowerCase();
            if (commandName === 'summarize') {
                scrollToBottom?.({ instant: true, force: true });
            }
        }

        if (!currentProviderId || !currentModelId) {

            console.warn('Cannot send message: provider or model not selected');
            return;
        }

        const { sanitizedText, mention } = parseAgentMentions(messageToSend, agents);
        const agentMentionName = mention?.name;

        const attachmentsToSend = attachedFiles.map((file) => ({ ...file }));
        if (attachmentsToSend.length > 0) {
            clearAttachedFiles();
        }

        setMessage('');

        await sendMessage(sanitizedText, currentProviderId, currentModelId, currentAgentName, attachmentsToSend, agentMentionName)
            .catch((error: unknown) => {
                const rawMessage =
                    error instanceof Error
                        ? error.message
                        : typeof error === 'string'
                          ? error
                          : String(error ?? '');
                const normalized = rawMessage.toLowerCase();

                console.error('Message send failed:', rawMessage || error);

                const isSoftNetworkError =
                    normalized.includes('timeout') ||
                    normalized.includes('timed out') ||
                    normalized.includes('may still be processing') ||
                    normalized.includes('being processed') ||
                    normalized.includes('failed to fetch') ||
                    normalized.includes('networkerror') ||
                    normalized.includes('network error') ||
                    normalized.includes('gateway timeout') ||
                    normalized === 'failed to send message';

                if (isSoftNetworkError) {

                    return;
                }

                if (attachmentsToSend.length > 0) {
                    useFileStore.setState({ attachedFiles: attachmentsToSend });
                }
                toast.error(rawMessage || 'Message failed to send. Attachments restored.');
            });

        textareaRef.current?.focus();

    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {

        if (showCommandAutocomplete && commandRef.current) {
            if (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Escape' || e.key === 'Tab') {
                e.preventDefault();
                commandRef.current.handleKeyDown(e.key);
                return;
            }
        }

        if (showAgentAutocomplete && agentRef.current) {
            if (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Escape' || e.key === 'Tab') {
                e.preventDefault();
                agentRef.current.handleKeyDown(e.key);
                return;
            }
        }

        if (showFileMention && mentionRef.current) {
            if (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Escape' || e.key === 'Tab') {
                e.preventDefault();
                mentionRef.current.handleKeyDown(e.key);
                return;
            }
        }

        if (e.key === 'Tab' && !showCommandAutocomplete && !showFileMention) {
            e.preventDefault();
            cycleAgent();
            return;
        }

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
        clearAbortPrompt();
        startAbortIndicator();

        void abortCurrentOperation();
    }, [abortCurrentOperation, clearAbortPrompt, startAbortIndicator]);

    const cycleAgent = () => {
        const primaryAgents = agents.filter(agent => isPrimaryMode(agent.mode));

        if (primaryAgents.length <= 1) return;

        const currentIndex = primaryAgents.findIndex(agent => agent.name === currentAgentName);
        const nextIndex = (currentIndex + 1) % primaryAgents.length;
        const nextAgent = primaryAgents[nextIndex];

        setAgent(nextAgent.name);

        if (currentSessionId) {

            saveSessionAgentSelection(currentSessionId, nextAgent.name);
        }
    };

    const adjustTextareaHeight = React.useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea) {
            return;
        }

        textarea.style.height = 'auto';

        const view = textarea.ownerDocument?.defaultView;
        const computedStyle = view ? view.getComputedStyle(textarea) : null;
        const lineHeight = computedStyle ? parseFloat(computedStyle.lineHeight) : NaN;
        const paddingTop = computedStyle ? parseFloat(computedStyle.paddingTop) : NaN;
        const paddingBottom = computedStyle ? parseFloat(computedStyle.paddingBottom) : NaN;
        const fallbackLineHeight = 22;
        const fallbackPadding = 16;
        const paddingTotal = Number.isNaN(paddingTop) || Number.isNaN(paddingBottom)
            ? fallbackPadding
            : paddingTop + paddingBottom;
        const targetLineHeight = Number.isNaN(lineHeight) ? fallbackLineHeight : lineHeight;
        const maxHeight = targetLineHeight * MAX_VISIBLE_TEXTAREA_LINES + paddingTotal;
        const scrollHeight = textarea.scrollHeight || textarea.offsetHeight;
        const nextHeight = Math.min(scrollHeight, maxHeight);

        textarea.style.height = `${nextHeight}px`;
        textarea.style.maxHeight = `${maxHeight}px`;

        setTextareaSize((prev) => {
            if (prev && prev.height === nextHeight && prev.maxHeight === maxHeight) {
                return prev;
            }
            return { height: nextHeight, maxHeight };
        });
    }, []);

    React.useLayoutEffect(() => {
        adjustTextareaHeight();
    }, [adjustTextareaHeight, message, isMobile]);

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
                setShowAgentAutocomplete(false);
            } else {
                setShowCommandAutocomplete(false);
            }
            return;
        }

        setShowCommandAutocomplete(false);

        const textBeforeCursor = value.substring(0, cursorPosition);

        const lastHashSymbol = textBeforeCursor.lastIndexOf('#');
        if (lastHashSymbol !== -1) {
            const charBefore = lastHashSymbol > 0 ? textBeforeCursor[lastHashSymbol - 1] : null;
            const textAfterHash = textBeforeCursor.substring(lastHashSymbol + 1);
            const hasSeparator = textAfterHash.includes(' ') || textAfterHash.includes('\n');
            const isWordBoundary = !charBefore || /\s/.test(charBefore);

            if (isWordBoundary && !hasSeparator) {
                setAgentQuery(textAfterHash);
                setShowAgentAutocomplete(true);
                setShowFileMention(false);
                return;
            }
        }

        setShowAgentAutocomplete(false);
        setAgentQuery('');

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
    }, [setAgentQuery, setCommandQuery, setMentionQuery, setShowAgentAutocomplete, setShowCommandAutocomplete, setShowFileMention]);

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

        textareaRef.current?.focus();
    };

    const handleAgentSelect = (agentName: string) => {
        const textarea = textareaRef.current;
        const cursorPosition = textarea?.selectionStart ?? message.length;
        const textBeforeCursor = message.substring(0, cursorPosition);
        const lastHashSymbol = textBeforeCursor.lastIndexOf('#');

        if (lastHashSymbol !== -1) {
            const newMessage =
                message.substring(0, lastHashSymbol) +
                `#${agentName} ` +
                message.substring(cursorPosition);
            setMessage(newMessage);

            const nextCursor = lastHashSymbol + agentName.length + 2;
            requestAnimationFrame(() => {
                if (textareaRef.current) {
                    textareaRef.current.selectionStart = nextCursor;
                    textareaRef.current.selectionEnd = nextCursor;
                }
                adjustTextareaHeight();
                updateAutocompleteState(newMessage, nextCursor);
            });
        }

        setShowAgentAutocomplete(false);
        setAgentQuery('');

        textareaRef.current?.focus();
    };

    const handleCommandSelect = (command: { name: string; description?: string; agent?: string; model?: string }) => {

        setMessage(`/${command.name} `);

        const textareaElement = textareaRef.current as HTMLTextAreaElement & { _commandMetadata?: typeof command };
        if (textareaElement) {
            textareaElement._commandMetadata = command;
        }

        setShowCommandAutocomplete(false);
        setCommandQuery('');

        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
            }
        }, 0);
    };

    React.useEffect(() => {

        if (currentSessionId && textareaRef.current && !isMobile) {
            textareaRef.current.focus();
        }
    }, [currentSessionId, isMobile]);

    React.useEffect(() => {
        if (abortPromptSessionId && abortPromptSessionId !== currentSessionId) {
            clearAbortPrompt();
        }
    }, [abortPromptSessionId, currentSessionId, clearAbortPrompt]);

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
            <RiSendPlane2Line className={cn(iconSizeClass)} />
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
                <RiFileUploadLine className={cn(iconSizeClass, 'text-current')} />
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
            <RiAiAgentLine className={cn(iconSizeClass, 'text-current')} />
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

    const shouldRenderPlaceholder = !showAbortStatus && (working.wasAborted || !working.abortActive);

    return (

        <form onSubmit={handleSubmit} className="pt-0 pb-4 bottom-safe-area">
            <div className="chat-column mb-1.5 h-[1.2rem] flex items-center justify-between gap-2 overflow-visible">
                <div className="flex-1 flex items-center overflow-hidden">
                    {showAbortStatus ? (
                        <div className="flex h-full items-center text-[var(--status-error)] pl-[2ch]">
                            <span className="flex items-center gap-1.5 typography-ui-header">
                                <RiCloseCircleLine size={18} aria-hidden="true" />
                                Aborted
                            </span>
                        </div>
                    ) : shouldRenderPlaceholder ? (
                        <WorkingPlaceholder
                            key={currentSessionId ?? 'no-session'}
                            statusText={workingStatusText}
                            isWaitingForPermission={working.isWaitingForPermission}
                            wasAborted={working.wasAborted}
                            completionId={working.lastCompletionId}
                            isComplete={working.isComplete}
                        />
                    ) : null}
                </div>

                {canShowAbortButton ? (
                    <div className="flex-shrink-0 pr-[2ch]">
                        {isMobile ? (
                            <button
                                type='button'
                                onClick={handleAbort}
                                className='flex items-center justify-center h-[1.2rem] w-[1.2rem] text-[var(--status-error)] transition-opacity hover:opacity-80 focus-visible:outline-none'
                                aria-label='Stop generating'
                            >
                                <RiCloseCircleLine size={18} aria-hidden='true' />
                            </button>
                        ) : (
                            <button
                                type='button'
                                onClick={handleAbort}
                                className='inline-flex h-[1.2rem] items-center gap-0.5 rounded-md bg-[var(--status-error)]/70 px-1 text-[0.65rem] font-medium text-white hover:bg-[var(--status-error)]/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--status-error)]/40'
                                aria-label='Stop generating'
                            >
                                <RiCloseCircleLine size={11} className='text-white' aria-hidden='true' />
                                Abort
                            </button>
                        )}
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
                        "rounded-xl border border-border/20 bg-input/10 dark:bg-input/30",
                        "flex flex-col relative overflow-visible"
                    )}
                    style={chatInputWrapperStyle}
                >
                        {}
                    {showCommandAutocomplete && (
                        <CommandAutocomplete
                            ref={commandRef}
                            searchQuery={commandQuery}
                            onCommandSelect={handleCommandSelect}
                            onClose={() => setShowCommandAutocomplete(false)}
                        />
                    )}
                    {}
                    {showAgentAutocomplete && (
                        <AgentMentionAutocomplete
                            ref={agentRef}
                            searchQuery={agentQuery}
                            onAgentSelect={handleAgentSelect}
                            onClose={() => setShowAgentAutocomplete(false)}
                        />
                    )}
                    {}
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
                            placeholder={currentSessionId ? "# for agents; @ for files; / for commands" : "Select or create a session to start chatting"}
                            disabled={!currentSessionId}

                        className={cn(
                            'min-h-[52px] resize-none border-0 px-3 shadow-none rounded-t-xl rounded-b-none appearance-none focus:shadow-none focus-visible:shadow-none focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-transparent hover:border-transparent bg-transparent',
                            isMobile ? "py-2.5" : "pt-4 pb-2",
                            "focus-visible:outline-none focus-visible:ring-0"
                        )}
                        style={{
                            flex: 'none',
                            height: textareaSize ? `${textareaSize.height}px` : undefined,
                            maxHeight: textareaSize ? `${textareaSize.maxHeight}px` : undefined,
                        }}
                        rows={1}
                    />
                    <div
                        className={cn(
                            'rounded-b-xl bg-transparent',
                            footerPaddingClass,
                            isMobile ? 'flex items-center gap-x-1.5' : cn('flex items-center justify-between', footerGapClass)
                        )}
                        data-chat-input-footer="true"
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
