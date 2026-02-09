import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useBrowserVoice } from '@/hooks/useBrowserVoice';
import { useConfigStore } from '@/stores/useConfigStore';
import { SettingsSection } from '@/components/sections/shared/SettingsSection';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { RiMicLine, RiAlertLine, RiVolumeUpLine, RiSpeedLine, RiMusicLine, RiSoundModuleLine, RiAppleLine, RiPlayLine, RiStopLine, RiChromeLine, RiFileTextLine, RiKeyLine, RiCloseLine } from '@remixicon/react';
import { browserVoiceService } from '@/lib/voice/browserVoiceService';

// Common language options with display names
// Shared with BrowserVoiceButton.tsx
const LANGUAGE_OPTIONS = [
    { value: 'en-US', label: 'English' },
    { value: 'es-ES', label: 'Español' },
    { value: 'fr-FR', label: 'Français' },
    { value: 'de-DE', label: 'Deutsch' },
    { value: 'ja-JP', label: '日本語' },
    { value: 'zh-CN', label: '中文' },
    { value: 'pt-BR', label: 'Português' },
    { value: 'it-IT', label: 'Italiano' },
    { value: 'ko-KR', label: '한국어' },
    { value: 'uk-UA', label: 'Українська' },
];

/**
 * Voice settings section for OpenChamber settings
 * Allows users to configure voice conversation preferences
 */
export const VoiceSettings: React.FC = () => {
    const {
        isSupported,
        language,
        setLanguage,
    } = useBrowserVoice();
    const {
        voiceProvider,
        setVoiceProvider,
        speechRate,
        setSpeechRate,
        speechPitch,
        setSpeechPitch,
        speechVolume,
        setSpeechVolume,
        sayVoice,
        setSayVoice,
        browserVoice,
        setBrowserVoice,
        openaiVoice,
        setOpenaiVoice,
        openaiApiKey,
        setOpenaiApiKey,
        showMessageTTSButtons,
        setShowMessageTTSButtons,
        voiceModeEnabled,
        setVoiceModeEnabled,
        summarizeMessageTTS,
        setSummarizeMessageTTS,
        summarizeVoiceConversation,
        setSummarizeVoiceConversation,
        summarizeCharacterThreshold,
        setSummarizeCharacterThreshold,
        summarizeMaxLength,
        setSummarizeMaxLength,
    } = useConfigStore();

    // Check if macOS 'say' is available and get voices
    const [isSayAvailable, setIsSayAvailable] = useState(false);
    const [sayVoices, setSayVoices] = useState<Array<{ name: string; locale: string }>>([]);
    const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
    const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);

    // Check if OpenAI TTS is available
    const [isOpenAIAvailable, setIsOpenAIAvailable] = useState(false);
    const [isOpenAIPreviewPlaying, setIsOpenAIPreviewPlaying] = useState(false);
    const [openaiPreviewAudio, setOpenaiPreviewAudio] = useState<HTMLAudioElement | null>(null);

    // Browser voices
    const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [isBrowserPreviewPlaying, setIsBrowserPreviewPlaying] = useState(false);

    // Load browser voices
    useEffect(() => {
        const loadVoices = async () => {
            const voices = await browserVoiceService.waitForVoices();
            setBrowserVoices(voices);
        };
        loadVoices();

        // Also listen for voice changes (Chrome loads voices asynchronously)
        if ('speechSynthesis' in window) {
            window.speechSynthesis.onvoiceschanged = () => {
                setBrowserVoices(window.speechSynthesis.getVoices());
            };
        }

        return () => {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.onvoiceschanged = null;
            }
        };
    }, []);

    // Filter and sort browser voices by language
    const filteredBrowserVoices = useMemo(() => {
        // Group voices by language, prioritize English voices at top
        return browserVoices
            .filter(v => v.lang) // Only voices with a language
            .sort((a, b) => {
                // Prioritize English voices
                const aIsEnglish = a.lang.startsWith('en');
                const bIsEnglish = b.lang.startsWith('en');
                if (aIsEnglish && !bIsEnglish) return -1;
                if (!aIsEnglish && bIsEnglish) return 1;
                // Then sort by language, then by name
                const langCompare = a.lang.localeCompare(b.lang);
                if (langCompare !== 0) return langCompare;
                return a.name.localeCompare(b.name);
            });
    }, [browserVoices]);

    // Preview browser voice
    const previewBrowserVoice = useCallback(() => {
        if (isBrowserPreviewPlaying) {
            browserVoiceService.cancelSpeech();
            setIsBrowserPreviewPlaying(false);
            return;
        }

        const selectedVoice = browserVoices.find(v => v.name === browserVoice);
        const voiceName = selectedVoice?.name ?? 'your browser voice';
        const previewText = `Hello! I'm ${voiceName}. This is how I sound.`;

        setIsBrowserPreviewPlaying(true);

        const utterance = new SpeechSynthesisUtterance(previewText);
        utterance.rate = speechRate;
        utterance.pitch = speechPitch;
        utterance.volume = speechVolume;

        if (selectedVoice) {
            utterance.voice = selectedVoice;
            utterance.lang = selectedVoice.lang;
        }

        utterance.onend = () => setIsBrowserPreviewPlaying(false);
        utterance.onerror = () => setIsBrowserPreviewPlaying(false);

        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    }, [browserVoice, browserVoices, speechRate, speechPitch, speechVolume, isBrowserPreviewPlaying]);

    // Cleanup browser preview on unmount
    useEffect(() => {
        return () => {
            if (isBrowserPreviewPlaying) {
                browserVoiceService.cancelSpeech();
            }
        };
    }, [isBrowserPreviewPlaying]);

    // OpenAI voice options
    const OPENAI_VOICE_OPTIONS = [
        { value: 'alloy', label: 'Alloy' },
        { value: 'ash', label: 'Ash' },
        { value: 'ballad', label: 'Ballad' },
        { value: 'coral', label: 'Coral' },
        { value: 'echo', label: 'Echo' },
        { value: 'fable', label: 'Fable' },
        { value: 'nova', label: 'Nova' },
        { value: 'onyx', label: 'Onyx' },
        { value: 'sage', label: 'Sage' },
        { value: 'shimmer', label: 'Shimmer' },
        { value: 'verse', label: 'Verse' },
        { value: 'marin', label: 'Marin' },
        { value: 'cedar', label: 'Cedar' },
    ];

    // Check OpenAI TTS availability (including API key from settings)
    useEffect(() => {
        const checkOpenAIAvailability = async () => {
            try {
                // First check if server has API key configured
                const response = await fetch('/api/tts/status');
                const data = await response.json();
                console.log('[VoiceSettings] OpenAI TTS status:', data);

                // Available if server has key OR user has set API key in settings
                const hasServerKey = data.available;
                const hasSettingsKey = openaiApiKey.trim().length > 0;
                setIsOpenAIAvailable(hasServerKey || hasSettingsKey);
            } catch (err) {
                console.error('[VoiceSettings] Failed to check OpenAI TTS status:', err);
                // Still available if user has set API key in settings
                setIsOpenAIAvailable(openaiApiKey.trim().length > 0);
            }
        };

        checkOpenAIAvailability();
    }, [openaiApiKey]);

    useEffect(() => {
        fetch('/api/tts/say/status')
            .then(res => res.json())
            .then(data => {
                console.log('[VoiceSettings] Say TTS status:', data);
                setIsSayAvailable(data.available);
                if (data.voices) {
                    // Filter to unique voice names and sort alphabetically
                    const uniqueVoices = data.voices
                        .filter((v: { name: string; locale: string }, i: number, arr: Array<{ name: string; locale: string }>) =>
                            arr.findIndex((x: { name: string }) => x.name === v.name) === i
                        )
                        .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
                    setSayVoices(uniqueVoices);
                }
            })
            .catch((err) => {
                console.error('[VoiceSettings] Failed to check Say TTS status:', err);
                setIsSayAvailable(false);
            });
    }, []);

    // Preview voice function
    const previewVoice = useCallback(async () => {
        // Stop any existing preview
        if (previewAudio) {
            previewAudio.pause();
            previewAudio.currentTime = 0;
            setPreviewAudio(null);
            setIsPreviewPlaying(false);
            return;
        }

        setIsPreviewPlaying(true);
        try {
            const response = await fetch('/api/tts/say/speak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: `Hello! I'm ${sayVoice}. This is how I sound.`,
                    voice: sayVoice,
                    rate: Math.round(100 + (speechRate - 0.5) * 200),
                }),
            });

            if (!response.ok) throw new Error('Preview failed');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);

            audio.onended = () => {
                URL.revokeObjectURL(url);
                setPreviewAudio(null);
                setIsPreviewPlaying(false);
            };

            audio.onerror = () => {
                URL.revokeObjectURL(url);
                setPreviewAudio(null);
                setIsPreviewPlaying(false);
            };

            setPreviewAudio(audio);
            await audio.play();
        } catch (err) {
            console.error('Voice preview failed:', err);
            setIsPreviewPlaying(false);
        }
    }, [sayVoice, speechRate, previewAudio]);

    // Cleanup preview audio on unmount
    useEffect(() => {
        return () => {
            if (previewAudio) {
                previewAudio.pause();
            }
        };
    }, [previewAudio]);

    // Preview OpenAI voice
    const previewOpenAIVoice = useCallback(async () => {
        // Stop any existing preview
        if (openaiPreviewAudio) {
            openaiPreviewAudio.pause();
            openaiPreviewAudio.currentTime = 0;
            setOpenaiPreviewAudio(null);
            setIsOpenAIPreviewPlaying(false);
            return;
        }

        setIsOpenAIPreviewPlaying(true);
        try {
            const response = await fetch('/api/tts/speak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: `Hello! I'm ${openaiVoice}. This is how I sound.`,
                    voice: openaiVoice,
                    speed: speechRate,
                    apiKey: openaiApiKey || undefined,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);

            audio.onended = () => {
                URL.revokeObjectURL(url);
                setOpenaiPreviewAudio(null);
                setIsOpenAIPreviewPlaying(false);
            };

            audio.onerror = () => {
                URL.revokeObjectURL(url);
                setOpenaiPreviewAudio(null);
                setIsOpenAIPreviewPlaying(false);
            };

            setOpenaiPreviewAudio(audio);
            await audio.play();
        } catch (err) {
            console.error('[VoiceSettings] OpenAI voice preview failed:', err);
            setIsOpenAIPreviewPlaying(false);
        }
    }, [openaiVoice, speechRate, openaiPreviewAudio, openaiApiKey]);

    // Cleanup OpenAI preview audio on unmount
    useEffect(() => {
        return () => {
            if (openaiPreviewAudio) {
                openaiPreviewAudio.pause();
            }
        };
    }, [openaiPreviewAudio]);

    return (
        <SettingsSection
            title="Voice"
            description="Configure voice conversation settings"
        >
            <div className="space-y-6">
                {/* Voice Mode Enable/Disable */}
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                            <RiMicLine className="w-4 h-4 text-muted-foreground" />
                            <span className="typography-ui-label text-foreground">
                                Voice Mode
                            </span>
                        </div>
                        <p className="typography-meta text-muted-foreground">
                            Enable voice conversations with microphone input
                        </p>
                    </div>
                    <Switch
                        checked={voiceModeEnabled}
                        onCheckedChange={setVoiceModeEnabled}
                        aria-label="Toggle voice mode"
                    />
                </div>

                {/* Voice provider selection - only show when voice mode is enabled */}
                {voiceModeEnabled && (
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                                <RiVolumeUpLine className="w-4 h-4 text-muted-foreground" />
                                <span className="typography-ui-label text-foreground">
                                    Voice Provider
                                </span>
                            </div>
                            <p className="typography-meta text-muted-foreground">
                                Choose your preferred text-to-speech provider
                            </p>
                        </div>
                        <div className="flex gap-2 flex-wrap justify-end">
                            <Button
                                variant={voiceProvider === 'browser' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setVoiceProvider('browser')}
                                className="min-w-[80px]"
                            >
                                Browser
                            </Button>
                            <Button
                                variant={voiceProvider === 'openai' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setVoiceProvider('openai')}
                                className="min-w-[80px]"
                                title={isOpenAIAvailable ? 'OpenAI voice' : 'OpenAI voice unavailable - API key not configured'}
                            >
                                OpenAI
                            </Button>
                            {isSayAvailable && (
                                <Button
                                    variant={voiceProvider === 'say' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setVoiceProvider('say')}
                                    className="min-w-[80px]"
                                >
                                    <RiAppleLine className="w-4 h-4 mr-1" />
                                    Say
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                {/* Provider description */}
                {voiceModeEnabled && (
                    <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
                        <p className="typography-micro text-muted-foreground">
                            <span className="font-medium text-foreground">
                                {voiceProvider === 'browser' ? 'Browser Voice:' : voiceProvider === 'openai' ? 'OpenAI:' : 'macOS Say:'}
                            </span>{' '}
                            {voiceProvider === 'browser'
                                ? 'Free, works offline, but has limited mobile support. Best for desktop use.'
                                : voiceProvider === 'openai'
                                    ? 'Higher quality voice synthesis that works reliably on mobile. Requires OpenAI API key.'
                                    : 'Native macOS speech synthesis. Free, fast, and works offline. Desktop only.'}
                        </p>
                    </div>
                )}

                {/* OpenAI unavailable warning */}
                {voiceModeEnabled && voiceProvider === 'openai' && !isOpenAIAvailable && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                        <RiAlertLine className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="typography-ui text-destructive font-medium">
                                OpenAI voice unavailable
                            </p>
                            <p className="typography-micro text-destructive/80">
                                OpenAI voice requires an OpenAI API key to be configured. Please set the OpenAI API key or switch to Browser voice.
                            </p>
                        </div>
                    </div>
                )}

                {/* OpenAI API Key Input - show when OpenAI is selected or when no server key is configured */}
                {voiceModeEnabled && voiceProvider === 'openai' && (
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                                <RiKeyLine className="w-4 h-4 text-muted-foreground" />
                                <span className="typography-ui-label text-foreground">
                                    OpenAI API Key
                                </span>
                            </div>
                            <p className="typography-meta text-muted-foreground">
                                {isOpenAIAvailable && !openaiApiKey ? 'Using API key from OpenCode configuration' : 'Enter your OpenAI API key for voice synthesis'}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 w-[280px]">
                            <input
                                type="password"
                                value={openaiApiKey}
                                onChange={(e) => setOpenaiApiKey(e.target.value)}
                                placeholder="sk-..."
                                className="flex-1 px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                            {openaiApiKey && (
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => setOpenaiApiKey('')}
                                    title="Clear API key"
                                >
                                    <RiCloseLine className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                {/* OpenAI Voice Selection */}
                {voiceModeEnabled && voiceProvider === 'openai' && isOpenAIAvailable && (
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                                <RiVolumeUpLine className="w-4 h-4 text-muted-foreground" />
                                <span className="typography-ui-label text-foreground">
                                    OpenAI Voice
                                </span>
                            </div>
                            <p className="typography-meta text-muted-foreground">
                                Select an OpenAI voice for text-to-speech
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Select
                                value={openaiVoice}
                                onValueChange={setOpenaiVoice}
                            >
                                <SelectTrigger className="w-[160px]" aria-label="Select OpenAI voice">
                                    <SelectValue placeholder="Select voice" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    {OPENAI_VOICE_OPTIONS.map((voice) => (
                                        <SelectItem key={voice.value} value={voice.value}>
                                            {voice.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                size="icon"
                                variant="outline"
                                onClick={previewOpenAIVoice}
                                disabled={!isOpenAIAvailable}
                                title={isOpenAIPreviewPlaying ? 'Stop preview' : 'Preview voice'}
                            >
                                {isOpenAIPreviewPlaying ? (
                                    <RiStopLine className="w-4 h-4" />
                                ) : (
                                    <RiPlayLine className="w-4 h-4" />
                                )}
                            </Button>
                        </div>
                    </div>
                )}

                {/* macOS Say Voice Selection */}
                {voiceModeEnabled && voiceProvider === 'say' && isSayAvailable && sayVoices.length > 0 && (
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                                <RiAppleLine className="w-4 h-4 text-muted-foreground" />
                                <span className="typography-ui-label text-foreground">
                                    macOS Voice
                                </span>
                            </div>
                            <p className="typography-meta text-muted-foreground">
                                Select a voice installed on your Mac
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Select
                                value={sayVoice}
                                onValueChange={setSayVoice}
                            >
                                <SelectTrigger className="w-[160px]" aria-label="Select macOS voice">
                                    <SelectValue placeholder="Select voice" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    {sayVoices.map((voice) => (
                                        <SelectItem key={voice.name} value={voice.name}>
                                            {voice.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                size="icon"
                                variant="outline"
                                onClick={previewVoice}
                                title={isPreviewPlaying ? 'Stop preview' : 'Preview voice'}
                            >
                                {isPreviewPlaying ? (
                                    <RiStopLine className="w-4 h-4" />
                                ) : (
                                    <RiPlayLine className="w-4 h-4" />
                                )}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Browser Voice Selection */}
                {voiceModeEnabled && voiceProvider === 'browser' && filteredBrowserVoices.length > 0 && (
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                                <RiChromeLine className="w-4 h-4 text-muted-foreground" />
                                <span className="typography-ui-label text-foreground">
                                    Browser Voice
                                </span>
                            </div>
                            <p className="typography-meta text-muted-foreground">
                                Select a voice from your browser
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Select
                                value={browserVoice || '__auto__'}
                                onValueChange={(value) => setBrowserVoice(value === '__auto__' ? '' : value)}
                            >
                                <SelectTrigger className="w-[200px]" aria-label="Select browser voice">
                                    <SelectValue placeholder="Auto (default)" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    <SelectItem value="__auto__">Auto (default)</SelectItem>
                                    {filteredBrowserVoices.map((voice) => (
                                        <SelectItem key={voice.name} value={voice.name}>
                                            {voice.name} ({voice.lang})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                size="icon"
                                variant="outline"
                                onClick={previewBrowserVoice}
                                title={isBrowserPreviewPlaying ? 'Stop preview' : 'Preview voice'}
                            >
                                {isBrowserPreviewPlaying ? (
                                    <RiStopLine className="w-4 h-4" />
                                ) : (
                                    <RiPlayLine className="w-4 h-4" />
                                )}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Language selection */}
                {voiceModeEnabled && (
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                                <RiMicLine className="w-4 h-4 text-muted-foreground" />
                                <span className="typography-ui-label text-foreground">
                                    Language
                                </span>
                            </div>
                            <p className="typography-meta text-muted-foreground">
                                Language for speech recognition and synthesis
                            </p>
                        </div>
                        <Select
                            value={language}
                            onValueChange={setLanguage}
                            disabled={!isSupported}
                        >
                            <SelectTrigger className="w-[180px]" aria-label="Select language">
                                <SelectValue placeholder="Select language" />
                            </SelectTrigger>
                            <SelectContent>
                                {LANGUAGE_OPTIONS.map((lang) => (
                                    <SelectItem key={lang.value} value={lang.value}>
                                        {lang.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Show TTS buttons on messages */}
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                            <RiVolumeUpLine className="w-4 h-4 text-muted-foreground" />
                            <span className="typography-ui-label text-foreground">
                                Message Read Aloud
                            </span>
                        </div>
                        <p className="typography-meta text-muted-foreground">
                            Show speaker button on AI responses to read them aloud
                        </p>
                    </div>
                    <Switch
                        checked={showMessageTTSButtons}
                        onCheckedChange={setShowMessageTTSButtons}
                        aria-label="Toggle message TTS buttons"
                    />
                </div>

                {/* Summarization Section */}
                <div className="pt-4 border-t border-border/40 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <RiFileTextLine className="w-4 h-4 text-muted-foreground" />
                        <span className="typography-ui-label text-foreground font-medium">
                            Summarization
                        </span>
                    </div>

                    {/* Summarize Message TTS */}
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 flex-1">
                            <span className="typography-ui-label text-foreground">
                                Summarize Message Playback
                            </span>
                            <p className="typography-meta text-muted-foreground">
                                Summarize long messages before reading them aloud
                            </p>
                        </div>
                        <Switch
                            checked={summarizeMessageTTS}
                            onCheckedChange={setSummarizeMessageTTS}
                            aria-label="Toggle message TTS summarization"
                        />
                    </div>

                    {/* Summarize Voice Conversation */}
                    {voiceModeEnabled && (
                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1 flex-1">
                                <span className="typography-ui-label text-foreground">
                                    Summarize Voice Responses
                                </span>
                                <p className="typography-meta text-muted-foreground">
                                    Summarize long AI responses during voice conversations
                                </p>
                            </div>
                            <Switch
                                checked={summarizeVoiceConversation}
                                onCheckedChange={setSummarizeVoiceConversation}
                                aria-label="Toggle voice conversation summarization"
                            />
                        </div>
                    )}

                    {/* Character Threshold - only show if either summarization is enabled */}
                    {(summarizeMessageTTS || summarizeVoiceConversation) && (
                        <>
                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1 flex-1">
                                <span className="typography-ui-label text-foreground">
                                    Character Threshold
                                </span>
                                <p className="typography-meta text-muted-foreground">
                                    Summarize text longer than this ({summarizeCharacterThreshold} chars)
                                </p>
                            </div>
                            <div className="w-[180px]">
                                <Slider
                                    value={summarizeCharacterThreshold}
                                    onChange={setSummarizeCharacterThreshold}
                                    min={50}
                                    max={2000}
                                    step={50}
                                    label="Character threshold"
                                    valueFormatter={(v: number) => `${v}`}
                                />
                            </div>
                        </div>

                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1 flex-1">
                                <span className="typography-ui-label text-foreground">
                                    Summary Length Limit
                                </span>
                                <p className="typography-meta text-muted-foreground">
                                    Max characters for the summary ({summarizeMaxLength} chars)
                                </p>
                            </div>
                            <div className="w-[180px]">
                                <Slider
                                    value={summarizeMaxLength}
                                    onChange={setSummarizeMaxLength}
                                    min={50}
                                    max={2000}
                                    step={50}
                                    label="Summary length limit"
                                    valueFormatter={(v: number) => `${v}`}
                                />
                            </div>
                        </div>
                        </>
                    )}
                </div>

                {/* Speech Rate */}
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                            <RiSpeedLine className="w-4 h-4 text-muted-foreground" />
                            <span className="typography-ui-label text-foreground">
                                Speech Rate
                            </span>
                        </div>
                        <p className="typography-meta text-muted-foreground">
                            Speed of speech (0.5x - 2x)
                        </p>
                    </div>
                    <div className="w-[180px]">
                        <Slider
                            value={speechRate}
                            onChange={setSpeechRate}
                            min={0.5}
                            max={2}
                            step={0.1}
                            disabled={!isSupported}
                            label="Speech rate"
                            valueFormatter={(v: number) => `${v.toFixed(1)}x`}
                        />
                    </div>
                </div>

                {/* Speech Pitch */}
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                            <RiMusicLine className="w-4 h-4 text-muted-foreground" />
                            <span className="typography-ui-label text-foreground">
                                Speech Pitch
                            </span>
                        </div>
                        <p className="typography-meta text-muted-foreground">
                            Voice pitch (0.5 - 2)
                        </p>
                    </div>
                    <div className="w-[180px]">
                        <Slider
                            value={speechPitch}
                            onChange={setSpeechPitch}
                            min={0.5}
                            max={2}
                            step={0.1}
                            disabled={!isSupported}
                            label="Speech pitch"
                        />
                    </div>
                </div>

                {/* Speech Volume */}
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                            <RiSoundModuleLine className="w-4 h-4 text-muted-foreground" />
                            <span className="typography-ui-label text-foreground">
                                Speech Volume
                            </span>
                        </div>
                        <p className="typography-meta text-muted-foreground">
                            Voice volume (0 - 100%)
                        </p>
                    </div>
                    <div className="w-[180px]">
                        <Slider
                            value={speechVolume}
                            onChange={setSpeechVolume}
                            min={0}
                            max={1}
                            step={0.1}
                            disabled={!isSupported}
                            label="Speech volume"
                            valueFormatter={(v: number) => `${Math.round(v * 100)}%`}
                        />
                    </div>
                </div>

                {/* Keyboard shortcut hint */}
                {voiceModeEnabled && isSupported && (
                    <div className="pt-4 border-t border-border/40">
                        <p className="typography-micro text-muted-foreground">
                            <span className="font-medium text-foreground">Tip:</span>{' '}
                            Press <kbd className="px-1.5 py-0.5 rounded bg-muted typography-mono text-xs">Shift</kbd> +{' '}
                            <kbd className="px-1.5 py-0.5 rounded bg-muted typography-mono text-xs">Click</kbd>{' '}
                            on the voice button to quickly toggle continuous mode
                        </p>
                    </div>
                )}
            </div>
        </SettingsSection>
    );
};
