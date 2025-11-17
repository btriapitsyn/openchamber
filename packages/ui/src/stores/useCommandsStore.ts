import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import { opencodeClient } from "@/lib/opencode/client";
import {
  startConfigUpdate,
  finishConfigUpdate,
  updateConfigUpdateMessage,
} from "@/lib/configUpdate";
import { emitConfigChange, scopeMatches, subscribeToConfigChanges } from "@/lib/configSync";
import { getSafeStorage } from "./utils/safeStorage";
import { useConfigStore } from "@/stores/useConfigStore";

export interface CommandConfig {
  name: string;
  description?: string;
  agent?: string;
  model?: string;
  template?: string;
  subtask?: boolean;
}

// Extended interface with all possible fields from API
export interface Command extends CommandConfig {
  isBuiltIn?: boolean;
}

const CONFIG_EVENT_SOURCE = "useCommandsStore";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_HEALTH_WAIT_MS = 20000;
const FAST_HEALTH_POLL_INTERVAL_MS = 300;
const FAST_HEALTH_POLL_ATTEMPTS = 4;
const SLOW_HEALTH_POLL_BASE_MS = 800;
const SLOW_HEALTH_POLL_INCREMENT_MS = 200;
const SLOW_HEALTH_POLL_MAX_MS = 2000;

interface CommandsStore {
  // State
  selectedCommandName: string | null;
  commands: Command[];
  isLoading: boolean;

  // Actions
  setSelectedCommand: (name: string | null) => void;
  loadCommands: () => Promise<boolean>;
  createCommand: (config: CommandConfig) => Promise<boolean>;
  updateCommand: (name: string, config: Partial<CommandConfig>) => Promise<boolean>;
  deleteCommand: (name: string) => Promise<boolean>;
  getCommandByName: (name: string) => Command | undefined;
}

declare global {
  interface Window {
    __zustand_commands_store__?: UseBoundStore<StoreApi<CommandsStore>>;
  }
}

export const useCommandsStore = create<CommandsStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial State
        selectedCommandName: null,
        commands: [],
        isLoading: false,

        // Set selected command
        setSelectedCommand: (name: string | null) => {
          set({ selectedCommandName: name });
        },

        // Load commands from API
        loadCommands: async () => {
          set({ isLoading: true });
          const previousCommands = get().commands;
          let lastError: unknown = null;

          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const commands = await opencodeClient.listCommandsWithDetails();
              set({ commands, isLoading: false });
              return true;
            } catch (error) {
              lastError = error;
              const waitMs = 200 * (attempt + 1);
              await new Promise((resolve) => setTimeout(resolve, waitMs));
            }
          }

          console.error("Failed to load commands:", lastError);
          set({ commands: previousCommands, isLoading: false });
          return false;
        },

        // Create new command
        createCommand: async (config: CommandConfig) => {
          startConfigUpdate("Creating command configuration…");
          let requiresReload = false;
          try {
            console.log('[CommandsStore] Creating command:', config.name);

            const commandConfig: Record<string, unknown> = {
              template: config.template || '', // template is required
            };

            if (config.description) commandConfig.description = config.description;
            if (config.agent) commandConfig.agent = config.agent;
            if (config.model) commandConfig.model = config.model;
            if (config.subtask !== undefined) commandConfig.subtask = config.subtask;

            console.log('[CommandsStore] Command config to save:', commandConfig);

            const response = await fetch(`/api/config/commands/${encodeURIComponent(config.name)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(commandConfig)
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to create command';
              throw new Error(message);
            }

            console.log('[CommandsStore] Command created successfully');

            if (payload?.requiresReload) {
              requiresReload = true;
              void performFullConfigRefresh({
                message: payload.message,
                delayMs: payload.reloadDelayMs,
              });
              return true;
            }

            const loaded = await get().loadCommands();
            if (loaded) {
              emitConfigChange("commands", { source: CONFIG_EVENT_SOURCE });
            }
            return loaded;
          } catch (error) {
            console.error("[CommandsStore] Failed to create command:", error);
            return false;
          } finally {
            if (!requiresReload) {
              finishConfigUpdate();
            }
          }
        },

        // Update existing command
        updateCommand: async (name: string, config: Partial<CommandConfig>) => {
          startConfigUpdate("Updating command configuration…");
          let requiresReload = false;
          try {
            console.log('[CommandsStore] Updating command:', name);
            console.log('[CommandsStore] Config received:', config);

            const commandConfig: Record<string, unknown> = {};

            if (config.description !== undefined) commandConfig.description = config.description;
            if (config.agent !== undefined) commandConfig.agent = config.agent;
            if (config.model !== undefined) commandConfig.model = config.model;
            if (config.template !== undefined) commandConfig.template = config.template;
            if (config.subtask !== undefined) commandConfig.subtask = config.subtask;

            console.log('[CommandsStore] Command config to update:', commandConfig);

            const response = await fetch(`/api/config/commands/${encodeURIComponent(name)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(commandConfig)
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to update command';
              throw new Error(message);
            }

            console.log('[CommandsStore] Command updated successfully');

            if (payload?.requiresReload) {
              requiresReload = true;
              void performFullConfigRefresh({
                message: payload.message,
                delayMs: payload.reloadDelayMs,
              });
              return true;
            }

            const loaded = await get().loadCommands();
            if (loaded) {
              emitConfigChange("commands", { source: CONFIG_EVENT_SOURCE });
            }
            return loaded;
          } catch (error) {
            console.error("[CommandsStore] Failed to update command:", error);
            return false;
          } finally {
            if (!requiresReload) {
              finishConfigUpdate();
            }
          }
        },

        // Delete command
        deleteCommand: async (name: string) => {
          startConfigUpdate("Deleting command configuration…");
          let requiresReload = false;
          try {
            const response = await fetch(`/api/config/commands/${encodeURIComponent(name)}`, {
              method: 'DELETE'
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to delete command';
              throw new Error(message);
            }

            console.log('[CommandsStore] Command deleted successfully');

            if (payload?.requiresReload) {
              requiresReload = true;
              void performFullConfigRefresh({
                message: payload.message,
                delayMs: payload.reloadDelayMs,
              });
              return true;
            }

            const loaded = await get().loadCommands();
            if (loaded) {
              emitConfigChange("commands", { source: CONFIG_EVENT_SOURCE });
            }

            if (get().selectedCommandName === name) {
              set({ selectedCommandName: null });
            }

            return loaded;
          } catch (error) {
            console.error("Failed to delete command:", error);
            return false;
          } finally {
            if (!requiresReload) {
              finishConfigUpdate();
            }
          }
        },

        // Get command by name
        getCommandByName: (name: string) => {
          const { commands } = get();
          return commands.find((c) => c.name === name);
        },
      }),
      {
        name: "commands-store",
        storage: createJSONStorage(() => getSafeStorage()),
        partialize: (state) => ({
          selectedCommandName: state.selectedCommandName,
        }),
      },
    ),
    {
      name: "commands-store",
    },
  ),
);

if (typeof window !== "undefined") {
  window.__zustand_commands_store__ = useCommandsStore;
}

async function waitForOpenCodeConnection(delayMs?: number) {
  const initialPause = typeof delayMs === "number" && delayMs > 0
    ? Math.min(delayMs, FAST_HEALTH_POLL_INTERVAL_MS)
    : 0;

  if (initialPause > 0) {
    await sleep(initialPause);
  }

  const start = Date.now();
  let attempt = 0;
  let lastError: unknown = null;

  while (Date.now() - start < MAX_HEALTH_WAIT_MS) {
    attempt += 1;
    updateConfigUpdateMessage(`Waiting for OpenCode… (attempt ${attempt})`);

    try {
      const isHealthy = await opencodeClient.checkHealth();
      if (isHealthy) {
        return;
      }
      lastError = new Error("OpenCode health check reported not ready");
    } catch (error) {
      lastError = error;
    }

    const elapsed = Date.now() - start;

    const waitMs =
      attempt <= FAST_HEALTH_POLL_ATTEMPTS && elapsed < 1200
        ? FAST_HEALTH_POLL_INTERVAL_MS
        : Math.min(
            SLOW_HEALTH_POLL_BASE_MS +
              Math.max(0, attempt - FAST_HEALTH_POLL_ATTEMPTS) * SLOW_HEALTH_POLL_INCREMENT_MS,
            SLOW_HEALTH_POLL_MAX_MS,
          );

    await sleep(waitMs);
  }

  throw lastError || new Error("OpenCode did not become ready in time");
}

async function performFullConfigRefresh(options: { message?: string; delayMs?: number } = {}) {
  const { message, delayMs } = options;

  try {
    updateConfigUpdateMessage(message || "Reloading OpenCode configuration…");
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem("commands-store");
      window.localStorage.removeItem("config-store");
    }
  } catch (error) {
    console.warn("[CommandsStore] Failed to prepare config refresh:", error);
  }

  try {
    await waitForOpenCodeConnection(delayMs);
    updateConfigUpdateMessage("Refreshing providers and commands…");

    const configStore = useConfigStore.getState();
    const commandsStore = useCommandsStore.getState();

    await Promise.all([
      configStore.loadProviders().then(() => undefined),
      commandsStore.loadCommands().then(() => undefined),
    ]);

    emitConfigChange("commands", { source: CONFIG_EVENT_SOURCE });
  } catch (error) {
    console.error("[CommandsStore] Failed to refresh configuration after OpenCode restart:", error);
    updateConfigUpdateMessage("OpenCode reload failed. Please retry refreshing configuration manually.");
    await sleep(1500);
  } finally {
    finishConfigUpdate();
  }
}

export async function reloadOpenCodeConfiguration(options?: { message?: string; delayMs?: number }) {
  startConfigUpdate(options?.message || "Reloading OpenCode configuration…");

  try {
    const response = await fetch('/api/config/reload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message = payload?.error || 'Failed to reload configuration';
      throw new Error(message);
    }

    if (payload?.requiresReload) {
      await performFullConfigRefresh({
        message: payload.message,
        delayMs: payload.reloadDelayMs,
      });
    } else {
      await performFullConfigRefresh(options);
    }
  } catch (error) {
    console.error('[reloadOpenCodeConfiguration] Failed:', error);
    updateConfigUpdateMessage('Failed to reload configuration. Please try again.');
    await sleep(2000);
    finishConfigUpdate();
    throw error;
  }
}

let unsubscribeCommandsConfigChanges: (() => void) | null = null;

if (!unsubscribeCommandsConfigChanges) {
  unsubscribeCommandsConfigChanges = subscribeToConfigChanges((event) => {
    if (event.source === CONFIG_EVENT_SOURCE) {
      return;
    }

    if (scopeMatches(event, "commands")) {
      const { loadCommands } = useCommandsStore.getState();
      void loadCommands();
    }
  });
}
