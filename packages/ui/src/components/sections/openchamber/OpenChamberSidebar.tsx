import React from 'react';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { useDeviceInfo } from '@/lib/device';
import { isVSCodeRuntime, isWebRuntime } from '@/lib/desktop';
import { AboutSettings } from './AboutSettings';
import { cn } from '@/lib/utils';

export type OpenChamberSection = 'visual' | 'chat' | 'sessions' | 'git' | 'github' | 'notifications';

interface OpenChamberSidebarProps {
  selectedSection: OpenChamberSection;
  onSelectSection: (section: OpenChamberSection) => void;
}

interface SectionGroup {
  id: OpenChamberSection;
  label: string;
  items: string[];
  webOnly?: boolean;
  hideInVSCode?: boolean;
}

const OPENCHAMBER_SECTION_GROUPS: SectionGroup[] = [
  {
    id: 'visual',
    label: 'Visual',
    items: ['Theme', 'Font', 'Spacing'],
  },
  {
    id: 'chat',
    label: 'Chat',
    items: ['Tools', 'Diff', 'Reasoning'],
  },
  {
    id: 'sessions',
    label: 'Sessions',
    items: ['Defaults', 'Retention'],
  },
  {
    id: 'git',
    label: 'Git',
    items: ['Commit Messages', 'Worktree'],
    hideInVSCode: true,
  },
  {
    id: 'github',
    label: 'GitHub',
    items: ['Connect', 'PRs', 'Issues'],
    hideInVSCode: true,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    items: ['Native'],
  },
];

export const OpenChamberSidebar: React.FC<OpenChamberSidebarProps> = ({
  selectedSection,
  onSelectSection,
}) => {
  const { isMobile } = useDeviceInfo();
  const showAbout = isMobile && isWebRuntime();

  const [isDesktopRuntime, setIsDesktopRuntime] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return typeof window.opencodeDesktop !== 'undefined';
  });

  const isVSCode = React.useMemo(() => isVSCodeRuntime(), []);
  const isWeb = React.useMemo(() => isWebRuntime(), []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsDesktopRuntime(typeof window.opencodeDesktop !== 'undefined');
  }, []);

  const visibleSections = React.useMemo(() => {
    return OPENCHAMBER_SECTION_GROUPS.filter((group) => {
      if (group.webOnly && !isWeb) return false;
      if (group.hideInVSCode && isVSCode) return false;
      return true;
    });
  }, [isWeb, isVSCode]);

  // Desktop app: transparent for blur effect
  // VS Code: bg-background (same as page content)
  // Web/mobile: bg-sidebar
  const bgClass = isDesktopRuntime
    ? 'bg-transparent'
    : isVSCode
      ? 'bg-background'
      : 'bg-sidebar';

  return (
    <div className={cn('flex h-full flex-col', bgClass)}>
      <ScrollableOverlay outerClassName="flex-1 min-h-0" className="space-y-1 px-3 py-2 overflow-x-hidden">
        {visibleSections.map((group) => {
          const isSelected = selectedSection === group.id;
          return (
            <div
              key={group.id}
              className={cn(
                'group relative rounded-md px-1.5 py-1 transition-all duration-200',
                isSelected ? 'dark:bg-accent/80 bg-primary/12' : 'hover:dark:bg-accent/40 hover:bg-primary/6'
              )}
            >
              <button
                onClick={() => onSelectSection(group.id)}
                className="w-full text-left flex flex-col gap-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <span className="typography-ui-label font-normal text-foreground">
                  {group.label}
                </span>
                <div className="typography-micro text-muted-foreground/60 leading-tight">
                  {group.items.join(' · ')}
                </div>
              </button>
            </div>
          );
        })}
      </ScrollableOverlay>

      {/* Mobile footer: About section */}
      {showAbout && (
        <div className="border-t px-3 py-4">
          <AboutSettings />
        </div>
      )}

    </div>
  );
};
