import React from 'react';
import type { Part } from '@opencode-ai/sdk';

type ReasoningPartProps = {
    part: Part;
    index: number;
};

const ReasoningPart: React.FC<ReasoningPartProps> = ({ part, index }) => {
    const text = (part as any).text || (part as any).content || '';
    if (!text) {
        return null;
    }

    return (
        <div key={`reasoning-${index}`} className="typography-meta text-muted-foreground/50 italic border-l-2 border-muted/30 pl-3 my-1 font-light">
            {text}
        </div>
    );
};

export default ReasoningPart;
