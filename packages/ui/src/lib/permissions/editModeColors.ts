import type { EditPermissionMode } from '@/stores/types/sessionTypes';

export interface EditModeColors {
    text: string;
    border?: string;
    background?: string;
    borderWidth?: number;
}

export const getEditModeColors = (mode?: EditPermissionMode | null): EditModeColors | null => {
    if (mode === 'full') {
        return {
            text: 'var(--status-info)',
            border: 'var(--status-info-border)',
            background: 'var(--status-info-background)',
            borderWidth: 1.5,
        };
    }

    if (mode === 'allow') {
        return {
            text: 'var(--status-success)',
            border: 'var(--status-success-border)',
            background: 'var(--status-success-background)',
            borderWidth: 1.5,
        };
    }

    return null;
};
