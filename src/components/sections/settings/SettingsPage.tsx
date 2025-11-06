import React from 'react';
import { AppearanceSettings } from './AppearanceSettings';

export const SettingsPage: React.FC = () => {
    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-6 p-6">
                <AppearanceSettings />
            </div>
        </div>
    );
};
