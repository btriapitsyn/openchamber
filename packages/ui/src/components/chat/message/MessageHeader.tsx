import React from 'react';
import { RiBrainAi3Line, RiUser3Line } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { getAgentColor } from '@/lib/agentColors';
import { FadeInOnReveal } from './FadeInOnReveal';
import { useProviderLogo } from '@/hooks/useProviderLogo';

interface MessageHeaderProps {
    isUser: boolean;
    providerID: string | null;
    agentName: string | undefined;
    modelName: string | undefined;
    isDarkTheme: boolean;
}

const MessageHeader: React.FC<MessageHeaderProps> = ({ isUser, providerID, agentName, modelName, isDarkTheme }) => {
    const { src: logoSrc, onError: handleLogoError, hasLogo } = useProviderLogo(providerID);

    return (
        <FadeInOnReveal>
            <div className={cn('pl-3', 'mb-2')}>
                <div className={cn('flex items-center justify-between gap-2')}>
                    <div className="flex items-center gap-2">
                        <div className="flex-shrink-0">
                            {isUser ? (
                                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <RiUser3Line className="h-4 w-4 text-primary" />
                                </div>
                            ) : (
                                <div className="flex items-center justify-center">
                                    {hasLogo && logoSrc ? (
                                        <img
                                            src={logoSrc}
                                            alt={`${providerID} logo`}
                                            className="h-4 w-4"
                                            style={{
                                                filter: isDarkTheme ? 'brightness(0.9) contrast(1.1) invert(1)' : 'brightness(0.9) contrast(1.1)',
                                            }}
                                            onError={handleLogoError}
                                        />
                                    ) : (
                                        <RiBrainAi3Line
                                            className="h-4 w-4"
                                            style={{ color: `var(${getAgentColor(agentName).var})` }}
                                        />
                                    )}
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
        </FadeInOnReveal>
    );
};

export default React.memo(MessageHeader);
