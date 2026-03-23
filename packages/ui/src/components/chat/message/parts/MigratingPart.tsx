import React from 'react';
import { cn } from '@/lib/utils';

interface MigratingPartProps {

    isMigrating: boolean;
    children: React.ReactNode;
    className?: string;
}

const MigratingPart: React.FC<MigratingPartProps> = ({
    isMigrating,
    children,
    className,
}) => {
    return (
        <div
            className={cn(

                'w-full overflow-hidden',
                isMigrating && 'pointer-events-none',
                className
            )}
            style={isMigrating ? { animation: 'oc-migrate-up 220ms ease-out forwards' } : undefined}
        >
            {children}
        </div>
    );
};

export default React.memo(MigratingPart);
