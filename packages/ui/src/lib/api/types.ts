import type { WorktreeMetadata } from '@/types/worktree';

export type RuntimePlatform = 'web' | 'desktop' | 'vscode';

export interface RuntimeDescriptor {
  platform: RuntimePlatform;

  isDesktop: boolean;

  isVSCode: boolean;

  label?: string;
}

export interface ApiError {
  message: string;
  code?: string;
  cause?: unknown;
}

export interface Subscription {

  close: () => void;
}

export interface RetryPolicy {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
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
  retry?: Partial<RetryPolicy>;
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

export interface ForceKillOptions {
  sessionId?: string;
  cwd?: string;
}

export interface TerminalAPI {
  createSession(options: CreateTerminalOptions): Promise<TerminalSession>;
  connect(sessionId: string, handlers: TerminalHandlers, options?: TerminalStreamOptions): Subscription;
  sendInput(sessionId: string, input: string): Promise<void>;
  resize(payload: ResizeTerminalPayload): Promise<void>;
  close(sessionId: string): Promise<void>;
  restartSession?(currentSessionId: string, options: CreateTerminalOptions): Promise<TerminalSession>;
  forceKill?(options: ForceKillOptions): Promise<void>;
}

export interface GitStatusFile {
  path: string;
  index: string;
  working_dir: string;
}

export interface GitStatus {
  current: string;
  tracking: string | null;
  ahead: number;
  behind: number;
  files: GitStatusFile[];
  isClean: boolean;
  diffStats?: Record<string, { insertions: number; deletions: number }>;
}

export interface GitDiffResponse {
  diff: string;
}

export interface GetGitDiffOptions {
  path: string;
  staged?: boolean;
  contextLines?: number;
}

export interface GitFileDiffResponse {
  original: string;
  modified: string;
  path: string;
}

export interface GetGitFileDiffOptions {
  path: string;
  staged?: boolean;
}

export interface GitBranchDetails {
  current: boolean;
  name: string;
  commit: string;
  label: string;
  tracking?: string;
  ahead?: number;
  behind?: number;
}

export interface GitBranch {
  all: string[];
  current: string;
  branches: Record<string, GitBranchDetails>;
}

export interface GitCommitSummary {
  changes: number;
  insertions: number;
  deletions: number;
}

export interface GitCommitResult {
  success: boolean;
  commit: string;
  branch: string;
  summary: GitCommitSummary;
}

export interface GitPushResult {
  success: boolean;
  pushed: Array<{
    local: string;
    remote: string;
  }>;
  repo: string;
  ref: unknown;
}

export interface GitPullResult {
  success: boolean;
  summary: GitCommitSummary;
  files: string[];
  insertions: number;
  deletions: number;
}

export interface GitIdentityProfile {
  id: string;
  name: string;
  userName: string;
  userEmail: string;
  sshKey?: string | null;
  color?: string | null;
  icon?: string | null;
}

export interface GitIdentitySummary {
  userName: string | null;
  userEmail: string | null;
  sshCommand: string | null;
}

export interface GitLogEntry {
  hash: string;
  date: string;
  message: string;
  refs: string;
  body: string;
  author_name: string;
  author_email: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface GitLogResponse {
  all: GitLogEntry[];
  latest: GitLogEntry | null;
  total: number;
}

export interface CommitFileEntry {
  path: string;
  insertions: number;
  deletions: number;
  isBinary: boolean;
  changeType: 'A' | 'M' | 'D' | 'R' | 'C' | string;
}

export interface GitCommitFilesResponse {
  files: CommitFileEntry[];
}

export interface GitWorktreeInfo {
  worktree: string;
  head?: string;
  branch?: string;
}

export interface GitAddWorktreePayload {
  path: string;
  branch: string;
  createBranch?: boolean;
  startPoint?: string;
}

export interface GitRemoveWorktreePayload {
  path: string;
  force?: boolean;
}

export interface GitDeleteBranchPayload {
  branch: string;
  force?: boolean;
}

export interface GitDeleteRemoteBranchPayload {
  branch: string;
  remote?: string;
}

export interface CreateGitCommitOptions {
  addAll?: boolean;
  files?: string[];
}

export interface GitLogOptions {
  maxCount?: number;
  from?: string;
  to?: string;
  file?: string;
}

export interface GeneratedCommitMessage {
  subject: string;
  highlights: string[];
}

export interface GitAPI {
  checkIsGitRepository(directory: string): Promise<boolean>;
  getGitStatus(directory: string): Promise<GitStatus>;
  getGitDiff(directory: string, options: GetGitDiffOptions): Promise<GitDiffResponse>;
  getGitFileDiff(directory: string, options: GetGitFileDiffOptions): Promise<GitFileDiffResponse>;
  revertGitFile(directory: string, filePath: string): Promise<void>;
  isLinkedWorktree(directory: string): Promise<boolean>;
  getGitBranches(directory: string): Promise<GitBranch>;
  deleteGitBranch(directory: string, payload: GitDeleteBranchPayload): Promise<{ success: boolean }>;
  deleteRemoteBranch(directory: string, payload: GitDeleteRemoteBranchPayload): Promise<{ success: boolean }>;
  generateCommitMessage(directory: string, files: string[]): Promise<{ message: GeneratedCommitMessage }>;
  listGitWorktrees(directory: string): Promise<GitWorktreeInfo[]>;
  addGitWorktree(directory: string, payload: GitAddWorktreePayload): Promise<{ success: boolean; path: string; branch: string }>;
  removeGitWorktree(directory: string, payload: GitRemoveWorktreePayload): Promise<{ success: boolean }>;
  ensureOpenChamberIgnored(directory: string): Promise<void>;
  createGitCommit(directory: string, message: string, options?: CreateGitCommitOptions): Promise<GitCommitResult>;
  gitPush(directory: string, options?: { remote?: string; branch?: string; options?: string[] | Record<string, unknown> }): Promise<GitPushResult>;
  gitPull(directory: string, options?: { remote?: string; branch?: string }): Promise<GitPullResult>;
  gitFetch(directory: string, options?: { remote?: string; branch?: string }): Promise<{ success: boolean }>;
  checkoutBranch(directory: string, branch: string): Promise<{ success: boolean; branch: string }>;
  createBranch(directory: string, name: string, startPoint?: string): Promise<{ success: boolean; branch: string }>;
  getGitLog(directory: string, options?: GitLogOptions): Promise<GitLogResponse>;
  getCommitFiles(directory: string, hash: string): Promise<GitCommitFilesResponse>;
  getCurrentGitIdentity(directory: string): Promise<GitIdentitySummary | null>;
  setGitIdentity(directory: string, profileId: string): Promise<{ success: boolean; profile: GitIdentityProfile }>;
  getGitIdentities(): Promise<GitIdentityProfile[]>;
  createGitIdentity(profile: GitIdentityProfile): Promise<GitIdentityProfile>;
  updateGitIdentity(id: string, updates: GitIdentityProfile): Promise<GitIdentityProfile>;
  deleteGitIdentity(id: string): Promise<void>;
}

export interface FileListEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedTime?: number;
}

export interface DirectoryListResult {
  directory: string;
  entries: FileListEntry[];
}

export interface FileSearchQuery {
  directory: string;
  query: string;
  maxResults?: number;
}

export interface FileSearchResult {
  path: string;
  score?: number;
  preview?: string[];
}

export interface FilesAPI {
  listDirectory(path: string): Promise<DirectoryListResult>;
  search(payload: FileSearchQuery): Promise<FileSearchResult[]>;
  createDirectory(path: string): Promise<{ success: boolean; path: string }>;
}

export interface SettingsPayload {
  themeId?: string;
  useSystemTheme?: boolean;
  themeVariant?: 'light' | 'dark';
  lightThemeId?: string;
  darkThemeId?: string;
  lastDirectory?: string;
  homeDirectory?: string;
  approvedDirectories?: string[];
  securityScopedBookmarks?: string[];
  pinnedDirectories?: string[];
  showReasoningTraces?: boolean;
  autoDeleteEnabled?: boolean;
  autoDeleteAfterDays?: number;
  queueModeEnabled?: boolean;

  [key: string]: unknown;
}

export interface SettingsLoadResult {
  settings: SettingsPayload;
  source: 'desktop' | 'web';
}

export interface SettingsAPI {
  load(): Promise<SettingsLoadResult>;
  save(changes: Partial<SettingsPayload>): Promise<SettingsPayload>;

  restartOpenCode?: () => Promise<{ restarted: boolean }>;
}

export interface DirectoryPermissionRequest {
  path: string;
}

export interface DirectoryPermissionResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface StartAccessingResult {
  success: boolean;
  error?: string;
}

export interface PermissionsAPI {
  requestDirectoryAccess(request: DirectoryPermissionRequest): Promise<DirectoryPermissionResult>;
  startAccessingDirectory(path: string): Promise<StartAccessingResult>;
  stopAccessingDirectory(path: string): Promise<StartAccessingResult>;
}

export interface NotificationPayload {
  title?: string;
  body?: string;

  tag?: string;
}

export interface NotificationsAPI {
  notifyAgentCompletion(payload?: NotificationPayload): Promise<boolean>;
  canNotify?: () => boolean | Promise<boolean>;
}

export interface DiagnosticsAPI {
  downloadLogs(): Promise<{ fileName: string; content: string }>;
}

export interface ToolsAPI {

  getAvailableTools(): Promise<string[]>;
}

export interface EditorAPI {
  openFile(path: string, line?: number, column?: number): Promise<void>;
  openDiff(original: string, modified: string, label?: string): Promise<void>;
}

export interface RuntimeAPIs {
  runtime: RuntimeDescriptor;
  terminal: TerminalAPI;
  git: GitAPI;
  files: FilesAPI;
  settings: SettingsAPI;
  permissions: PermissionsAPI;
  notifications: NotificationsAPI;
  diagnostics?: DiagnosticsAPI;
  tools: ToolsAPI;
  editor?: EditorAPI;
  worktrees?: WorktreeMetadata[];
}

export type RuntimeAPISelector<TValue> = (apis: RuntimeAPIs) => TValue;

// ============== Skills Catalog Types ==============

export type SkillsCatalogSourceId = string;

export interface SkillsCatalogSource {
  id: SkillsCatalogSourceId;
  label: string;
  description?: string;
  source: string;
  defaultSubpath?: string;
}

export interface SkillsCatalogItemInstalledBadge {
  isInstalled: boolean;
  scope?: 'user' | 'project';
}

export interface SkillsCatalogItem {
  sourceId: SkillsCatalogSourceId;
  repoSource: string;
  repoSubpath?: string;
  gitIdentityId?: string;
  skillDir: string;
  skillName: string;
  frontmatterName?: string;
  description?: string;
  installable: boolean;
  warnings?: string[];
  installed?: SkillsCatalogItemInstalledBadge;
}

export interface SkillsCatalogResponse {
  ok: boolean;
  sources?: SkillsCatalogSource[];
  itemsBySource?: Record<SkillsCatalogSourceId, SkillsCatalogItem[]>;
  error?: { kind: string; message: string };
}

export interface SkillsRepoScanRequest {
  source: string;
  subpath?: string;
  gitIdentityId?: string;
}

export type SkillsRepoScanError =
  | { kind: 'authRequired'; message: string; sshOnly: true; identities?: Array<{ id: string; name: string }> }
  | { kind: 'invalidSource'; message: string }
  | { kind: 'gitUnavailable'; message: string }
  | { kind: 'networkError'; message: string }
  | { kind: 'unknown'; message: string };

export interface SkillsRepoScanResponse {
  ok: boolean;
  items?: SkillsCatalogItem[];
  error?: SkillsRepoScanError;
}

export interface SkillsInstallSelection {
  skillDir: string;
}

export interface SkillsInstallRequest {
  source: string;
  subpath?: string;
  gitIdentityId?: string;
  scope: 'user' | 'project';
  selections: SkillsInstallSelection[];
  conflictPolicy?: 'prompt' | 'skipAll' | 'overwriteAll';
  conflictDecisions?: Record<string, 'skip' | 'overwrite'>;
}

export type SkillsInstallError = SkillsRepoScanError | {
  kind: 'conflicts';
  message: string;
  conflicts: Array<{ skillName: string; scope: 'user' | 'project' }>;
};

export interface SkillsInstallResponse {
  ok: boolean;
  installed?: Array<{ skillName: string; scope: 'user' | 'project' }>;
  skipped?: Array<{ skillName: string; reason: string }>;
  error?: SkillsInstallError;
}

