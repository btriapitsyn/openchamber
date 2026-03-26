import { RiBrainAi3Line, RiChatAi3Line, RiCommandLine, RiGitBranchLine, RiSettings3Line, RiStackLine, RiBookLine, RiBarChart2Line, RiPlugLine } from '@remixicon/react';
import type { ComponentType } from 'react';
import type { MessageDictionary } from '@/lib/i18n/messages';

export type SidebarSection = 'sessions' | 'agents' | 'commands' | 'skills' | 'mcp' | 'providers' | 'usage' | 'git-identities' | 'settings';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IconComponent = ComponentType<any>;

export interface SidebarSectionConfig {
    id: SidebarSection;
    label: string;
    description: string;
    icon: IconComponent;
}

const SIDEBAR_SECTION_ICONS: Record<SidebarSection, IconComponent> = {
    sessions: RiChatAi3Line,
    agents: RiBrainAi3Line,
    commands: RiCommandLine,
    skills: RiBookLine,
    mcp: RiPlugLine,
    providers: RiStackLine,
    usage: RiBarChart2Line,
    'git-identities': RiGitBranchLine,
    settings: RiSettings3Line,
};

export function getSidebarSections(messages: MessageDictionary): SidebarSectionConfig[] {
    return [
        {
            id: 'sessions',
            label: messages.sidebar.sessions.label,
            description: messages.sidebar.sessions.description,
            icon: SIDEBAR_SECTION_ICONS.sessions,
        },
        {
            id: 'agents',
            label: messages.sidebar.agents.label,
            description: messages.sidebar.agents.description,
            icon: SIDEBAR_SECTION_ICONS.agents,
        },
        {
            id: 'commands',
            label: messages.sidebar.commands.label,
            description: messages.sidebar.commands.description,
            icon: SIDEBAR_SECTION_ICONS.commands,
        },
        {
            id: 'skills',
            label: messages.sidebar.skills.label,
            description: messages.sidebar.skills.description,
            icon: SIDEBAR_SECTION_ICONS.skills,
        },
        {
            id: 'mcp',
            label: messages.sidebar.mcp.label,
            description: messages.sidebar.mcp.description,
            icon: SIDEBAR_SECTION_ICONS.mcp,
        },
        {
            id: 'providers',
            label: messages.sidebar.providers.label,
            description: messages.sidebar.providers.description,
            icon: SIDEBAR_SECTION_ICONS.providers,
        },
        {
            id: 'usage',
            label: messages.sidebar.usage.label,
            description: messages.sidebar.usage.description,
            icon: SIDEBAR_SECTION_ICONS.usage,
        },
        {
            id: 'git-identities',
            label: messages.sidebar.gitIdentities.label,
            description: messages.sidebar.gitIdentities.description,
            icon: SIDEBAR_SECTION_ICONS['git-identities'],
        },
        {
            id: 'settings',
            label: messages.sidebar.settings.label,
            description: messages.sidebar.settings.description,
            icon: SIDEBAR_SECTION_ICONS.settings,
        },
    ];
}

export function getSidebarSectionLabels(messages: MessageDictionary): Record<SidebarSection, string> {
    const labels = {} as Record<SidebarSection, string>;
    getSidebarSections(messages).forEach((section) => {
        labels[section.id] = section.label;
    });
    return labels;
}

export function getSidebarSectionDescriptions(messages: MessageDictionary): Record<SidebarSection, string> {
    const descriptions = {} as Record<SidebarSection, string>;
    getSidebarSections(messages).forEach((section) => {
        descriptions[section.id] = section.description;
    });
    return descriptions;
}

export function getSidebarSectionConfigMap(messages: MessageDictionary): Record<SidebarSection, SidebarSectionConfig> {
    const configMap = {} as Record<SidebarSection, SidebarSectionConfig>;
    getSidebarSections(messages).forEach((section) => {
        configMap[section.id] = section;
    });
    return configMap;
}
