import React, { useCallback, useState, useRef, useMemo } from 'react';
import {
  RiAddLine,
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiCloseLine,
  RiQuestionLine,
  RiSideBarLine,
} from '@remixicon/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GridLoader } from '@/components/ui/grid-loader';
import { cn, getModifierLabel } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionStore } from '@/stores/useSessionStore';
import type { PaneId, PaneTab, PaneTabType } from '@/stores/usePaneStore';
import { SessionHistoryDropdown } from './SessionHistoryDropdown';
import { McpDropdown } from '@/components/mcp/McpDropdown';
import { getTabIcon, getTabAddLabel, getTabLabel } from '@/constants/tabs';

interface DraggableTabItemProps {
  tab: PaneTab;
  paneId: PaneId;
  isActive: boolean;
  isDragOver: boolean;
  isDragging: boolean;
  isStreaming: boolean;
  displayTitle: string;
  onActivate: () => void;
  onClose: () => void;
  onDragStart: (e: React.DragEvent, tabId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetTabId: string) => void;
}

const DraggableTabItem: React.FC<DraggableTabItemProps> = ({
  tab,
  paneId,
  isActive,
  isDragOver,
  isDragging,
  isStreaming,
  displayTitle,
  onActivate,
  onClose,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}) => {
  const Icon = getTabIcon(tab.type);
  const showLoader = tab.type === 'chat' && isStreaming;

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClose();
    },
    [onClose]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData(
        'application/x-openchamber-tab',
        JSON.stringify({ tabId: tab.id, sourcePane: paneId, tab })
      );
      e.dataTransfer.effectAllowed = 'move';
      onDragStart(e, tab.id);
    },
    [tab, paneId, onDragStart]
  );

  return (
    <div
      onClick={onActivate}
      draggable
      onDragStart={handleDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, tab.id)}
      className={cn(
        'group relative flex h-12 items-center gap-1.5 px-3 cursor-pointer select-none',
        'border-r transition-colors',
        isActive
          ? 'bg-background text-foreground'
          : 'bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50',
        isDragging && 'opacity-50',
        isDragOver && 'bg-primary/20'
      )}
      style={{
        borderColor: 'var(--interactive-border)',
      }}
    >
      {showLoader ? (
        <GridLoader size="xs" className="text-primary shrink-0" />
      ) : (
        <Icon className="h-4 w-4 shrink-0" />
      )}
      <span className="truncate max-w-[120px] text-sm">{displayTitle}</span>
      <button
        type="button"
        onClick={handleClose}
        className={cn(
          'ml-1 h-4 w-4 shrink-0 rounded-sm',
          'opacity-0 group-hover:opacity-100 transition-opacity',
          'hover:bg-foreground/10',
          isActive && 'opacity-60'
        )}
        aria-label={`Close ${displayTitle}`}
      >
        <RiCloseLine className="h-4 w-4" />
      </button>
    </div>
  );
};

interface NewTabMenuProps {
  onSelect: (type: PaneTabType) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

const NewTabMenu: React.FC<NewTabMenuProps> = ({ onSelect, onClose, anchorRef }) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  
  React.useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, [anchorRef]);

  const tabTypes: PaneTabType[] = ['chat', 'terminal', 'files', 'diff', 'git', 'todo', 'preview'];
  const options = tabTypes.map((type) => ({
    type,
    label: getTabAddLabel(type),
    icon: getTabIcon(type),
  }));

  return (
    <div
      className="fixed z-50 min-w-[140px] rounded-md border bg-popover p-1 shadow-md"
      style={{ 
        borderColor: 'var(--interactive-border)',
        top: position.top,
        left: position.left,
      }}
    >
      {options.map(({ type, label, icon: Icon }) => (
        <button
          key={type}
          type="button"
          onClick={() => {
            onSelect(type);
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Icon className="h-4 w-4" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
};

interface PaneTabBarProps {
  paneId: PaneId;
  tabs: PaneTab[];
  activeTabId: string | null;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onReorderTabs: (sourceId: string, targetId: string) => void;
  onAddTab: (type: PaneTabType) => void;
  onMoveTabFromPane?: (sourcePane: PaneId, tabId: string) => void;
  isLastPane?: boolean;
  isCollapsible?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const PaneTabBar: React.FC<PaneTabBarProps> = ({
  paneId,
  tabs,
  activeTabId,
  onActivateTab,
  onCloseTab,
  onReorderTabs,
  onAddTab,
  onMoveTabFromPane,
  isLastPane = false,
  isCollapsible = false,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [showNewTabMenu, setShowNewTabMenu] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  
  const toggleHelpDialog = useUIStore((state) => state.toggleHelpDialog);
  const sessionActivityPhase = useSessionStore((s) => s.sessionActivityPhase);
  const sessions = useSessionStore((s) => s.sessions);

  const sessionTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const session of sessions) {
      if (session.id && session.title) {
        map.set(session.id, session.title);
      }
    }
    return map;
  }, [sessions]);

  const getDisplayTitle = useCallback((tab: PaneTab): string => {
    if (tab.type === 'chat' && tab.sessionId) {
      const sessionTitle = sessionTitleMap.get(tab.sessionId);
      if (sessionTitle && sessionTitle.trim().length > 0) {
        return sessionTitle;
      }
    }
    return tab.title || getTabLabel(tab.type);
  }, [sessionTitleMap]);
  
  const actionButtonClass = cn(
    'flex h-12 w-12 shrink-0 items-center justify-center',
    'text-muted-foreground hover:text-foreground hover:bg-muted/50',
    'transition-colors'
  );

  const handleDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    setDraggingTabId(tabId);
    const target = e.currentTarget as HTMLElement;
    const cleanup = () => {
      setDraggingTabId(null);
      setDragOverTabId(null);
      target.removeEventListener('dragend', cleanup);
    };
    target.addEventListener('dragend', cleanup);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingTabId(null);
    setDragOverTabId(null);
  }, []);

  const handleTabDragOver = useCallback((e: React.DragEvent, tabId: string) => {
    if (e.dataTransfer.types.includes('application/x-openchamber-tab')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverTabId(tabId);
    }
  }, []);

  const handleTabDragLeave = useCallback(() => {
    setDragOverTabId(null);
  }, []);

  const handleTabDrop = useCallback(
    (e: React.DragEvent, targetTabId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverTabId(null);

      const tabData = e.dataTransfer.getData('application/x-openchamber-tab');
      if (!tabData) return;

      try {
        const { tabId: sourceTabId, sourcePane } = JSON.parse(tabData) as {
          tabId: string;
          sourcePane: PaneId;
        };

        if (sourcePane === paneId && sourceTabId !== targetTabId) {
          onReorderTabs(sourceTabId, targetTabId);
        } else if (sourcePane !== paneId && onMoveTabFromPane) {
          onMoveTabFromPane(sourcePane, sourceTabId);
        }
      } catch { /* empty */ }
    },
    [paneId, onReorderTabs, onMoveTabFromPane]
  );

  const handleBarDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-openchamber-tab')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  }, []);

  const handleBarDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      
      const tabData = e.dataTransfer.getData('application/x-openchamber-tab');
      if (!tabData) return;

      try {
        const { tabId: sourceTabId, sourcePane } = JSON.parse(tabData) as {
          tabId: string;
          sourcePane: PaneId;
        };

        if (sourcePane !== paneId && onMoveTabFromPane) {
          onMoveTabFromPane(sourcePane, sourceTabId);
        }
      } catch { /* empty */ }
    },
    [paneId, onMoveTabFromPane]
  );

  const isSidebarOpen = useUIStore((state) => state.isSidebarOpen);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const showSidebarToggle = paneId === 'left' && !isSidebarOpen;

  return (
    <div
      className="flex h-12 items-stretch border-b bg-muted/20 overflow-hidden"
      style={{ borderColor: 'var(--interactive-border)' }}
      data-pane-id={paneId}
      onDragEnd={handleDragEnd}
      onDragOver={handleBarDragOver}
      onDrop={handleBarDrop}
    >
      {isCollapsible && (
        <div className="flex items-stretch shrink-0 border-r" style={{ borderColor: 'var(--interactive-border)' }}>
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggleCollapse}
                className={actionButtonClass}
                aria-label={isCollapsed ? 'Expand panel' : 'Collapse panel'}
              >
                {isCollapsed ? <RiArrowUpSLine className="h-4 w-4" /> : <RiArrowDownSLine className="h-4 w-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{isCollapsed ? 'Expand Panel' : 'Collapse Panel'}</TooltipContent>
          </Tooltip>
        </div>
      )}
      {showSidebarToggle && (
        <div className="flex items-stretch shrink-0 border-r" style={{ borderColor: 'var(--interactive-border)' }}>
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleSidebar}
                className={actionButtonClass}
                aria-label="Open sidebar"
              >
                <RiSideBarLine className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Open Sidebar</TooltipContent>
          </Tooltip>
        </div>
      )}
      <div className="flex items-stretch overflow-x-auto overflow-y-hidden flex-1 min-w-0">
        {tabs.map((tab) => {
          const phase = tab.sessionId ? sessionActivityPhase?.get(tab.sessionId) : undefined;
          const isStreaming = phase === 'busy' || phase === 'cooldown';
          return (
            <DraggableTabItem
              key={tab.id}
              tab={tab}
              paneId={paneId}
              isActive={tab.id === activeTabId}
              isDragOver={dragOverTabId === tab.id}
              isDragging={draggingTabId === tab.id}
              isStreaming={isStreaming}
              displayTitle={getDisplayTitle(tab)}
              onActivate={() => onActivateTab(tab.id)}
              onClose={() => onCloseTab(tab.id)}
              onDragStart={handleDragStart}
              onDragOver={(e) => handleTabDragOver(e, tab.id)}
              onDragLeave={handleTabDragLeave}
              onDrop={handleTabDrop}
            />
          );
        })}
      </div>

      <div className="flex items-stretch shrink-0">
        <div className="border-l" style={{ borderColor: 'var(--interactive-border)' }}>
          <div className="relative flex items-center h-full">
            <Tooltip delayDuration={500}>
              <TooltipTrigger asChild>
                <button
                  ref={addButtonRef}
                  type="button"
                  onClick={() => {
                    if (paneId === 'rightBottom') {
                      onAddTab('terminal');
                    } else {
                      setShowNewTabMenu((v) => !v);
                    }
                  }}
                  className={actionButtonClass}
                  aria-label={paneId === 'rightBottom' ? 'Add terminal' : 'Add new tab'}
                >
                  <RiAddLine className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{paneId === 'rightBottom' ? 'New Terminal' : 'New Tab'}</TooltipContent>
            </Tooltip>
            {showNewTabMenu && paneId !== 'rightBottom' && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowNewTabMenu(false)}
                />
                <NewTabMenu
                  onSelect={onAddTab}
                  onClose={() => setShowNewTabMenu(false)}
                  anchorRef={addButtonRef}
                />
              </>
            )}
          </div>
        </div>

        {paneId !== 'rightBottom' && (
          <div className="border-l" style={{ borderColor: 'var(--interactive-border)' }}>
            <SessionHistoryDropdown paneId={paneId} buttonClassName={actionButtonClass} />
          </div>
        )}

        {isLastPane && (
          <>
            <div className="border-l" style={{ borderColor: 'var(--interactive-border)' }}>
              <McpDropdown buttonClassName={actionButtonClass} />
            </div>

            <div className="border-l" style={{ borderColor: 'var(--interactive-border)' }}>
              <Tooltip delayDuration={500}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={toggleHelpDialog}
                    aria-label="Keyboard shortcuts"
                    className={actionButtonClass}
                  >
                    <RiQuestionLine className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Keyboard Shortcuts ({getModifierLabel()}+.)</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
