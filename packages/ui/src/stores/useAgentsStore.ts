import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import type { Agent } from "@opencode-ai/sdk/v2";
import { opencodeClient } from "@/lib/opencode/client";
import { emitConfigChange, scopeMatches, subscribeToConfigChanges, type ConfigChangeScope } from "@/lib/configSync";
import {
  startConfigUpdate,
  finishConfigUpdate,
  updateConfigUpdateMessage,
} from "@/lib/configUpdate";
import { getSafeStorage } from "./utils/safeStorage";
import { useConfigStore } from "@/stores/useConfigStore";
import { useCommandsStore } from "@/stores/useCommandsStore";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useSkillsCatalogStore } from "@/stores/useSkillsCatalogStore";
import { useSkillsStore } from "@/stores/useSkillsStore";

// Note: useDirectoryStore cannot be imported at top level to avoid circular dependency
// useDirectoryStore -> useAgentsStore (for refreshAfterOpenCodeRestart)
// useAgentsStore -> useDirectoryStore (for currentDirectory)
const getCurrentDirectory = (): string | null => {
  const opencodeDirectory = opencodeClient.getDirectory();
  if (typeof opencodeDirectory === 'string' && opencodeDirectory.trim().length > 0) {
    return opencodeDirectory;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__zustand_directory_store__;
    if (store) {
      return store.getState().currentDirectory;
    }
  } catch {
    // ignore
  }

  return null;
};

export type AgentScope = 'user' | 'project';

export interface AgentConfig {
  name: string;
  description?: string;
  model?: string | null;
  temperature?: number;
  top_p?: number;
  prompt?: string;
  mode?: "primary" | "subagent" | "all";
  tools?: Record<string, boolean>;
  permission?: {
     edit?: "allow" | "ask" | "deny";
     bash?: "allow" | "ask" | "deny" | Record<string, "allow" | "ask" | "deny">;
     skill?: "allow" | "ask" | "deny" | Record<string, "allow" | "ask" | "deny">;
     webfetch?: "allow" | "ask" | "deny";
     doom_loop?: "allow" | "ask" | "deny";
     external_directory?: "allow" | "ask" | "deny";
   };

  disable?: boolean;
  scope?: AgentScope;
}

// Extended Agent type for API properties not in SDK types
export type AgentWithExtras = Agent & {
  native?: boolean;
  hidden?: boolean;
  options?: { hidden?: boolean };
};

// Helper to check if agent is built-in (handles both SDK 'builtIn' and API 'native')
export const isAgentBuiltIn = (agent: Agent): boolean => {
  const extended = agent as AgentWithExtras & { builtIn?: boolean };
  return extended.native === true || extended.builtIn === true;
};

// Helper to check if agent is hidden (internal agents like title, compaction, summary)
// Checks both top-level hidden and options.hidden (OpenCode API inconsistency workaround)
export const isAgentHidden = (agent: Agent): boolean => {
  const extended = agent as AgentWithExtras;
  return extended.hidden === true || extended.options?.hidden === true;
};

// Helper to filter only visible (non-hidden) agents
export const filterVisibleAgents = (agents: Agent[]): Agent[] =>
  agents.filter((agent) => !isAgentHidden(agent));

const CONFIG_EVENT_SOURCE = "useAgentsStore";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_HEALTH_WAIT_MS = 20000;
const FAST_HEALTH_POLL_INTERVAL_MS = 300;
const FAST_HEALTH_POLL_ATTEMPTS = 4;
const SLOW_HEALTH_POLL_BASE_MS = 800;
const SLOW_HEALTH_POLL_INCREMENT_MS = 200;
const SLOW_HEALTH_POLL_MAX_MS = 2000;

export interface AgentDraft {
  name: string;
  scope: AgentScope;
  description?: string;
  model?: string | null;
  temperature?: number;
  top_p?: number;
  prompt?: string;
  mode?: "primary" | "subagent" | "all";
  tools?: Record<string, boolean>;
  permission?: {
     edit?: "allow" | "ask" | "deny";
     bash?: "allow" | "ask" | "deny" | Record<string, "allow" | "ask" | "deny">;
     skill?: "allow" | "ask" | "deny" | Record<string, "allow" | "ask" | "deny">;
     webfetch?: "allow" | "ask" | "deny";
     doom_loop?: "allow" | "ask" | "deny";
     external_directory?: "allow" | "ask" | "deny";
   };
  disable?: boolean;
}

interface AgentsStore {

  selectedAgentName: string | null;
  agents: Agent[];
  isLoading: boolean;
  agentDraft: AgentDraft | null;

  setSelectedAgent: (name: string | null) => void;
  setAgentDraft: (draft: AgentDraft | null) => void;
  loadAgents: () => Promise<boolean>;
  createAgent: (config: AgentConfig) => Promise<boolean>;
  updateAgent: (name: string, config: Partial<AgentConfig>) => Promise<boolean>;
  deleteAgent: (name: string) => Promise<boolean>;
  getAgentByName: (name: string) => Agent | undefined;
  // Returns only visible agents (excludes hidden internal agents)
  getVisibleAgents: () => Agent[];
}

declare global {
  interface Window {
    __zustand_agents_store__?: UseBoundStore<StoreApi<AgentsStore>>;
  }
}

export const useAgentsStore = create<AgentsStore>()(
  devtools(
    persist(
      (set, get) => ({

        selectedAgentName: null,
        agents: [],
        isLoading: false,
        agentDraft: null,

        setSelectedAgent: (name: string | null) => {
          set({ selectedAgentName: name });
        },

        setAgentDraft: (draft: AgentDraft | null) => {
          set({ agentDraft: draft });
        },

        loadAgents: async () => {
          set({ isLoading: true });
          const previousAgents = get().agents;
          let lastError: unknown = null;

          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const agents = await opencodeClient.listAgents();
              
              // Fetch scope info for each agent
              const currentDirectory = getCurrentDirectory();
              const queryParams = currentDirectory ? `?directory=${encodeURIComponent(currentDirectory)}` : '';
              
              const agentsWithScope = await Promise.all(
                agents.map(async (agent) => {
                  try {
                    const response = await fetch(`/api/config/agents/${encodeURIComponent(agent.name)}${queryParams}`);
                    if (response.ok) {
                      const data = await response.json();
                      const sources = (data?.sources || null) as
                        | { md?: { exists?: boolean; scope?: unknown }; json?: { exists?: boolean; scope?: unknown } }
                        | null;

                      const scope = (sources?.md?.exists ? sources.md.scope : undefined)
                        ?? (sources?.json?.exists ? sources.json.scope : undefined)
                        ?? data.scope
                        ?? sources?.md?.scope
                        ?? sources?.json?.scope;

                      return { ...agent, scope: scope as AgentScope | undefined };
                    }
                  } catch {
                    // Ignore scope fetch errors and fall back to agent defaults
                  }
                  return agent;
                })
              );
              
              set({ agents: agentsWithScope, isLoading: false });
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

        createAgent: async (config: AgentConfig) => {
          startConfigUpdate("Creating agent configuration…");
          let requiresReload = false;
          try {
            const agentConfig: Record<string, unknown> = {
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
            if (config.scope) agentConfig.scope = config.scope;

            // Get current directory for project-level agent support
            const currentDirectory = getCurrentDirectory();
            const queryParams = currentDirectory ? `?directory=${encodeURIComponent(currentDirectory)}` : '';

            const response = await fetch(`/api/config/agents/${encodeURIComponent(config.name)}${queryParams}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(agentConfig)
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to create agent';
              throw new Error(message);
            }

            const needsReload = payload?.requiresReload ?? true;
            if (needsReload) {
              requiresReload = true;
              await refreshAfterOpenCodeRestart({
                message: payload?.message,
                delayMs: payload?.reloadDelayMs,
                scopes: ["agents"],
                mode: "active",
              });
              return true;
            }

            const loaded = await get().loadAgents();
            if (loaded) {
              emitConfigChange("agents", { source: CONFIG_EVENT_SOURCE });
            }
            return loaded;
          } catch {
            return false;
          } finally {
            if (!requiresReload) {
              finishConfigUpdate();
            }
          }
        },

        updateAgent: async (name: string, config: Partial<AgentConfig>) => {
          startConfigUpdate("Updating agent configuration…");
          let requiresReload = false;
          try {
            const agentConfig: Record<string, unknown> = {};

            if (config.mode !== undefined) agentConfig.mode = config.mode;
            if (config.description !== undefined) agentConfig.description = config.description;
            if (config.model !== undefined) agentConfig.model = config.model;
            if (config.temperature !== undefined) agentConfig.temperature = config.temperature;
            if (config.top_p !== undefined) agentConfig.top_p = config.top_p;
            if (config.prompt !== undefined) agentConfig.prompt = config.prompt;
            if (config.tools !== undefined) agentConfig.tools = config.tools;
            if (config.permission !== undefined) agentConfig.permission = config.permission;
            if (config.disable !== undefined) agentConfig.disable = config.disable;

            // Get current directory for project-level agent support
            const currentDirectory = getCurrentDirectory();
            const queryParams = currentDirectory ? `?directory=${encodeURIComponent(currentDirectory)}` : '';

            const response = await fetch(`/api/config/agents/${encodeURIComponent(name)}${queryParams}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(agentConfig)
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to update agent';
              throw new Error(message);
            }

            const needsReload = payload?.requiresReload ?? true;
            if (needsReload) {
              requiresReload = true;
              await refreshAfterOpenCodeRestart({
                message: payload?.message,
                delayMs: payload?.reloadDelayMs,
                scopes: ["agents"],
                mode: "active",
              });
              return true;
            }

            const loaded = await get().loadAgents();
            if (loaded) {
              emitConfigChange("agents", { source: CONFIG_EVENT_SOURCE });
            }
            return loaded;
          } catch {
            return false;
          } finally {
            if (!requiresReload) {
              finishConfigUpdate();
            }
          }
        },

        deleteAgent: async (name: string) => {
          startConfigUpdate("Deleting agent configuration…");
          let requiresReload = false;
          try {
            // Get current directory for project-level agent support
            const currentDirectory = getCurrentDirectory();
            const queryParams = currentDirectory ? `?directory=${encodeURIComponent(currentDirectory)}` : '';

            const response = await fetch(`/api/config/agents/${encodeURIComponent(name)}${queryParams}`, {
              method: 'DELETE'
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to delete agent';
              throw new Error(message);
            }

            const needsReload = payload?.requiresReload ?? true;
            if (needsReload) {
              requiresReload = true;
              await refreshAfterOpenCodeRestart({
                message: payload?.message,
                delayMs: payload?.reloadDelayMs,
                scopes: ["agents"],
                mode: "active",
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
          } catch {
            return false;
          } finally {
            if (!requiresReload) {
              finishConfigUpdate();
            }
          }
        },

        getAgentByName: (name: string) => {
          const { agents } = get();
          return agents.find((a) => a.name === name);
        },

        getVisibleAgents: () => {
          const { agents } = get();
          return filterVisibleAgents(agents);
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
  window.__zustand_agents_store__ = useAgentsStore;
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

type ConfigRefreshMode = "active" | "projects";

const normalizeRefreshScopes = (scopes?: ConfigChangeScope[]): ConfigChangeScope[] => {
  if (!scopes || scopes.length === 0) {
    return ["all"];
  }

  const unique = Array.from(new Set(scopes));
  if (unique.includes("all")) {
    return ["all"];
  }

  return unique;
};

async function performConfigRefresh(options: {
  message?: string;
  delayMs?: number;
  scopes?: ConfigChangeScope[];
  mode?: ConfigRefreshMode;
} = {}) {
  const { message, delayMs } = options;
  const scopes = normalizeRefreshScopes(options.scopes);
  const mode: ConfigRefreshMode = options.mode ?? (scopes.includes("all") ? "projects" : "active");

  try {
    updateConfigUpdateMessage(message || "Refreshing configuration…");
  } catch {
    // ignore
  }

  try {
    await waitForOpenCodeConnection(delayMs);

    const configStore = useConfigStore.getState();
    const agentConfigStore = useAgentsStore.getState();
    const commandsStore = useCommandsStore.getState();
    const skillsStore = useSkillsStore.getState();
    const skillsCatalogStore = useSkillsCatalogStore.getState();

    const refreshProviders = scopes.includes("all") || scopes.includes("providers");
    const refreshSdkAgents = scopes.includes("all") || scopes.includes("agents");
    const refreshAgentConfigs = scopes.includes("all") || scopes.includes("agents");
    const refreshCommands = scopes.includes("all") || scopes.includes("commands");
    const refreshSkills = scopes.includes("all") || scopes.includes("skills");

    const currentDirectory = getCurrentDirectory();
    const projects = mode === "projects" ? useProjectsStore.getState().projects : [];
    const directoriesToRefresh = Array.from(
      new Set([
        ...(currentDirectory ? [currentDirectory] : []),
        ...projects.map((project) => project.path).filter(Boolean),
      ]),
    );

    if (scopes.includes("all") && mode === "projects") {
      useConfigStore.setState({ directoryScoped: {} });
    }

    const sdkRefreshTasks: Promise<void>[] = [];
    for (const directory of directoriesToRefresh) {
      if (refreshProviders) {
        sdkRefreshTasks.push(configStore.loadProviders({ directory }).then(() => undefined));
      }
      if (refreshSdkAgents) {
        sdkRefreshTasks.push(configStore.loadAgents({ directory }).then(() => undefined));
      }
    }

    const uiRefreshTasks: Promise<void>[] = [];
    if (refreshAgentConfigs) {
      uiRefreshTasks.push(agentConfigStore.loadAgents().then(() => undefined));
    }
    if (refreshCommands) {
      uiRefreshTasks.push(commandsStore.loadCommands().then(() => undefined));
    }
    if (refreshSkills) {
      uiRefreshTasks.push(skillsStore.loadSkills().then(() => undefined));
      uiRefreshTasks.push(skillsCatalogStore.loadCatalog().then(() => undefined));
    }

    updateConfigUpdateMessage("Refreshing configuration…");
    await Promise.all([...sdkRefreshTasks, ...uiRefreshTasks]);
  } catch {
    updateConfigUpdateMessage("OpenCode refresh failed. Please retry.");
    await sleep(1500);
  } finally {
    finishConfigUpdate();
  }
}

export async function refreshAfterOpenCodeRestart(options?: {
  message?: string;
  delayMs?: number;
  scopes?: ConfigChangeScope[];
  mode?: ConfigRefreshMode;
}) {
  await performConfigRefresh(options);
}

export async function reloadOpenCodeConfiguration(options?: {
  message?: string;
  delayMs?: number;
  scopes?: ConfigChangeScope[];
  mode?: ConfigRefreshMode;
}) {
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

    const refreshOptions = {
      ...options,
      scopes: options?.scopes ?? ["all"],
      mode: options?.mode ?? "projects",
    };

    if (payload?.requiresReload) {
      await refreshAfterOpenCodeRestart({
        ...refreshOptions,
        message: payload.message,
        delayMs: payload.reloadDelayMs,
      });
    } else {
      await refreshAfterOpenCodeRestart(refreshOptions);
    }
  } catch (error) {
    console.error('[reloadOpenCodeConfiguration] Failed:', error);
    updateConfigUpdateMessage('Failed to reload configuration. Please try again.');
    await sleep(2000);
    finishConfigUpdate();
    throw error;
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
