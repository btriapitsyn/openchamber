#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod logging;
mod assistant_notifications;
mod session_activity;
mod opencode_config;
mod opencode_manager;
mod window_state;

use std::{collections::HashMap, path::PathBuf, sync::Arc, time::{Duration, Instant}};

use anyhow::{anyhow, Result};
use axum::{
    body::{to_bytes, Body},
    extract::{OriginalUri, State},
    http::{Method, Request, Response, StatusCode},
    response::IntoResponse,
    routing::{any, get, post},
    Json, Router,
};
use assistant_notifications::spawn_assistant_notifications;
use session_activity::spawn_session_activity_tracker;
use commands::files::{create_directory, list_directory, search_files};
use commands::git::{
    add_git_worktree, check_is_git_repository, checkout_branch, create_branch, create_git_commit,
    create_git_identity, delete_git_branch, delete_git_identity, delete_remote_branch,
    ensure_openchamber_ignored, generate_commit_message, get_commit_files, get_current_git_identity,
    get_git_branches, get_git_diff, get_git_file_diff, get_git_identities, get_git_log, get_git_status,
    git_fetch, git_pull, git_push, is_linked_worktree, list_git_worktrees, remove_git_worktree,
    revert_git_file, set_git_identity, update_git_identity,
};
use commands::logs::fetch_desktop_logs;
use commands::permissions::{
    pick_directory, process_directory_selection, request_directory_access,
    restore_bookmarks_on_startup, start_accessing_directory, stop_accessing_directory,
};
use commands::notifications::desktop_notify;
use commands::settings::{load_settings, restart_opencode, save_settings};
use commands::terminal::{
    close_terminal, create_terminal_session, resize_terminal, send_terminal_input, TerminalState,
};
use futures_util::StreamExt as FuturesStreamExt;
use log::{error, info, warn};
use opencode_manager::OpenCodeManager;
use portpicker::pick_unused_port;
use reqwest::{header, Body as ReqwestBody, Client};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{Emitter, Manager};
#[cfg(feature = "devtools")]
use tauri::WebviewWindow;
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

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

const PROXY_BODY_LIMIT: usize = 32 * 1024 * 1024; // 32MB
const CLIENT_RELOAD_DELAY_MS: u64 = 800;
const MODELS_DEV_API_URL: &str = "https://models.dev/api.json";
const MODELS_METADATA_CACHE_TTL: Duration = Duration::from_secs(5 * 60);
const MODELS_METADATA_REQUEST_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Clone)]
pub(crate) struct DesktopRuntime {
    server_port: u16,
    shutdown_tx: broadcast::Sender<()>,
    opencode: Arc<OpenCodeManager>,
    settings: Arc<SettingsStore>,
}

impl DesktopRuntime {
    fn initialize_sync() -> Result<Self> {
        let settings = Arc::new(SettingsStore::new()?);
        let initial_dir = tauri::async_runtime::block_on(settings.last_directory()).ok().flatten();
        let opencode = Arc::new(OpenCodeManager::new_with_directory(initial_dir.clone()));

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

        Ok(Self {
            server_port,
            shutdown_tx,
            opencode,
            settings,
        })
    }

    async fn start_opencode(&self) {
        if self.opencode.is_cli_available() {
            if let Err(e) = self.opencode.ensure_running().await {
                warn!("[desktop] Failed to start OpenCode: {}", e);
            }
        } else {
            info!("[desktop] OpenCode CLI not available - running in limited mode");
        }
    }

    async fn shutdown(&self) {
        let _ = self.shutdown_tx.send(());
        let _ = self.opencode.shutdown().await;
    }

    pub(crate) fn settings(&self) -> &SettingsStore {
        self.settings.as_ref()
    }

    pub(crate) fn subscribe_shutdown(&self) -> broadcast::Receiver<()> {
        self.shutdown_tx.subscribe()
    }

    pub(crate) fn opencode_manager(&self) -> Arc<OpenCodeManager> {
        self.opencode.clone()
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
struct ConfigActionResponse {
    success: bool,
    requires_reload: bool,
    message: String,
    reload_delay_ms: u64,
}

#[derive(Serialize)]
struct ConfigErrorResponse {
    error: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigMetadataResponse {
    name: String,
    sources: opencode_config::ConfigSources,
    is_built_in: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    status: &'static str,
    server_port: u16,
    opencode_port: Option<u16>,
    api_prefix: String,
    is_opencode_ready: bool,
    cli_available: bool,
}

#[derive(Serialize)]
struct ServerInfoPayload {
    server_port: u16,
    opencode_port: Option<u16>,
    api_prefix: String,
    cli_available: bool,
    has_last_directory: bool,
}

#[tauri::command]
async fn desktop_server_info(
    state: tauri::State<'_, DesktopRuntime>,
) -> Result<ServerInfoPayload, String> {
    let has_last_directory = state.settings().last_directory().await.ok().flatten().is_some();
    Ok(ServerInfoPayload {
        server_port: state.server_port,
        opencode_port: state.opencode.current_port(),
        api_prefix: state.opencode.api_prefix(),
        cli_available: state.opencode.is_cli_available(),
        has_last_directory,
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

#[cfg(feature = "devtools")]
#[tauri::command]
async fn desktop_open_devtools(window: WebviewWindow) -> Result<(), String> {
    window.open_devtools();
    Ok(())
}

#[cfg(target_os = "macos")]
fn get_macos_major_version() -> isize {
    use objc2_foundation::NSProcessInfo;
    let process_info = NSProcessInfo::processInfo();
    let version = process_info.operatingSystemVersion();
    version.majorVersion
}

#[cfg(target_os = "macos")]
fn adjust_traffic_lights_position<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>, x: f64, y: f64) {
    use objc2::runtime::AnyObject;
    use objc2::msg_send;
    use objc2_foundation::{NSRect, NSPoint};

    if let Ok(ns_window) = window.ns_window() {
        unsafe {
            let ns_window: *mut AnyObject = ns_window.cast();
            let close_button: *mut AnyObject = msg_send![ns_window, standardWindowButton: 0usize];

            if !close_button.is_null() {
                let superview: *mut AnyObject = msg_send![close_button, superview];
                if !superview.is_null() {
                    let frame: NSRect = msg_send![superview, frame];
                    let new_frame = NSRect::new(NSPoint::new(x, y), frame.size);
                    let _: () = msg_send![superview, setFrame: new_frame];
                }
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn prevent_app_nap() {
    use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};

    let options = NSActivityOptions(0x00FFFFFF | 0xFF00000000);
    let reason = NSString::from_str("Prevent App Nap");

    let process_info = NSProcessInfo::processInfo();
    let activity = process_info.beginActivityWithOptions_reason(options, &reason);

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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(log_builder.build())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            prevent_app_nap();

            app.manage(TerminalState::new());

            let stored_state = tauri::async_runtime::block_on(load_window_state()).unwrap_or(None);
            let manager = WindowStateManager::new(stored_state.clone().unwrap_or_default());
            app.manage(manager.clone());

            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    let macos_version = get_macos_major_version();
                    info!("[macos] Detected macOS version: {}", macos_version);

                    let corner_radius = if macos_version >= 26 { 24.0 } else { 10.0 };
                    if let Err(error) =
                        apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, Some(corner_radius))
                    {
                        warn!("[desktop:vibrancy] Failed to apply macOS vibrancy: {}", error);
                    } else {
                        info!("[desktop:vibrancy] Applied macOS Sidebar vibrancy with radius {}", corner_radius);
                    }

                    if macos_version < 26 {
                        adjust_traffic_lights_position(&window, 17.0, 16.0);
                    }
                }

                if let Some(saved) = &stored_state {
                    let _ = window_state::apply_window_state(&window, saved);
                }

                let _ = window.show();
                let _ = window.set_focus();
            }

            let runtime = DesktopRuntime::initialize_sync()?;
            app.manage(runtime.clone());

            let app_handle = app.app_handle().clone();
            let runtime_clone = runtime.clone();
            let has_initial_dir = tauri::async_runtime::block_on(runtime.settings().last_directory()).ok().flatten().is_some();
            tauri::async_runtime::spawn(async move {
                // Only start opencode if we have a saved directory, otherwise frontend will prompt
                if has_initial_dir {
                    runtime_clone.start_opencode().await;
                } else {
                    info!("[desktop] No saved directory - waiting for user to select one");
                }

                if let Err(e) = restore_bookmarks_on_startup(app_handle.state::<DesktopRuntime>().clone()).await {
                    warn!("Failed to restore bookmarks on startup: {}", e);
                }

                let _ = app_handle.emit("openchamber:runtime-ready", ());
            });

            spawn_assistant_notifications(app.app_handle().clone(), runtime.clone());
            spawn_session_activity_tracker(app.app_handle().clone(), runtime.clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_server_info,
            desktop_restart_opencode,
            #[cfg(feature = "devtools")]
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
            get_git_file_diff,
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
            get_commit_files,
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
            fetch_desktop_logs,
            desktop_notify,
        ])
        .on_window_event(|window, event| {
            let window_state_manager = window.state::<WindowStateManager>().inner().clone();

            match event {
                tauri::WindowEvent::Focused(true) => {
                    // Clear dock badge and underlying badge state when the window gains focus
                    let _ = window.set_badge_count(None);
                    let _ = window.app_handle().emit("openchamber:clear-badge-sessions", ());
                }
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

    app.run(|_app_handle, _event| {});
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
        cli_available: opencode_manager::check_cli_exists(),
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

fn json_response<T: Serialize>(status: StatusCode, payload: T) -> Response<Body> {
    (status, Json(payload)).into_response()
}

fn config_error_response(status: StatusCode, message: impl Into<String>) -> Response<Body> {
    json_response(status, ConfigErrorResponse {
        error: message.into(),
    })
}

async fn parse_request_payload(req: Request<Body>) -> Result<HashMap<String, Value>, Response<Body>> {
    let (_, body) = req.into_parts();
    let body_bytes = to_bytes(body, PROXY_BODY_LIMIT)
        .await
        .map_err(|_| config_error_response(StatusCode::BAD_REQUEST, "Invalid request body"))?;

    if body_bytes.is_empty() {
        return Ok(HashMap::new());
    }

    serde_json::from_slice::<HashMap<String, Value>>(&body_bytes)
        .map_err(|_| config_error_response(StatusCode::BAD_REQUEST, "Malformed JSON payload"))
}

async fn refresh_opencode_after_config_change(
    state: &ServerState,
    reason: &str,
) -> Result<(), Response<Body>> {
    info!("[desktop:config] Restarting OpenCode after {}", reason);
    state
        .opencode
        .restart()
        .await
        .map_err(|err| config_error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to restart OpenCode: {}", err),
        ))?;
    Ok(())
}

async fn handle_agent_route(
    state: &ServerState,
    method: Method,
    req: Request<Body>,
    name: String,
) -> Result<Response<Body>, StatusCode> {
    match method {
        Method::GET => {
            match opencode_config::get_agent_sources(&name).await {
                Ok(sources) => Ok(json_response(
                    StatusCode::OK,
                    ConfigMetadataResponse {
                        name,
                        is_built_in: !sources.md.exists && !sources.json.exists,
                        sources,
                    },
                )),
                Err(err) => {
                    error!("[desktop:config] Failed to read agent sources: {}", err);
                    Ok(config_error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Failed to read agent configuration",
                    ))
                }
            }
        }
        Method::POST => {
            let payload = match parse_request_payload(req).await {
                Ok(data) => data,
                Err(resp) => return Ok(resp),
            };

            match opencode_config::create_agent(&name, &payload).await {
                Ok(()) => {
                    if let Err(resp) =
                        refresh_opencode_after_config_change(state, "agent creation").await
                    {
                        return Ok(resp);
                    }

                    Ok(json_response(
                        StatusCode::OK,
                        ConfigActionResponse {
                            success: true,
                            requires_reload: true,
                            message: format!(
                                "Agent {} created successfully. Reloading interface...",
                                name
                            ),
                            reload_delay_ms: CLIENT_RELOAD_DELAY_MS,
                        },
                    ))
                }
                Err(err) => {
                    error!("[desktop:config] Failed to create agent {}: {}", name, err);
                    Ok(config_error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        err.to_string(),
                    ))
                }
            }
        }
        Method::PATCH => {
            let payload = match parse_request_payload(req).await {
                Ok(data) => data,
                Err(resp) => return Ok(resp),
            };

            match opencode_config::update_agent(&name, &payload).await {
                Ok(()) => {
                    if let Err(resp) =
                        refresh_opencode_after_config_change(state, "agent update").await
                    {
                        return Ok(resp);
                    }

                    Ok(json_response(
                        StatusCode::OK,
                        ConfigActionResponse {
                            success: true,
                            requires_reload: true,
                            message: format!(
                                "Agent {} updated successfully. Reloading interface...",
                                name
                            ),
                            reload_delay_ms: CLIENT_RELOAD_DELAY_MS,
                        },
                    ))
                }
                Err(err) => {
                    error!("[desktop:config] Failed to update agent {}: {}", name, err);
                    Ok(config_error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        err.to_string(),
                    ))
                }
            }
        }
        Method::DELETE => match opencode_config::delete_agent(&name).await {
            Ok(()) => {
                if let Err(resp) =
                    refresh_opencode_after_config_change(state, "agent deletion").await
                {
                    return Ok(resp);
                }

                Ok(json_response(
                    StatusCode::OK,
                    ConfigActionResponse {
                        success: true,
                        requires_reload: true,
                        message: format!(
                            "Agent {} deleted successfully. Reloading interface...",
                            name
                        ),
                        reload_delay_ms: CLIENT_RELOAD_DELAY_MS,
                    },
                ))
            }
            Err(err) => {
                error!("[desktop:config] Failed to delete agent {}: {}", name, err);
                Ok(config_error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    err.to_string(),
                ))
            }
        },
        _ => Ok(StatusCode::METHOD_NOT_ALLOWED.into_response()),
    }
}

async fn handle_command_route(
    state: &ServerState,
    method: Method,
    req: Request<Body>,
    name: String,
) -> Result<Response<Body>, StatusCode> {
    match method {
        Method::GET => {
            match opencode_config::get_command_sources(&name).await {
                Ok(sources) => Ok(json_response(
                    StatusCode::OK,
                    ConfigMetadataResponse {
                        name,
                        is_built_in: !sources.md.exists && !sources.json.exists,
                        sources,
                    },
                )),
                Err(err) => {
                    error!("[desktop:config] Failed to read command sources: {}", err);
                    Ok(config_error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Failed to read command configuration",
                    ))
                }
            }
        }
        Method::POST => {
            let payload = match parse_request_payload(req).await {
                Ok(data) => data,
                Err(resp) => return Ok(resp),
            };

            match opencode_config::create_command(&name, &payload).await {
                Ok(()) => {
                    if let Err(resp) =
                        refresh_opencode_after_config_change(state, "command creation").await
                    {
                        return Ok(resp);
                    }

                    Ok(json_response(
                        StatusCode::OK,
                        ConfigActionResponse {
                            success: true,
                            requires_reload: true,
                            message: format!(
                                "Command {} created successfully. Reloading interface...",
                                name
                            ),
                            reload_delay_ms: CLIENT_RELOAD_DELAY_MS,
                        },
                    ))
                }
                Err(err) => {
                    error!("[desktop:config] Failed to create command {}: {}", name, err);
                    Ok(config_error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        err.to_string(),
                    ))
                }
            }
        }
        Method::PATCH => {
            let payload = match parse_request_payload(req).await {
                Ok(data) => data,
                Err(resp) => return Ok(resp),
            };

            match opencode_config::update_command(&name, &payload).await {
                Ok(()) => {
                    if let Err(resp) =
                        refresh_opencode_after_config_change(state, "command update").await
                    {
                        return Ok(resp);
                    }

                    Ok(json_response(
                        StatusCode::OK,
                        ConfigActionResponse {
                            success: true,
                            requires_reload: true,
                            message: format!(
                                "Command {} updated successfully. Reloading interface...",
                                name
                            ),
                            reload_delay_ms: CLIENT_RELOAD_DELAY_MS,
                        },
                    ))
                }
                Err(err) => {
                    error!("[desktop:config] Failed to update command {}: {}", name, err);
                    Ok(config_error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        err.to_string(),
                    ))
                }
            }
        }
        Method::DELETE => match opencode_config::delete_command(&name).await {
            Ok(()) => {
                if let Err(resp) =
                    refresh_opencode_after_config_change(state, "command deletion").await
                {
                    return Ok(resp);
                }

                Ok(json_response(
                    StatusCode::OK,
                    ConfigActionResponse {
                        success: true,
                        requires_reload: true,
                        message: format!(
                            "Command {} deleted successfully. Reloading interface...",
                            name
                        ),
                        reload_delay_ms: CLIENT_RELOAD_DELAY_MS,
                    },
                ))
            }
            Err(err) => {
                error!("[desktop:config] Failed to delete command {}: {}", name, err);
                let status = if err.to_string().contains("not found") {
                    StatusCode::NOT_FOUND
                } else {
                    StatusCode::INTERNAL_SERVER_ERROR
                };
                Ok(config_error_response(status, err.to_string()))
            }
        },
        _ => Ok(StatusCode::METHOD_NOT_ALLOWED.into_response()),
    }
}

async fn handle_config_routes(
    state: ServerState,
    path: &str,
    method: Method,
    req: Request<Body>,
) -> Result<Response<Body>, StatusCode> {
    if let Some(name) = path.strip_prefix("/api/config/agents/") {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Ok(config_error_response(
                StatusCode::BAD_REQUEST,
                "Agent name is required",
            ));
        }
        return handle_agent_route(&state, method, req, trimmed.to_string()).await;
    }

    if let Some(name) = path.strip_prefix("/api/config/commands/") {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Ok(config_error_response(
                StatusCode::BAD_REQUEST,
                "Command name is required",
            ));
        }
        return handle_command_route(&state, method, req, trimmed.to_string()).await;
    }

    if path == "/api/config/reload" && method == Method::POST {
        if let Err(resp) =
            refresh_opencode_after_config_change(&state, "manual configuration reload").await
        {
            return Ok(resp);
        }

        return Ok(json_response(
            StatusCode::OK,
            ConfigActionResponse {
                success: true,
                requires_reload: true,
                message: "Configuration reloaded successfully. Refreshing interface..."
                    .to_string(),
                reload_delay_ms: CLIENT_RELOAD_DELAY_MS,
            },
        ));
    }

    Ok(StatusCode::NOT_FOUND.into_response())
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
    let origin_path = original.0.path().to_string();
    let method = req.method().clone();

    let is_desktop_config_route = origin_path.starts_with("/api/config/agents/")
        || origin_path.starts_with("/api/config/commands/")
        || origin_path == "/api/config/reload";

    if is_desktop_config_route {
        return handle_config_routes(state, &origin_path, method, req).await;
    }

    let port = state.opencode.current_port().ok_or_else(|| {
        error!("[desktop:http] PROXY FAILED: OpenCode not running (no port)");
        StatusCode::SERVICE_UNAVAILABLE
    })?;

    let query = original.0.query();
    let rewritten_path = state.opencode.rewrite_path(&origin_path);
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
