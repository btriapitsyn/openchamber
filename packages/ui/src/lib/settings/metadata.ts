import type { SidebarSection } from '@/constants/sidebar';
import { defaultMessages, type MessageDictionary } from '@/lib/i18n/messages';

export type SettingsPageSlug =
  | 'home'
  | 'projects'
  | 'remote-instances'
  | 'providers'
  | 'usage'
  | 'agents'
  | 'commands'
  | 'mcp'
  | 'skills.installed'
  | 'skills.catalog'
  | 'git'
  | 'appearance'
  | 'chat'
  | 'shortcuts'
  | 'sessions'
  | 'notifications'
  | 'voice'
  | 'tunnel';

export type SettingsPageGroup =
  | 'appearance'
  | 'projects'
  | 'general'
  | 'opencode'
  | 'git'
  | 'skills'
  | 'usage'
  | 'advanced';

export interface SettingsRuntimeContext {
  isVSCode: boolean;
  isWeb: boolean;
  isDesktop: boolean;
}

export interface SettingsPageMeta {
  slug: SettingsPageSlug;
  title: string;
  group: SettingsPageGroup;
  kind: 'single' | 'split';
  description?: string;
  keywords?: string[];
  isAvailable?: (ctx: SettingsRuntimeContext) => boolean;
}

export function getSettingsGroupLabels(messages: MessageDictionary): Record<SettingsPageGroup, string> {
  return {
    appearance: messages.settings.groups.appearance,
    projects: messages.settings.groups.projects,
    general: messages.settings.groups.general,
    opencode: messages.settings.groups.opencode,
    git: messages.settings.groups.git,
    skills: messages.settings.groups.skills,
    usage: messages.settings.groups.usage,
    advanced: messages.settings.groups.advanced,
  };
}

export function getSettingsPageMetadata(messages: MessageDictionary): readonly SettingsPageMeta[] {
  return [
  {
    slug: 'home',
    title: messages.settings.pages.home.title,
    group: 'general',
    kind: 'single',
    description: messages.settings.pages.home.description,
    keywords: messages.settings.pages.home.keywords,
  },
  {
    slug: 'projects',
    title: messages.settings.pages.projects.title,
    group: 'projects',
    kind: 'split',
    keywords: messages.settings.pages.projects.keywords,
  },
  {
    slug: 'remote-instances',
    title: messages.settings.pages.remoteInstances.title,
    group: 'projects',
    kind: 'split',
    keywords: messages.settings.pages.remoteInstances.keywords,
    isAvailable: (ctx) => ctx.isDesktop && !ctx.isWeb && !ctx.isVSCode,
  },
  {
    slug: 'providers',
    title: messages.settings.pages.providers.title,
    group: 'opencode',
    kind: 'split',
    keywords: messages.settings.pages.providers.keywords,
  },
  {
    slug: 'usage',
    title: messages.settings.pages.usage.title,
    group: 'usage',
    kind: 'split',
    keywords: messages.settings.pages.usage.keywords,
  },
  {
    slug: 'agents',
    title: messages.settings.pages.agents.title,
    group: 'opencode',
    kind: 'split',
    keywords: messages.settings.pages.agents.keywords,
  },
  {
    slug: 'commands',
    title: messages.settings.pages.commands.title,
    group: 'opencode',
    kind: 'split',
    keywords: messages.settings.pages.commands.keywords,
  },
  {
    slug: 'mcp',
    title: messages.settings.pages.mcp.title,
    group: 'opencode',
    kind: 'split',
    keywords: messages.settings.pages.mcp.keywords,
  },
  {
    slug: 'skills.installed',
    title: messages.settings.pages.skillsInstalled.title,
    group: 'skills',
    kind: 'split',
    keywords: messages.settings.pages.skillsInstalled.keywords,
  },
  {
    slug: 'skills.catalog',
    title: messages.settings.pages.skillsCatalog.title,
    group: 'skills',
    kind: 'single',
    keywords: messages.settings.pages.skillsCatalog.keywords,
  },
  {
    slug: 'git',
    title: messages.settings.pages.git.title,
    group: 'git',
    kind: 'single',
    keywords: messages.settings.pages.git.keywords,
    isAvailable: (ctx) => !ctx.isVSCode,
  },
  {
    slug: 'appearance',
    title: messages.settings.pages.appearance.title,
    group: 'appearance',
    kind: 'single',
    keywords: messages.settings.pages.appearance.keywords,
  },
  {
    slug: 'chat',
    title: messages.settings.pages.chat.title,
    group: 'general',
    kind: 'single',
    keywords: messages.settings.pages.chat.keywords,
  },
  {
    slug: 'shortcuts',
    title: messages.settings.pages.shortcuts.title,
    group: 'general',
    kind: 'single',
    keywords: messages.settings.pages.shortcuts.keywords,
    isAvailable: (ctx) => !ctx.isVSCode,
  },
  {
    slug: 'sessions',
    title: messages.settings.pages.sessions.title,
    group: 'general',
    kind: 'single',
    keywords: messages.settings.pages.sessions.keywords,
  },

  { slug: 'notifications', title: messages.settings.pages.notifications.title, group: 'general', kind: 'single', keywords: messages.settings.pages.notifications.keywords },
  { slug: 'voice', title: messages.settings.pages.voice.title, group: 'advanced', kind: 'single', keywords: messages.settings.pages.voice.keywords, isAvailable: (ctx) => !ctx.isVSCode },
  { slug: 'tunnel', title: messages.settings.pages.tunnel.title, group: 'advanced', kind: 'single', keywords: messages.settings.pages.tunnel.keywords, isAvailable: (ctx) => !ctx.isVSCode },
] as const;
}

export const LEGACY_SIDEBAR_SECTION_TO_SETTINGS_SLUG: Record<SidebarSection, SettingsPageSlug> = {
  sessions: 'sessions',
  agents: 'agents',
  commands: 'commands',
  mcp: 'mcp',
  skills: 'skills.installed',
  providers: 'providers',
  usage: 'usage',
  'git-identities': 'git',
  settings: 'home',
};

export function getSettingsPageMeta(slug: string, messages: MessageDictionary = defaultMessages): SettingsPageMeta | null {
  const normalized = slug.trim().toLowerCase();
  return getSettingsPageMetadata(messages).find((page) => page.slug === normalized) ?? null;
}

export function resolveSettingsSlug(value: string | null | undefined, messages: MessageDictionary = defaultMessages): SettingsPageSlug {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) {
    return 'home';
  }

  const legacy = (LEGACY_SIDEBAR_SECTION_TO_SETTINGS_SLUG as Record<string, SettingsPageSlug>)[normalized];
  if (legacy) {
    return legacy;
  }

  const direct = getSettingsPageMeta(normalized, messages);
  if (direct) {
    return direct.slug;
  }

  return 'home';
}
