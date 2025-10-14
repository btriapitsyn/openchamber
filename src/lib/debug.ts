// Debug utilities for OpenChamber
// Available in browser console via window.__opencodeDebug

import { useSessionStore } from '@/stores/useSessionStore';

export interface DebugMessageInfo {
  messageId: string;
  role: string;
  timestamp: number;
  partsCount: number;
  parts: Array<{
    id: string;
    type: string;
    text?: string;
    textLength?: number;
    tool?: string;
    state?: any;
  }>;
  isEmpty: boolean;
  isEmptyResponse: boolean;
  raw: any;
}

export const debugUtils = {
  /**
   * Get detailed info about the last assistant message in current session
   */
  getLastAssistantMessage(): DebugMessageInfo | null {
    const state = useSessionStore.getState();
    const currentSessionId = state.currentSessionId;

    if (!currentSessionId) {
      console.log('❌ No active session');
      return null;
    }

    const messages = state.messages.get(currentSessionId);
    if (!messages || messages.length === 0) {
      console.log('❌ No messages in current session');
      return null;
    }

    // Find last assistant message
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.info.role === 'assistant') {
        const parts = msg.parts.map((part: any) => {
          const info: any = {
            id: part.id,
            type: part.type,
          };

          if (part.type === 'text') {
            info.text = part.text;
            info.textLength = part.text?.length || 0;
          } else if (part.type === 'tool') {
            info.tool = part.tool;
            info.state = part.state?.status;
          } else if (part.type === 'step-start' || part.type === 'step-finish') {
            info.isStepMarker = true;
          }

          return info;
        });

        // Check if response is empty
        const hasText = parts.some((p: any) => p.type === 'text' && p.text && p.text.trim().length > 0);
        const hasTools = parts.some((p: any) => p.type === 'tool');
        const hasStepMarkers = parts.some((p: any) => p.type === 'step-start' || p.type === 'step-finish');
        const isEmpty = parts.length === 0;
        const isEmptyResponse = !hasText && !hasTools && (!isEmpty || hasStepMarkers);

        const info: DebugMessageInfo = {
          messageId: msg.info.id,
          role: msg.info.role,
          timestamp: msg.info.time?.created || 0,
          partsCount: parts.length,
          parts,
          isEmpty,
          isEmptyResponse,
          raw: msg,
        };

        console.log('🔍 Last Assistant Message:', info);
        console.log('📊 Summary:', {
          messageId: info.messageId,
          partsCount: info.partsCount,
          isEmpty: info.isEmpty,
          isEmptyResponse: info.isEmptyResponse,
          hasText,
          hasTools,
          hasStepMarkers,
          onlyStepMarkers: hasStepMarkers && !hasText && !hasTools,
        });

        if (info.isEmpty) {
          console.warn('⚠️ Message has NO parts!');
        }

        if (info.isEmptyResponse) {
          console.warn('⚠️ Message has parts but NO meaningful content (empty text, no tools)!');

          if (hasStepMarkers && !hasText && !hasTools) {
            console.warn('🔴 CLAUDE EMPTY RESPONSE BUG: Only step-start/step-finish markers, no actual content!');
            console.log('This is a known issue with Claude models (anthropic provider)');
            console.log('Recommendation: Send a follow-up message or try a different model');
          }
        }

        return info;
      }
    }

    console.log('❌ No assistant messages found in current session');
    return null;
  },

  /**
   * Get all messages in current session
   */
  getAllMessages() {
    const state = useSessionStore.getState();
    const currentSessionId = state.currentSessionId;

    if (!currentSessionId) {
      console.log('❌ No active session');
      return [];
    }

    const messages = state.messages.get(currentSessionId) || [];
    console.log(`📨 Total messages in session: ${messages.length}`);

    messages.forEach((msg, idx) => {
      console.log(`[${idx}] ${msg.info.role} - ${msg.info.id} - ${msg.parts.length} parts`);
    });

    return messages;
  },

  /**
   * Check if last assistant message is empty/problematic
   */
  checkLastMessage() {
    const info = this.getLastAssistantMessage();
    if (!info) return false;

    const isProblematic = info.isEmpty || info.isEmptyResponse;

    if (isProblematic) {
      console.error('🚨 PROBLEMATIC MESSAGE DETECTED!');
      console.log('Details:', {
        messageId: info.messageId,
        isEmpty: info.isEmpty,
        isEmptyResponse: info.isEmptyResponse,
        partsCount: info.partsCount,
      });

      if (info.parts.length > 0) {
        console.log('Parts:', info.parts);
      }
    } else {
      console.log('✅ Last message looks good!');
    }

    return isProblematic;
  },

  /**
   * Get info about streaming state
   */
  getStreamingState() {
    const state = useSessionStore.getState();
    console.log('🎬 Streaming State:', {
      streamingMessageId: state.streamingMessageId,
      messageStreamStates: Array.from(state.messageStreamStates.entries()),
    });
    return {
      streamingMessageId: state.streamingMessageId,
      streamStates: state.messageStreamStates,
    };
  },

  /**
   * Get information about potentially empty messages in current session
   */
  findEmptyMessages() {
    const state = useSessionStore.getState();
    const currentSessionId = state.currentSessionId;

    if (!currentSessionId) {
      console.log('❌ No active session');
      return [];
    }

    const messages = state.messages.get(currentSessionId) || [];
    const emptyMessages = messages
      .filter((msg) => msg.info.role === 'assistant')
      .filter((msg) => {
        const parts = msg.parts || [];
        const hasTextContent = parts.some(
          (p: any) => p.type === 'text' && p.text && p.text.trim().length > 0
        );
        const hasTools = parts.some((p: any) => p.type === 'tool');

        return parts.length === 0 || (!hasTextContent && !hasTools);
      });

    console.log(`🔍 Found ${emptyMessages.length} empty assistant messages`);

    emptyMessages.forEach((msg, idx) => {
      console.log(`[${idx}] Empty message:`, {
        messageId: msg.info.id,
        partsCount: msg.parts.length,
        provider: (msg.info as any).providerID,
        model: (msg.info as any).modelID,
        timestamp: msg.info.time?.created,
      });
    });

    return emptyMessages;
  },

  /**
   * Show retry instructions for empty messages
   */
  showRetryHelp() {
    console.log('🔧 How to handle empty Claude responses:\n');
    console.log('1. Check the last message:');
    console.log('   __opencodeDebug.getLastAssistantMessage()\n');
    console.log('2. Find all empty messages in session:');
    console.log('   __opencodeDebug.findEmptyMessages()\n');
    console.log('3. To retry, you can:');
    console.log('   - Edit your last user message and resend');
    console.log('   - Send a follow-up message like "Please provide the response"');
    console.log('   - Try a different model (OpenAI models tend to be more reliable)\n');
    console.log('💡 Empty responses are usually due to:');
    console.log('   - Model rate limits');
    console.log('   - Context length issues');
    console.log('   - Model refusing to respond to certain prompts');
    console.log('   - API errors from provider');
  },
};

// Expose to window for console access
if (typeof window !== 'undefined') {
  (window as any).__opencodeDebug = debugUtils;
  console.log('🔧 OpenCode Debug Utils loaded! Use window.__opencodeDebug in console');
  console.log('Available commands:');
  console.log('  __opencodeDebug.getLastAssistantMessage() - Get last assistant message details');
  console.log('  __opencodeDebug.getAllMessages() - List all messages');
  console.log('  __opencodeDebug.checkLastMessage() - Check if last message is problematic');
  console.log('  __opencodeDebug.findEmptyMessages() - Find all empty assistant messages');
  console.log('  __opencodeDebug.showRetryHelp() - Show instructions for handling empty responses');
  console.log('  __opencodeDebug.getStreamingState() - Get streaming state info');
}
