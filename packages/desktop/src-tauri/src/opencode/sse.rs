#[cfg(target_os = "macos")]
use std::ffi::{c_char, c_void, CString};
#[cfg(not(target_os = "macos"))]
use std::ffi::c_void;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};

use futures_util::StreamExt;
use log::info;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;
use tokio::time::sleep;

// Lightweight helpers for debugging stream content without cloning large payloads
fn extract_text_info(value: &Value) -> (usize, String) {
    let mut text = value
        .get("text")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_default();

    if text.is_empty() {
        text = value
            .get("content")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_default();
    }

    let len = text.len();
    let preview = if len > 120 {
        format!("{}...", &text[..120])
    } else {
        text.clone()
    };

    (len, preview)
}

fn summarize_text_parts(parts: &[Value]) -> (usize, usize, String) {
    let mut total_text_len = 0usize;
    let mut text_parts = 0usize;
    let mut preview = String::new();

    for part in parts {
        let part_type = part.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if part_type == "text" {
            let (len, snippet) = extract_text_info(part);
            total_text_len += len;
            text_parts += 1;
            if preview.is_empty() && !snippet.is_empty() {
                preview = snippet;
            }
        }
    }

    (text_parts, total_text_len, preview)
}

#[cfg(target_os = "macos")]
mod power_assertion {
    use super::{c_char, c_void, CString};

    type IOPMAssertionID = u32;

    const K_CFSTRING_ENCODING_UTF8: u32 = 0x0800_0100;
    const K_IOPM_ASSERTION_LEVEL_ON: u32 = 255;

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFStringCreateWithCString(
            alloc: *const c_void,
            c_str: *const c_char,
            encoding: u32,
        ) -> *const c_void;
        fn CFRelease(cf: *const c_void);
    }

    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOPMAssertionCreateWithName(
            assertion_type: *const c_void,
            level: u32,
            reason_for_activity: *const c_void,
            assertion_id: *mut IOPMAssertionID,
        ) -> i32;
        fn IOPMAssertionRelease(assertion_id: IOPMAssertionID) -> i32;
    }

    pub struct PowerAssertion {
        id: Option<IOPMAssertionID>,
    }

    impl PowerAssertion {
        pub fn acquire(reason: &str) -> Self {
            let assertion_type = CString::new("NoIdleSleepAssertion").unwrap();
            let reason_c = CString::new(reason).unwrap();
            unsafe {
                let type_ref = CFStringCreateWithCString(
                    std::ptr::null(),
                    assertion_type.as_ptr(),
                    K_CFSTRING_ENCODING_UTF8,
                );
                let reason_ref = CFStringCreateWithCString(
                    std::ptr::null(),
                    reason_c.as_ptr(),
                    K_CFSTRING_ENCODING_UTF8,
                );
                let mut id: IOPMAssertionID = 0;
                let result = IOPMAssertionCreateWithName(
                    type_ref,
                    K_IOPM_ASSERTION_LEVEL_ON,
                    reason_ref,
                    &mut id,
                );
                CFRelease(type_ref);
                CFRelease(reason_ref);
                if result == 0 {
                    Self { id: Some(id) }
                } else {
                    Self { id: None }
                }
            }
        }

        pub fn ensure(&mut self, reason: &str) {
            if self.id.is_none() {
                *self = Self::acquire(reason);
            }
        }
    }

    impl Drop for PowerAssertion {
        fn drop(&mut self) {
            if let Some(id) = self.id.take() {
                unsafe {
                    let _ = IOPMAssertionRelease(id);
                }
            }
        }
    }

    pub fn new(reason: &str) -> PowerAssertion {
        PowerAssertion::acquire(reason)
    }
}

#[derive(Clone)]
pub struct SseManager {
    stop_tx: Arc<AtomicBool>,
    _handle: Arc<tauri::async_runtime::JoinHandle<()>>,
    buffer: Arc<parking_lot::Mutex<Vec<Value>>>,
    subscriber_count: Arc<parking_lot::RwLock<usize>>,
    directory: Arc<parking_lot::Mutex<String>>,
}

impl SseManager {
    pub fn start(app_handle: AppHandle, base_path: String, directory: Option<String>) -> Self {
        let stop_tx = Arc::new(AtomicBool::new(false));
        let stop_signal = stop_tx.clone();
        let buffer = Arc::new(parking_lot::Mutex::new(Vec::with_capacity(256)));
        let subscriber_count = Arc::new(parking_lot::RwLock::new(0usize));
        let directory_state = Arc::new(parking_lot::Mutex::new(directory.unwrap_or_default()));

        // Keep clones to store on the manager
        let buffer_return = buffer.clone();
        let subscriber_return = subscriber_count.clone();
        let directory_return = directory_state.clone();

        // Clones captured by the async task
        let buffer_for_task = buffer.clone();
        let subscriber_count_for_task = subscriber_count.clone();
        let directory_state_for_task = directory_state.clone();

        let handle = tauri::async_runtime::spawn(async move {
            let client = reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(10))
                .no_gzip()
                .no_brotli()
                .no_deflate()
                .build()
                .expect("reqwest client");

            let mut delay_ms = 500;
        let mut last_event_id: Option<String> = None;
        let mut last_heartbeat = std::time::Instant::now();
            #[cfg(target_os = "macos")]
            let mut power_assertion = power_assertion::new("OpenCode SSE streaming");

            info!("[sse] Starting SSE loop");

            while !stop_signal.load(Ordering::Relaxed) {
                let url = format!("{}/global/event", base_path.trim_end_matches('/'));
                let directory = {
                    let guard = directory_state_for_task.lock();
                    guard.clone()
                };
                
                info!("[sse] Connecting to {} (dir: {})", url, directory);

                let max_buffer = 256usize;
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
                        info!("[sse] Connected successfully");
                        let _ = app_handle.emit(
                            "opencode:status",
                            serde_json::json!({"status":"connected","directory":directory}),
                        );
                        #[cfg(target_os = "macos")]
                        {
                            power_assertion.ensure("OpenCode SSE streaming reconnect");
                        }
                        if let Err(err) = stream_events(
                            response,
                            &app_handle,
                            &stop_signal,
                            &mut last_event_id,
                            buffer_for_task.clone(),
                            max_buffer,
                            &mut last_heartbeat,
                            subscriber_count_for_task.clone(),
                        )
                        .await
                        {
                            info!("[sse] Stream error: {}", err);
                            let _ = app_handle.emit(
                                "opencode:status",
                                serde_json::json!({"status":"error","hint":format!("SSE read failed: {err}")}),
                            );
                        }
                        delay_ms = 500; // reset after processing a successful stream
                    }
                    Ok(response) => {
                        info!("[sse] HTTP error: {}", response.status());
                        let _ = app_handle.emit(
                            "opencode:status",
                            serde_json::json!({"status":"error","hint":format!("SSE HTTP {}", response.status())}),
                        );
                    }
                    Err(err) => {
                        info!("[sse] Request failed: {}", err);
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
            #[cfg(target_os = "macos")]
            drop(power_assertion);
        });

        Self {
            stop_tx,
            _handle: Arc::new(handle),
            buffer: buffer_return,
            subscriber_count: subscriber_return,
            directory: directory_return,
        }
    }

    pub fn stop(&self) {
        self.stop_tx.store(true, Ordering::Relaxed);
    }

    pub fn replay_buffer(&self) -> Vec<Value> {
        self.buffer.lock().clone()
    }

    pub fn increment_subscribers(&self) {
        let mut guard = self.subscriber_count.write();
        *guard = guard.saturating_add(1);
    }

    pub fn decrement_subscribers(&self) {
        let mut guard = self.subscriber_count.write();
        *guard = guard.saturating_sub(1);
    }

    #[allow(dead_code)]
    pub fn subscriber_count(&self) -> usize {
        *self.subscriber_count.read()
    }

    pub fn set_directory(&self, directory: Option<String>) {
        let mut guard = self.directory.lock();
        *guard = directory.unwrap_or_default();
    }
}

async fn stream_events(
    response: reqwest::Response,
    app_handle: &AppHandle,
    stop_signal: &Arc<AtomicBool>,
    last_event_id: &mut Option<String>,
    buffer: Arc<parking_lot::Mutex<Vec<Value>>>,
    max_buffer: usize,
    last_heartbeat: &mut std::time::Instant,
    subscriber_count: Arc<parking_lot::RwLock<usize>>,
) -> anyhow::Result<()> {
    let mut stream = response.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    let mut data_buf = String::new();
    let mut event_id_buf: Option<String> = None;
    let mut last_completed_id: Option<String> = None;
    // Cache for message metadata: ID -> (modelID, mode)
    let mut message_info_cache: HashMap<String, (String, String)> = HashMap::new();

    // Helper to extract model/mode from various info slots (info.* only)
    let extract_model_mode = |props: &Value| -> (Option<String>, Option<String>) {
        let try_info = |node: &Value| -> (Option<String>, Option<String>) {
            let info = node.get("info");
            let model = info
                .and_then(|i| i.get("modelID"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let mode = info
                .and_then(|i| i.get("mode"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            (model, mode)
        };

        // Direct properties.info
        let (model, mode) = try_info(props);
        if model.is_some() || mode.is_some() {
            return (model, mode);
        }

        // Nested message.info if present
        if let Some(message_node) = props.get("message") {
            let (model2, mode2) = try_info(message_node);
            if model2.is_some() || mode2.is_some() {
                return (model2, mode2);
            }
        }

        (None, None)
    };

    while let Some(chunk) = stream.next().await {
        if stop_signal.load(Ordering::Relaxed) {
            break;
        }

        let chunk = chunk?;
        buf.extend_from_slice(&chunk);

        while let Some(pos) = buf.iter().position(|b| *b == b'\n') {
            let mut line_bytes: Vec<u8> = buf.drain(..=pos).collect();
            while line_bytes.last().map(|b| *b == b'\n' || *b == b'\r').unwrap_or(false) {
                line_bytes.pop();
            }
            let line = String::from_utf8_lossy(&line_bytes);

            if stop_signal.load(Ordering::Relaxed) {
                break;
            }

            // Heartbeat to signal liveness every ~20s (without waiting for disconnect).
            if last_heartbeat.elapsed() > Duration::from_secs(20) {
                let current_subscribers = *subscriber_count.read();
                let _ = app_handle.emit(
                    "opencode:status",
                    serde_json::json!({"status":"connected","heartbeat":true,"subscribers":current_subscribers}),
                );
                *last_heartbeat = std::time::Instant::now();
            }

            if line.starts_with(':') {
                continue; // comment/heartbeat
            }

            if line.is_empty() {
                if !data_buf.is_empty() {
                    match serde_json::from_str::<Value>(&data_buf) {
                        Ok(mut parsed_value) => {
                            // UNWRAP: /global/event returns { directory: string, payload: Event }.
                            // The UI expects just the Event.
                            let value = if let Some(payload) = parsed_value.get_mut("payload") {
                                payload.take()
                            } else {
                                parsed_value
                            };
                            let event_type = value.get("type").and_then(|v| v.as_str());
                            let debug_enabled = std::env::var("OPENCHAMBER_SSE_DEBUG").is_ok();

                            // Metadata Caching: Always extract info from message.updated (info.* only)
                            if let Some("message.updated") = event_type {
                                if let Some(props) = value.get("properties") {
                                    let msg_id = props
                                        .get("id")
                                        .or_else(|| props.get("info").and_then(|i| i.get("id")))
                                        .and_then(|v| v.as_str());

                                    if let Some(id) = msg_id {
                                        let existing = message_info_cache
                                            .get(id)
                                            .cloned()
                                            .unwrap_or_else(|| ("unknown model".to_string(), "unknown mode".to_string()));
                                        let (model_opt, mode_opt) = extract_model_mode(props);

                                        if model_opt.is_some() || mode_opt.is_some() {
                                            let model_final = model_opt.unwrap_or(existing.0);
                                            let mode_final = mode_opt.unwrap_or(existing.1);
                                            message_info_cache.insert(id.to_string(), (model_final, mode_final));
                                        }
                                    }
                                }
                            }

                            let mut skip_current_event = false;
                            if let Some("message.updated") = event_type {
                                if let Some(props) = value.get("properties") {
                                    let role = props
                                        .get("role")
                                        .or_else(|| props.get("info").and_then(|i| i.get("role")))
                                        .and_then(|v| v.as_str());
                                    let parts_vec = props
                                        .get("parts")
                                        .and_then(|v| v.as_array())
                                        .cloned()
                                        .or_else(|| {
                                            props
                                                .get("info")
                                                .and_then(|i| i.get("parts"))
                                                .and_then(|v| v.as_array())
                                                .cloned()
                                        })
                                        .unwrap_or_default();

                                    if role == Some("assistant") && parts_vec.is_empty() {
                                        skip_current_event = true;
                                        if debug_enabled {
                                            let msg_id = props
                                                .get("id")
                                                .or_else(|| props.get("info").and_then(|i| i.get("id")))
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("unknown");
                                            let status = props
                                                .get("status")
                                                .or_else(|| props.get("info").and_then(|i| i.get("status")))
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("pending");
                                            info!(
                                                "[sse-filter] dropping empty assistant message.updated id={} status={}",
                                                msg_id, status
                                            );
                                        }
                                    }
                                }
                            }

                            if skip_current_event {
                                if let Some(ev_id) = event_id_buf.take() {
                                    *last_event_id = Some(ev_id);
                                }
                                data_buf.clear();
                                continue;
                            }

                            // Check for assistant completion signal (backend-driven notification)
                            if let Some("message.updated") = event_type {
                                if debug_enabled {
                                    if let Some(props) = value.get("properties") {
                                        let msg_id = props
                                            .get("id")
                                            .or_else(|| props.get("info").and_then(|i| i.get("id")))
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("unknown");
                                        let status = props
                                            .get("status")
                                            .or_else(|| props.get("info").and_then(|i| i.get("status")))
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("pending");
                                        let parts = props.get("parts").and_then(|v| v.as_array()).cloned().unwrap_or_default();
                                        let (text_parts, text_len, preview) = summarize_text_parts(&parts);
                                        info!(
                                            "[sse-debug] message.updated id={} status={} text_parts={} text_len={} preview=\"{}\"",
                                            msg_id, status, text_parts, text_len, preview
                                        );
                                    }
                                }

                                if let Some(props) = value.get("properties") {
                                    let msg_id = props
                                        .get("id")
                                        .or_else(|| props.get("info").and_then(|i| i.get("id")))
                                        .and_then(|v| v.as_str());

                                    let status = props
                                        .get("status")
                                        .or_else(|| props.get("info").and_then(|i| i.get("status")))
                                        .and_then(|v| v.as_str());

                                    let parts = props.get("parts").and_then(|v| v.as_array());

                                    if let Some(id) = msg_id {
                                        let is_status_completed = status == Some("completed");

                                        let is_step_finish = if let Some(parts_arr) = parts {
                                            parts_arr.iter().any(|p| {
                                                p.get("type").and_then(|s| s.as_str()) == Some("step-finish")
                                                    && p.get("reason").and_then(|s| s.as_str()) == Some("stop")
                                            })
                                        } else {
                                            false
                                        };

                                        if is_status_completed || is_step_finish {
                                            let already_notified = last_completed_id.as_deref() == Some(id);
                                            if !already_notified {
                                                last_completed_id = Some(id.to_string());
                                                info!(
                                                    "[sse] Completion detected for msg {} (status: {:?}, step_finish: {})",
                                                    id, status, is_step_finish
                                                );

                                                // Refresh cache from this event if info.* is present (partial merge)
                                                let existing = message_info_cache
                                                    .get(id)
                                                    .cloned()
                                                    .unwrap_or_else(|| ("unknown model".to_string(), "unknown mode".to_string()));
                                                let (model_opt, mode_opt) = extract_model_mode(props);
                                                if model_opt.is_some() || mode_opt.is_some() {
                                                    let model_final = model_opt.unwrap_or(existing.0);
                                                    let mode_final = mode_opt.unwrap_or(existing.1);
                                                    message_info_cache.insert(id.to_string(), (model_final, mode_final));
                                                }

                                                // Emit completion signal to UI
                                                let _ = app_handle.emit(
                                                    "opencode:message-complete",
                                                    serde_json::json!({"messageId": id}),
                                                );

                                                let (raw_model, raw_mode) = message_info_cache
                                                    .get(id)
                                                    .cloned()
                                                    .unwrap_or_else(|| ("unknown model".to_string(), "unknown mode".to_string()));

                                                // Format mode: capitalize first letter, rest lower
                                                let formatted_mode = if raw_mode.is_empty() {
                                                    "Unknown mode".to_string()
                                                } else {
                                                    let mut chars = raw_mode.chars();
                                                    match chars.next() {
                                                        Some(first) => format!("{}{}", first.to_ascii_uppercase(), chars.as_str().to_ascii_lowercase()),
                                                        None => "Unknown mode".to_string(),
                                                    }
                                                };

                                                // Format model: split on '-', capitalize each word; if dash is between numbers, replace with '.'
                                                let formatted_model = if raw_model.is_empty() {
                                                    "Unknown model".to_string()
                                                } else {
                                                    let mut parts: Vec<String> = Vec::new();
                                                    let mut buffer = String::new();
                                                    let chars: Vec<char> = raw_model.chars().collect();
                                                    for (idx, ch) in chars.iter().enumerate() {
                                                        if *ch == '-' {
                                                            let prev = if idx > 0 { chars.get(idx - 1) } else { None };
                                                            let next = chars.get(idx + 1);
                                                            let is_numeric_dash = prev.map(|c| c.is_ascii_digit()).unwrap_or(false)
                                                                && next.map(|c| c.is_ascii_digit()).unwrap_or(false);
                                                            if is_numeric_dash {
                                                                buffer.push('.');
                                                            } else {
                                                                if !buffer.is_empty() {
                                                                    parts.push(buffer.clone());
                                                                    buffer.clear();
                                                                }
                                                            }
                                                        } else {
                                                            buffer.push(*ch);
                                                        }
                                                    }
                                                    if !buffer.is_empty() {
                                                        parts.push(buffer);
                                                    }
                                                    let formatted_parts: Vec<String> = parts
                                                        .into_iter()
                                                        .filter(|p| !p.is_empty())
                                                        .map(|p| {
                                                            let mut chars = p.chars();
                                                            match chars.next() {
                                                                Some(first) => format!("{}{}", first.to_ascii_uppercase(), chars.as_str().to_ascii_lowercase()),
                                                                None => String::new(),
                                                            }
                                                        })
                                                        .collect();
                                                    if formatted_parts.is_empty() {
                                                        "Unknown model".to_string()
                                                    } else {
                                                        formatted_parts.join(" ")
                                                    }
                                                };

                                                let title = format!("{} agent is ready", formatted_mode);
                                                let body_text = format!("{} completed the task", formatted_model);

                                                let _ = app_handle
                                                    .notification()
                                                    .builder()
                                                    .title(&title)
                                                    .body(&body_text)
                                                    .sound("Glass")
                                                    .show();
                                            }
                                        }
                                    }
                                }
                            } else if let Some("message.part.updated") = event_type {
                                if debug_enabled {
                                    if let Some(props) = value.get("properties") {
                                        if let Some(part) = props.get("part") {
                                            let msg_id = part
                                                .get("messageID")
                                                .or_else(|| part.get("message_id"))
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("unknown");
                                            let part_type = part.get("type").and_then(|v| v.as_str()).unwrap_or("unknown");
                                            let (text_len, preview) = extract_text_info(part);
                                            info!(
                                                "[sse-debug] message.part.updated id={} type={} text_len={} preview=\"{}\"",
                                                msg_id, part_type, text_len, preview
                                            );
                                        }
                                    }
                                }

                                if let Some(props) = value.get("properties") {
                                    if let Some(part) = props.get("part") {
                                        let is_stop = part.get("type").and_then(|s| s.as_str()) == Some("step-finish")
                                            && part.get("reason").and_then(|s| s.as_str()) == Some("stop");

                                        if is_stop {
                                            let msg_id = part
                                                .get("messageID")
                                                .or_else(|| part.get("message_id"))
                                                .and_then(|v| v.as_str());

                                            if let Some(id) = msg_id {
                                                let already_notified = last_completed_id.as_deref() == Some(id);
                                                if !already_notified {
                                                    last_completed_id = Some(id.to_string());
                                                    info!("[sse] Completion detected for msg {} (part update)!", id);

                                                    // Emit completion signal to UI
                                                    let _ = app_handle.emit(
                                                        "opencode:message-complete",
                                                        serde_json::json!({"messageId": id}),
                                                    );

                                                    let (model_id, mode) = message_info_cache
                                                        .get(id)
                                                        .cloned()
                                                        .unwrap_or_else(|| ("unknown model".to_string(), "unknown mode".to_string()));

                                                    let body_text = format!("Model {} in {} mode finished working.", model_id, mode);

                                                    let _ = app_handle
                                                        .notification()
                                                        .builder()
                                                        .title("Assistant Ready")
                                                        .body(&body_text)
                                                        .sound("Glass")
                                                        .show();
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            if let Some(ev_id) = event_id_buf.take() {
                                *last_event_id = Some(ev_id);
                            }
                            {
                                let mut guard = buffer.lock();
                                if guard.len() >= max_buffer {
                                    guard.remove(0);
                                }
                                guard.push(value.clone());
                            }
                            let _ = app_handle.emit("opencode:event", value);
                        }
                        Err(err) => {
                            let _ = app_handle.emit(
                                "opencode:status",
                                serde_json::json!({
                                    "status": "error",
                                    "hint": format!("JSON parse failed: {err}"),
                                    "raw": data_buf
                                }),
                            );
                        }
                    }
                    data_buf.clear();
                }
                continue;
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
    }

    Ok(())
}
