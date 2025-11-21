export const streamDebugEnabled = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem('openchamber_stream_debug') === '1';
    } catch {
        return false;
    }
};
