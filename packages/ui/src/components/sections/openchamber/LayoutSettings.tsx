import React, { useCallback } from 'react';
import {
  RiCloseLine,
  RiAddLine,
  RiLayoutLeftLine,
  RiLayoutRightLine,
} from '@remixicon/react';
import { useUIStore } from '@/stores/useUIStore';
import { cn } from '@/lib/utils';
import { ButtonSmall } from '@/components/ui/button-small';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DEFAULT_TAB_TYPES, TAB_CONFIGS, type DefaultTabType } from '@/constants/tabs';

interface PanePreviewProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tabs: DefaultTabType[];
  onRemoveTab: (tab: DefaultTabType) => void;
  onAddTab: (tab: DefaultTabType) => void;
  availableTabs: DefaultTabType[];
  isRight?: boolean;
  isVisible?: boolean;
  onToggleVisibility?: () => void;
}

const PanePreview: React.FC<PanePreviewProps> = ({
  title,
  icon: Icon,
  tabs,
  onRemoveTab,
  onAddTab,
  availableTabs,
  isRight,
  isVisible = true,
  onToggleVisibility,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border border-border/60 bg-background/50 overflow-hidden transition-opacity',
        !isVisible && 'opacity-50'
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/30 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="typography-ui-label font-medium text-foreground">{title}</span>
        </div>
        {isRight && onToggleVisibility && (
          <ButtonSmall
            variant={isVisible ? 'outline' : 'ghost'}
            size="sm"
            onClick={onToggleVisibility}
            className="h-6 px-2 text-xs"
          >
            {isVisible ? 'Visible' : 'Hidden'}
          </ButtonSmall>
        )}
      </div>

      <div className="flex-1 p-2 min-h-[80px]">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((tabType) => {
            const config = TAB_CONFIGS[tabType];
            if (!config) return null;
            const TabIcon = config.icon;

            return (
              <div
                key={tabType}
                className="group flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border/40 text-sm"
              >
                <TabIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-foreground">{config.label}</span>
                <button
                  type="button"
                  onClick={() => onRemoveTab(tabType)}
                  className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <RiCloseLine className="h-3 w-3" />
                </button>
              </div>
            );
          })}

          {availableTabs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/30 transition-colors text-sm"
                >
                  <RiAddLine className="h-3.5 w-3.5" />
                  <span>Add</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[140px]">
                {availableTabs.map((tabType) => {
                  const config = TAB_CONFIGS[tabType];
                  if (!config) return null;
                  const TabIcon = config.icon;

                  return (
                    <DropdownMenuItem key={tabType} onClick={() => onAddTab(tabType)}>
                      <TabIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                      {config.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {tabs.length === 0 && availableTabs.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground/60 text-sm">
            No tabs available
          </div>
        )}
      </div>
    </div>
  );
};

export const LayoutSettings: React.FC = () => {
  const defaultLeftPaneTabs = useUIStore((s) => s.defaultLeftPaneTabs);
  const defaultRightPaneTabs = useUIStore((s) => s.defaultRightPaneTabs);
  const defaultRightPaneVisible = useUIStore((s) => s.defaultRightPaneVisible);
  const setDefaultLeftPaneTabs = useUIStore((s) => s.setDefaultLeftPaneTabs);
  const setDefaultRightPaneTabs = useUIStore((s) => s.setDefaultRightPaneTabs);
  const setDefaultRightPaneVisible = useUIStore((s) => s.setDefaultRightPaneVisible);

  const usedTabs = [...defaultLeftPaneTabs, ...defaultRightPaneTabs];
  const availableForLeft = DEFAULT_TAB_TYPES.filter((t) => !usedTabs.includes(t));
  const availableForRight = DEFAULT_TAB_TYPES.filter((t) => !usedTabs.includes(t));

  const handleRemoveFromLeft = useCallback(
    (tab: DefaultTabType) => {
      setDefaultLeftPaneTabs(defaultLeftPaneTabs.filter((t) => t !== tab));
    },
    [defaultLeftPaneTabs, setDefaultLeftPaneTabs]
  );

  const handleRemoveFromRight = useCallback(
    (tab: DefaultTabType) => {
      setDefaultRightPaneTabs(defaultRightPaneTabs.filter((t) => t !== tab));
    },
    [defaultRightPaneTabs, setDefaultRightPaneTabs]
  );

  const handleAddToLeft = useCallback(
    (tab: DefaultTabType) => {
      setDefaultLeftPaneTabs([...defaultLeftPaneTabs, tab]);
    },
    [defaultLeftPaneTabs, setDefaultLeftPaneTabs]
  );

  const handleAddToRight = useCallback(
    (tab: DefaultTabType) => {
      setDefaultRightPaneTabs([...defaultRightPaneTabs, tab]);
    },
    [defaultRightPaneTabs, setDefaultRightPaneTabs]
  );

  const handleToggleRightPane = useCallback(() => {
    setDefaultRightPaneVisible(!defaultRightPaneVisible);
  }, [defaultRightPaneVisible, setDefaultRightPaneVisible]);

  const handleResetToDefaults = useCallback(() => {
    setDefaultLeftPaneTabs(['files', 'diff', 'terminal', 'git']);
    setDefaultRightPaneTabs([]);
    setDefaultRightPaneVisible(true);
  }, [setDefaultLeftPaneTabs, setDefaultRightPaneTabs, setDefaultRightPaneVisible]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="typography-ui-header font-semibold text-foreground">Default Layout</h3>
        <p className="typography-meta text-muted-foreground">
          Configure which tabs appear in each pane when opening a new project. Chat tabs are always
          created dynamically per session.
        </p>
      </div>

      <div className="space-y-4">
        <div className="relative rounded-xl border border-border/40 bg-muted/20 p-4">
          <div className="absolute top-2 right-2">
            <ButtonSmall variant="ghost" size="sm" onClick={handleResetToDefaults} className="text-xs">
              Reset to defaults
            </ButtonSmall>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <div className="h-3 w-3 rounded-full bg-destructive/80" />
            <div className="h-3 w-3 rounded-full bg-warning/80" />
            <div className="h-3 w-3 rounded-full bg-[color:var(--status-success)]/80" />
            <span className="ml-2 text-xs text-muted-foreground">New Project Window</span>
          </div>

          <div className="flex gap-3">
            <div className="w-12 shrink-0 rounded-lg border border-border/40 bg-muted/30 flex items-center justify-center">
              <span className="text-[10px] text-muted-foreground/60 [writing-mode:vertical-lr] rotate-180">
                Sidebar
              </span>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-3">
              <PanePreview
                title="Left Pane"
                icon={RiLayoutLeftLine}
                tabs={defaultLeftPaneTabs}
                onRemoveTab={handleRemoveFromLeft}
                onAddTab={handleAddToLeft}
                availableTabs={availableForLeft}
              />

              <PanePreview
                title="Right Pane"
                icon={RiLayoutRightLine}
                tabs={defaultRightPaneTabs}
                onRemoveTab={handleRemoveFromRight}
                onAddTab={handleAddToRight}
                availableTabs={availableForRight}
                isRight
                isVisible={defaultRightPaneVisible}
                onToggleVisibility={handleToggleRightPane}
              />
            </div>
          </div>
        </div>

        <p className="typography-micro text-muted-foreground/70">
          Changes apply to newly opened projects. Existing project layouts are preserved.
        </p>
      </div>
    </div>
  );
};
