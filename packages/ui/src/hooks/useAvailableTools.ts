import React from 'react';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';

export const useAvailableTools = () => {
    const { tools: toolsAPI } = useRuntimeAPIs();
    const [tools, setTools] = React.useState<string[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let cancelled = false;

        const fetchTools = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const availableTools = await toolsAPI.getAvailableTools();

                if (cancelled) {
                    return;
                }

                setTools(availableTools);
            } catch (err) {
                if (cancelled) {
                    return;
                }

                const message = err instanceof Error ? err.message : 'Failed to fetch tools';
                console.error('Failed to fetch available tools:', message);
                setError(message);
                setTools([]);
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        fetchTools();

        return () => {
            cancelled = true;
        };
    }, [toolsAPI]);

    return { tools, isLoading, error };
};
