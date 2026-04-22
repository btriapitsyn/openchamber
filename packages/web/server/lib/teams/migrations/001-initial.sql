-- One workspace per connected GitHub org.
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,                 -- uuid
  github_org_login TEXT NOT NULL UNIQUE,
  github_installation_id INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  github_user_id INTEGER NOT NULL,
  github_user_login TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','maintainer','developer','reviewer','viewer')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, github_user_id)
);

-- Append-only activity log for the feed and audit.
CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL,                   -- 'pr.opened', 'review.requested', 'handoff.sent'
  actor_login TEXT,
  repo_full_name TEXT,
  payload_json TEXT NOT NULL,
  happened_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_workspace_time
  ON activity_events(workspace_id, happened_at DESC);

-- Session handoff notifications (metadata only, PR context comes from GitHub live).
CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY,                  -- uuid
  workspace_id TEXT NOT NULL,
  from_login TEXT NOT NULL,
  to_login TEXT NOT NULL,
  session_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,          -- summary, open files, plan, risks
  target_repo TEXT NOT NULL,
  target_pr_number INTEGER,
  status TEXT NOT NULL CHECK(status IN ('sent','accepted','declined','expired')),
  created_at INTEGER NOT NULL,
  responded_at INTEGER
);
