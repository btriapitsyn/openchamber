import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import type { Agent } from "@opencode-ai/sdk";
import { opencodeClient } from "@/lib/opencode/client";
import { emitConfigChange, scopeMatches, subscribeToConfigChanges } from "@/lib/configSync";
import {
  startConfigUpdate,
  finishConfigUpdate,
  updateConfigUpdateMessage,
} from "@/lib/configUpdate";
import { getSafeStorage } from "./utils/safeStorage";
import { useConfigStore } from "@/stores/useConfigStore";

export interface AgentConfig {
  name: string;
  description?: string;
  model?: string;
  temperature?: number;
  top_p?: number;
  prompt?: string;
  mode?: "primary" | "subagent" | "all";
  tools?: Record<string, boolean>;
  permission?: {
    edit?: "allow" | "ask" | "deny";
    bash?: "allow" | "ask" | "deny" | Record<string, "allow" | "ask" | "deny">;
    webfetch?: "allow" | "ask" | "deny";
  };
  disable?: boolean;
}

const CONFIG_EVENT_SOURCE = "useAgentsStore";
const DEFAULT_RELOAD_DELAY_MS = 1200;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface AgentsStore {
  // State
  selectedAgentName: string | null;
  agents: Agent[];
  isLoading: boolean;

  // Actions
  setSelectedAgent: (name: string | null) => void;
  loadAgents: () => Promise<boolean>;
  createAgent: (config: AgentConfig) => Promise<boolean>;
  updateAgent: (name: string, config: Partial<AgentConfig>) => Promise<boolean>;
  deleteAgent: (name: string) => Promise<boolean>;
  getAgentByName: (name: string) => Agent | undefined;
}

export const useAgentsStore = create<AgentsStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial State
        selectedAgentName: null,
        agents: [],
        isLoading: false,

        // Set selected agent
        setSelectedAgent: (name: string | null) => {
          set({ selectedAgentName: name });
        },

        // Load agents from API
        loadAgents: async () => {
          set({ isLoading: true });
          const previousAgents = get().agents;
          let lastError: unknown = null;

          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const agents = await opencodeClient.listAgents();
              set({ agents, isLoading: false });
              return true;
            } catch (error) {
              lastError = error;
              const waitMs = 200 * (attempt + 1);
              await new Promise((resolve) => setTimeout(resolve, waitMs));
            }
          }

          console.error("Failed to load agents:", lastError);
          set({ agents: previousAgents, isLoading: false });
          return false;
        },

        // Create new agent
        createAgent: async (config: AgentConfig) => {
          startConfigUpdate("Creating agent configuration…");
          let requiresReload = false;
          try {
            console.log('[AgentsStore] Creating agent:', config.name);

            const agentConfig: any = {
              mode: config.mode || "subagent",
            };

            if (config.description) agentConfig.description = config.description;
            if (config.model) agentConfig.model = config.model;
            if (config.temperature !== undefined) agentConfig.temperature = config.temperature;
            if (config.top_p !== undefined) agentConfig.top_p = config.top_p;
            if (config.prompt) agentConfig.prompt = config.prompt;
            if (config.tools && Object.keys(config.tools).length > 0) agentConfig.tools = config.tools;
            if (config.permission) agentConfig.permission = config.permission;
            if (config.disable !== undefined) agentConfig.disable = config.disable;

            console.log('[AgentsStore] Agent config to save:', agentConfig);

            const response = await fetch(`/api/config/agents/${encodeURIComponent(config.name)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(agentConfig)
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to create agent';
              throw new Error(message);
            }

            console.log('[AgentsStore] Agent created successfully');

            if (payload?.requiresReload) {
              requiresReload = true;
              void performFullConfigRefresh({
                message: payload.message,
                delayMs: payload.reloadDelayMs,
              });
              return true;
            }

            const loaded = await get().loadAgents();
            if (loaded) {
              emitConfigChange("agents", { source: CONFIG_EVENT_SOURCE });
            }
            return loaded;
          } catch (error) {
            console.error("[AgentsStore] Failed to create agent:", error);
            return false;
          } finally {
            if (!requiresReload) {
              finishConfigUpdate();
            }
          }
        },

        // Update existing agent
        updateAgent: async (name: string, config: Partial<AgentConfig>) => {
          startConfigUpdate("Updating agent configuration…");
          let requiresReload = false;
          try {
            console.log('[AgentsStore] Updating agent:', name);
            console.log('[AgentsStore] Config received:', config);

            const agentConfig: any = {};

            if (config.mode !== undefined) agentConfig.mode = config.mode;
            if (config.description !== undefined) agentConfig.description = config.description;
            if (config.model !== undefined) agentConfig.model = config.model;
            if (config.temperature !== undefined) agentConfig.temperature = config.temperature;
            if (config.top_p !== undefined) agentConfig.top_p = config.top_p;
            if (config.prompt !== undefined) agentConfig.prompt = config.prompt;
            if (config.tools !== undefined) agentConfig.tools = config.tools;
            if (config.permission !== undefined) agentConfig.permission = config.permission;
            if (config.disable !== undefined) agentConfig.disable = config.disable;

            console.log('[AgentsStore] Agent config to update:', agentConfig);

            const response = await fetch(`/api/config/agents/${encodeURIComponent(name)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(agentConfig)
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to update agent';
              throw new Error(message);
            }

            console.log('[AgentsStore] Agent updated successfully');

            if (payload?.requiresReload) {
              requiresReload = true;
              void performFullConfigRefresh({
                message: payload.message,
                delayMs: payload.reloadDelayMs,
              });
              return true;
            }

            const loaded = await get().loadAgents();
            if (loaded) {
              emitConfigChange("agents", { source: CONFIG_EVENT_SOURCE });
            }
            return loaded;
          } catch (error) {
            console.error("[AgentsStore] Failed to update agent:", error);
            return false;
          } finally {
            if (!requiresReload) {
              finishConfigUpdate();
            }
          }
        },

        // Delete agent
        deleteAgent: async (name: string) => {
          startConfigUpdate("Deleting agent configuration…");
          let requiresReload = false;
          try {
            const response = await fetch(`/api/config/agents/${encodeURIComponent(name)}`, {
              method: 'DELETE'
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to delete agent';
              throw new Error(message);
            }

            console.log('[AgentsStore] Agent deleted successfully');

            if (payload?.requiresReload) {
              requiresReload = true;
              void performFullConfigRefresh({
                message: payload.message,
                delayMs: payload.reloadDelayMs,
              });
              return true;
            }

            const loaded = await get().loadAgents();
            if (loaded) {
              emitConfigChange("agents", { source: CONFIG_EVENT_SOURCE });
            }

            if (get().selectedAgentName === name) {
              set({ selectedAgentName: null });
            }

            return loaded;
          } catch (error) {
            console.error("Failed to delete agent:", error);
            return false;
          } finally {
            if (!requiresReload) {
              finishConfigUpdate();
            }
          }
        },

        // Get agent by name
        getAgentByName: (name: string) => {
          const { agents } = get();
          return agents.find((a) => a.name === name);
        },
      }),
      {
        name: "agents-store",
        storage: createJSONStorage(() => getSafeStorage()),
        partialize: (state) => ({
          selectedAgentName: state.selectedAgentName,
        }),
      },
    ),
    {
      name: "agents-store",
    },
  ),
);

if (typeof window !== "undefined") {
  (window as any).__zustand_agents_store__ = useAgentsStore;
}

async function waitForOpenCodeConnection(delayMs?: number) {
  const initialDelay = typeof delayMs === "number" && !Number.isNaN(delayMs)
    ? delayMs
    : DEFAULT_RELOAD_DELAY_MS;

  await sleep(initialDelay);

  const maxAttempts = 6; // Reduced from 12
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      updateConfigUpdateMessage(`Waiting for OpenCode… (${attempt + 1}/${maxAttempts})`);
      const isHealthy = await opencodeClient.checkHealth();
      if (isHealthy) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    const backoff = 1000 + (attempt * 500); // Linear backoff: 1s, 1.5s, 2s, 2.5s, 3s, 3.5s
    await sleep(backoff);
  }

  throw lastError || new Error("OpenCode did not become ready in time");
}

async function performFullConfigRefresh(options: { message?: string; delayMs?: number } = {}) {
  const { message, delayMs } = options;

  try {
    updateConfigUpdateMessage(message || "Reloading OpenCode configuration…");
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem("agents-store");
      window.localStorage.removeItem("config-store");
    }
  } catch (error) {
    console.warn("[AgentsStore] Failed to prepare config refresh:", error);
  }

  try {
    await waitForOpenCodeConnection(delayMs);
    updateConfigUpdateMessage("Refreshing providers and agents…");

    const configStore = useConfigStore.getState();
    const agentsStore = useAgentsStore.getState();

    await Promise.all([
      configStore.loadProviders().then(() => undefined),
      agentsStore.loadAgents().then(() => undefined),
    ]);

    emitConfigChange("agents", { source: CONFIG_EVENT_SOURCE });
  } catch (error) {
    console.error("[AgentsStore] Failed to refresh configuration after OpenCode restart:", error);
    updateConfigUpdateMessage("OpenCode reload failed. Please retry refreshing configuration manually.");
    await sleep(1500);
  } finally {
    finishConfigUpdate();
  }
}

let unsubscribeAgentsConfigChanges: (() => void) | null = null;

if (!unsubscribeAgentsConfigChanges) {
  unsubscribeAgentsConfigChanges = subscribeToConfigChanges((event) => {
    if (event.source === CONFIG_EVENT_SOURCE) {
      return;
    }

    if (scopeMatches(event, "agents")) {
      const { loadAgents } = useAgentsStore.getState();
      void loadAgents();
    }
  });
}
