import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { SIDEBAR_SECTIONS } from '@/constants/sidebar';
import type { SidebarSection } from '@/constants/sidebar';

export const NAV_BAR_WIDTH = 48;
const DESKTOP_HEADER_HEIGHT = 48;

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
    const navStyle = React.useMemo<React.CSSProperties>(() => {
        const base: React.CSSProperties = { borderColor: 'var(--interactive-border)' };
        if (!isMobile) {
            base.width = `${NAV_BAR_WIDTH}px`;
            base.minWidth = `${NAV_BAR_WIDTH}px`;
        }
        return base;
    }, [isMobile]);

    return (
        <nav
            className={cn(
                'flex flex-col items-center gap-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
                isMobile ? 'w-14 border-r border-border/40 py-6' : 'relative h-full pt-12 pb-4'
            )}
            style={navStyle}
        >
            {!isMobile && (
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute right-0 w-px"
                    style={{
                        top: DESKTOP_HEADER_HEIGHT,
                        bottom: 0,
                        backgroundColor: 'var(--interactive-border)',
                    }}
                />
            )}
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
                                        ? 'text-primary shadow-sm'
                                        : 'hover:text-foreground'
                                )}
                                aria-pressed={isActive}
                                aria-label={section.label}
                            >
                                <section.icon className="h-4 w-4 transition-colors" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="right">{section.label}</TooltipContent>
                    </Tooltip>
                );
            })}
        </nav>
    );
};
