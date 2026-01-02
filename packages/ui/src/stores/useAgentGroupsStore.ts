import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { opencodeClient } from '@/lib/opencode/client';
import { useDirectoryStore } from './useDirectoryStore';
import type { WorktreeMetadata } from '@/types/worktree';
import { listWorktrees, mapWorktreeToMetadata } from '@/lib/git/worktreeService';

const OPENCHAMBER_DIR = '.openchamber';

/**
 * Parsed agent group from .openchamber folder structure.
 * Folder names follow pattern: `group-name-provider-model-<count>`
 * Example: `agent-manager-2-github-copilot-claude-opus-4-5-1`
 */
export interface AgentGroupSession {
  /** Session ID (same as folder name for now) */
  id: string;
  /** Full worktree path */
  path: string;
  /** Provider ID extracted from folder name */
  providerId: string;
  /** Model ID extracted from folder name */
  modelId: string;
  /** Instance number for duplicate model selections */
  instanceNumber: number;
  /** Branch name associated with this worktree */
  branch: string;
  /** Display label for the model */
  displayLabel: string;
  /** Full worktree metadata */
  worktreeMetadata?: WorktreeMetadata;
}

export interface AgentGroup {
  /** Group name (e.g., "agent-manager-2", "contributing") */
  name: string;
  /** Sessions within this group (one per model instance) */
  sessions: AgentGroupSession[];
  /** Timestamp of last activity (most recent session) */
  lastActive: number;
  /** Total session count */
  sessionCount: number;
}

interface AgentGroupsState {
  /** All discovered agent groups from .openchamber folder */
  groups: AgentGroup[];
  /** Currently selected group name */
  selectedGroupName: string | null;
  /** Currently selected session ID within the group */
  selectedSessionId: string | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
}

interface AgentGroupsActions {
  /** Load/refresh agent groups from .openchamber folder */
  loadGroups: () => Promise<void>;
  /** Select a group */
  selectGroup: (groupName: string | null) => void;
  /** Select a session within the current group */
  selectSession: (sessionId: string | null) => void;
  /** Get the currently selected group */
  getSelectedGroup: () => AgentGroup | null;
  /** Get the currently selected session */
  getSelectedSession: () => AgentGroupSession | null;
  /** Clear error */
  clearError: () => void;
}

type AgentGroupsStore = AgentGroupsState & AgentGroupsActions;

/**
 * Parse a worktree folder name into group components.
 * Expected format: `<group-name>-<provider>-<model>-<instance>`
 * 
 * Example: "agent-manager-2-github-copilot-claude-opus-4-5-1"
 * - groupName: "agent-manager-2"
 * - provider: "github-copilot"
 * - model: "claude-opus-4-5"
 * - instance: 1
 */
function parseWorktreeFolderName(folderName: string): {
  groupName: string;
  providerId: string;
  modelId: string;
  instanceNumber: number;
} | null {
  // Match pattern: ends with -<number>
  const instanceMatch = folderName.match(/-(\d+)$/);
  if (!instanceMatch) {
    return null;
  }
  
  const instanceNumber = parseInt(instanceMatch[1], 10);
  const withoutInstance = folderName.slice(0, -instanceMatch[0].length);
  
  // Known provider patterns (ordered by specificity)
  const knownProviders = [
    'github-copilot',
    'opencode',
    'anthropic',
    'openai',
    'google',
    'aws-bedrock',
    'azure',
    'groq',
    'ollama',
    'together',
    'deepseek',
    'mistral',
    'cohere',
    'fireworks',
    'perplexity',
    'xai',
  ];
  
  // Try to find a known provider in the string
  for (const provider of knownProviders) {
    const providerIndex = withoutInstance.lastIndexOf(`-${provider}-`);
    if (providerIndex !== -1) {
      const groupName = withoutInstance.slice(0, providerIndex);
      const afterProvider = withoutInstance.slice(providerIndex + provider.length + 2);
      const modelId = afterProvider;
      
      if (groupName && modelId) {
        return {
          groupName,
          providerId: provider,
          modelId,
          instanceNumber,
        };
      }
    }
  }
  
  // Fallback: try to split by common patterns
  // Pattern: <group>-<single-word-provider>-<model>-<instance>
  const parts = withoutInstance.split('-');
  if (parts.length >= 3) {
    // Assume last part is model, second-to-last might be provider
    // This is a heuristic and may need adjustment
    const potentialModel = parts.slice(-2).join('-');
    const potentialProvider = parts.slice(-3, -2).join('-');
    const potentialGroup = parts.slice(0, -3).join('-');
    
    if (potentialGroup && potentialProvider && potentialModel) {
      return {
        groupName: potentialGroup,
        providerId: potentialProvider,
        modelId: potentialModel,
        instanceNumber,
      };
    }
  }
  
  return null;
}

const normalize = (value: string): string => {
  if (!value) return '';
  const replaced = value.replace(/\\/g, '/');
  if (replaced === '/') return '/';
  return replaced.replace(/\/+$/, '');
};

export const useAgentGroupsStore = create<AgentGroupsStore>()(
  devtools(
    (set, get) => ({
      groups: [],
      selectedGroupName: null,
      selectedSessionId: null,
      isLoading: false,
      error: null,

      loadGroups: async () => {
        const currentDirectory = useDirectoryStore.getState().currentDirectory;
        if (!currentDirectory) {
          set({ groups: [], isLoading: false, error: 'No project directory selected' });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          const normalizedProject = normalize(currentDirectory);
          const openchamberPath = `${normalizedProject}/${OPENCHAMBER_DIR}`;

          // First check if .openchamber directory exists
          let dirEntries: Array<{ name: string; path: string; isDirectory: boolean }> = [];
          try {
            const projectEntries = await opencodeClient.listLocalDirectory(normalizedProject);
            const openchamberExists = projectEntries.some(
              (entry) => entry.name === OPENCHAMBER_DIR && entry.isDirectory
            );
            
            if (openchamberExists) {
              dirEntries = await opencodeClient.listLocalDirectory(openchamberPath);
            }
          } catch (err) {
            console.debug('Failed to list .openchamber directory:', err);
          }

          // Filter to only directories (worktrees)
          const worktreeFolders = dirEntries.filter((entry) => entry.isDirectory);

          // Get git worktree info for metadata
          let worktreeInfoList: Awaited<ReturnType<typeof listWorktrees>> = [];
          try {
            worktreeInfoList = await listWorktrees(normalizedProject);
          } catch (err) {
            console.debug('Failed to list git worktrees:', err);
          }

          // Create a map for quick lookup
          const worktreeInfoMap = new Map(
            worktreeInfoList.map((info) => [normalize(info.worktree), info])
          );

          // Parse folders and group by group name
          const groupsMap = new Map<string, AgentGroupSession[]>();

          for (const folder of worktreeFolders) {
            const parsed = parseWorktreeFolderName(folder.name);
            if (!parsed) {
              continue;
            }

            const fullPath = normalize(folder.path) || `${openchamberPath}/${folder.name}`;
            const worktreeInfo = worktreeInfoMap.get(fullPath);
            
            const session: AgentGroupSession = {
              id: folder.name,
              path: fullPath,
              providerId: parsed.providerId,
              modelId: parsed.modelId,
              instanceNumber: parsed.instanceNumber,
              branch: worktreeInfo?.branch ?? '',
              displayLabel: `${parsed.providerId}/${parsed.modelId}`,
              worktreeMetadata: worktreeInfo
                ? mapWorktreeToMetadata(normalizedProject, worktreeInfo)
                : undefined,
            };

            const existing = groupsMap.get(parsed.groupName);
            if (existing) {
              existing.push(session);
            } else {
              groupsMap.set(parsed.groupName, [session]);
            }
          }

          // Convert map to array and sort
          const groups: AgentGroup[] = Array.from(groupsMap.entries()).map(
            ([name, sessions]) => ({
              name,
              sessions: sessions.sort((a, b) => {
                // Sort by provider, then model, then instance
                const providerCmp = a.providerId.localeCompare(b.providerId);
                if (providerCmp !== 0) return providerCmp;
                const modelCmp = a.modelId.localeCompare(b.modelId);
                if (modelCmp !== 0) return modelCmp;
                return a.instanceNumber - b.instanceNumber;
              }),
              lastActive: Date.now(), // TODO: Get actual timestamp from session metadata
              sessionCount: sessions.length,
            })
          );

          // Sort groups by name (could also sort by lastActive)
          groups.sort((a, b) => a.name.localeCompare(b.name));

          set({ groups, isLoading: false, error: null });
        } catch (err) {
          console.error('Failed to load agent groups:', err);
          set({
            groups: [],
            isLoading: false,
            error: err instanceof Error ? err.message : 'Failed to load agent groups',
          });
        }
      },

      selectGroup: (groupName) => {
        const { groups } = get();
        const group = groups.find((g) => g.name === groupName);
        
        set({
          selectedGroupName: groupName,
          // Auto-select first session when selecting a group
          selectedSessionId: group?.sessions[0]?.id ?? null,
        });
      },

      selectSession: (sessionId) => {
        set({ selectedSessionId: sessionId });
      },

      getSelectedGroup: () => {
        const { groups, selectedGroupName } = get();
        if (!selectedGroupName) return null;
        return groups.find((g) => g.name === selectedGroupName) ?? null;
      },

      getSelectedSession: () => {
        const { selectedSessionId } = get();
        const group = get().getSelectedGroup();
        if (!group || !selectedSessionId) return null;
        return group.sessions.find((s) => s.id === selectedSessionId) ?? null;
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    { name: 'agent-groups-store' }
  )
);
