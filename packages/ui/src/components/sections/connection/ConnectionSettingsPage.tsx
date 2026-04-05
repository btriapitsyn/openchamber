import React from 'react';
import { DesktopHostSwitcherDialog } from '@/components/desktop/DesktopHostSwitcher';

/**
 * Settings page for managing local/remote OpenChamber server connections.
 * Wraps the existing DesktopHostSwitcherDialog in embedded mode,
 * which provides add/remove/edit hosts, set default, and probe functionality.
 */
export function ConnectionSettingsPage() {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl px-6 py-6 space-y-6">
        <div className="space-y-1">
          <h1 className="typography-ui-header font-semibold text-foreground">Connection</h1>
          <p className="typography-ui text-muted-foreground">
            Manage local and remote OpenChamber server connections.
          </p>
        </div>
        <DesktopHostSwitcherDialog
          open={true}
          onOpenChange={() => {}}
          embedded={true}
        />
      </div>
    </div>
  );
}
