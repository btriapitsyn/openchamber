import React from 'react';
import Editor, { type OnMount, type Monaco } from '@monaco-editor/react';
import {
  RiCloseLine,
  RiSaveLine,
  RiSave2Line,
  RiLoader4Line,
  RiFileEditLine,
  RiFolder3Line,
} from '@remixicon/react';
import { toast } from 'sonner';

import { useEditorStore, type EditorTab } from '@/stores/useEditorStore';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { createMonacoTheme, getMonacoLanguage } from '@/lib/theme/monacoThemeAdapter';
import { cn, getModifierLabel } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const MONACO_THEME_NAME = 'openchamber-theme';

export const EditorView: React.FC = () => {
  const { currentTheme } = useThemeSystem();
  const { files } = useRuntimeAPIs();
  const monacoRef = React.useRef<Monaco | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const {
    tabs,
    activeTabId,
    closeTab,
    setActiveTab,
    updateContent,
    markSaved,
    hasUnsavedChanges,
  } = useEditorStore();

  const activeTab = React.useMemo(
    () => tabs.find((t) => t.id === activeTabId),
    [tabs, activeTabId]
  );

  // Apply theme when Monaco is ready or theme changes
  React.useEffect(() => {
    if (monacoRef.current && currentTheme) {
      const monacoTheme = createMonacoTheme(currentTheme);
      monacoRef.current.editor.defineTheme(MONACO_THEME_NAME, monacoTheme);
      monacoRef.current.editor.setTheme(MONACO_THEME_NAME);
    }
  }, [currentTheme]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;

    // Define and apply the theme
    if (currentTheme) {
      const monacoTheme = createMonacoTheme(currentTheme);
      monaco.editor.defineTheme(MONACO_THEME_NAME, monacoTheme);
      monaco.editor.setTheme(MONACO_THEME_NAME);
    }

    // Add save command
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave();
    });

    // Add close tab command
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => {
      if (activeTabId) {
        handleCloseTab(activeTabId);
      }
    });
  };

  const handleSave = async () => {
    if (!activeTab || !files.writeFile) return;

    setIsSaving(true);
    try {
      await files.writeFile(activeTab.filePath, activeTab.content);
      markSaved(activeTab.id);
      toast.success('File saved');
    } catch (error) {
      toast.error(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAll = async () => {
    if (!files.writeFile) return;

    const dirtyTabs = tabs.filter((t) => t.isDirty);
    if (dirtyTabs.length === 0) return;

    setIsSaving(true);
    let savedCount = 0;
    let errorCount = 0;

    for (const tab of dirtyTabs) {
      try {
        await files.writeFile(tab.filePath, tab.content);
        markSaved(tab.id);
        savedCount++;
      } catch {
        errorCount++;
      }
    }

    setIsSaving(false);

    if (errorCount > 0) {
      toast.error(`Saved ${savedCount} files, ${errorCount} failed`);
    } else {
      toast.success(`Saved ${savedCount} files`);
    }
  };

  const handleCloseTab = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (tab?.isDirty) {
      // For now, just close without confirmation
      // TODO: Add confirmation dialog
    }
    closeTab(tabId);
  };

  const handleContentChange = (value: string | undefined) => {
    if (activeTabId && value !== undefined) {
      updateContent(activeTabId, value);
    }
  };

  // Empty state
  if (tabs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-surface-mutedForeground">
        <RiFileEditLine className="size-12 opacity-50" />
        <div className="text-center">
          <p className="text-lg font-medium">No files open</p>
          <p className="text-sm opacity-75">
            Open a file from the Files tab to start editing
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center border-b border-interactive-border bg-surface-background">
        <ScrollArea className="flex-1">
          <div className="flex">
            {tabs.map((tab) => (
              <TabButton
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                onClick={() => setActiveTab(tab.id)}
                onClose={() => handleCloseTab(tab.id)}
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* Toolbar */}
        <div className="flex items-center gap-1 border-l border-interactive-border px-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={!activeTab?.isDirty || isSaving}
            title={`Save (${getModifierLabel()}+S)`}
          >
            {isSaving ? (
              <RiLoader4Line className="size-4 animate-spin" />
            ) : (
              <RiSaveLine className="size-4" />
            )}
          </Button>
          {hasUnsavedChanges() && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSaveAll}
              disabled={isSaving}
              title="Save All"
            >
              <RiSave2Line className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* File path breadcrumb */}
      {activeTab && (
        <div className="flex items-center gap-1 border-b border-interactive-border bg-surface-muted/30 px-3 py-1 text-xs text-surface-mutedForeground">
          <RiFolder3Line className="size-3" />
          <span className="truncate">{activeTab.filePath}</span>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        {activeTab && (
          <Editor
            key={activeTab.id}
            height="100%"
            language={getMonacoLanguage(activeTab.filePath)}
            value={activeTab.content}
            onChange={handleContentChange}
            onMount={handleEditorMount}
            theme={MONACO_THEME_NAME}
            options={{
              fontSize: 13,
              fontFamily: "'IBM Plex Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: 'off',
              lineNumbers: 'on',
              renderLineHighlight: 'line',
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              smoothScrolling: true,
              padding: { top: 8, bottom: 8 },
              folding: true,
              bracketPairColorization: { enabled: true },
              guides: {
                bracketPairs: true,
                indentation: true,
              },
            }}
            loading={
              <div className="flex h-full items-center justify-center">
                <RiLoader4Line className="size-8 animate-spin text-surface-mutedForeground" />
              </div>
            }
          />
        )}
      </div>
    </div>
  );
};

interface TabButtonProps {
  tab: EditorTab;
  isActive: boolean;
  onClick: () => void;
  onClose: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ tab, isActive, onClick, onClose }) => {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex items-center gap-1.5 border-r border-interactive-border px-3 py-1.5 text-sm transition-colors',
        isActive
          ? 'bg-surface-elevated text-surface-foreground'
          : 'text-surface-mutedForeground hover:bg-surface-muted/50 hover:text-surface-foreground'
      )}
    >
      <span className="max-w-[150px] truncate">{tab.fileName}</span>
      {tab.isDirty && (
        <span className="size-2 rounded-full bg-primary-base" title="Unsaved changes" />
      )}
      <button
        type="button"
        onClick={handleClose}
        className={cn(
          'ml-1 rounded p-0.5 opacity-0 transition-opacity hover:bg-surface-muted group-hover:opacity-100',
          isActive && 'opacity-100'
        )}
        title="Close"
      >
        <RiCloseLine className="size-3.5" />
      </button>
    </button>
  );
};
