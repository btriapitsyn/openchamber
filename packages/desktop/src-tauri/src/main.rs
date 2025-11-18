#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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
use futures_util::StreamExt;
use opencode_manager::OpenCodeManager;
use portpicker::pick_unused_port;
use reqwest::{header, Client, Body as ReqwestBody};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{Manager, WebviewWindow};
use tauri_plugin_dialog::init as dialog_plugin;
use tauri_plugin_fs::init as fs_plugin;
use tauri_plugin_notification::init as notification_plugin;
use tauri_plugin_shell::init as shell_plugin;
use tokio::{
    fs,
    net::TcpListener,
    sync::{broadcast, Mutex},
};
use tower_http::cors::CorsLayer;

const PROXY_BODY_LIMIT: usize = 32 * 1024 * 1024; // 32MB

#[derive(Clone)]
struct DesktopRuntime {
    server_port: u16,
    shutdown_tx: broadcast::Sender<()>,
    opencode: Arc<OpenCodeManager>,
}

impl DesktopRuntime {
    async fn initialize() -> Result<Self> {
        let opencode = Arc::new(OpenCodeManager::new()?);
        opencode.ensure_running().await?;

        let settings = Arc::new(SettingsStore::new()?);
        let client = Client::builder().build()?;

        let (shutdown_tx, shutdown_rx) = broadcast::channel(2);
        let server_port = pick_unused_port().ok_or_else(|| anyhow!("No free port available"))? as u16;
        let server_state = ServerState {
            client,
            opencode: opencode.clone(),
            settings,
            server_port,
        };

        spawn_http_server(server_port, server_state, shutdown_rx);

        Ok(Self {
            server_port,
            shutdown_tx,
            opencode,
        })
    }

    async fn shutdown(&self) {
        let _ = self.shutdown_tx.send(());
        let _ = self.opencode.shutdown().await;
    }
}

#[derive(Clone)]
struct ServerState {
    client: Client,
    opencode: Arc<OpenCodeManager>,
    settings: Arc<SettingsStore>,
    server_port: u16,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    server_port: u16,
    opencode_port: Option<u16>,
    api_prefix: String,
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
        .setup(|app| {
            let runtime = tauri::async_runtime::block_on(DesktopRuntime::initialize())?;
            app.manage(runtime);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_server_info,
            desktop_restart_opencode,
            desktop_open_devtools
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
        .route("/api/config/settings", get(load_settings).put(save_settings))
        .route("/api/config/reload", post(reload_opencode))
        .route("/api", any(proxy_to_opencode))
        .route("/api/*rest", any(proxy_to_opencode))
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
    })
}

async fn load_settings(State(state): State<ServerState>) -> Result<Json<Value>, StatusCode> {
    state
        .settings
        .load()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn save_settings(State(state): State<ServerState>, Json(payload): Json<Value>) -> Result<Json<Value>, StatusCode> {
    // Load current settings and merge changes
    let mut current = state
        .settings
        .load()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Merge payload into current settings
    if let (Some(current_obj), Some(payload_obj)) = (current.as_object_mut(), payload.as_object()) {
        for (key, value) in payload_obj {
            current_obj.insert(key.clone(), value.clone());
        }
    }

    // Save merged settings
    state
        .settings
        .save(current.clone())
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(current))
}

async fn reload_opencode(State(state): State<ServerState>) -> Result<Json<Value>, StatusCode> {
    state
        .opencode
        .restart()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "success": true, "restarted": true })))
}

async fn proxy_to_opencode(
    State(state): State<ServerState>,
    original: OriginalUri,
    req: Request<Body>,
) -> Result<Response<Body>, StatusCode> {
    let port = state.opencode.current_port().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let origin_path = original.0.path();
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
        chunk.map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err)).map(axum::body::Bytes::from)
    });
    let body = Body::from_stream(stream);
    resp_builder.body(body).map_err(|_| StatusCode::BAD_GATEWAY)
}


#[derive(Clone)]
struct SettingsStore {
    path: PathBuf,
    guard: Arc<Mutex<()>>,
}

impl SettingsStore {
    fn new() -> Result<Self> {
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

    async fn load(&self) -> Result<Value> {
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

    async fn save(&self, payload: Value) -> Result<()> {
        let _lock = self.guard.lock().await;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).await.ok();
        }
        let bytes = serde_json::to_vec_pretty(&payload)?;
        fs::write(&self.path, bytes).await?;
        Ok(())
    }
}
