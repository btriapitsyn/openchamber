import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts'
import './index.css'
import App from './App.tsx'
import { SessionAuthGate } from './components/auth/SessionAuthGate'
import { ThemeSystemProvider } from './contexts/ThemeSystemContext'
import { ThemeProvider } from './components/providers/ThemeProvider'
import './lib/debug' // Load debug utilities
import { syncDesktopSettings } from './lib/persistence'

await syncDesktopSettings();

if (typeof window !== 'undefined') {
  let savedHome: string | null = null;
  let savedDirectory: string | null = null;

  try {
    savedHome = window.localStorage.getItem('homeDirectory');
    savedDirectory = window.localStorage.getItem('lastDirectory');
  } catch (error) {
    console.warn('Failed to read saved directory preferences:', error);
  }

  const module = await import('./stores/useDirectoryStore');
  const directoryStore = module.useDirectoryStore.getState();

  if (savedHome && directoryStore.homeDirectory !== savedHome) {
    directoryStore.synchronizeHomeDirectory(savedHome);
  }

  if (savedDirectory) {
    directoryStore.setDirectory(savedDirectory, { showOverlay: false });
  }
}

// Debug utility for token inspection
if (typeof window !== 'undefined') {
  (window as any).debugContextTokens = () => {
    const sessionStore = (window as any).__zustand_session_store__;
    if (!sessionStore) {
      return;
    }
    
    const state = sessionStore.getState();
    const currentSessionId = state.currentSessionId;
    
    if (!currentSessionId) {
      return;
    }
    
    const sessionMessages = state.messages.get(currentSessionId) || [];
    const assistantMessages = sessionMessages.filter((m: any) => m.info.role === 'assistant');
    
    if (assistantMessages.length === 0) {
      return;
    }
    
    const lastMessage = assistantMessages[assistantMessages.length - 1];
    const tokens = (lastMessage.info as any).tokens;
    
    // Token debug function
    
    // Check if this is a tool/incomplete message
    const hasToolParts = lastMessage.parts.some((p: any) => p.type === 'tool');
    const hasStepFinish = lastMessage.parts.some((p: any) => p.type === 'step-finish');
    const isToolOrIncomplete = hasToolParts || !hasStepFinish;
    
    // Detailed token breakdown
    if (tokens && typeof tokens === 'object') {
      const baseTokens = (tokens.input || 0) + (tokens.output || 0) + (tokens.reasoning || 0);
      
      if (tokens.cache) {
        const cacheRead = tokens.cache.read || 0;
        const cacheWrite = tokens.cache.write || 0;
        const totalCache = cacheRead + cacheWrite;
      }
    }
    
    // Check current context usage from store
    const contextUsage = state.sessionContextUsage.get(currentSessionId);
    
    // Get context usage via function
    const configStore = (window as any).__zustand_config_store__;
    if (configStore) {
      const currentModel = configStore.getState().getCurrentModel();
      const contextLimit = currentModel?.limit?.context || 0;
      
      if (contextLimit > 0) {
        const liveContextUsage = state.getContextUsage(contextLimit);
      }
    }
  };
  
  
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeSystemProvider>
      <ThemeProvider>
        <SessionAuthGate>
          <App />
        </SessionAuthGate>
      </ThemeProvider>
    </ThemeSystemProvider>
  </StrictMode>,
);
