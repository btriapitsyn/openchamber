import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import type { Agent } from "@opencode-ai/sdk";
import { opencodeClient } from "@/lib/opencode/client";
import { getSafeStorage } from "./utils/safeStorage";

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

interface AgentsStore {
  // State
  selectedAgentName: string | null;
  agents: Agent[];
  isLoading: boolean;

  // Actions
  setSelectedAgent: (name: string | null) => void;
  loadAgents: () => Promise<void>;
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
          try {
            const agents = await opencodeClient.listAgents();
            set({ agents, isLoading: false });
          } catch (error) {
            console.error("Failed to load agents:", error);
            set({ agents: [], isLoading: false });
          }
        },

        // Create new agent
        createAgent: async (config: AgentConfig) => {
          try {
            console.log('[AgentsStore] Creating agent:', config.name);

            // Prepare agent config without name field
            const agentConfig: any = {
              mode: config.mode || "subagent",
            };

            // Only add non-undefined fields
            if (config.description) agentConfig.description = config.description;
            if (config.model) agentConfig.model = config.model;
            if (config.temperature !== undefined) agentConfig.temperature = config.temperature;
            if (config.top_p !== undefined) agentConfig.top_p = config.top_p;
            if (config.prompt) agentConfig.prompt = config.prompt;
            if (config.tools && Object.keys(config.tools).length > 0) agentConfig.tools = config.tools;
            if (config.permission) agentConfig.permission = config.permission;
            if (config.disable !== undefined) agentConfig.disable = config.disable;

            console.log('[AgentsStore] Agent config to save:', agentConfig);

            // Create agent via backend endpoint (writes .md file)
            const response = await fetch(`/api/config/agents/${encodeURIComponent(config.name)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(agentConfig)
            });

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || 'Failed to create agent');
            }

            console.log('[AgentsStore] Agent created successfully');

            // Reload agents to get updated list
            await get().loadAgents();

            return true;
          } catch (error) {
            console.error("[AgentsStore] Failed to create agent:", error);
            return false;
          }
        },

        // Update existing agent
        updateAgent: async (name: string, config: Partial<AgentConfig>) => {
          try {
            console.log('[AgentsStore] Updating agent:', name);
            console.log('[AgentsStore] Config received:', config);

            // Prepare agent config - only include non-undefined fields
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

            // Update agent via backend endpoint (field-level logic)
            const response = await fetch(`/api/config/agents/${encodeURIComponent(name)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(agentConfig)
            });

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || 'Failed to update agent');
            }

            console.log('[AgentsStore] Agent updated successfully');

            // Reload agents to get updated list
            await get().loadAgents();

            return true;
          } catch (error) {
            console.error("[AgentsStore] Failed to update agent:", error);
            return false;
          }
        },

        // Delete agent
        deleteAgent: async (name: string) => {
          try {
            // Delete agent via backend endpoint
            const response = await fetch(`/api/config/agents/${encodeURIComponent(name)}`, {
              method: 'DELETE'
            });

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || 'Failed to delete agent');
            }

            console.log('[AgentsStore] Agent deleted successfully');

            // Reload agents and clear selection if deleted agent was selected
            await get().loadAgents();
            if (get().selectedAgentName === name) {
              set({ selectedAgentName: null });
            }

            return true;
          } catch (error) {
            console.error("Failed to delete agent:", error);
            return false;
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
