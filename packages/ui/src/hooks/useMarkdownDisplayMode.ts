import { useUIStore } from '@/stores/useUIStore';
import type { MarkdownDisplayMode } from '@/lib/markdownDisplayModes';

export const useMarkdownDisplayMode = (): [
    MarkdownDisplayMode,
    (mode: MarkdownDisplayMode) => void
] => {
    const mode = useUIStore((state) => state.markdownDisplayMode);
    const setMode = useUIStore((state) => state.setMarkdownDisplayMode);

    return [mode, setMode];
};
