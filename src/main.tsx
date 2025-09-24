import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Debug utility for token inspection
if (typeof window !== 'undefined') {
  (window as any).debugContextTokens = () => {
    const sessionStore = (window as any).__zustand_session_store__;
    if (!sessionStore) {
      console.log('❌ Session store not available');
      return;
    }
    
    const state = sessionStore.getState();
    const currentSessionId = state.currentSessionId;
    
    if (!currentSessionId) {
      console.log('❌ No current session');
      return;
    }
    
    const sessionMessages = state.messages.get(currentSessionId) || [];
    const assistantMessages = sessionMessages.filter((m: any) => m.info.role === 'assistant');
    
    if (assistantMessages.length === 0) {
      console.log('ℹ️ No assistant messages in current session');
      return;
    }
    
    const lastMessage = assistantMessages[assistantMessages.length - 1];
    const tokens = (lastMessage.info as any).tokens;
    
    console.log('🔍 Token Debug for Last Assistant Message:');
    console.log('Session ID:', currentSessionId);
    console.log('Message ID:', lastMessage.info.id);
    console.log('Raw tokens from message.info:', tokens);
    
    // Check if this is a tool/incomplete message
    const hasToolParts = lastMessage.parts.some((p: any) => p.type === 'tool');
    const hasStepFinish = lastMessage.parts.some((p: any) => p.type === 'step-finish');
    const isToolOrIncomplete = hasToolParts || !hasStepFinish;
    
    console.log('🔧 Message Analysis:');
    console.log('  Has tool parts:', hasToolParts);
    console.log('  Has step-finish:', hasStepFinish);
    console.log('  Is tool/incomplete:', isToolOrIncomplete);
    console.log('  Part types:', lastMessage.parts.map((p: any) => p.type));
    
    // Detailed token breakdown
    if (tokens && typeof tokens === 'object') {
      const baseTokens = (tokens.input || 0) + (tokens.output || 0) + (tokens.reasoning || 0);
      console.log('📊 Token Breakdown:');
      console.log('  Input:', tokens.input || 0);
      console.log('  Output:', tokens.output || 0);
      console.log('  Reasoning:', tokens.reasoning || 0);
      console.log('  Base Total:', baseTokens);
      
      if (tokens.cache) {
        const cacheRead = tokens.cache.read || 0;
        const cacheWrite = tokens.cache.write || 0;
        const totalCache = cacheRead + cacheWrite;
        console.log('  Cache Read:', cacheRead);
        console.log('  Cache Write:', cacheWrite);
        console.log('  Cache Total:', totalCache);
        console.log('  Cache > Base?', totalCache > baseTokens);
        console.log('  Final Calculation:', totalCache > baseTokens ? baseTokens + totalCache : baseTokens);
      }
    }
    
    // Check current context usage from store
    const contextUsage = state.sessionContextUsage.get(currentSessionId);
    console.log('💾 Cached Context Usage:', contextUsage);
    
    // Get context usage via function
    const configStore = (window as any).__zustand_config_store__;
    if (configStore) {
      const currentModel = configStore.getState().getCurrentModel();
      const contextLimit = currentModel?.limit?.context || 0;
      console.log('🎯 Current model context limit:', contextLimit);
      
      if (contextLimit > 0) {
        const liveContextUsage = state.getContextUsage(contextLimit);
        console.log('🔄 Live Context Usage:', liveContextUsage);
      }
    }
    
    console.log('📜 All assistant messages count:', assistantMessages.length);
    console.log('Full message object:', lastMessage);
  };
  
  console.log('🔧 Debug utility loaded. Call debugContextTokens() to inspect tokens in last assistant message.');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
