use std::{collections::HashMap, path::PathBuf};

use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::fs;

const PROMPT_ENHANCER_FILE_NAME: &str = "prompt-enhancer-config.json";
const DEFAULT_OPTION_TEMPLATE_LABEL: &str = "New option";
const DEFAULT_OPTION_TEMPLATE_SUMMARY: &str = "New option";
const DEFAULT_OPTION_TEMPLATE_DESCRIPTION: &str = "Describe what this option influences.";
const DEFAULT_OPTION_TEMPLATE_INSTRUCTION: &str =
    "Explain the guidance this option should add to the refined prompt.";

static DEFAULT_PROMPT_ENHANCER_CONFIG: Lazy<PromptEnhancerConfig> = Lazy::new(|| {
    let raw = include_str!("../../../../ui/src/assets/prompt-enhancer-config.json");
    serde_json::from_str(raw).unwrap_or_else(|error| {
        eprintln!(
            "[prompt-enhancer] Failed to parse default config: {error:?}. Falling back to empty config."
        );
        PromptEnhancerConfig {
            version: 1,
            group_order: vec![],
            groups: HashMap::new(),
        }
    })
});

fn prompt_enhancer_config_path() -> Option<PathBuf> {
    let mut path = dirs::home_dir()?;
    path.push(".config");
    path.push("openchamber");
    path.push(PROMPT_ENHANCER_FILE_NAME);
    Some(path)
}

fn sanitize_identifier(value: &str) -> String {
    static INVALID_CHARS: Lazy<Regex> =
        Lazy::new(|| Regex::new("[^a-z0-9-]+").expect("valid regex for prompt enhancer ids"));
    let trimmed = value.trim().to_lowercase();
    let sanitized = INVALID_CHARS.replace_all(&trimmed, "-");
    sanitized.trim_matches('-').to_string()
}

fn humanize_identifier(value: &str) -> String {
    let chunks: Vec<String> = value
        .split(|c: char| c == '-' || c == '_')
        .filter(|part| !part.is_empty())
        .map(|segment| {
            let mut chars = segment.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect();
    if chunks.is_empty() {
        "Group".to_string()
    } else {
        chunks.join(" ")
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PromptEnhancerOption {
    pub id: String,
    pub label: String,
    pub summary_label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub instruction: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PromptEnhancerGroup {
    pub id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub helper_text: Option<String>,
    pub summary_heading: String,
    pub multi_select: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_option_id: Option<String>,
    pub options: Vec<PromptEnhancerOption>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PromptEnhancerConfig {
    pub version: u32,
    pub group_order: Vec<String>,
    pub groups: HashMap<String, PromptEnhancerGroup>,
}

fn build_default_group(group_id: &str, multi_select: bool) -> PromptEnhancerGroup {
    let normalized_id = sanitize_identifier(group_id);
    let label = humanize_identifier(&normalized_id);
    let option = PromptEnhancerOption {
        id: "default".to_string(),
        label: DEFAULT_OPTION_TEMPLATE_LABEL.to_string(),
        summary_label: DEFAULT_OPTION_TEMPLATE_SUMMARY.to_string(),
        description: Some(DEFAULT_OPTION_TEMPLATE_DESCRIPTION.to_string()),
        instruction: DEFAULT_OPTION_TEMPLATE_INSTRUCTION.to_string(),
    };

    PromptEnhancerGroup {
        id: normalized_id.clone(),
        label: label.clone(),
        helper_text: None,
        summary_heading: label,
        multi_select,
        default_option_id: if multi_select {
            None
        } else {
            Some(option.id.clone())
        },
        options: vec![option],
    }
}

fn sanitize_option(raw: &Value) -> Option<PromptEnhancerOption> {
    let obj = raw.as_object()?;
    let id = obj
        .get("id")
        .and_then(|value| value.as_str())
        .map(sanitize_identifier)?;
    if id.is_empty() {
        return None;
    }

    let instruction = obj
        .get("instruction")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .unwrap_or_default();
    if instruction.is_empty() {
        return None;
    }

    let label = obj
        .get("label")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_OPTION_TEMPLATE_LABEL.to_string());

    let summary_label = obj
        .get("summaryLabel")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| label.clone());

    let description = obj
        .get("description")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    Some(PromptEnhancerOption {
        id,
        label,
        summary_label,
        description,
        instruction,
    })
}

fn ensure_group_integrity(raw: &Value, fallback: &PromptEnhancerGroup) -> PromptEnhancerGroup {
    let mut option_map = HashMap::new();
    if let Some(options) = raw.get("options").and_then(|value| value.as_array()) {
        for entry in options {
            if let Some(option) = sanitize_option(entry) {
                option_map.insert(option.id.clone(), option);
            }
        }
    }

    let mut merged_options = Vec::new();
    for fallback_option in &fallback.options {
        if let Some(custom) = option_map.remove(&fallback_option.id) {
            merged_options.push(custom);
        } else {
            merged_options.push(fallback_option.clone());
        }
    }
    merged_options.extend(option_map.into_values());

    if merged_options.is_empty() {
        merged_options = fallback.options.clone();
    }

    let multi_select = raw
        .get("multiSelect")
        .and_then(|value| value.as_bool())
        .unwrap_or(fallback.multi_select);

    let default_option_id = if multi_select {
        None
    } else {
        let candidate = raw
            .get("defaultOptionId")
            .and_then(|value| value.as_str())
            .map(sanitize_identifier);

        candidate
            .filter(|id| merged_options.iter().any(|option| option.id == *id))
            .or_else(|| fallback.default_option_id.clone())
            .or_else(|| merged_options.first().map(|option| option.id.clone()))
    };

    let label = raw
        .get("label")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback.label.clone());

    let helper_text = raw
        .get("helperText")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| fallback.helper_text.clone());

    let summary_heading = raw
        .get("summaryHeading")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback.summary_heading.clone());

    PromptEnhancerGroup {
        id: fallback.id.clone(),
        label,
        helper_text,
        summary_heading,
        multi_select,
        default_option_id,
        options: merged_options,
    }
}

fn sanitize_config(value: &Value) -> PromptEnhancerConfig {
    let defaults = DEFAULT_PROMPT_ENHANCER_CONFIG.clone();
    let mut raw_groups: HashMap<String, &Value> = HashMap::new();

    if let Some(groups) = value.get("groups").and_then(|v| v.as_object()) {
        for (raw_id, raw_group) in groups {
            let normalized_id = sanitize_identifier(raw_id);
            if normalized_id.is_empty() {
                continue;
            }
            raw_groups.insert(normalized_id, raw_group);
        }
    }

    let mut normalized_order = Vec::new();
    if let Some(order) = value.get("groupOrder").and_then(|v| v.as_array()) {
        for entry in order {
            if let Some(raw_id) = entry.as_str() {
                let normalized = sanitize_identifier(raw_id);
                if !normalized.is_empty() && !normalized_order.contains(&normalized) {
                    normalized_order.push(normalized);
                }
            }
        }
    }

    for core_id in &defaults.group_order {
        if !normalized_order.contains(core_id) {
            normalized_order.push(core_id.clone());
        }
    }

    for custom_id in raw_groups.keys() {
        if !normalized_order.contains(custom_id) {
            normalized_order.push(custom_id.clone());
        }
    }

    let mut groups = HashMap::new();
    for group_id in &normalized_order {
        let fallback = defaults
            .groups
            .get(group_id)
            .cloned()
            .unwrap_or_else(|| {
                let multi_select_hint = raw_groups
                    .get(group_id)
                    .and_then(|value| value.get("multiSelect"))
                    .and_then(|value| value.as_bool())
                    .unwrap_or(false);
                build_default_group(group_id, multi_select_hint)
            });

        let sanitized = raw_groups
            .get(group_id)
            .map(|raw| ensure_group_integrity(raw, &fallback))
            .unwrap_or(fallback.clone());

        groups.insert(group_id.clone(), sanitized);
    }

    PromptEnhancerConfig {
        version: value
            .get("version")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32)
            .unwrap_or(defaults.version),
        group_order: normalized_order,
        groups,
    }
}

async fn write_config_to_disk(config: &PromptEnhancerConfig) -> Result<(), std::io::Error> {
    let path = prompt_enhancer_config_path().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::NotFound, "Failed to resolve config path")
    })?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await.ok();
    }
    let payload = serde_json::to_vec_pretty(config)?;
    fs::write(path, payload).await
}

async fn read_config_from_disk() -> Result<PromptEnhancerConfig, std::io::Error> {
    let path = prompt_enhancer_config_path().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::NotFound, "Failed to resolve config path")
    })?;

    match fs::read(&path).await {
        Ok(bytes) => {
            let value: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
            let sanitized = sanitize_config(&value);
            let _ = write_config_to_disk(&sanitized).await;
            Ok(sanitized)
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            let sanitized = DEFAULT_PROMPT_ENHANCER_CONFIG.clone();
            let _ = write_config_to_disk(&sanitized).await;
            Ok(sanitized)
        }
        Err(err) => Err(err),
    }
}

#[tauri::command]
pub async fn load_prompt_enhancer_config() -> Result<PromptEnhancerConfig, String> {
    read_config_from_disk().await.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn save_prompt_enhancer_config(payload: Value) -> Result<PromptEnhancerConfig, String> {
    let sanitized = sanitize_config(&payload);
    write_config_to_disk(&sanitized)
        .await
        .map_err(|err| err.to_string())?;
    Ok(sanitized)
}
