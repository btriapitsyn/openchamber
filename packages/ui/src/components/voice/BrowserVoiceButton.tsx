/**
 * BrowserVoiceButton Component
 *
 * Voice toggle button for browser-based voice chat with language selection.
 * Shows visual state indicators for different voice modes.
 *
 * @example
 * ```tsx
 * <BrowserVoiceButton />
 * ```
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useBrowserVoice } from '@/hooks/useBrowserVoice';
import { useConfigStore } from '@/stores/useConfigStore';
import { browserVoiceService } from '@/lib/voice/browserVoiceService';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    RiMicOffLine,
    RiLoopLeftLine,
    RiStopLine,
    RiVolumeUpLine,
} from '@remixicon/react';
import { VoiceStatusIndicator } from './VoiceStatusIndicator';
import { toast } from '@/components/ui/toast';

// Status text for accessibility and labels
const statusLabels: Record<string, string> = {
    idle: 'Start Voice',
    listening: 'Listening',
    processing: 'Processing',
    speaking: 'AI Speaking',
    error: 'Voice Error',
};

// iOS Safari detection utility
const isIOSSafari = (): boolean => {
    if (typeof navigator === 'undefined') return false;
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/i.test(userAgent);
    const isSafari = /safari/i.test(userAgent) && !/chrome|crios|crmo/i.test(userAgent);
    return isIOS && isSafari;
};

/**
 * Browser Voice Button with language selection
 */
export function BrowserVoiceButton() {
    const voiceModeEnabled = useConfigStore((s) => s.voiceModeEnabled);
    
    const {
        status,
        isSupported,
        error,

        startVoice,
        stopVoice,
        conversationMode,
        toggleConversationMode,
        prepareVoice,
        isMobile,
        voiceProvider,
    } = useBrowserVoice();
    
    const [isPressing, setIsPressing] = useState(false);
    
    // Refs for touch handling
    const touchHandledRef = useRef(false);
    const isIOSSafariRef = useRef(false);
    const permissionRequestedRef = useRef(false);
    const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
    const longPressTriggeredRef = useRef(false);
    
    // Initialize iOS detection on mount
    useEffect(() => {
        isIOSSafariRef.current = isIOSSafari();
    }, []);

    // Pre-request microphone permission on mobile when component mounts
    // This helps ensure permission is ready when user taps
    // Only request if voice mode is enabled AND permission not already granted
    useEffect(() => {
        if (voiceModeEnabled && isMobile && isSupported && !permissionRequestedRef.current) {
            // First check if permission is already granted (doesn't activate mic)
            browserVoiceService.checkMicrophonePermission().then((alreadyGranted) => {
                if (alreadyGranted) {
                    // Permission already granted, no need to request again
                    permissionRequestedRef.current = true;
                    console.log('[BrowserVoiceButton] Permission already granted');
                } else {
                    // Permission not granted yet, request it (this will show mic indicator briefly)
                    prepareVoice().then((granted) => {
                        permissionRequestedRef.current = true;
                        console.log('[BrowserVoiceButton] Permission pre-request result:', granted);
                    }).catch(() => {
                        // Permission denied or error - will be handled when user tries to use voice
                        permissionRequestedRef.current = true;
                    });
                }
            });
        }
    }, [voiceModeEnabled, isMobile, isSupported, prepareVoice]);

    // Determine active states
    const isActive = status === 'listening' || status === 'speaking' || status === 'processing';
    const isError = status === 'error';
    const isIdle = status === 'idle';

    // Button variant based on state
    const isSpeaking = status === 'speaking';
    const variant = isSpeaking ? 'default' : isActive ? 'default' : 'ghost';

    // Show toast notification when voice error occurs
    useEffect(() => {
        if (isError && error) {
            // Improve error message for getUserMedia errors (likely HTTPS issue)
            let displayError = error;
            if (error.includes("getUserMedia") || error.includes("Cannot read properties of undefined")) {
                displayError = "Voice requires a secure connection (HTTPS) or localhost. Please use HTTPS or access via localhost.";
            }
            
            toast.error(displayError, {
                duration: 5000,
            });
        }
    }, [isError, error]);

    // Status text for accessibility
    const statusText = isError
        ? error || 'Voice Error'
        : conversationMode && status === 'idle'
          ? 'Start Voice (Continuous mode on)'
          : statusLabels[status] || 'Start Voice';

    // Tooltip content based on state
    const getTooltipContent = () => {
        if (isError && error) {
            // Improve error message for getUserMedia errors (likely HTTPS issue)
            if (error.includes("getUserMedia") || error.includes("Cannot read properties of undefined")) {
                return "Voice requires a secure connection (HTTPS) or localhost. Please use HTTPS or access via localhost.";
            }
            return error;
        }
        if (isActive) {
            return 'Stop voice conversation';
        }
        if (isMobile) {
            return 'Start voice conversation';
        }
        return `Start voice conversation (Shift+Click for continuous mode) • Cmd/Ctrl+Shift+V to toggle`;
    };

    // Handle voice activation (used by both click and touch)
    const activateVoice = useCallback(async () => {
        if (isActive) {
            stopVoice();
        } else if (status !== 'error') {
            // On mobile, we must NOT do any async operations before calling startVoice()
            // because iOS Safari requires SpeechRecognition.start() to be called
            // synchronously within the user gesture handler
            if (isMobile) {
                // Start voice immediately - no await before this!
                // Audio unlock is now handled inside startVoice() for mobile
                startVoice();
            } else {
                // Desktop can use async path
                try {
                    await startVoice();
                } catch (err) {
                    console.error('Failed to start voice:', err);
                }
            }
        } else {
            // Reset from error state
            if (isMobile) {
                startVoice();
            } else {
                try {
                    await startVoice();
                } catch (err) {
                    console.error('Failed to start voice:', err);
                }
            }
        }
    }, [isActive, status, startVoice, stopVoice, isMobile]);

    // Handle Shift+Click to toggle conversation mode
    const handleClick = useCallback(async (e: React.MouseEvent) => {
        // Prevent double-firing if touch already handled this
        if (touchHandledRef.current) {
            touchHandledRef.current = false;
            return;
        }

        // Shift+Click toggles conversation mode
        if (e.shiftKey) {
            toggleConversationMode();
            return;
        }

        await activateVoice();
    }, [activateVoice, toggleConversationMode]);

    // Handle touch start for mobile devices
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        // Prevent default to stop mouse event emulation
        e.preventDefault();

        // Mark that touch handled this interaction
        touchHandledRef.current = true;
        longPressTriggeredRef.current = false;

        // Immediate visual feedback
        setIsPressing(true);

        // Set up long-press timer for toggling conversation mode (500ms)
        longPressTimerRef.current = setTimeout(() => {
            longPressTriggeredRef.current = true;
            toggleConversationMode();
            // Haptic feedback if available
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
            setIsPressing(false);
        }, 500);
    }, [toggleConversationMode]);

    // Handle touch end
    const handleTouchEnd = useCallback(() => {
        // Clear long-press timer
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }

        // Only activate voice if long-press wasn't triggered
        if (!longPressTriggeredRef.current) {
            activateVoice();
        }

        setIsPressing(false);
    }, [activateVoice]);

    // Handle touch cancel
    const handleTouchCancel = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        setIsPressing(false);
    }, []);



    // If voice mode is disabled, don't render anything
    if (!voiceModeEnabled) {
        return null;
    }

    // If not supported, show disabled button with tooltip
    if (!isSupported) {
        const supportDetails = browserVoiceService.getSupportDetails();
        const tooltipMessage = !supportDetails.secureContext
            ? 'Voice requires HTTPS or localhost. Please use a secure connection.'
            : !supportDetails.recognition
                ? 'Speech recognition not supported in this browser. Try Chrome, Edge, or Safari.'
                : !supportDetails.synthesis
                    ? 'Speech synthesis not supported in this browser.'
                    : 'Voice not supported in this browser';

        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            size="icon"
                            variant="ghost"
                            disabled
                            aria-label={tooltipMessage}
                        >
                            <RiMicOffLine className="w-5 h-5 opacity-50" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="center">
                        <p className="max-w-[200px] text-center">{tooltipMessage}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    return (
        <div className={`flex items-center ${isMobile ? 'gap-0.5' : 'gap-1'}`}>
            {/* Voice provider indicator - hidden on mobile for cleaner look */}
            {status === 'idle' && !isMobile && (
                <div
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground"
                    title={voiceProvider === 'browser' ? 'Using Browser Voice' : voiceProvider === 'openai' ? 'Using OpenAI' : 'Using macOS Say'}
                >
                    <RiVolumeUpLine className="w-3 h-3" />
                    {voiceProvider === 'browser' ? 'Browser' : voiceProvider === 'openai' ? 'OpenAI' : 'Say'}
                </div>
            )}

            {/* Status indicator with label - show when active, simplified on mobile */}
            {isActive && !isMobile && (
                <VoiceStatusIndicator
                    status={status}
                    showLabel
                    size="sm"
                    className="mr-1"
                />
            )}

            {/* Voice button with tooltip */}
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            size="icon"
                            variant={variant}
                            onClick={handleClick}
                            onTouchStart={handleTouchStart}
                            onTouchEnd={handleTouchEnd}
                            onTouchCancel={handleTouchCancel}
                            aria-label={statusText}
                            className={`
                                relative
                                ${isMobile ? 'min-w-[32px] min-h-[32px] h-8 w-8' : 'min-w-[44px] min-h-[44px]'}
                                touch-manipulation
                                ${isPressing ? 'scale-95 opacity-80' : ''}
                                ${conversationMode && isIdle && isMobile ? 'ring-1 ring-primary/50' : ''}
                            `}
                            style={{
                                WebkitTapHighlightColor: 'transparent',
                                touchAction: 'manipulation',
                            }}
                        >
                            {isActive ? (
                                isSpeaking ? (
                                    // Green speaker icon when AI is speaking
                                    <RiVolumeUpLine className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-green-400 animate-pulse`} />
                                ) : (
                                    // Red stop icon for listening/processing (both mobile and desktop)
                                    <RiStopLine className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-red-500`} />
                                )
                            ) : (
                                <VoiceStatusIndicator
                                    status={isError ? 'idle' : status}
                                    size={isMobile ? 'sm' : 'md'}
                                    conversationMode={conversationMode}
                                />
                            )}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="center">
                        <p className="max-w-[200px] text-center">{getTooltipContent()}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            {/* Conversation mode toggle button */}
            {(status === 'idle' || status === 'error') && (
                <Button
                    size="icon"
                    variant={conversationMode ? 'default' : 'ghost'}
                    onClick={toggleConversationMode}
                    aria-label={conversationMode ? 'Continuous mode on' : 'Continuous mode off'}
                    title={conversationMode ? 'Continuous mode on' : 'Continuous mode off'}
                    className={isMobile ? 'h-7 w-7' : 'h-7 w-7'}
                >
                    <RiLoopLeftLine className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} ${conversationMode ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
                </Button>
            )}
        </div>
    );
}
