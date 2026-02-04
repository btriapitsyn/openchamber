/**
 * Text Summarization Service
 * 
 * Provides a unified interface for summarizing text using OpenCode.
 * Used by all TTS implementations (Browser, Say, OpenAI).
 */

import { createOpencodeClient } from '@opencode-ai/sdk/v2';

const SUMMARIZATION_PROMPT = `You are a text summarizer for text-to-speech output. Create a concise, natural-sounding summary that captures the key points. Keep it brief (2-4 sentences). 

CRITICAL INSTRUCTIONS:
1. Output ONLY the final summary - no thinking, no reasoning, no explanations, no <thinking> blocks
2. Do not show your work or thought process
3. Do not use any special characters, markdown, code, URLs, file paths, or formatting
4. Do not include phrases like "Here's a summary" or "In summary"
5. Just provide clean, speakable text that can be read aloud

Your response should be ready to speak immediately.`;

/**
 * Sanitize text for TTS output
 * Removes markdown, URLs, file paths, and other non-speakable content
 */
export function sanitizeForTTS(text) {
  if (!text || typeof text !== 'string') return '';
  
  return text
    // Remove markdown formatting
    .replace(/[*_~`#]/g, '')
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    // Remove shell-like command patterns
    .replace(/^\s*[$#>]\s*/gm, '')
    // Remove common shell operators
    .replace(/[|&;<>]/g, ' ')
    // Remove backslashes (escape characters)
    .replace(/\\/g, '')
    // Remove brackets that might be interpreted specially
    .replace(/[[\]{}()]/g, '')
    // Remove quotes that might cause issues
    .replace(/["']/g, '')
    // Remove URLs
    .replace(/https?:\/\/[^\s]+/g, ' a link ')
    // Remove file paths
    .replace(/\/[\w\-./]+/g, '')
    // Collapse multiple spaces/newlines
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Create an OpenCode client for the given port
 */
function createClient(openCodePort) {
  return createOpencodeClient({
    baseUrl: `http://localhost:${openCodePort}`,
  });
}

/**
 * Summarize text using OpenCode SDK
 * 
 * @param {Object} options
 * @param {string} options.text - The text to summarize
 * @param {string} options.providerId - The provider ID (e.g., 'anthropic')
 * @param {string} options.modelId - The model ID (e.g., 'claude-sonnet-4-20250514')
 * @param {number} options.threshold - Character threshold (don't summarize if under this length)
 * @param {number} options.openCodePort - The OpenCode server port (required)
 * @returns {Promise<{summary: string, summarized: boolean, reason?: string}>}
 */
export async function summarizeText({
  text,
  providerId,
  modelId,
  threshold = 200,
  openCodePort
}) {
  // Don't summarize if text is under threshold
  if (!text || text.length <= threshold) {
    return {
      summary: sanitizeForTTS(text || ''),
      summarized: false
    };
  }

  if (!openCodePort) {
    return {
      summary: sanitizeForTTS(text),
      summarized: false,
      reason: 'OpenCode not available'
    };
  }

  // Use provided model or fallback to null (caller should provide current session model)
  const targetProviderId = providerId;
  const targetModelId = modelId;

  if (!targetProviderId || !targetModelId) {
    return {
      summary: sanitizeForTTS(text),
      summarized: false,
      reason: 'No model specified'
    };
  }

  const tempDir = await import('os').then(os => 
    import('fs').then(fs => 
      import('path').then(path => 
        fs.promises.mkdtemp(path.join(os.tmpdir(), 'openchamber-summarize-'))
      )
    )
  );

  let client;
  try {
    client = createClient(openCodePort);

    // Create a temporary session for summarization
    const sessionResponse = await client.session.create({
      title: '[hidden] TTS Summarization'
    });

    if (!sessionResponse.data || !sessionResponse.data.id) {
      throw new Error('Failed to create session: no session data returned');
    }

    const sessionId = sessionResponse.data.id;

    try {
      // Send the summarization prompt using promptAsync (returns immediately)
      await client.session.promptAsync({
        sessionID: sessionId,
        model: {
          providerID: targetProviderId,
          modelID: targetModelId
        },
        parts: [
          {
            type: 'text',
            text: `${SUMMARIZATION_PROMPT}\n\nText to summarize:\n${text}`,
            synthetic: true
          }
        ]
      });

      // Poll for the response (wait for assistant message)
      let attempts = 0;
      const maxAttempts = 60; // 30 seconds max (500ms intervals)
      let summary = null;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
          const messagesResponse = await client.session.messages({
            sessionID: sessionId
          });

          if (!messagesResponse.data || !Array.isArray(messagesResponse.data)) {
            attempts++;
            continue;
          }

          const messages = messagesResponse.data;

          // Look for the assistant response (should be the last message)
          const assistantMessage = messages.reverse().find(m => m.info?.role === 'assistant');

          if (assistantMessage) {
            // Filter out thinking/reasoning parts - only use text parts that don't contain thinking
            const nonThinkingParts = assistantMessage.parts?.filter(p => {
              // Skip if it's explicitly marked as thinking or reasoning
              if (p.thinking || p.reasoning) return false;
              // Skip if it has reasoning_content field (some models use this)
              if (p.reasoning_content) return false;
              // Only include text parts
              return p.type === 'text';
            });
            
            if (nonThinkingParts && nonThinkingParts.length > 0) {
              // Get the first non-thinking text part
              const textPart = nonThinkingParts[0];
              
              // Look for text content (could be 'content' or 'text' field)
              if (textPart.content) {
                summary = textPart.content.trim();
                break;
              } else if (textPart.text) {
                summary = textPart.text.trim();
                break;
              }
            }
          }
        } catch (pollError) {
          // Silently continue polling
        }
      
        attempts++;
      }

      if (summary) {
        // Sanitize the summary output as well
        summary = sanitizeForTTS(summary);
        return {
          summary,
          summarized: true,
          originalLength: text.length,
          summaryLength: summary.length
        };
      }

      // Fallback to sanitized original
      return {
        summary: sanitizeForTTS(text),
        summarized: false,
        reason: 'No response from model'
      };
    } finally {
      // Clean up the temporary session
      try {
        await client.session.delete({
          sessionID: sessionId
        });
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    return {
      summary: sanitizeForTTS(text),
      summarized: false,
      reason: error.message
    };
  } finally {
    // Clean up the temporary directory
    try {
      const fs = await import('fs');
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
  }
}
