const { contextBridge, ipcRenderer } = require("electron");
const os = require("os");

const homeDirectory = os.homedir();

const api = {
  homeDirectory,
  getServerInfo: () => ipcRenderer.invoke("opencode:getServerInfo"),
  restartOpenCode: () => ipcRenderer.invoke("opencode:restart"),
  shutdown: () => ipcRenderer.invoke("opencode:shutdown"),
  markRendererReady: () => ipcRenderer.send("renderer:ready"),
  windowControl: (action) => ipcRenderer.invoke("opencode:windowControl", action),
  getSettings: () => ipcRenderer.invoke("settings:read"),
  updateSettings: (payload) => ipcRenderer.invoke("settings:update", payload),
  getHomeDirectory: async () => {
    try {
      const result = await ipcRenderer.invoke("opencode:getHomeDirectory");
      if (result?.success && typeof result.path === "string" && result.path.length > 0) {
        return result;
      }
    } catch (error) {
      console.warn("Failed to obtain home directory via IPC:", error);
    }
    return { success: true, path: homeDirectory };
  },
  notifyAssistantCompletion: (payload) => ipcRenderer.invoke("notifications:assistantComplete", payload ?? {}),
  requestDirectoryAccess: (path) => ipcRenderer.invoke("filesystem:requestDirectoryAccess", path),
  startAccessingDirectory: (path) => ipcRenderer.invoke("filesystem:startAccessingDirectory", path),
  stopAccessingDirectory: (path) => ipcRenderer.invoke("filesystem:stopAccessingDirectory", path)
};

contextBridge.exposeInMainWorld("opencodeDesktop", api);
contextBridge.exposeInMainWorld("opencodeDesktopSettings", {
  getSettings: () => ipcRenderer.invoke("settings:read"),
  updateSettings: (payload) => ipcRenderer.invoke("settings:update", payload)
});
contextBridge.exposeInMainWorld("__OPENCHAMBER_HOME__", homeDirectory);

const desktopEventsApi = {
  subscribe: (onEvent, onError, onOpen) => {
    const eventHandler = (_event, payload) => {
      if (typeof onEvent === "function") {
        onEvent(payload);
      }
    };

    const statusHandler = (_event, status) => {
      if (!status || typeof status !== "object") {
        return;
      }

      if (status.state === "connected") {
        if (typeof onOpen === "function") {
          onOpen();
        }
      } else if (status.state === "reconnecting") {
        if (typeof onError === "function") {
          onError({ status });
        }
      }
    };

    ipcRenderer.on("opencode:sse-event", eventHandler);
    ipcRenderer.on("opencode:sse-status", statusHandler);

    ipcRenderer
      .invoke("opencode:sse:state")
      .then((status) => {
        if (status && typeof status === "object") {
          if (status.state === "connected" && typeof onOpen === "function") {
            onOpen();
          } else if (status.state === "reconnecting" && typeof onError === "function") {
            onError({ status });
          }
        }
      })
      .catch((error) => {
        console.warn("Failed to obtain initial SSE state:", error);
      });

    return () => {
      ipcRenderer.removeListener("opencode:sse-event", eventHandler);
      ipcRenderer.removeListener("opencode:sse-status", statusHandler);
    };
  },
  setDirectory: (directory) => ipcRenderer.invoke("opencode:sse:setDirectory", directory ?? null)
};

contextBridge.exposeInMainWorld("opencodeDesktopEvents", desktopEventsApi);

contextBridge.exposeInMainWorld("opencodeAppearance", {
  load: () => ipcRenderer.invoke("appearance:load"),
  save: (payload) => ipcRenderer.invoke("appearance:save", payload)
});

contextBridge.exposeInMainWorld("opencodePromptEnhancer", {
  load: () => ipcRenderer.invoke("promptEnhancer:load"),
  save: (payload) => ipcRenderer.invoke("promptEnhancer:save", payload)
});
