import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { SIDEBAR_SECTIONS } from '@/constants/sidebar';
import type { SidebarSection } from '@/constants/sidebar';
import { RiArrowLeftSLine } from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { AgentsSidebar } from '@/components/sections/agents/AgentsSidebar';
import { AgentsPage } from '@/components/sections/agents/AgentsPage';
import { CommandsSidebar } from '@/components/sections/commands/CommandsSidebar';
import { CommandsPage } from '@/components/sections/commands/CommandsPage';
import { ProvidersSidebar } from '@/components/sections/providers/ProvidersSidebar';
import { ProvidersPage } from '@/components/sections/providers/ProvidersPage';
import { GitIdentitiesSidebar } from '@/components/sections/git-identities/GitIdentitiesSidebar';
import { GitIdentitiesPage } from '@/components/sections/git-identities/GitIdentitiesPage';
import { SettingsPage } from '@/components/sections/settings/SettingsPage';
import { useDeviceInfo } from '@/lib/device';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SIDEBAR_CONTENT_WIDTH } from '@/components/layout/Sidebar';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

// Filter out sessions from settings sections and reorder with settings first
const SETTINGS_SECTIONS = (() => {
  const filtered = SIDEBAR_SECTIONS.filter(section => section.id !== 'sessions');
  const settingsSection = filtered.find(s => s.id === 'settings');
  const otherSections = filtered.filter(s => s.id !== 'settings');
  return settingsSection ? [settingsSection, ...otherSections] : filtered;
})();

export const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = React.useState<SidebarSection>('settings');
  const [showPageContent, setShowPageContent] = React.useState(false);
  const { isMobile } = useDeviceInfo();

  // Reset to settings tab and sidebar view when dialog opens
  React.useEffect(() => {
    if (isOpen) {
      setActiveTab('settings');
      setShowPageContent(false);
    }
  }, [isOpen]);

  const handleTabChange = React.useCallback((tab: SidebarSection) => {
    setActiveTab(tab);
    if (isMobile) {
      setShowPageContent(false);
    }
  }, [isMobile]);

  const handleItemSelect = React.useCallback(() => {
    if (isMobile) {
      setShowPageContent(true);
    }
  }, [isMobile]);

  const renderSidebarContent = () => {
    // Settings tab doesn't have a sidebar
    if (activeTab === 'settings') {
      return null;
    }

    // Wrap sidebar content with click handler for mobile
    const content = (() => {
      switch (activeTab) {
        case 'agents':
          return <AgentsSidebar />;
        case 'commands':
      return <CommandsSidebar />;
    case 'providers':
      return <ProvidersSidebar />;
    case 'git-identities':
      return <GitIdentitiesSidebar />;
    default:
      return null;
  }
    })();

    // On mobile, intercept clicks to show page content
    if (isMobile) {
      return <div onClick={handleItemSelect}>{content}</div>;
    }

    return content;
  };

  const renderPageContent = () => {
    switch (activeTab) {
      case 'agents':
        return <AgentsPage />;
      case 'commands':
        return <CommandsPage />;
      case 'providers':
      return <ProvidersPage />;
    case 'git-identities':
      return <GitIdentitiesPage />;
    case 'settings':
      return <SettingsPage />;
      default:
        return null;
    }
  };

  const activeSection = SETTINGS_SECTIONS.find(s => s.id === activeTab);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          'flex flex-col gap-0 p-0',
          isMobile
            ? 'h-full w-full max-w-full rounded-none pwa-compact'
            : 'h-[88vh] w-[65vw] max-w-[900px]'
        )}
      >
        <DialogHeader
          className={cn(
            'border-b border-border/40 px-6 pb-4 pt-[calc(var(--oc-safe-area-top,0px)+0.5rem)]',
            isMobile && 'px-4 pb-3'
          )}
        >
          <div className="relative flex items-center justify-center">
            {/* Back button - only on mobile when page content is shown */}
            {isMobile && showPageContent && (
               <Button
                 variant="ghost"
                 size="icon"
                 onClick={() => setShowPageContent(false)}
                 className="absolute left-0 h-6 w-6 flex-shrink-0"
               >
                 <RiArrowLeftSLine className="h-5 w-5" />
                 <span className="sr-only">Back to sidebar</span>
               </Button>
            )}
            <DialogTitle className="typography-ui-header">Settings</DialogTitle>
          </div>
          {activeSection && (
            <DialogDescription className="typography-meta text-muted-foreground hidden sm:block">
              {activeSection.description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Tab Navigation */}
          <div className="flex flex-wrap items-center gap-1 border-b border-border/40 bg-background/95 px-3 py-1.5">
            {SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              const PhosphorIcon = Icon as React.ComponentType<{ className?: string; weight?: string }>;
              return (
                <button
                  key={id}
                  onClick={() => handleTabChange(id)}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-pressed={isActive}
                  aria-label={label}
                >
                  <PhosphorIcon className={cn('h-5 w-5 sm:h-4 sm:w-4')} weight="regular" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              );
            })}
          </div>

          {/* Main Content Area with Sidebar + Page */}
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar - hidden on mobile when page content is shown, and hidden for settings tab */}
            {activeTab !== 'settings' && (!isMobile || !showPageContent) && (
              <div
                className={cn(
                  'overflow-hidden border-r bg-sidebar',
                  isMobile && 'w-full border-r-0'
                )}
                style={
                  !isMobile
                    ? {
                        width: `${SIDEBAR_CONTENT_WIDTH}px`,
                        minWidth: `${SIDEBAR_CONTENT_WIDTH}px`,
                      }
                    : undefined
                }
              >
                <ErrorBoundary>{renderSidebarContent()}</ErrorBoundary>
              </div>
            )}

            {/* Page Content - hidden on mobile when sidebar is shown (except for settings tab which has no sidebar) */}
            {(activeTab === 'settings' || !isMobile || showPageContent) && (
              <div className={cn('flex-1 overflow-hidden bg-background', isMobile && 'w-full')}>
                <ErrorBoundary>{renderPageContent()}</ErrorBoundary>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
