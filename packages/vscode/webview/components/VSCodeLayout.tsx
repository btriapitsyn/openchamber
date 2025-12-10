import React from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { SessionsListView } from './SessionsListView';
import { ChatPanel } from './ChatPanel';

export function VSCodeLayout() {
  const { currentView } = useNavigation();

  return (
    <div className="h-full w-full bg-background text-foreground">
      {currentView === 'sessions' ? <SessionsListView /> : <ChatPanel />}
    </div>
  );
}
