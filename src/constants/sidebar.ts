import { ChatCircleText, Brain, Command, Globe, PaintRoller, GitBranch, Sparkle } from '@phosphor-icons/react';
import type { SVGProps } from 'react';

export type SidebarSection = 'sessions' | 'agents' | 'commands' | 'providers' | 'git-identities' | 'prompt-enhancer' | 'settings';

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
        icon: ChatCircleText,
    },
    {
        id: 'agents',
        label: 'Agents',
        description: 'Configure OpenCode agents, prompts, and permissions.',
        icon: Brain,
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
        id: 'git-identities',
        label: 'Git Identities',
        description: 'Manage Git profiles with different credentials and SSH keys.',
        icon: GitBranch,
    },
    {
        id: 'prompt-enhancer',
        label: 'Prompt Enhancer',
        description: 'Tune refinement presets, instructions, and option bundles.',
        icon: Sparkle,
    },
    {
        id: 'settings',
        label: 'Appearance',
        description: 'Fine-tune themes, fonts, and typography across the interface.',
        icon: PaintRoller,
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
