import React, { useState, useEffect } from 'react';
import { QRScannerScreen } from './components/QRScannerScreen';
import { MobileLayout } from './components/MobileLayout';
import { useRemoteConnectionStore } from './stores/useRemoteConnectionStore';
import { ThemeProvider } from '@openchamber/ui/components/providers/ThemeProvider';
import { ThemeSystemProvider } from '@openchamber/ui/contexts/ThemeSystemContext';

type AppView = 'scanner' | 'chat';

const MobileApp: React.FC = () => {
  const { currentConnection } = useRemoteConnectionStore();
  const [view, setView] = useState<AppView>('scanner');
  
  // Auto-switch to chat if already connected
  useEffect(() => {
    if (currentConnection) {
      setView('chat');
    }
  }, []);
  
  const handleConnected = () => {
    setView('chat');
  };
  
  const handleDisconnect = () => {
    setView('scanner');
  };
  
  // Hide loading screen
  useEffect(() => {
    const loadingElement = document.getElementById('initial-loading');
    if (loadingElement) {
      loadingElement.classList.add('fade-out');
      setTimeout(() => loadingElement.remove(), 300);
    }
  }, []);
  
  if (view === 'scanner') {
    return (
      <ThemeSystemProvider>
        <ThemeProvider>
          <QRScannerScreen onConnected={handleConnected} />
        </ThemeProvider>
      </ThemeSystemProvider>
    );
  }
  
  return <MobileLayout onDisconnect={handleDisconnect} />;
};

export default MobileApp;
