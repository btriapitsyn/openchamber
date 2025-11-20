#[cfg(target_os = "macos")]
use std::ffi::{c_char, c_void, CString};
#[cfg(not(target_os = "macos"))]
use std::ffi::c_void;
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
use tokio::time::sleep;

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

            while !stop_signal.load(Ordering::Relaxed) {
                let url = format!("{}/global/event", base_path.trim_end_matches('/'));
                let directory = {
                    let guard = directory_state_for_task.lock();
                    guard.clone()
                };
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
                            let _ = app_handle.emit(
                                "opencode:status",
                                serde_json::json!({"status":"error","hint":format!("SSE read failed: {err}")}),
                            );
                        }
                        delay_ms = 500; // reset after processing a successful stream
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
                            // LOGGING: Debug what we are emitting
                            let debug_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("unknown");
                            let _ = app_handle.emit(
                                "opencode:status", 
                                serde_json::json!({
                                    "status": "debug", 
                                    "msg": format!("Emitting event: {}", debug_type),
                                    "preview": value.to_string().chars().take(100).collect::<String>()
                                })
                            );
                            
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
