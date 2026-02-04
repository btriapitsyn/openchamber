import React from 'react';
import { OpenChamberVisualSettings } from './OpenChamberVisualSettings';
import { AboutSettings } from './AboutSettings';
import { SessionRetentionSettings } from './SessionRetentionSettings';
import { MemoryLimitsSettings } from './MemoryLimitsSettings';
import { DefaultsSettings } from './DefaultsSettings';
import { GitSettings } from './GitSettings';
import { WorktreeSectionContent } from './WorktreeSectionContent';
import { NotificationSettings } from './NotificationSettings';
import { GitHubSettings } from './GitHubSettings';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { useDeviceInfo } from '@/lib/device';
import { isVSCodeRuntime, isWebRuntime } from '@/lib/desktop';
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
                className="w-full"
            >
                <div className="openchamber-page-body mx-auto max-w-3xl space-y-3 p-3 sm:space-y-6 sm:p-6">
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
                </div>
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
            case 'git':
                return <GitSectionContent />;
            case 'github':
                return <GitHubSectionContent />;
            case 'notifications':
                return <NotificationSectionContent />;
            default:
                return null;
        }
    };

    return (
        <ScrollableOverlay
            keyboardAvoid
            outerClassName="h-full"
            className="w-full"
        >
            <div className="openchamber-page-body mx-auto max-w-3xl space-y-6 p-3 sm:p-6">
                {renderSectionContent()}
            </div>
        </ScrollableOverlay>
    );
};

// Visual section: Theme Mode, Font Size, Spacing, Corner Radius, Input Bar Offset (mobile)
const VisualSectionContent: React.FC = () => {
    return <OpenChamberVisualSettings visibleSettings={['theme', 'fontSize', 'terminalFontSize', 'spacing', 'cornerRadius', 'inputBarOffset', 'terminalQuickKeys']} />;
};

// Chat section: Default Tool Output, Diff layout, Show reasoning traces, Queue mode
const ChatSectionContent: React.FC = () => {
    return <OpenChamberVisualSettings visibleSettings={['toolOutput', 'diffLayout', 'dotfiles', 'reasoning', 'textJustificationActivity', 'queueMode']} />;
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

// GitHub section: Connect account for PR/issue workflows
const GitHubSectionContent: React.FC = () => {
    if (isVSCodeRuntime()) {
        return null;
    }
    return <GitHubSettings />;
};

// Notifications section: Native browser notifications
const NotificationSectionContent: React.FC = () => {
    return <NotificationSettings />;
};
