#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod opencode_manager;

use std::{
    path::PathBuf,
    sync::Arc,
};

use anyhow::{anyhow, Result};
use axum::{
    body::{to_bytes, Body},
    extract::{OriginalUri, State},
    http::{Request, Response, StatusCode},
    routing::{any, get, post},
    Json, Router,
};
use commands::files::{list_directory, search_files};
use commands::settings::{load_settings, save_settings, restart_opencode};
use commands::permissions::{request_directory_access, start_accessing_directory, stop_accessing_directory, pick_directory, restore_bookmarks_on_startup, process_directory_selection};
use commands::git::{
    check_is_git_repository, get_git_status, get_git_diff, revert_git_file, is_linked_worktree,
    get_git_branches, delete_git_branch, delete_remote_branch, list_git_worktrees, add_git_worktree,
    remove_git_worktree, ensure_openchamber_ignored, create_git_commit, git_push, git_pull, git_fetch,
    checkout_branch, create_branch, get_git_log, get_git_identities, create_git_identity,
    update_git_identity, delete_git_identity, get_current_git_identity, set_git_identity,
    generate_commit_message
};
use commands::terminal::{
    create_terminal_session, send_terminal_input, resize_terminal, close_terminal, TerminalState
};
use commands::notifications::notify_agent_completion;
use futures_util::{StreamExt as FuturesStreamExt};
use opencode_manager::OpenCodeManager;
use portpicker::pick_unused_port;
use reqwest::{header, Client, Body as ReqwestBody};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{Manager, WebviewWindow};
use tauri_plugin_dialog::init as dialog_plugin;
use tauri_plugin_fs::init as fs_plugin;
use tauri_plugin_notification::init as notification_plugin;
use tauri_plugin_shell::init as shell_plugin;
use tauri_plugin_log::{Target, TargetKind};
use tokio::{
    fs,
    net::TcpListener,
    sync::{broadcast, Mutex},
};
use tower_http::cors::CorsLayer;

const PROXY_BODY_LIMIT: usize = 32 * 1024 * 1024; // 32MB

#[derive(Clone)]
pub(crate) struct DesktopRuntime {
    server_port: u16,
    shutdown_tx: broadcast::Sender<()>,
    opencode: Arc<OpenCodeManager>,
    settings: Arc<SettingsStore>,
}

impl DesktopRuntime {
    async fn initialize() -> Result<Self> {
        let settings = Arc::new(SettingsStore::new()?);
        
        // Read lastDirectory from settings before starting OpenCode
        let initial_dir = settings.last_directory().await.ok().flatten();
        
        let opencode = Arc::new(OpenCodeManager::new_with_directory(initial_dir)?);
        opencode.ensure_running().await?;

        let client = Client::builder().build()?;

        let (shutdown_tx, shutdown_rx) = broadcast::channel(2);
        let server_port = pick_unused_port().ok_or_else(|| anyhow!("No free port available"))? as u16;
        let server_state = ServerState {
            client,
            opencode: opencode.clone(),
            server_port,
            directory_change_lock: Arc::new(Mutex::new(())),
        };

        spawn_http_server(server_port, server_state, shutdown_rx);

        Ok(Self {
            server_port,
            shutdown_tx,
            opencode,
            settings,
        })
    }

    async fn shutdown(&self) {
        let _ = self.shutdown_tx.send(());
        let _ = self.opencode.shutdown().await;
    }

    pub(crate) fn settings(&self) -> &SettingsStore {
        self.settings.as_ref()
    }
}

#[derive(Clone)]
struct ServerState {
    client: Client,
    opencode: Arc<OpenCodeManager>,
    server_port: u16,
    directory_change_lock: Arc<Mutex<()>>,
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
async fn desktop_server_info(state: tauri::State<'_, DesktopRuntime>) -> Result<ServerInfoPayload, String> {
    Ok(ServerInfoPayload {
        server_port: state.server_port,
        opencode_port: state.opencode.current_port(),
        api_prefix: state.opencode.api_prefix(),
    })
}

#[tauri::command]
async fn desktop_restart_opencode(state: tauri::State<'_, DesktopRuntime>) -> Result<(), String> {
    state.opencode.restart().await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn desktop_open_devtools(window: WebviewWindow) -> Result<(), String> {
    window.open_devtools();
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(shell_plugin())
        .plugin(dialog_plugin())
        .plugin(fs_plugin())
        .plugin(notification_plugin())
        .plugin(tauri_plugin_log::Builder::default().targets([
            Target::new(TargetKind::Stdout),
            Target::new(TargetKind::LogDir { file_name: None }),
            Target::new(TargetKind::Webview),
        ]).build())
        .setup(|app| {
            let runtime = tauri::async_runtime::block_on(DesktopRuntime::initialize())?;
            app.manage(runtime);
            app.manage(TerminalState::new());
            
            // Restore bookmarks on startup (macOS security-scoped access)
            // We'll do this synchronously within the setup to avoid lifetime issues
            tauri::async_runtime::block_on(async {
                if let Err(e) = restore_bookmarks_on_startup(app.state::<DesktopRuntime>().clone()).await {
                    eprintln!("Failed to restore bookmarks on startup: {}", e);
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
            notify_agent_completion
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let runtime = window.state::<DesktopRuntime>().inner().clone();
                tauri::async_runtime::spawn(async move {
                    runtime.shutdown().await;
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Tauri application");
}

fn spawn_http_server(port: u16, state: ServerState, shutdown_rx: broadcast::Receiver<()>) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = run_http_server(port, state, shutdown_rx).await {
            eprintln!("[desktop:http] server stopped: {error:?}");
        }
    });
}

async fn run_http_server(port: u16, state: ServerState, mut shutdown_rx: broadcast::Receiver<()>) -> Result<()> {
    let router = Router::new()
        .route("/health", get(health_handler))
        .route("/api/opencode/directory", post(change_directory_handler))
        .route("/api", any(proxy_to_opencode))
        .route("/api/{*rest}", any(proxy_to_opencode))
        .with_state(state)
        .layer(CorsLayer::permissive());

    let addr = format!("127.0.0.1:{port}");
    let listener = TcpListener::bind(&addr).await?;
    println!("[desktop:http] listening on http://{addr}");

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
    println!("[desktop:http] POST /api/opencode/directory request: {:?}", payload.path);
    
    // Acquire lock to prevent concurrent directory changes
    let _lock = state.directory_change_lock.lock().await;
    println!("[desktop:http] Acquired directory change lock");
    
    let requested_path = payload.path.trim();
    if requested_path.is_empty() {
        println!("[desktop:http] ERROR: Empty path provided");
        return Err(StatusCode::BAD_REQUEST);
    }

    let resolved_path = PathBuf::from(requested_path);
    
    // Validate directory exists and is accessible
    match fs::metadata(&resolved_path).await {
        Ok(metadata) => {
            if !metadata.is_dir() {
                println!("[desktop:http] ERROR: Path is not a directory: {:?}", resolved_path);
                return Err(StatusCode::BAD_REQUEST);
            }
        }
        Err(err) => {
            println!("[desktop:http] ERROR: Cannot access path: {:?} - {}", resolved_path, err);
            return Err(StatusCode::NOT_FOUND);
        }
    }

    let current_dir = state.opencode.get_working_directory();
    let is_running = state.opencode.current_port().is_some();
    
    println!("[desktop:http] Current directory: {:?}", current_dir);
    println!("[desktop:http] Requested directory: {:?}", resolved_path);
    println!("[desktop:http] OpenCode running: {}", is_running);
    println!("[desktop:http] Directories equal: {}", current_dir == resolved_path);
    
    // If already on this directory and OpenCode is running, no restart needed
    if current_dir == resolved_path && is_running {
        println!("[desktop:http] Directory unchanged, skipping restart");
        return Ok(Json(DirectoryChangeResponse {
            success: true,
            restarted: false,
            path: resolved_path.to_string_lossy().to_string(),
        }));
    }

    println!("[desktop:http] Changing directory from {:?} to {:?}", current_dir, resolved_path);

    // Update working directory and restart OpenCode
    state.opencode.set_working_directory(resolved_path.clone()).await.map_err(|e| {
        eprintln!("[desktop:http] ERROR: Failed to set working directory: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    
    println!("[desktop:http] Restarting OpenCode with new directory...");
    state.opencode.restart().await.map_err(|e| {
        eprintln!("[desktop:http] ERROR: Failed to restart OpenCode: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    println!("[desktop:http] OpenCode restarted successfully with directory: {:?}", resolved_path);

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
    let method = req.method().to_string();
    
    println!("[desktop:http] PROXY {} {}", method, origin_path);
    
    let port = state.opencode.current_port().ok_or_else(|| {
        println!("[desktop:http] PROXY FAILED: OpenCode not running (no port)");
        StatusCode::SERVICE_UNAVAILABLE
    })?;
    
    let query = original.0.query();
    let rewritten_path = state.opencode.rewrite_path(origin_path);
    let mut target = format!("http://127.0.0.1:{port}{rewritten_path}");
    if let Some(q) = query {
        target.push('?');
        target.push_str(q);
    }
    
    println!("[desktop:http] PROXY target: {}", target);

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
        chunk.map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err)).map(axum::body::Bytes::from)
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
                let value = serde_json::from_slice(&bytes).unwrap_or(Value::Object(Default::default()));
                Ok(value)
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(Value::Object(Default::default())),
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
