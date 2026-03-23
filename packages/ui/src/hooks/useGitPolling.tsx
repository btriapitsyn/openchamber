import React from 'react';
import { useGitPolling } from '@/hooks/useGitPollingHook';

/**
 * Component wrapper for useGitPolling - use this inside RuntimeAPIProvider
 */
export function GitPollingProvider({ children }: { children: React.ReactNode }) {
    useGitPolling();
    return <>{children}</>;
}
