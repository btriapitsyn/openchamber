use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};

use futures_util::StreamExt;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::{io::AsyncBufReadExt, time::sleep};
use tokio_util::io::StreamReader;

#[derive(Clone)]
pub struct SseManager {
    stop_tx: Arc<AtomicBool>,
    _handle: Arc<tauri::async_runtime::JoinHandle<()>>,
}

impl SseManager {
    pub fn start(app_handle: AppHandle, base_path: String, directory: Option<String>) -> Self {
        let stop_tx = Arc::new(AtomicBool::new(false));
        let stop_signal = stop_tx.clone();

        let handle = tauri::async_runtime::spawn(async move {
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(60))
                .build()
                .expect("reqwest client");

            let mut delay_ms = 500;
            let directory = directory.unwrap_or_default();
            let mut last_event_id: Option<String> = None;
            let mut buffer: Vec<Value> = Vec::with_capacity(256);
            let max_buffer = 256usize;
            let mut last_heartbeat = std::time::Instant::now();

            while !stop_signal.load(Ordering::Relaxed) {
                let url = format!("{}/global/event", base_path.trim_end_matches('/'));
                let request = client
                    .get(&url)
                    .query(&[("directory", directory.clone())])
                    .header("accept", "text/event-stream");
                let request = if let Some(ref id) = last_event_id {
                    request.header("Last-Event-ID", id)
                } else {
                    request
                };

                match request.send().await {
                    Ok(response) if response.status().is_success() => {
                        let _ = app_handle.emit("opencode:status", serde_json::json!({"status":"connected"}));
                        if let Err(err) = stream_events(
                            response,
                            &app_handle,
                            &stop_signal,
                            &mut last_event_id,
                            &mut buffer,
                            max_buffer,
                            &mut last_heartbeat,
                        )
                        .await
                        {
                            let _ = app_handle.emit(
                                "opencode:status",
                            serde_json::json!({"status":"error","hint":format!("SSE read failed: {err}")}),
                        );
                    }
                    delay_ms = 500; // reset after a successful connect attempt
                }
                Ok(response) => {
                    let _ = app_handle.emit(
                        "opencode:status",
                        serde_json::json!({"status":"error","hint":format!("SSE HTTP {}", response.status())}),
                    );
                }
                Err(err) => {
                    let _ = app_handle.emit(
                        "opencode:status",
                        serde_json::json!({"status":"error","hint":format!("SSE connect failed: {err}")}),
                    );
                }
            }

                if stop_signal.load(Ordering::Relaxed) {
                    break;
            }

            let _ = app_handle.emit(
                "opencode:status",
                serde_json::json!({"status":"reconnecting","delay_ms":delay_ms,"last_event_id":last_event_id}),
            );
            sleep(Duration::from_millis(delay_ms)).await;
            delay_ms = (delay_ms.saturating_mul(2)).min(8_000);
            }
        });

        Self {
            stop_tx,
            _handle: Arc::new(handle),
        }
    }

    pub fn stop(&self) {
        self.stop_tx.store(true, Ordering::Relaxed);
    }
}

async fn stream_events(
    response: reqwest::Response,
    app_handle: &AppHandle,
    stop_signal: &Arc<AtomicBool>,
    last_event_id: &mut Option<String>,
    buffer: &mut Vec<Value>,
    max_buffer: usize,
    last_heartbeat: &mut std::time::Instant,
) -> anyhow::Result<()> {
    let stream = response
        .bytes_stream()
        .map(|b| b.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e)));
    let mut reader = tokio::io::BufReader::new(StreamReader::new(stream)).lines();

    let mut data_buf = String::new();
    let mut event_id_buf: Option<String> = None;

    while let Some(line) = reader.next_line().await? {
        if stop_signal.load(Ordering::Relaxed) {
            break;
        }

        if line.starts_with(':') {
            continue; // comment/heartbeat
        }

        if line.is_empty() {
            if !data_buf.is_empty() {
                if let Ok(value) = serde_json::from_str::<Value>(&data_buf) {
                    if let Some(ev_id) = event_id_buf.take() {
                        *last_event_id = Some(ev_id);
                    }
                    if buffer.len() >= max_buffer {
                        buffer.remove(0);
                    }
                    buffer.push(value.clone());
                    let _ = app_handle.emit("opencode:event", value);
                }
                data_buf.clear();
            }
            continue;
        }

        // Heartbeat to signal liveness every ~20s (without waiting for disconnect).
        if last_heartbeat.elapsed() > Duration::from_secs(20) {
            let _ = app_handle.emit("opencode:status", serde_json::json!({"status":"connected","heartbeat":true}));
            *last_heartbeat = std::time::Instant::now();
        }

        if let Some(rest) = line.strip_prefix("data:") {
            if !data_buf.is_empty() {
                data_buf.push('\n');
            }
            data_buf.push_str(rest.trim_start());
        } else if let Some(rest) = line.strip_prefix("id:") {
            event_id_buf = Some(rest.trim().to_string());
        }
    }

    Ok(())
}
