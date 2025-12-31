import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import {
    RiAddCircleLine,
    RiAiAgentLine,
    RiAttachment2,
    RiCloseCircleLine,
    RiFileUploadLine,
    RiSendPlane2Line,
} from '@remixicon/react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { useMessageQueueStore, type QueuedMessage } from '@/stores/messageQueueStore';
import type { AttachedFile, EditPermissionMode } from '@/stores/types/sessionTypes';
import { getEditModeColors } from '@/lib/permissions/editModeColors';
import { AttachedFilesList } from './FileAttachment';
import { QueuedMessageChips } from './QueuedMessageChips';
import { FileMentionAutocomplete, type FileMentionHandle } from './FileMentionAutocomplete';
import { CommandAutocomplete, type CommandAutocompleteHandle } from './CommandAutocomplete';
import { AgentMentionAutocomplete, type AgentMentionAutocompleteHandle } from './AgentMentionAutocomplete';
import { cn } from '@/lib/utils';
import { ServerFilePicker } from './ServerFilePicker';
import { ModelControls } from './ModelControls';
import { parseAgentMentions } from '@/lib/messages/agentMentions';
import { StatusRow } from './StatusRow';
import { useAssistantStatus } from '@/hooks/useAssistantStatus';
import { useCurrentSessionActivity } from '@/hooks/useSessionActivity';
import { toast } from 'sonner';
import { useFileStore } from '@/stores/fileStore';
import { calculateEditPermissionUIState, type BashPermissionSetting } from '@/lib/permissions/editPermissionDefaults';
import { isVSCodeRuntime } from '@/lib/desktop';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const MAX_VISIBLE_TEXTAREA_LINES = 8;
const EMPTY_QUEUE: QueuedMessage[] = [];

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
    const newSessionDraftOpen = useSessionStore((state) => state.newSessionDraft?.open);
    const abortCurrentOperation = useSessionStore((state) => state.abortCurrentOperation);
    const acknowledgeSessionAbort = useSessionStore((state) => state.acknowledgeSessionAbort);
    const abortPromptSessionId = useSessionStore((state) => state.abortPromptSessionId);
    const abortPromptExpiresAt = useSessionStore((state) => state.abortPromptExpiresAt);
    const clearAbortPrompt = useSessionStore((state) => state.clearAbortPrompt);
    const sessionAbortFlags = useSessionStore((state) => state.sessionAbortFlags);
    const attachedFiles = useSessionStore((state) => state.attachedFiles);
    const addAttachedFile = useSessionStore((state) => state.addAttachedFile);
    const addServerFile = useSessionStore((state) => state.addServerFile);
    const clearAttachedFiles = useSessionStore((state) => state.clearAttachedFiles);
    const saveSessionAgentSelection = useSessionStore((state) => state.saveSessionAgentSelection);
    const consumePendingInputText = useSessionStore((state) => state.consumePendingInputText);
    const pendingInputText = useSessionStore((state) => state.pendingInputText);

    const { currentProviderId, currentModelId, currentAgentName, setAgent, getVisibleAgents } = useConfigStore();
    const agents = getVisibleAgents();
    const { isMobile, inputBarOffset, isKeyboardOpen } = useUIStore();
    const { working } = useAssistantStatus();
    const [showAbortStatus, setShowAbortStatus] = React.useState(false);
    const abortTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const prevWasAbortedRef = React.useRef(false);
    const sendTriggeredByPointerDownRef = React.useRef(false);

    // Message queue
    const queueModeEnabled = useMessageQueueStore((state) => state.queueModeEnabled);
    const queuedMessages = useMessageQueueStore(
        React.useCallback(
            (state) => {
                if (!currentSessionId) return EMPTY_QUEUE;
                return state.queuedMessages[currentSessionId] ?? EMPTY_QUEUE;
            },
            [currentSessionId]
        )
    );
    const addToQueue = useMessageQueueStore((state) => state.addToQueue);
    const clearQueue = useMessageQueueStore((state) => state.clearQueue);

    // Session activity for auto-send on idle
    const { phase: sessionPhase } = useCurrentSessionActivity();
    const prevSessionPhaseRef = React.useRef(sessionPhase);
    const autoSendTriggeredRef = React.useRef(false);

    const handleTextareaPointerDownCapture = React.useCallback((event: React.PointerEvent<HTMLTextAreaElement>) => {
        if (!isMobile) {
            return;
        }

        if (event.pointerType !== 'touch') {
            return;
        }

        const textarea = textareaRef.current;
        if (!textarea) {
            return;
        }

        if (document.activeElement === textarea) {
            return;
        }

        // Prevent iOS from scrolling the page to reveal the input.
        event.preventDefault();
        event.stopPropagation();

        const scroller = document.scrollingElement;
        if (scroller && scroller.scrollTop !== 0) {
            scroller.scrollTop = 0;
        }
        if (window.scrollY !== 0) {
            window.scrollTo(0, 0);
        }

        try {
            textarea.focus({ preventScroll: true });
        } catch {
            textarea.focus();
        }

        const len = textarea.value.length;
        try {
            textarea.setSelectionRange(len, len);
        } catch {
            // ignored
        }
    }, [isMobile]);

    // Consume pending input text (e.g., from revert action)
    React.useEffect(() => {
        if (pendingInputText !== null) {
            const text = consumePendingInputText();
            if (text) {
                setMessage(text);
                // Focus textarea after setting message
                setTimeout(() => {
                    textareaRef.current?.focus();
                }, 0);
            }
        }
    }, [pendingInputText, consumePendingInputText]);

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

    // VS Code webviews tend to have stronger status border colors; in web/desktop themes the same
    // border tokens can already be subtle, so avoid double-softening there.
    const softenBorderColor = React.useCallback((color: string) => (
        isVSCodeRuntime()
            ? `color-mix(in srgb, ${color} 55%, transparent)`
            : color
    ), []);

    const chatInputWrapperStyle = React.useMemo<React.CSSProperties | undefined>(() => {
        // Keep border width stable so toggling modes doesn't shift layout.
        const baseBorderWidth = isVSCodeRuntime() ? 1 : 2;

        if (!chatInputAccent) {
            return { borderWidth: baseBorderWidth };
        }

        const borderColor = chatInputAccent.border ?? chatInputAccent.text;
        return {
            borderColor: softenBorderColor(borderColor),
            borderWidth: baseBorderWidth,
        };
    }, [chatInputAccent, softenBorderColor]);

    const hasContent = message.trim() || attachedFiles.length > 0;
    const hasQueuedMessages = queuedMessages.length > 0;
    const canSend = hasContent || hasQueuedMessages;

    const canAbort = working.isWorking;

    const isAbortPromptActive = React.useMemo(() => {
        if (!currentSessionId) return false;
        return abortPromptSessionId === currentSessionId && Boolean(abortPromptExpiresAt);
    }, [abortPromptSessionId, abortPromptExpiresAt, currentSessionId]);

    // Add message to queue instead of sending
    const handleQueueMessage = React.useCallback(() => {
        if (!hasContent || !currentSessionId) return;

        const messageToQueue = message.replace(/^\n+|\n+$/g, '');
        const attachmentsToQueue = attachedFiles.map((file) => ({ ...file }));

        addToQueue(currentSessionId, {
            content: messageToQueue,
            attachments: attachmentsToQueue.length > 0 ? attachmentsToQueue : undefined,
        });

        // Clear input and attachments
        setMessage('');
        if (attachmentsToQueue.length > 0) {
            clearAttachedFiles();
        }

        if (!isMobile) {
            textareaRef.current?.focus();
        }
    }, [hasContent, currentSessionId, message, attachedFiles, addToQueue, clearAttachedFiles, isMobile]);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();

        if (!canSend || (!currentSessionId && !newSessionDraftOpen)) return;

        scrollToBottom?.({ instant: true, force: true });

        if (!currentProviderId || !currentModelId) {
            console.warn('Cannot send message: provider or model not selected');
            return;
        }

        // Build the primary message (first part) and additional parts
        let primaryText = '';
        let primaryAttachments: AttachedFile[] = [];
        let agentMentionName: string | undefined;
        const additionalParts: Array<{ text: string; attachments?: AttachedFile[] }> = [];

        // Process queued messages first
        for (let i = 0; i < queuedMessages.length; i++) {
            const queuedMsg = queuedMessages[i];
            const { sanitizedText, mention } = parseAgentMentions(queuedMsg.content, agents);
            
            // Use agent mention from first message that has one
            if (!agentMentionName && mention?.name) {
                agentMentionName = mention.name;
            }

            if (i === 0) {
                // First queued message becomes primary
                primaryText = sanitizedText;
                primaryAttachments = queuedMsg.attachments ?? [];
            } else {
                // Subsequent queued messages become additional parts
                additionalParts.push({
                    text: sanitizedText,
                    attachments: queuedMsg.attachments,
                });
            }
        }

        // Add current input
        if (hasContent) {
            const messageToSend = message.replace(/^\n+|\n+$/g, '');
            const { sanitizedText, mention } = parseAgentMentions(messageToSend, agents);
            const attachmentsToSend = attachedFiles.map((file) => ({ ...file }));

            if (!agentMentionName && mention?.name) {
                agentMentionName = mention.name;
            }

            if (queuedMessages.length === 0) {
                // No queue - current input is primary
                primaryText = sanitizedText;
                primaryAttachments = attachmentsToSend;
            } else {
                // Has queue - current input is additional part
                additionalParts.push({
                    text: sanitizedText,
                    attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
                });
            }
        }

        if (!primaryText && additionalParts.length === 0) return;

        // Clear queue and input
        if (currentSessionId && hasQueuedMessages) {
            clearQueue(currentSessionId);
        }
        setMessage('');
        if (attachedFiles.length > 0) {
            clearAttachedFiles();
        }

        if (isMobile) {
            textareaRef.current?.blur();
        }

        // Handle /summarize command scroll
        const normalizedCommand = primaryText.trimStart();
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

        // Collect all attachments for error recovery
        const allAttachments = [
            ...primaryAttachments,
            ...additionalParts.flatMap(p => p.attachments ?? []),
        ];

        await sendMessage(
            primaryText, 
            currentProviderId, 
            currentModelId, 
            currentAgentName, 
            primaryAttachments, 
            agentMentionName,
            additionalParts.length > 0 ? additionalParts : undefined
        ).catch((error: unknown) => {
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

                if (allAttachments.length > 0) {
                    useFileStore.setState({ attachedFiles: allAttachments });
                }
                toast.error(rawMessage || 'Message failed to send. Attachments restored.');
            });

        if (!isMobile) {
            textareaRef.current?.focus();
        }
    };

    // Keep a ref to handleSubmit for auto-send effect
    const handleSubmitRef = React.useRef(handleSubmit);
    handleSubmitRef.current = handleSubmit;

    // Auto-send queued messages when session becomes idle (but not after abort)
    React.useEffect(() => {
        const wasWorking = prevSessionPhaseRef.current === 'busy' || prevSessionPhaseRef.current === 'cooldown';
        const isNowIdle = sessionPhase === 'idle';
        
        // Check if session was recently aborted (within last 2 seconds)
        const wasRecentlyAborted = currentSessionId && sessionAbortFlags.has(currentSessionId) && (() => {
            const abortRecord = sessionAbortFlags.get(currentSessionId);
            if (!abortRecord) return false;
            const timeSinceAbort = Date.now() - abortRecord.timestamp;
            return timeSinceAbort < 2000;
        })();
        
        // Detect transition from working to idle, but skip if aborted
        if (wasWorking && isNowIdle && queuedMessages.length > 0 && !autoSendTriggeredRef.current && !wasRecentlyAborted) {
            // Prevent double-triggering
            autoSendTriggeredRef.current = true;
            
            // Use setTimeout to avoid calling during render
            setTimeout(() => {
                if (currentSessionId && currentProviderId && currentModelId) {
                    void handleSubmitRef.current();
                }
                autoSendTriggeredRef.current = false;
            }, 100);
        }
        
        prevSessionPhaseRef.current = sessionPhase;
    }, [sessionPhase, queuedMessages.length, currentSessionId, currentProviderId, currentModelId, sessionAbortFlags]);

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

        // Handle Enter/Ctrl+Enter based on queue mode
        if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
            e.preventDefault();
            
            const isCtrlEnter = e.ctrlKey || e.metaKey;
            
            // Queue mode: Enter queues, Ctrl+Enter sends
            // Normal mode: Enter sends, Ctrl+Enter queues
            // Note: Queueing only works when there's an existing session (currentSessionId)
            // For new sessions (draft), always send immediately
            const canQueue = hasContent && currentSessionId && sessionPhase !== 'idle';
            
            if (queueModeEnabled) {
                if (isCtrlEnter || !canQueue) {
                    // Ctrl+Enter sends, or Enter when can't queue (new session)
                    handleSubmit();
                } else {
                    // Enter queues when we have a session
                    handleQueueMessage();
                }
            } else {
                if (isCtrlEnter && canQueue) {
                    // Ctrl+Enter queues when we have a session
                    handleQueueMessage();
                } else {
                    // Enter sends
                    handleSubmit();
                }
            }
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

        if (!currentSessionId && !newSessionDraftOpen) {
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
    }, [addAttachedFile, currentSessionId, newSessionDraftOpen, insertTextAtSelection]);

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
        if ((currentSessionId || newSessionDraftOpen) && !isDragging) {
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

        if (!currentSessionId && !newSessionDraftOpen) return;

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

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [projectFilePickerOpen, setProjectFilePickerOpen] = React.useState(false);

    const attachFiles = React.useCallback(async (files: FileList | File[]) => {
        let attachedCount = 0;
        const list = Array.isArray(files) ? files : Array.from(files);

        for (const file of list) {
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
    }, [addAttachedFile]);

    const handleVSCodePickFiles = React.useCallback(async () => {
        try {
            const response = await fetch('/api/vscode/pick-files');
            const data = await response.json();
            const picked = Array.isArray(data?.files) ? data.files : [];
            const skipped = Array.isArray(data?.skipped) ? data.skipped : [];

            if (skipped.length > 0) {
                const summary = skipped
                    .map((s: { name?: string; reason?: string }) => `${s?.name || 'file'}: ${s?.reason || 'skipped'}`)
                    .join('\n');
                toast.error(`Some files were skipped:\n${summary}`);
            }

            const asFiles = picked
                .map((file: { name: string; mimeType?: string; dataUrl?: string }) => {
                    if (!file?.dataUrl) return null;
                    try {
                        const [meta, base64] = file.dataUrl.split(',');
                        const mime = file.mimeType || (meta?.match(/data:(.*);base64/)?.[1] || 'application/octet-stream');
                        if (!base64) return null;
                        const binary = atob(base64);
                        const bytes = new Uint8Array(binary.length);
                        for (let i = 0; i < binary.length; i++) {
                            bytes[i] = binary.charCodeAt(i);
                        }
                        const blob = new Blob([bytes], { type: mime });
                        return new File([blob], file.name || 'file', { type: mime });
                    } catch (err) {
                        console.error('Failed to decode VS Code picked file', err);
                        return null;
                    }
                })
                .filter(Boolean) as File[];

            if (asFiles.length > 0) {
                await attachFiles(asFiles);
            }
        } catch (error) {
            console.error('VS Code file pick failed', error);
            toast.error(error instanceof Error ? error.message : 'Failed to pick files in VS Code');
        }
    }, [attachFiles]);

    const handlePickLocalFiles = React.useCallback(() => {
        if (isVSCodeRuntime()) {
            void handleVSCodePickFiles();
            return;
        }
        fileInputRef.current?.click();
    }, [handleVSCodePickFiles]);

    const handleLocalFileSelect = React.useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files) return;
        await attachFiles(files);
        event.target.value = '';
    }, [attachFiles]);

    const footerGapClass = 'gap-x-1.5 gap-y-0';
    const isVSCode = isVSCodeRuntime();
    const footerPaddingClass = isMobile ? 'px-1.5 py-1.5' : (isVSCode ? 'px-1.5 py-1' : 'px-2.5 py-1.5');
    const footerHeightClass = isMobile ? 'h-9 w-9' : (isVSCode ? 'h-[22px] w-[22px]' : 'h-7 w-7');
    const iconSizeClass = isMobile ? 'h-5 w-5' : (isVSCode ? 'h-4 w-4' : 'h-[18px] w-[18px]');

    const iconButtonBaseClass = cn(
        footerHeightClass,
        'flex items-center justify-center text-muted-foreground transition-none outline-none focus:outline-none flex-shrink-0'
    );

    // Desktop and VSCode: show abort button in footer when Esc triggered
    const showAbortInFooter = !isMobile && isAbortPromptActive && canAbort;

    const actionButton = showAbortInFooter ? (
        <button
            type='button'
            onClick={handleAbort}
            className={cn(
                iconButtonBaseClass,
                'text-[var(--status-error)] hover:text-[var(--status-error)]'
            )}
            aria-label='Stop generating'
        >
            <RiCloseCircleLine className={cn(iconSizeClass)} />
        </button>
    ) : (
        <button
            type={isMobile ? 'button' : 'submit'}
            disabled={!canSend || (!currentSessionId && !newSessionDraftOpen)}
            onPointerDownCapture={(event) => {
                if (!isMobile || event.pointerType !== 'touch') {
                    return;
                }

                if (!canSend || (!currentSessionId && !newSessionDraftOpen)) {
                    return;
                }

                sendTriggeredByPointerDownRef.current = true;
                event.preventDefault();
                event.stopPropagation();
                void handleSubmit();
            }}
            onClick={(event) => {
                if (!isMobile) {
                    return;
                }

                if (sendTriggeredByPointerDownRef.current) {
                    sendTriggeredByPointerDownRef.current = false;
                    return;
                }

                event.preventDefault();
                void handleSubmit();
            }}
            className={cn(
                iconButtonBaseClass,
                canSend && (currentSessionId || newSessionDraftOpen)
                    ? 'text-primary hover:text-primary'
                    : 'opacity-30'
            )}
            aria-label='Send message'
        >
            <RiSendPlane2Line className={cn(iconSizeClass)} />
        </button>
    );

    const attachmentMenu = (
        <>
            <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleLocalFileSelect}
                accept="*/*"
            />

            <div className="relative inline-flex">
                <ServerFilePicker
                    onFilesSelected={handleServerFilesSelected}
                    multiSelect
                    presentation={isMobile || isVSCode ? 'modal' : 'dropdown'}
                    open={projectFilePickerOpen}
                    onOpenChange={setProjectFilePickerOpen}
                >
                    {isMobile || isVSCode ? null : (
                        <button
                            type="button"
                            tabIndex={-1}
                            aria-hidden="true"
                            className="absolute inset-0 opacity-0 pointer-events-none"
                        />
                    )}
                </ServerFilePicker>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className={iconButtonBaseClass}
                            title="Add attachment"
                            aria-label="Add attachment"
                        >
                            <RiAddCircleLine className={cn(iconSizeClass, 'text-current')} />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuItem
                            onSelect={() => {
                                requestAnimationFrame(() => handlePickLocalFiles());
                            }}
                        >
                            <RiAttachment2 />
                            Attach files
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={() => {
                                requestAnimationFrame(() => {
                                    setProjectFilePickerOpen(true);
                                });
                            }}
                        >
                            <RiFileUploadLine />
                            Attach from project
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </>
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
            {attachmentMenu}
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

    // For mobile only, show abort in StatusRow; desktop and vscode show in footer (Esc-triggered)
    const showAbortInStatusRow = isMobile && canAbort;

    return (

        <form onSubmit={handleSubmit} className="pt-0 pb-2 md:pb-4 bottom-safe-area" style={isMobile && inputBarOffset > 0 && !isKeyboardOpen ? { marginBottom: `${inputBarOffset}px` } : undefined}>
            <StatusRow
                isWorking={working.isWorking}
                statusText={workingStatusText}
                isGenericStatus={working.isGenericStatus}
                isWaitingForPermission={working.isWaitingForPermission}
                wasAborted={working.wasAborted}
                abortActive={working.abortActive}
                completionId={working.lastCompletionId}
                isComplete={working.isComplete}
                showAbort={showAbortInStatusRow}
                onAbort={handleAbort}
                showAbortStatus={showAbortStatus}
            />
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
                            <div className="inline-flex justify-center">
                                <button
                                    type="button"
                                    className={iconButtonBaseClass}
                                    onClick={() => handlePickLocalFiles()}
                                    title="Attach files"
                                    aria-label="Attach files"
                                >
                                    <RiAttachment2 className={cn(iconSizeClass, 'text-current')} />
                                </button>
                            </div>
                            <p className="mt-2 typography-ui-label text-muted-foreground">Drop files here to attach</p>
                        </div>
                    </div>
                )}
                <AttachedFilesList />
                <QueuedMessageChips 
                    onEditMessage={(content) => {
                        setMessage(content);
                        setTimeout(() => {
                            textareaRef.current?.focus();
                        }, 0);
                    }} 
                />
                <div
                    className={cn(
                        "rounded-xl border border-border/80 bg-input/10 dark:bg-input/30",
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
                            onPointerDownCapture={handleTextareaPointerDownCapture}
                            placeholder={currentSessionId || newSessionDraftOpen
                                ? "# for agents; @ for files; / for commands"
                                : "Select or create a session to start chatting"}
                            disabled={!currentSessionId && !newSessionDraftOpen}

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
                                <div className="flex flex-1 items-center justify-end gap-x-1 min-w-0">
                                    <div className="flex flex-1 min-w-0 justify-end overflow-hidden">
                                        <ModelControls className={cn('w-full flex items-center justify-end min-w-0')} />
                                    </div>
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
