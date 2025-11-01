import React from 'react';
import { User, Brain as Bot } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { getAgentColor } from '@/lib/agentColors';

interface MessageHeaderProps {
    isUser: boolean;
    providerID: string | null;
    agentName: string | undefined;
    modelName: string | undefined;
    isDarkTheme: boolean;
    compactSpacing?: boolean;
}

const getProviderLogoUrl = (providerId: string) => `https://models.dev/logos/${providerId.toLowerCase()}.svg`;

const MessageHeader: React.FC<MessageHeaderProps> = ({ isUser, providerID, agentName, modelName, isDarkTheme, compactSpacing = false }) => {
    return (
        <div className={cn('pl-3', compactSpacing ? 'mb-1' : 'mb-2')}>
            <div className={cn('flex items-center justify-between gap-2')}>
                <div className="flex items-center gap-2">
                    <div className="flex-shrink-0">
                        {isUser ? (
                            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                                <User className="h-4 w-4 text-primary" />
                            </div>
                        ) : (
                            <div className="flex items-center justify-center">
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
            </div>
        </div>
    );
};

export default React.memo(MessageHeader);
