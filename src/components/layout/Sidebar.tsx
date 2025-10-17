import React from 'react';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '../ui/ErrorBoundary';

export const SIDEBAR_CONTENT_WIDTH = 264;

interface SidebarProps {
    isOpen: boolean;
    isMobile: boolean;
    width?: number;
    children: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, isMobile, width = SIDEBAR_CONTENT_WIDTH, children }) => {
    if (isMobile) {
        // Mobile sidebar is handled in MainLayout as part of the overlay
        return null;
    }

    const appliedWidth = isOpen ? Math.max(0, width) : 0;

    return (
        <aside
            className={cn(
                'relative flex h-full border-r bg-sidebar transition-all duration-300 ease-in-out overflow-hidden',
                !isOpen && 'border-r-0'
            )}
            style={{
                width: `${appliedWidth}px`,
                minWidth: `${appliedWidth}px`,
                maxWidth: `${appliedWidth}px`,
            }}
            aria-hidden={!isOpen || appliedWidth === 0}
        >
            <div
                className={cn(
                    'h-full transition-opacity duration-200 ease-in-out',
                    !isOpen && 'pointer-events-none select-none opacity-0'
                )}
                style={{ width: `${Math.max(width, 0)}px` }}
                aria-hidden={!isOpen}
            >
                <ErrorBoundary>{children}</ErrorBoundary>
            </div>
        </aside>
    );
};
