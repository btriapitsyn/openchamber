import type { RuntimeAPIs, RuntimePlatform } from '@openchamber/ui/lib/api/types';
import { createWebTerminalAPI } from './terminal';
import { createWebGitAPI } from './git';
import { createWebFilesAPI } from './files';
import { createWebSettingsAPI } from './settings';
import { createWebPermissionsAPI } from './permissions';
import { createWebNotificationsAPI } from './notifications';
import { createWebToolsAPI } from './tools';
import { createWebPushAPI } from './push';
import { createWebGitHubAPI } from './github';

const resolveRuntimePlatform = (): RuntimePlatform => {
  const candidate = import.meta.env.VITE_RUNTIME_PLATFORM;
  if (candidate === 'desktop' || candidate === 'mobile' || candidate === 'vscode' || candidate === 'web') {
    return candidate;
  }
  return 'web';
};

export const createWebAPIs = (): RuntimeAPIs => {
  const platform = resolveRuntimePlatform();

  return {
    runtime: { platform, isDesktop: false, isVSCode: false, label: platform },
  terminal: createWebTerminalAPI(),
  git: createWebGitAPI(),
  files: createWebFilesAPI(),
  settings: createWebSettingsAPI(),
  permissions: createWebPermissionsAPI(),
  notifications: createWebNotificationsAPI(),
  github: createWebGitHubAPI(),
  push: createWebPushAPI(),
  tools: createWebToolsAPI(),
  };
};
