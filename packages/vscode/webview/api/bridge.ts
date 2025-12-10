declare const acquireVsCodeApi: () => {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

interface VSCodeAPI {
  postMessage: (message: unknown) => void;
}

let vscodeApi: VSCodeAPI | null = null;

function getVSCodeAPI(): VSCodeAPI {
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi();
  }
  return vscodeApi;
}

// Export vscode API for direct use
export const vscode = {
  postMessage: (message: unknown) => getVSCodeAPI().postMessage(message),
};

interface BridgeRequest {
  id: string;
  type: string;
  payload?: unknown;
}

interface BridgeResponse {
  id: string;
  type: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

const pendingRequests = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}>();

let requestIdCounter = 0;

window.addEventListener('message', (event: MessageEvent<BridgeResponse>) => {
  const response = event.data;
  if (!response || typeof response.id !== 'string') return;

  const pending = pendingRequests.get(response.id);
  if (pending) {
    pendingRequests.delete(response.id);
    if (response.success) {
      pending.resolve(response.data);
    } else {
      pending.reject(new Error(response.error || 'Unknown error'));
    }
  }
});

export function sendBridgeMessage<T = unknown>(type: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = `req_${++requestIdCounter}_${Date.now()}`;
    const request: BridgeRequest = { id, type, payload };

    pendingRequests.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });

    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Request ${type} timed out`));
      }
    }, 30000);

    getVSCodeAPI().postMessage(request);
  });
}

type CommandHandler = (payload: unknown) => void;
const commandHandlers = new Map<string, CommandHandler>();

export function onCommand(command: string, handler: CommandHandler): () => void {
  commandHandlers.set(command, handler);
  return () => commandHandlers.delete(command);
}

window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data;
  if (message?.type === 'command' && message.command) {
    const handler = commandHandlers.get(message.command);
    if (handler) {
      handler(message.payload);
    }
  }
});

type ThemeChangePayload = 'light' | 'dark' | { kind?: 'light' | 'dark' | 'high-contrast' };
type ThemeChangeHandler = (theme: ThemeChangePayload) => void;
let themeChangeHandler: ThemeChangeHandler | null = null;

export function onThemeChange(handler: ThemeChangeHandler): () => void {
  themeChangeHandler = handler;
  return () => { themeChangeHandler = null; };
}

window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data;
  if (message?.type === 'themeChange' && themeChangeHandler) {
    themeChangeHandler(message.theme);
  }
});
