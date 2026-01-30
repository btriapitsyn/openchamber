use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use tauri::State;
use uuid::Uuid;

use crate::path_utils::expand_tilde_path;
use crate::DesktopRuntime;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsLoadResult {
    settings: Value,
    source: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestartResult {
    restarted: bool,
}

/// Load settings from disk.
#[tauri::command]
pub async fn load_settings(state: State<'_, DesktopRuntime>) -> Result<SettingsLoadResult, String> {
    let (settings, _) = state
        .settings()
        .update_with(|mut settings| {
            migrate_legacy_project_settings(&mut settings);
            normalize_project_selection(&mut settings);
            (settings, ())
        })
        .await
        .map_err(|e| format!("Failed to load settings: {}", e))?;

    Ok(SettingsLoadResult {
        settings: format_settings_response(&settings),
        source: "desktop".to_string(),
    })
}

/// Save settings to disk with merge logic.
#[tauri::command]
pub async fn save_settings(
    changes: Value,
    state: State<'_, DesktopRuntime>,
) -> Result<Value, String> {
    let sanitized_changes = sanitize_settings_update(&changes);

    let (merged, _) = state
        .settings()
        .update_with(|current| {
            let mut merged = merge_persisted_settings(&current, &sanitized_changes);
            normalize_project_selection(&mut merged);
            (merged, ())
        })
        .await
        .map_err(|e| format!("Failed to save settings: {}", e))?;

    Ok(format_settings_response(&merged))
}

/// Restart the backend process (config reload).
#[tauri::command]
pub async fn restart_opencode(state: State<'_, DesktopRuntime>) -> Result<RestartResult, String> {
    state
        .opencode
        .restart()
        .await
        .map_err(|e| format!("Failed to restart OpenCode: {}", e))?;

    Ok(RestartResult { restarted: true })
}

fn sanitize_projects(value: &Value) -> Option<Value> {
    let arr = value.as_array()?;
    let mut seen_ids = HashSet::new();
    let mut seen_paths = HashSet::new();
    let mut result = Vec::new();

    for entry in arr {
        let Some(obj) = entry.as_object() else {
            continue;
        };

        let id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
        let raw_path = obj
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        if id.is_empty() || raw_path.is_empty() {
            continue;
        }

        let expanded = expand_tilde_path(raw_path).to_string_lossy().to_string();
        let normalized = if expanded == "/" {
            expanded
        } else {
            expanded.trim_end_matches('/').replace('\\', "/")
        };

        if normalized.is_empty() {
            continue;
        }

        if seen_ids.contains(id) || seen_paths.contains(&normalized) {
            continue;
        }
        seen_ids.insert(id.to_string());
        seen_paths.insert(normalized.clone());

        let mut project = serde_json::Map::new();
        project.insert("id".to_string(), json!(id));
        project.insert("path".to_string(), json!(normalized));

        if let Some(Value::String(label)) = obj.get("label") {
            if !label.trim().is_empty() {
                project.insert("label".to_string(), json!(label.trim()));
            }
        }
        if let Some(Value::Number(num)) = obj.get("addedAt") {
            if let Some(value) = num.as_i64() {
                if value >= 0 {
                    project.insert("addedAt".to_string(), json!(value));
                }
            }
        }
        if let Some(Value::Number(num)) = obj.get("lastOpenedAt") {
            if let Some(value) = num.as_i64() {
                if value >= 0 {
                    project.insert("lastOpenedAt".to_string(), json!(value));
                }
            }
        }

        // Preserve worktreeDefaults
        if let Some(Value::Object(wt)) = obj.get("worktreeDefaults") {
            let mut defaults = serde_json::Map::new();
            if let Some(Value::String(s)) = wt.get("branchPrefix") {
                if !s.trim().is_empty() {
                    defaults.insert("branchPrefix".to_string(), json!(s.trim()));
                }
            }
            if let Some(Value::String(s)) = wt.get("baseBranch") {
                if !s.trim().is_empty() {
                    defaults.insert("baseBranch".to_string(), json!(s.trim()));
                }
            }
            if let Some(Value::Bool(b)) = wt.get("autoCreateWorktree") {
                defaults.insert("autoCreateWorktree".to_string(), json!(b));
            }
            if !defaults.is_empty() {
                project.insert("worktreeDefaults".to_string(), Value::Object(defaults));
            }
        }

        result.push(Value::Object(project));
    }

    if arr.is_empty() {
        return Some(Value::Array(vec![]));
    }

    if result.is_empty() {
        None
    } else {
        Some(Value::Array(result))
    }
}

/// Sanitize settings update payload (port of Express sanitizeSettingsUpdate)
fn sanitize_settings_update(payload: &Value) -> Value {
    let mut result = json!({});

    if let Some(obj) = payload.as_object() {
        let result_obj = result.as_object_mut().unwrap();

        // String fields
        if let Some(Value::String(s)) = obj.get("themeId") {
            if !s.is_empty() {
                result_obj.insert("themeId".to_string(), json!(s));
            }
        }
        if let Some(Value::String(s)) = obj.get("themeVariant") {
            if s == "light" || s == "dark" {
                result_obj.insert("themeVariant".to_string(), json!(s));
            }
        }
        if let Some(Value::String(s)) = obj.get("lightThemeId") {
            if !s.is_empty() {
                result_obj.insert("lightThemeId".to_string(), json!(s));
            }
        }
        if let Some(Value::String(s)) = obj.get("darkThemeId") {
            if !s.is_empty() {
                result_obj.insert("darkThemeId".to_string(), json!(s));
            }
        }
        if let Some(Value::String(s)) = obj.get("lastDirectory") {
            if !s.is_empty() {
                let expanded = expand_tilde_path(s).to_string_lossy().to_string();
                result_obj.insert("lastDirectory".to_string(), json!(expanded));
            }
        }
        if let Some(Value::String(s)) = obj.get("homeDirectory") {
            if !s.is_empty() {
                let expanded = expand_tilde_path(s).to_string_lossy().to_string();
                result_obj.insert("homeDirectory".to_string(), json!(expanded));
            }
        }
        if let Some(projects) = obj.get("projects").and_then(sanitize_projects) {
            result_obj.insert("projects".to_string(), projects);
        }
        if let Some(Value::String(s)) = obj.get("activeProjectId") {
            if !s.is_empty() {
                result_obj.insert("activeProjectId".to_string(), json!(s));
            }
        }
        if let Some(Value::String(s)) = obj.get("uiFont") {
            if !s.is_empty() {
                result_obj.insert("uiFont".to_string(), json!(s));
            }
        }
        if let Some(Value::String(s)) = obj.get("monoFont") {
            if !s.is_empty() {
                result_obj.insert("monoFont".to_string(), json!(s));
            }
        }
        if let Some(Value::String(s)) = obj.get("markdownDisplayMode") {
            if !s.is_empty() {
                result_obj.insert("markdownDisplayMode".to_string(), json!(s));
            }
        }

        // GitHub OAuth config (non-secret)
        if let Some(Value::String(s)) = obj.get("githubClientId") {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                result_obj.insert("githubClientId".to_string(), json!(trimmed));
            }
        }
        if let Some(Value::String(s)) = obj.get("githubScopes") {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                result_obj.insert("githubScopes".to_string(), json!(trimmed));
            }
        }
        if let Some(Value::String(s)) = obj.get("defaultModel") {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                result_obj.insert("defaultModel".to_string(), Value::Null);
            } else {
                result_obj.insert("defaultModel".to_string(), json!(trimmed));
            }
        }
        if let Some(Value::String(s)) = obj.get("defaultVariant") {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                result_obj.insert("defaultVariant".to_string(), Value::Null);
            } else {
                result_obj.insert("defaultVariant".to_string(), json!(trimmed));
            }
        }
        if let Some(Value::String(s)) = obj.get("defaultAgent") {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                result_obj.insert("defaultAgent".to_string(), Value::Null);
            } else {
                result_obj.insert("defaultAgent".to_string(), json!(trimmed));
            }
        }
        if let Some(Value::String(s)) = obj.get("defaultGitIdentityId") {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                result_obj.insert("defaultGitIdentityId".to_string(), Value::Null);
            } else {
                result_obj.insert("defaultGitIdentityId".to_string(), json!(trimmed));
            }
        }
        // Boolean fields
        if let Some(Value::Bool(b)) = obj.get("gitmojiEnabled") {
            result_obj.insert("gitmojiEnabled".to_string(), json!(b));
        }
        if let Some(Value::Bool(b)) = obj.get("useSystemTheme") {
            result_obj.insert("useSystemTheme".to_string(), json!(b));
        }
        if let Some(Value::Bool(b)) = obj.get("showReasoningTraces") {
            result_obj.insert("showReasoningTraces".to_string(), json!(b));
        }
        if let Some(Value::Bool(b)) = obj.get("showTextJustificationActivity") {
            result_obj.insert("showTextJustificationActivity".to_string(), json!(b));
        }
        if let Some(Value::Bool(b)) = obj.get("nativeNotificationsEnabled") {
            result_obj.insert("nativeNotificationsEnabled".to_string(), json!(b));
        }
        if let Some(Value::Bool(b)) = obj.get("notifyOnSubtasks") {
            result_obj.insert("notifyOnSubtasks".to_string(), json!(b));
        }
        if let Some(Value::String(s)) = obj.get("notificationMode") {
            let trimmed = s.trim();
            if trimmed == "always" || trimmed == "hidden-only" {
                result_obj.insert("notificationMode".to_string(), json!(trimmed));
            }
        }
        if let Some(Value::Bool(b)) = obj.get("autoDeleteEnabled") {
            result_obj.insert("autoDeleteEnabled".to_string(), json!(b));
        }
        if let Some(Value::Bool(b)) = obj.get("queueModeEnabled") {
            result_obj.insert("queueModeEnabled".to_string(), json!(b));
        }
        if let Some(Value::Bool(b)) = obj.get("autoCreateWorktree") {
            result_obj.insert("autoCreateWorktree".to_string(), json!(b));
        }
        if let Some(Value::String(s)) = obj.get("toolCallExpansion") {
            let trimmed = s.trim();
            if trimmed == "collapsed" || trimmed == "activity" || trimmed == "detailed" {
                result_obj.insert("toolCallExpansion".to_string(), json!(trimmed));
            }
        }

        // Number fields
        if let Some(Value::Number(n)) = obj.get("autoDeleteAfterDays") {
            let parsed = n
                .as_u64()
                .or_else(|| {
                    n.as_i64()
                        .and_then(|value| if value >= 0 { Some(value as u64) } else { None })
                })
                .or_else(|| n.as_f64().map(|value| value.round().max(0.0) as u64));
            if let Some(value) = parsed {
                let clamped = value.max(1).min(365);
                result_obj.insert("autoDeleteAfterDays".to_string(), json!(clamped));
            }
        }

        if let Some(Value::Number(n)) = obj.get("fontSize") {
            let parsed = n
                .as_u64()
                .or_else(|| n.as_i64().and_then(|v| if v >= 0 { Some(v as u64) } else { None }))
                .or_else(|| n.as_f64().map(|v| v.round().max(0.0) as u64));
            if let Some(value) = parsed {
                let clamped = value.max(50).min(200);
                result_obj.insert("fontSize".to_string(), json!(clamped));
            }
        }
        if let Some(Value::Number(n)) = obj.get("padding") {
            let parsed = n
                .as_u64()
                .or_else(|| n.as_i64().and_then(|v| if v >= 0 { Some(v as u64) } else { None }))
                .or_else(|| n.as_f64().map(|v| v.round().max(0.0) as u64));
            if let Some(value) = parsed {
                let clamped = value.max(50).min(200);
                result_obj.insert("padding".to_string(), json!(clamped));
            }
        }
        if let Some(Value::Number(n)) = obj.get("cornerRadius") {
            let parsed = n
                .as_u64()
                .or_else(|| n.as_i64().and_then(|v| if v >= 0 { Some(v as u64) } else { None }))
                .or_else(|| n.as_f64().map(|v| v.round().max(0.0) as u64));
            if let Some(value) = parsed {
                let clamped = value.max(0).min(32);
                result_obj.insert("cornerRadius".to_string(), json!(clamped));
            }
        }
        if let Some(Value::Number(n)) = obj.get("inputBarOffset") {
            let parsed = n
                .as_u64()
                .or_else(|| n.as_i64().and_then(|v| if v >= 0 { Some(v as u64) } else { None }))
                .or_else(|| n.as_f64().map(|v| v.round().max(0.0) as u64));
            if let Some(value) = parsed {
                let clamped = value.max(0).min(100);
                result_obj.insert("inputBarOffset".to_string(), json!(clamped));
            }
        }

        // Memory limit fields
        if let Some(Value::Number(n)) = obj.get("memoryLimitHistorical") {
            let parsed = n
                .as_u64()
                .or_else(|| {
                    n.as_i64()
                        .and_then(|v| if v >= 0 { Some(v as u64) } else { None })
                })
                .or_else(|| n.as_f64().map(|v| v.round().max(0.0) as u64));
            if let Some(value) = parsed {
                let clamped = value.max(10).min(500);
                result_obj.insert("memoryLimitHistorical".to_string(), json!(clamped));
            }
        }
        if let Some(Value::Number(n)) = obj.get("memoryLimitViewport") {
            let parsed = n
                .as_u64()
                .or_else(|| {
                    n.as_i64()
                        .and_then(|v| if v >= 0 { Some(v as u64) } else { None })
                })
                .or_else(|| n.as_f64().map(|v| v.round().max(0.0) as u64));
            if let Some(value) = parsed {
                let clamped = value.max(20).min(500);
                result_obj.insert("memoryLimitViewport".to_string(), json!(clamped));
            }
        }
        if let Some(Value::Number(n)) = obj.get("memoryLimitActiveSession") {
            let parsed = n
                .as_u64()
                .or_else(|| {
                    n.as_i64()
                        .and_then(|v| if v >= 0 { Some(v as u64) } else { None })
                })
                .or_else(|| n.as_f64().map(|v| v.round().max(0.0) as u64));
            if let Some(value) = parsed {
                let clamped = value.max(30).min(1000);
                result_obj.insert("memoryLimitActiveSession".to_string(), json!(clamped));
            }
        }

        if let Some(Value::String(s)) = obj.get("diffLayoutPreference") {
            let trimmed = s.trim();
            if trimmed == "dynamic" || trimmed == "inline" || trimmed == "side-by-side" {
                result_obj.insert("diffLayoutPreference".to_string(), json!(trimmed));
            }
        }
        if let Some(Value::String(s)) = obj.get("diffViewMode") {
            let trimmed = s.trim();
            if trimmed == "single" || trimmed == "stacked" {
                result_obj.insert("diffViewMode".to_string(), json!(trimmed));
            }
        }
        if let Some(Value::Bool(b)) = obj.get("directoryShowHidden") {
            result_obj.insert("directoryShowHidden".to_string(), json!(b));
        }
        if let Some(Value::Bool(b)) = obj.get("filesViewShowGitignored") {
            result_obj.insert("filesViewShowGitignored".to_string(), json!(b));
        }

        // Array fields
        if let Some(arr) = obj.get("approvedDirectories") {
            result_obj.insert(
                "approvedDirectories".to_string(),
                normalize_string_array(arr),
            );
        }
        if let Some(arr) = obj.get("securityScopedBookmarks") {
            result_obj.insert(
                "securityScopedBookmarks".to_string(),
                normalize_string_array(arr),
            );
        }
        if let Some(arr) = obj.get("pinnedDirectories") {
            result_obj.insert("pinnedDirectories".to_string(), normalize_string_array(arr));
        }

        // Typography sizes object (partial)
        if let Some(typo) = obj.get("typographySizes") {
            if let Some(sanitized) = sanitize_typography_sizes_partial(typo) {
                result_obj.insert("typographySizes".to_string(), sanitized);
            }
        }

        // Skill catalogs (array of objects)
        if let Some(Value::Array(arr)) = obj.get("skillCatalogs") {
            let mut seen: HashSet<String> = HashSet::new();
            let mut catalogs: Vec<Value> = vec![];

            for entry in arr {
                let Some(obj) = entry.as_object() else {
                    continue;
                };

                let id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
                let label = obj
                    .get("label")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim();
                let source = obj
                    .get("source")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim();
                let subpath = obj
                    .get("subpath")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim();
                let git_identity_id = obj
                    .get("gitIdentityId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim();

                if id.is_empty() || label.is_empty() || source.is_empty() {
                    continue;
                }

                if seen.contains(id) {
                    continue;
                }
                seen.insert(id.to_string());

                let mut catalog = serde_json::Map::new();
                catalog.insert("id".to_string(), json!(id));
                catalog.insert("label".to_string(), json!(label));
                catalog.insert("source".to_string(), json!(source));
                if !subpath.is_empty() {
                    catalog.insert("subpath".to_string(), json!(subpath));
                }
                if !git_identity_id.is_empty() {
                    catalog.insert("gitIdentityId".to_string(), json!(git_identity_id));
                }

                catalogs.push(Value::Object(catalog));
            }

            if !catalogs.is_empty() {
                result_obj.insert("skillCatalogs".to_string(), Value::Array(catalogs));
            }
        }
    }

    result
}

fn migrate_legacy_project_settings(settings: &mut Value) {
    if !settings.is_object() {
        *settings = json!({});
    }

    let now = Utc::now().timestamp_millis();
    let obj = settings.as_object_mut().unwrap();

    let has_projects = obj
        .get("projects")
        .and_then(|value| value.as_array())
        .map(|arr| !arr.is_empty())
        .unwrap_or(false);

    if has_projects {
        return;
    }

    let last_directory = obj
        .get("lastDirectory")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(expand_tilde_path);

    let Some(mut last_directory) = last_directory else {
        return;
    };

    if let Ok(canonicalized) = std::fs::canonicalize(&last_directory) {
        last_directory = canonicalized;
    }

    let Ok(stats) = std::fs::metadata(&last_directory) else {
        return;
    };
    if !stats.is_dir() {
        return;
    }

    let normalized_path = last_directory.to_string_lossy().to_string();
    if normalized_path.trim().is_empty() {
        return;
    }

    let project_id = Uuid::new_v4().to_string();
    let active_project_id = project_id.clone();
    let project_path = normalized_path.clone();

    let projects_value = obj.entry("projects").or_insert_with(|| json!([]));
    *projects_value = json!([
        {
            "id": project_id,
            "path": project_path,
            "addedAt": now,
            "lastOpenedAt": now
        }
    ]);

    obj.insert("activeProjectId".to_string(), json!(active_project_id));

    // Ensure approvedDirectories includes the migrated project root.
    let approved_value = obj
        .entry("approvedDirectories")
        .or_insert_with(|| json!([]));
    if !approved_value.is_array() {
        *approved_value = json!([]);
    }

    if let Some(array) = approved_value.as_array_mut() {
        array.push(json!(normalized_path.clone()));
        array.retain(|entry| entry.as_str().is_some_and(|value| !value.trim().is_empty()));
        let mut seen = HashSet::new();
        array.retain(|entry| {
            let Some(value) = entry.as_str() else {
                return false;
            };
            if seen.contains(value) {
                return false;
            }
            seen.insert(value.to_string());
            true
        });
    }
}

fn normalize_project_selection(settings: &mut Value) {
    let Some(obj) = settings.as_object_mut() else {
        return;
    };

    let Some(projects) = obj.get("projects").and_then(|value| value.as_array()) else {
        return;
    };

    if projects.is_empty() {
        obj.remove("activeProjectId");
        return;
    }

    let current_active = obj
        .get("activeProjectId")
        .and_then(|value| value.as_str())
        .unwrap_or("");

    let has_active = projects.iter().any(|entry| {
        entry
            .get("id")
            .and_then(|value| value.as_str())
            .map(|id| id == current_active)
            .unwrap_or(false)
    });

    if has_active {
        return;
    }

    let first_id = projects
        .first()
        .and_then(|entry| entry.get("id"))
        .and_then(|value| value.as_str());

    if let Some(id) = first_id {
        obj.insert("activeProjectId".to_string(), json!(id));
    } else {
        obj.remove("activeProjectId");
    }
}

/// Merge persisted settings (port of Express mergePersistedSettings)
fn merge_persisted_settings(current: &Value, changes: &Value) -> Value {
    let mut result = current.clone();

    if let (Some(result_obj), Some(changes_obj)) = (result.as_object_mut(), changes.as_object()) {
        // First apply all changes
        for (key, value) in changes_obj {
            result_obj.insert(key.clone(), value.clone());
        }

        // Build approvedDirectories from base + additional
        let base_approved = if let Some(arr) = changes_obj.get("approvedDirectories") {
            extract_string_vec(arr)
        } else if let Some(arr) = current.get("approvedDirectories") {
            extract_string_vec(arr)
        } else {
            vec![]
        };

        let mut additional_approved = vec![];
        if let Some(Value::String(s)) = changes_obj.get("lastDirectory") {
            if !s.is_empty() {
                additional_approved.push(s.clone());
            }
        }
        if let Some(Value::String(s)) = changes_obj.get("homeDirectory") {
            if !s.is_empty() {
                additional_approved.push(s.clone());
            }
        }

        let project_source = if let Some(Value::Array(arr)) = changes_obj.get("projects") {
            Some(arr)
        } else {
            current.get("projects").and_then(|v| v.as_array())
        };

        if let Some(entries) = project_source {
            for entry in entries {
                if let Some(path) = entry.get("path").and_then(|v| v.as_str()) {
                    if !path.trim().is_empty() {
                        additional_approved.push(path.trim().to_string());
                    }
                }
            }
        }

        let mut approved_set: HashSet<String> = base_approved.into_iter().collect();
        for item in additional_approved {
            approved_set.insert(item);
        }
        let approved_vec: Vec<String> = approved_set.into_iter().collect();
        result_obj.insert("approvedDirectories".to_string(), json!(approved_vec));

        // Security scoped bookmarks
        let base_bookmarks = if let Some(arr) = changes_obj.get("securityScopedBookmarks") {
            extract_string_vec(arr)
        } else if let Some(arr) = current.get("securityScopedBookmarks") {
            extract_string_vec(arr)
        } else {
            vec![]
        };
        let bookmarks_set: HashSet<String> = base_bookmarks.into_iter().collect();
        let bookmarks_vec: Vec<String> = bookmarks_set.into_iter().collect();
        result_obj.insert("securityScopedBookmarks".to_string(), json!(bookmarks_vec));

        // Merge typography sizes if present
        if changes_obj.contains_key("typographySizes") {
            let current_typo = current
                .get("typographySizes")
                .and_then(|v| v.as_object())
                .cloned()
                .unwrap_or_default();
            let changes_typo = changes_obj
                .get("typographySizes")
                .and_then(|v| v.as_object())
                .cloned()
                .unwrap_or_default();

            let mut merged_typo = current_typo;
            for (key, value) in changes_typo {
                merged_typo.insert(key, value);
            }
            result_obj.insert("typographySizes".to_string(), json!(merged_typo));
        }
    }

    result
}

/// Format settings response (port of Express formatSettingsResponse)
fn format_settings_response(settings: &Value) -> Value {
    let mut result = sanitize_settings_update(settings);

    if let Some(obj) = result.as_object_mut() {
        // Ensure array fields are normalized
        obj.insert(
            "approvedDirectories".to_string(),
            normalize_string_array(settings.get("approvedDirectories").unwrap_or(&json!([]))),
        );
        obj.insert(
            "securityScopedBookmarks".to_string(),
            normalize_string_array(
                settings
                    .get("securityScopedBookmarks")
                    .unwrap_or(&json!([])),
            ),
        );
        obj.insert(
            "pinnedDirectories".to_string(),
            normalize_string_array(settings.get("pinnedDirectories").unwrap_or(&json!([]))),
        );

        // Typography sizes
        if let Some(sanitized_typo) = sanitize_typography_sizes_partial(
            settings.get("typographySizes").unwrap_or(&json!(null)),
        ) {
            obj.insert("typographySizes".to_string(), sanitized_typo);
        }

        // showReasoningTraces with fallback
        let show_reasoning = settings
            .get("showReasoningTraces")
            .and_then(|v| v.as_bool())
            .or_else(|| {
                // Get showReasoningTraces from sanitized result instead of the current mutable borrow
                if let Some(Value::Bool(b)) = obj.get("showReasoningTraces") {
                    Some(*b)
                } else {
                    None
                }
            })
            .unwrap_or(false);
        obj.insert("showReasoningTraces".to_string(), json!(show_reasoning));
    }

    result
}

/// Normalize string array helper
fn normalize_string_array(input: &Value) -> Value {
    if let Some(arr) = input.as_array() {
        let strings: Vec<String> = arr
            .iter()
            .filter_map(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect();
        let unique: HashSet<String> = strings.into_iter().collect();
        json!(unique.into_iter().collect::<Vec<_>>())
    } else {
        json!([])
    }
}

/// Sanitize typography sizes partial helper
fn sanitize_typography_sizes_partial(input: &Value) -> Option<Value> {
    if let Some(obj) = input.as_object() {
        let mut result = serde_json::Map::new();
        let mut populated = false;

        for key in &["markdown", "code", "uiHeader", "uiLabel", "meta", "micro"] {
            if let Some(Value::String(s)) = obj.get(*key) {
                if !s.is_empty() {
                    result.insert(key.to_string(), json!(s));
                    populated = true;
                }
            }
        }

        if populated {
            Some(json!(result))
        } else {
            None
        }
    } else {
        None
    }
}

/// Extract string vector from JSON value
fn extract_string_vec(value: &Value) -> Vec<String> {
    if let Some(arr) = value.as_array() {
        arr.iter()
            .filter_map(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect()
    } else {
        vec![]
    }
}
