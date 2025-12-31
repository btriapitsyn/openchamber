import * as vscode from 'vscode';
import { handleBridgeMessage, type BridgeRequest, type BridgeResponse } from './bridge';
import { getThemeKindName } from './theme';
import type { OpenCodeManager, ConnectionStatus } from './opencode';
import { getWebviewShikiThemes } from './shikiThemes';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'openchamber.chatView';

  private _view?: vscode.WebviewView;

  public isVisible() {
    return this._view?.visible ?? false;
  }

  // Cache latest status/URL for when webview is resolved after connection is ready
  private _cachedStatus: ConnectionStatus = 'connecting';
  private _cachedError?: string;
  private _sseCounter = 0;
  private _sseStreams = new Map<string, AbortController>();

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _extensionUri: vscode.Uri,
    private readonly _openCodeManager?: OpenCodeManager
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView
  ) {
    this._view = webviewView;

    const distUri = vscode.Uri.joinPath(this._extensionUri, 'dist');

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri, distUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    // Send theme payload (including optional Shiki theme JSON) after the webview is set up.
    void this.updateTheme(vscode.window.activeColorTheme.kind);
    
    // Send cached connection status and API URL (may have been set before webview was resolved)
    this._sendCachedState();

    webviewView.webview.onDidReceiveMessage(async (message: BridgeRequest) => {
      if (message.type === 'restartApi') {
        await this._openCodeManager?.restart();
        return;
      }

      if (message.type === 'api:sse:start') {
        const response = await this._startSseProxy(message);
        webviewView.webview.postMessage(response);
        return;
      }

      if (message.type === 'api:sse:stop') {
        const response = await this._stopSseProxy(message);
        webviewView.webview.postMessage(response);
        return;
      }

      const response = await handleBridgeMessage(message, {
        manager: this._openCodeManager,
        context: this._context,
      });
      webviewView.webview.postMessage(response);
    });
  }

  public updateTheme(kind: vscode.ColorThemeKind) {
    if (this._view) {
      const themeKind = getThemeKindName(kind);
      void getWebviewShikiThemes().then((shikiThemes) => {
        this._view?.webview.postMessage({
          type: 'themeChange',
          theme: { kind: themeKind, shikiThemes },
        });
      });
    }
  }

  public updateConnectionStatus(status: ConnectionStatus, error?: string) {
    // Cache the latest state
    this._cachedStatus = status;
    this._cachedError = error;
    
    // Send to webview if it exists
    this._sendCachedState();
  }

  public addTextToInput(text: string) {
    if (this._view) {
      // Reveal the webview panel
      this._view.show(true);
      
      this._view.webview.postMessage({
        type: 'command',
        command: 'addToContext',
        payload: { text }
      });
    }
  }

  public createNewSessionWithPrompt(prompt: string) {
    if (this._view) {
      // Reveal the webview panel
      this._view.show(true);
      
      this._view.webview.postMessage({
        type: 'command',
        command: 'createSessionWithPrompt',
        payload: { prompt }
      });
    }
  }

  public createNewSession() {
    if (this._view) {
      // Reveal the webview panel
      this._view.show(true);
      
      this._view.webview.postMessage({
        type: 'command',
        command: 'newSession'
      });
    }
  }

  public showSettings() {
    if (this._view) {
      // Reveal the webview panel
      this._view.show(true);
      
      this._view.webview.postMessage({
        type: 'command',
        command: 'showSettings'
      });
    }
  }
  
  private _sendCachedState() {
    if (!this._view) {
      return;
    }
    
    this._view.webview.postMessage({
      type: 'connectionStatus',
      status: this._cachedStatus,
      error: this._cachedError,
    });
  }

  private _buildSseHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...(extra || {}),
    };
  }

  private _collectHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  private async _startSseProxy(message: BridgeRequest): Promise<BridgeResponse> {
    const { id, type, payload } = message;
    const apiBaseUrl = this._openCodeManager?.getApiUrl();

    const { path, headers } = (payload || {}) as { path?: string; headers?: Record<string, string> };
    const normalizedPath = typeof path === 'string' && path.trim().length > 0 ? path.trim() : '/event';

    if (!apiBaseUrl) {
      return {
        id,
        type,
        success: true,
        data: { status: 503, headers: { 'content-type': 'application/json' }, streamId: null },
      };
    }

    const streamId = `sse_${++this._sseCounter}_${Date.now()}`;
    const controller = new AbortController();

    const base = `${apiBaseUrl.replace(/\/+$/, '')}/`;
    const targetUrl = new URL(normalizedPath.replace(/^\/+/, ''), base).toString();

    let response: Response;
    try {
      response = await fetch(targetUrl, {
        method: 'GET',
        headers: this._buildSseHeaders(headers || {}),
        signal: controller.signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        id,
        type,
        success: true,
        data: { status: 502, headers: { 'content-type': 'application/json' }, streamId: null, error: message },
      };
    }

    const responseHeaders = this._collectHeaders(response.headers);
    const responseBody = response.body;
    if (!response.ok || !responseBody) {
      return {
        id,
        type,
        success: true,
        data: {
          status: response.status,
          headers: responseHeaders,
          streamId: null,
          error: `SSE failed: ${response.status}`,
        },
      };
    }

    this._sseStreams.set(streamId, controller);

    (async () => {
      try {
        const reader = responseBody.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (controller.signal.aborted) break;
            if (value && value.length > 0) {
              const chunk = decoder.decode(value, { stream: true });
              if (!chunk) continue;

              // Reduce webview message pressure by forwarding complete SSE blocks.
              // The SDK SSE parser is block-based (\n\n delimited) and can consume
              // partial chunks, but VS Code's postMessage channel can be a bottleneck.
              sseBuffer += chunk;
              const blocks = sseBuffer.split('\n\n');
              sseBuffer = blocks.pop() ?? '';
              if (blocks.length > 0) {
                const joined = blocks.map((block) => `${block}\n\n`).join('');
                this._view?.webview.postMessage({ type: 'api:sse:chunk', streamId, chunk: joined });
              }
            }
          }

          const tail = decoder.decode();
          if (tail) {
            sseBuffer += tail;
          }
          if (sseBuffer) {
            this._view?.webview.postMessage({ type: 'api:sse:chunk', streamId, chunk: sseBuffer });
          }
        } finally {
          try {
            reader.releaseLock();
          } catch {
            // ignore
          }
        }

        this._view?.webview.postMessage({ type: 'api:sse:end', streamId });
      } catch (error) {
        if (!controller.signal.aborted) {
          const message = error instanceof Error ? error.message : String(error);
          this._view?.webview.postMessage({ type: 'api:sse:end', streamId, error: message });
        }
      } finally {
        this._sseStreams.delete(streamId);
      }
    })();

    return {
      id,
      type,
      success: true,
      data: {
        status: response.status,
        headers: responseHeaders,
        streamId,
      },
    };
  }

  private async _stopSseProxy(message: BridgeRequest): Promise<BridgeResponse> {
    const { id, type, payload } = message;
    const { streamId } = (payload || {}) as { streamId?: string };
    if (typeof streamId === 'string' && streamId.length > 0) {
      const controller = this._sseStreams.get(streamId);
      if (controller) {
        controller.abort();
        this._sseStreams.delete(streamId);
      }
    }
    return { id, type, success: true, data: { stopped: true } };
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptPath = vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'index.js');
    const scriptUri = webview.asWebviewUri(scriptPath);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const themeKind = getThemeKindName(vscode.window.activeColorTheme.kind);
    // Use cached values which are updated by onStatusChange callback
    const initialStatus = this._cachedStatus;
    const cliAvailable = this._openCodeManager?.isCliAvailable() ?? false;

    // Use VS Code CSS variables for proper theme integration
    // These variables are automatically provided by VS Code to webviews
    // 
    // Logo geometry matches OpenChamberLogo.tsx:
    // edge=48, cos30=0.866, sin30=0.5, centerY=50
    // top=(50, 2), left=(8.432, 26), right=(91.568, 26), center=(50, 50)
    // bottomLeft=(8.432, 74), bottomRight=(91.568, 74), bottom=(50, 98)
    // topFaceCenterY = (2 + 26 + 50 + 26) / 4 = 26
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline' 'unsafe-eval'; connect-src * ws: wss: http: https:; img-src ${webview.cspSource} data: https:; font-src ${webview.cspSource} data:;">
  <style>
    html, body, #root { height: 100%; width: 100%; margin: 0; padding: 0; }
    body { 
      overflow: hidden; 
      background: var(--vscode-editor-background, var(--vscode-sideBar-background)); 
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      color: var(--vscode-foreground);
    }
    
    /* Initial loading screen styles - uses VS Code theme variables */
    #initial-loading {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      z-index: 9999;
      background: var(--vscode-editor-background, var(--vscode-sideBar-background));
      transition: opacity 0.3s ease-out;
    }
    #initial-loading.fade-out {
      opacity: 0;
      pointer-events: none;
    }
    /* Logo colors use VS Code foreground color */
    #initial-loading .logo-stroke {
      stroke: var(--vscode-foreground);
    }
    #initial-loading .logo-fill {
      fill: var(--vscode-foreground);
      opacity: 0.15;
    }
    #initial-loading .logo-fill-solid {
      fill: var(--vscode-foreground);
    }
    #initial-loading .logo-fill-dim {
      fill: var(--vscode-foreground);
      opacity: 0.4;
    }
    /* Animation on inner logo only, like OpenChamberLogo.tsx */
    #initial-loading .logo-inner {
      animation: logoPulse 3s ease-in-out infinite;
    }
    #initial-loading .status-text {
      font-size: 13px;
      color: var(--vscode-descriptionForeground, var(--vscode-foreground));
      text-align: center;
    }
    #initial-loading .error-text {
      font-size: 12px;
      color: var(--vscode-errorForeground, #f48771);
      text-align: center;
      max-width: 280px;
    }
    @keyframes logoPulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }
  </style>
  <title>OpenChamber</title>
</head>
<body>
  <!-- Initial loading screen with simplified OpenChamber logo -->
  <div id="initial-loading">
    <svg class="logo" width="70" height="70" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Left face -->
      <path class="logo-fill logo-stroke" d="M50 50 L8.432 26 L8.432 74 L50 98 Z" stroke-width="2" stroke-linejoin="round"/>
      <!-- Right face -->
      <path class="logo-fill logo-stroke" d="M50 50 L91.568 26 L91.568 74 L50 98 Z" stroke-width="2" stroke-linejoin="round"/>
      <!-- Top face (no fill, stroke only) -->
      <path class="logo-stroke" d="M50 2 L8.432 26 L50 50 L91.568 26 Z" fill="none" stroke-width="2" stroke-linejoin="round"/>
      
      <!-- OpenCode logo on top face with pulse animation -->
      <g class="logo-inner" transform="matrix(0.866, 0.5, -0.866, 0.5, 50, 26) scale(0.75)">
        <path class="logo-fill-solid" fill-rule="evenodd" clip-rule="evenodd" d="M-16 -20 L16 -20 L16 20 L-16 20 Z M-8 -12 L-8 12 L8 12 L8 -12 Z"/>
        <path class="logo-fill-dim" d="M-8 -4 L8 -4 L8 12 L-8 12 Z"/>
      </g>
    </svg>
    <div class="status-text" id="loading-status">
      ${initialStatus === 'connecting' ? 'Starting OpenCode API…' : initialStatus === 'connected' ? 'Initializing…' : 'Connecting…'}
    </div>
    ${!cliAvailable ? `<div class="error-text">OpenCode CLI not found. Please install it first.</div>` : ''}
  </div>
  
  <div id="root"></div>
  <script>
    // Polyfill process for Node.js modules running in browser
    window.process = window.process || { env: { NODE_ENV: 'production' }, platform: '', version: '', browser: true };

    window.__VSCODE_CONFIG__ = {
      workspaceFolder: "${workspaceFolder.replace(/\\/g, '\\\\')}",
      theme: "${themeKind}",
      connectionStatus: "${initialStatus}",
      cliAvailable: ${cliAvailable}
    };
    window.__OPENCHAMBER_HOME__ = "${workspaceFolder.replace(/\\/g, '\\\\')}";
    
    // Handle connection status updates to update loading screen
    window.addEventListener('message', function(event) {
      var msg = event.data;
      if (msg && msg.type === 'connectionStatus') {
        var statusEl = document.getElementById('loading-status');
        if (statusEl) {
          if (msg.status === 'connecting') {
            statusEl.textContent = 'Starting OpenCode API…';
            statusEl.classList.remove('error-text');
          } else if (msg.status === 'connected') {
            statusEl.textContent = 'Connected!';
            statusEl.classList.remove('error-text');
          } else if (msg.status === 'error') {
            statusEl.textContent = msg.error || 'Connection error';
            statusEl.classList.add('error-text');
          } else {
            statusEl.textContent = 'Reconnecting…';
            statusEl.classList.remove('error-text');
          }
        }
      }
    });
  </script>
  <script type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
