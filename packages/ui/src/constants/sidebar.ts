import { RiBrainAi3Line, RiChatAi3Line, RiCommandLine, RiGitBranchLine, RiGlobalLine, RiPaintBrushLine } from '@remixicon/react';
import type { ComponentType } from 'react';

export type SidebarSection = 'sessions' | 'agents' | 'commands' | 'providers' | 'git-identities' | 'settings';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IconComponent = ComponentType<any>;

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
        icon: RiChatAi3Line,
    },
    {
        id: 'agents',
        label: 'Agents',
        description: 'Configure OpenCode agents, prompts, and permissions.',
        icon: RiBrainAi3Line,
    },
    {
        id: 'commands',
        label: 'Commands',
        description: 'Create and maintain custom slash commands for OpenCode.',
        icon: RiCommandLine,
    },
    // Providers tab intentionally hidden until implementation is ready; keep config for future use
    {
        id: 'git-identities',
        label: 'Git Identities',
        description: 'Manage Git profiles with different credentials and SSH keys.',
        icon: RiGitBranchLine,
    },
    {
        id: 'settings',
        label: 'Appearance',
        description: 'Fine-tune themes, fonts, and typography across the interface.',
        icon: RiPaintBrushLine,
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
