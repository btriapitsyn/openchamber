import type { RuntimeAPIs } from '@openchamber/ui/lib/api/types';
import { createWebTerminalAPI } from './terminal';
import { createWebGitAPI } from './git';
import { createWebFilesAPI } from './files';
import { createWebSettingsAPI } from './settings';
import { createWebPermissionsAPI } from './permissions';
import { createWebNotificationsAPI } from './notifications';
import { createWebToolsAPI } from './tools';
import { createWebPushAPI } from './push';

export const createWebAPIs = (): RuntimeAPIs => ({
  runtime: { platform: 'web', isDesktop: false, isVSCode: false, label: 'web' },
  terminal: createWebTerminalAPI(),
  git: createWebGitAPI(),
  files: createWebFilesAPI(),
  settings: createWebSettingsAPI(),
  permissions: createWebPermissionsAPI(),
  notifications: createWebNotificationsAPI(),
  push: createWebPushAPI(),
  tools: createWebToolsAPI(),
});
