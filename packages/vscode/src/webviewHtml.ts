import * as vscode from 'vscode';
import { getThemeKindName } from './theme';
import type { ConnectionStatus } from './opencode';

export type PanelType = 'chat' | 'agentManager';

export interface WebviewHtmlOptions {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  workspaceFolder: string;
  initialStatus: ConnectionStatus;
  cliAvailable: boolean;
  panelType?: PanelType;
  initialSessionId?: string;
  viewMode?: 'sidebar' | 'editor';
}

export function getWebviewHtml(options: WebviewHtmlOptions): string {
  const {
    webview,
    extensionUri,
    workspaceFolder,
    initialStatus,
    cliAvailable,
    panelType = 'chat',
    initialSessionId,
    viewMode = 'sidebar',
  } = options;

  const scriptPath = vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'assets', 'index.js');
  const scriptUri = webview.asWebviewUri(scriptPath);

  const themeKind = getThemeKindName(vscode.window.activeColorTheme.kind);

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
      cliAvailable: ${cliAvailable},
      panelType: "${panelType}",
      viewMode: "${viewMode}",
      initialSessionId: ${initialSessionId ? `"${initialSessionId.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : 'null'},
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
