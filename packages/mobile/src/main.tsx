import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import MobileApp from './App';

// Import styles
import '@openchamber/ui/index.css';
import '@openchamber/ui/styles/fonts';
import './index.css';

// Initialize Capacitor plugins
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { App } from '@capacitor/app';

// Set up platform-specific configurations
const initializePlatform = async () => {
  try {
    // Configure status bar for dark theme
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0a0a0a' });
  } catch {
    // Status bar might not be available in web/dev mode
  }
  
  try {
    // Configure keyboard behavior
    await Keyboard.setAccessoryBarVisible({ isVisible: true });
    await Keyboard.setScroll({ isDisabled: false });
  } catch {
    // Keyboard plugin might not be available
  }
  
  // Handle app state changes
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      // App came to foreground - could refresh connection status here
      console.log('App became active');
    }
  });
  
  // Handle URL opens (deep linking)
  App.addListener('appUrlOpen', ({ url }) => {
    console.log('App opened with URL:', url);
    // Could handle openchamber:// deep links here
  });
};

// Initialize and render
initializePlatform().then(() => {
  const container = document.getElementById('root');
  if (!container) {
    throw new Error('Root element not found');
  }
  
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <MobileApp />
    </StrictMode>
  );
});
