import * as vscode from 'vscode';
import { ChatViewProvider } from './ChatViewProvider';
import { createOpenCodeManager, type OpenCodeManager } from './opencode';

let chatViewProvider: ChatViewProvider | undefined;
let openCodeManager: OpenCodeManager | undefined;
let outputChannel: vscode.OutputChannel | undefined;

const SETTINGS_KEY = 'openchamber.settings';

const formatIso = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '(none)';
  try {
    return new Date(value).toISOString();
  } catch {
    return String(value);
  }
};

const formatDurationMs = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '(none)';
  const seconds = Math.round(value / 100) / 10;
  return `${seconds}s`;
};

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('OpenChamber');

  let moveToRightSidebarScheduled = false;

  const isCursorLikeHost = () => /\bcursor\b/i.test(vscode.env.appName);

  const findMoveToRightSidebarCommandId = async (): Promise<string | null> => {
    const commands = await vscode.commands.getCommands(true);

    const preferred = [
      // Newer VS Code naming
      'workbench.action.moveViewToSecondarySideBar',
      'workbench.action.moveViewToSecondarySidebar',
      'workbench.action.moveFocusedViewToSecondarySideBar',
      'workbench.action.moveFocusedViewToSecondarySidebar',

      // Some builds use "Auxiliary Bar" naming
      'workbench.action.moveViewToAuxiliaryBar',
      'workbench.action.moveFocusedViewToAuxiliaryBar',
    ];

    for (const commandId of preferred) {
      if (commands.includes(commandId)) return commandId;
    }

    const fuzzy = commands.find((commandId) => {
      const id = commandId.toLowerCase();
      const looksLikeMoveView = id.includes('workbench.action') && id.includes('move') && id.includes('view');
      if (!looksLikeMoveView) return false;

      // Support both "secondary sidebar" and "auxiliary bar" naming.
      return (id.includes('secondary') && id.includes('side') && id.includes('bar')) || (id.includes('auxiliary') && id.includes('bar'));
    });

    return fuzzy || null;
  };

  const attemptMoveChatToRightSidebar = async (): Promise<'moved' | 'unsupported' | 'failed'> => {
    const moveCommandId = await findMoveToRightSidebarCommandId();
    if (!moveCommandId) return 'unsupported';

    try {
      await vscode.commands.executeCommand('openchamber.chatView.focus');
      await vscode.commands.executeCommand(moveCommandId);
      return 'moved';
    } catch (error) {
      outputChannel?.appendLine(
        `[OpenChamber] Failed moving chat view to right sidebar (command=${moveCommandId}): ${error instanceof Error ? error.message : String(error)}`
      );
      return 'failed';
    }
  };

  const maybeMoveChatToRightSidebarOnStartup = async () => {
    if (isCursorLikeHost()) return;

    const attempted = context.globalState.get<boolean>('openchamber.sidebarAutoMoveAttempted') || false;
    if (attempted) return;
    await context.globalState.update('openchamber.sidebarAutoMoveAttempted', true);

    if (moveToRightSidebarScheduled) return;
    moveToRightSidebarScheduled = true;

    // Defer until after activation to avoid stealing focus during startup.
    setTimeout(() => {
      void (async () => {
        try {
          await attemptMoveChatToRightSidebar();
        } finally {
          moveToRightSidebarScheduled = false;
        }
      })();
    }, 800);
  };

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const tryExecuteCommand = async (commandId: string) => {
    try {
      await vscode.commands.executeCommand(commandId);
      return true;
    } catch {
      return false;
    }
  };

  const togglePrimarySidebar = async () => {
    return await tryExecuteCommand('workbench.action.toggleSidebarVisibility');
  };

  const toggleSecondarySidebar = async () => {
    const candidates = ['workbench.action.toggleSecondarySideBarVisibility', 'workbench.action.toggleAuxiliaryBar'];
    for (const commandId of candidates) {
      if (await tryExecuteCommand(commandId)) return true;
    }
    return false;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('openchamber.openSidebar', async () => {
      const isOpen = chatViewProvider?.isVisible() ?? false;

      // Second click hides the sidebar that currently hosts the chat view.
      if (isOpen) {
        if (isCursorLikeHost()) {
          await togglePrimarySidebar();
          await sleep(50);
          if (chatViewProvider?.isVisible()) {
            await toggleSecondarySidebar();
          }
          return;
        }

        await toggleSecondarySidebar();
        await sleep(50);
        if (chatViewProvider?.isVisible()) {
          await togglePrimarySidebar();
        }
        return;
      }

      // Best-effort: open the container (if available), then focus the chat view.
      try {
        await vscode.commands.executeCommand('workbench.view.extension.openchamber');
      } catch {
        // Ignore: not all VS Code forks expose this command.
      }

      await vscode.commands.executeCommand('openchamber.chatView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('openchamber.focusChat', async () => {
      await vscode.commands.executeCommand('openchamber.chatView.focus');
    })
  );


  // Migration: clear legacy auto-set API URLs (ports 47680-47689 were auto-assigned by older extension versions)
  const config = vscode.workspace.getConfiguration('openchamber');
  const legacyApiUrl = config.get<string>('apiUrl') || '';
  if (/^https?:\/\/localhost:4768\d\/?$/.test(legacyApiUrl.trim())) {
    await config.update('apiUrl', '', vscode.ConfigurationTarget.Global);
  }

  // Create OpenCode manager first
  openCodeManager = createOpenCodeManager(context);

  // Create chat view provider with manager reference
  // The webview will show a loading state until OpenCode is ready
  chatViewProvider = new ChatViewProvider(context, context.extensionUri, openCodeManager);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatViewProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  void maybeMoveChatToRightSidebarOnStartup();

  context.subscriptions.push(
    vscode.commands.registerCommand('openchamber.restartApi', async () => {
      try {
        await openCodeManager?.restart();
        vscode.window.showInformationMessage('OpenChamber: API connection restarted');
      } catch (e) {
        vscode.window.showErrorMessage(`OpenChamber: Failed to restart API - ${e}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('openchamber.addToContext', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('OpenChamber [Add to Context]:No active editor');
        return;
      }

      const selection = editor.selection;
      const selectedText = editor.document.getText(selection);

      if (!selectedText) {
        vscode.window.showWarningMessage('OpenChamber [Add to Context]: No text selected');
        return;
      }

      // Get file info for context
      const filePath = vscode.workspace.asRelativePath(editor.document.uri);
      const languageId = editor.document.languageId;
      
      // Get line numbers (1-based for display)
      const startLine = selection.start.line + 1;
      const endLine = selection.end.line + 1;
      const lineRange = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;

      // Format as file path with line numbers, followed by markdown code block
      const contextText = `${filePath}:${lineRange}\n\`\`\`${languageId}\n${selectedText}\n\`\`\``;

      // Send to webview and reveal the panel
      chatViewProvider?.addTextToInput(contextText);

      // Focus the chat panel
      vscode.commands.executeCommand('openchamber.focusChat');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('openchamber.explain', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('OpenChamber [Explain]: No active editor');
        return;
      }

      const selection = editor.selection;
      const selectedText = editor.document.getText(selection);
      const filePath = vscode.workspace.asRelativePath(editor.document.uri);
      const languageId = editor.document.languageId;

      let prompt: string;

      if (selectedText) {
        // Selection exists - explain the selected code
        const startLine = selection.start.line + 1;
        const endLine = selection.end.line + 1;
        const lineRange = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
        prompt = `Explain the following Code / Text:\n\n${filePath}:${lineRange}\n\`\`\`${languageId}\n${selectedText}\n\`\`\``;
      } else {
        // No selection - explain the entire file
        prompt = `Explain the following Code / Text:\n\n${filePath}`;
      }

      // Create new session and send the prompt
      chatViewProvider?.createNewSessionWithPrompt(prompt);
      vscode.commands.executeCommand('openchamber.focusChat');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('openchamber.improveCode', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('OpenChamber [Improve Code]: No active editor');
        return;
      }

      const selection = editor.selection;
      const selectedText = editor.document.getText(selection);

      if (!selectedText) {
        vscode.window.showWarningMessage('OpenChamber [Improve Code]: No text selected');
        return;
      }

      const filePath = vscode.workspace.asRelativePath(editor.document.uri);
      const languageId = editor.document.languageId;
      const startLine = selection.start.line + 1;
      const endLine = selection.end.line + 1;
      const lineRange = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;

      const prompt = `Improve the following Code:\n\n${filePath}:${lineRange}\n\`\`\`${languageId}\n${selectedText}\n\`\`\``;

      // Create new session and send the prompt
      chatViewProvider?.createNewSessionWithPrompt(prompt);
      vscode.commands.executeCommand('openchamber.focusChat');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('openchamber.newSession', () => {
      chatViewProvider?.createNewSession();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('openchamber.showSettings', () => {
      chatViewProvider?.showSettings();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('openchamber.showOpenCodeStatus', async () => {
      const config = vscode.workspace.getConfiguration('openchamber');
      const configuredApiUrl = (config.get<string>('apiUrl') || '').trim();

      const extensionVersion = String(context.extension?.packageJSON?.version || '');
      const workspaceFolders = (vscode.workspace.workspaceFolders || []).map((folder) => folder.uri.fsPath);

      const debug = openCodeManager?.getDebugInfo();
      const resolvedApiUrl = openCodeManager?.getApiUrl();
      const workingDirectory = openCodeManager?.getWorkingDirectory() ?? '';

      const safeFetch = async (input: string, timeoutMs = 2500) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const startedAt = Date.now();
        try {
          const resp = await fetch(input, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });
          const elapsedMs = Date.now() - startedAt;
          const contentType = resp.headers.get('content-type') || '';

          let summary = '';
          if (contentType.includes('application/json')) {
            const json = await resp.json().catch(() => null);
            if (Array.isArray(json)) {
              summary = `json[array] len=${json.length}`;
            } else if (json && typeof json === 'object') {
              const keys = Object.keys(json).slice(0, 8);
              summary = `json[object] keys=${keys.join(',')}${Object.keys(json).length > keys.length ? ',…' : ''}`;
            } else {
              summary = `json[${typeof json}]`;
            }
          } else {
            summary = contentType ? `content-type=${contentType}` : 'no content-type';
          }

          return { ok: resp.ok, status: resp.status, elapsedMs, summary };
        } catch (error) {
          const elapsedMs = Date.now() - startedAt;
          const isAbort =
            controller.signal.aborted ||
            (error instanceof Error && (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted')));
          const message = isAbort
            ? `timeout after ${timeoutMs}ms`
            : error instanceof Error
              ? error.message
              : String(error);
          return { ok: false, status: 0, elapsedMs, summary: `error=${message}` };
        } finally {
          clearTimeout(timeout);
        }
      };

      const buildProbeUrl = (pathname: string, includeDirectory = true) => {
        if (!resolvedApiUrl) return null;
        const base = `${resolvedApiUrl.replace(/\/+$/, '')}/`;
        const url = new URL(pathname.replace(/^\/+/, ''), base);
        if (includeDirectory && workingDirectory) {
          url.searchParams.set('directory', workingDirectory);
        }
        return url.toString();
      };

      const probeTargets: Array<{ label: string; path: string; includeDirectory?: boolean; timeoutMs?: number }> = [
        { label: 'config', path: '/config', includeDirectory: true },
        { label: 'providers', path: '/config/providers', includeDirectory: true },
        // Can be slower on large configs; keep the probe from producing false negatives.
        { label: 'agents', path: '/agent', includeDirectory: true, timeoutMs: 8000 },
        { label: 'commands', path: '/command', includeDirectory: true },
        { label: 'project', path: '/project/current', includeDirectory: true },
        { label: 'path', path: '/path', includeDirectory: true },
        { label: 'sessionStatus', path: '/session/status', includeDirectory: true },
      ];

      const probes = resolvedApiUrl
        ? await Promise.all(
            probeTargets.map(async (entry) => {
              const url = buildProbeUrl(entry.path, entry.includeDirectory !== false);
              if (!url) {
                return { label: entry.label, url: '(none)', result: null as null };
              }
              const result = await safeFetch(url, typeof entry.timeoutMs === 'number' ? entry.timeoutMs : undefined);
              return { label: entry.label, url, result };
            })
          )
        : [];

      const storedSettings = context.globalState.get<Record<string, unknown>>(SETTINGS_KEY) || {};
      const settingsKeys = Object.keys(storedSettings).filter((key) => key !== 'lastDirectory');

      const lines = [
        `Time: ${new Date().toISOString()}`,
        `OpenChamber version: ${extensionVersion || '(unknown)'}`,
        `VS Code version: ${vscode.version}`,
        `Platform: ${process.platform} ${process.arch}`,
        `Workspace folders: ${workspaceFolders.length}${workspaceFolders.length ? ` (${workspaceFolders.join(', ')})` : ''}`,
        `Status: ${openCodeManager?.getStatus() ?? 'unknown'}`,
        `CLI available: ${openCodeManager?.isCliAvailable() ?? false}`,
        `Working directory: ${openCodeManager?.getWorkingDirectory() ?? ''}`,
        `API URL (configured): ${configuredApiUrl || '(none)'}`,
        `API URL (resolved): ${openCodeManager?.getApiUrl() ?? '(none)'}`,
        debug
          ? `OpenCode mode: ${debug.mode} (starts=${debug.startCount}, restarts=${debug.restartCount})`
          : `OpenCode mode: (unknown)`,
        debug
          ? `OpenCode CLI path: ${debug.cliPath || '(not found)'}`
          : `OpenCode CLI path: (unknown)`,
        debug
          ? `OpenCode detected port: ${debug.detectedPort ?? '(none)'}`
          : `OpenCode detected port: (unknown)`,
        debug
          ? `OpenCode API prefix: ${debug.apiPrefixDetected ? (debug.apiPrefix || '(root)') : '(unknown)'}`
          : `OpenCode API prefix: (unknown)`,
        debug
          ? `Last start: ${formatIso(debug.lastStartAt)}`
          : `Last start: (unknown)`,
        debug
          ? `Last connected: ${formatIso(debug.lastConnectedAt)}`
          : `Last connected: (unknown)`,
        debug && debug.lastConnectedAt ? `Connected for: ${formatDurationMs(Date.now() - debug.lastConnectedAt)}` : `Connected for: (n/a)`,
        debug && debug.lastExitCode !== null ? `Last exit code: ${debug.lastExitCode}` : `Last exit code: (none)`,
        debug?.lastError ? `Last error: ${debug.lastError}` : `Last error: (none)`,
        `Settings keys (stored): ${settingsKeys.length ? settingsKeys.join(', ') : '(none)'}`,
        probes.length ? '' : '',
        ...(probes.length
          ? [
              'OpenCode API probes:',
              ...probes.map((probe) => {
                if (!probe.result) return `- ${probe.label}: (no url)`;
                const { ok, status, elapsedMs, summary } = probe.result;
                const suffix = ok ? '' : ` url=${probe.url}`;
                return `- ${probe.label}: ${ok ? 'ok' : 'fail'} status=${status} time=${elapsedMs}ms ${summary}${suffix}`;
              }),
            ]
          : []),
        '',
      ];

      outputChannel?.appendLine(lines.join('\n'));
      outputChannel?.show(true);
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme((theme) => {
      chatViewProvider?.updateTheme(theme.kind);
    })
  );

  // Theme changes can update the `workbench.colorTheme` setting slightly after the
  // `activeColorTheme` event. Listen for config changes too so we can re-resolve
  // the contributed theme JSON and update Shiki themes in the webview.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('workbench.colorTheme') ||
        event.affectsConfiguration('workbench.preferredLightColorTheme') ||
        event.affectsConfiguration('workbench.preferredDarkColorTheme')
      ) {
        chatViewProvider?.updateTheme(vscode.window.activeColorTheme.kind);
      }
    })
  );

  // Subscribe to status changes - this broadcasts to webview
  context.subscriptions.push(
    openCodeManager.onStatusChange((status, error) => {
      chatViewProvider?.updateConnectionStatus(status, error);
    })
  );

  // Start OpenCode API without blocking activation.
  // Blocking here delays webview resolution and causes a blank panel until startup completes.
  void openCodeManager.start();
}

export async function deactivate() {
  await openCodeManager?.stop();
  openCodeManager = undefined;
  chatViewProvider = undefined;
  outputChannel?.dispose();
  outputChannel = undefined;
}
