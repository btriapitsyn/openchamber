import type { RuntimeAPIs } from '@openchamber/ui/lib/api/types';
import { createDesktopTerminalAPI } from './terminal';
import { createDesktopGitAPI } from './git';
import { createDesktopFilesAPI } from './files';
import { createDesktopSettingsAPI } from './settings';
import { createDesktopPermissionsAPI } from './permissions';
import { createDesktopNotificationsAPI } from './notifications';
import { createDesktopPromptEnhancerAPI } from './promptEnhancer';

export const createDesktopAPIs = (): RuntimeAPIs => ({
  runtime: { platform: 'desktop', isDesktop: true, label: 'tauri-bootstrap' },
  terminal: createDesktopTerminalAPI(),
  git: createDesktopGitAPI(),
  files: createDesktopFilesAPI(),
  settings: createDesktopSettingsAPI(),
  permissions: createDesktopPermissionsAPI(),
  notifications: createDesktopNotificationsAPI(),
  promptEnhancer: createDesktopPromptEnhancerAPI(),
});
