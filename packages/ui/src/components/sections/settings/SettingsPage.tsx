import React from 'react';
import { AppearanceSettings } from './AppearanceSettings';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';

export const SettingsPage: React.FC = () => {
    return (
        <ScrollableOverlay
            outerClassName="h-full"
            className="settings-page-body mx-auto max-w-3xl space-y-3 p-3 sm:space-y-6 sm:p-6"
        >
            <AppearanceSettings />
        </ScrollableOverlay>
    );
};
