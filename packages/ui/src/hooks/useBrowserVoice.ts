/**
 * useBrowserVoice Hook
 * 
 * React hook for browser-based voice chat integration.
 * Manages speech recognition, AI message sending, and speech synthesis.
 * 
 * @example
 * ```typescript
 * const {
 *   status,
 *   isSupported,
 *   language,
 *   setLanguage,
 *   startVoice,
 *   stopVoice,
 *   prepareVoice,
 *   isMobile,
 * } = useBrowserVoice();
 * 
 * // Start voice mode
 * startVoice();
 * 
 * // Change language
 * setLanguage('es-ES');
 * ```
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { browserVoiceService } from '@/lib/voice/browserVoiceService';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useServerTTS } from './useServerTTS';
import { useSayTTS } from './useSayTTS';
import { summarizeText, shouldSummarize } from '@/lib/voice/summarize';

export type BrowserVoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface UseBrowserVoiceReturn {
  /** Current voice status */
  status: BrowserVoiceStatus;
  /** Whether browser voice is supported */
  isSupported: boolean;
  /** Error message if any */
  error: string | null;
  /** Current language for recognition/synthesis */
  language: string;
  /** Set language for voice operations */
  setLanguage: (lang: string) => void;
  /** Start voice mode (listening) */
  startVoice: () => void;
  /** Stop voice mode */
  stopVoice: () => void;
  /** Whether conversation mode is active */
  conversationMode: boolean;
  /** Toggle conversation mode */
  toggleConversationMode: () => void;
  /** Prepare voice for mobile (request permission) */
  prepareVoice: () => Promise<boolean>;
  /** Whether the device is mobile */
  isMobile: boolean;
  /** Current voice provider */
  voiceProvider: 'browser' | 'openai' | 'say';
}

// Storage key for persisting language preference
const LANGUAGE_STORAGE_KEY = 'browserVoiceLanguage';
// Storage key for persisting conversation mode preference
const CONVERSATION_MODE_STORAGE_KEY = 'browserVoiceConversationMode';

/**
 * Hook for managing browser-based voice conversations
 */
export function useBrowserVoice(): UseBrowserVoiceReturn {
  const [status, setStatus] = useState<BrowserVoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguageState] = useState<string>(() => {
    // Try to load from localStorage, fallback to navigator.language
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved) return saved;
    }
    return navigator.language || 'en-US';
  });
  const [conversationMode, setConversationModeState] = useState<boolean>(() => {
    // Try to load from localStorage, default to false
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(CONVERSATION_MODE_STORAGE_KEY);
      return saved === 'true';
    }
    return false;
  });
  
  const isSupported = browserVoiceService.isSupported();
  
  // Mobile detection
  const isMobile = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const userAgent = navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod|android|mobile|webos|blackberry|iemobile|opera mini/i.test(userAgent);
  }, []);
  
  // Refs for managing async operations
  const isActiveRef = useRef(false);
  const processingMessageRef = useRef(false);
  const lastTranscriptRef = useRef('');
  const messagesRef = useRef<Map<string, { info: { role: string }; parts: Array<{ type: string; text?: string }> }>>(new Map());
  
  // Store access
  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  const sendMessage = useSessionStore((s) => s.sendMessage);
  const messages = useSessionStore((s) => s.messages);
  const createSession = useSessionStore((s) => s.createSession);
  const { currentProviderId, currentModelId, currentAgentName, voiceProvider, speechRate, speechPitch, speechVolume, sayVoice, browserVoice, openaiVoice, summarizeVoiceConversation, summarizeCharacterThreshold, summarizeModel } = useConfigStore();
  
  // Server TTS for mobile (bypasses Safari audio restrictions)
  const { speak: speakServerTTS, stop: stopServerTTS, isAvailable: isServerTTSAvailable, unlockAudio: unlockServerTTSAudio } = useServerTTS();
  
  // macOS Say TTS
  const { speak: speakSayTTS, stop: stopSayTTS, isAvailable: isSayTTSAvailable, unlockAudio: unlockSayTTSAudio } = useSayTTS();
  
  // Update messages ref when messages change
  useEffect(() => {
    if (currentSessionId) {
      const sessionMessages = messages.get(currentSessionId);
      if (sessionMessages) {
        messagesRef.current = new Map(sessionMessages.map(m => [m.info.id, m]));
      }
    }
  }, [messages, currentSessionId]);
  
  // Stop voice when session changes to prevent microphone from staying active
  // This ensures voice mode doesn't carry over between sessions
  const prevSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevSessionIdRef.current !== null && prevSessionIdRef.current !== currentSessionId) {
      // Session changed - stop any active voice session
      if (isActiveRef.current) {
        console.log('[useBrowserVoice] Session changed, stopping voice');
        isActiveRef.current = false;
        processingMessageRef.current = false;
        browserVoiceService.stopListening();
        browserVoiceService.cancelSpeech();
        setStatus('idle');
        setError(null);
      }
    }
    prevSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);
  
  // Persist language preference
  const setLanguage = useCallback((lang: string) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    }
  }, []);

  // Toggle conversation mode
  const toggleConversationMode = useCallback(() => {
    setConversationModeState((prev) => {
      const next = !prev;
      browserVoiceService.setConversationMode(next);
      if (typeof window !== 'undefined') {
        localStorage.setItem(CONVERSATION_MODE_STORAGE_KEY, String(next));
      }
      return next;
    });
    
    // When turning ON continuous mode, also start listening immediately
    // Only if not already active and we have a valid session
    if (!conversationMode && !isActiveRef.current && currentSessionId && isSupported) {
      // Use setTimeout to ensure state update happens first
      setTimeout(() => {
        startVoiceRef.current?.();
      }, 0);
    }
  }, [conversationMode, currentSessionId, isSupported]);

  // Initialize conversation mode in service on mount
  useEffect(() => {
    browserVoiceService.setConversationMode(conversationMode);
  }, [conversationMode]);
  
  // Refs for callbacks to avoid circular dependencies
  const handleSpeechErrorRef = useRef<((errorMsg: string) => void) | null>(null);
  const handleSpeechResultRef = useRef<((text: string, isFinal: boolean) => Promise<void>) | null>(null);
  const startVoiceRef = useRef<(() => void) | null>(null);

  // Handle speech recognition error
  const handleSpeechError = useCallback((errorMsg: string) => {
    // Ignore errors if we've already stopped voice mode
    if (!isActiveRef.current) {
      console.log('[useBrowserVoice] Ignoring error after voice stopped:', errorMsg);
      return;
    }
    
    console.error('[useBrowserVoice] Recognition error:', errorMsg);
    setError(errorMsg);
    setStatus('error');
    
    // Auto-recover from certain errors
    if (!errorMsg.includes('permission') && !errorMsg.includes('not allowed')) {
      setTimeout(() => {
        if (isActiveRef.current) {
          setStatus('listening');
          setError(null);
          browserVoiceService.startListening(language, handleSpeechResultRef.current!, handleSpeechError);
        }
      }, 1000);
    }
  }, [language]);

  // Update the ref when handleSpeechError changes
  useEffect(() => {
    handleSpeechErrorRef.current = handleSpeechError;
  }, [handleSpeechError]);

  // Handle speech recognition result
  const handleSpeechResult = useCallback(async (text: string, isFinal: boolean) => {
    if (!isFinal || !text.trim() || !isActiveRef.current) return;
    
    // Prevent duplicate processing of same transcript
    if (text.trim() === lastTranscriptRef.current) return;
    lastTranscriptRef.current = text.trim();

    // Check if provider and model are configured
    if (!currentProviderId || !currentModelId) {
      setError('No provider or model configured. Please configure them in settings.');
      setStatus('error');
      return;
    }

    // Stop listening while processing
    browserVoiceService.stopListening();
    setStatus('processing');
    processingMessageRef.current = true;

    try {
      // Create session if none exists
      let sessionId = currentSessionId;
      if (!sessionId) {
        console.log('[useBrowserVoice] No active session, creating new session...');
        const newSession = await createSession();
        if (!newSession) {
          setError('Failed to create session');
          setStatus('error');
          processingMessageRef.current = false;
          return;
        }
        sessionId = newSession.id;
        console.log('[useBrowserVoice] Created new session:', sessionId);
      }

      // Send message to AI
      await sendMessage(
        text.trim(),
        currentProviderId,
        currentModelId,
        currentAgentName ?? undefined
      );
      
      // Wait for AI response and speak it
      // We'll poll for new assistant messages
      const checkForResponse = async () => {
        if (!isActiveRef.current) return;
        
        const sessionMessages = messagesRef.current;
        const assistantMessages = Array.from(sessionMessages.values())
          .filter(m => m.info.role === 'assistant')
          .sort((a, b) => {
            const aTime = (a.info as { time?: { created?: number } }).time?.created ?? 0;
            const bTime = (b.info as { time?: { created?: number } }).time?.created ?? 0;
            return bTime - aTime;
          });
        
        if (assistantMessages.length > 0) {
          const latestMessage = assistantMessages[0];
          const textParts = latestMessage.parts
            .filter(p => p.type === 'text')
            .map(p => p.text)
            .join(' ');
          
          if (textParts.trim()) {
            // Speak the response
            setStatus('speaking');
            try {
              // Summarize text if enabled and over threshold
              let textToSpeak = textParts;
              if (summarizeVoiceConversation && shouldSummarize(textParts, 'voice')) {
                console.log('[useBrowserVoice] Summarizing AI response before speaking...');
                textToSpeak = await summarizeText(textParts, {
                  model: summarizeModel || undefined,
                  threshold: summarizeCharacterThreshold,
                });
              }
              
              // Helper to restart listening after speech ends
              // Only auto-restart if conversation mode is enabled
              const restartListening = () => {
                if (isActiveRef.current && conversationMode) {
                  setStatus('listening');
                  if (isMobile) {
                    try {
                      browserVoiceService.startListeningSync(language, handleSpeechResultRef.current!, handleSpeechErrorRef.current!);
                    } catch (err) {
                      console.error('[useBrowserVoice] Failed to restart listening:', err);
                    }
                  } else {
                    browserVoiceService.startListening(language, handleSpeechResultRef.current!, handleSpeechErrorRef.current!);
                  }
                } else {
                  // In non-continuous mode, return to idle after AI responds
                  isActiveRef.current = false;
                  setStatus('idle');
                }
              };

              // Use server TTS when OpenAI provider is selected and available
              if (voiceProvider === 'openai' && isServerTTSAvailable) {
                console.log('[useBrowserVoice] Using OpenAI server TTS with voice:', openaiVoice);
                await speakServerTTS(textToSpeak, {
                  voice: openaiVoice,
                  speed: speechRate,
                  onStart: () => console.log('[useBrowserVoice] Server TTS started'),
                  onEnd: () => {
                    console.log('[useBrowserVoice] Server TTS ended');
                    restartListening();
                  },
                  onError: (errorMsg) => {
                    console.error('[useBrowserVoice] Server TTS error:', errorMsg);
                    // Show error to user when OpenAI voice fails
                    setError(`OpenAI voice failed: ${errorMsg}. Please check your OpenAI API key or switch to Browser voice.`);
                    setStatus('error');
                    restartListening();
                  }
                });
              } else if (voiceProvider === 'say' && isSayTTSAvailable) {
                // Use macOS 'say' command
                console.log('[useBrowserVoice] Using macOS Say TTS with voice:', sayVoice);
                // Convert speechRate (0.5-2.0) to words per minute (100-400)
                const wordsPerMinute = Math.round(100 + (speechRate - 0.5) * 200);
                await speakSayTTS(textToSpeak, {
                  voice: sayVoice,
                  rate: wordsPerMinute,
                  onStart: () => console.log('[useBrowserVoice] Say TTS started'),
                  onEnd: () => {
                    console.log('[useBrowserVoice] Say TTS ended');
                    restartListening();
                  },
                  onError: (errorMsg) => {
                    console.error('[useBrowserVoice] Say TTS error:', errorMsg);
                    restartListening();
                  }
                });
              } else {
                // Use browser TTS (desktop and mobile)
                // Pre-load voices and unlock audio context before speaking
                console.log('[useBrowserVoice] Using browser TTS');
                
                // Warn user if they selected OpenAI but it's unavailable
                if (voiceProvider === 'openai' && !isServerTTSAvailable) {
                  console.warn('[useBrowserVoice] OpenAI voice selected but unavailable, falling back to browser voice');
                  setError('OpenAI voice unavailable (API key not configured). Using browser voice instead.');
                }
                
                await browserVoiceService.waitForVoices();
                await browserVoiceService.resumeAudioContext();
                
                await browserVoiceService.speakText(textToSpeak, language, () => {
                  // When speech ends, go back to listening if still active
                  restartListening();
                }, { rate: speechRate, pitch: speechPitch, volume: speechVolume, voiceName: browserVoice || undefined });
              }
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : 'Speech failed';
              
              // Ignore errors if we've stopped voice (e.g., user cancelled during speech)
              if (!isActiveRef.current) {
                console.log('[useBrowserVoice] Ignoring speech error after voice stopped:', errorMsg);
                return;
              }
              
              console.error('[useBrowserVoice] Speech error:', errorMsg);
              
              // Check for autoplay policy error
              if (errorMsg.includes('not-allowed') || errorMsg.includes('autoplay')) {
                setError('Audio blocked by browser. Please click the voice button again to enable audio.');
              }
              
              // Only restart listening if conversation mode is enabled
              if (conversationMode) {
                setStatus('listening');
                if (isMobile) {
                  try {
                    browserVoiceService.startListeningSync(language, handleSpeechResultRef.current!, handleSpeechErrorRef.current!);
                  } catch (restartErr) {
                    console.error('[useBrowserVoice] Failed to restart listening after speech error:', restartErr);
                  }
                } else {
                  browserVoiceService.startListening(language, handleSpeechResultRef.current!, handleSpeechErrorRef.current!);
                }
              } else {
                // In non-continuous mode, return to idle after error
                isActiveRef.current = false;
                setStatus('idle');
              }
            }
            return;
          }
        }
        
        // Check again in 500ms
        setTimeout(checkForResponse, 500);
      };
      
      // Start checking for response after a short delay
      setTimeout(checkForResponse, 1000);
      
    } catch (err) {
      console.error('[useBrowserVoice] Send message error:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setStatus('error');
      processingMessageRef.current = false;
    }
  }, [currentSessionId, currentProviderId, currentModelId, currentAgentName, language, sendMessage, createSession, speechRate, speechPitch, speechVolume, isMobile, isServerTTSAvailable, speakServerTTS, isSayTTSAvailable, speakSayTTS, voiceProvider, sayVoice, browserVoice, openaiVoice, summarizeVoiceConversation, summarizeCharacterThreshold, summarizeModel, conversationMode]);

  // Update the ref when handleSpeechResult changes
  useEffect(() => {
    handleSpeechResultRef.current = handleSpeechResult;
  }, [handleSpeechResult]);

  // Prepare voice for mobile (request permission)
  const prepareVoice = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      return false;
    }
    try {
      await browserVoiceService.prepareListening();
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Microphone permission denied';
      setError(errorMsg);
      return false;
    }
  }, [isSupported]);

  // Start voice mode
  const startVoice = useCallback(async () => {
    if (!isSupported) {
      setError('Browser voice not supported');
      setStatus('error');
      return;
    }
    
    if (!currentSessionId) {
      setError('No active session');
      setStatus('error');
      return;
    }
    
    isActiveRef.current = true;
    lastTranscriptRef.current = '';
    setError(null);
    setStatus('listening');
    
    // On mobile, use sync path to ensure SpeechRecognition.start() is called
    // within the same user gesture context (required by iOS Safari)
    // Also unlock audio immediately for TTS playback later
    if (isMobile) {
      try {
        // Unlock audio context synchronously within user gesture
        browserVoiceService.unlockAudio().catch(() => {
          // Audio unlock failed, but continue anyway
        });
        // Also unlock server TTS audio for mobile Safari (OpenAI)
        unlockServerTTSAudio().catch(() => {
          // Server TTS unlock failed, but continue anyway
        });
        // Also unlock Say TTS audio for mobile Safari (macOS Say)
        unlockSayTTSAudio().catch(() => {
          // Say TTS unlock failed, but continue anyway
        });
        browserVoiceService.startListeningSync(language, handleSpeechResult, handleSpeechError);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to start voice';
        console.error('[useBrowserVoice] Mobile voice start error:', errorMsg);
        setError(errorMsg);
        setStatus('error');
        isActiveRef.current = false;
      }
    } else {
      // Desktop can use async path with permission check
      try {
        await browserVoiceService.startListening(language, handleSpeechResult, handleSpeechError);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to start voice';
        console.error('[useBrowserVoice] Desktop voice start error:', errorMsg);
        setError(errorMsg);
        setStatus('error');
        isActiveRef.current = false;
      }
    }
  }, [isSupported, currentSessionId, language, handleSpeechResult, handleSpeechError, isMobile, unlockServerTTSAudio, unlockSayTTSAudio]);

  // Update the ref when startVoice changes
  useEffect(() => {
    startVoiceRef.current = startVoice;
  }, [startVoice]);

  // Stop voice mode
  const stopVoice = useCallback(() => {
    isActiveRef.current = false;
    processingMessageRef.current = false;
    browserVoiceService.stopListening();
    browserVoiceService.cancelSpeech();
    stopServerTTS(); // Also stop server TTS if playing
    stopSayTTS(); // Also stop Say TTS if playing
    setStatus('idle');
    setError(null);
  }, [stopServerTTS, stopSayTTS]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      browserVoiceService.setConversationMode(false);
      browserVoiceService.stopListening();
      browserVoiceService.cancelSpeech();
    };
  }, []);
  
  return {
    status,
    isSupported,
    error,
    language,
    setLanguage,
    startVoice,
    stopVoice,
    conversationMode,
    toggleConversationMode,
    prepareVoice,
    isMobile,
    voiceProvider,
  };
}
