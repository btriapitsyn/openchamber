use std::{collections::HashMap, sync::Arc, time::Duration};

use anyhow::Result;
use futures_util::TryStreamExt;
use log::{debug, info, warn};
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio_util::io::StreamReader;

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
    directory: Option<String>,
    payload: EventEnvelope,
}

#[derive(Clone, Debug, PartialEq)]
pub enum ActivityPhase {
    Idle,
    Busy,
    Cooldown,
}

#[derive(Clone, Debug)]
enum SseScope {
    Global,
    Directory(std::path::PathBuf),
}

pub fn spawn_session_activity_tracker(
    app: AppHandle,
    runtime: DesktopRuntime,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        let client = Client::builder()
            .timeout(Duration::from_secs(24 * 60 * 60))
            .tcp_keepalive(Some(Duration::from_secs(30)))
            .build()
            .expect("failed to build reqwest client");

        let mut shutdown_rx = runtime.subscribe_shutdown();
        let phases = Arc::new(Mutex::new(HashMap::<String, ActivityPhase>::new()));
        let cooldowns = Arc::new(Mutex::new(HashMap::<
            String,
            tauri::async_runtime::JoinHandle<()>,
        >::new()));

        loop {
            tokio::select! {
                _ = shutdown_rx.recv() => {
                    info!("[desktop:activity] Shutdown received, stopping SSE listener");
                    break;
                }
                _ = async {
                    // Reset stale phases to idle before connecting so UI doesn't stay stuck on "working" after wake.
                    reset_and_emit_all_phases(&app, phases.clone(), cooldowns.clone()).await;

                    if let Err(err) = run_once(&app, &runtime, &client, phases.clone(), cooldowns.clone()).await {
                        warn!("[desktop:activity] SSE loop error: {err:?}");
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
    phases: Arc<Mutex<HashMap<String, ActivityPhase>>>,
    cooldowns: Arc<Mutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>>>,
) -> Result<()> {
    let opencode = runtime.opencode_manager();

    let port = match opencode.current_port() {
        Some(port) => port,
        None => {
            warn!("[desktop:activity] OpenCode port unavailable; will retry");
            tokio::time::sleep(Duration::from_secs(2)).await;
            return Ok(());
        }
    };

    let prefix = opencode.api_prefix();
    let base = format!("http://127.0.0.1:{port}{prefix}");
    let (response, scope) = connect_activity_sse(runtime, client, &base).await?;

    use tokio::io::AsyncBufReadExt;

    let stream = response
        .bytes_stream()
        .map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err));
    let mut reader = StreamReader::new(stream);
    let mut buf = Vec::new();
    let mut data_lines: Vec<String> = Vec::new();

    loop {
        buf.clear();
        let bytes_read = match tokio::time::timeout(
            Duration::from_secs(2),
            reader.read_until(b'\n', &mut buf),
        )
        .await
        {
            Ok(Ok(n)) => n,
            Ok(Err(err)) => {
                warn!("[desktop:activity] Read error in SSE stream: {err:?}");
                return Err(err.into());
            }
            Err(_) => {
                // No data received recently; if we are connected to a directory-scoped stream and the working directory
                // has changed, reconnect so activity tracking follows the new directory.
                if let SseScope::Directory(connected_dir) = &scope {
                    let current_dir = opencode.get_working_directory();
                    if current_dir != *connected_dir {
                        debug!(
                            "[desktop:activity] Working directory changed; reconnecting activity SSE (from {:?} to {:?})",
                            connected_dir, current_dir
                        );
                        return Ok(());
                    }
                }
                continue;
            }
        };
        if bytes_read == 0 {
            break;
        }

        let line = match std::str::from_utf8(&buf) {
            Ok(s) => s.trim_end_matches(&['\r', '\n'][..]).to_string(),
            Err(err) => {
                warn!("[desktop:activity] Non-UTF8 SSE chunk: {err}");
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
                Ok((event, _directory)) => {
                    handle_event(app, event, phases.clone(), cooldowns.clone()).await
                }
                Err(err) => warn!("[desktop:activity] Failed to parse SSE data: {err}; raw={raw}"),
            };
            continue;
        }

        if let Some(rest) = line.strip_prefix("data:") {
            data_lines.push(rest.trim_start().to_string());
        }
    }

    Ok(())
}

fn parse_event_envelope(raw: &str) -> Result<(EventEnvelope, Option<String>)> {
    if let Ok(event) = serde_json::from_str::<EventEnvelope>(raw) {
        return Ok((event, None));
    }

    let multiplexed = serde_json::from_str::<MultiplexedEventEnvelope>(raw)?;
    Ok((multiplexed.payload, multiplexed.directory))
}

async fn connect_activity_sse(
    runtime: &DesktopRuntime,
    client: &Client,
    base: &str,
) -> Result<(reqwest::Response, SseScope)> {
    let opencode = runtime.opencode_manager();

    let global_url = format!("{base}/global/event");
    match try_connect_sse(client, &global_url, "[desktop:activity]").await {
        Ok(response) => {
            debug!("[desktop:activity] Using SSE endpoint: {global_url}");
            return Ok((response, SseScope::Global));
        }
        Err(err) => {
            debug!(
                "[desktop:activity] SSE endpoint unavailable: {global_url} ({err:?}); falling back"
            );
        }
    }

    let event_url = format!("{base}/event");
    match try_connect_sse(client, &event_url, "[desktop:activity]").await {
        Ok(response) => {
            debug!("[desktop:activity] Using SSE endpoint: {event_url}");
            return Ok((response, SseScope::Global));
        }
        Err(err) => {
            debug!(
                "[desktop:activity] SSE endpoint unavailable: {event_url} ({err:?}); falling back"
            );
        }
    }

    let working_dir = opencode.get_working_directory();
    let directory = working_dir.to_string_lossy().to_string();
    let mut parsed = reqwest::Url::parse(&event_url)?;
    parsed
        .query_pairs_mut()
        .append_pair("directory", &directory);
    let directory_url = parsed.to_string();

    let response = try_connect_sse(client, &directory_url, "[desktop:activity]").await?;
    debug!("[desktop:activity] Using directory-scoped SSE endpoint: {directory_url}");
    Ok((response, SseScope::Directory(working_dir)))
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
    phases: Arc<Mutex<HashMap<String, ActivityPhase>>>,
    cooldowns: Arc<Mutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>>>,
) {
    match event.event_type.as_str() {
        "session.status" => {
            let session_id = event
                .properties
                .get("sessionID")
                .and_then(Value::as_str)
                .map(|s| s.to_string());
            let status = event
                .properties
                .get("status")
                .and_then(|s| s.get("type"))
                .and_then(Value::as_str);

            if let (Some(id), Some(status_type)) = (session_id, status) {
                let phase = if status_type == "busy" || status_type == "retry" {
                    ActivityPhase::Busy
                } else {
                    ActivityPhase::Idle
                };
                set_phase(app, &id, phase, phases.clone(), cooldowns.clone()).await;
            }
        }
        "session.idle" => {
            let session_id = event
                .properties
                .get("sessionID")
                .and_then(Value::as_str)
                .map(|s| s.to_string());
            if let Some(id) = session_id {
                set_phase(
                    app,
                    &id,
                    ActivityPhase::Idle,
                    phases.clone(),
                    cooldowns.clone(),
                )
                .await;
            }
        }
        "message.updated" => {
            if let Some(info) = event.properties.get("info") {
                let role = info.get("role").and_then(Value::as_str).unwrap_or_default();
                if role != "assistant" {
                    return;
                }

                let finish = info.get("finish").and_then(Value::as_str);
                if finish != Some("stop") {
                    return;
                }

                let session_id = info
                    .get("sessionID")
                    .and_then(Value::as_str)
                    .map(|s| s.to_string());

                if let Some(id) = session_id {
                    enter_cooldown_if_busy(app, &id, phases.clone(), cooldowns.clone()).await;
                }
            }
        }
        "message.part.updated" => {
            let Some(info) = event.properties.get("info") else {
                return;
            };

            let role = info.get("role").and_then(Value::as_str).unwrap_or_default();
            if role != "assistant" {
                return;
            }

            let session_id = info
                .get("sessionID")
                .and_then(Value::as_str)
                .map(|s| s.to_string());

            let Some(id) = session_id else {
                return;
            };

            // Mark session busy when we see assistant parts streaming (covers cases where session.status is missing).
            if is_streaming_assistant_part(&event.properties) {
                set_phase(
                    app,
                    &id,
                    ActivityPhase::Busy,
                    phases.clone(),
                    cooldowns.clone(),
                )
                .await;
            }

            // Derive cooldown from info.finish === 'stop' when present.
            if has_finish_stop(info) {
                enter_cooldown_if_busy(app, &id, phases.clone(), cooldowns.clone()).await;
            }
        }
        _ => {}
    }
}

fn is_streaming_assistant_part(properties: &Value) -> bool {
    let Some(part) = properties.get("part") else {
        return false;
    };
    let part_type = part.get("type").and_then(Value::as_str).unwrap_or_default();
    matches!(
        part_type,
        "step-start" | "text" | "tool" | "reasoning" | "file" | "patch"
    )
}

fn has_finish_stop(info: &Value) -> bool {
    info.get("finish").and_then(Value::as_str) == Some("stop")
}

async fn enter_cooldown_if_busy(
    app: &AppHandle,
    session_id: &str,
    phases: Arc<Mutex<HashMap<String, ActivityPhase>>>,
    cooldowns: Arc<Mutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>>>,
) {
    let current = { phases.lock().await.get(session_id).cloned() };
    if !matches!(current, Some(ActivityPhase::Busy)) {
        return;
    }

    set_phase(
        app,
        session_id,
        ActivityPhase::Cooldown,
        phases.clone(),
        cooldowns.clone(),
    )
    .await;

    let app_clone = app.clone();
    let phases_clone = phases.clone();
    let cooldowns_clone = cooldowns.clone();
    let id_clone = session_id.to_string();
    let handle = tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(2)).await;
        let current = { phases_clone.lock().await.get(&id_clone).cloned() };
        if matches!(current, Some(ActivityPhase::Cooldown)) {
            set_phase(
                &app_clone,
                &id_clone,
                ActivityPhase::Idle,
                phases_clone,
                cooldowns_clone,
            )
            .await;
        }
    });

    let mut cd = cooldowns.lock().await;
    if let Some(prev) = cd.remove(session_id) {
        prev.abort();
    }
    cd.insert(session_id.to_string(), handle);
}

async fn set_phase(
    app: &AppHandle,
    session_id: &str,
    phase: ActivityPhase,
    phases: Arc<Mutex<HashMap<String, ActivityPhase>>>,
    cooldowns: Arc<Mutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>>>,
) {
    {
        let mut map = phases.lock().await;
        let current = map.get(session_id);
        if current == Some(&phase) {
            return;
        }
        map.insert(session_id.to_string(), phase.clone());

        // Cancel cooldown timer when leaving cooldown
        if !matches!(phase, ActivityPhase::Cooldown) {
            if let Some(handle) = cooldowns.lock().await.remove(session_id) {
                handle.abort();
            }
        }
    }

    // Emit to webview so UI stays in sync
    let payload = serde_json::json!({
        "sessionId": session_id,
        "phase": match phase {
            ActivityPhase::Idle => "idle",
            ActivityPhase::Busy => "busy",
            ActivityPhase::Cooldown => "cooldown",
        }
    });

    let _ = app.emit("openchamber:session-activity", payload);
}

async fn reset_and_emit_all_phases(
    app: &AppHandle,
    phases: Arc<Mutex<HashMap<String, ActivityPhase>>>,
    cooldowns: Arc<Mutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>>>,
) {
    // Cancel any cooldown timers and set all phases to idle to avoid stale "busy" after wake.
    {
        let mut cd = cooldowns.lock().await;
        for handle in cd.values() {
            handle.abort();
        }
        cd.clear();
    }

    let snapshot = {
        let mut guard = phases.lock().await;
        for value in guard.values_mut() {
            *value = ActivityPhase::Idle;
        }
        guard.clone()
    };

    if snapshot.is_empty() {
        return;
    }

    for (session_id, phase) in snapshot {
        let payload = serde_json::json!({
            "sessionId": session_id,
            "phase": match phase {
                ActivityPhase::Idle => "idle",
                ActivityPhase::Busy => "busy",
                ActivityPhase::Cooldown => "cooldown",
            }
        });
        let _ = app.emit("openchamber:session-activity", payload);
    }
}
