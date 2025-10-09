declare module "../server/lib/opencode-config.js" {
  export function getAgentSources(agentName: string): {
    md: { exists: boolean; path: string | null; fields: string[] };
    json: { exists: boolean; path: string | null; fields: string[] };
  };

  export function createAgent(agentName: string, config: Record<string, unknown>): void;

  export function updateAgent(agentName: string, updates: Record<string, unknown>): void;

  export function deleteAgent(agentName: string): void;
}
