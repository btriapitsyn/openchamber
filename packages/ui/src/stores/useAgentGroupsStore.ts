import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { opencodeClient } from '@/lib/opencode/client';
import { useDirectoryStore } from './useDirectoryStore';
import type { WorktreeMetadata } from '@/types/worktree';
import { listWorktrees, mapWorktreeToMetadata } from '@/lib/git/worktreeService';
import type { Session } from '@opencode-ai/sdk';

const OPENCHAMBER_DIR = '.openchamber';

/**
 * Agent group session parsed from OpenCode session titles.
 * Session titles follow pattern: `groupSlug/provider/model` or `groupSlug/provider/model/index`
 * Model can contain `/` for creator/model format (e.g., `anthropic/claude-opus-4-5`)
 *
 * Examples:
 * - `feature/opencode/claude-sonnet-4-5` → group="feature", provider="opencode", model="claude-sonnet-4-5"
 * - `feature/opencode/claude-sonnet-4-1/2` → group="feature", provider="opencode", model="claude-sonnet-4-1", index=2
 * - `feature/openrouter/anthropic/claude-opus-4-5` → group="feature", provider="openrouter", model="anthropic/claude-opus-4-5"
 */
export interface AgentGroupSession {
  /** OpenCode session ID */
  id: string;
  /** Full worktree path (from session.directory) */
  path: string;
  /** Provider ID extracted from title */
  providerId: string;
  /** Model ID extracted from title (may contain / for creator/model format) */
  modelId: string;
  /** Instance number for duplicate model selections (default: 1) */
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
  /** Timestamp of last activity (most recent session update) */
  lastActive: number;
  /** Total session count */
  sessionCount: number;
}

interface AgentGroupsState {
  /** All discovered agent groups from session titles */
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
  /** Load/refresh agent groups from OpenCode sessions */
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

const normalize = (value: string): string => {
  if (!value) return '';
  const replaced = value.replace(/\\/g, '/');
  if (replaced === '/') return '/';
  return replaced.replace(/\/+$/, '');
};

/**
 * Parse a session title to extract group, provider, model, and index.
 * Title format: groupSlug/provider/model[/index]
 *
 * The groupSlug is always the first segment (cannot contain `/` as it's sanitized).
 * The provider is always the second segment.
 * Everything after the provider (excluding numeric index) is the model.
 * Model can contain `/` for creator/model format.
 *
 * Examples:
 * - "feature/opencode/claude-sonnet-4-5" → { groupSlug: "feature", provider: "opencode", model: "claude-sonnet-4-5", index: 1 }
 * - "feature/opencode/claude-sonnet-4-1/2" → { groupSlug: "feature", provider: "opencode", model: "claude-sonnet-4-1", index: 2 }
 * - "feature/openrouter/anthropic/claude-opus-4-5" → { groupSlug: "feature", provider: "openrouter", model: "anthropic/claude-opus-4-5", index: 1 }
 * - "my-task/anthropic/claude-sonnet-4/1" → { groupSlug: "my-task", provider: "anthropic", model: "claude-sonnet-4", index: 1 }
 */
function parseSessionTitle(title: string | undefined): {
  groupSlug: string;
  provider: string;
  model: string;
  index: number;
} | null {
  if (!title) return null;

  const parts = title.split('/');
  if (parts.length < 3) return null;

  // First part is always groupSlug (cannot contain / or spaces as it's sanitized by toGitSafeSlug)
  const groupSlug = parts[0];
  if (!groupSlug || groupSlug.includes(' ')) return null;

  // Second part is always provider
  const provider = parts[1];
  if (!provider) return null;

  // Check if last part is a numeric index
  const lastPart = parts[parts.length - 1];
  const lastPartNum = parseInt(lastPart, 10);
  const hasIndex = parts.length >= 4 && !isNaN(lastPartNum) && String(lastPartNum) === lastPart;

  // Model is everything from parts[2] to end (excluding index if present)
  const modelParts = hasIndex
    ? parts.slice(2, -1)
    : parts.slice(2);

  // Must have at least one model part
  if (modelParts.length === 0) {
    return null;
  }

  const model = modelParts.join('/');

  return {
    groupSlug,
    provider,
    model,
    index: hasIndex ? lastPartNum : 1,
  };
}

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

        // Check if we're inside a .openchamber worktree - if so, don't reload
        // This prevents groups from disappearing when switching to a worktree session
        const normalizedCurrent = normalize(currentDirectory);
        if (normalizedCurrent.includes(`/${OPENCHAMBER_DIR}/`)) {
          // We're inside a worktree, don't reload groups
          set({ isLoading: false });
          return;
        }

        const previousGroups = get().groups;
        set({ isLoading: true, error: null });

        try {
          const apiClient = opencodeClient.getApiClient();

          // Fetch all sessions from the main project directory
          // All worktree sessions are visible from here
          const response = await apiClient.session.list({
            query: { directory: normalizedCurrent },
          });
          const allSessions: Session[] = Array.isArray(response.data) ? response.data : [];

          // Get git worktree info for metadata
          let worktreeInfoMap = new Map<string, Awaited<ReturnType<typeof listWorktrees>>[number]>();
          try {
            const worktreeInfoList = await listWorktrees(normalizedCurrent);
            worktreeInfoMap = new Map(
              worktreeInfoList.map((info) => [normalize(info.worktree), info])
            );
          } catch {
            console.debug('Failed to list git worktrees');
          }

          // Parse sessions and group by groupSlug
          const groupsMap = new Map<string, AgentGroupSession[]>();

          for (const session of allSessions) {
            const parsed = parseSessionTitle(session.title);
            if (!parsed) continue; // Skip sessions without valid agent group title

            const sessionPath = normalize(session.directory);
            const worktreeInfo = worktreeInfoMap.get(sessionPath);

            const agentSession: AgentGroupSession = {
              id: session.id,
              path: sessionPath,
              providerId: parsed.provider,
              modelId: parsed.model,
              instanceNumber: parsed.index,
              branch: worktreeInfo?.branch ?? '',
              displayLabel: `${parsed.provider}/${parsed.model}`,
              worktreeMetadata: worktreeInfo
                ? mapWorktreeToMetadata(normalizedCurrent, worktreeInfo)
                : undefined,
            };

            const existing = groupsMap.get(parsed.groupSlug);
            if (existing) {
              existing.push(agentSession);
            } else {
              groupsMap.set(parsed.groupSlug, [agentSession]);
            }
          }

          // Convert map to array and sort
          const groups: AgentGroup[] = Array.from(groupsMap.entries()).map(
            ([name, sessions]) => {
              // Find the most recent session update time for lastActive
              const lastActive = sessions.reduce((max, s) => {
                // Find the original session to get the time
                const originalSession = allSessions.find((os) => os.id === s.id);
                const updatedTime = originalSession?.time?.updated ?? 0;
                return Math.max(max, updatedTime);
              }, 0);

              return {
                name,
                sessions: sessions.sort((a, b) => {
                  // Sort by provider, then model, then instance
                  const providerCmp = a.providerId.localeCompare(b.providerId);
                  if (providerCmp !== 0) return providerCmp;
                  const modelCmp = a.modelId.localeCompare(b.modelId);
                  if (modelCmp !== 0) return modelCmp;
                  return a.instanceNumber - b.instanceNumber;
                }),
                lastActive: lastActive || Date.now(),
                sessionCount: sessions.length,
              };
            }
          );

          // Sort groups by name
          groups.sort((a, b) => a.name.localeCompare(b.name));

          set({ groups, isLoading: false, error: null });
        } catch (err) {
          console.error('Failed to load agent groups:', err);
          // Preserve existing groups on error to avoid UI flickering
          set({
            groups: previousGroups.length > 0 ? previousGroups : [],
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
