use anyhow::{anyhow, Result};
use chrono::{DateTime, Local, TimeZone};
use log::warn;
use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    time::Duration,
};

use crate::opencode_auth;

const OPENCODE_CONFIG_DIR: &str = ".config/opencode";
const OPENCODE_DATA_DIR: &str = ".local/share/opencode";

const GOOGLE_CLIENT_ID: &str =
    "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET: &str = "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";
const DEFAULT_PROJECT_ID: &str = "rising-fact-p41fc";
const GOOGLE_WINDOW_SECONDS: i64 = 5 * 60 * 60;

const GOOGLE_ENDPOINTS: [&str; 3] = [
    "https://daily-cloudcode-pa.sandbox.googleapis.com",
    "https://autopush-cloudcode-pa.sandbox.googleapis.com",
    "https://cloudcode-pa.googleapis.com",
];

const GOOGLE_USER_AGENT: &str = "antigravity/1.11.5 windows/amd64";
const GOOGLE_API_CLIENT: &str = "google-cloud-sdk vscode_cloudshelleditor/0.1";
const GOOGLE_CLIENT_METADATA: &str =
    "{\"ideType\":\"IDE_UNSPECIFIED\",\"platform\":\"PLATFORM_UNSPECIFIED\",\"pluginType\":\"GEMINI\"}";

#[derive(Clone, Debug, Default)]
struct AuthEntry {
    token: Option<String>,
    access: Option<String>,
    refresh: Option<String>,
    expires: Option<i64>,
    key: Option<String>,
}

#[derive(Clone, Debug, Default)]
struct GoogleAuth {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires: Option<i64>,
    project_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderResult {
    provider_id: String,
    provider_name: String,
    ok: bool,
    configured: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    usage: Option<ProviderUsage>,
    fetched_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderUsage {
    windows: HashMap<String, UsageWindow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    models: Option<HashMap<String, ProviderUsage>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UsageWindow {
    used_percent: Option<f64>,
    remaining_percent: Option<f64>,
    window_seconds: Option<i64>,
    reset_after_seconds: Option<i64>,
    reset_at: Option<i64>,
    reset_at_formatted: Option<String>,
    reset_after_formatted: Option<String>,
}

fn get_home_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
}

fn opencode_config_dir() -> PathBuf {
    get_home_dir().join(OPENCODE_CONFIG_DIR)
}

fn opencode_data_dir() -> PathBuf {
    get_home_dir().join(OPENCODE_DATA_DIR)
}

fn antigravity_accounts_paths() -> [PathBuf; 2] {
    [
        opencode_config_dir().join("antigravity-accounts.json"),
        opencode_data_dir().join("antigravity-accounts.json"),
    ]
}

async fn read_json_file(path: &PathBuf) -> Option<Value> {
    if !path.exists() {
        return None;
    }
    let raw = tokio::fs::read_to_string(path).await.ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    serde_json::from_str(trimmed).map_err(|err| {
        warn!("Failed to read JSON file {}: {}", path.display(), err);
        err
    }).ok()
}

fn get_auth_entry<'a>(auth: &'a serde_json::Map<String, Value>, aliases: &[&str]) -> Option<&'a Value> {
    for alias in aliases {
        if let Some(value) = auth.get(*alias) {
            return Some(value);
        }
    }
    None
}

fn normalize_auth_entry(value: Option<&Value>) -> Option<AuthEntry> {
    let value = value?;
    match value {
        Value::String(token) => Some(AuthEntry {
            token: Some(token.clone()),
            ..AuthEntry::default()
        }),
        Value::Object(map) => {
            let token = map.get("token").and_then(|v| v.as_str()).map(|s| s.to_string());
            let access = map.get("access").and_then(|v| v.as_str()).map(|s| s.to_string());
            let refresh = map.get("refresh").and_then(|v| v.as_str()).map(|s| s.to_string());
            let key = map.get("key").and_then(|v| v.as_str()).map(|s| s.to_string());
            let expires = map
                .get("expires")
                .and_then(|v| v.as_i64())
                .or_else(|| map.get("expires").and_then(|v| v.as_f64()).map(|v| v.round() as i64));

            Some(AuthEntry {
                token,
                access,
                refresh,
                expires,
                key,
            })
        }
        _ => None,
    }
}

fn format_reset_time(timestamp_ms: i64) -> Option<String> {
    let reset_dt = Local.timestamp_millis_opt(timestamp_ms).single()?;
    let now = Local::now();
    let is_today = reset_dt.date_naive() == now.date_naive();

    if is_today {
        // Same day: show time only (e.g., "9:56 PM")
        Some(reset_dt.format("%-I:%M %p").to_string())
    } else {
        // Different day: show date + weekday + time (e.g., "Feb 2, Sun 9:56 PM")
        Some(reset_dt.format("%b %-d, %a %-I:%M %p").to_string())
    }
}

fn calculate_reset_after_seconds(reset_at: Option<i64>) -> Option<i64> {
    let reset_at = reset_at?;
    let now_ms = chrono::Utc::now().timestamp_millis();
    let delta = (reset_at - now_ms) / 1000;
    Some(delta.max(0))
}

fn to_usage_window(used_percent: Option<f64>, window_seconds: Option<i64>, reset_at: Option<i64>) -> UsageWindow {
    let remaining_percent = used_percent.map(|value| (100.0 - value).max(0.0));
    let reset_after_seconds = calculate_reset_after_seconds(reset_at);
    let reset_formatted = reset_at.and_then(format_reset_time);

    UsageWindow {
        used_percent,
        remaining_percent,
        window_seconds,
        reset_after_seconds,
        reset_at,
        reset_at_formatted: reset_formatted.clone(),
        reset_after_formatted: reset_formatted,
    }
}

fn build_result(
    provider_id: &str,
    provider_name: &str,
    ok: bool,
    configured: bool,
    usage: Option<ProviderUsage>,
    error: Option<String>,
) -> ProviderResult {
    ProviderResult {
        provider_id: provider_id.to_string(),
        provider_name: provider_name.to_string(),
        ok,
        configured,
        error,
        usage,
        fetched_at: chrono::Utc::now().timestamp_millis(),
    }
}

async fn load_auth_map() -> Result<serde_json::Map<String, Value>> {
    let auth = opencode_auth::read_auth().await?;
    auth.as_object()
        .cloned()
        .ok_or_else(|| anyhow!("Auth file is not a valid JSON object"))
}

async fn has_antigravity_accounts() -> bool {
    for path in antigravity_accounts_paths() {
        if let Some(data) = read_json_file(&path).await {
            if data
                .get("accounts")
                .and_then(|value| value.as_array())
                .is_some_and(|accounts| !accounts.is_empty())
            {
                return true;
            }
        }
    }
    false
}

pub async fn list_configured_quota_providers() -> Result<Vec<String>> {
    let auth = load_auth_map().await?;
    let mut configured: HashSet<String> = HashSet::new();

    let openai_auth = normalize_auth_entry(get_auth_entry(&auth, &["openai", "codex", "chatgpt"]));
    if let Some(entry) = openai_auth {
        if entry.access.is_some() || entry.token.is_some() {
            configured.insert("openai".to_string());
        }
    }

    let google_auth = normalize_auth_entry(get_auth_entry(&auth, &["google", "antigravity"]));
    if let Some(entry) = google_auth {
        if entry.access.is_some() || entry.token.is_some() || entry.refresh.is_some() {
            configured.insert("google".to_string());
        }
    }

    let zai_auth =
        normalize_auth_entry(get_auth_entry(&auth, &["zai-coding-plan", "zai", "z.ai"]));
    if let Some(entry) = zai_auth {
        if entry.key.is_some() || entry.token.is_some() {
            configured.insert("zai-coding-plan".to_string());
        }
    }

    if has_antigravity_accounts().await {
        configured.insert("google".to_string());
    }

    Ok(configured.into_iter().collect())
}

fn parse_number(value: Option<&Value>) -> Option<f64> {
    let value = value?;
    value.as_f64().or_else(|| value.as_i64().map(|v| v as f64))
}

async fn fetch_openai_quota(client: &Client) -> Result<ProviderResult> {
    let auth = load_auth_map().await?;
    let entry = normalize_auth_entry(get_auth_entry(&auth, &["openai", "codex", "chatgpt"]));
    let access_token = entry
        .as_ref()
        .and_then(|entry| entry.access.clone().or(entry.token.clone()));

    let Some(access_token) = access_token else {
        return Ok(build_result(
            "openai",
            "OpenAI",
            false,
            false,
            None,
            Some("Not configured".to_string()),
        ));
    };

    let response = client
        .get("https://chatgpt.com/backend-api/wham/usage")
        .bearer_auth(access_token)
        .header("Content-Type", "application/json")
        .send()
        .await;

    let response = match response {
        Ok(resp) => resp,
        Err(err) => {
            return Ok(build_result(
                "openai",
                "OpenAI",
                false,
                true,
                None,
                Some(err.to_string()),
            ))
        }
    };

    if !response.status().is_success() {
        return Ok(build_result(
            "openai",
            "OpenAI",
            false,
            true,
            None,
            Some(format!("API error: {}", response.status().as_u16())),
        ));
    }

    let payload: Value = match response.json().await {
        Ok(value) => value,
        Err(err) => {
            return Ok(build_result(
                "openai",
                "OpenAI",
                false,
                true,
                None,
                Some(err.to_string()),
            ))
        }
    };

    let primary = payload
        .get("rate_limit")
        .and_then(|value| value.get("primary_window"));
    let secondary = payload
        .get("rate_limit")
        .and_then(|value| value.get("secondary_window"));

    let mut windows: HashMap<String, UsageWindow> = HashMap::new();

    if let Some(primary) = primary {
        let used_percent = parse_number(primary.get("used_percent"));
        let window_seconds = primary
            .get("limit_window_seconds")
            .and_then(|value| value.as_i64());
        let reset_at = primary
            .get("reset_at")
            .and_then(|value| value.as_i64())
            .map(|value| value * 1000);
        windows.insert(
            "5h".to_string(),
            to_usage_window(used_percent, window_seconds, reset_at),
        );
    }

    if let Some(secondary) = secondary {
        let used_percent = parse_number(secondary.get("used_percent"));
        let window_seconds = secondary
            .get("limit_window_seconds")
            .and_then(|value| value.as_i64());
        let reset_at = secondary
            .get("reset_at")
            .and_then(|value| value.as_i64())
            .map(|value| value * 1000);
        windows.insert(
            "weekly".to_string(),
            to_usage_window(used_percent, window_seconds, reset_at),
        );
    }

    Ok(build_result(
        "openai",
        "OpenAI",
        true,
        true,
        Some(ProviderUsage {
            windows,
            models: None,
        }),
        None,
    ))
}

async fn resolve_google_auth() -> Result<Option<GoogleAuth>> {
    let auth = load_auth_map().await?;
    let entry = normalize_auth_entry(get_auth_entry(&auth, &["google", "antigravity"]));

    if let Some(entry) = entry {
        let mut refresh = entry.refresh.clone();
        let mut project_id = None;
        if let Some(value) = entry.refresh.clone() {
            if let Some((first, second)) = value.split_once('|') {
                refresh = Some(first.to_string());
                project_id = Some(second.to_string());
            }
        }
        return Ok(Some(GoogleAuth {
            access_token: entry.access.or(entry.token),
            refresh_token: refresh,
            expires: entry.expires,
            project_id,
        }));
    }

    for path in antigravity_accounts_paths() {
        let data = match read_json_file(&path).await {
            Some(data) => data,
            None => continue,
        };
        let accounts = data.get("accounts").and_then(|value| value.as_array());
        if let Some(accounts) = accounts {
            if accounts.is_empty() {
                continue;
            }
            let index = data
                .get("activeIndex")
                .and_then(|value| value.as_i64())
                .unwrap_or(0)
                .max(0) as usize;
            let account = accounts.get(index).or_else(|| accounts.first());
            if let Some(account) = account {
                let refresh_token = account
                    .get("refreshToken")
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string());
                if refresh_token.is_none() {
                    continue;
                }
                let project_id = account
                    .get("projectId")
                    .and_then(|value| value.as_str())
                    .or_else(|| {
                        account
                            .get("managedProjectId")
                            .and_then(|value| value.as_str())
                    })
                    .map(|value| value.to_string());

                return Ok(Some(GoogleAuth {
                    access_token: None,
                    refresh_token,
                    expires: None,
                    project_id,
                }));
            }
        }
    }

    Ok(None)
}

async fn refresh_google_access_token(client: &Client, refresh_token: &str) -> Result<Option<String>> {
    let body = format!(
        "client_id={}&client_secret={}&refresh_token={}&grant_type=refresh_token",
        urlencoding::encode(GOOGLE_CLIENT_ID),
        urlencoding::encode(GOOGLE_CLIENT_SECRET),
        urlencoding::encode(refresh_token)
    );

    let response = client
        .post("https://oauth2.googleapis.com/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await;

    let response = match response {
        Ok(resp) => resp,
        Err(err) => {
            warn!("Failed to refresh Google token: {}", err);
            return Ok(None);
        }
    };

    if !response.status().is_success() {
        return Ok(None);
    }

    let payload: Value = response.json().await.unwrap_or(Value::Null);
    Ok(payload
        .get("access_token")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string()))
}

async fn fetch_google_models(client: &Client, access_token: &str, project_id: Option<&str>) -> Option<Value> {
    let body = if let Some(project_id) = project_id {
        serde_json::json!({ "project": project_id })
    } else {
        serde_json::json!({})
    };

    for endpoint in GOOGLE_ENDPOINTS {
        let response = client
            .post(format!("{}/v1internal:fetchAvailableModels", endpoint))
            .header("Authorization", format!("Bearer {}", access_token))
            .header("Content-Type", "application/json")
            .header("User-Agent", GOOGLE_USER_AGENT)
            .header("X-Goog-Api-Client", GOOGLE_API_CLIENT)
            .header("Client-Metadata", GOOGLE_CLIENT_METADATA)
            .json(&body)
            .timeout(Duration::from_secs(15))
            .send()
            .await;

        let response = match response {
            Ok(resp) => resp,
            Err(_) => continue,
        };

        if response.status().is_success() {
            if let Ok(payload) = response.json::<Value>().await {
                return Some(payload);
            }
        }
    }

    None
}

fn parse_reset_time(value: Option<&Value>) -> Option<i64> {
    let value = value?;
    if let Some(num) = value.as_i64() {
        if num > 0 {
            return Some(num);
        }
    }
    if let Some(text) = value.as_str() {
        if let Ok(parsed) = DateTime::parse_from_rfc3339(text) {
            return Some(parsed.timestamp_millis());
        }
    }
    None
}

async fn fetch_google_quota(client: &Client) -> Result<ProviderResult> {
    let auth = resolve_google_auth().await?;
    let Some(auth) = auth else {
        return Ok(build_result(
            "google",
            "Google",
            false,
            false,
            None,
            Some("Not configured".to_string()),
        ));
    };

    let now = chrono::Utc::now().timestamp_millis();
    let mut access_token = auth.access_token;
    if access_token.is_none()
        || auth
            .expires
            .is_some_and(|expires| expires <= now)
    {
        let Some(refresh_token) = auth.refresh_token.as_ref() else {
            return Ok(build_result(
                "google",
                "Google",
                false,
                true,
                None,
                Some("Missing refresh token".to_string()),
            ));
        };
        access_token = refresh_google_access_token(client, refresh_token).await?;
    }

    let Some(access_token) = access_token else {
        return Ok(build_result(
            "google",
            "Google",
            false,
            true,
            None,
            Some("Failed to refresh OAuth token".to_string()),
        ));
    };

    let project_id = auth.project_id.unwrap_or_else(|| DEFAULT_PROJECT_ID.to_string());
    let payload = fetch_google_models(client, &access_token, Some(project_id.as_str())).await;
    let Some(payload) = payload else {
        return Ok(build_result(
            "google",
            "Google",
            false,
            true,
            None,
            Some("Failed to fetch models".to_string()),
        ));
    };

    let mut models: HashMap<String, ProviderUsage> = HashMap::new();
    if let Some(model_map) = payload.get("models").and_then(|value| value.as_object()) {
        for (model_name, model_data) in model_map {
            let remaining_fraction = parse_number(model_data.get("quotaInfo").and_then(|v| v.get("remainingFraction")));
            let remaining_percent = remaining_fraction.map(|value| (value * 100.0).round());
            let used_percent = remaining_percent.map(|value| (100.0 - value).max(0.0));
            let reset_at = parse_reset_time(model_data.get("quotaInfo").and_then(|v| v.get("resetTime")));

            let mut windows = HashMap::new();
            windows.insert(
                "5h".to_string(),
                to_usage_window(used_percent, Some(GOOGLE_WINDOW_SECONDS), reset_at),
            );
            models.insert(
                model_name.to_string(),
                ProviderUsage {
                    windows,
                    models: None,
                },
            );
        }
    }

    Ok(build_result(
        "google",
        "Google",
        true,
        true,
        Some(ProviderUsage {
            windows: HashMap::new(),
            models: if models.is_empty() { None } else { Some(models) },
        }),
        None,
    ))
}

fn normalize_timestamp(value: Option<&Value>) -> Option<i64> {
    let value = value?;
    if let Some(num) = value.as_i64() {
        if num < 1_000_000_000_000 {
            return Some(num * 1000);
        }
        return Some(num);
    }
    None
}

fn resolve_window_seconds(limit: &Value) -> Option<i64> {
    let number = limit.get("number").and_then(|value| value.as_i64())?;
    let unit = limit.get("unit").and_then(|value| value.as_i64())?;
    let unit_seconds = match unit {
        3 => Some(3600),
        _ => None,
    }?;
    Some(unit_seconds * number)
}

fn resolve_window_label(window_seconds: Option<i64>) -> String {
    let Some(window_seconds) = window_seconds else {
        return "tokens".to_string();
    };
    if window_seconds % 86400 == 0 {
        let days = window_seconds / 86400;
        if days == 7 {
            return "weekly".to_string();
        }
        return format!("{}d", days);
    }
    if window_seconds % 3600 == 0 {
        return format!("{}h", window_seconds / 3600);
    }
    format!("{}s", window_seconds)
}

async fn fetch_zai_quota(client: &Client) -> Result<ProviderResult> {
    let auth = load_auth_map().await?;
    let entry = normalize_auth_entry(get_auth_entry(&auth, &["zai-coding-plan", "zai", "z.ai"]));
    let api_key = entry
        .as_ref()
        .and_then(|entry| entry.key.clone().or(entry.token.clone()));

    let Some(api_key) = api_key else {
        return Ok(build_result(
            "zai-coding-plan",
            "z.ai",
            false,
            false,
            None,
            Some("Not configured".to_string()),
        ));
    };

    let response = client
        .get("https://api.z.ai/api/monitor/usage/quota/limit")
        .bearer_auth(api_key)
        .header("Content-Type", "application/json")
        .send()
        .await;

    let response = match response {
        Ok(resp) => resp,
        Err(err) => {
            return Ok(build_result(
                "zai-coding-plan",
                "z.ai",
                false,
                true,
                None,
                Some(err.to_string()),
            ))
        }
    };

    if !response.status().is_success() {
        return Ok(build_result(
            "zai-coding-plan",
            "z.ai",
            false,
            true,
            None,
            Some(format!("API error: {}", response.status().as_u16())),
        ));
    }

    let payload: Value = match response.json().await {
        Ok(value) => value,
        Err(err) => {
            return Ok(build_result(
                "zai-coding-plan",
                "z.ai",
                false,
                true,
                None,
                Some(err.to_string()),
            ))
        }
    };

    let limits = payload
        .get("data")
        .and_then(|value| value.get("limits"))
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    let tokens_limit = limits
        .iter()
        .find(|limit| limit.get("type").and_then(|value| value.as_str()) == Some("TOKENS_LIMIT"));

    let mut windows = HashMap::new();
    if let Some(limit) = tokens_limit {
        let window_seconds = resolve_window_seconds(limit);
        let window_label = resolve_window_label(window_seconds);
        let reset_at = normalize_timestamp(limit.get("nextResetTime"));
        let used_percent = parse_number(limit.get("percentage"));

        windows.insert(
            window_label,
            to_usage_window(used_percent, window_seconds, reset_at),
        );
    }

    Ok(build_result(
        "zai-coding-plan",
        "z.ai",
        true,
        true,
        Some(ProviderUsage {
            windows,
            models: None,
        }),
        None,
    ))
}

pub async fn fetch_quota_for_provider(client: &Client, provider_id: &str) -> Result<ProviderResult> {
    match provider_id {
        "openai" => fetch_openai_quota(client).await,
        "google" => fetch_google_quota(client).await,
        "zai-coding-plan" => fetch_zai_quota(client).await,
        _ => Ok(build_result(
            provider_id,
            provider_id,
            false,
            false,
            None,
            Some("Unsupported provider".to_string()),
        )),
    }
}
