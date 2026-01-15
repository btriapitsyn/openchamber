use crate::path_utils::expand_tilde_path;
use crate::{DesktopRuntime, SettingsStore};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashSet, VecDeque},
    path::{Path, PathBuf},
    process::Command,
    time::UNIX_EPOCH,
};
use tokio::fs;

const DEFAULT_FILE_SEARCH_LIMIT: usize = 60;
const MAX_FILE_SEARCH_LIMIT: usize = 400;
const FILE_SEARCH_MAX_CONCURRENCY: usize = 5;
const FILE_SEARCH_EXCLUDED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".cache",
    "coverage",
    "tmp",
    "logs",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileListEntry {
    name: String,
    path: String,
    is_directory: bool,
    is_file: bool,
    is_symbolic_link: bool,
    size: Option<u64>,
    modified_time: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryListResult {
    directory: String,
    path: String,
    entries: Vec<FileListEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDirectoryResponse {
    success: bool,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSearchHit {
    name: String,
    path: String,
    relative_path: String,
    extension: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFilesResponse {
    root: String,
    count: usize,
    files: Vec<FileSearchHit>,
}

#[derive(Debug)]
enum FsCommandError {
    NotFound,
    AccessDenied,
    NotDirectory,
    OutsideWorkspace,
    Other(String),
}

impl FsCommandError {
    fn to_list_message(&self) -> String {
        match self {
            FsCommandError::NotFound => "Directory not found".to_string(),
            FsCommandError::AccessDenied | FsCommandError::OutsideWorkspace => {
                "Access to directory denied".to_string()
            }
            FsCommandError::NotDirectory => "Specified path is not a directory".to_string(),
            FsCommandError::Other(message) => {
                let _ = message;
                "Failed to list directory".to_string()
            }
        }
    }

    fn to_search_message(&self) -> String {
        match self {
            FsCommandError::NotFound => "Directory not found".to_string(),
            FsCommandError::AccessDenied | FsCommandError::OutsideWorkspace => {
                "Access to directory denied".to_string()
            }
            FsCommandError::NotDirectory => "Specified path is not a directory".to_string(),
            FsCommandError::Other(message) => {
                let _ = message;
                "Failed to search files".to_string()
            }
        }
    }

    fn to_create_message(&self) -> String {
        match self {
            FsCommandError::AccessDenied | FsCommandError::OutsideWorkspace => {
                "Access to directory denied".to_string()
            }
            FsCommandError::NotDirectory => "Parent path must be a directory".to_string(),
            FsCommandError::Other(message) => {
                let _ = message;
                "Failed to create directory".to_string()
            }
            FsCommandError::NotFound => "Parent directory not found".to_string(),
        }
    }
}

impl From<std::io::Error> for FsCommandError {
    fn from(error: std::io::Error) -> Self {
        match error.kind() {
            std::io::ErrorKind::NotFound => FsCommandError::NotFound,
            std::io::ErrorKind::PermissionDenied => FsCommandError::AccessDenied,
            _ => FsCommandError::Other(error.to_string()),
        }
    }
}

#[tauri::command]
pub async fn list_directory(
    path: Option<String>,
    respect_gitignore: Option<bool>,
    state: tauri::State<'_, DesktopRuntime>,
) -> Result<DirectoryListResult, String> {
    let (workspace_roots, default_root) = resolve_workspace_roots(state.settings()).await;
    let resolved_path = resolve_sandboxed_path(path, &workspace_roots, default_root.as_ref())
        .await
        .map_err(|err| err.to_list_message())?;

    let metadata = fs::metadata(&resolved_path)
        .await
        .map_err(|err| FsCommandError::from(err).to_list_message())?;

    if !metadata.is_dir() {
        return Err(FsCommandError::NotDirectory.to_list_message());
    }

    // Re-check boundary after canonicalization to guard against traversal
    if !workspace_roots.is_empty()
        && !workspace_roots
            .iter()
            .any(|root| resolved_path.starts_with(root))
    {
        return Err(FsCommandError::OutsideWorkspace.to_list_message());
    }

    let mut entries = Vec::new();
    let mut dir_entries = fs::read_dir(&resolved_path)
        .await
        .map_err(|err| FsCommandError::from(err).to_list_message())?;

    // Collect all entry names first for gitignore check
    let mut all_entries: Vec<(tokio::fs::DirEntry, String)> = Vec::new();
    while let Some(entry) = dir_entries
        .next_entry()
        .await
        .map_err(|err| FsCommandError::from(err).to_list_message())?
    {
        let name = entry.file_name().to_string_lossy().to_string();
        all_entries.push((entry, name));
    }

    // Get gitignored paths if requested
    let ignored_names: HashSet<String> = if respect_gitignore.unwrap_or(false) {
        let names: Vec<String> = all_entries.iter().map(|(_, name)| name.clone()).collect();
        if names.is_empty() {
            HashSet::new()
        } else {
            let cwd = resolved_path.clone();
            tokio::task::spawn_blocking(move || {
                let output = Command::new("git")
                    .arg("check-ignore")
                    .arg("--")
                    .args(&names)
                    .current_dir(&cwd)
                    .output();

                match output {
                    Ok(out) => {
                        String::from_utf8_lossy(&out.stdout)
                            .lines()
                            .map(|s| s.trim().to_string())
                            .filter(|s| !s.is_empty())
                            .collect()
                    }
                    Err(_) => HashSet::new(),
                }
            })
            .await
            .unwrap_or_default()
        }
    } else {
        HashSet::new()
    };

    for (entry, name) in all_entries {
        // Skip gitignored entries
        if !ignored_names.is_empty() && ignored_names.contains(&name) {
            continue;
        }

        let file_type = entry
            .file_type()
            .await
            .map_err(|err| FsCommandError::from(err).to_list_message())?;

        let entry_path = entry.path();

        let mut is_directory = file_type.is_dir();
        let is_symlink = file_type.is_symlink();

        if !is_directory && is_symlink {
            if let Ok(link_meta) = fs::metadata(&entry_path).await {
                is_directory = link_meta.is_dir();
            }
        }

        let metadata = fs::metadata(&entry_path).await.ok();
        let size = metadata
            .as_ref()
            .filter(|meta| meta.is_file())
            .map(|meta| meta.len());
        let modified_time = metadata
            .and_then(|meta| meta.modified().ok())
            .and_then(|mtime| mtime.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as i64);

        entries.push(FileListEntry {
            name,
            path: normalize_path(&entry_path),
            is_directory,
            is_file: file_type.is_file(),
            is_symbolic_link: is_symlink,
            size,
            modified_time,
        });
    }

    Ok(DirectoryListResult {
        directory: normalize_path(&resolved_path),
        path: normalize_path(&resolved_path),
        entries,
    })
}

struct ScoredFileHit {
    hit: FileSearchHit,
    score: i32,
}

#[tauri::command]
pub async fn search_files(
    directory: Option<String>,
    query: Option<String>,
    max_results: Option<usize>,
    state: tauri::State<'_, DesktopRuntime>,
) -> Result<SearchFilesResponse, String> {
    let (workspace_roots, default_root) = resolve_workspace_roots(state.settings()).await;
    let resolved_root = resolve_sandboxed_path(directory, &workspace_roots, default_root.as_ref())
        .await
        .map_err(|err| err.to_search_message())?;

    let limit = clamp_search_limit(max_results);
    let normalized_query = query.unwrap_or_default().trim().to_lowercase();
    let match_all = normalized_query.is_empty();

    // Collect more candidates for fuzzy matching, then sort and trim
    let collect_limit = if match_all {
        limit
    } else {
        (limit * 3).max(200)
    };

    let mut candidates: Vec<ScoredFileHit> = Vec::new();
    let mut queue = VecDeque::new();
    let mut visited = HashSet::new();

    queue.push_back(resolved_root.clone());
    visited.insert(resolved_root.clone());

    while !queue.is_empty() && candidates.len() < collect_limit {
        for _ in 0..FILE_SEARCH_MAX_CONCURRENCY {
            let Some(dir) = queue.pop_front() else {
                break;
            };

            let mut entries = match fs::read_dir(&dir).await {
                Ok(entries) => entries,
                Err(_) => continue,
            };

            while let Ok(Some(entry)) = entries.next_entry().await {
                let Ok(file_type) = entry.file_type().await else {
                    continue;
                };

                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                if name_str.is_empty() || name_str.starts_with('.') {
                    continue;
                }

                let entry_path = entry.path();
                if file_type.is_dir() {
                    if should_skip_directory(&name_str) {
                        continue;
                    }
                    if visited.insert(entry_path.clone()) && candidates.len() < collect_limit {
                        queue.push_back(entry_path);
                    }
                    continue;
                }

                if !file_type.is_file() {
                    continue;
                }

                let relative_path = relative_path(&resolved_root, &entry_path);
                let extension = entry_path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| ext.to_lowercase());

                let hit = FileSearchHit {
                    name: name_str.to_string(),
                    path: normalize_path(&entry_path),
                    relative_path: relative_path.replace('\\', "/"),
                    extension,
                };

                if match_all {
                    candidates.push(ScoredFileHit { hit, score: 0 });
                } else {
                    // Try fuzzy match against relative path (includes filename)
                    if let Some(score) = fuzzy_match_score(&normalized_query, &relative_path) {
                        candidates.push(ScoredFileHit { hit, score });
                    }
                }

                if candidates.len() >= collect_limit {
                    break;
                }
            }

            if candidates.len() >= collect_limit {
                break;
            }
        }
    }

    // Sort by score descending, then by path length, then alphabetically
    if !match_all {
        candidates.sort_by(|a, b| match b.score.cmp(&a.score) {
            std::cmp::Ordering::Equal => {
                match a.hit.relative_path.len().cmp(&b.hit.relative_path.len()) {
                    std::cmp::Ordering::Equal => a.hit.relative_path.cmp(&b.hit.relative_path),
                    other => other,
                }
            }
            other => other,
        });
    }

    let files: Vec<FileSearchHit> = candidates
        .into_iter()
        .take(limit)
        .map(|scored| scored.hit)
        .collect();

    Ok(SearchFilesResponse {
        root: normalize_path(&resolved_root),
        count: files.len(),
        files,
    })
}

#[tauri::command]
pub async fn create_directory(
    path: String,
    state: tauri::State<'_, DesktopRuntime>,
) -> Result<CreateDirectoryResponse, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Path is required".to_string());
    }

    let (workspace_roots, default_root) = resolve_workspace_roots(state.settings()).await;
    let resolved_path = resolve_creatable_path(trimmed, &workspace_roots, default_root.as_ref())
        .await
        .map_err(|err| err.to_create_message())?;

    fs::create_dir_all(&resolved_path)
        .await
        .map_err(|err| FsCommandError::from(err).to_create_message())?;

    Ok(CreateDirectoryResponse {
        success: true,
        path: normalize_path(&resolved_path),
    })
}

async fn resolve_sandboxed_path(
    path: Option<String>,
    workspace_roots: &[PathBuf],
    default_root: Option<&PathBuf>,
) -> Result<PathBuf, FsCommandError> {
    let candidate_input = path
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());

    let fallback_root = default_root
        .or_else(|| workspace_roots.first())
        .cloned()
        .unwrap_or_else(default_home_directory);

    let candidate_path = match candidate_input {
        Some(value) => expand_tilde_path(value),
        None => fallback_root.clone(),
    };

    let resolved = if candidate_path.is_absolute() {
        candidate_path
    } else {
        fallback_root.join(candidate_path)
    };

    let canonicalized = fs::canonicalize(&resolved)
        .await
        .map_err(FsCommandError::from)?;

    if !workspace_roots.is_empty()
        && !workspace_roots
            .iter()
            .any(|root| canonicalized.starts_with(root))
    {
        return Err(FsCommandError::OutsideWorkspace);
    }

    Ok(canonicalized)
}

async fn resolve_creatable_path(
    path: &str,
    workspace_roots: &[PathBuf],
    default_root: Option<&PathBuf>,
) -> Result<PathBuf, FsCommandError> {
    let candidate = expand_tilde_path(path);
    if candidate.as_os_str().is_empty() {
        return Err(FsCommandError::Other("Path is required".to_string()));
    }

    let fallback_root = default_root
        .or_else(|| workspace_roots.first())
        .cloned()
        .unwrap_or_else(default_home_directory);

    let absolute = if candidate.is_absolute() {
        candidate
    } else {
        fallback_root.join(candidate)
    };

    let parent = absolute.parent().ok_or(FsCommandError::NotDirectory)?;

    let canonical_parent = fs::canonicalize(parent)
        .await
        .map_err(FsCommandError::from)?;

    if !workspace_roots.is_empty()
        && !workspace_roots
            .iter()
            .any(|root| canonical_parent.starts_with(root))
    {
        return Err(FsCommandError::OutsideWorkspace);
    }

    Ok(absolute)
}

async fn resolve_workspace_roots(settings: &SettingsStore) -> (Vec<PathBuf>, Option<PathBuf>) {
    let mut roots: Vec<PathBuf> = Vec::new();
    let mut default_root: Option<PathBuf> = None;

    let settings_value = settings.load().await.ok();

    if let Some(value) = settings_value.as_ref() {
        if let Some(active_id) = value.get("activeProjectId").and_then(|v| v.as_str()) {
            if let Some(projects) = value.get("projects").and_then(|v| v.as_array()) {
                if let Some(active_path) = projects.iter().find_map(|entry| {
                    let id = entry.get("id").and_then(|v| v.as_str())?;
                    if id != active_id {
                        return None;
                    }
                    entry.get("path").and_then(|v| v.as_str())
                }) {
                    if let Ok(canonicalized) =
                        fs::canonicalize(expand_tilde_path(active_path)).await
                    {
                        default_root = Some(canonicalized.clone());
                        roots.push(canonicalized);
                    }
                }
            }
        }

        if let Some(projects) = value.get("projects").and_then(|v| v.as_array()) {
            for entry in projects {
                if let Some(path) = entry.get("path").and_then(|v| v.as_str()) {
                    if let Ok(canonicalized) = fs::canonicalize(expand_tilde_path(path)).await {
                        roots.push(canonicalized);
                    }
                }
            }
        }

        if let Some(last_dir) = value.get("lastDirectory").and_then(|v| v.as_str()) {
            if let Ok(canonicalized) = fs::canonicalize(expand_tilde_path(last_dir)).await {
                if default_root.is_none() {
                    default_root = Some(canonicalized.clone());
                }
                roots.push(canonicalized);
            }
        }
    }

    if default_root.is_none() {
        if let Ok(Some(last_dir)) = settings.last_directory().await {
            if let Ok(canonicalized) = fs::canonicalize(last_dir).await {
                default_root = Some(canonicalized);
            }
        }
    }

    let mut deduped: Vec<PathBuf> = Vec::new();
    for root in roots {
        if !deduped.iter().any(|existing| existing == &root) {
            deduped.push(root);
        }
    }

    (deduped, default_root)
}

fn default_home_directory() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
}

fn clamp_search_limit(value: Option<usize>) -> usize {
    let limit = value.unwrap_or(DEFAULT_FILE_SEARCH_LIMIT);
    limit.clamp(1, MAX_FILE_SEARCH_LIMIT)
}

fn should_skip_directory(name: &str) -> bool {
    if name.starts_with('.') {
        return true;
    }
    FILE_SEARCH_EXCLUDED_DIRS
        .iter()
        .any(|dir| dir.eq_ignore_ascii_case(name))
}

/// Fuzzy match scoring function.
/// Returns Some(score) if the query fuzzy-matches the candidate, None otherwise.
/// Higher scores indicate better matches.
fn fuzzy_match_score(query: &str, candidate: &str) -> Option<i32> {
    if query.is_empty() {
        return Some(0);
    }

    let q: Vec<char> = query.to_lowercase().chars().collect();
    let c: Vec<char> = candidate.to_lowercase().chars().collect();
    let c_str = candidate.to_lowercase();

    // Fast path: exact substring match gets high score
    if c_str.contains(query) {
        if let Some(idx) = c_str.find(query) {
            let mut bonus: i32 = 0;
            if idx == 0 {
                bonus = 20;
            } else if let Some(prev) = c.get(idx.saturating_sub(1)) {
                if *prev == '/' || *prev == '_' || *prev == '-' || *prev == '.' || *prev == ' ' {
                    bonus = 15;
                }
            }
            return Some(100 + bonus - (idx.min(20) as i32) - (c.len() as i32 / 5));
        }
    }

    // Fuzzy match: all query chars must appear in order
    let mut score: i32 = 0;
    let mut last_index: i32 = -1;
    let mut consecutive: i32 = 0;

    for ch in &q {
        if *ch == ' ' {
            continue;
        }

        let search_start = if last_index < 0 {
            0
        } else {
            (last_index + 1) as usize
        };
        let idx = c[search_start..].iter().position(|&c_char| c_char == *ch);

        match idx {
            None => return None, // No match
            Some(relative_idx) => {
                let idx = search_start + relative_idx;
                let gap = idx as i32 - last_index - 1;

                if gap == 0 {
                    consecutive += 1;
                } else {
                    consecutive = 0;
                }

                score += 10;
                score += (18 - idx as i32).max(0); // Prefer matches near start
                score -= gap.min(10); // Penalize gaps

                // Bonus for word boundary matches
                if idx == 0 {
                    score += 12;
                } else if let Some(prev) = c.get(idx - 1) {
                    if *prev == '/' || *prev == '_' || *prev == '-' || *prev == '.' || *prev == ' '
                    {
                        score += 10;
                    }
                }

                score += if consecutive > 0 { 12 } else { 0 }; // Bonus for consecutive matches
                last_index = idx as i32;
            }
        }
    }

    // Prefer shorter paths
    score += (24 - c.len() as i32 / 3).max(0);

    Some(score)
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn relative_path(root: &Path, target: &Path) -> String {
    target
        .strip_prefix(root)
        .map(|relative| normalize_path(relative))
        .unwrap_or_else(|_| normalize_path(target))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileResponse {
    content: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileBinaryResponse {
    data_url: String,
    path: String,
}

fn get_image_mime_type(file_path: &str) -> &'static str {
    let lower = file_path.to_lowercase();
    if lower.ends_with(".png") {
        return "image/png";
    }
    if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        return "image/jpeg";
    }
    if lower.ends_with(".gif") {
        return "image/gif";
    }
    if lower.ends_with(".svg") {
        return "image/svg+xml";
    }
    if lower.ends_with(".webp") {
        return "image/webp";
    }
    if lower.ends_with(".ico") {
        return "image/x-icon";
    }
    if lower.ends_with(".bmp") {
        return "image/bmp";
    }
    if lower.ends_with(".avif") {
        return "image/avif";
    }

    "application/octet-stream"
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileResponse {
    success: bool,
    path: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResult {
    command: String,
    success: bool,
    exit_code: Option<i32>,
    stdout: Option<String>,
    stderr: Option<String>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecCommandsResponse {
    success: bool,
    results: Vec<CommandResult>,
}

#[tauri::command]
pub async fn read_file(
    path: String,
    state: tauri::State<'_, DesktopRuntime>,
) -> Result<ReadFileResponse, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Path is required".to_string());
    }

    let (workspace_roots, default_root) = resolve_workspace_roots(state.settings()).await;
    let resolved_path = resolve_sandboxed_path(Some(trimmed.to_string()), &workspace_roots, default_root.as_ref())
        .await
        .map_err(|_| "File not found or access denied".to_string())?;

    let metadata = fs::metadata(&resolved_path)
        .await
        .map_err(|_| "File not found".to_string())?;

    if !metadata.is_file() {
        return Err("Specified path is not a file".to_string());
    }

    let content = fs::read_to_string(&resolved_path)
        .await
        .map_err(|err| format!("Failed to read file: {}", err))?;

    Ok(ReadFileResponse {
        content,
        path: normalize_path(&resolved_path),
    })
}

#[tauri::command]
pub async fn read_file_binary(
    path: String,
    state: tauri::State<'_, DesktopRuntime>,
) -> Result<ReadFileBinaryResponse, String> {
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};

    const MAX_BYTES: u64 = 10 * 1024 * 1024;

    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Path is required".to_string());
    }

    let (workspace_roots, default_root) = resolve_workspace_roots(state.settings()).await;
    let resolved_path = resolve_sandboxed_path(Some(trimmed.to_string()), &workspace_roots, default_root.as_ref())
        .await
        .map_err(|_| "File not found or access denied".to_string())?;

    let metadata = fs::metadata(&resolved_path)
        .await
        .map_err(|_| "File not found".to_string())?;

    if !metadata.is_file() {
        return Err("Specified path is not a file".to_string());
    }

    if metadata.len() > MAX_BYTES {
        return Err("File too large".to_string());
    }

    let bytes = fs::read(&resolved_path)
        .await
        .map_err(|err| format!("Failed to read file: {}", err))?;

    let mime_type = get_image_mime_type(trimmed);
    let data_url = format!("data:{};base64,{}", mime_type, BASE64.encode(&bytes));

    Ok(ReadFileBinaryResponse {
        data_url,
        path: normalize_path(&resolved_path),
    })
}

#[tauri::command]
pub async fn write_file(
    path: String,
    content: String,
    state: tauri::State<'_, DesktopRuntime>,
) -> Result<WriteFileResponse, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Path is required".to_string());
    }

    let (workspace_roots, default_root) = resolve_workspace_roots(state.settings()).await;
    let resolved_path = resolve_creatable_path(trimmed, &workspace_roots, default_root.as_ref())
        .await
        .map_err(|err| err.to_create_message())?;

    // Ensure parent directory exists
    if let Some(parent) = resolved_path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|err| format!("Failed to create parent directory: {}", err))?;
    }

    fs::write(&resolved_path, content)
        .await
        .map_err(|err| format!("Failed to write file: {}", err))?;

    Ok(WriteFileResponse {
        success: true,
        path: normalize_path(&resolved_path),
    })
}

#[tauri::command]
pub async fn exec_commands(
    commands: Vec<String>,
    cwd: String,
    state: tauri::State<'_, DesktopRuntime>,
) -> Result<ExecCommandsResponse, String> {
    if commands.is_empty() {
        return Err("Commands array is required".to_string());
    }

    let cwd_trimmed = cwd.trim();
    if cwd_trimmed.is_empty() {
        return Err("Working directory (cwd) is required".to_string());
    }

    let (workspace_roots, default_root) = resolve_workspace_roots(state.settings()).await;
    let resolved_cwd = resolve_sandboxed_path(Some(cwd_trimmed.to_string()), &workspace_roots, default_root.as_ref())
        .await
        .map_err(|_| "Working directory not found or access denied".to_string())?;

    let metadata = fs::metadata(&resolved_cwd)
        .await
        .map_err(|_| "Working directory not found".to_string())?;

    if !metadata.is_dir() {
        return Err("Specified cwd is not a directory".to_string());
    }

    let shell = std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(windows) {
            "cmd.exe".to_string()
        } else {
            "/bin/sh".to_string()
        }
    });

    let shell_flag = if cfg!(windows) { "/c" } else { "-c" };

    let mut results = Vec::new();

    for cmd in commands {
        let cmd_trimmed = cmd.trim();
        if cmd_trimmed.is_empty() {
            results.push(CommandResult {
                command: cmd.clone(),
                success: false,
                exit_code: None,
                stdout: None,
                stderr: None,
                error: Some("Invalid command".to_string()),
            });
            continue;
        }

        let cwd_clone = resolved_cwd.clone();
        let shell_clone = shell.clone();
        let cmd_clone = cmd_trimmed.to_string();

        // Run command synchronously in blocking task
        let result = tokio::task::spawn_blocking(move || {
            match Command::new(&shell_clone)
                .arg(shell_flag)
                .arg(&cmd_clone)
                .current_dir(&cwd_clone)
                .output()
            {
                Ok(output) => CommandResult {
                    command: cmd_clone,
                    success: output.status.success(),
                    exit_code: output.status.code(),
                    stdout: Some(String::from_utf8_lossy(&output.stdout).trim().to_string()),
                    stderr: Some(String::from_utf8_lossy(&output.stderr).trim().to_string()),
                    error: None,
                },
                Err(err) => CommandResult {
                    command: cmd_clone,
                    success: false,
                    exit_code: None,
                    stdout: None,
                    stderr: None,
                    error: Some(err.to_string()),
                },
            }
        })
        .await
        .unwrap_or_else(|err| CommandResult {
            command: cmd.clone(),
            success: false,
            exit_code: None,
            stdout: None,
            stderr: None,
            error: Some(format!("Task failed: {}", err)),
        });

        results.push(result);
    }

    let all_succeeded = results.iter().all(|r| r.success);

    Ok(ExecCommandsResponse {
        success: all_succeeded,
        results,
    })
}
