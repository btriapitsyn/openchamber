import React from 'react';
import type { Part } from '@opencode-ai/sdk';

import AssistantTextPart from './parts/AssistantTextPart';
import UserTextPart from './parts/UserTextPart';
import ReasoningPart from './parts/ReasoningPart';
import ToolPart from './parts/ToolPart';
import { MessageFilesDisplay } from '../FileAttachment';
import type { ToolPart as ToolPartType } from '@/types/tool';
import type { StreamPhase, ToolPopupContent } from './types';

interface MessageBodyProps {
    messageId: string;
    parts: Part[];
    isUser: boolean;
    syntaxTheme: any;
    isMobile: boolean;
    copiedCode: string | null;
    onCopyCode: (code: string) => void;
    expandedTools: Set<string>;
    onToggleTool: (toolId: string) => void;
    onShowPopup: (content: ToolPopupContent) => void;
    streamPhase: StreamPhase;
    allowAnimation: boolean;
    onAssistantPhaseSettled: () => void;
}

const MessageBody: React.FC<MessageBodyProps> = ({
    messageId,
    parts,
    isUser,
    syntaxTheme,
    isMobile,
    copiedCode,
    onCopyCode,
    expandedTools,
    onToggleTool,
    onShowPopup,
    streamPhase,
    allowAnimation,
    onAssistantPhaseSettled,
}) => {
    const renderedParts = React.useMemo(() => {
        return parts.map((part, index) => {
            switch (part.type) {
                case 'text':
                    if (isUser) {
                        return <UserTextPart key={`user-text-${index}`} part={part} messageId={messageId} />;
                    }
                    return (
                        <AssistantTextPart
                            key={`assistant-text-${index}`}
                            part={part}
                            messageId={messageId}
                            syntaxTheme={syntaxTheme}
                            isMobile={isMobile}
                            copiedCode={copiedCode}
                            onCopyCode={onCopyCode}
                            onShowPopup={onShowPopup}
                            streamPhase={streamPhase}
                            allowAnimation={allowAnimation}
                            onPhaseSettled={onAssistantPhaseSettled}
                        />
                    );
                case 'reasoning':
                    return <ReasoningPart key={`reasoning-${index}`} part={part} index={index} />;
                case 'tool':
                    return (
                        <ToolPart
                            key={`tool-${(part as ToolPartType).id}`}
                            part={part as ToolPartType}
                            isExpanded={expandedTools.has((part as ToolPartType).id)}
                            onToggle={onToggleTool}
                            syntaxTheme={syntaxTheme}
                            isMobile={isMobile}
                            onShowPopup={onShowPopup}
                        />
                    );
                default:
                    return null;
            }
        });
    }, [
        parts,
        isUser,
        messageId,
        syntaxTheme,
        isMobile,
        copiedCode,
        onCopyCode,
        onShowPopup,
        streamPhase,
        allowAnimation,
        onAssistantPhaseSettled,
        expandedTools,
        onToggleTool,
    ]);

    return (
        <div
            className="w-full overflow-hidden pl-2"
            style={{
                minHeight: '2rem',
                contain: 'layout',
                transform: 'translateZ(0)',
            }}
        >
            <div className="leading-normal overflow-hidden text-foreground/90">
                {renderedParts}
                <MessageFilesDisplay files={parts} />
            </div>
        </div>
    );
};

export default React.memo(MessageBody);
