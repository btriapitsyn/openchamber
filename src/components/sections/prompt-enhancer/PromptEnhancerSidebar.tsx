import React from 'react';
import { toast } from 'sonner';
import { Plus, Trash } from '@phosphor-icons/react';
import { usePromptEnhancerConfig } from '@/stores/usePromptEnhancerConfig';
import { cn } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '@/stores/useUIStore';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CORE_PROMPT_ENHANCER_GROUP_IDS } from '@/types/promptEnhancer';

const CORE_GROUP_ID_SET = new Set<string>(Array.from(CORE_PROMPT_ENHANCER_GROUP_IDS));

export const PromptEnhancerSidebar: React.FC = () => {
  const { groups, groupOrder, activeGroupId, setActiveGroupId, addGroup, removeGroup } = usePromptEnhancerConfig(
    useShallow((state) => ({
      groups: state.config.groups,
      groupOrder: state.config.groupOrder,
      activeGroupId: state.activeGroupId,
      setActiveGroupId: state.setActiveGroupId,
      addGroup: state.addGroup,
      removeGroup: state.removeGroup,
    })),
  );
  const { isMobile, setSidebarOpen } = useUIStore(
    useShallow((state) => ({ isMobile: state.isMobile, setSidebarOpen: state.setSidebarOpen })),
  );

  const totalGroups = React.useMemo(
    () => groupOrder.filter((groupId) => Boolean(groups[groupId])).length,
    [groupOrder, groups],
  );

  const handleAddGroup = React.useCallback(
    (multiSelect: boolean) => {
      const createdId = addGroup({ multiSelect });
      if (createdId) {
        setActiveGroupId(createdId);
        toast.success(`Added ${multiSelect ? 'multi-select' : 'single-select'} group`);
        if (isMobile) {
          setSidebarOpen(false);
        }
      } else {
        toast.error('Unable to add group');
      }
    },
    [addGroup, isMobile, setActiveGroupId, setSidebarOpen],
  );

  const handleRemoveGroup = React.useCallback(
    (groupId: string) => {
      if (CORE_GROUP_ID_SET.has(groupId)) {
        toast.info('Core groups cannot be removed');
        return;
      }
      const groupLabel = groups[groupId]?.label ?? groupId;
      if (!window.confirm(`Remove group "${groupLabel}"? Options inside the group will be lost.`)) {
        return;
      }
      removeGroup(groupId);
      toast.success(`Removed group "${groupLabel}"`);
    },
    [groups, removeGroup],
  );

  const coreGroups = groupOrder.filter((groupId) => CORE_GROUP_ID_SET.has(groupId) && groups[groupId]);
  const customGroups = groupOrder.filter((groupId) => !CORE_GROUP_ID_SET.has(groupId) && Boolean(groups[groupId]));

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className={cn('border-b border-border/40 px-3', isMobile ? 'mt-2 py-3' : 'py-3')}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="typography-ui-label font-semibold text-foreground">Prompt enhancer</h2>
          <div className="flex items-center gap-1">
            <span className="typography-meta text-muted-foreground">{totalGroups}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7">
                  <Plus className="size-4" weight="regular" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => handleAddGroup(false)}>
                  Single-select group
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleAddGroup(true)}>
                  Multi-select group
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="space-y-1">
          {coreGroups.length > 0 && (
            <>
              <div className="typography-ui-label px-2 pt-1 pb-1.5 text-foreground font-medium">Default groups</div>
              {coreGroups.map((groupId) => {
                const group = groups[groupId]!;
                const optionCount = group.options.length;
                const isActive = groupId === activeGroupId;
                return (
                  <button
                    key={groupId}
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors',
                      'hover:bg-sidebar/35',
                      isActive ? 'bg-sidebar/45 text-primary' : 'text-foreground',
                    )}
                    onClick={() => {
                      setActiveGroupId(groupId);
                      if (isMobile) {
                        setSidebarOpen(false);
                      }
                    }}
                  >
                    <span className="typography-ui-label text-sm font-medium truncate">{group.label}</span>
                    <span className="typography-meta text-muted-foreground/80 text-xs">{optionCount}</span>
                  </button>
                );
              })}
            </>
          )}
          {customGroups.length > 0 && (
            <>
              <div className="typography-ui-label px-2 pt-3 pb-1.5 text-foreground font-medium">Custom groups</div>
              {customGroups.map((groupId) => {
                const group = groups[groupId]!;
                const optionCount = group.options.length;
                const isActive = groupId === activeGroupId;
                return (
                  <div key={groupId} className="flex items-center gap-1">
                    <button
                      type="button"
                      className={cn(
                        'flex w-full flex-1 items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors',
                        'hover:bg-sidebar/35',
                        isActive ? 'bg-sidebar/45 text-primary' : 'text-foreground',
                      )}
                      onClick={() => {
                        setActiveGroupId(groupId);
                        if (isMobile) {
                          setSidebarOpen(false);
                        }
                      }}
                    >
                      <span className="typography-ui-label text-sm font-medium truncate">{group.label}</span>
                      <span className="typography-meta text-muted-foreground/80 text-xs">{optionCount}</span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={() => handleRemoveGroup(groupId)}
                    >
                      <Trash className="size-4 text-status-error" weight="regular" />
                    </Button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
