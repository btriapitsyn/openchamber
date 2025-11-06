import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts'
import './index.css'
import App from './App.tsx'
import { SessionAuthGate } from './components/auth/SessionAuthGate'
import { ThemeSystemProvider } from './contexts/ThemeSystemContext'
import { ThemeProvider } from './components/providers/ThemeProvider'
import './lib/debug' // Load debug utilities
import { syncDesktopSettings, initializeAppearancePreferences } from './lib/persistence'
import { startAppearanceAutoSave } from './lib/appearanceAutoSave'
import { applyPersistedDirectoryPreferences } from './lib/directoryPersistence'
import { startTypographyWatcher } from './lib/typographyWatcher'


await syncDesktopSettings();
await initializeAppearancePreferences();
startAppearanceAutoSave();
startTypographyWatcher();
await applyPersistedDirectoryPreferences();

// Debug utility for token inspection
if (typeof window !== 'undefined') {
  (window as { debugContextTokens?: () => void }).debugContextTokens = () => {
    const sessionStore = (window as { __zustand_session_store__?: { getState: () => { currentSessionId?: string; messages: Map<string, { info: { role: string }; parts: { type: string }[] }[]>; sessionContextUsage: Map<string, unknown>; getContextUsage: (limit: number) => unknown } } }).__zustand_session_store__;
    if (!sessionStore) {
      return;
    }

    const state = sessionStore.getState();
    const currentSessionId = state.currentSessionId;

    if (!currentSessionId) {
      return;
    }

    const sessionMessages = state.messages.get(currentSessionId) || [];
    const assistantMessages = sessionMessages.filter((m: { info: { role: string } }) => m.info.role === 'assistant');

    if (assistantMessages.length === 0) {
      return;
    }

    const lastMessage = assistantMessages[assistantMessages.length - 1];
    const tokens = (lastMessage.info as { tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } } }).tokens;

    // Token debug function - all variables declared but intentionally unused in this debug utility
    // These help with debugging but are not actively used in the current implementation

    // Detailed token breakdown
    if (tokens && typeof tokens === 'object') {
      // Token analysis - available for debugging in console
      console.debug('Token breakdown:', {
        base: (tokens.input || 0) + (tokens.output || 0) + (tokens.reasoning || 0),
        cache: tokens.cache ? (tokens.cache.read || 0) + (tokens.cache.write || 0) : 0
      });
    }

    // Check current context usage from store - intentionally unused, available for debugging
    void state.sessionContextUsage.get(currentSessionId);

    // Get context usage via function
    const configStore = (window as { __zustand_config_store__?: { getState: () => { getCurrentModel: () => { limit?: { context?: number } } | null } } }).__zustand_config_store__;
    if (configStore) {
      const currentModel = configStore.getState().getCurrentModel();
      const contextLimit = currentModel?.limit?.context || 0;

      if (contextLimit > 0) {
        // Live context usage - intentionally unused, available for debugging
        void state.getContextUsage(contextLimit);
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
