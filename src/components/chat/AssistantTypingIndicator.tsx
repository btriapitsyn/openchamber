import React from 'react';

import { TypingIndicator } from './message/StreamingPlaceholder';

export const AssistantTypingIndicator: React.FC = () => {
    return (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-border bg-background/95 text-muted-foreground">
            <TypingIndicator />
            <span className="typography-meta">Typing...</span>
        </div>
    );
};
