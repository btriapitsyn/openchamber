import React from 'react';
import { AppearanceSettings } from './AppearanceSettings';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';

export const SettingsPage: React.FC = () => {
    return (
        <ScrollableOverlay outerClassName="h-full" className="mx-auto max-w-3xl space-y-6 p-6">
            <AppearanceSettings />
        </ScrollableOverlay>
    );
};
