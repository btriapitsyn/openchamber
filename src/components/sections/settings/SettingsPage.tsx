import React from 'react';
import { OpenchamberSettings } from './OpenchamberSettings';

export const SettingsPage: React.FC = () => {
    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-6 p-6">
                <OpenchamberSettings />
            </div>
        </div>
    );
};
