import React from 'react';
import { OpenChamberVisualSettings } from './OpenChamberVisualSettings';
import { AboutSettings } from './AboutSettings';
import { SessionRetentionSettings } from './SessionRetentionSettings';
import { MemoryLimitsSettings } from './MemoryLimitsSettings';
import { DefaultsSettings } from './DefaultsSettings';
import { GitSettings } from './GitSettings';
import { WorktreeSectionContent } from './WorktreeSectionContent';
import { NotificationSettings } from './NotificationSettings';
import { LayoutSettings } from './LayoutSettings';
import { AppRunnerSettings } from './AppRunnerSettings';
import { ServerManagementSettings } from './ServerManagementSettings';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { useDeviceInfo } from '@/lib/device';
import { isWebRuntime } from '@/lib/desktop';
import type { OpenChamberSection } from './OpenChamberSidebar';

interface OpenChamberPageProps {
    /** Which section to display. If undefined, shows all sections (mobile/legacy behavior) */
    section?: OpenChamberSection;
}

export const OpenChamberPage: React.FC<OpenChamberPageProps> = ({ section }) => {
    const { isMobile } = useDeviceInfo();
    const showAbout = isMobile && isWebRuntime();

    // If no section specified, show all (mobile/legacy behavior)
    if (!section) {
        return (
            <ScrollableOverlay
                keyboardAvoid
                outerClassName="h-full"
                className="openchamber-page-body mx-auto max-w-3xl space-y-3 p-3 sm:space-y-6 sm:p-6"
            >
                <OpenChamberVisualSettings />
                <div className="border-t border-border/40 pt-6">
                    <DefaultsSettings />
                </div>
                <div className="border-t border-border/40 pt-6">
                    <SessionRetentionSettings />
                </div>
                {showAbout && (
                    <div className="border-t border-border/40 pt-6">
                        <AboutSettings />
                    </div>
                )}
            </ScrollableOverlay>
        );
    }

    // Show specific section content
    const renderSectionContent = () => {
        switch (section) {
            case 'visual':
                return <VisualSectionContent />;
            case 'chat':
                return <ChatSectionContent />;
            case 'sessions':
                return <SessionsSectionContent />;
            case 'layout':
                return <LayoutSectionContent />;
            case 'git':
                return <GitSectionContent />;
            case 'notifications':
                return <NotificationSectionContent />;
            case 'appRunner':
                return <AppRunnerSectionContent />;
            case 'servers':
                return <ServersSectionContent />;
            default:
                return null;
        }
    };

    return (
        <ScrollableOverlay
            keyboardAvoid
            outerClassName="h-full"
            className="openchamber-page-body mx-auto max-w-3xl space-y-6 p-3 sm:p-6"
        >
            {renderSectionContent()}
        </ScrollableOverlay>
    );
};

// Visual section: Theme Mode, Font Size, Spacing, Corner Radius, Input Bar Offset (mobile)
const VisualSectionContent: React.FC = () => {
    return <OpenChamberVisualSettings visibleSettings={['theme', 'fontSize', 'spacing', 'cornerRadius', 'inputBarOffset']} />;
};

// Chat section: Default Tool Output, Diff layout, Show reasoning traces, Queue mode
const ChatSectionContent: React.FC = () => {
    return <OpenChamberVisualSettings visibleSettings={['toolOutput', 'diffLayout', 'dotfiles', 'reasoning', 'queueMode']} />;
};

// Sessions section: Default model & agent, Session retention, Memory limits
const SessionsSectionContent: React.FC = () => {
    return (
        <div className="space-y-6">
            <DefaultsSettings />
            <div className="border-t border-border/40 pt-6">
                <SessionRetentionSettings />
            </div>
            <div className="border-t border-border/40 pt-6">
                <MemoryLimitsSettings />
            </div>
        </div>
    );
};

// Layout section: Default pane tabs
const LayoutSectionContent: React.FC = () => {
    return <LayoutSettings />;
};

// Git section: Commit message model, Worktree settings
const GitSectionContent: React.FC = () => {
    return (
        <div className="space-y-6">
            <GitSettings />
            <div className="border-t border-border/40 pt-6">
                <div className="space-y-1 mb-4">
                    <h3 className="typography-ui-header font-semibold text-foreground">Worktree</h3>
                    <p className="typography-meta text-muted-foreground">
                        Configure worktree branch defaults and manage existing worktrees.
                    </p>
                </div>
                <WorktreeSectionContent />
            </div>
        </div>
    );
};

// Notifications section: Native browser notifications
const NotificationSectionContent: React.FC = () => {
    return <NotificationSettings />;
};

// App Runner section: Dev server with start/stop controls
const AppRunnerSectionContent: React.FC = () => {
    return <AppRunnerSettings />;
};

// Servers section: Process management and cleanup
const ServersSectionContent: React.FC = () => {
    return <ServerManagementSettings />;
};
