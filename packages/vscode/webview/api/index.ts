import type { RuntimeAPIs, TerminalAPI, GitAPI, NotificationsAPI } from '@openchamber/ui/lib/api/types';
import { createVSCodeFilesAPI } from './files';
import { createVSCodeSettingsAPI } from './settings';
import { createVSCodePermissionsAPI } from './permissions';
import { createVSCodeToolsAPI } from './tools';
import { createVSCodeEditorAPI } from './editor';

// Stub APIs return sensible defaults instead of throwing
const createStubTerminalAPI = (): TerminalAPI => ({
  createSession: async () => ({ sessionId: '', cols: 80, rows: 24 }),
  connect: () => ({ close: () => {} }),
  sendInput: async () => {},
  resize: async () => {},
  close: async () => {},
});

const createStubGitAPI = (): GitAPI => ({
  checkIsGitRepository: async () => false,
  getGitStatus: async () => ({ current: '', tracking: null, ahead: 0, behind: 0, files: [], isClean: true }),
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
  createGitCommit: async () => ({ success: false, commit: '', branch: '', summary: { changes: 0, insertions: 0, deletions: 0 } }),
  gitPush: async () => ({ success: false, pushed: [], repo: '', ref: null }),
  gitPull: async () => ({ success: false, summary: { changes: 0, insertions: 0, deletions: 0 }, files: [], insertions: 0, deletions: 0 }),
  gitFetch: async () => ({ success: false }),
  checkoutBranch: async () => ({ success: false, branch: '' }),
  createBranch: async () => ({ success: false, branch: '' }),
  getGitLog: async () => ({ all: [], latest: null, total: 0 }),
  getCommitFiles: async () => ({ files: [] }),
  getCurrentGitIdentity: async () => null,
  setGitIdentity: async () => ({ success: false, profile: { id: '', name: '', userName: '', userEmail: '' } }),
  getGitIdentities: async () => [],
  createGitIdentity: async (p) => p,
  updateGitIdentity: async (_, p) => p,
  deleteGitIdentity: async () => {},
});

const createStubNotificationsAPI = (): NotificationsAPI => ({
  notifyAgentCompletion: async () => true,
  canNotify: () => true,
});

export const createVSCodeAPIs = (): RuntimeAPIs => ({
  runtime: { platform: 'vscode', isDesktop: false, isVSCode: true, label: 'VS Code Extension' },
  terminal: createStubTerminalAPI(),
  git: createStubGitAPI(),
  files: createVSCodeFilesAPI(),
  settings: createVSCodeSettingsAPI(),
  permissions: createVSCodePermissionsAPI(),
  notifications: createStubNotificationsAPI(),
  tools: createVSCodeToolsAPI(),
  editor: createVSCodeEditorAPI(),
});
