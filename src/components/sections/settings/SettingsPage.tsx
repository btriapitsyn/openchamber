import React from 'react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { AppearanceSettings } from './AppearanceSettings';

export const SettingsPage: React.FC = () => {
    const activeSection = useSettingsStore((state) => state.activeSection);

    switch (activeSection) {
        case 'appearance':
            return (
                <div className="flex h-full flex-col gap-6 px-6 py-6">
                    <AppearanceSettings />
                </div>
            );
        default:
            return null;
    }
};
