// Type declarations for @openchamber/ui package
// The actual implementation is bundled at build time by Vite

declare module '@openchamber/ui/lib/api/types' {
  export type RuntimePlatform = 'web' | 'desktop' | 'vscode';

  export interface RuntimeDescriptor {
    platform: RuntimePlatform;
    isDesktop: boolean;
    isVSCode: boolean;
    label?: string;
  }

  export interface Subscription {
    close: () => void;
  }

  export interface TerminalSession {
    sessionId: string;
    cols: number;
    rows: number;
  }

  export interface TerminalStreamEvent {
    type: 'connected' | 'data' | 'exit' | 'reconnecting';
    data?: string;
    exitCode?: number;
    signal?: number | null;
    attempt?: number;
    maxAttempts?: number;
    runtime?: 'node' | 'bun';
    ptyBackend?: string;
  }

  export interface CreateTerminalOptions {
    cwd: string;
    cols?: number;
    rows?: number;
  }

  export interface TerminalStreamOptions {
    retry?: { maxRetries?: number; initialDelayMs?: number; maxDelayMs?: number };
    connectionTimeoutMs?: number;
  }

  export interface ResizeTerminalPayload {
    sessionId: string;
    cols: number;
    rows: number;
  }

  export interface TerminalHandlers {
    onEvent: (event: TerminalStreamEvent) => void;
    onError?: (error: Error, fatal?: boolean) => void;
  }

  export interface TerminalAPI {
    createSession(options: CreateTerminalOptions): Promise<TerminalSession>;
    connect(sessionId: string, handlers: TerminalHandlers, options?: TerminalStreamOptions): Subscription;
    sendInput(sessionId: string, input: string): Promise<void>;
    resize(payload: ResizeTerminalPayload): Promise<void>;
    close(sessionId: string): Promise<void>;
  }

  export interface GitStatus {
    current: string;
    tracking: string | null;
    ahead: number;
    behind: number;
    files: Array<{ path: string; index: string; working_dir: string }>;
    isClean: boolean;
  }

  export interface GitBranch {
    all: string[];
    current: string;
    branches: Record<string, unknown>;
  }

  export interface GitCommitResult {
    success: boolean;
    commit: string;
    branch: string;
    summary: { changes: number; insertions: number; deletions: number };
  }

  export interface GitPushResult {
    success: boolean;
    pushed: Array<{ local: string; remote: string }>;
    repo: string;
    ref: unknown;
  }

  export interface GitPullResult {
    success: boolean;
    summary: { changes: number; insertions: number; deletions: number };
    files: string[];
    insertions: number;
    deletions: number;
  }

  export interface GitLogResponse {
    all: unknown[];
    latest: unknown | null;
    total: number;
  }

  export interface GitAPI {
    checkIsGitRepository(directory: string): Promise<boolean>;
    getGitStatus(directory: string): Promise<GitStatus>;
    getGitDiff(directory: string, options: { path: string; staged?: boolean }): Promise<{ diff: string }>;
    getGitFileDiff(directory: string, options: { path: string; staged?: boolean }): Promise<{ original: string; modified: string; path: string }>;
    revertGitFile(directory: string, filePath: string): Promise<void>;
    isLinkedWorktree(directory: string): Promise<boolean>;
    getGitBranches(directory: string): Promise<GitBranch>;
    deleteGitBranch(directory: string, payload: { branch: string; force?: boolean }): Promise<{ success: boolean }>;
    deleteRemoteBranch(directory: string, payload: { branch: string; remote?: string }): Promise<{ success: boolean }>;
    generateCommitMessage(directory: string, files: string[]): Promise<{ message: { subject: string; highlights: string[] } }>;
    listGitWorktrees(directory: string): Promise<Array<{ worktree: string; head?: string; branch?: string }>>;
    addGitWorktree(directory: string, payload: { path: string; branch: string; createBranch?: boolean }): Promise<{ success: boolean; path: string; branch: string }>;
    removeGitWorktree(directory: string, payload: { path: string; force?: boolean }): Promise<{ success: boolean }>;
    ensureOpenChamberIgnored(directory: string): Promise<void>;
    createGitCommit(directory: string, message: string, options?: { addAll?: boolean; files?: string[] }): Promise<GitCommitResult>;
    gitPush(directory: string, options?: { remote?: string; branch?: string }): Promise<GitPushResult>;
    gitPull(directory: string, options?: { remote?: string; branch?: string }): Promise<GitPullResult>;
    gitFetch(directory: string, options?: { remote?: string; branch?: string }): Promise<{ success: boolean }>;
    checkoutBranch(directory: string, branch: string): Promise<{ success: boolean; branch: string }>;
    createBranch(directory: string, name: string, startPoint?: string): Promise<{ success: boolean; branch: string }>;
    renameBranch(directory: string, oldName: string, newName: string): Promise<{ success: boolean; branch: string }>;
    getGitLog(directory: string, options?: { maxCount?: number }): Promise<GitLogResponse>;
    getCommitFiles(directory: string, hash: string): Promise<{ files: unknown[] }>;
    getCurrentGitIdentity(directory: string): Promise<{ userName: string | null; userEmail: string | null } | null>;
    setGitIdentity(directory: string, profileId: string): Promise<{ success: boolean; profile: unknown }>;
    getGitIdentities(): Promise<unknown[]>;
    createGitIdentity(profile: unknown): Promise<unknown>;
    updateGitIdentity(id: string, updates: unknown): Promise<unknown>;
    deleteGitIdentity(id: string): Promise<void>;
  }

  export interface FilesAPI {
    listDirectory(path: string): Promise<{ directory: string; entries: Array<{ name: string; path: string; isDirectory: boolean }> }>;
    search(payload: { directory: string; query: string; maxResults?: number }): Promise<Array<{ path: string }>>;
    createDirectory(path: string): Promise<{ success: boolean; path: string }>;
  }

  export interface SettingsPayload {
    themeId?: string;
    useSystemTheme?: boolean;
    themeVariant?: 'light' | 'dark';
    lastDirectory?: string;
    [key: string]: unknown;
  }

  export interface SettingsAPI {
    load(): Promise<{ settings: SettingsPayload; source: 'desktop' | 'web' }>;
    save(changes: Partial<SettingsPayload>): Promise<SettingsPayload>;
  }

  export interface PermissionsAPI {
    requestDirectoryAccess(request: { path: string }): Promise<{ success: boolean; error?: string }>;
    startAccessingDirectory(path: string): Promise<{ success: boolean }>;
    stopAccessingDirectory(path: string): Promise<{ success: boolean }>;
  }

  export interface NotificationsAPI {
    notifyAgentCompletion(payload?: { title?: string; body?: string }): Promise<boolean>;
    canNotify?: () => boolean | Promise<boolean>;
  }

  export interface ToolsAPI {
    getAvailableTools(): Promise<string[]>;
  }

  export interface RuntimeAPIs {
    runtime: RuntimeDescriptor;
    terminal: TerminalAPI;
    git: GitAPI;
    files: FilesAPI;
    settings: SettingsAPI;
    permissions: PermissionsAPI;
    notifications: NotificationsAPI;
    tools: ToolsAPI;
  }
}

declare module '@openchamber/ui/App' {
  import type { FC } from 'react';
  import type { RuntimeAPIs } from '@openchamber/ui/lib/api/types';

  interface AppProps {
    apis: RuntimeAPIs;
  }

  const App: FC<AppProps>;
  export default App;
}

declare module '@openchamber/ui/components/providers/ThemeProvider' {
  import type { FC, ReactNode } from 'react';
  
  interface ThemeProviderProps {
    children?: ReactNode;
  }
  
  export const ThemeProvider: FC<ThemeProviderProps>;
}

declare module '@openchamber/ui/contexts/ThemeSystemContext' {
  import type { FC, ReactNode } from 'react';
  
  interface ThemeSystemProviderProps {
    children?: ReactNode;
  }
  
  export const ThemeSystemProvider: FC<ThemeSystemProviderProps>;
}

declare module '@openchamber/ui/components/auth/SessionAuthGate' {
  import type { FC, ReactNode } from 'react';
  
  interface SessionAuthGateProps {
    children?: ReactNode;
  }
  
  export const SessionAuthGate: FC<SessionAuthGateProps>;
}

declare module '@openchamber/ui/components/theme' {
  import type { FC, ReactNode } from 'react';
  
  interface ThemeProviderProps {
    children?: ReactNode;
  }
  
  interface ThemeSystemProviderProps {
    children?: ReactNode;
  }
  
  export const ThemeProvider: FC<ThemeProviderProps>;
  export const ThemeSystemProvider: FC<ThemeSystemProviderProps>;
}

declare module '@openchamber/ui/index.css' {
  const content: string;
  export default content;
}

declare module '@openchamber/ui/styles/fonts' {
  const content: void;
  export default content;
}
