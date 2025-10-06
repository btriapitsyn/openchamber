import { ChatLines as MessagesSquare, BrainElectricity as Bot, SlashSquare as Command, Globe, Settings as SlidersHorizontal } from 'iconoir-react';
import type { SVGProps } from 'react';

export type SidebarSection = 'sessions' | 'agents' | 'commands' | 'providers' | 'settings';

export type IconComponent = React.ComponentType<SVGProps<SVGSVGElement>>;

export interface SidebarSectionConfig {
    id: SidebarSection;
    label: string;
    description: string;
    icon: IconComponent;
}

export const SIDEBAR_SECTIONS: SidebarSectionConfig[] = [
    {
        id: 'sessions',
        label: 'Sessions',
        description: 'Browse and manage chat sessions scoped to the current directory.',
        icon: MessagesSquare,
    },
    {
        id: 'agents',
        label: 'Agents',
        description: 'Configure OpenCode agents, prompts, and permissions.',
        icon: Bot,
    },
    {
        id: 'commands',
        label: 'Commands',
        description: 'Create and maintain custom slash commands for OpenCode.',
        icon: Command,
    },
    {
        id: 'providers',
        label: 'Providers',
        description: 'Manage providers, models, and credentials available to the UI.',
        icon: Globe,
    },
    {
        id: 'settings',
        label: 'Settings',
        description: 'Adjust OpenCode WebUI preferences like themes and typography.',
        icon: SlidersHorizontal,
    },
];

const sidebarSectionLabels = {} as Record<SidebarSection, string>;
const sidebarSectionDescriptions = {} as Record<SidebarSection, string>;
const sidebarSectionConfigMap = {} as Record<SidebarSection, SidebarSectionConfig>;

SIDEBAR_SECTIONS.forEach((section) => {
    sidebarSectionLabels[section.id] = section.label;
    sidebarSectionDescriptions[section.id] = section.description;
    sidebarSectionConfigMap[section.id] = section;
});

export const SIDEBAR_SECTION_LABELS = sidebarSectionLabels;
export const SIDEBAR_SECTION_DESCRIPTIONS = sidebarSectionDescriptions;
export const SIDEBAR_SECTION_CONFIG_MAP = sidebarSectionConfigMap;
