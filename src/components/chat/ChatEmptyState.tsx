import React from 'react';

import { OpenChamberGlyph } from '@/components/ui/OpenChamberGlyph';

const ChatEmptyState: React.FC = () => {
    return (
        <div className="flex items-center justify-center h-full min-h-[400px]">
            <div className="text-center space-y-6 px-4 w-full">
                <div className="flex justify-center">
                    <OpenChamberGlyph width={120} height={120} className="opacity-80" />
                </div>
                <h3 className="typography-ui-header font-semibold text-muted-foreground/60">
                    Start a New Session
                </h3>
            </div>
        </div>
    );
};

export default React.memo(ChatEmptyState);
