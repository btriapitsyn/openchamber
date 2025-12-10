import * as vscode from 'vscode';
import { ChatViewProvider } from './ChatViewProvider';
import { createOpenCodeManager, type OpenCodeManager } from './opencode';

let chatViewProvider: ChatViewProvider | undefined;
let openCodeManager: OpenCodeManager | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Create OpenCode manager first
  openCodeManager = createOpenCodeManager(context);

  // Create chat view provider with manager reference
  chatViewProvider = new ChatViewProvider(context, context.extensionUri, openCodeManager);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatViewProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('openchamber.newSession', () => {
      chatViewProvider?.newSession();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('openchamber.focusChat', () => {
      vscode.commands.executeCommand('openchamber.chatView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('openchamber.restartApi', async () => {
      await openCodeManager?.restart();
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('openchamber.showInSecondarySidebar', async () => {
      const viewId = ChatViewProvider.viewType;
      const isVisible = chatViewProvider?.isVisible() === true;

      if (isVisible) {
        await vscode.commands.executeCommand('workbench.action.toggleAuxiliaryBar');
        return;
      }

      await vscode.commands.executeCommand('workbench.action.focusAuxiliaryBar');
      await vscode.commands.executeCommand(`${viewId}.focus`);
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme((theme) => {
      chatViewProvider?.updateTheme(theme.kind);
    })
  );

  // Subscribe to status changes
  context.subscriptions.push(
    openCodeManager.onStatusChange((status, error) => {
      chatViewProvider?.updateConnectionStatus(status, error);
    })
  );

  // Auto-start OpenCode API
  openCodeManager.start();
}

export function deactivate() {
  openCodeManager?.stop();
  openCodeManager = undefined;
  chatViewProvider = undefined;
}
