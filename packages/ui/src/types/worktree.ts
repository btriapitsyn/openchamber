export interface WorktreeMetadata {

  /**
   * Worktree origin.
   * - sdk: created/managed by OpenCode SDK worktrees
   * - legacy: git worktree under <project>/.openchamber
   */
  source?: 'sdk' | 'legacy';

  path: string;

  projectDirectory: string;

  branch: string;

  label: string;

  /** SDK worktree name (slug), if available. */
  name?: string;

  kind?: 'pr' | 'standard';

  /**
   * Branch/ref this worktree was created from (intended integration target).
   * For SDK worktrees this is typically the user-selected base branch.
   */
  createdFromBranch?: string;

  relativePath?: string;

  status?: {
    isDirty: boolean;
    ahead?: number;
    behind?: number;
    upstream?: string | null;
  };
}

export type WorktreeMap = Map<string, WorktreeMetadata>;
