import type { RuntimeAPIs, RuntimeDescriptor, TerminalAPI, GitAPI, FilesAPI, SettingsAPI, PermissionsAPI, NotificationsAPI, ToolsAPI, SettingsPayload } from '@openchamber/ui/lib/api/types';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

// Mobile runtime descriptor
const mobileRuntime: RuntimeDescriptor = {
  platform: 'web', // Treated as web for UI compatibility
  isDesktop: false,
  isVSCode: false,
  label: 'Mobile',
};

// Stub terminal API - terminal not supported on mobile
const terminalApi: TerminalAPI = {
  createSession: async () => {
    throw new Error('Terminal not supported on mobile');
  },
  connect: () => {
    return { close: () => {} };
  },
  sendInput: async () => {
    throw new Error('Terminal not supported on mobile');
  },
  resize: async () => {},
  close: async () => {},
};

// Stub Git API - git operations happen on remote server
const gitApi: GitAPI = {
  checkIsGitRepository: async () => false,
  getGitStatus: async () => ({
    current: '',
    tracking: null,
    ahead: 0,
    behind: 0,
    files: [],
    isClean: true,
  }),
  getGitDiff: async () => ({ diff: '' }),
  getGitFileDiff: async () => ({ original: '', modified: '', path: '' }),
  revertGitFile: async () => {},
  isLinkedWorktree: async () => false,
  getGitBranches: async () => ({ all: [], current: '', branches: {} }),
  deleteGitBranch: async () => ({ success: false }),
  deleteRemoteBranch: async () => ({ success: false }),
  generateCommitMessage: async () => ({ message: { subject: '', highlights: [] } }),
  listGitWorktrees: async () => [],
  addGitWorktree: async () => ({ success: false, path: '', branch: '' }),
  removeGitWorktree: async () => ({ success: false }),
  ensureOpenChamberIgnored: async () => {},
  createGitCommit: async () => ({
    success: false,
    commit: '',
    branch: '',
    summary: { changes: 0, insertions: 0, deletions: 0 },
  }),
  gitPush: async () => ({ success: false, pushed: [], repo: '', ref: null }),
  gitPull: async () => ({
    success: false,
    summary: { changes: 0, insertions: 0, deletions: 0 },
    files: [],
    insertions: 0,
    deletions: 0,
  }),
  gitFetch: async () => ({ success: false }),
  checkoutBranch: async () => ({ success: false, branch: '' }),
  createBranch: async () => ({ success: false, branch: '' }),
  renameBranch: async () => ({ success: false, branch: '' }),
  getGitLog: async () => ({ all: [], latest: null, total: 0 }),
  getCommitFiles: async () => ({ files: [] }),
  getCurrentGitIdentity: async () => null,
  setGitIdentity: async () => {
    throw new Error('Git identity not supported on mobile');
  },
  getGitIdentities: async () => [],
  createGitIdentity: async () => {
    throw new Error('Git identity not supported on mobile');
  },
  updateGitIdentity: async () => {
    throw new Error('Git identity not supported on mobile');
  },
  deleteGitIdentity: async () => {
    throw new Error('Git identity not supported on mobile');
  },
};

// Stub Files API - file operations happen on remote server
const filesApi: FilesAPI = {
  listDirectory: async () => ({ directory: '', entries: [] }),
  search: async () => [],
  createDirectory: async () => ({ success: false, path: '' }),
};

// Mobile settings API - stores settings locally
const settingsApi: SettingsAPI = {
  load: async () => ({
    settings: {},
    source: 'web' as const,
  }),
  save: async (changes: Partial<SettingsPayload>): Promise<SettingsPayload> => changes as SettingsPayload,
};

// Mobile permissions API
const permissionsApi: PermissionsAPI = {
  requestDirectoryAccess: async () => ({ success: false, error: 'Not supported on mobile' }),
  startAccessingDirectory: async () => ({ success: true }),
  stopAccessingDirectory: async () => ({ success: true }),
};

// Mobile notifications API
const notificationsApi: NotificationsAPI = {
  notifyAgentCompletion: async () => {
    // Trigger haptic feedback for notification
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch {
      // Haptics might not be available
    }
    return true;
  },
  canNotify: () => true,
};

// Tools API - tools are provided by remote server
const toolsApi: ToolsAPI = {
  getAvailableTools: async () => [],
};

export function createMobileAPIs(): RuntimeAPIs {
  return {
    runtime: mobileRuntime,
    terminal: terminalApi,
    git: gitApi,
    files: filesApi,
    settings: settingsApi,
    permissions: permissionsApi,
    notifications: notificationsApi,
    tools: toolsApi,
  };
}
