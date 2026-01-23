use std::{collections::HashSet, path::PathBuf, time::Duration};

use anyhow::Result;
use futures_util::TryStreamExt;
use log::{debug, info, warn};
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::{io::AsyncBufReadExt, sync::Mutex};
use tokio_util::io::StreamReader;

use crate::path_utils::expand_tilde_path;
use crate::DesktopRuntime;

#[derive(Deserialize)]
struct EventEnvelope {
    #[serde(rename = "type")]
    event_type: String,
    #[serde(default)]
    properties: Value,
}

#[derive(Deserialize)]
struct MultiplexedEventEnvelope {
    #[serde(default)]
    #[allow(dead_code)]
    directory: Option<String>,
    payload: EventEnvelope,
}

pub fn spawn_assistant_notifications(
    app: AppHandle,
    runtime: DesktopRuntime,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        let client = Client::builder()
            // Give SSE a very long overall timeout so idle periods don't abort the stream.
            .timeout(Duration::from_secs(24 * 60 * 60))
            .tcp_keepalive(Some(Duration::from_secs(30)))
            .build()
            .expect("failed to build reqwest client");

        let mut shutdown_rx = runtime.subscribe_shutdown();
        let notified_messages = Mutex::new(HashSet::<String>::new());
        let notified_questions = Mutex::new(HashSet::<String>::new());

        loop {
            tokio::select! {
                _ = shutdown_rx.recv() => {
                    info!("[desktop:notify] Shutdown received, stopping SSE listener");
                    break;
                }
                _ = async {
                    if let Err(err) = run_once(&app, &runtime, &client, &notified_messages, &notified_questions).await {
                        warn!("[desktop:notify] SSE loop error: {err:?}");
                    }
                    tokio::time::sleep(Duration::from_secs(2)).await;
                } => {}
            }
        }
    })
}

async fn run_once(
    app: &AppHandle,
    runtime: &DesktopRuntime,
    client: &Client,
    notified_messages: &Mutex<HashSet<String>>,
    notified_questions: &Mutex<HashSet<String>>,
) -> Result<()> {
    let opencode = runtime.opencode_manager();

    let port = match opencode.current_port() {
        Some(port) => port,
        None => {
            warn!("[desktop:notify] OpenCode port unavailable; will retry");
            tokio::time::sleep(Duration::from_secs(2)).await;
            return Ok(());
        }
    };

    let prefix = opencode.api_prefix();
    let base = format!("http://127.0.0.1:{port}{prefix}");
    let response = connect_notifications_sse(runtime, client, &base).await?;

    let stream = response
        .bytes_stream()
        .map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err));
    let mut reader = StreamReader::new(stream);
    let mut buf = Vec::new();
    let mut data_lines: Vec<String> = Vec::new();

    loop {
        buf.clear();
        let bytes_read = match reader.read_until(b'\n', &mut buf).await {
            Ok(n) => n,
            Err(err) => {
                warn!("[desktop:notify] Read error in SSE stream: {err:?}");
                return Err(err.into());
            }
        };
        if bytes_read == 0 {
            break;
        }

        let line = match std::str::from_utf8(&buf) {
            Ok(s) => s.trim_end_matches(&['\r', '\n'][..]).to_string(),
            Err(err) => {
                warn!("[desktop:notify] Non-UTF8 SSE chunk: {err}");
                continue;
            }
        };

        if line.is_empty() {
            if data_lines.is_empty() {
                continue;
            }
            let raw = data_lines.join("\n");
            data_lines.clear();

            match parse_event_envelope(&raw) {
                Ok(event) => handle_event(app, event, notified_messages, notified_questions).await,
                Err(err) => {
                    warn!("[desktop:notify] Failed to parse SSE data: {err}; raw={raw}");
                }
            }
            continue;
        }

        if let Some(rest) = line.strip_prefix("data:") {
            data_lines.push(rest.trim_start().to_string());
        }
    }

    Ok(())
}

fn parse_event_envelope(raw: &str) -> Result<EventEnvelope> {
    if let Ok(event) = serde_json::from_str::<EventEnvelope>(raw) {
        return Ok(event);
    }

    let multiplexed = serde_json::from_str::<MultiplexedEventEnvelope>(raw)?;
    Ok(multiplexed.payload)
}

async fn resolve_project_directory_from_settings(runtime: &DesktopRuntime) -> Option<PathBuf> {
    let settings = runtime.settings().load().await.ok()?;

    if let Some(active_id) = settings.get("activeProjectId").and_then(Value::as_str) {
        if let Some(projects) = settings.get("projects").and_then(Value::as_array) {
            if let Some(path) = projects.iter().find_map(|entry| {
                let id = entry.get("id").and_then(Value::as_str)?;
                if id != active_id {
                    return None;
                }
                entry.get("path").and_then(Value::as_str)
            }) {
                return Some(expand_tilde_path(path));
            }
        }
    }

    settings
        .get("lastDirectory")
        .and_then(Value::as_str)
        .map(expand_tilde_path)
}

async fn connect_notifications_sse(
    runtime: &DesktopRuntime,
    client: &Client,
    base: &str,
) -> Result<reqwest::Response> {
    let global_url = format!("{base}/global/event");
    match try_connect_sse(client, &global_url, "[desktop:notify]").await {
        Ok(response) => {
            debug!("[desktop:notify] Using SSE endpoint: {global_url}");
            return Ok(response);
        }
        Err(err) => {
            debug!(
                "[desktop:notify] SSE endpoint unavailable: {global_url} ({err:?}); falling back"
            );
        }
    }

    let event_url = format!("{base}/event");
    match try_connect_sse(client, &event_url, "[desktop:notify]").await {
        Ok(response) => {
            debug!("[desktop:notify] Using SSE endpoint: {event_url}");
            return Ok(response);
        }
        Err(err) => {
            debug!(
                "[desktop:notify] SSE endpoint unavailable: {event_url} ({err:?}); falling back"
            );
        }
    }

    let Some(working_dir) = resolve_project_directory_from_settings(runtime).await else {
        anyhow::bail!("No project directory available for SSE fallback");
    };
    let directory = working_dir.to_string_lossy().to_string();
    let mut parsed = reqwest::Url::parse(&event_url)?;
    parsed
        .query_pairs_mut()
        .append_pair("directory", &directory);
    let directory_url = parsed.to_string();

    let response = try_connect_sse(client, &directory_url, "[desktop:notify]").await?;
    debug!("[desktop:notify] Using directory-scoped SSE endpoint: {directory_url}");
    Ok(response)
}

async fn try_connect_sse(
    client: &Client,
    url: &str,
    log_prefix: &str,
) -> Result<reqwest::Response> {
    debug!("{log_prefix} Connecting SSE: {url}");

    let response = client
        .get(url)
        .header("accept", "text/event-stream")
        .header("accept-encoding", "identity")
        .send()
        .await?;

    debug!(
        "{log_prefix} SSE response status={} headers={:?}",
        response.status(),
        response.headers()
    );

    if !response.status().is_success() {
        anyhow::bail!("SSE connect failed with status {}", response.status());
    }

    Ok(response)
}

async fn handle_event(
    app: &AppHandle,
    event: EventEnvelope,
    notified_messages: &Mutex<HashSet<String>>,
    notified_questions: &Mutex<HashSet<String>>,
) {
    match event.event_type.as_str() {
        "message.updated" => {
            handle_message_updated(app, &event.properties, notified_messages).await;
        }
        "question.asked" => {
            handle_question_asked(app, &event.properties, notified_questions).await;
        }
        "permission.asked" => {
            handle_permission_asked(app, &event.properties, notified_questions).await;
        }
        _ => {}
    }
}

async fn handle_question_asked(
    app: &AppHandle,
    properties: &Value,
    notified_questions: &Mutex<HashSet<String>>,
) {

    let session_id = properties.get("sessionID").and_then(Value::as_str);
    let question_id = properties.get("id").and_then(Value::as_str);

    let (session_id, question_id) = match (session_id, question_id) {
        (Some(s), Some(q)) => (s, q),
        _ => return,
    };

    let key = format!("{}:{}", session_id, question_id);
    {
        let mut notified = notified_questions.lock().await;
        if notified.contains(&key) {
            return;
        }
        notified.insert(key);
    }

    let should_notify = app
        .get_webview_window("main")
        .map(|window| {
            let focused = window.is_focused().unwrap_or(false);
            let minimized = window.is_minimized().unwrap_or(false);
            !focused || minimized
        })
        .unwrap_or(true);

    if should_notify {
        let _ = app
            .notification()
            .builder()
            .title("Input needed")
            .body("Agent is waiting for your response")
            .sound("Glass")
            .show();
    }
}

async fn handle_permission_asked(
    app: &AppHandle,
    properties: &Value,
    notified_requests: &Mutex<HashSet<String>>,
) {
    let session_id = properties.get("sessionID").and_then(Value::as_str);
    let request_id = properties.get("id").and_then(Value::as_str);

    let (session_id, request_id) = match (session_id, request_id) {
        (Some(s), Some(r)) => (s, r),
        _ => return,
    };

    let key = format!("{}:{}", session_id, request_id);
    {
        let mut notified = notified_requests.lock().await;
        if notified.contains(&key) {
            return;
        }
        notified.insert(key);
    }

    let permission = properties
        .get("permission")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or("Agent requested permission");

    let should_notify = app
        .get_webview_window("main")
        .map(|window| {
            let focused = window.is_focused().unwrap_or(false);
            let minimized = window.is_minimized().unwrap_or(false);
            !focused || minimized
        })
        .unwrap_or(true);

    if should_notify {
        let _ = app
            .notification()
            .builder()
            .title("Permission required")
            .body(permission)
            .sound("Glass")
            .show();
    }
}

async fn handle_message_updated(
    app: &AppHandle,
    properties: &Value,
    notified_messages: &Mutex<HashSet<String>>,
) {
    let Some(info) = properties.get("info") else {
        return;
    };

    let role = info.get("role").and_then(Value::as_str).unwrap_or_default();
    if role != "assistant" {
        return;
    }

    let finish = info.get("finish").and_then(Value::as_str);
    if finish != Some("stop") {
        return;
    }

    let message_id = match info.get("id").and_then(Value::as_str) {
        Some(id) => id.to_string(),
        None => return,
    };

    {
        let mut notified = notified_messages.lock().await;
        if notified.contains(&message_id) {
            return;
        }
        notified.insert(message_id.clone());
    }

    let raw_mode = info
        .get("mode")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or("agent");
    let raw_model = info
        .get("modelID")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or("assistant");

    let title = format!("{} agent is ready", format_mode(raw_mode));
    let body = format!("{} completed the task", format_model_id(raw_model));

    let should_notify = app
        .get_webview_window("main")
        .map(|window| {
            let focused = window.is_focused().unwrap_or(false);
            let minimized = window.is_minimized().unwrap_or(false);
            // Only notify when the app is not in the foreground or is minimized
            !focused || minimized
        })
        .unwrap_or(true);

    if should_notify {
        let _ = app
            .notification()
            .builder()
            .title(title)
            .body(body)
            .sound("Glass")
            .show();
    }
}

fn format_mode(raw: &str) -> String {
    if raw.is_empty() {
        return "Agent".to_string();
    }
    raw.split(&['-', '_', ' '][..])
        .filter(|s| !s.is_empty())
        .map(capitalize)
        .collect::<Vec<_>>()
        .join(" ")
}

fn format_model_id(raw: &str) -> String {
    if raw.is_empty() {
        return "Assistant".to_string();
    }

    let tokens: Vec<&str> = raw.split(&['-', '_'][..]).collect();
    let mut result: Vec<String> = Vec::new();
    let mut i = 0;

    while i < tokens.len() {
        let current = tokens[i];

        if current.chars().all(|c| c.is_ascii_digit()) {
            if i + 1 < tokens.len() && tokens[i + 1].chars().all(|c| c.is_ascii_digit()) {
                let combined = format!("{}.{}", current, tokens[i + 1]);
                result.push(combined);
                i += 2;
                continue;
            }
        }

        result.push(current.to_string());
        i += 1;
    }

    result
        .into_iter()
        .map(|part| capitalize(&part))
        .collect::<Vec<_>>()
        .join(" ")
}

fn capitalize(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}
