use crate::{DesktopRuntime, SettingsStore};
use serde::Serialize;
use std::{
    collections::{HashSet, VecDeque},
    path::{Path, PathBuf},
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
    state: tauri::State<'_, DesktopRuntime>,
) -> Result<DirectoryListResult, String> {
    let workspace_root = resolve_workspace_root(state.settings()).await;
    let resolved_path = resolve_sandboxed_path(path, workspace_root.as_ref())
        .await
        .map_err(|err| err.to_list_message())?;

    let metadata = fs::metadata(&resolved_path)
        .await
        .map_err(|err| FsCommandError::from(err).to_list_message())?;

    if !metadata.is_dir() {
        return Err(FsCommandError::NotDirectory.to_list_message());
    }

    // Re-check boundary after canonicalization to guard against traversal
    if let Some(root) = &workspace_root {
        if !resolved_path.starts_with(root) {
            return Err(FsCommandError::OutsideWorkspace.to_list_message());
        }
    }

    let mut entries = Vec::new();
    let mut dir_entries = fs::read_dir(&resolved_path)
        .await
        .map_err(|err| FsCommandError::from(err).to_list_message())?;

    while let Some(entry) = dir_entries
        .next_entry()
        .await
        .map_err(|err| FsCommandError::from(err).to_list_message())?
    {
        let file_type = entry
            .file_type()
            .await
            .map_err(|err| FsCommandError::from(err).to_list_message())?;

        let entry_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

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

#[tauri::command]
pub async fn search_files(
    directory: Option<String>,
    query: Option<String>,
    max_results: Option<usize>,
    state: tauri::State<'_, DesktopRuntime>,
) -> Result<SearchFilesResponse, String> {
    let workspace_root = resolve_workspace_root(state.settings()).await;
    let resolved_root = resolve_sandboxed_path(directory, workspace_root.as_ref())
        .await
        .map_err(|err| err.to_search_message())?;

    let limit = clamp_search_limit(max_results);
    let normalized_query = query.unwrap_or_default().trim().to_lowercase();
    let match_all = normalized_query.is_empty();

    let mut files = Vec::new();
    let mut queue = VecDeque::new();
    let mut visited = HashSet::new();

    queue.push_back(resolved_root.clone());
    visited.insert(resolved_root.clone());

    while !queue.is_empty() && files.len() < limit {
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
                    if visited.insert(entry_path.clone()) && files.len() < limit {
                        queue.push_back(entry_path);
                    }
                    continue;
                }

                if !file_type.is_file() {
                    continue;
                }

                let relative_path = relative_path(&resolved_root, &entry_path);
                if !match_all {
                    let lowercase_name = name_str.to_lowercase();
                    let lowercase_path = relative_path.to_lowercase();
                    if !lowercase_name.contains(&normalized_query)
                        && !lowercase_path.contains(&normalized_query)
                    {
                        continue;
                    }
                }

                let extension = entry_path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| ext.to_lowercase());

                files.push(FileSearchHit {
                    name: name_str.to_string(),
                    path: normalize_path(&entry_path),
                    relative_path: relative_path.replace('\\', "/"),
                    extension,
                });

                if files.len() >= limit {
                    break;
                }
            }

            if files.len() >= limit {
                break;
            }
        }
    }

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

    let workspace_root = resolve_workspace_root(state.settings()).await;
    let resolved_path = resolve_creatable_path(trimmed, workspace_root.as_ref())
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
    workspace_root: Option<&PathBuf>,
) -> Result<PathBuf, FsCommandError> {
    let candidate_input = path
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());

    let candidate_path = match (candidate_input, workspace_root) {
        (Some(value), _) => PathBuf::from(value),
        (None, Some(root)) => root.clone(),
        (None, None) => default_home_directory(),
    };

    let resolved = if candidate_path.is_absolute() {
        candidate_path
    } else if let Some(root) = workspace_root {
        root.join(candidate_path)
    } else {
        default_home_directory().join(candidate_path)
    };

    let canonicalized = fs::canonicalize(&resolved)
        .await
        .map_err(FsCommandError::from)?;

    if let Some(root) = workspace_root {
        if !canonicalized.starts_with(root) {
            return Err(FsCommandError::OutsideWorkspace);
        }
    }

    Ok(canonicalized)
}

async fn resolve_creatable_path(
    path: &str,
    workspace_root: Option<&PathBuf>,
) -> Result<PathBuf, FsCommandError> {
    let candidate = PathBuf::from(path);
    if candidate.as_os_str().is_empty() {
        return Err(FsCommandError::Other("Path is required".to_string()));
    }

    let absolute = if candidate.is_absolute() {
        candidate
    } else if let Some(root) = workspace_root {
        root.join(candidate)
    } else {
        default_home_directory().join(candidate)
    };

    let parent = absolute.parent().ok_or(FsCommandError::NotDirectory)?;

    let canonical_parent = fs::canonicalize(parent)
        .await
        .map_err(FsCommandError::from)?;

    if let Some(root) = workspace_root {
        if !canonical_parent.starts_with(root) {
            return Err(FsCommandError::OutsideWorkspace);
        }
    }

    Ok(absolute)
}

async fn resolve_workspace_root(settings: &SettingsStore) -> Option<PathBuf> {
    if let Ok(Some(last_dir)) = settings.last_directory().await {
        if let Ok(canonicalized) = fs::canonicalize(&last_dir).await {
            return Some(canonicalized);
        }
    }
    None
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

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn relative_path(root: &Path, target: &Path) -> String {
    target
        .strip_prefix(root)
        .map(|relative| normalize_path(relative))
        .unwrap_or_else(|_| normalize_path(target))
}
