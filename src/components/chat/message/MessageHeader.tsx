import React from 'react';
import { User, Bot, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAgentColor } from '@/lib/agentColors';

interface MessageHeaderProps {
    isUser: boolean;
    providerID: string | null;
    agentName: string | null;
    isDarkTheme: boolean;
}

const getProviderLogoUrl = (providerId: string) => `https://models.dev/logos/${providerId.toLowerCase()}.svg`;

const MessageHeader: React.FC<MessageHeaderProps> = ({ isUser, providerID, agentName, isDarkTheme }) => {
    return (
        <div className="flex items-center gap-3 mb-2 pl-2">
            <div className="flex-shrink-0">
                {isUser ? (
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <User className="h-4 w-4 text-primary" />
                    </div>
                ) : (
                    <div className="w-9 h-9 rounded-lg bg-secondary/50 flex items-center justify-center">
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
                        <Bot className={cn('h-4 w-4 text-muted-foreground', providerID && 'hidden')} />
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
                    {isUser ? 'You' : 'Assistant'}
                </h3>
                {!isUser && agentName && (
                    <div
                        className={cn(
                            'flex items-center gap-1 px-1.5 py-0 rounded',
                            'agent-badge typography-meta',
                            getAgentColor(agentName).class
                        )}
                    >
                        <Sparkles className="h-2.5 w-2.5" />
                        <span className="font-medium">{agentName}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default React.memo(MessageHeader);
