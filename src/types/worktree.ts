export interface WorktreeMetadata {
  /**
   * Absolute filesystem path to the worktree directory.
   */
  path: string;
  /**
   * Root project directory where the worktree is registered.
   */
  projectDirectory: string;
  /**
   * Git branch that backs the worktree (e.g. refs/heads/feature-x).
   */
  branch: string;
  /**
   * Display label (usually short branch name) for UI badges/tooltips.
   */
  label: string;
  /**
   * Relative path from the primary project root (optional convenience).
   */
  relativePath?: string;
  /**
   * Git status snapshot used for warnings during archive/delete operations.
   */
  status?: {
    isDirty: boolean;
    ahead?: number;
    behind?: number;
    upstream?: string | null;
  };
}

export type WorktreeMap = Map<string, WorktreeMetadata>;
