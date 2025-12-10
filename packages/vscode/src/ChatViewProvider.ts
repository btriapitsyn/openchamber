import * as vscode from 'vscode';
import { handleBridgeMessage, type BridgeRequest } from './bridge';
import { getThemeKindName } from './theme';
import type { OpenCodeManager, ConnectionStatus } from './opencode';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'openchamber.chatView';

  private _view?: vscode.WebviewView;
  private _isVisible = false;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _extensionUri: vscode.Uri,
    private readonly _openCodeManager?: OpenCodeManager
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView
  ) {
    this._view = webviewView;
    this._isVisible = webviewView.visible;

    webviewView.onDidChangeVisibility(() => {
      this._isVisible = webviewView.visible;
    });

    const distUri = vscode.Uri.joinPath(this._extensionUri, 'dist');

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri, distUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message: BridgeRequest) => {
      if (message.type === 'restartApi') {
        await this._openCodeManager?.restart();
        return;
      }
      const response = await handleBridgeMessage(message, {
        manager: this._openCodeManager,
        context: this._context,
      });
      webviewView.webview.postMessage(response);
    });
  }

  public newSession() {
    if (this._view) {
      this._view.webview.postMessage({ type: 'command', command: 'newSession' });
    }
  }

  public updateTheme(kind: vscode.ColorThemeKind) {
    if (this._view) {
      const themeKind = getThemeKindName(kind);
      this._view.webview.postMessage({
        type: 'themeChange',
        theme: { kind: themeKind },
      });
    }
  }

  public updateConnectionStatus(status: ConnectionStatus, error?: string) {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'connectionStatus',
        status,
        error,
      });
    }
  }

  public isVisible(): boolean {
    return this._isVisible;
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptPath = vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'index.js');
    const scriptUri = webview.asWebviewUri(scriptPath);

    const config = vscode.workspace.getConfiguration('openchamber');
    const apiUrl = this._openCodeManager?.getApiUrl() || config.get<string>('apiUrl') || 'http://localhost:47339';
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const themeKind = getThemeKindName(vscode.window.activeColorTheme.kind);
    const initialStatus = this._openCodeManager?.getStatus() || 'disconnected';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline' 'unsafe-eval'; connect-src * ws: wss: http: https:; img-src ${webview.cspSource} data: https:; font-src ${webview.cspSource} data:;">
  <style>
    html, body, #root { height: 100%; width: 100%; }
    body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
  </style>
  <title>OpenChamber</title>
</head>
<body>
  <div id="root"></div>
  <script>
    // Polyfill process for Node.js modules running in browser
    window.process = window.process || { env: { NODE_ENV: 'production' }, platform: '', version: '', browser: true };

    window.__VSCODE_CONFIG__ = {
      apiUrl: "${apiUrl}",
      workspaceFolder: "${workspaceFolder.replace(/\\/g, '\\\\')}",
      theme: "${themeKind}",
      connectionStatus: "${initialStatus}"
    };
    window.__OPENCHAMBER_HOME__ = "${workspaceFolder.replace(/\\/g, '\\\\')}";
  </script>
  <script type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
