import React from 'react';
import { OpenChamberVisualSettings } from './OpenChamberVisualSettings';
import { AboutSettings } from './AboutSettings';
import { SessionRetentionSettings } from './SessionRetentionSettings';
import { DefaultsSettings } from './DefaultsSettings';
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
            default:
                return null;
        }
    };

    return (
        <ScrollableOverlay
            outerClassName="h-full"
            className="openchamber-page-body mx-auto max-w-3xl space-y-6 p-3 sm:p-6"
        >
            {renderSectionContent()}
        </ScrollableOverlay>
    );
};

// Visual section: Theme Mode, Font Size, Spacing, Input Bar Offset (mobile)
const VisualSectionContent: React.FC = () => {
    return <OpenChamberVisualSettings visibleSettings={['theme', 'fontSize', 'spacing', 'inputBarOffset']} />;
};

// Chat section: Default Tool Output, Diff layout, Show reasoning traces, Queue mode
const ChatSectionContent: React.FC = () => {
    return <OpenChamberVisualSettings visibleSettings={['toolOutput', 'diffLayout', 'reasoning', 'queueMode']} />;
};

// Sessions section: Default model & agent, Session retention
const SessionsSectionContent: React.FC = () => {
    return (
        <div className="space-y-6">
            <DefaultsSettings />
            <div className="border-t border-border/40 pt-6">
                <SessionRetentionSettings />
            </div>
        </div>
    );
};
