import React from 'react';
import { Columns2, AlignJustify } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type DiffViewMode = 'side-by-side' | 'unified';

interface DiffViewToggleProps {
    mode: DiffViewMode;
    onModeChange: (mode: DiffViewMode) => void;
    className?: string;
}

export const DiffViewToggle: React.FC<DiffViewToggleProps> = ({ mode, onModeChange, className }) => {
    const toggleMode = (e: React.MouseEvent) => {
        e.stopPropagation();
        onModeChange(mode === 'side-by-side' ? 'unified' : 'side-by-side');
    };

    return (
        <Button
            size="sm"
            variant="ghost"
            className={cn('h-5 w-5 p-0 opacity-60 hover:opacity-100', className)}
            onClick={toggleMode}
            title={mode === 'side-by-side' ? 'Switch to unified view' : 'Switch to side-by-side view'}
        >
            {mode === 'side-by-side' ? (
                <AlignJustify className="h-3 w-3" />
            ) : (
                <Columns2 className="h-3 w-3" />
            )}
        </Button>
    );
};
