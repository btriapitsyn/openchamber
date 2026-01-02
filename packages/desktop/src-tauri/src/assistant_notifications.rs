use std::{collections::HashSet, time::Duration};

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

use crate::DesktopRuntime;

#[derive(Deserialize)]
struct EventEnvelope {
    #[serde(rename = "type")]
    event_type: String,
    #[serde(default)]
    properties: Value,
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

        loop {
            tokio::select! {
                _ = shutdown_rx.recv() => {
                    info!("[desktop:notify] Shutdown received, stopping SSE listener");
                    break;
                }
                _ = async {
                    if let Err(err) = run_once(&app, &runtime, &client, &notified_messages).await {
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
    let mut url = format!("http://127.0.0.1:{port}{}/event", prefix);

    if let Some(dir) = opencode
        .get_working_directory()
        .to_str()
        .map(|s| s.to_string())
    {
        let mut parsed = reqwest::Url::parse(&url)?;
        parsed.query_pairs_mut().append_pair("directory", &dir);
        url = parsed.to_string();
    }

    debug!("[desktop:notify] Connecting SSE for notifications: {url}");

    let response = client
        .get(&url)
        .header("accept", "text/event-stream")
        .header("accept-encoding", "identity")
        .send()
        .await?;

    debug!(
        "[desktop:notify] SSE response status={} headers={:?}",
        response.status(),
        response.headers()
    );

    if !response.status().is_success() {
        warn!(
            "[desktop:notify] SSE connect failed with status {}",
            response.status()
        );
        tokio::time::sleep(Duration::from_secs(2)).await;
        return Ok(());
    }

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

            match serde_json::from_str::<EventEnvelope>(&raw) {
                Ok(event) => handle_event(app, event, notified_messages).await,
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

async fn handle_event(
    app: &AppHandle,
    event: EventEnvelope,
    notified_messages: &Mutex<HashSet<String>>,
) {
    if event.event_type.as_str() != "message.updated" {
        return;
    }

    let Some(info) = event.properties.get("info") else {
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
