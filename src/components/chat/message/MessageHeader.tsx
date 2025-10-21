import React from 'react';
import { User, Brain as Bot, MagicWand as Sparkles, Copy, Check } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { getAgentColor } from '@/lib/agentColors';
import { Button } from '@/components/ui/button';

interface MessageHeaderProps {
    isUser: boolean;
    providerID: string | null;
    agentName: string | undefined;
    modelName: string | undefined;
    isDarkTheme: boolean;
    hasTextContent?: boolean;
    onCopyMessage?: () => void;
    isCopied?: boolean;
    compactSpacing?: boolean;
}

const getProviderLogoUrl = (providerId: string) => `https://models.dev/logos/${providerId.toLowerCase()}.svg`;

const MessageHeader: React.FC<MessageHeaderProps> = ({ isUser, providerID, agentName, modelName, isDarkTheme, hasTextContent, onCopyMessage, isCopied, compactSpacing = false }) => {
    return (
        <div className={cn('flex items-center justify-between gap-3 pl-3', compactSpacing ? 'mb-1' : 'mb-2')}>
            <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                    {isUser ? (
                        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                            <User className="h-4 w-4 text-primary" />
                        </div>
                    ) : (
                        <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center"
                            style={{
                                backgroundColor: `rgb(from var(${getAgentColor(agentName).var}) r g b / 0.1)`
                            }}
                        >
                            {providerID ? (
                                <img
                                    src={getProviderLogoUrl(providerID)}
                                    alt={`${providerID} logo`}
                                    className="h-4 w-4"
                                    style={{
                                        filter: isDarkTheme ? 'brightness(0.9) contrast(1.1) invert(1)' : 'brightness(0.9) contrast(1.1)',
                                    }}
                                    onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        const fallback = target.nextElementSibling as HTMLElement;
                                        if (fallback) fallback.style.display = 'block';
                                    }}
                                />
                            ) : null}
                            <Bot
                                className={cn('h-4 w-4', providerID && 'hidden')}
                                style={{ color: `var(${getAgentColor(agentName).var})` }}
                            />
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <h3
                        className={cn(
                            'font-bold typography-ui-header tracking-tight leading-none',
                            isUser ? 'text-primary' : 'text-foreground'
                        )}
                    >
                        {isUser ? 'You' : (modelName || 'Assistant')}
                    </h3>
                    {!isUser && agentName && (
                        <div
                            className={cn(
                                'flex items-center gap-1 px-1.5 py-0 rounded',
                                'agent-badge typography-meta',
                                getAgentColor(agentName).class
                            )}
                        >
                            <span className="font-medium">{agentName}</span>
                        </div>
                    )}
                </div>
            </div>
            {hasTextContent && onCopyMessage && (
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={onCopyMessage}
                    title="Copy message text"
                >
                    {isCopied ? (
                        <Check className="h-3.5 w-3.5" style={{ color: 'var(--status-success)' }}  weight="bold" />
                    ) : (
                        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                </Button>
            )}
        </div>
    );
};

export default React.memo(MessageHeader);
