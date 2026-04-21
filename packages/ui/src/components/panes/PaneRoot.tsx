import React from 'react';
import { cn } from '@/lib/utils';
import { PaneProvider } from '@/contexts/PaneContext';
import { useSessionUIStore, type PaneSide } from '@/sync/session-ui-store';
import { ChatContainer } from '@/components/chat/ChatContainer';
import { ChatErrorBoundary } from '@/components/chat/ChatErrorBoundary';
import { PaneHeader } from './PaneHeader';

type Props = {
  pane: PaneSide;
  sessionId: string | null;
  isFocused: boolean;
  showHeader: boolean;
  showClose: boolean;
};

export const PaneRoot: React.FC<Props> = ({ pane, sessionId, isFocused, showHeader, showClose }) => {
  const setFocusedPane = useSessionUIStore((s) => s.setFocusedPane);

  const handleFocusOnInteraction = React.useCallback(() => {
    if (!isFocused) setFocusedPane(pane);
  }, [isFocused, pane, setFocusedPane]);

  return (
    <PaneProvider value={{ pane, sessionId, isFocused }}>
      <div
        onMouseDownCapture={handleFocusOnInteraction}
        onFocusCapture={handleFocusOnInteraction}
        className={cn(
          'relative flex h-full min-w-0 flex-1 flex-col overflow-hidden',
          !isFocused && 'opacity-[0.97]',
        )}
        data-pane={pane}
        data-pane-focused={isFocused ? 'true' : 'false'}
      >
        {showHeader ? (
          <PaneHeader
            pane={pane}
            sessionId={sessionId}
            isFocused={isFocused}
            showClose={showClose}
          />
        ) : null}
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <ChatErrorBoundary sessionId={sessionId ?? undefined}>
            <ChatContainer />
          </ChatErrorBoundary>
        </div>
      </div>
    </PaneProvider>
  );
};
