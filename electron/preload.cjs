const { contextBridge, ipcRenderer } = require("electron");
const os = require("os");

const homeDirectory = os.homedir();

const api = {
  homeDirectory,
  getServerInfo: () => ipcRenderer.invoke("opencode:getServerInfo"),
  restartOpenCode: () => ipcRenderer.invoke("opencode:restart"),
  shutdown: () => ipcRenderer.invoke("opencode:shutdown"),
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

contextBridge.exposeInMainWorld("opencodeAppearance", {
  load: () => ipcRenderer.invoke("appearance:load"),
  save: (payload) => ipcRenderer.invoke("appearance:save", payload)
});
