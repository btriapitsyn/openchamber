import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import type { Server as HttpServer } from "node:http";
import type { BrowserWindowConstructorOptions } from "electron";
import os from "node:os";
import { existsSync, readFileSync } from "node:fs";
import Store from "electron-store";
import { startWebUiServer } from "../server/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isMac = process.platform === "darwin";

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  } else {
    createMainWindow().catch((error) => {
      console.error("Failed to create window on second instance:", error);
    });
  }
});

interface WebUiServerController {
  expressApp: unknown;
  httpServer: HttpServer;
  getPort: () => number | null;
  getOpenCodePort: () => number | null;
  isReady: () => boolean;
  restartOpenCode: () => Promise<void>;
  stop: (options?: { exitProcess?: boolean }) => Promise<void>;
}

let mainWindow: BrowserWindow | null = null;
let serverController: WebUiServerController | null = null;
let shuttingDown = false;

let serverReadyPromise: Promise<WebUiServerController> | null = null;

async function ensureServer(): Promise<WebUiServerController> {
  if (serverController) {
    return serverController;
  }

  if (!serverReadyPromise) {
    serverReadyPromise = (async () => {
      serverController = (await startWebUiServer({
        port: 0,
        attachSignals: false,
        exitOnShutdown: false
      })) as WebUiServerController;
      return serverController;
    })();
  }

  return serverReadyPromise;
}

function resolveAppIcon(): string | undefined {
  const iconName = "app-icon.png";
  if (app.isPackaged) {
    return path.join(process.resourcesPath, iconName);
  }
  return path.join(__dirname, "..", "electron", "resources", iconName);
}

const FALLBACK_SPLASH_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenChamber</title>
    <script>
      (function() {
        try {
          var variant = localStorage.getItem('selectedThemeVariant');
          var useSystem = localStorage.getItem('useSystemTheme');
          if (!variant || (variant !== 'light' && variant !== 'dark')) {
            if (useSystem === null || useSystem === 'true') {
              variant = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            } else {
              variant = 'dark';
            }
          }
          document.documentElement.setAttribute('data-splash-variant', variant === 'light' ? 'light' : 'dark');
        } catch (error) {
          console.warn('Failed to prepare splash theme variant:', error);
        }
      })();
    </script>
    <style>
      :root {
        color-scheme: dark;
        --splash-background: #151313;
        --splash-foreground: #cdccc3;
        --splash-rect: #4B4646;
        --splash-grad-stop1: #F8F8F8;
        --splash-grad-stop2: #DAD6D0;
        --splash-grad-stop3: #BAB4AF;
        --splash-stroke1: rgba(255, 255, 255, 0.08);
        --splash-stroke2: rgba(0, 0, 0, 0.15);
        --splash-stroke3: rgba(0, 0, 0, 0.2);
      }
      html[data-splash-variant='light'] {
        color-scheme: light;
        --splash-background: #F6F4EF;
        --splash-foreground: #453f37;
        --splash-rect: #CFCDCD;
        --splash-grad-stop1: #B3AEA6;
        --splash-grad-stop2: #928E86;
        --splash-grad-stop3: #6E6A63;
        --splash-stroke1: rgba(255, 255, 255, 0.22);
        --splash-stroke2: rgba(60, 56, 47, 0.25);
        --splash-stroke3: rgba(43, 39, 34, 0.4);
      }
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background-color: var(--splash-background);
        color: var(--splash-foreground);
        font-family: system-ui, -apple-system, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      .loading-pulse {
        animation: pulse 2s ease-in-out infinite;
      }
      #initial-loading {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    </style>
  </head>
  <body>
    <div id="initial-loading">
      <div style="display: flex; align-items: center; justify-content: center;">
        <svg class="loading-pulse" width="96" height="96" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="OpenChamber loading icon">
          <defs>
            <linearGradient id="glyphGradientSplash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--splash-grad-stop1)" />
              <stop offset="55%" stop-color="var(--splash-grad-stop2)" />
              <stop offset="100%" stop-color="var(--splash-grad-stop3)" />
            </linearGradient>
            <linearGradient id="glyphStrokeGradientSplash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--splash-stroke1)" />
              <stop offset="45%" stop-color="var(--splash-stroke2)" />
              <stop offset="100%" stop-color="var(--splash-stroke3)" />
            </linearGradient>
          </defs>
          <rect x="8.75" y="31" width="17.5" height="20.5" fill="var(--splash-rect)" />
          <path d="M0 13H35V58H0V13ZM26.25 22.1957H8.75V48.701H26.25V22.1957Z" fill="url(#glyphGradientSplash)" stroke="url(#glyphStrokeGradientSplash)" stroke-width="1.1" stroke-linejoin="round" />
          <path d="M43.75 13H70V22.1957H52.5V48.701H70V57.8967H43.75V13Z" fill="url(#glyphGradientSplash)" stroke="url(#glyphStrokeGradientSplash)" stroke-width="1.1" stroke-linejoin="round" />
        </svg>
      </div>
    </div>
  </body>
</html>`;

let cachedSplashHtml: string | null = null;

function resolveSplashHtml(): string {
  if (cachedSplashHtml) {
    return cachedSplashHtml;
  }

  const devPath = path.join(__dirname, "..", "electron", "resources", "splash.html");
  if (existsSync(devPath)) {
    cachedSplashHtml = readFileSync(devPath, "utf8");
    return cachedSplashHtml;
  }

  if (app.isPackaged) {
    const packagedPath = path.join(process.resourcesPath, "splash.html");
    if (existsSync(packagedPath)) {
      cachedSplashHtml = readFileSync(packagedPath, "utf8");
      return cachedSplashHtml;
    }
  }

  cachedSplashHtml = FALLBACK_SPLASH_HTML;
  return cachedSplashHtml;
}

async function createMainWindow() {
  if (mainWindow) {
    return;
  }
  const iconPath = resolveAppIcon();

  if (isMac && iconPath && app.dock) {
    try {
      app.dock.setIcon(iconPath);
    } catch (error) {
      console.warn("Failed to set dock icon:", error);
    }
  }

  const windowOptions: BrowserWindowConstructorOptions = {
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 600,
    title: "OpenChamber",
    backgroundColor: "#111111",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "preload.cjs")
    },
    icon: iconPath
  };

  if (isMac) {
    Object.assign(windowOptions, {
      titleBarStyle: "hidden" as const,
      fullscreenWindowTitleVisibility: "hidden" as const
    });
  }

  mainWindow = new BrowserWindow(windowOptions);

  if (isMac) {
    try {
      mainWindow.setWindowButtonVisibility(false);
    } catch (error) {
      console.warn("Failed to hide native window buttons:", error);
    }
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const splashHtml = resolveSplashHtml();
  mainWindow
    .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`)
    .catch((error) => {
      console.warn("Failed to display splash screen:", error);
    });

  ensureServer()
    .then((controller) => {
      const port = controller.getPort();
      if (!port) {
        throw new Error("OpenChamber server did not provide a port");
      }

      const appUrl = new URL(`http://127.0.0.1:${port}/`);
      appUrl.searchParams.set("skipSplash", "1");

      mainWindow?.loadURL(appUrl.toString()).catch((err) => {
        console.error("Failed to load OpenChamber UI:", err);
        dialog.showErrorBox("OpenChamber", "Failed to load application interface.");
      });
    })
    .catch((error) => {
      console.error("Failed to initialise OpenChamber server:", error);
      dialog.showErrorBox("OpenChamber", `Failed to start services.\n\n${error instanceof Error ? error.message : String(error)}`);
    });
}

async function startApplication() {
  try {
    await createMainWindow();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to launch OpenChamber:", error);
    dialog.showErrorBox("OpenChamber", `Failed to launch application.\n\n${message}`);
    await shutdown(true);
  }
}

async function shutdown(forceExit = false) {
  if (shuttingDown) {
    if (forceExit) {
      app.exit(1);
    }
    return;
  }

  shuttingDown = true;

  try {
    if (serverController) {
      await serverController.stop({ exitProcess: false });
    } else if (serverReadyPromise) {
      await serverReadyPromise
        .then((controller) => controller.stop({ exitProcess: false }))
        .catch((error) => {
          console.warn("Server promise rejected during shutdown:", error);
        });
    }
  } catch (error) {
    console.error("Failed to stop OpenChamber server cleanly:", error);
  } finally {
    serverController = null;
    if (forceExit) {
      app.exit(1);
    } else {
      app.exit(0);
    }
  }
}

app.whenReady().then(startApplication).catch((error) => {
  console.error("Failed to initialise application:", error);
  app.exit(1);
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow().catch((error) => {
      console.error("Failed to recreate main window:", error);
    });
  }
});

app.on("window-all-closed", () => {
  if (!mainWindow) {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (!shuttingDown) {
    event.preventDefault();
    shutdown(false).catch((error) => {
      console.error("Shutdown sequence failed:", error);
      app.exit(1);
    });
  }
});

ipcMain.handle("opencode:getServerInfo", async () => {
  const controller = await ensureServer();
  const port = controller.getPort();
  const openCodePort = controller.getOpenCodePort();
  const ready = controller.isReady();

  const address = controller.httpServer.address() as AddressInfo | string | null;
  const host =
    typeof address === "object" && address
      ? `${address.address}:${address.port}`
      : port
        ? `127.0.0.1:${port}`
        : null;

  return {
    webPort: port,
    openCodePort,
    host,
    ready
  };
});

ipcMain.handle("opencode:restart", async () => {
  const controller = await ensureServer();
  await controller.restartOpenCode();
  return { success: true };
});

ipcMain.handle("opencode:shutdown", async () => {
  await shutdown(false);
  return { success: true };
});

ipcMain.handle("opencode:windowControl", (_event, action: string) => {
  if (!mainWindow) {
    return { success: false };
  }

  switch (action) {
    case "close":
      mainWindow.close();
      break;
    case "minimize":
      mainWindow.minimize();
      break;
    case "maximize":
      if (mainWindow.isFullScreen()) {
        mainWindow.setFullScreen(false);
      } else if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
      break;
    default:
      return { success: false };
  }

  return { success: true };
});

ipcMain.handle("opencode:getHomeDirectory", async () => {
  try {
    const home = os.homedir();
    updatePersistedSettings({ homeDirectory: home });
    return { success: true, path: home };
  } catch (error) {
    console.warn("Failed to resolve home directory:", error);
    return { success: false, path: null };
  }
});

ipcMain.handle("settings:read", () => {
  return getPersistedSettings();
});

ipcMain.handle("settings:update", (_event, changes: Partial<PersistedSettings>) => {
  if (!changes || typeof changes !== "object") {
    return getPersistedSettings();
  }
  return updatePersistedSettings(changes);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception in Electron main:", error);
  shutdown(true).catch(() => {
    app.exit(1);
  });
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection in Electron main:", reason);
});
type PersistedSettings = {
  themeId?: string;
  useSystemTheme?: boolean;
  themeVariant?: "light" | "dark";
  lastDirectory?: string;
  homeDirectory?: string;
  approvedDirectories: string[];
};

const settingsStore = new Store<PersistedSettings>({
  name: "settings",
  defaults: {
    approvedDirectories: []
  }
});

const settingsAccess = settingsStore as unknown as { store: PersistedSettings };

const getPersistedSettings = (): PersistedSettings => ({
  themeId: settingsAccess.store.themeId,
  useSystemTheme: settingsAccess.store.useSystemTheme,
  lastDirectory: settingsAccess.store.lastDirectory,
  homeDirectory: settingsAccess.store.homeDirectory,
  approvedDirectories: settingsAccess.store.approvedDirectories ?? []
});

const updatePersistedSettings = (changes: Partial<PersistedSettings>): PersistedSettings => {
  const current = getPersistedSettings();
  const baseApproved = Array.isArray(changes.approvedDirectories)
    ? changes.approvedDirectories
    : current.approvedDirectories ?? [];
  const additionalApproved: string[] = [];
  if (typeof changes.lastDirectory === 'string' && changes.lastDirectory.length > 0) {
    additionalApproved.push(changes.lastDirectory);
  }
  if (typeof changes.homeDirectory === 'string' && changes.homeDirectory.length > 0) {
    additionalApproved.push(changes.homeDirectory);
  }
  const approvedSource = [...baseApproved, ...additionalApproved];
  const next: PersistedSettings = {
    ...current,
    ...changes,
    approvedDirectories: Array.from(
      new Set(
        approvedSource.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
      )
    )
  };
  settingsAccess.store = next;
  return next;
};
