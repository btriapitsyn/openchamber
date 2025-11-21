#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod logging;
mod opencode_manager;
mod window_state;
mod opencode;

use std::{path::PathBuf, sync::Arc, time::{Duration, Instant}};

use anyhow::{anyhow, Result};
use axum::{
    body::{to_bytes, Body},
    extract::{OriginalUri, State},
    http::{Request, Response, StatusCode},
    routing::{any, get, post},
    Json, Router,
};
use commands::files::{create_directory, list_directory, search_files};
use commands::git::{
    add_git_worktree, check_is_git_repository, checkout_branch, create_branch, create_git_commit,
    create_git_identity, delete_git_branch, delete_git_identity, delete_remote_branch,
    ensure_openchamber_ignored, generate_commit_message, get_current_git_identity,
    get_git_branches, get_git_diff, get_git_identities, get_git_log, get_git_status, git_fetch,
    git_pull, git_push, is_linked_worktree, list_git_worktrees, remove_git_worktree,
    revert_git_file, set_git_identity, update_git_identity,
};
use commands::notifications::notify_agent_completion;
use commands::logs::fetch_desktop_logs;
use commands::permissions::{
    pick_directory, process_directory_selection, request_directory_access,
    restore_bookmarks_on_startup, start_accessing_directory, stop_accessing_directory,
};
use commands::opencode::{
    opencode_events_replay, opencode_events_set_directory, opencode_events_snapshot,
    opencode_events_subscribe, opencode_events_unsubscribe, opencode_session_abort,
    opencode_session_command, opencode_session_create, opencode_session_delete,
    opencode_session_get, opencode_session_list, opencode_session_messages,
    opencode_session_prompt, opencode_session_shell, opencode_session_update,
};
use commands::settings::{load_settings, restart_opencode, save_settings};
use commands::terminal::{
    close_terminal, create_terminal_session, resize_terminal, send_terminal_input, TerminalState,
};
use futures_util::StreamExt as FuturesStreamExt;
use log::{error, info, warn};
use crate::opencode::start_sse_runner;
use opencode_manager::OpenCodeManager;
use portpicker::pick_unused_port;
use reqwest::{header, Body as ReqwestBody, Client};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{Listener, Manager, WebviewWindow};
use tauri_plugin_dialog::init as dialog_plugin;
use tauri_plugin_fs::init as fs_plugin;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_notification::init as notification_plugin;
use tauri_plugin_shell::init as shell_plugin;
use tokio::{
    fs,
    net::TcpListener,
    sync::{broadcast, Mutex},
};
use tower_http::cors::CorsLayer;
use window_state::{load_window_state, persist_window_state, WindowStateManager};

const PROXY_BODY_LIMIT: usize = 32 * 1024 * 1024; // 32MB
const MODELS_DEV_API_URL: &str = "https://models.dev/api.json";
const MODELS_METADATA_CACHE_TTL: Duration = Duration::from_secs(5 * 60);
const MODELS_METADATA_REQUEST_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Clone)]
pub(crate) struct DesktopRuntime {
    server_port: u16,
    shutdown_tx: broadcast::Sender<()>,
    opencode: Arc<OpenCodeManager>,
    settings: Arc<SettingsStore>,
    sse_manager: Arc<parking_lot::Mutex<Option<crate::opencode::sse::SseManager>>>,
    opencode_client: opencode::OpenCodeClient,
}

impl DesktopRuntime {
    async fn initialize() -> Result<Self> {
        let settings = Arc::new(SettingsStore::new()?);

        // Read lastDirectory from settings before starting OpenCode
        let initial_dir = settings.last_directory().await.ok().flatten();

        let opencode = Arc::new(OpenCodeManager::new_with_directory(initial_dir.clone())?);
        opencode.ensure_running().await?;

        let client = Client::builder().build()?;

        let (shutdown_tx, shutdown_rx) = broadcast::channel(2);
        let server_port =
            pick_unused_port().ok_or_else(|| anyhow!("No free port available"))? as u16;
        let server_state = ServerState {
            client,
            opencode: opencode.clone(),
            server_port,
            directory_change_lock: Arc::new(Mutex::new(())),
            models_metadata_cache: Arc::new(Mutex::new(ModelsMetadataCache::default())),
        };

        spawn_http_server(server_port, server_state, shutdown_rx);

        let base_path = format!("http://127.0.0.1:{}/api", server_port);
        let initial_dir_string = initial_dir.map(|p| p.to_string_lossy().to_string());
        let opencode_client =
            crate::opencode::OpenCodeClient::new(base_path, initial_dir_string, Duration::from_secs(30))?;

        Ok(Self {
            server_port,
            shutdown_tx,
            opencode,
            settings,
            sse_manager: Arc::new(parking_lot::Mutex::new(None)),
            opencode_client,
        })
    }

    async fn shutdown(&self) {
        if let Some(manager) = self.sse_manager.lock().take() {
            manager.stop();
        }
        let _ = self.shutdown_tx.send(());
        let _ = self.opencode.shutdown().await;
    }

    async fn start_sse(&self, app_handle: tauri::AppHandle) {
        let base_path = format!("http://127.0.0.1:{}/api", self.server_port);
        let directory = Some(self.opencode.get_working_directory().to_string_lossy().to_string());
        let manager = start_sse_runner(app_handle, base_path, directory);
        let mut guard = self.sse_manager.lock();
        *guard = Some(manager);
    }

    pub(crate) fn settings(&self) -> &SettingsStore {
        self.settings.as_ref()
    }

    fn opencode_client(&self) -> opencode::OpenCodeClient {
        self.opencode_client.clone()
    }
}

#[derive(Clone)]
struct ServerState {
    client: Client,
    opencode: Arc<OpenCodeManager>,
    server_port: u16,
    directory_change_lock: Arc<Mutex<()>>,
    models_metadata_cache: Arc<Mutex<ModelsMetadataCache>>,
}

#[derive(Default)]
struct ModelsMetadataCache {
    payload: Option<Value>,
    fetched_at: Option<Instant>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    status: &'static str,
    server_port: u16,
    opencode_port: Option<u16>,
    api_prefix: String,
    is_opencode_ready: bool,
}

#[derive(Serialize)]
struct ServerInfoPayload {
    server_port: u16,
    opencode_port: Option<u16>,
    api_prefix: String,
}

#[tauri::command]
async fn desktop_server_info(
    state: tauri::State<'_, DesktopRuntime>,
) -> Result<ServerInfoPayload, String> {
    Ok(ServerInfoPayload {
        server_port: state.server_port,
        opencode_port: state.opencode.current_port(),
        api_prefix: state.opencode.api_prefix(),
    })
}

#[tauri::command]
async fn desktop_restart_opencode(state: tauri::State<'_, DesktopRuntime>) -> Result<(), String> {
    state
        .opencode
        .restart()
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn desktop_open_devtools(window: WebviewWindow) -> Result<(), String> {
    window.open_devtools();
    Ok(())
}

#[cfg(target_os = "macos")]
fn prevent_app_nap() {
    use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};

    // NSActivityUserInitiated (0x00FFFFFF) | NSActivityLatencyCritical (0xFF00000000)
    let options = NSActivityOptions(0x00FFFFFF | 0xFF00000000);
    let reason = NSString::from_str("Prevent App Nap");

    let process_info = NSProcessInfo::processInfo();
    let activity = process_info.beginActivityWithOptions_reason(options, &reason);

    // Leak the activity token to keep it active indefinitely
    std::mem::forget(activity);

    info!("[macos] App Nap prevention enabled via objc2");
}

fn main() {
    let mut log_builder = tauri_plugin_log::Builder::default()
        .level(log::LevelFilter::Info)
        .clear_targets()
        .target(Target::new(TargetKind::Stdout))
        .target(Target::new(TargetKind::Webview));

    if let Some(dir) = logging::log_directory() {
        log_builder = log_builder.target(Target::new(TargetKind::Folder {
            path: dir,
            file_name: Some("desktop".into()),
        }));
    }

    let app = tauri::Builder::default()
        .plugin(shell_plugin())
        .plugin(dialog_plugin())
        .plugin(fs_plugin())
        .plugin(notification_plugin())
        .plugin(log_builder.build())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            prevent_app_nap();

            let runtime = tauri::async_runtime::block_on(DesktopRuntime::initialize())?;
            app.manage(runtime.clone());
            let app_handle = app.handle().clone();
            
            // Listen for notification clicks (emitted by tauri-plugin-notification)
            let app_handle_for_event = app_handle.clone();
            app.listen("notification_clicked", move |_event| {
                info!("Notification clicked! Restoring window...");
                if let Some(window) = app_handle_for_event.get_webview_window("main") {
                    tauri::async_runtime::spawn(async move {
                        if window.is_minimized().unwrap_or(false) {
                            let _ = window.unminimize();
                        }
                        let _ = window.show();
                        
                        // Small delay to allow macOS animation/state transition to complete
                        tokio::time::sleep(Duration::from_millis(100)).await;
                        
                        if let Err(e) = window.set_focus() {
                            warn!("Failed to focus window after notification click: {}", e);
                        } else {
                            info!("Window restored and focused successfully");
                        }
                    });
                }
            });

            tauri::async_runtime::spawn(async move {
                runtime.start_sse(app_handle).await;
            });
            app.manage(TerminalState::new());

            let stored_state = tauri::async_runtime::block_on(load_window_state()).unwrap_or(None);
            let manager = WindowStateManager::new(stored_state.clone().unwrap_or_default());
            app.manage(manager.clone());

            if let Some(saved) = stored_state {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window_state::apply_window_state(&window, &saved);
                }
            }

            // Restore bookmarks on startup (macOS security-scoped access)
            // We'll do this synchronously within the setup to avoid lifetime issues
            tauri::async_runtime::block_on(async {
                if let Err(e) =
                    restore_bookmarks_on_startup(app.state::<DesktopRuntime>().clone()).await
                {
                    warn!("Failed to restore bookmarks on startup: {}", e);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_server_info,
            desktop_restart_opencode,
            desktop_open_devtools,
            load_settings,
            save_settings,
            restart_opencode,
            list_directory,
            search_files,
            create_directory,
            request_directory_access,
            start_accessing_directory,
            stop_accessing_directory,
            pick_directory,
            restore_bookmarks_on_startup,
            process_directory_selection,
            check_is_git_repository,
            get_git_status,
            get_git_diff,
            revert_git_file,
            is_linked_worktree,
            get_git_branches,
            delete_git_branch,
            delete_remote_branch,
            list_git_worktrees,
            add_git_worktree,
            remove_git_worktree,
            ensure_openchamber_ignored,
            create_git_commit,
            git_push,
            git_pull,
            git_fetch,
            checkout_branch,
            create_branch,
            get_git_log,
            get_git_identities,
            create_git_identity,
            update_git_identity,
            delete_git_identity,
            get_current_git_identity,
            set_git_identity,
            generate_commit_message,
            create_terminal_session,
            send_terminal_input,
            resize_terminal,
            close_terminal,
            notify_agent_completion,
            fetch_desktop_logs,
            opencode_events_snapshot,
            opencode_events_subscribe,
            opencode_events_unsubscribe,
            opencode_events_replay,
            opencode_events_set_directory,
            opencode_session_list,
            opencode_session_get,
            opencode_session_messages,
            opencode_session_create,
            opencode_session_delete,
            opencode_session_update,
            opencode_session_prompt,
            opencode_session_command,
            opencode_session_shell,
            opencode_session_abort
        ])
        .on_window_event(|window, event| {
            let window_state_manager = window.state::<WindowStateManager>().inner().clone();

            match event {
                tauri::WindowEvent::Moved(position) => {
                    let is_maximized = window.is_maximized().unwrap_or(false);
                    window_state_manager.update_position(
                        position.x as f64,
                        position.y as f64,
                        is_maximized,
                    );
                }
                tauri::WindowEvent::Resized(size) => {
                    let is_maximized = window.is_maximized().unwrap_or(false);
                    window_state_manager.update_size(
                        size.width as f64,
                        size.height as f64,
                        is_maximized,
                    );
                }
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let runtime = window.state::<DesktopRuntime>().inner().clone();
                    let window_handle = window.clone();
                    let manager_clone = window_state_manager.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(err) = persist_window_state(&window_handle, &manager_clone).await
                        {
                            warn!("Failed to persist window state: {}", err);
                        }
                        runtime.shutdown().await;
                        let _ = window_handle.app_handle().exit(0);
                    });
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build Tauri application");

    app.run(|app_handle, event| {
            match event {
                tauri::RunEvent::MainEventsCleared => {}
                _ => {
                    info!("Received RunEvent: {:?}", event);
                    if let tauri::RunEvent::Reopen { .. } = event {
                        info!("Handling Reopen event - unminimizing window");
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            }
        });
}


fn spawn_http_server(port: u16, state: ServerState, shutdown_rx: broadcast::Receiver<()>) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = run_http_server(port, state, shutdown_rx).await {
            error!("[desktop:http] server stopped: {error:?}");
        }
    });
}

async fn run_http_server(
    port: u16,
    state: ServerState,
    mut shutdown_rx: broadcast::Receiver<()>,
) -> Result<()> {
    let router = Router::new()
        .route("/health", get(health_handler))
        .route("/api/openchamber/models-metadata", get(models_metadata_handler))
        .route("/api/opencode/directory", post(change_directory_handler))
        .route("/api", any(proxy_to_opencode))
        .route("/api/{*rest}", any(proxy_to_opencode))
        .with_state(state)
        .layer(CorsLayer::permissive());

    let addr = format!("127.0.0.1:{port}");
    let listener = TcpListener::bind(&addr).await?;
    info!("[desktop:http] listening on http://{addr}");

    axum::serve(listener, router)
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.recv().await;
        })
        .await?;

    Ok(())
}

async fn health_handler(State(state): State<ServerState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        server_port: state.server_port,
        opencode_port: state.opencode.current_port(),
        api_prefix: state.opencode.api_prefix(),
        is_opencode_ready: state.opencode.is_ready(),
    })
}

async fn models_metadata_handler(State(state): State<ServerState>) -> Result<Json<Value>, StatusCode> {
    let now = Instant::now();
    let cached_payload: Option<Value> = {
        let cache = state.models_metadata_cache.lock().await;
        if let (Some(payload), Some(fetched_at)) = (&cache.payload, cache.fetched_at) {
            if now.duration_since(fetched_at) < MODELS_METADATA_CACHE_TTL {
                return Ok(Json(payload.clone()));
            }
        }
        cache.payload.clone()
    };

    let response = state
        .client
        .get(MODELS_DEV_API_URL)
        .header(header::ACCEPT, "application/json")
        .timeout(MODELS_METADATA_REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|error| {
            warn!("[desktop:http] Failed to fetch models metadata: {error}");
            StatusCode::BAD_GATEWAY
        })?;

    if !response.status().is_success() {
        warn!(
            "[desktop:http] models.dev responded with status {}",
            response.status()
        );
        if let Some(payload) = cached_payload {
            return Ok(Json(payload));
        }
        return Err(StatusCode::BAD_GATEWAY);
    }

    let payload = response.json::<Value>().await.map_err(|error| {
        warn!("[desktop:http] Failed to parse models.dev payload: {error}");
        StatusCode::BAD_GATEWAY
    })?;

    {
        let mut cache = state.models_metadata_cache.lock().await;
        cache.payload = Some(payload.clone());
        cache.fetched_at = Some(Instant::now());
    }

    Ok(Json(payload))
}

#[derive(Deserialize)]
struct DirectoryChangeRequest {
    path: String,
}

#[derive(Serialize)]
struct DirectoryChangeResponse {
    success: bool,
    restarted: bool,
    path: String,
}

async fn change_directory_handler(
    State(state): State<ServerState>,
    Json(payload): Json<DirectoryChangeRequest>,
) -> Result<Json<DirectoryChangeResponse>, StatusCode> {
    // Acquire lock to prevent concurrent directory changes
    let _lock = state.directory_change_lock.lock().await;

    let requested_path = payload.path.trim();
    if requested_path.is_empty() {
        warn!("[desktop:http] ERROR: Empty path provided");
        return Err(StatusCode::BAD_REQUEST);
    }

    let resolved_path = PathBuf::from(requested_path);

    // Validate directory exists and is accessible
    match fs::metadata(&resolved_path).await {
        Ok(metadata) => {
            if !metadata.is_dir() {
                warn!(
                    "[desktop:http] ERROR: Path is not a directory: {:?}",
                    resolved_path
                );
                return Err(StatusCode::BAD_REQUEST);
            }
        }
        Err(err) => {
            warn!(
                "[desktop:http] ERROR: Cannot access path: {:?} - {}",
                resolved_path, err
            );
            return Err(StatusCode::NOT_FOUND);
        }
    }

    let current_dir = state.opencode.get_working_directory();
    let is_running = state.opencode.current_port().is_some();

    // If already on this directory and OpenCode is running, no restart needed
    if current_dir == resolved_path && is_running {
        return Ok(Json(DirectoryChangeResponse {
            success: true,
            restarted: false,
            path: resolved_path.to_string_lossy().to_string(),
        }));
    }

    info!("[desktop:http] Changing directory to {:?}", resolved_path);

    // Update working directory and restart OpenCode
    state
        .opencode
        .set_working_directory(resolved_path.clone())
        .await
        .map_err(|e| {
        error!(
            "[desktop:http] ERROR: Failed to set working directory: {}",
            e
        );
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    state.opencode.restart().await.map_err(|e| {
        error!("[desktop:http] ERROR: Failed to restart OpenCode: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(DirectoryChangeResponse {
        success: true,
        restarted: true,
        path: resolved_path.to_string_lossy().to_string(),
    }))
}

async fn proxy_to_opencode(
    State(state): State<ServerState>,
    original: OriginalUri,
    req: Request<Body>,
) -> Result<Response<Body>, StatusCode> {
    let origin_path = original.0.path();

    let port = state.opencode.current_port().ok_or_else(|| {
        error!("[desktop:http] PROXY FAILED: OpenCode not running (no port)");
        StatusCode::SERVICE_UNAVAILABLE
    })?;

    let query = original.0.query();
    let rewritten_path = state.opencode.rewrite_path(origin_path);
    let mut target = format!("http://127.0.0.1:{port}{rewritten_path}");
    if let Some(q) = query {
        target.push('?');
        target.push_str(q);
    }

    let (parts, body) = req.into_parts();
    let method = parts.method.clone();
    let mut builder = state.client.request(method, &target);

    let mut headers = parts.headers;
    headers.insert(header::HOST, format!("127.0.0.1:{port}").parse().unwrap());
    if headers
        .get(header::ACCEPT)
        .and_then(|v| v.to_str().ok())
        .map(|val| val.contains("text/event-stream"))
        .unwrap_or(false)
    {
        headers.insert(header::CONNECTION, "keep-alive".parse().unwrap());
    }

    for (key, value) in headers.iter() {
        if key == &header::CONTENT_LENGTH {
            continue;
        }
        builder = builder.header(key, value);
    }

    let body_bytes = to_bytes(body, PROXY_BODY_LIMIT)
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    let response = if body_bytes.is_empty() {
        builder.send().await.map_err(|_| StatusCode::BAD_GATEWAY)?
    } else {
        builder
            .body(ReqwestBody::from(body_bytes))
            .send()
            .await
            .map_err(|_| StatusCode::BAD_GATEWAY)?
    };

    let status = response.status();
    let mut resp_builder = Response::builder().status(status);
    for (key, value) in response.headers() {
        if key.as_str().eq_ignore_ascii_case("connection") {
            continue;
        }
        resp_builder = resp_builder.header(key, value);
    }

    let stream = response.bytes_stream().map(|chunk| {
        chunk
            .map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err))
            .map(axum::body::Bytes::from)
    });
    let body = Body::from_stream(stream);
    resp_builder.body(body).map_err(|_| StatusCode::BAD_GATEWAY)
}

#[derive(Clone)]
pub(crate) struct SettingsStore {
    path: PathBuf,
    guard: Arc<Mutex<()>>,
}

impl SettingsStore {
    pub(crate) fn new() -> Result<Self> {
        // Use ~/.config/openchamber for consistency with Electron/web versions
        let home = dirs::home_dir().ok_or_else(|| anyhow!("No home directory"))?;
        let mut dir = home;
        dir.push(".config");
        dir.push("openchamber");
        std::fs::create_dir_all(&dir).ok();
        dir.push("settings.json");
        Ok(Self {
            path: dir,
            guard: Arc::new(Mutex::new(())),
        })
    }

    pub(crate) async fn load(&self) -> Result<Value> {
        let _lock = self.guard.lock().await;
        match fs::read(&self.path).await {
            Ok(bytes) => {
                let value =
                    serde_json::from_slice(&bytes).unwrap_or(Value::Object(Default::default()));
                Ok(value)
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                Ok(Value::Object(Default::default()))
            }
            Err(err) => Err(err.into()),
        }
    }

    pub(crate) async fn save(&self, payload: Value) -> Result<()> {
        let _lock = self.guard.lock().await;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).await.ok();
        }
        let bytes = serde_json::to_vec_pretty(&payload)?;
        fs::write(&self.path, bytes).await?;
        Ok(())
    }

    pub(crate) async fn last_directory(&self) -> Result<Option<PathBuf>> {
        let settings = self.load().await?;
        let candidate = settings
            .get("lastDirectory")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(PathBuf::from);
        Ok(candidate)
    }
}
