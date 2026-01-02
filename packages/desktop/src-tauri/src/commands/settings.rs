use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use tauri::State;

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

/// Load settings from disk (matches Express handler behavior)
#[tauri::command]
pub async fn load_settings(state: State<'_, DesktopRuntime>) -> Result<SettingsLoadResult, String> {
    let settings = state
        .settings()
        .load()
        .await
        .map_err(|e| format!("Failed to load settings: {}", e))?;

    Ok(SettingsLoadResult {
        settings,
        source: "desktop".to_string(),
    })
}

/// Save settings to disk with merge logic matching Express implementation
#[tauri::command]
pub async fn save_settings(
    changes: Value,
    state: State<'_, DesktopRuntime>,
) -> Result<Value, String> {
    // Load current settings
    let current = state
        .settings()
        .load()
        .await
        .map_err(|e| format!("Failed to load current settings: {}", e))?;

    // Sanitize incoming changes
    let sanitized_changes = sanitize_settings_update(&changes);

    // Merge changes into current settings
    let merged = merge_persisted_settings(&current, &sanitized_changes);

    // Save merged settings
    state
        .settings()
        .save(merged.clone())
        .await
        .map_err(|e| format!("Failed to save settings: {}", e))?;

    // Format response
    Ok(format_settings_response(&merged))
}

/// Restart OpenCode CLI (matches Express /api/config/reload)
#[tauri::command]
pub async fn restart_opencode(state: State<'_, DesktopRuntime>) -> Result<RestartResult, String> {
    state
        .opencode
        .restart()
        .await
        .map_err(|e| format!("Failed to restart OpenCode: {}", e))?;

    Ok(RestartResult { restarted: true })
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
        if let Some(Value::String(s)) = obj.get("defaultModel") {
            if !s.is_empty() {
                result_obj.insert("defaultModel".to_string(), json!(s));
            }
        }
        if let Some(Value::String(s)) = obj.get("defaultAgent") {
            if !s.is_empty() {
                result_obj.insert("defaultAgent".to_string(), json!(s));
            }
        }

        // Boolean fields
        if let Some(Value::Bool(b)) = obj.get("useSystemTheme") {
            result_obj.insert("useSystemTheme".to_string(), json!(b));
        }
        if let Some(Value::Bool(b)) = obj.get("showReasoningTraces") {
            result_obj.insert("showReasoningTraces".to_string(), json!(b));
        }
        if let Some(Value::Bool(b)) = obj.get("autoDeleteEnabled") {
            result_obj.insert("autoDeleteEnabled".to_string(), json!(b));
        }
        if let Some(Value::Bool(b)) = obj.get("queueModeEnabled") {
            result_obj.insert("queueModeEnabled".to_string(), json!(b));
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
