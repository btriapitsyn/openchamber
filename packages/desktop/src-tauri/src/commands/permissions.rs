use log::{info, warn};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::State;

use crate::path_utils::expand_tilde_path;
use crate::DesktopRuntime;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryPermissionRequest {
    path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryPermissionResult {
    success: bool,
    path: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartAccessingResult {
    success: bool,
    error: Option<String>,
}

/// Process directory selection from frontend
/// Updates settings with lastDirectory
/// OpenCode restart is triggered separately via /api/opencode/directory endpoint
#[tauri::command]
pub async fn process_directory_selection(
    path: String,
    state: State<'_, DesktopRuntime>,
) -> Result<DirectoryPermissionResult, String> {
    // Validate directory exists
    let mut path_buf = expand_tilde_path(&path);
    if let Ok(canonicalized) = std::fs::canonicalize(&path_buf) {
        path_buf = canonicalized;
    }
    let normalized_path = path_buf.to_string_lossy().to_string();
    if !path_buf.exists() {
        return Ok(DirectoryPermissionResult {
            success: false,
            path: None,
            error: Some("Directory does not exist".to_string()),
        });
    }

    if !path_buf.is_dir() {
        return Ok(DirectoryPermissionResult {
            success: false,
            path: None,
            error: Some("Path is not a directory".to_string()),
        });
    }

    // Update settings with lastDirectory
    let mut settings = state
        .settings()
        .load()
        .await
        .map_err(|e| format!("Failed to load settings: {}", e))?;

    if let Some(obj) = settings.as_object_mut() {
        obj.insert(
            "lastDirectory".to_string(),
            serde_json::Value::String(normalized_path.clone()),
        );
    }

    state
        .settings()
        .save(settings)
        .await
        .map_err(|e| format!("Failed to save updated settings: {}", e))?;

    info!(
        "[permissions] Updated settings with lastDirectory: {}",
        normalized_path
    );

    Ok(DirectoryPermissionResult {
        success: true,
        path: Some(normalized_path),
        error: None,
    })
}

/// Legacy directory picker command (frontend handles actual dialog)
#[tauri::command]
pub async fn pick_directory(
    _app_handle: AppHandle,
    _state: State<'_, DesktopRuntime>,
) -> Result<DirectoryPermissionResult, String> {
    Ok(DirectoryPermissionResult {
        success: false,
        path: None,
        error: Some(
            "Use requestDirectoryAccess instead - it handles native dialog properly".to_string(),
        ),
    })
}

/// Request directory access (desktop implementation)
/// For unsandboxed apps, just validates the path is accessible
#[tauri::command]
pub async fn request_directory_access(
    request: DirectoryPermissionRequest,
    _state: State<'_, DesktopRuntime>,
) -> Result<DirectoryPermissionResult, String> {
    let path = request.path;

    let mut path_buf = expand_tilde_path(&path);
    if let Ok(canonicalized) = std::fs::canonicalize(&path_buf) {
        path_buf = canonicalized;
    }
    let normalized_path = path_buf.to_string_lossy().to_string();
    if !path_buf.exists() {
        return Ok(DirectoryPermissionResult {
            success: false,
            path: None,
            error: Some("Directory does not exist".to_string()),
        });
    }

    if !path_buf.is_dir() {
        return Ok(DirectoryPermissionResult {
            success: false,
            path: None,
            error: Some("Path is not a directory".to_string()),
        });
    }

    // For unsandboxed apps, no bookmark needed - just verify access
    match std::fs::read_dir(&path_buf) {
        Ok(_) => Ok(DirectoryPermissionResult {
            success: true,
            path: Some(normalized_path),
            error: None,
        }),
        Err(e) => Ok(DirectoryPermissionResult {
            success: false,
            path: None,
            error: Some(format!("Cannot access directory: {}", e)),
        }),
    }
}

/// Start accessing directory (desktop implementation)
#[tauri::command]
pub async fn start_accessing_directory(
    path: String,
    _state: State<'_, DesktopRuntime>,
) -> Result<StartAccessingResult, String> {
    // Check if directory exists and is accessible
    let path_buf = std::path::PathBuf::from(&path);

    if !path_buf.exists() {
        return Ok(StartAccessingResult {
            success: false,
            error: Some("Directory does not exist".to_string()),
        });
    }

    if !path_buf.is_dir() {
        return Ok(StartAccessingResult {
            success: false,
            error: Some("Path is not a directory".to_string()),
        });
    }

    // Try to read the directory to verify access
    match std::fs::read_dir(&path_buf) {
        Ok(_) => {
            info!("Successfully started accessing directory: {}", path);
            Ok(StartAccessingResult {
                success: true,
                error: None,
            })
        }
        Err(e) => {
            warn!("Failed to access directory {}: {}", path, e);
            Ok(StartAccessingResult {
                success: false,
                error: Some(format!("Failed to access directory: {}", e)),
            })
        }
    }
}

/// Stop accessing directory (desktop implementation)
#[tauri::command]
pub async fn stop_accessing_directory(
    _path: String,
    _state: State<'_, DesktopRuntime>,
) -> Result<StartAccessingResult, String> {
    // For Stage 1, just confirm the operation
    // Full implementation would call stopAccessingSecurityScopedResource
    info!("Stopped accessing directory");
    Ok(StartAccessingResult {
        success: true,
        error: None,
    })
}

/// Restore bookmarks on app startup (no-op for unsandboxed apps)
#[tauri::command]
pub async fn restore_bookmarks_on_startup(_state: State<'_, DesktopRuntime>) -> Result<(), String> {
    // For unsandboxed apps, no bookmarks needed
    // Directory access is restored from settings.lastDirectory
    info!("[permissions] Bookmark restore not needed for unsandboxed app");
    Ok(())
}
