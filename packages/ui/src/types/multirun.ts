/**
 * Multi-Run Types
 *
 * Multi-Run starts the same prompt against multiple models in parallel,
 * each in its own git worktree and OpenCode session.
 */

export interface MultiRunModelSelection {
  providerID: string;
  modelID: string;
  displayName?: string;
}

export interface CreateMultiRunParams {
  /** Group name used for worktree directory and branch naming */
  name: string;
  /** Prompt sent to all sessions */
  prompt: string;
  /** Models to run against (must have at least 2 unique) */
  models: MultiRunModelSelection[];
  /** Optional agent to use for all runs */
  agent?: string;

  /** Base branch for new branches (defaults to `HEAD`). */
  worktreeBaseBranch?: string;
}

export interface CreateMultiRunResult {
  /** Session IDs created successfully (in selection order) */
  sessionIds: string[];
  /** First successfully created session ID, if any */
  firstSessionId: string | null;
}
