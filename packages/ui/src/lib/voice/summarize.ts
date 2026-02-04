/**
 * Text summarization utility for TTS
 * 
 * Uses the server-side summarization endpoint.
 */

import { useConfigStore } from '@/stores/useConfigStore';

/**
 * Summarize text using the server-side summarization endpoint
 * 
 * @param text - The text to summarize
 * @param options - Optional configuration
 * @returns The summarized text, or original text if summarization fails
 */
export async function summarizeText(
    text: string,
    options?: {
        /** Override the model to use (format: "providerId:modelId") */
        model?: string;
        /** Character threshold - don't summarize if under this length */
        threshold?: number;
    }
): Promise<string> {
    const store = useConfigStore.getState();
    const threshold = options?.threshold ?? store.summarizeCharacterThreshold;
    
    // Don't summarize if text is under threshold
    if (text.length <= threshold) {
        return text;
    }
    
    // Get model configuration
    let providerId: string | undefined;
    let modelId: string | undefined;
    
    const modelSetting = options?.model ?? store.summarizeModel;
    
    if (modelSetting && modelSetting.includes(':')) {
        // Use specified model from settings
        const [pId, mId] = modelSetting.split(':');
        providerId = pId;
        modelId = mId;
    } else {
        // No specific model selected - use the current chat model
        providerId = store.currentProviderId;
        modelId = store.currentModelId;
    }
    
    try {
        console.log(`[summarize] Calling API: ${text.length} chars, threshold: ${threshold}`);
        const response = await fetch('/api/tts/summarize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text,
                providerId,
                modelId,
                threshold,
            }),
        });
        
        console.log(`[summarize] Response status: ${response.status}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[summarize] HTTP error ${response.status}:`, errorText);
            throw new Error(`Summarization failed: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('[summarize] Response data:', { summarized: data.summarized, reason: data.reason, hasSummary: !!data.summary });
        
        if (data.summarized && data.summary) {
            console.log(`[summarize] Success: ${data.originalLength} chars -> ${data.summaryLength} chars`);
            return data.summary;
        }
        
        if (data.reason) {
            console.log(`[summarize] Not summarized: ${data.reason}`);
        }
        
        // Return original text if not summarized
        return text;
    } catch (err) {
        console.error('[summarize] Failed to summarize:', err);
        // Return original text on error
        return text;
    }
}

/**
 * Check if text should be summarized based on settings
 */
export function shouldSummarize(
    text: string,
    context: 'message' | 'voice'
): boolean {
    const store = useConfigStore.getState();
    
    const isEnabled = context === 'message' 
        ? store.summarizeMessageTTS 
        : store.summarizeVoiceConversation;
    
    if (!isEnabled) {
        return false;
    }
    
    return text.length > store.summarizeCharacterThreshold;
}
