import React from 'react';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '../ui/ErrorBoundary';

export const SIDEBAR_CONTENT_WIDTH = 264;

interface SidebarProps {
    isOpen: boolean;
    isMobile: boolean;
    children: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, isMobile, children }) => {
    if (isMobile) {
        // Mobile sidebar is handled in MainLayout as part of the overlay
        return null;
    }

    return (
        <aside
            className={cn(
                'relative flex h-full border-r bg-sidebar transition-all duration-300 ease-in-out overflow-hidden',
                !isOpen && 'border-r-0'
            )}
            style={{
                width: isOpen ? `${SIDEBAR_CONTENT_WIDTH}px` : '0px',
                minWidth: isOpen ? `${SIDEBAR_CONTENT_WIDTH}px` : '0px',
                maxWidth: isOpen ? `${SIDEBAR_CONTENT_WIDTH}px` : '0px',
            }}
            aria-hidden={!isOpen}
        >
            <div className="h-full" style={{ width: `${SIDEBAR_CONTENT_WIDTH}px` }}>
                <ErrorBoundary>{children}</ErrorBoundary>
            </div>
        </aside>
    );
};
