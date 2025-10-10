import React from 'react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAgentsStore } from '@/stores/useAgentsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { Robot, CaretDown as ChevronDown } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';

interface AgentSelectorProps {
    agentName: string;
    onChange: (agentName: string) => void;
    className?: string;
}

export const AgentSelector: React.FC<AgentSelectorProps> = ({
    agentName,
    onChange,
    className
}) => {
    const { agents, loadAgents } = useAgentsStore();
    const isMobile = useUIStore(state => state.isMobile);
    const { isMobile: deviceIsMobile } = useDeviceInfo();
    const isActuallyMobile = isMobile || deviceIsMobile;

    // Mobile panel state
    const [isMobilePanelOpen, setIsMobilePanelOpen] = React.useState(false);

    // Load agents on mount
    React.useEffect(() => {
        loadAgents();
    }, [loadAgents]);

    const closeMobilePanel = () => setIsMobilePanelOpen(false);

    const handleAgentChange = (newAgentName: string) => {
        onChange(newAgentName);
    };

    // Mobile panel
    const renderMobileAgentPanel = () => {
        if (!isActuallyMobile) return null;

        return (
            <MobileOverlayPanel
                open={isMobilePanelOpen}
                onClose={closeMobilePanel}
                title="Select Agent"
            >
                <div className="space-y-1">
                    {agents.map((agent) => {
                        const isSelected = agent.name === agentName;

                        return (
                            <button
                                key={agent.name}
                                type="button"
                                className={cn(
                                    'flex w-full items-center justify-between rounded-md border border-border/40 bg-background/95 px-2 py-1.5 text-left',
                                    isSelected ? 'bg-primary/10 text-primary' : 'text-foreground'
                                )}
                                onClick={() => {
                                    handleAgentChange(agent.name);
                                    closeMobilePanel();
                                }}
                            >
                                <div className="flex flex-col">
                                    <span className="typography-meta font-medium">{agent.name}</span>
                                    {agent.description && (
                                        <span className="typography-micro text-muted-foreground">
                                            {agent.description}
                                        </span>
                                    )}
                                </div>
                                {isSelected && (
                                    <div className="h-2 w-2 rounded-full bg-primary" />
                                )}
                            </button>
                        );
                    })}

                    <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-md border border-border/40 bg-background/95 px-2 py-1.5 text-left"
                        onClick={() => {
                            handleAgentChange('');
                            closeMobilePanel();
                        }}
                    >
                        <span className="typography-meta text-muted-foreground">No agent (optional)</span>
                    </button>
                </div>
            </MobileOverlayPanel>
        );
    };

    return (
        <>
            {isActuallyMobile ? (
                <button
                    type="button"
                    onClick={() => setIsMobilePanelOpen(true)}
                    className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-md border border-border/40 bg-background/95 px-2 py-1.5 text-left',
                        className
                    )}
                >
                    <div className="flex items-center gap-2">
                        <Robot className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="typography-meta font-medium text-foreground">
                            {agentName || 'Select agent...'}
                        </span>
                    </div>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
            ) : (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <div className={cn(
                            'flex items-center gap-2 px-2 rounded-md bg-accent/20 border border-border/20 min-w-0 cursor-pointer hover:bg-accent/30 transition-colors h-8 w-fit max-w-[200px]',
                            className
                        )}>
                            <Robot className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                            <span className="typography-micro font-medium truncate">
                                {agentName || 'Not selected'}
                            </span>
                            <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="max-w-[300px]">
                        {agents.map((agent) => (
                            <DropdownMenuItem
                                key={agent.name}
                                className="typography-meta"
                                onSelect={() => handleAgentChange(agent.name)}
                            >
                                <span className="font-medium">{agent.name}</span>
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem
                            className="typography-meta"
                            onSelect={() => handleAgentChange('')}
                        >
                            <span className="text-muted-foreground">No agent (optional)</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
            {renderMobileAgentPanel()}
        </>
    );
};
