import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { SIDEBAR_SECTIONS } from '@/constants/sidebar';
import type { SidebarSection } from '@/constants/sidebar';

export const NAV_BAR_WIDTH = 56;

interface NavigationBarProps {
    activeSection: SidebarSection;
    onSectionChange: (section: SidebarSection) => void;
    isMobile?: boolean;
    showCloseButton?: boolean;
    onClose?: () => void;
}

export const NavigationBar: React.FC<NavigationBarProps> = ({
    activeSection,
    onSectionChange,
    isMobile = false,
    showCloseButton = false,
    onClose,
}) => {
    return (
        <nav
            className={cn(
                'flex flex-col items-center gap-2 border-r border-border/40 bg-sidebar/80 backdrop-blur',
                isMobile ? 'w-14 py-6' : 'relative h-full py-4'
            )}
            style={!isMobile ? { width: `${NAV_BAR_WIDTH}px` } : undefined}
        >
            {/* Close button for mobile */}
            {showCloseButton && onClose && (
                <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            aria-label="Close sidebar"
                        >
                            <X className="h-4 w-4" weight="bold" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Close sidebar</TooltipContent>
                </Tooltip>
            )}

            {SIDEBAR_SECTIONS.map((section) => {
                const isActive = activeSection === section.id;

                return (
                    <Tooltip key={section.id} delayDuration={300}>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                onClick={() => onSectionChange(section.id)}
                                className={cn(
                                    'flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                                    isActive
                                        ? 'bg-primary/15 text-primary shadow-sm'
                                        : 'hover:bg-accent hover:text-foreground'
                                )}
                                aria-pressed={isActive}
                                aria-label={section.label}
                            >
                                <section.icon className="h-4 w-4" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="right">{section.label}</TooltipContent>
                    </Tooltip>
                );
            })}
        </nav>
    );
};
