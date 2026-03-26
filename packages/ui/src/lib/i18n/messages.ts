import type { SupportedLocale } from './locale';

export type SidebarSectionMessages = {
  label: string;
  description: string;
};

export type SettingsPageMessages = {
  title: string;
  description?: string;
  keywords?: string[];
};

export type MessageDictionary = {
  appName: string;
  common: {
    back: string;
    closeSettings: string;
    closeSettingsWithShortcut: (shortcut: string) => string;
    openSectionList: string;
    notAvailable: string;
    notAvailableInRuntime: string;
    beta: string;
    comingSoon: string;
    ok: string;
    copy: string;
    untitledSession: string;
  };
  sidebar: {
    sessions: SidebarSectionMessages;
    agents: SidebarSectionMessages;
    commands: SidebarSectionMessages;
    skills: SidebarSectionMessages;
    mcp: SidebarSectionMessages;
    providers: SidebarSectionMessages;
    usage: SidebarSectionMessages;
    gitIdentities: SidebarSectionMessages;
    settings: SidebarSectionMessages;
  };
  settings: {
    groups: {
      appearance: string;
      projects: string;
      general: string;
      opencode: string;
      git: string;
      skills: string;
      usage: string;
      advanced: string;
    };
    pages: {
      home: SettingsPageMessages;
      projects: SettingsPageMessages;
      remoteInstances: SettingsPageMessages;
      providers: SettingsPageMessages;
      usage: SettingsPageMessages;
      agents: SettingsPageMessages;
      commands: SettingsPageMessages;
      mcp: SettingsPageMessages;
      skillsInstalled: SettingsPageMessages;
      skillsCatalog: SettingsPageMessages;
      git: SettingsPageMessages;
      appearance: SettingsPageMessages;
      chat: SettingsPageMessages;
      shortcuts: SettingsPageMessages;
      sessions: SettingsPageMessages;
      notifications: SettingsPageMessages;
      voice: SettingsPageMessages;
      tunnel: SettingsPageMessages;
    };
    home: {
      title: string;
      description: string;
      quickLinks: {
        providersTitle: string;
        providersDescription: string;
        agentsTitle: string;
        agentsDescription: string;
        skillsCatalogTitle: string;
        skillsCatalogDescription: string;
        mcpTitle: string;
        mcpDescription: string;
        usageTitle: string;
        usageDescription: string;
      };
    };
    nav: {
      reloadOpenCode: string;
      reloadOpenCodeDescription: string;
    };
  };
  commandPalette: {
    placeholder: string;
    noResults: string;
    groups: {
      actions: string;
      settings: string;
      theme: string;
      recentSessions: string;
    };
    actions: {
      openSessionList: string;
      newSession: string;
      newWorktreeDraft: string;
      toggleRightSidebar: string;
      openRightSidebarGit: string;
      openRightSidebarFiles: string;
      toggleTerminalDock: string;
      toggleTerminalExpanded: string;
      keyboardShortcuts: string;
      openDiffPanel: string;
      openTerminal: string;
      openGitPanel: string;
      openTimeline: string;
      openSettings: string;
      openSkillsCatalog: string;
      lightTheme: string;
      darkTheme: string;
      systemTheme: string;
    };
  };
};

const en: MessageDictionary = {
  appName: 'OpenChamber',
  common: {
    back: 'Back',
    closeSettings: 'Close settings',
    closeSettingsWithShortcut: (shortcut) => `Close Settings (${shortcut})`,
    openSectionList: 'Open section list',
    notAvailable: 'Not available',
    notAvailableInRuntime: 'This settings page is not available in this runtime.',
    beta: 'beta',
    comingSoon: 'Coming soon...',
    ok: 'OK',
    copy: 'Copy',
    untitledSession: 'Untitled Session',
  },
  sidebar: {
    sessions: { label: 'Sessions', description: 'Browse and manage chat sessions scoped to the current directory.' },
    agents: { label: 'Agents', description: 'Configure OpenCode agents, prompts, and permissions.' },
    commands: { label: 'Commands', description: 'Create and maintain custom slash commands for OpenCode.' },
    skills: { label: 'Skills', description: 'Create reusable instruction files for agents to load on-demand.' },
    mcp: { label: 'MCP', description: 'Manage Model Context Protocol servers and their configurations.' },
    providers: { label: 'Providers', description: 'Configure AI model providers and API credentials.' },
    usage: { label: 'Usage', description: 'Monitor API quota and usage across providers.' },
    gitIdentities: { label: 'Git Identities', description: 'Manage Git profiles with different credentials and SSH keys.' },
    settings: { label: 'OpenChamber', description: 'OpenChamber app settings: themes, fonts, and preferences.' },
  },
  settings: {
    groups: {
      appearance: 'Appearance',
      projects: 'Projects',
      general: 'General',
      opencode: 'OpenCode',
      git: 'Git',
      skills: 'Skills',
      usage: 'Usage',
      advanced: 'Advanced',
    },
    pages: {
      home: { title: 'Settings', description: 'Search and jump to common pages.', keywords: ['search', 'settings'] },
      projects: { title: 'Projects', keywords: ['project', 'projects', 'worktree', 'worktrees', 'repo', 'repository', 'directory'] },
      remoteInstances: { title: 'Remote Instances', keywords: ['ssh', 'remote', 'instances', 'tunnels', 'forwarding', 'connection'] },
      providers: { title: 'Providers', keywords: ['provider', 'providers', 'models', 'model', 'api key', 'api keys', 'openai', 'anthropic', 'ollama', 'credentials'] },
      usage: { title: 'Usage', keywords: ['quota', 'billing', 'tokens', 'usage', 'limits'] },
      agents: { title: 'Agents', keywords: ['agent', 'agents', 'prompts', 'tools', 'permissions'] },
      commands: { title: 'Commands', keywords: ['command', 'commands', 'slash', 'macros', 'automation'] },
      mcp: { title: 'MCP', keywords: ['mcp', 'model context protocol', 'servers', 'tools', 'remote', 'stdio'] },
      skillsInstalled: { title: 'Skills', keywords: ['skill', 'skills', 'instructions', 'install', 'catalog'] },
      skillsCatalog: { title: 'Skills Catalog', keywords: ['install', 'catalog', 'external', 'repository', 'skills catalog'] },
      git: { title: 'Git', keywords: ['git', 'github', 'identity', 'identities', 'ssh', 'profiles', 'credentials', 'keys', 'commit', 'gitmoji', 'oauth', 'prs', 'issues'] },
      appearance: { title: 'Appearance', keywords: ['theme', 'font', 'spacing', 'padding', 'corner radius', 'radius', 'input bar', 'terminal', 'pwa', 'install name', 'app shortcuts'] },
      chat: { title: 'Chat', keywords: ['tools', 'diff', 'reasoning', 'dotfiles', 'draft', 'queue', 'output'] },
      shortcuts: { title: 'Shortcuts', keywords: ['keyboard', 'hotkeys', 'shortcuts', 'bindings'] },
      sessions: { title: 'Sessions', keywords: ['defaults', 'default agent', 'default model', 'retention', 'memory', 'limits', 'zen'] },
      notifications: { title: 'Notifications', keywords: ['alerts', 'native', 'summary', 'summarization'] },
      voice: { title: 'Voice', keywords: ['tts', 'speech', 'voice'] },
      tunnel: { title: 'Remote Tunnel', keywords: ['tunnel', 'cloudflare', 'qr', 'remote', 'mobile', 'share'] },
    },
    home: {
      title: 'Settings',
      description: 'Jump to common pages.',
      quickLinks: {
        providersTitle: 'Providers',
        providersDescription: 'Connect models + credentials',
        agentsTitle: 'Agents',
        agentsDescription: 'Prompts, tools, permissions',
        skillsCatalogTitle: 'Skills Catalog',
        skillsCatalogDescription: 'Install skills from catalogs',
        mcpTitle: 'MCP',
        mcpDescription: 'Configure MCP servers + connections',
        usageTitle: 'Usage',
        usageDescription: 'Quota + spend visibility',
      },
    },
    nav: {
      reloadOpenCode: 'Reload OpenCode',
      reloadOpenCodeDescription: 'Restart OpenCode and reload its configuration.',
    },
  },
  commandPalette: {
    placeholder: 'Type a command or search...',
    noResults: 'No results found.',
    groups: {
      actions: 'Actions',
      settings: 'Settings',
      theme: 'Theme',
      recentSessions: 'Recent Sessions',
    },
    actions: {
      openSessionList: 'Open Session List',
      newSession: 'New Session',
      newWorktreeDraft: 'New Worktree Draft',
      toggleRightSidebar: 'Toggle Right Sidebar',
      openRightSidebarGit: 'Open Right Sidebar Git',
      openRightSidebarFiles: 'Open Right Sidebar Files',
      toggleTerminalDock: 'Toggle Terminal Dock',
      toggleTerminalExpanded: 'Toggle Terminal Expanded',
      keyboardShortcuts: 'Keyboard Shortcuts',
      openDiffPanel: 'Open Diff Panel',
      openTerminal: 'Open Terminal',
      openGitPanel: 'Open Git Panel',
      openTimeline: 'Open Timeline',
      openSettings: 'Open Settings',
      openSkillsCatalog: 'Open Skills Catalog',
      lightTheme: 'Light Theme',
      darkTheme: 'Dark Theme',
      systemTheme: 'System Theme',
    },
  },
};

const zhCN: Partial<MessageDictionary> = {
  appName: 'OpenChamber',
  common: {
    back: '返回',
    closeSettings: '关闭设置',
    closeSettingsWithShortcut: (shortcut) => `关闭设置（${shortcut}）`,
    openSectionList: '打开分区列表',
    notAvailable: '不可用',
    notAvailableInRuntime: '此设置页面在当前运行环境中不可用。',
    beta: '测试版',
    comingSoon: '即将推出…',
    ok: '确定',
    copy: '复制',
    untitledSession: '未命名会话',
  },
  sidebar: {
    sessions: { label: '会话', description: '浏览并管理当前目录范围内的聊天会话。' },
    agents: { label: '代理', description: '配置 OpenCode 代理、提示词与权限。' },
    commands: { label: '命令', description: '创建并维护 OpenCode 的自定义斜杠命令。' },
    skills: { label: '技能', description: '创建可复用的指令文件，供代理按需加载。' },
    mcp: { label: 'MCP', description: '管理 Model Context Protocol 服务器及其配置。' },
    providers: { label: '提供商', description: '配置 AI 模型提供商与 API 凭据。' },
    usage: { label: '用量', description: '监控各提供商的 API 配额与使用情况。' },
    gitIdentities: { label: 'Git 身份', description: '管理使用不同凭据和 SSH 密钥的 Git 配置。' },
    settings: { label: 'OpenChamber', description: 'OpenChamber 应用设置：主题、字体与偏好。' },
  },
  settings: {
    groups: {
      appearance: '外观',
      projects: '项目',
      general: '通用',
      opencode: 'OpenCode',
      git: 'Git',
      skills: '技能',
      usage: '用量',
      advanced: '高级',
    },
    pages: {
      home: { title: '设置', description: '搜索并跳转到常用页面。', keywords: ['设置', '搜索', 'settings', 'search'] },
      projects: { title: '项目', keywords: ['项目', '目录', '仓库', '工作树', 'project', 'projects', 'worktree', 'repository', 'directory'] },
      remoteInstances: { title: '远程实例', keywords: ['远程', '实例', 'ssh', '隧道', '转发', '连接', 'remote', 'instances', 'connection'] },
      providers: { title: '提供商', keywords: ['提供商', '模型', 'api', '密钥', '凭据', 'provider', 'providers', 'models', 'credentials'] },
      usage: { title: '用量', keywords: ['用量', '配额', '账单', 'tokens', 'usage', 'quota', 'billing'] },
      agents: { title: '代理', keywords: ['代理', '提示词', '工具', '权限', 'agent', 'agents', 'prompts', 'permissions'] },
      commands: { title: '命令', keywords: ['命令', '斜杠命令', '自动化', 'command', 'commands', 'slash', 'automation'] },
      mcp: { title: 'MCP', keywords: ['mcp', '模型上下文协议', '服务器', '工具', 'model context protocol', 'servers'] },
      skillsInstalled: { title: '技能', keywords: ['技能', '说明', '安装', '目录', 'skill', 'skills', 'catalog'] },
      skillsCatalog: { title: '技能目录', keywords: ['技能目录', '安装', '外部', '仓库', 'catalog', 'repository', 'install'] },
      git: { title: 'Git', keywords: ['git', 'github', '身份', 'ssh', '凭据', '提交', 'oauth', 'issues', 'prs'] },
      appearance: { title: '外观', keywords: ['外观', '主题', '字体', '间距', '圆角', '终端', 'appearance', 'theme', 'font', 'spacing'] },
      chat: { title: '聊天', keywords: ['聊天', '工具', 'diff', '推理', '草稿', '输出', 'chat', 'draft', 'output'] },
      shortcuts: { title: '快捷键', keywords: ['快捷键', '键盘', '热键', 'bindings', 'shortcuts', 'keyboard'] },
      sessions: { title: '会话', keywords: ['会话', '默认', '模型', '保留', '记忆', 'limits', 'sessions', 'default model', 'memory'] },
      notifications: { title: '通知', keywords: ['通知', '提醒', '本地通知', '摘要', 'notifications', 'alerts', 'summary'] },
      voice: { title: '语音', keywords: ['语音', 'tts', 'speech', 'voice'] },
      tunnel: { title: '远程隧道', keywords: ['隧道', 'cloudflare', '二维码', '远程', 'mobile', 'share', 'tunnel'] },
    },
    home: {
      title: '设置',
      description: '跳转到常用页面。',
      quickLinks: {
        providersTitle: '提供商',
        providersDescription: '连接模型与凭据',
        agentsTitle: '代理',
        agentsDescription: '提示词、工具与权限',
        skillsCatalogTitle: '技能目录',
        skillsCatalogDescription: '从目录安装技能',
        mcpTitle: 'MCP',
        mcpDescription: '配置 MCP 服务器与连接',
        usageTitle: '用量',
        usageDescription: '查看配额与花费',
      },
    },
    nav: {
      reloadOpenCode: '重新加载 OpenCode',
      reloadOpenCodeDescription: '重启 OpenCode 并重新加载其配置。',
    },
  },
  commandPalette: {
    placeholder: '输入命令或搜索…',
    noResults: '未找到结果。',
    groups: {
      actions: '操作',
      settings: '设置',
      theme: '主题',
      recentSessions: '最近会话',
    },
    actions: {
      openSessionList: '打开会话列表',
      newSession: '新建会话',
      newWorktreeDraft: '新建工作树草稿',
      toggleRightSidebar: '切换右侧边栏',
      openRightSidebarGit: '打开右侧边栏 Git',
      openRightSidebarFiles: '打开右侧边栏文件',
      toggleTerminalDock: '切换终端停靠栏',
      toggleTerminalExpanded: '切换终端展开状态',
      keyboardShortcuts: '键盘快捷键',
      openDiffPanel: '打开 Diff 面板',
      openTerminal: '打开终端',
      openGitPanel: '打开 Git 面板',
      openTimeline: '打开时间线',
      openSettings: '打开设置',
      openSkillsCatalog: '打开技能目录',
      lightTheme: '浅色主题',
      darkTheme: '深色主题',
      systemTheme: '系统主题',
    },
  },
};

const mergeWithEnglishFallback = (overlay: Partial<MessageDictionary>): MessageDictionary => ({
  ...en,
  ...overlay,
  common: {
    ...en.common,
    ...overlay.common,
  },
  sidebar: {
    ...en.sidebar,
    ...overlay.sidebar,
  },
  settings: {
    ...en.settings,
    ...overlay.settings,
    groups: {
      ...en.settings.groups,
      ...overlay.settings?.groups,
    },
    pages: {
      ...en.settings.pages,
      ...overlay.settings?.pages,
    },
    home: {
      ...en.settings.home,
      ...overlay.settings?.home,
      quickLinks: {
        ...en.settings.home.quickLinks,
        ...overlay.settings?.home?.quickLinks,
      },
    },
    nav: {
      ...en.settings.nav,
      ...overlay.settings?.nav,
    },
  },
  commandPalette: {
    ...en.commandPalette,
    ...overlay.commandPalette,
    groups: {
      ...en.commandPalette.groups,
      ...overlay.commandPalette?.groups,
    },
    actions: {
      ...en.commandPalette.actions,
      ...overlay.commandPalette?.actions,
    },
  },
});

export const messagesByLocale: Record<SupportedLocale, MessageDictionary> = {
  en,
  'zh-CN': mergeWithEnglishFallback(zhCN),
};

export const defaultMessages = en;
