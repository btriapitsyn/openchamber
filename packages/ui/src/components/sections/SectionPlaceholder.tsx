import React from 'react';
import { getSidebarSectionConfigMap, getSidebarSectionDescriptions } from '@/constants/sidebar';
import type { SidebarSection } from '@/constants/sidebar';
import { useI18n } from '@/contexts/useI18n';

interface SectionPlaceholderProps {
    sectionId: SidebarSection;
    variant: 'sidebar' | 'page';
}

export const SectionPlaceholder: React.FC<SectionPlaceholderProps> = ({ sectionId, variant }) => {
    const { messages } = useI18n();
    const config = getSidebarSectionConfigMap(messages)[sectionId];
    const descriptions = getSidebarSectionDescriptions(messages);
    const Icon = config.icon;

    if (variant === 'sidebar') {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="rounded-full bg-accent/40 p-3 text-muted-foreground">
                    <Icon className="h-5 w-5" />
                </div>
                <h3 className="typography-ui-label font-semibold text-foreground">{config.label}</h3>
                <p className="typography-meta max-w-xs text-muted-foreground">
                    {descriptions[sectionId]}
                </p>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="rounded-full bg-accent/40 p-4 text-muted-foreground">
                <Icon className="h-8 w-8" />
            </div>
            <div className="flex flex-col gap-2">
                <h2 className="typography-h2 font-semibold text-foreground">{config.label}</h2>
                <p className="typography-body max-w-md text-muted-foreground">
                    {descriptions[sectionId]}
                </p>
            </div>
            <p className="typography-meta text-muted-foreground/60">{messages.common.comingSoon}</p>
        </div>
    );
};
