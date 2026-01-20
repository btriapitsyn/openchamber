import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { getSafeStorage } from './utils/safeStorage';
import type { PrStatus, PrReviewThread, PrStatusCheck } from '@/lib/api/types';

export interface AutoReviewItem {
  id: string;
  type: 'conflict' | 'check' | 'comment';
  priority: number;
  createdAt: number;
  data: PrStatusCheck | PrReviewThread | { mergeable: string; mergeStateStatus: string };
}

const INFRASTRUCTURE_CHECK_PATTERNS = [
  /claude-review/i,
  /anthropic/i,
  /openai/i,
  /gpt/i,
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /oauth/i,
  /license/i,
  /dependency[_-]?review/i,
];

interface AutoReviewState {
  enabled: boolean;
  sentItemIds: Set<string>;
  autoReviewSessionIds: Set<string>;
  lastPrStatus: PrStatus | null;
  activeDirectory: string | null;
  stats: {
    totalSent: number;
    checksFixed: number;
    commentsAddressed: number;
  };
}

interface AutoReviewActions {
  setEnabled: (enabled: boolean, directory?: string) => void;
  toggle: (directory?: string) => void;
  updatePrStatus: (prStatus: PrStatus | null) => void;
  markSent: (itemId: string, type: 'conflict' | 'check' | 'comment') => void;
  getNextItem: () => AutoReviewItem | null;
  wasItemSent: (itemId: string) => boolean;
  addAutoReviewSession: (sessionId: string) => void;
  removeAutoReviewSession: (sessionId: string) => void;
  isAutoReviewSession: (sessionId: string) => boolean;
  reset: () => void;
  generatePromptForItem: (item: AutoReviewItem) => string;
}

type AutoReviewStore = AutoReviewState & AutoReviewActions;

const initialState: AutoReviewState = {
  enabled: false,
  sentItemIds: new Set(),
  autoReviewSessionIds: new Set(),
  lastPrStatus: null,
  activeDirectory: null,
  stats: {
    totalSent: 0,
    checksFixed: 0,
    commentsAddressed: 0,
  },
};

export const useAutoReviewStore = create<AutoReviewStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setEnabled: (enabled: boolean, directory?: string) => {
        set({
          enabled,
          activeDirectory: enabled ? (directory ?? get().activeDirectory) : null,
          sentItemIds: enabled ? new Set() : get().sentItemIds,
        });
      },

      toggle: (directory?: string) => {
        const { enabled } = get();
        get().setEnabled(!enabled, directory);
      },

      updatePrStatus: (prStatus: PrStatus | null) => {
        set({ lastPrStatus: prStatus });
      },

      markSent: (itemId: string, type: 'conflict' | 'check' | 'comment') => {
        set((state) => {
          const newSentItemIds = new Set(state.sentItemIds);
          newSentItemIds.add(itemId);
          return {
            sentItemIds: newSentItemIds,
            stats: {
              ...state.stats,
              totalSent: state.stats.totalSent + 1,
              checksFixed: type === 'check' ? state.stats.checksFixed + 1 : state.stats.checksFixed,
              commentsAddressed: type === 'comment' ? state.stats.commentsAddressed + 1 : state.stats.commentsAddressed,
            },
          };
        });
      },

      getNextItem: () => {
        const { lastPrStatus, sentItemIds, enabled } = get();
        
        if (!enabled || !lastPrStatus) {
          return null;
        }

        const items: AutoReviewItem[] = [];

        const PRIORITY_CONFLICT = 0;
        const PRIORITY_CHECK = 1;
        const PRIORITY_COMMENT = 2;

        const mergeable = lastPrStatus.mergeable?.toUpperCase();
        const mergeStateStatus = lastPrStatus.mergeStateStatus?.toUpperCase();
        const hasMergeConflict = mergeable === 'CONFLICTING' || mergeStateStatus === 'DIRTY';
        if (hasMergeConflict) {
          const conflictId = 'conflict:merge';
          if (!sentItemIds.has(conflictId)) {
            items.push({
              id: conflictId,
              type: 'conflict',
              priority: PRIORITY_CONFLICT,
              createdAt: Date.now(),
              data: { mergeable: mergeable || '', mergeStateStatus: mergeStateStatus || '' },
            });
          }
        }

        const checks = lastPrStatus.statusCheckRollup || [];
        for (const check of checks) {
          const checkName = check.name || check.context || '';
          if (!checkName) continue;

          const conclusion = check.conclusion?.toLowerCase();
          const status = check.status?.toLowerCase();
          const isFailed = conclusion === 'failure' || conclusion === 'error' || 
              status === 'failure' || status === 'error';
          
          if (!isFailed) continue;

          const isInfraCheck = INFRASTRUCTURE_CHECK_PATTERNS.some(
            (pattern) => pattern.test(checkName)
          );
          if (isInfraCheck) continue;

          const itemId = `check:${checkName}`;
          if (!sentItemIds.has(itemId)) {
            items.push({
              id: itemId,
              type: 'check',
              priority: PRIORITY_CHECK,
              createdAt: Date.now(),
              data: check,
            });
          }
        }

        const threads = lastPrStatus.reviewThreads || [];
        const unresolvedThreads = threads
          .filter((t) => !t.isResolved && !t.isOutdated)
          .sort((a, b) => {
            const aTime = a.comments[0]?.createdAt ? new Date(a.comments[0].createdAt).getTime() : 0;
            const bTime = b.comments[0]?.createdAt ? new Date(b.comments[0].createdAt).getTime() : 0;
            return aTime - bTime;
          });

        for (const thread of unresolvedThreads) {
          const itemId = `comment:${thread.id}`;
          if (!sentItemIds.has(itemId)) {
            items.push({
              id: itemId,
              type: 'comment',
              priority: PRIORITY_COMMENT,
              createdAt: thread.comments[0]?.createdAt 
                ? new Date(thread.comments[0].createdAt).getTime() 
                : Date.now(),
              data: thread,
            });
          }
        }

        items.sort((a, b) => {
          if (a.priority !== b.priority) {
            return a.priority - b.priority;
          }
          return a.createdAt - b.createdAt;
        });

        return items.length > 0 ? items[0] : null;
      },

      wasItemSent: (itemId: string) => {
        return get().sentItemIds.has(itemId);
      },

      addAutoReviewSession: (sessionId: string) => {
        set((state) => {
          const newSet = new Set(state.autoReviewSessionIds);
          newSet.add(sessionId);
          return { autoReviewSessionIds: newSet };
        });
      },

      removeAutoReviewSession: (sessionId: string) => {
        set((state) => {
          const newSet = new Set(state.autoReviewSessionIds);
          newSet.delete(sessionId);
          return { autoReviewSessionIds: newSet };
        });
      },

      isAutoReviewSession: (sessionId: string) => {
        return get().autoReviewSessionIds.has(sessionId);
      },

      reset: () => {
        set(initialState);
      },

      generatePromptForItem: (item: AutoReviewItem) => {
        if (item.type === 'conflict') {
          return `# Merge Conflict Resolution Required

This PR has merge conflicts that must be resolved before it can be merged.

## Your Task

1. Run \`git status\` to see which files have conflicts
2. Run \`git fetch origin\` to ensure you have the latest base branch
3. Run \`git merge origin/main\` (or the appropriate base branch) to pull in changes
4. For each conflicted file:
   - Open the file and understand both sides of the conflict
   - Choose the correct resolution that preserves intended functionality from both branches
   - Remove the conflict markers (<<<<<<<, =======, >>>>>>>)
5. Run \`git add\` on resolved files
6. Commit the merge resolution with a clear message
7. Push ALL local changes to remote (including any unrelated uncommitted work)

Be careful to preserve the intent of both branches when resolving conflicts.`;
        }

        if (item.type === 'check') {
          const check = item.data as PrStatusCheck;
          const checkName = check.name || check.context || 'Unknown';
          return `# CI Check Failed: ${checkName}

The following CI check has failed:

**Check:** ${checkName}
**Status:** ${check.conclusion || check.status}
${check.detailsUrl ? `**Details URL:** ${check.detailsUrl}` : ''}

## Your Task

1. First, fetch the error logs from the check details
${check.detailsUrl ? `   - Visit or fetch: ${check.detailsUrl}` : '   - Look for error output in the CI logs'}
2. Analyze the failure to determine its type:
   - **Code Issue**: Tests failing, lint errors, type errors, build failures due to code problems
   - **Infrastructure Issue**: Missing API keys, secrets, environment variables, external service failures
3. If it's an **infrastructure issue** (missing secrets, API keys, environment config):
   - STOP - Do not attempt to fix this through code changes
   - Report back: "This is an infrastructure issue requiring manual configuration: [describe the issue]"
4. If it's a **code issue**:
   - Make the necessary code changes to fix the issue
   - Commit your fix with a clear message
5. Push ALL local changes to remote (including any unrelated uncommitted work)

Focus on fixing the root cause, not just suppressing the error.`;
        }

        const thread = item.data as PrReviewThread;
        const comment = thread.comments[0];
        const location = comment?.line ? `${comment.path}:${comment.line}` : comment?.path || 'Unknown';
        
        return `# PR Review Comment to Address

A reviewer has left feedback that needs to be addressed:

**Location:** \`${location}\`
**Author:** ${comment?.author?.login || 'Unknown'}

**Comment:**
> ${comment?.body?.split('\n').join('\n> ') || 'No content'}

## Important

**PR review comments may be incorrect.** Always do your own independent research before implementing any suggested change. Verify that:
- The reviewer's understanding of the code is accurate
- The suggested change is actually beneficial
- The change aligns with the codebase patterns and architecture

## Your Task

1. Read the file at \`${comment?.path || 'the specified location'}\` and understand the full context
2. **Independently verify** whether the reviewer's feedback is correct
3. If the comment is **valid**: Make the necessary code changes
4. If the comment is **invalid or already addressed**:
   - Reply to the PR comment explaining why (use \`gh pr comment\` or \`gh api\`)
   - Check if there are other similar invalid comments from this reviewer and address those too
   - Do NOT make unnecessary code changes
5. Commit any fixes with a clear message referencing the review
6. Push ALL local changes to remote (including any unrelated uncommitted work)`;
      },
    }),
    {
      name: 'openchamber-auto-review',
      storage: createJSONStorage(() => getSafeStorage()),
      partialize: (state) => ({
        enabled: state.enabled,
        activeDirectory: state.activeDirectory,
        stats: state.stats,
        sentItemIds: Array.from(state.sentItemIds),
        autoReviewSessionIds: Array.from(state.autoReviewSessionIds),
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<AutoReviewState> & {
          sentItemIds?: string[];
          autoReviewSessionIds?: string[];
        };
        return {
          ...current,
          ...persistedState,
          sentItemIds: new Set(persistedState?.sentItemIds || []),
          autoReviewSessionIds: new Set(persistedState?.autoReviewSessionIds || []),
        };
      },
    }
  )
);

export const useHasPendingItems = () => {
  return useAutoReviewStore((state) => {
    if (!state.enabled || !state.lastPrStatus) return false;
    
    const mergeable = state.lastPrStatus.mergeable?.toUpperCase();
    const mergeStateStatus = state.lastPrStatus.mergeStateStatus?.toUpperCase();
    const hasMergeConflict = mergeable === 'CONFLICTING' || mergeStateStatus === 'DIRTY';
    if (hasMergeConflict && !state.sentItemIds.has('conflict:merge')) {
      return true;
    }
    
    const checks = state.lastPrStatus.statusCheckRollup || [];
    const failedChecks = checks.filter((c) => {
      const checkName = c.name || c.context || '';
      if (!checkName) return false;
      const isInfraCheck = INFRASTRUCTURE_CHECK_PATTERNS.some((p) => p.test(checkName));
      if (isInfraCheck) return false;
      const conclusion = c.conclusion?.toLowerCase();
      const status = c.status?.toLowerCase();
      return conclusion === 'failure' || conclusion === 'error' || 
             status === 'failure' || status === 'error';
    });
    
    const threads = state.lastPrStatus.reviewThreads || [];
    const activeThreads = threads.filter((t) => !t.isResolved && !t.isOutdated);
    
    const pendingChecks = failedChecks.filter((c) => !state.sentItemIds.has(`check:${c.name || c.context}`));
    const pendingComments = activeThreads.filter((t) => !state.sentItemIds.has(`comment:${t.id}`));
    
    return pendingChecks.length > 0 || pendingComments.length > 0;
  });
};

export const usePendingCount = () => {
  return useAutoReviewStore(
    useShallow((state) => {
      if (!state.enabled || !state.lastPrStatus) return { conflicts: 0, checks: 0, comments: 0, total: 0 };
      
      const mergeable = state.lastPrStatus.mergeable?.toUpperCase();
      const mergeStateStatus = state.lastPrStatus.mergeStateStatus?.toUpperCase();
      const hasMergeConflict = mergeable === 'CONFLICTING' || mergeStateStatus === 'DIRTY';
      const pendingConflicts = hasMergeConflict && !state.sentItemIds.has('conflict:merge') ? 1 : 0;
      
      const checks = state.lastPrStatus.statusCheckRollup || [];
      const failedChecks = checks.filter((c) => {
        const checkName = c.name || c.context || '';
        if (!checkName) return false;
        const isInfraCheck = INFRASTRUCTURE_CHECK_PATTERNS.some((p) => p.test(checkName));
        if (isInfraCheck) return false;
        const conclusion = c.conclusion?.toLowerCase();
        const status = c.status?.toLowerCase();
        return conclusion === 'failure' || conclusion === 'error' || 
               status === 'failure' || status === 'error';
      });
      
      const threads = state.lastPrStatus.reviewThreads || [];
      const activeThreads = threads.filter((t) => !t.isResolved && !t.isOutdated);
      
      const pendingChecks = failedChecks.filter((c) => !state.sentItemIds.has(`check:${c.name || c.context}`)).length;
      const pendingComments = activeThreads.filter((t) => !state.sentItemIds.has(`comment:${t.id}`)).length;
      
      return { 
        conflicts: pendingConflicts,
        checks: pendingChecks, 
        comments: pendingComments, 
        total: pendingConflicts + pendingChecks + pendingComments 
      };
    })
  );
};
