import type { RuntimeAPIs, TerminalHandlers } from '@openchamber/ui/lib/api/types';
import { createDesktopTerminalAPI } from './terminal';
import { createDesktopGitAPI } from './git';
import { createDesktopFilesAPI } from './files';
import { createDesktopSettingsAPI } from './settings';
import { createDesktopPermissionsAPI } from './permissions';
import { createDesktopDiagnosticsAPI } from './diagnostics';
import { createDesktopNotificationsAPI } from './notifications';
import { createDesktopToolsAPI } from './tools';

const activeTerminalConnections = new Set<string>();

export const createDesktopAPIs = (): RuntimeAPIs & { cleanup?: () => void } => {
  const terminalAPI = createDesktopTerminalAPI();
  const originalConnect = terminalAPI.connect.bind(terminalAPI);

  const wrappedTerminalAPI = {
    ...terminalAPI,
    connect: (sessionId: string, handlers: TerminalHandlers) => {
      activeTerminalConnections.add(sessionId);
      const connection = originalConnect(sessionId, handlers);

      const originalClose = connection.close;
      return {
        ...connection,
        close: () => {
          activeTerminalConnections.delete(sessionId);
          originalClose();
        },
      };
    },
  };

  return {
    runtime: { platform: 'desktop', isDesktop: true, isVSCode: false, label: 'tauri-bootstrap' },
    terminal: wrappedTerminalAPI,
    git: createDesktopGitAPI(),
    files: createDesktopFilesAPI(),
    settings: createDesktopSettingsAPI(),
    permissions: createDesktopPermissionsAPI(),
    notifications: createDesktopNotificationsAPI(),
    diagnostics: createDesktopDiagnosticsAPI(),
    tools: createDesktopToolsAPI(),
    cleanup: () => {
      console.info('[DesktopAPIs] Performing cleanup...');

      const activeConnections = Array.from(activeTerminalConnections);
      activeConnections.forEach(sessionId => {
        console.info(`[DesktopAPIs] Closing terminal session: ${sessionId}`);

        activeTerminalConnections.delete(sessionId);
      });

      console.info(`[DesktopAPIs] Cleanup completed, closed ${activeConnections.length} terminal connections`);
    },
  };
};
