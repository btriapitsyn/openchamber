import React from 'react';
import { RiCloseLine, RiFullscreenExitLine, RiFullscreenLine } from '@remixicon/react';

import { Button } from '@/components/ui/button';
import { DiffView, FilesView } from '@/components/views';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';

const CONTEXT_PANEL_MIN_WIDTH = 360;
const CONTEXT_PANEL_MAX_WIDTH = 1400;
const CONTEXT_PANEL_DEFAULT_WIDTH = 520;

const normalizeDirectoryKey = (value: string): string => {
  if (!value) return '';

  const raw = value.replace(/\\/g, '/');
  const hadUncPrefix = raw.startsWith('//');
  let normalized = raw.replace(/\/+$/g, '');
  normalized = normalized.replace(/\/+/g, '/');

  if (hadUncPrefix && !normalized.startsWith('//')) {
    normalized = `/${normalized}`;
  }

  if (normalized === '') {
    return raw.startsWith('/') ? '/' : '';
  }

  return normalized;
};

const clampWidth = (width: number): number => {
  if (!Number.isFinite(width)) {
    return CONTEXT_PANEL_DEFAULT_WIDTH;
  }

  return Math.min(CONTEXT_PANEL_MAX_WIDTH, Math.max(CONTEXT_PANEL_MIN_WIDTH, Math.round(width)));
};

const getPathLabel = (value: string | null): string => {
  if (!value) {
    return '';
  }
  const normalized = value.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
};

export const ContextPanel: React.FC = () => {
  const effectiveDirectory = useEffectiveDirectory() ?? '';
  const directoryKey = React.useMemo(() => normalizeDirectoryKey(effectiveDirectory), [effectiveDirectory]);

  const panelState = useUIStore((state) => (directoryKey ? state.contextPanelByDirectory[directoryKey] : undefined));
  const closeContextPanel = useUIStore((state) => state.closeContextPanel);
  const toggleContextPanelExpanded = useUIStore((state) => state.toggleContextPanelExpanded);
  const setContextPanelWidth = useUIStore((state) => state.setContextPanelWidth);

  const isOpen = Boolean(panelState?.isOpen && panelState?.mode);
  const isExpanded = Boolean(isOpen && panelState?.expanded);
  const width = clampWidth(panelState?.width ?? CONTEXT_PANEL_DEFAULT_WIDTH);

  const [isResizing, setIsResizing] = React.useState(false);
  const startXRef = React.useRef(0);
  const startWidthRef = React.useRef(width);

  React.useEffect(() => {
    if (!isResizing || !directoryKey) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const delta = startXRef.current - event.clientX;
      setContextPanelWidth(directoryKey, startWidthRef.current + delta);
    };

    const handlePointerUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [directoryKey, isResizing, setContextPanelWidth]);

  const handleResizeStart = React.useCallback((event: React.PointerEvent) => {
    if (!isOpen || isExpanded || !directoryKey) {
      return;
    }

    setIsResizing(true);
    startXRef.current = event.clientX;
    startWidthRef.current = width;
    event.preventDefault();
  }, [directoryKey, isExpanded, isOpen, width]);

  const handleClose = React.useCallback(() => {
    if (!directoryKey) {
      return;
    }
    closeContextPanel(directoryKey);
  }, [closeContextPanel, directoryKey]);

  const handleToggleExpanded = React.useCallback(() => {
    if (!directoryKey) {
      return;
    }
    toggleContextPanelExpanded(directoryKey);
  }, [directoryKey, toggleContextPanelExpanded]);

  const panelTitle = panelState?.mode === 'diff' ? 'Diff' : panelState?.mode === 'file' ? 'File' : 'Panel';
  const pathLabel = getPathLabel(panelState?.targetPath ?? null);

  const content = panelState?.mode === 'diff'
    ? <DiffView hideStackedFileSidebar stackedDefaultCollapsedAll hideFileSelector pinSelectedFileHeaderToTopOnNavigate />
    : panelState?.mode === 'file'
      ? <FilesView mode="editor-only" />
      : null;

  const header = (
    <header className="flex h-10 items-center gap-2 border-b border-border/40 px-2.5">
      <div className="min-w-0 flex-1 truncate typography-ui-label text-foreground">
        <span>{panelTitle}</span>
        {pathLabel ? <span className="ml-2 text-muted-foreground">{pathLabel}</span> : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleToggleExpanded}
        className="h-6 w-6 p-0"
        title={isExpanded ? 'Collapse panel' : 'Expand panel'}
        aria-label={isExpanded ? 'Collapse panel' : 'Expand panel'}
      >
        {isExpanded ? <RiFullscreenExitLine className="h-3.5 w-3.5" /> : <RiFullscreenLine className="h-3.5 w-3.5" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleClose}
        className="h-6 w-6 p-0"
        title="Close panel"
        aria-label="Close panel"
      >
        <RiCloseLine className="h-3.5 w-3.5" />
      </Button>
    </header>
  );

  if (!isOpen) {
    return null;
  }

  if (isExpanded) {
    return (
      <div className="absolute inset-0 z-20 flex min-w-0 flex-col overflow-hidden border-l border-border bg-background">
        {header}
        <div className="min-h-0 flex-1 overflow-hidden">{content}</div>
      </div>
    );
  }

  return (
    <aside
      className={cn(
        'relative flex h-full min-h-0 flex-shrink-0 flex-col overflow-hidden border-l border-border bg-background',
        isResizing ? 'transition-none' : 'transition-[width] duration-200 ease-in-out'
      )}
      style={{
        width: `${width}px`,
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
      }}
    >
      <div
        className={cn(
          'absolute left-0 top-0 z-20 h-full w-[4px] cursor-col-resize transition-colors hover:bg-primary/50',
          isResizing && 'bg-primary'
        )}
        onPointerDown={handleResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize context panel"
      />
      {header}
      <div className="min-h-0 flex-1 overflow-hidden">{content}</div>
    </aside>
  );
};
