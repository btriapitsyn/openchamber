use crate::path_utils::expand_tilde_path;
use crate::{DesktopRuntime, SettingsStore};
use anyhow::{anyhow, Context, Result};
use log::{error, info, warn};
use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;
use std::sync::LazyLock;
use tauri::State;
use tokio::fs;
use tokio::io::AsyncReadExt;
use tokio::process::Command;

const GIT_IDENTITY_STORAGE_FILE: &str = "git-identities.json";
const GIT_FILE_DIFF_TIMEOUT_MS: u64 = 15_000;
const GIT_LS_REMOTE_TIMEOUT_MS: u64 = 5_000;
const GIT_FILE_TEXT_MAX_BYTES: u64 = 2_000_000;
const GIT_FILE_IMAGE_MAX_BYTES: u64 = 10_000_000;
// Tauri invoke payloads can become unstable with very large strings (e.g. huge blobs or base64 data URLs).
// Keep a conservative upper bound to ensure the diff IPC response always returns.
const GIT_FILE_IPC_MAX_CHARS: usize = 600_000;

// --- Structs mirroring TypeScript types ---

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusFile {
    pub path: String,
    pub index: String,
    pub working_dir: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub current: String,
    pub tracking: Option<String>,
    pub ahead: i32,
    pub behind: i32,
    pub files: Vec<GitStatusFile>,
    pub is_clean: bool,
    pub diff_stats: Option<HashMap<String, DiffStat>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DiffStat {
    pub insertions: i32,
    pub deletions: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchDetails {
    pub current: bool,
    pub name: String,
    pub commit: String,
    pub label: String,
    pub tracking: Option<String>,
    pub ahead: Option<i32>,
    pub behind: Option<i32>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    pub all: Vec<String>,
    pub current: String,
    pub branches: HashMap<String, GitBranchDetails>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitSummary {
    pub changes: i32,
    pub insertions: i32,
    pub deletions: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitResult {
    pub success: bool,
    pub commit: String,
    pub branch: String,
    pub summary: GitCommitSummary,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitPushResult {
    pub success: bool,
    pub pushed: Vec<GitPushRef>,
    pub repo: String,
    #[serde(rename = "ref")]
    pub ref_: Option<String>, // "ref" is a keyword in Rust
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitPushRef {
    pub local: String,
    pub remote: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitPullResult {
    pub success: bool,
    pub summary: GitCommitSummary,
    pub files: Vec<String>,
    pub insertions: i32,
    pub deletions: i32,
}

fn parse_shortstat(output: &str) -> GitCommitSummary {
    let mut summary = GitCommitSummary {
        changes: 0,
        insertions: 0,
        deletions: 0,
    };

    for line in output
        .split('\n')
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
    {
        for part in line.split(',') {
            let token = part.trim();
            if token.is_empty() {
                continue;
            }

            if token.contains("file changed") {
                if let Some(value) = token.split_whitespace().next() {
                    summary.changes = value.parse().unwrap_or(0);
                }
            } else if token.contains("insertion") {
                if let Some(value) = token.split_whitespace().next() {
                    summary.insertions = value.parse().unwrap_or(0);
                }
            } else if token.contains("deletion") {
                if let Some(value) = token.split_whitespace().next() {
                    summary.deletions = value.parse().unwrap_or(0);
                }
            }
        }
    }

    summary
}

async fn get_head_hash(root: &Path) -> Result<String> {
    let output = run_git(&["rev-parse", "HEAD"], root).await?;
    Ok(output.trim().to_string())
}

async fn get_current_branch_name(root: &Path) -> Result<String> {
    let output = run_git(&["rev-parse", "--abbrev-ref", "HEAD"], root).await?;
    Ok(output.trim().to_string())
}

async fn collect_shortstat_for_range(root: &Path, range: &str) -> Result<GitCommitSummary> {
    let args = ["diff", "--shortstat", range];
    let output = run_git(&args, root).await.unwrap_or_default();
    Ok(parse_shortstat(&output))
}

async fn collect_changed_files_for_range(root: &Path, range: &str) -> Result<Vec<String>> {
    let args = ["diff", "--name-only", range];
    let output = run_git(&args, root).await.unwrap_or_default();
    Ok(output
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .map(|line| line.to_string())
        .collect())
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitIdentityProfile {
    pub id: String,
    pub name: String,
    pub user_name: String,
    pub user_email: String,
    pub ssh_key: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitIdentityProfilesWrapper {
    pub profiles: Vec<GitIdentityProfile>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitIdentitySummary {
    pub user_name: Option<String>,
    pub user_email: Option<String>,
    pub ssh_command: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitLogEntry {
    pub hash: String,
    pub date: String,
    pub message: String,
    pub refs: String,
    pub body: String,
    #[serde(rename = "author_name")]
    pub author_name: String,
    #[serde(rename = "author_email")]
    pub author_email: String,
    pub files_changed: i32,
    pub insertions: i32,
    pub deletions: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitLogResponse {
    pub all: Vec<GitLogEntry>,
    pub latest: Option<GitLogEntry>,
    pub total: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktreeInfo {
    pub worktree: String,
    pub head: Option<String>,
    pub branch: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedCommitMessage {
    pub subject: String,
    pub highlights: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommitFileEntry {
    pub path: String,
    pub insertions: i32,
    pub deletions: i32,
    pub is_binary: bool,
    pub change_type: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GitCommitFilesResponse {
    pub files: Vec<CommitFileEntry>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CommitMessageResponse {
    pub message: GeneratedCommitMessage,
}

// --- Constants & Regexes ---

static WORKTREE_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^worktree (.+)$").unwrap());
static HEAD_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^HEAD (.+)$").unwrap());
static BRANCH_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^branch (.+)$").unwrap());
static FILES_CHANGED_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(\d+)\s+files?\s+changed").unwrap());
static INSERTIONS_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(\d+)\s+insertions?\(\+\)").unwrap());
static DELETIONS_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(\d+)\s+deletions?\(-\)").unwrap());

// --- Helpers ---

async fn run_git(args: &[&str], cwd: &Path) -> Result<String> {
    run_git_with_allowed_exit(args, cwd, &[]).await
}

async fn run_git_with_allowed_exit(
    args: &[&str],
    cwd: &Path,
    allowed_codes: &[i32],
) -> Result<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .kill_on_drop(true)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .env("LC_ALL", "C")
        .output()
        .await
        .context("Failed to execute git command")?;

    if !output.status.success() {
        if let Some(code) = output.status.code() {
            if allowed_codes.contains(&code) {
                return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
            }
        }
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(anyhow!("{}", stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

async fn run_git_bytes_with_allowed_exit_timeout(
    args: &[&str],
    cwd: &Path,
    allowed_codes: &[i32],
    timeout_ms: u64,
) -> Result<Vec<u8>> {
    let output = tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms),
        Command::new("git")
            .args(args)
            .current_dir(cwd)
            .env("GIT_OPTIONAL_LOCKS", "0")
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GCM_INTERACTIVE", "Never")
            .env("LC_ALL", "C")
            .stdin(Stdio::null())
            .kill_on_drop(true)
            .output(),
    )
    .await
    .map_err(|_| anyhow!("Git command timed out after {}ms", timeout_ms))?
    .context("Failed to execute git command")?;

    if !output.status.success() {
        if let Some(code) = output.status.code() {
            if allowed_codes.contains(&code) {
                return Ok(output.stdout);
            }
        }
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(anyhow!("{}", stderr));
    }

    Ok(output.stdout)
}

async fn read_file_bytes_limited(path: &Path, max_bytes: u64) -> Result<(Vec<u8>, bool)> {
    let file = tokio::fs::File::open(path).await?;
    let mut buf = Vec::new();
    let mut limited = file.take(max_bytes);
    limited.read_to_end(&mut buf).await?;

    let truncated = match tokio::fs::metadata(path).await {
        Ok(meta) => meta.len() > max_bytes,
        Err(_) => false,
    };

    Ok((buf, truncated))
}

async fn read_file_bytes_limited_with_timeout(
    path: &Path,
    max_bytes: u64,
    timeout_ms: u64,
) -> Result<(Vec<u8>, bool)> {
    tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms),
        read_file_bytes_limited(path, max_bytes),
    )
    .await
    .map_err(|_| anyhow!("File read timed out after {}ms", timeout_ms))?
}

async fn metadata_with_timeout(path: &Path, timeout_ms: u64) -> Result<std::fs::Metadata> {
    tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms),
        fs::metadata(path),
    )
    .await
    .map_err(|_| anyhow!("Metadata read timed out after {}ms", timeout_ms))?
    .map_err(|e| e.into())
}

fn normalize_relative_path(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                result.pop();
            }
            Component::CurDir => {}
            Component::Normal(part) => result.push(part),
            _ => {}
        }
    }
    result
}

async fn resolve_repo_root(root: &Path) -> PathBuf {
    match run_git(&["rev-parse", "--show-toplevel"], root).await {
        Ok(output) => {
            let trimmed = output.trim();
            if trimmed.is_empty() {
                root.to_path_buf()
            } else {
                PathBuf::from(trimmed)
            }
        }
        Err(_) => root.to_path_buf(),
    }
}

async fn resolve_git_paths(root: &Path, path_str: &str) -> (PathBuf, PathBuf, String) {
    let repo_root = resolve_repo_root(root).await;
    let path_candidate = if path_str.contains(" -> ") {
        path_str
            .split(" -> ")
            .last()
            .unwrap_or(path_str)
            .trim()
            .to_string()
    } else {
        path_str.to_string()
    };

    let input_path = Path::new(&path_candidate);
    let absolute_path = if input_path.is_absolute() {
        input_path.to_path_buf()
    } else {
        let from_root = root.join(input_path);
        if metadata_with_timeout(&from_root, GIT_FILE_DIFF_TIMEOUT_MS)
            .await
            .is_ok()
        {
            from_root
        } else {
            repo_root.join(input_path)
        }
    };

    let relative_path = absolute_path
        .strip_prefix(&repo_root)
        .unwrap_or(input_path)
        .to_path_buf();
    let normalized_relative = normalize_relative_path(&relative_path);
    let mut relative_str = normalized_relative.to_string_lossy().replace('\\', "/");
    if relative_str.is_empty() || Path::new(&relative_str).is_absolute() {
        relative_str = path_candidate;
    }

    (repo_root, absolute_path, relative_str)
}

async fn resolve_path_for_git_show(root: &Path, path_str: &str) -> (PathBuf, PathBuf, String) {
    // Prefer asking git for the repo-root-relative path when possible.
    // This avoids subtle worktree/subdir path prefix issues.
    let path_candidate = if path_str.contains(" -> ") {
        path_str
            .split(" -> ")
            .last()
            .unwrap_or(path_str)
            .trim()
            .to_string()
    } else {
        path_str.to_string()
    };

    let ls_files = run_git(&["ls-files", "--full-name", "--", &path_candidate], root)
        .await
        .unwrap_or_default();
    let resolved = ls_files.lines().next().unwrap_or("").trim();

    let (repo_root, full_path, fallback_relative) = resolve_git_paths(root, &path_candidate).await;
    if !resolved.is_empty() {
        return (
            repo_root,
            full_path,
            resolved.to_string().replace('\\', "/"),
        );
    }

    (repo_root, full_path, fallback_relative)
}

fn append_git_option(args: &mut Vec<String>, value: &Value) {
    match value {
        Value::Null => {}
        Value::Bool(false) => {}
        Value::Bool(true) => {}
        Value::Number(num) => args.push(num.to_string()),
        Value::String(text) => {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                args.push(trimmed.to_string());
            }
        }
        Value::Array(items) => {
            for item in items {
                append_git_option(args, item);
            }
        }
        Value::Object(map) => append_git_option_map(args, map),
    }
}

fn append_git_option_map(args: &mut Vec<String>, map: &serde_json::Map<String, Value>) {
    for (key, value) in map {
        let flag = key.trim();
        if flag.is_empty() {
            continue;
        }

        match value {
            Value::Null | Value::Bool(true) => args.push(flag.to_string()),
            Value::Bool(false) => {}
            Value::String(text) => args.push(format!("{flag}={text}")),
            Value::Number(num) => args.push(format!("{flag}={num}")),
            Value::Array(items) => {
                if items.is_empty() {
                    args.push(flag.to_string());
                } else {
                    for item in items {
                        match item {
                            Value::Null | Value::Bool(true) => args.push(flag.to_string()),
                            Value::Bool(false) => {}
                            Value::String(text) => args.push(format!("{flag}={text}")),
                            Value::Number(num) => args.push(format!("{flag}={num}")),
                            other => append_git_option(args, other),
                        }
                    }
                }
            }
            other => args.push(format!("{flag}={other}")),
        }
    }
}

// Removed unused resolve_workspace_root function

async fn validate_git_path(path: &str, _settings: &SettingsStore) -> Result<PathBuf> {
    let path_buf = expand_tilde_path(path);
    if !path_buf.exists() {
        return Err(anyhow!("Directory does not exist: {}", path));
    }

    if !path_buf.is_absolute() {
        return Err(anyhow!("Path must be absolute"));
    }

    Ok(path_buf)
}

// --- Identity Storage ---

async fn get_identity_storage_path() -> Result<PathBuf> {
    let mut path = dirs::home_dir().ok_or_else(|| anyhow!("Could not find home directory"))?;
    path.push(".config");
    path.push("openchamber");
    fs::create_dir_all(&path).await?;
    path.push(GIT_IDENTITY_STORAGE_FILE);
    Ok(path)
}

async fn load_identities() -> Result<Vec<GitIdentityProfile>> {
    let path = get_identity_storage_path().await?;
    info!("Loading identities from {:?}", path);

    if !path.exists() {
        info!("Identities file does not exist at {:?}", path);
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&path).await?;
    info!("Read {} bytes from identities file", content.len());

    let wrapper: serde_json::Value = match serde_json::from_str(&content) {
        Ok(w) => w,
        Err(e) => {
            error!("Failed to parse identities JSON: {}", e);
            return Err(e.into());
        }
    };

    // Handle both array and object wrapper format if needed, but spec says object with profiles array
    if let Some(profiles) = wrapper.get("profiles") {
        match serde_json::from_value::<Vec<GitIdentityProfile>>(profiles.clone()) {
            Ok(p) => {
                info!("Successfully loaded {} profiles", p.len());
                Ok(p)
            }
            Err(e) => {
                error!("Failed to deserialize profiles array: {}", e);
                // Log the failing JSON segment for debugging
                warn!("Profiles JSON: {}", profiles);
                Err(e.into())
            }
        }
    } else {
        warn!("No 'profiles' key found in identities JSON");
        Ok(Vec::new())
    }
}

async fn save_identities(profiles: Vec<GitIdentityProfile>) -> Result<()> {
    let path = get_identity_storage_path().await?;
    let wrapper = GitIdentityProfilesWrapper { profiles };
    let content = serde_json::to_string_pretty(&wrapper)?;
    fs::write(path, content).await?;
    Ok(())
}

// --- Commands ---

#[tauri::command]
pub async fn check_is_git_repository(
    directory: String,
    state: State<'_, DesktopRuntime>,
) -> Result<bool, String> {
    let path = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;
    match run_git(&["rev-parse", "--is-inside-work-tree"], &path).await {
        Ok(output) => Ok(output.trim().eq_ignore_ascii_case("true")),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn get_git_status(
    directory: String,
    state: State<'_, DesktopRuntime>,
) -> Result<GitStatus, String> {
    let path = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;

    // 1. Get porcelain status
    // Use -uall to show all untracked files individually, not just directories
    let status_output = run_git(&["status", "--porcelain", "-b", "-z", "-uall"], &path)
        .await
        .map_err(|e| e.to_string())?;

    // Parse status output
    let mut files = Vec::new();
    let mut current = String::new();
    let mut tracking = None;
    let mut ahead = 0;
    let mut behind = 0;

    let entries: Vec<&str> = status_output.split('\0').collect();
    let mut i = 0usize;

    while i < entries.len() {
        let entry = entries[i];
        i += 1;

        if entry.is_empty() {
            continue;
        }

        if entry.starts_with("## ") {
            // Branch info: ## main...origin/main [ahead 1, behind 2]
            let branch_line = &entry[3..];
            if let Some((local, remote_part)) = branch_line.split_once("...") {
                current = local.to_string();
                // Parse remote part for ahead/behind
                // Format: origin/main [ahead 1, behind 2] or origin/main
                if let Some(bracket_start) = remote_part.find('[') {
                    tracking = Some(remote_part[..bracket_start].trim().to_string());
                    let stats = &remote_part[bracket_start + 1..remote_part.len() - 1]; // inside brackets
                    for part in stats.split(", ") {
                        if let Some(val) = part.strip_prefix("ahead ") {
                            ahead = val.parse().unwrap_or(0);
                        } else if let Some(val) = part.strip_prefix("behind ") {
                            behind = val.parse().unwrap_or(0);
                        }
                    }
                } else {
                    tracking = Some(remote_part.trim().to_string());
                }
            } else {
                // No remote or initial commit
                current = branch_line.to_string();
            }
            continue;
        }

        // File entries (porcelain v1, -z):
        // - Normal: XY<space>path
        // - Rename/Copy: XY<space>old_path<null>new_path
        if entry.len() >= 4 {
            let index_status = &entry[0..1];
            let working_status = &entry[1..2];
            let mut file_path = &entry[3..];

            // Handle rename/copy by consuming the next NUL-terminated token as the new path.
            let is_rename_or_copy = index_status == "R"
                || working_status == "R"
                || index_status == "C"
                || working_status == "C";
            if is_rename_or_copy && i < entries.len() {
                let next_path = entries[i];
                if !next_path.is_empty() {
                    file_path = next_path;
                    i += 1;
                }
            }

            // Simple-git parsing logic approximation
            files.push(GitStatusFile {
                path: file_path.to_string(),
                index: index_status.trim().to_string(),
                working_dir: working_status.trim().to_string(),
            });
        }
    }

    // 2. Get diff stats (staged and unstaged)
    let mut diff_stats = HashMap::new();

    let collect_stats = |output: String| {
        let mut stats = HashMap::new();
        for line in output.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 3 {
                let insertions = if parts[0] == "-" {
                    0
                } else {
                    parts[0].parse().unwrap_or(0)
                };
                let deletions = if parts[1] == "-" {
                    0
                } else {
                    parts[1].parse().unwrap_or(0)
                };
                let path = parts[2].to_string();
                stats.insert(
                    path,
                    DiffStat {
                        insertions,
                        deletions,
                    },
                );
            }
        }
        stats
    };

    let staged_stats_raw = run_git(&["diff", "--cached", "--numstat"], &path)
        .await
        .unwrap_or_default();
    let working_stats_raw = run_git(&["diff", "--numstat"], &path)
        .await
        .unwrap_or_default();

    let staged_stats = collect_stats(staged_stats_raw);
    let working_stats = collect_stats(working_stats_raw);

    // Merge stats
    let mut all_paths: HashSet<String> = staged_stats.keys().cloned().collect();
    all_paths.extend(working_stats.keys().cloned());

    for p in all_paths {
        let s = staged_stats.get(&p).unwrap_or(&DiffStat {
            insertions: 0,
            deletions: 0,
        });
        let w = working_stats.get(&p).unwrap_or(&DiffStat {
            insertions: 0,
            deletions: 0,
        });
        diff_stats.insert(
            p,
            DiffStat {
                insertions: s.insertions + w.insertions,
                deletions: s.deletions + w.deletions,
            },
        );
    }

    // 3. Handle new/untracked files (manual calculation if needed, or skip if complex)
    // Node implementation does manual read. For now, let's assume files with '??' or 'A'
    // might need stats if they aren't in numstat.
    // NOTE: untracked files don't show up in `git diff --numstat`.
    // We can try `wc -l` logic but Rust fs read is safer.

    for file in &files {
        if (file.working_dir == "?" || file.index == "A") && !diff_stats.contains_key(&file.path) {
            let full_path = path.join(&file.path);
            if let Ok(metadata) = fs::metadata(&full_path).await {
                if metadata.is_file() {
                    if let Ok(content) = fs::read_to_string(&full_path).await {
                        let lines = content.lines().count() as i32;
                        diff_stats.insert(
                            file.path.clone(),
                            DiffStat {
                                insertions: lines,
                                deletions: 0,
                            },
                        );
                    }
                }
            }
        }
    }

    // When there's no upstream yet (e.g. a freshly-created local worktree branch),
    // git status doesn't report ahead/behind. We still want to surface unpublished commits.
    if tracking.is_none() && !current.trim().is_empty() {
        let mut base_candidates: Vec<String> = Vec::new();

        let origin_head = run_git_with_allowed_exit(
            &["symbolic-ref", "-q", "refs/remotes/origin/HEAD"],
            &path,
            &[1],
        )
        .await
        .unwrap_or_default();

        if !origin_head.trim().is_empty() {
            base_candidates.push(origin_head.trim().replace("refs/remotes/", ""));
        }

        base_candidates.push("origin/main".to_string());
        base_candidates.push("origin/master".to_string());
        base_candidates.push("main".to_string());
        base_candidates.push("master".to_string());

        let mut selected_base: Option<String> = None;
        for candidate in base_candidates {
            let verified =
                run_git_with_allowed_exit(&["rev-parse", "--verify", &candidate], &path, &[1])
                    .await
                    .unwrap_or_default();

            if !verified.trim().is_empty() {
                selected_base = Some(candidate);
                break;
            }
        }

        if let Some(base_ref) = selected_base {
            let range = format!("{}..HEAD", base_ref);
            if let Ok(raw) = run_git(&["rev-list", "--count", &range], &path).await {
                if let Ok(count) = raw.trim().parse::<i32>() {
                    ahead = count;
                    behind = 0;
                }
            }
        }
    }

    Ok(GitStatus {
        current,
        tracking,
        ahead,
        behind,
        is_clean: files.is_empty(),
        files,
        diff_stats: Some(diff_stats),
    })
}

#[tauri::command]
pub async fn get_git_diff(
    directory: String,
    path_str: String,
    staged: Option<bool>,
    context_lines: Option<u32>,
    state: State<'_, DesktopRuntime>,
) -> Result<String, String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;

    let mut args = vec!["diff", "--no-color"];
    let context = format!("-U{}", context_lines.unwrap_or(3));
    args.push(&context);

    if staged.unwrap_or(false) {
        args.push("--cached");
    }

    args.push("--");
    args.push(&path_str);

    let output = run_git(&args, &root).await.unwrap_or_default();

    if output.trim().is_empty() && !staged.unwrap_or(false) {
        // Try --no-index for untracked files
        // git diff --no-index -- /dev/null path
        let full_path = root.join(&path_str);
        if full_path.exists() {
            let args_no_index = vec![
                "diff",
                "--no-color",
                &context,
                "--no-index",
                "--",
                "/dev/null",
                &path_str,
            ];
            return run_git_with_allowed_exit(&args_no_index, &root, &[1])
                .await
                .map_err(|e| e.to_string());
        }
    }

    Ok(output)
}

const IMAGE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "avif",
];

fn is_image_file(path: &str) -> bool {
    if let Some(ext) = path.rsplit('.').next() {
        IMAGE_EXTENSIONS.contains(&ext.to_lowercase().as_str())
    } else {
        false
    }
}

fn get_image_mime_type(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    }
}

fn truncate_string_to_char_boundary(mut value: String, max_chars: usize, suffix: &str) -> String {
    if value.len() <= max_chars {
        return value;
    }

    let mut cut = max_chars.min(value.len());
    while cut > 0 && !value.is_char_boundary(cut) {
        cut -= 1;
    }

    value.truncate(cut);
    value.push_str(suffix);
    value
}

fn cap_ipc_payload(value: String) -> String {
    if value.is_empty() {
        return value;
    }

    // Truncating base64 data URLs would produce invalid images; drop instead.
    if value.starts_with("data:") {
        return if value.len() <= GIT_FILE_IPC_MAX_CHARS {
            value
        } else {
            String::new()
        };
    }

    truncate_string_to_char_boundary(
        value,
        GIT_FILE_IPC_MAX_CHARS,
        "\n…(truncated for desktop)\n",
    )
}

async fn run_git_binary(args: &[&str], cwd: &Path) -> Result<Vec<u8>> {
    run_git_bytes_with_allowed_exit_timeout(args, cwd, &[0, 128], GIT_FILE_DIFF_TIMEOUT_MS).await
}

#[tauri::command]
pub async fn get_git_file_diff(
    directory: String,
    path_str: String,
    state: State<'_, DesktopRuntime>,
) -> Result<(String, String), String> {
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
    use tokio::fs;

    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;

    let (repo_root, full_path, relative_path) = resolve_path_for_git_show(&root, &path_str).await;
    let is_image = is_image_file(&relative_path);
    let mime_type = if is_image {
        get_image_mime_type(&relative_path)
    } else {
        ""
    };

    // Original from HEAD
    let original = if is_image {
        // For images, get binary content and convert to data URL
        let original_spec = format!("HEAD:{}", relative_path);
        match run_git_binary(&["show", &original_spec], &repo_root).await {
            Ok(bytes) if !bytes.is_empty() => {
                if bytes.len() as u64 > GIT_FILE_IMAGE_MAX_BYTES {
                    String::new()
                } else {
                    format!("data:{};base64,{}", mime_type, BASE64.encode(&bytes))
                }
            }
            _ => String::new(),
        }
    } else {
        let original_spec = format!("HEAD:{}", relative_path);
        match run_git_bytes_with_allowed_exit_timeout(
            &["show", original_spec.as_str()],
            &repo_root,
            &[0, 128],
            GIT_FILE_DIFF_TIMEOUT_MS,
        )
        .await
        {
            Ok(bytes) if !bytes.is_empty() => {
                if bytes.len() as u64 > GIT_FILE_TEXT_MAX_BYTES {
                    let mut text = String::from_utf8_lossy(
                        &bytes[..(GIT_FILE_TEXT_MAX_BYTES as usize).min(bytes.len())],
                    )
                    .to_string();
                    text.push_str("\n…(truncated)\n");
                    text
                } else {
                    String::from_utf8_lossy(&bytes).to_string()
                }
            }
            _ => String::new(),
        }
    };

    // Modified from working tree (if file exists)
    let modified =
        if let Ok(metadata) = metadata_with_timeout(&full_path, GIT_FILE_DIFF_TIMEOUT_MS).await {
            if metadata.is_file() {
                if is_image {
                    // For images, read as binary and convert to data URL
                    if metadata.len() > GIT_FILE_IMAGE_MAX_BYTES {
                        String::new()
                    } else {
                        match tokio::time::timeout(
                            std::time::Duration::from_millis(GIT_FILE_DIFF_TIMEOUT_MS),
                            fs::read(&full_path),
                        )
                        .await
                        {
                            Ok(Ok(bytes)) => {
                                format!("data:{};base64,{}", mime_type, BASE64.encode(&bytes))
                            }
                            _ => String::new(),
                        }
                    }
                } else {
                    match read_file_bytes_limited_with_timeout(
                        &full_path,
                        GIT_FILE_TEXT_MAX_BYTES,
                        GIT_FILE_DIFF_TIMEOUT_MS,
                    )
                    .await
                    {
                        Ok((bytes, truncated)) => {
                            let mut text = String::from_utf8_lossy(&bytes).to_string();
                            if truncated {
                                text.push_str("\n…(truncated)\n");
                            }
                            text
                        }
                        Err(_) => String::new(),
                    }
                }
            } else {
                String::new()
            }
        } else {
            String::new()
        };

    Ok((cap_ipc_payload(original), cap_ipc_payload(modified)))
}

#[tauri::command]
pub async fn revert_git_file(
    directory: String,
    file_path: String,
    state: State<'_, DesktopRuntime>,
) -> Result<(), String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;

    // Check if tracked
    let is_tracked = run_git(&["ls-files", "--error-unmatch", &file_path], &root)
        .await
        .is_ok();

    if !is_tracked {
        // Clean untracked
        let _ = run_git(&["clean", "-f", "-d", "--", &file_path], &root).await;
        // Fallback fs remove if git clean failed (e.g. ignored files)
        let full_path = root.join(&file_path);
        if full_path.exists() {
            if full_path.is_dir() {
                let _ = fs::remove_dir_all(full_path).await;
            } else {
                let _ = fs::remove_file(full_path).await;
            }
        }
    } else {
        // Restore staged
        let _ = run_git(&["restore", "--staged", &file_path], &root).await;
        // Restore working
        let _ = run_git(&["restore", &file_path], &root).await;
    }

    Ok(())
}

#[tauri::command]
pub async fn is_linked_worktree(
    directory: String,
    state: State<'_, DesktopRuntime>,
) -> Result<bool, String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;
    let git_dir = run_git(&["rev-parse", "--git-dir"], &root)
        .await
        .unwrap_or_default();
    let common_dir = run_git(&["rev-parse", "--git-common-dir"], &root)
        .await
        .unwrap_or_default();
    Ok(git_dir.trim() != common_dir.trim())
}

#[tauri::command]
pub async fn get_git_branches(
    directory: String,
    state: State<'_, DesktopRuntime>,
) -> Result<GitBranch, String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;

    // Discover actual remote heads so we can drop stale remote-tracking refs
    let allowed_remote_heads: Option<HashSet<String>> =
        match run_git_bytes_with_allowed_exit_timeout(
            &["ls-remote", "--heads", "origin"],
            &root,
            &[0],
            GIT_LS_REMOTE_TIMEOUT_MS,
        )
        .await
        {
            Ok(bytes) => {
                let ls_remote = String::from_utf8_lossy(&bytes);
                let mut set = HashSet::new();
                for line in ls_remote.lines() {
                    if let Some((_, ref_name)) = line.split_once('\t') {
                        if let Some(stripped) = ref_name.trim().strip_prefix("refs/heads/") {
                            set.insert(stripped.to_string());
                        }
                    }
                }
                Some(set)
            }
            Err(err) => {
                warn!("Failed to list remote heads: {}", err);
                None
            }
        };

    // Structured for-each-ref output so we can mark remotes consistently with the web runtime
    let output = run_git(
        &[
            "for-each-ref",
            "--format=%(refname)|%(refname:short)|%(objectname)|%(upstream:short)|%(HEAD)|%(upstream:track)",
            "refs/heads",
            "refs/remotes",
        ],
        &root,
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut all = Vec::new();
    let mut current_branch = String::new();
    let mut branches = HashMap::new();

    for line in output.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() < 6 {
            continue;
        }

        let full_ref = parts[0].trim();
        let short_name = parts[1].trim();
        let commit = parts[2].to_string();
        let upstream = parts[3].trim();
        let is_current = parts[4] == "*";
        let track_info = parts[5];

        let is_remote = full_ref.starts_with("refs/remotes/");

        let normalized_name = if is_remote {
            let (remote_name, branch_name) = match short_name.split_once('/') {
                Some(parts) => parts,
                None => continue, // skip malformed remote ref without branch
            };

            if branch_name == "HEAD" {
                continue;
            }

            if let Some(allowed) = &allowed_remote_heads {
                if !allowed.contains(branch_name) {
                    continue;
                }
            }

            format!("remotes/{}/{}", remote_name, branch_name)
        } else {
            short_name.to_string()
        };

        let tracking = if upstream.is_empty() {
            None
        } else {
            Some(upstream.to_string())
        };

        if is_current {
            current_branch = normalized_name.clone();
        }
        all.push(normalized_name.clone());

        let mut ahead = None;
        let mut behind = None;

        // Parse track info like "[ahead 1, behind 2]"
        if !track_info.is_empty() {
            let content = track_info.trim_matches(|c| c == '[' || c == ']');
            for part in content.split(", ") {
                if let Some(val) = part.strip_prefix("ahead ") {
                    ahead = val.parse().ok();
                } else if let Some(val) = part.strip_prefix("behind ") {
                    behind = val.parse().ok();
                }
            }
        }

        branches.insert(
            normalized_name.clone(),
            GitBranchDetails {
                current: is_current,
                name: normalized_name,
                commit,
                label: short_name.to_string(),
                tracking,
                ahead,
                behind,
            },
        );
    }

    Ok(GitBranch {
        all,
        current: current_branch,
        branches,
    })
}

#[tauri::command]
pub async fn delete_git_branch(
    directory: String,
    branch: String,
    force: Option<bool>,
    state: State<'_, DesktopRuntime>,
) -> Result<(), String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;
    let flag = if force.unwrap_or(false) { "-D" } else { "-d" };
    run_git(&["branch", flag, &branch], &root)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_remote_branch(
    directory: String,
    branch: String,
    remote: Option<String>,
    state: State<'_, DesktopRuntime>,
) -> Result<(), String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());

    // branch might be refs/heads/foo or just foo
    let clean_branch = branch.trim_start_matches("refs/heads/");

    run_git(&["push", &remote_name, "--delete", clean_branch], &root)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_git_worktrees(
    directory: String,
    state: State<'_, DesktopRuntime>,
) -> Result<Vec<GitWorktreeInfo>, String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;
    let output = run_git(&["worktree", "list", "--porcelain"], &root)
        .await
        .map_err(|e| e.to_string())?;

    let mut worktrees = Vec::new();
    let mut current = GitWorktreeInfo {
        worktree: String::new(),
        head: None,
        branch: None,
    };

    for line in output.lines() {
        if let Some(cap) = WORKTREE_REGEX.captures(line) {
            if !current.worktree.is_empty() {
                worktrees.push(current.clone());
                current = GitWorktreeInfo {
                    worktree: String::new(),
                    head: None,
                    branch: None,
                };
            }
            current.worktree = cap[1].to_string();
        } else if let Some(cap) = HEAD_REGEX.captures(line) {
            current.head = Some(cap[1].to_string());
        } else if let Some(cap) = BRANCH_REGEX.captures(line) {
            current.branch = Some(cap[1].trim_start_matches("refs/heads/").to_string());
        } else if line.is_empty() {
            if !current.worktree.is_empty() {
                worktrees.push(current.clone());
                current = GitWorktreeInfo {
                    worktree: String::new(),
                    head: None,
                    branch: None,
                };
            }
        }
    }
    if !current.worktree.is_empty() {
        worktrees.push(current);
    }

    Ok(worktrees)
}

#[tauri::command]
pub async fn add_git_worktree(
    directory: String,
    path_str: String,
    branch: String,
    create_branch: Option<bool>,
    start_point: Option<String>,
    state: State<'_, DesktopRuntime>,
) -> Result<(), String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;

    let mut args = vec!["worktree", "add"];
    if create_branch.unwrap_or(false) {
        args.push("-b");
        args.push(&branch);
    }
    args.push(&path_str);

    if !create_branch.unwrap_or(false) {
        args.push(&branch);
    } else if let Some(start_point) = start_point.as_deref() {
        let start_point = start_point.trim();
        if !start_point.is_empty() {
            args.push(start_point);
        }
    }

    run_git(&args, &root).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn remove_git_worktree(
    directory: String,
    path_str: String,
    force: Option<bool>,
    state: State<'_, DesktopRuntime>,
) -> Result<(), String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;
    let mut args = vec!["worktree", "remove", &path_str];
    if force.unwrap_or(false) {
        args.push("--force");
    }
    run_git(&args, &root).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn ensure_openchamber_ignored(
    directory: String,
    state: State<'_, DesktopRuntime>,
) -> Result<(), String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;
    let exclude_path = root.join(".git/info/exclude");

    if let Some(parent) = exclude_path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }

    let entry = "/.openchamber/\n";
    let mut content = fs::read_to_string(&exclude_path).await.unwrap_or_default();

    if !content.contains("/.openchamber/") {
        if !content.ends_with('\n') && !content.is_empty() {
            content.push('\n');
        }
        content.push_str(entry);
        fs::write(&exclude_path, content)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn create_git_commit(
    directory: String,
    message: String,
    add_all: Option<bool>,
    files: Option<Vec<String>>,
    state: State<'_, DesktopRuntime>,
) -> Result<GitCommitResult, String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;

    if add_all.unwrap_or(false) {
        run_git(&["add", "."], &root)
            .await
            .map_err(|e| e.to_string())?;
    } else if let Some(file_list) = files {
        if !file_list.is_empty() {
            let mut args = vec!["add"];
            args.extend(file_list.iter().map(|s| s.as_str()));
            run_git(&args, &root).await.map_err(|e| e.to_string())?;
        }
    }

    run_git(&["commit", "-m", &message], &root)
        .await
        .map_err(|e| e.to_string())?;

    let commit_hash = get_head_hash(&root).await.map_err(|e| e.to_string())?;
    let branch_name = get_current_branch_name(&root)
        .await
        .unwrap_or_else(|_| "HEAD".to_string());

    let stat_output = run_git(&["log", "-1", "--pretty=", "--shortstat"], &root)
        .await
        .unwrap_or_default();
    let summary = parse_shortstat(&stat_output);

    Ok(GitCommitResult {
        success: true,
        commit: commit_hash,
        branch: branch_name,
        summary,
    })
}

#[tauri::command]
pub async fn git_push(
    directory: String,
    remote: Option<String>,
    branch: Option<String>,
    options: Option<Value>,
    state: State<'_, DesktopRuntime>,
) -> Result<GitPushResult, String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    let explicit_branch = branch
        .as_deref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let mut branch_name = branch.unwrap_or_default();

    let mut args = vec!["push".to_string(), remote_name.clone()];
    if branch_name.is_empty() {
        branch_name = get_current_branch_name(&root).await.unwrap_or_default();
    }

    if !branch_name.is_empty() {
        // If caller didn't specify a branch and there's no upstream configured yet,
        // publish on first push so future pushes/pulls work without extra prompts.
        if !explicit_branch {
            let remote_key = format!("branch.{}.remote", branch_name);
            let merge_key = format!("branch.{}.merge", branch_name);

            let upstream_remote =
                run_git_with_allowed_exit(&["config", "--get", &remote_key], &root, &[1])
                    .await
                    .unwrap_or_default();

            let upstream_merge =
                run_git_with_allowed_exit(&["config", "--get", &merge_key], &root, &[1])
                    .await
                    .unwrap_or_default();

            if upstream_remote.trim().is_empty() || upstream_merge.trim().is_empty() {
                args.push("--set-upstream".to_string());
            }
        }

        args.push(branch_name.clone());
    }

    if let Some(extra) = options.as_ref() {
        append_git_option(&mut args, extra);
    }

    let arg_refs: Vec<&str> = args.iter().map(|value| value.as_str()).collect();

    // TODO: Streaming? Frontend types.ts defines GitPushResult, but doesn't mention streaming response for this call,
    // but Stage 2 plan says "streaming progress events for long operations".
    // Implementing simple await for now as `simple-git` wrapper does in `git-service.js`.

    run_git(&arg_refs, &root).await.map_err(|e| e.to_string())?;

    Ok(GitPushResult {
        success: true,
        pushed: if branch_name.is_empty() {
            vec![]
        } else {
            vec![GitPushRef {
                local: branch_name.clone(),
                remote: format!("{}/{}", remote_name, branch_name),
            }]
        },
        repo: remote_name,
        ref_: if branch_name.is_empty() {
            None
        } else {
            Some(branch_name)
        },
    })
}

#[tauri::command]
pub async fn git_pull(
    directory: String,
    remote: Option<String>,
    branch: Option<String>,
    state: State<'_, DesktopRuntime>,
) -> Result<GitPullResult, String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;
    let r = remote.unwrap_or_else(|| "origin".to_string());
    let b = branch.unwrap_or_default();

    let mut args = vec!["pull", &r];
    if !b.is_empty() {
        args.push(&b);
    }

    let previous_head = get_head_hash(&root).await.ok();

    run_git(&args, &root).await.map_err(|e| e.to_string())?;

    let (summary, files) = if let Some(previous) = previous_head {
        let new_head = get_head_hash(&root).await.unwrap_or(previous.clone());
        if new_head != previous {
            let range = format!("{previous}..{new_head}");
            let summary = collect_shortstat_for_range(&root, &range)
                .await
                .unwrap_or_else(|_| GitCommitSummary {
                    changes: 0,
                    insertions: 0,
                    deletions: 0,
                });
            let files = collect_changed_files_for_range(&root, &range)
                .await
                .unwrap_or_default();
            (summary, files)
        } else {
            (
                GitCommitSummary {
                    changes: 0,
                    insertions: 0,
                    deletions: 0,
                },
                vec![],
            )
        }
    } else {
        (
            GitCommitSummary {
                changes: 0,
                insertions: 0,
                deletions: 0,
            },
            vec![],
        )
    };

    Ok(GitPullResult {
        success: true,
        summary: summary.clone(),
        files,
        insertions: summary.insertions,
        deletions: summary.deletions,
    })
}

#[tauri::command]
pub async fn git_fetch(
    directory: String,
    remote: Option<String>,
    state: State<'_, DesktopRuntime>,
) -> Result<(), String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;
    let r = remote.unwrap_or_else(|| "origin".to_string());
    run_git(&["fetch", &r], &root)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn checkout_branch(
    directory: String,
    branch: String,
    state: State<'_, DesktopRuntime>,
) -> Result<(), String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;
    run_git(&["checkout", &branch], &root)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn create_branch(
    directory: String,
    name: String,
    start_point: Option<String>,
    state: State<'_, DesktopRuntime>,
) -> Result<(), String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;
    let start = start_point.unwrap_or_else(|| "HEAD".to_string());
    run_git(&["checkout", "-b", &name, &start], &root)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_git_log(
    directory: String,
    max_count: Option<i32>,
    from: Option<String>,
    to: Option<String>,
    file: Option<String>,
    state: State<'_, DesktopRuntime>,
) -> Result<GitLogResponse, String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;

    let max = max_count.unwrap_or(50).to_string();
    let mut args = vec![
        "log",
        "--max-count",
        &max,
        "--date=iso",
        "--pretty=format:%H%x1f%an%x1f%ae%x1f%ad%x1f%s%x1e",
        "--shortstat",
    ];

    let range;
    if let (Some(f), Some(t)) = (&from, &to) {
        range = format!("{}..{}", f, t);
        args.push(&range);
    } else if let Some(f) = &from {
        range = format!("{}..HEAD", f);
        args.push(&range);
    } else if let Some(t) = &to {
        args.push(t);
    }

    if let Some(f) = &file {
        args.push("--");
        args.push(f);
    }

    let output = run_git(&args, &root).await.map_err(|e| e.to_string())?;

    let mut entries = Vec::new();
    let entries_raw: Vec<&str> = output.split('\x1e').collect();

    let mut current_header = if !entries_raw.is_empty() {
        entries_raw[0].trim()
    } else {
        ""
    };

    for i in 1..entries_raw.len() {
        let chunk = entries_raw[i];

        if current_header.is_empty() {
            break;
        }

        let header_parts: Vec<&str> = current_header.split('\x1f').collect();
        if header_parts.len() < 5 {
            // Try to recover next header anyway before skipping
            // But current_header is invalid, so we can't push an entry.
            // We still need to update current_header for the next loop.
        } else {
            let hash = header_parts[0];
            let name = header_parts[1];
            let email = header_parts[2];
            let date = header_parts[3];
            let subject = header_parts[4];

            let mut files_changed = 0;
            let mut insertions = 0;
            let mut deletions = 0;

            if let Some(cap) = FILES_CHANGED_REGEX.captures(chunk) {
                files_changed = cap[1].parse().unwrap_or(0);
            }
            if let Some(cap) = INSERTIONS_REGEX.captures(chunk) {
                insertions = cap[1].parse().unwrap_or(0);
            }
            if let Some(cap) = DELETIONS_REGEX.captures(chunk) {
                deletions = cap[1].parse().unwrap_or(0);
            }

            entries.push(GitLogEntry {
                hash: hash.to_string(),
                author_name: name.to_string(),
                author_email: email.to_string(),
                date: date.to_string(),
                message: subject.to_string(),
                body: String::new(),
                refs: String::new(),
                files_changed,
                insertions,
                deletions,
            });
        }

        // Find next header by looking for the line containing \x1f (separator used in format)
        // The chunk contains stats then the next header.
        current_header = "";
        for line in chunk.lines().rev() {
            let trimmed = line.trim();
            if !trimmed.is_empty() && trimmed.contains('\x1f') {
                current_header = trimmed;
                break;
            }
        }
    }

    if entries.is_empty() && !output.is_empty() {
        for line in output.lines() {
            let parts: Vec<&str> = line.split('\x1f').collect();
            if parts.len() >= 5 {
                entries.push(GitLogEntry {
                    hash: parts[0].to_string(),
                    author_name: parts[1].to_string(),
                    author_email: parts[2].to_string(),
                    date: parts[3].to_string(),
                    message: parts[4].to_string(),
                    body: "".to_string(),
                    refs: "".to_string(),
                    files_changed: 0,
                    insertions: 0,
                    deletions: 0,
                });
            }
        }
    }

    Ok(GitLogResponse {
        all: entries.clone(),
        latest: entries.first().cloned(),
        total: entries.len() as i32,
    })
}

#[tauri::command]
pub async fn get_commit_files(
    directory: String,
    hash: String,
    state: State<'_, DesktopRuntime>,
) -> Result<GitCommitFilesResponse, String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;

    // Get numstat for insertions/deletions per file
    let numstat_output = run_git(&["show", "--numstat", "--format=", &hash], &root)
        .await
        .map_err(|e| e.to_string())?;

    let mut files = Vec::new();

    for line in numstat_output.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 3 {
            continue;
        }

        let insertions_raw = parts[0];
        let deletions_raw = parts[1];
        let file_path = parts[2..].join("\t");

        if file_path.is_empty() {
            continue;
        }

        // Binary files show '-' for stats
        let is_binary = insertions_raw == "-" && deletions_raw == "-";
        let insertions = if insertions_raw == "-" {
            0
        } else {
            insertions_raw.parse().unwrap_or(0)
        };
        let deletions = if deletions_raw == "-" {
            0
        } else {
            deletions_raw.parse().unwrap_or(0)
        };

        files.push(CommitFileEntry {
            path: file_path,
            insertions,
            deletions,
            is_binary,
            change_type: "M".to_string(), // Default, will update below
        });
    }

    // Get accurate change types using --name-status
    let name_status_output = run_git(&["show", "--name-status", "--format=", &hash], &root)
        .await
        .unwrap_or_default();

    let mut status_map: HashMap<String, String> = HashMap::new();
    for line in name_status_output.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 2 {
            let status = parts[0].chars().next().unwrap_or('M').to_string();
            let path = parts.last().unwrap_or(&"").to_string();
            status_map.insert(path, status);
        }
    }

    // Update change types
    for file in &mut files {
        let base_path = if file.path.contains(" => ") {
            file.path
                .split(" => ")
                .last()
                .unwrap_or(&file.path)
                .replace(['{', '}'], "")
        } else {
            file.path.clone()
        };

        if let Some(status) = status_map
            .get(&base_path)
            .or_else(|| status_map.get(&file.path))
        {
            file.change_type = status.clone();
        }
    }

    Ok(GitCommitFilesResponse { files })
}

#[tauri::command]
pub async fn get_git_identities() -> Result<Vec<GitIdentityProfile>, String> {
    load_identities().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_git_identity(
    profile: GitIdentityProfile,
) -> Result<GitIdentityProfile, String> {
    let mut profiles = load_identities().await.map_err(|e| e.to_string())?;
    if profiles.iter().any(|p| p.id == profile.id) {
        return Err(format!("Profile with ID {} already exists", profile.id));
    }
    profiles.push(profile.clone());
    save_identities(profiles).await.map_err(|e| e.to_string())?;
    Ok(profile)
}

#[tauri::command]
pub async fn update_git_identity(
    id: String,
    updates: GitIdentityProfile,
) -> Result<GitIdentityProfile, String> {
    let mut profiles = load_identities().await.map_err(|e| e.to_string())?;
    if let Some(idx) = profiles.iter().position(|p| p.id == id) {
        profiles[idx] = updates.clone();
        save_identities(profiles).await.map_err(|e| e.to_string())?;
        Ok(updates)
    } else {
        Err(format!("Profile with ID {} not found", id))
    }
}

#[tauri::command]
pub async fn delete_git_identity(id: String) -> Result<(), String> {
    let mut profiles = load_identities().await.map_err(|e| e.to_string())?;
    let len = profiles.len();
    profiles.retain(|p| p.id != id);
    if profiles.len() == len {
        return Err(format!("Profile with ID {} not found", id));
    }
    save_identities(profiles).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_current_git_identity(
    directory: String,
    state: State<'_, DesktopRuntime>,
) -> Result<GitIdentitySummary, String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;

    let user_name = run_git(&["config", "user.name"], &root).await.ok();
    let user_email = run_git(&["config", "user.email"], &root).await.ok();
    let ssh_command = run_git(&["config", "core.sshCommand"], &root).await.ok();

    Ok(GitIdentitySummary {
        user_name: user_name.filter(|s| !s.is_empty()),
        user_email: user_email.filter(|s| !s.is_empty()),
        ssh_command: ssh_command.filter(|s| !s.is_empty()),
    })
}

#[tauri::command]
pub async fn set_git_identity(
    directory: String,
    profile_id: String,
    state: State<'_, DesktopRuntime>,
) -> Result<GitIdentityProfile, String> {
    let root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;
    let profiles = load_identities().await.map_err(|e| e.to_string())?;

    let profile = profiles
        .into_iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| format!("Profile {} not found", profile_id))?;

    run_git(
        &["config", "--local", "user.name", &profile.user_name],
        &root,
    )
    .await
    .map_err(|e| e.to_string())?;
    run_git(
        &["config", "--local", "user.email", &profile.user_email],
        &root,
    )
    .await
    .map_err(|e| e.to_string())?;

    if let Some(key) = &profile.ssh_key {
        let cmd = format!("ssh -i {}", key);
        run_git(&["config", "--local", "core.sshCommand", &cmd], &root)
            .await
            .map_err(|e| e.to_string())?;
    } else {
        let _ = run_git(&["config", "--local", "--unset", "core.sshCommand"], &root).await;
    }

    Ok(profile)
}

#[tauri::command]
pub async fn generate_commit_message(
    directory: String,
    files: Vec<String>,
    state: State<'_, DesktopRuntime>,
) -> Result<CommitMessageResponse, String> {
    let _root = validate_git_path(&directory, state.settings())
        .await
        .map_err(|e| e.to_string())?;

    // 1. Collect diffs
    let mut diff_summaries = String::new();
    for file in files {
        if let Ok(diff) =
            get_git_diff(directory.clone(), file.clone(), None, None, state.clone()).await
        {
            let trimmed = if diff.len() > 4000 {
                format!("{}\n...", &diff[..4000])
            } else {
                diff
            };
            diff_summaries.push_str(&format!("FILE: {}\n{}\n\n", file, trimmed));
        }
    }

    if diff_summaries.is_empty() {
        return Err("No diffs available for selected files".to_string());
    }

    // 2. Construct prompt (matching server/index.js)
    let prompt = format!(
        r#"You are drafting git commit notes for this codebase. Respond in JSON of the shape {{"subject": string, "highlights": string[]}} (ONLY the JSON in response, no markdown wrappers or anything except JSON) with these rules:
- subject follows our convention: type[optional-scope]: summary (examples: "feat: add diff virtualization", "fix(chat): restore enter key handling")
- allowed types: feat, fix, chore, style, refactor, perf, docs, test, build, ci (choose the best match or fallback to chore)
- summary must be imperative, concise, <= 70 characters, no trailing punctuation
- scope is optional; include only when obvious from filenames/folders; do not invent scopes
- focus on the most impactful user-facing change; if multiple capabilities ship together, align the subject with the dominant theme and use highlights to cover the other major outcomes
- highlights array should contain 2-3 plain sentences (<= 90 chars each) that describe distinct features or UI changes users will notice (e.g. "Add per-file revert action in Changes list"). Avoid subjective benefit statements, marketing tone, repeating the subject, or referencing helper function names. Highlight additions such as new controls/buttons, new actions (e.g. revert), or stored state changes explicitly. Skip highlights if fewer than two meaningful points exist.
- text must be plain (no markdown bullets); each highlight should start with an uppercase verb

Diff summary:
{}"#,
        diff_summaries
    );

    // 3. Call API
    let client = Client::new();
    let res = client
        .post("https://opencode.ai/zen/v1/chat/completions")
        .json(&serde_json::json!({
            "model": "big-pickle",
            "messages": [{ "role": "user", "content": prompt }],
            "max_tokens": 3000,
            "stream": false,
            "reasoning": {
                "effort": "low"
            }
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("API request failed: {}", res.status()));
    }

    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let raw_content = body["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim();

    // 4. Parse JSON
    // Strip markdown code blocks if present
    let cleaned = raw_content
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let message: GeneratedCommitMessage =
        serde_json::from_str(cleaned).map_err(|e| format!("Failed to parse AI response: {}", e))?;

    Ok(CommitMessageResponse { message })
}
