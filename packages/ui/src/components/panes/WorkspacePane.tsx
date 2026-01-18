import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePanes, type PaneId, type PaneTab } from '@/stores/usePaneStore';
import { getTabLabel, type PaneTabType } from '@/constants/tabs';
import { useSessionStore } from '@/stores/useSessionStore';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { PaneTabBar } from './PaneTabBar';
import { TabContextProvider } from '@/contexts/TabContext';

import { ChatView } from '@/components/views/ChatView';
import { DiffView } from '@/components/views/DiffView';
import { FilesView } from '@/components/views/FilesView';
import { TerminalView } from '@/components/views/TerminalView';
import { GitView } from '@/components/views/GitView';
import { TodoView } from '@/components/views/TodoView';
import { PreviewView } from '@/components/views/PreviewView';
import { AppRunnerTerminal } from '@/components/views/AppRunnerTerminal';

interface WorkspacePaneProps {
  paneId: PaneId;
  worktreeId: string | null;
  className?: string;
  style?: React.CSSProperties;
  isLastPane?: boolean;
  isCollapsed?: boolean;
}

const WorkspacePaneComponent: React.FC<WorkspacePaneProps> = ({
  paneId,
  worktreeId,
  className,
  style,
  isLastPane = false,
  isCollapsed = false,
}) => {
  const resolvedWorktreeId = worktreeId ?? 'global';
  
  const {
    leftPane,
    rightPane,
    rightBottomPane,
    rightBottomCollapsed,
    focusedPane,
    setFocusedPane,
    setActiveTab,
    closeTab,
    reorderTabs,
    addTab,
    openChatSession,
    moveTab,
    updateTabMetadata,
    setRightBottomCollapsed,
  } = usePanes(worktreeId);

  const { setCurrentSession, createSession } = useSessionStore();
  const [isDragOver, setIsDragOver] = useState(false);

  const paneState = paneId === 'left' ? leftPane : paneId === 'right' ? rightPane : rightBottomPane;
  const isBottomPane = paneId === 'rightBottom';
  const effectiveCollapsed = isBottomPane ? rightBottomCollapsed : isCollapsed;

  const handleFocus = useCallback(() => {
    setFocusedPane(paneId);
  }, [paneId, setFocusedPane]);

  const handleActivateTab = useCallback(
    (tabId: string) => {
      if (isBottomPane && rightBottomCollapsed) {
        setRightBottomCollapsed(false);
      }
      setActiveTab(paneId, tabId);
      const tab = paneState.tabs.find((t) => t.id === tabId);
      if (tab?.type === 'chat' && tab.sessionId) {
        setCurrentSession(tab.sessionId);
      }
    },
    [paneId, setActiveTab, paneState.tabs, setCurrentSession, isBottomPane, rightBottomCollapsed, setRightBottomCollapsed]
  );

  const handleToggleCollapse = useCallback(() => {
    if (isBottomPane) {
      setRightBottomCollapsed(!rightBottomCollapsed);
    }
  }, [isBottomPane, rightBottomCollapsed, setRightBottomCollapsed]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      closeTab(paneId, tabId);
    },
    [paneId, closeTab]
  );

  const handleReorderTabs = useCallback(
    (sourceId: string, targetId: string) => {
      reorderTabs(paneId, sourceId, targetId);
    },
    [paneId, reorderTabs]
  );

  const handleAddTab = useCallback(
    async (type: PaneTabType) => {
      if (type === 'chat') {
        const session = await createSession();
        if (session) {
          openChatSession(paneId, session.id, session.title);
          setCurrentSession(session.id);
        }
      } else {
        addTab(paneId, {
          type,
          title: getTabLabel(type),
        });
      }
      setFocusedPane(paneId);
    },
    [paneId, createSession, openChatSession, setCurrentSession, addTab, setFocusedPane]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (
      e.dataTransfer.types.includes('application/x-openchamber-session') ||
      e.dataTransfer.types.includes('application/x-openchamber-tab')
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-openchamber-tab') ? 'move' : 'copy';
      const target = e.target as HTMLElement;
      const isOverTabBar = target.closest('[data-pane-id]') !== null;
      setIsDragOver(!isOverTabBar);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const tabData = e.dataTransfer.getData('application/x-openchamber-tab');
      if (tabData) {
        try {
          const { tabId, sourcePane } = JSON.parse(tabData) as {
            tabId: string;
            sourcePane: PaneId;
            tab: unknown;
          };
          if (sourcePane !== paneId) {
            moveTab(sourcePane, paneId, tabId);
          }
          setFocusedPane(paneId);
          return;
        } catch { /* ignore parse errors, try session data next */ }
      }

      const sessionData = e.dataTransfer.getData('application/x-openchamber-session');
      if (sessionData) {
        try {
          const { sessionId, title } = JSON.parse(sessionData) as {
            sessionId: string;
            title: string;
            directory: string;
          };
          openChatSession(paneId, sessionId, title);
          setCurrentSession(sessionId);
          setFocusedPane(paneId);
        } catch {
          return;
        }
      }
    },
    [paneId, openChatSession, setCurrentSession, setFocusedPane, moveTab]
  );

  const activeTab = useMemo(() => {
    if (!paneState.activeTabId) return null;
    const tab = paneState.tabs.find((t) => t.id === paneState.activeTabId) ?? null;
    return tab;
  }, [paneState.activeTabId, paneState.tabs]);

  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  
  useEffect(() => {
    const tabSessionId = activeTab?.type === 'chat' ? activeTab.sessionId : null;
    if (!tabSessionId) return;
    
    const isFocusedPaneWithMismatch = paneId === focusedPane && tabSessionId !== currentSessionId;
    const isPageReloadOnLeftPane = currentSessionId === null && paneId === 'left';
    
    if (isFocusedPaneWithMismatch || isPageReloadOnLeftPane) {
      setCurrentSession(tabSessionId);
    }
  }, [activeTab, currentSessionId, setCurrentSession, paneId, focusedPane]);

  const handleUpdateTabMetadata = useCallback(
    (tabId: string) => (metadata: Record<string, unknown>) => {
      updateTabMetadata(paneId, tabId, metadata);
    },
    [paneId, updateTabMetadata]
  );

  const renderContent = useCallback((tab: PaneTab | null) => {
    if (!tab) {
      return (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p className="text-sm">No tabs open</p>
        </div>
      );
    }

    const content = (() => {
      switch (tab.type) {
        case 'chat':
          return <ChatView />;
        case 'diff':
          return <DiffView />;
        case 'files':
          return <FilesView />;
        case 'terminal':
          return <TerminalView />;
        case 'git':
          return <GitView />;
        case 'todo':
          return <TodoView />;
        case 'preview':
          return <PreviewView />;
        case 'appRunner':
          return <AppRunnerTerminal />;
        default:
          return (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <p className="text-sm">Unknown tab type: {tab.type}</p>
            </div>
          );
      }
    })();

    return (
      <TabContextProvider
        key={tab.id}
        paneId={paneId}
        tab={tab}
        worktreeId={resolvedWorktreeId}
        updateMetadata={handleUpdateTabMetadata(tab.id)}
      >
        {content}
      </TabContextProvider>
    );
  }, [paneId, resolvedWorktreeId, handleUpdateTabMetadata]);

  return (
    <div
      className={cn(
        'flex flex-col h-full overflow-hidden relative',
        isDragOver && 'ring-2 ring-inset ring-primary/50',
        className
      )}
      onClick={handleFocus}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={style}
    >
      <PaneTabBar
        paneId={paneId}
        tabs={paneState.tabs}
        activeTabId={paneState.activeTabId}
        onActivateTab={handleActivateTab}
        onCloseTab={handleCloseTab}
        onReorderTabs={handleReorderTabs}
        onAddTab={handleAddTab}
        onMoveTabFromPane={(sourcePane, tabId) => {
          moveTab(sourcePane, paneId, tabId);
          setFocusedPane(paneId);
        }}
        isLastPane={isLastPane}
        isCollapsible={isBottomPane}
        isCollapsed={effectiveCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      <div className={cn(
        'flex-1 overflow-hidden relative',
        effectiveCollapsed && 'hidden'
      )}>
        <ErrorBoundary>{renderContent(activeTab)}</ErrorBoundary>
      </div>

      {isDragOver && (
        <div className="absolute inset-0 bg-primary/5 pointer-events-none flex items-center justify-center">
          <div className="bg-background/90 rounded-lg px-4 py-2 shadow-lg border">
            <span className="text-sm font-medium">Drop to open in {paneId} pane</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const WorkspacePane = React.memo(WorkspacePaneComponent);
WorkspacePane.displayName = 'WorkspacePane';
