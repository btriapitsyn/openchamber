import React from 'react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { AppearanceSettings } from './AppearanceSettings';

export const SettingsPage: React.FC = () => {
    const activeSection = useSettingsStore((state) => state.activeSection);

    switch (activeSection) {
        case 'appearance':
            return (
                <div className="h-full overflow-y-auto">
                    <div className="mx-auto max-w-3xl space-y-6 p-6">
                        <AppearanceSettings />
                    </div>
                </div>
            );
        default:
            return null;
    }
};
