import React from 'react';
import { RiArrowDownSLine, RiArrowRightSLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import type { SessionNode } from './types';

type ActivityItem = {
  node: SessionNode;
  projectId: string | null;
  projectColor?: string | null;
  groupDirectory: string | null;
  secondaryMeta: {
    projectLabel?: string | null;
    branchLabel?: string | null;
  } | null;
};

type ActivitySection = {
  key: 'active-now';
  title: string;
  items: ActivityItem[];
};

type Props = {
  sections: ActivitySection[];
  renderSessionNode: (node: SessionNode, depth?: number, groupDirectory?: string | null, projectId?: string | null, archivedBucket?: boolean, secondaryMeta?: { projectLabel?: string | null; branchLabel?: string | null } | null, renderContext?: 'project' | 'recent', projectColor?: string | null) => React.ReactNode;
};

const DEFAULT_VISIBLE = 5;
const STEP = 5;

export function SidebarActivitySections({ sections, renderSessionNode }: Props): React.ReactNode {
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  // Map of section key → current visible limit
  const [visibleLimits, setVisibleLimits] = React.useState<Map<string, number>>(new Map());

  const toggleSection = React.useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const showMore = React.useCallback((key: string, total: number) => {
    setVisibleLimits((prev) => {
      const current = prev.get(key) ?? DEFAULT_VISIBLE;
      const next = new Map(prev);
      next.set(key, Math.min(current + STEP, total));
      return next;
    });
  }, []);

  const showFewer = React.useCallback((key: string) => {
    setVisibleLimits((prev) => {
      const next = new Map(prev);
      next.set(key, DEFAULT_VISIBLE);
      return next;
    });
  }, []);

  const visibleSections = sections.filter((section) => section.items.length > 0);
  if (visibleSections.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 pb-2 pt-1">
      {visibleSections.map((section) => {
        const isCollapsed = collapsed.has(section.key);
        const limit = visibleLimits.get(section.key) ?? DEFAULT_VISIBLE;
        const visibleItems = section.items.slice(0, limit);
        const remainingCount = section.items.length - visibleItems.length;
        const canShowFewer = limit > DEFAULT_VISIBLE;
        return (
          <div key={section.key} className="space-y-1">
            <button
              type="button"
              onClick={() => toggleSection(section.key)}
              className="group flex w-full items-center gap-1 rounded-md px-0.5 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              aria-expanded={!isCollapsed}
            >
              <span className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground">
                {isCollapsed ? <RiArrowRightSLine className="h-3.5 w-3.5" /> : <RiArrowDownSLine className="h-3.5 w-3.5" />}
              </span>
              <span className="text-[14px] font-normal text-foreground/95">{section.title}</span>
            </button>
            {!isCollapsed ? (
              <div className={cn('space-y-0.5 pl-7')}>
                {visibleItems.map((item) => renderSessionNode(item.node, 0, item.groupDirectory, item.projectId, false, item.secondaryMeta, 'recent', item.projectColor))}
                <div className="flex items-center gap-2 mt-0.5">
                  {remainingCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => showMore(section.key, section.items.length)}
                      className="flex items-center justify-start rounded-md px-1.5 py-0.5 text-left text-xs text-muted-foreground/70 leading-tight hover:text-foreground hover:underline"
                    >
                      +{Math.min(remainingCount, STEP)} more
                    </button>
                  ) : null}
                  {canShowFewer ? (
                    <button
                      type="button"
                      onClick={() => showFewer(section.key)}
                      className="flex items-center justify-start rounded-md px-1.5 py-0.5 text-left text-xs text-muted-foreground/70 leading-tight hover:text-foreground hover:underline"
                    >
                      Show fewer
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
