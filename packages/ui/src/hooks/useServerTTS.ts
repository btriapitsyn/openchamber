/**
 * useServerTTS Hook
 * 
 * React hook for server-side text-to-speech playback.
 * Fetches audio from the server and plays it, bypassing mobile Safari restrictions.
 * 
 * @example
 * ```typescript
 * const { speak, isPlaying, stop, isAvailable } = useServerTTS();
 * 
 * // Speak text
 * await speak('Hello, this is a test');
 * 
 * // Stop playback
 * stop();
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConfigStore } from '@/stores/useConfigStore';

export interface UseServerTTSReturn {
  /** Whether TTS is currently playing */
  isPlaying: boolean;
  /** Whether the server TTS service is available */
  isAvailable: boolean;
  /** Current error if any */
  error: string | null;
  /** Speak the given text */
  speak: (text: string, options?: SpeakOptions) => Promise<void>;
  /** Stop current playback */
  stop: () => void;
  /** Check if service is available */
  checkAvailability: () => Promise<boolean>;
  /** Unlock audio for mobile Safari - call this on user gesture before speaking */
  unlockAudio: () => Promise<void>;
}

export interface SpeakOptions {
  /** Voice to use (defaults to coral) */
  voice?: string;
  /** Speech speed (0.25 to 4.0, defaults to 1.0) */
  speed?: number;
  /** Optional instructions for the voice */
  instructions?: string;
  /** Summarize long text before speaking (defaults to true) */
  summarize?: boolean;
  /** Provider ID for summarization model */
  providerId?: string;
  /** Model ID for summarization */
  modelId?: string;
  /** Character threshold for summarization (defaults to 200) */
  threshold?: number;
  /** Callback when playback starts */
  onStart?: () => void;
  /** Callback when playback ends */
  onEnd?: () => void;
  /** Callback on error */
  onError?: (error: string) => void;
}

// Shared AudioContext for Web Audio API playback (better iOS support)
let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    sharedAudioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return sharedAudioContext;
}

export function useServerTTS(): UseServerTTSReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Get current model and threshold from config store for summarization
  const { currentProviderId, currentModelId, summarizeCharacterThreshold, openaiApiKey } = useConfigStore();

  // Check if server TTS is available
  const checkAvailability = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/tts/status');
      if (response.ok) {
        const data = await response.json();
        // Available if server has key OR user has provided their own key
        const hasServerKey = data.available;
        const hasClientKey = openaiApiKey && openaiApiKey.trim().length > 0;
        const available = hasServerKey || hasClientKey;
        setIsAvailable(available);
        return available;
      }
      setIsAvailable(false);
      return false;
    } catch (err) {
      console.error('[useServerTTS] Failed to check availability:', err);
      setIsAvailable(false);
      return false;
    }
  }, [openaiApiKey]);

  // Check availability on mount and when API key changes
  useEffect(() => {
    checkAvailability();
  }, [checkAvailability]);

  // Stop current playback
  const stop = useCallback(() => {
    // Stop Web Audio API source
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch {
        // Already stopped
      }
      audioSourceRef.current = null;
    }
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    setIsPlaying(false);
  }, []);

  // Pre-unlock audio for mobile Safari
  // This must be called within a user gesture context
  const unlockAudio = useCallback(async (): Promise<void> => {
    try {
      // Get or create AudioContext
      const ctx = getAudioContext();
      
      // Resume if suspended (required for iOS Safari)
      if (ctx.state === 'suspended') {
        await ctx.resume();
        console.log('[useServerTTS] AudioContext resumed');
      }
      
      // Play a tiny silent buffer to fully unlock
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      
      console.log('[useServerTTS] Audio unlocked for mobile playback');
    } catch (err) {
      console.error('[useServerTTS] Failed to unlock audio:', err);
    }
  }, []);

  // Speak text using server TTS
  const speak = useCallback(async (text: string, options?: SpeakOptions): Promise<void> => {
    // Stop any existing playback
    stop();

    if (!text.trim()) {
      setError('No text to speak');
      options?.onError?.('No text to speak');
      return;
    }

    setError(null);

    try {
      // Unlock audio context first (required for mobile Safari)
      // Must be done before any async operations to stay within user gesture context
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
        console.log('[useServerTTS] AudioContext resumed');
      }
      
      // Play a silent buffer to fully unlock audio on iOS
      const silentBuffer = ctx.createBuffer(1, 1, 22050);
      const silentSource = ctx.createBufferSource();
      silentSource.buffer = silentBuffer;
      silentSource.connect(ctx.destination);
      silentSource.start(0);

      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      const voice = options?.voice || 'nova';
      console.log('[useServerTTS] Speaking with voice:', voice, 'options:', options);

      // Fetch audio from server
      const response = await fetch('/api/tts/speak', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text.trim(),
          voice,
          speed: options?.speed || 0.9,
          instructions: options?.instructions,
          summarize: options?.summarize ?? true, // Summarize by default for voice output
          // Use provided provider/model, or fall back to current chat model
          providerId: options?.providerId || currentProviderId || undefined,
          modelId: options?.modelId || currentModelId || undefined,
          // Use provided threshold, or fall back to user setting, or default to 200
          threshold: options?.threshold ?? summarizeCharacterThreshold ?? 200,
          // Send API key from settings if available
          apiKey: openaiApiKey || undefined,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      // Get audio data from response
      const audioBlob = await response.blob();
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // Decode audio data using the same context we unlocked earlier
      console.log('[useServerTTS] Decoding audio data...');
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      
      // Create source node
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      audioSourceRef.current = source;
      
      // Set up event handlers
      source.onended = () => {
        console.log('[useServerTTS] Audio playback ended');
        setIsPlaying(false);
        audioSourceRef.current = null;
        options?.onEnd?.();
      };
      
      // Start playback
      console.log('[useServerTTS] Starting audio playback via Web Audio API...');
      setIsPlaying(true);
      options?.onStart?.();
      source.start(0);
      
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Request was aborted, don't show error
        return;
      }
      
      const errorMsg = err instanceof Error ? err.message : 'Failed to speak';
      console.error('[useServerTTS] Error:', errorMsg);
      setError(errorMsg);
      options?.onError?.(errorMsg);
      setIsPlaying(false);
    }
  }, [stop, currentProviderId, currentModelId, summarizeCharacterThreshold, openaiApiKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    isPlaying,
    isAvailable,
    error,
    speak,
    stop,
    checkAvailability,
    unlockAudio,
  };
}
