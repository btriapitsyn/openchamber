#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod assistant_notifications;
mod commands;
mod logging;
mod opencode_auth;
mod opencode_config;
mod opencode_manager;
mod path_utils;
mod session_activity;
mod skills_catalog;
mod window_state;

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::{anyhow, Result};
use assistant_notifications::spawn_assistant_notifications;
use axum::{
    body::{to_bytes, Body},
    extract::{OriginalUri, State},
    http::{Method, Request, Response, StatusCode},
    response::IntoResponse,
    routing::{any, get, post},
    Json, Router,
};
use commands::files::{create_directory, list_directory, search_files};
use commands::git::{
    add_git_worktree, check_is_git_repository, checkout_branch, create_branch, create_git_commit,
    create_git_identity, delete_git_branch, delete_git_identity, delete_remote_branch,
    ensure_openchamber_ignored, generate_commit_message, get_commit_files,
    get_current_git_identity, get_git_branches, get_git_diff, get_git_file_diff,
    get_git_identities, get_git_log, get_git_status, git_fetch, git_pull, git_push,
    is_linked_worktree, list_git_worktrees, remove_git_worktree, revert_git_file, set_git_identity,
    update_git_identity,
};
use commands::logs::fetch_desktop_logs;
use commands::notifications::desktop_notify;
use commands::permissions::{
    pick_directory, process_directory_selection, request_directory_access,
    restore_bookmarks_on_startup, start_accessing_directory, stop_accessing_directory,
};
use commands::settings::{load_settings, restart_opencode, save_settings};
use commands::terminal::{
    close_terminal, create_terminal_session, force_kill_terminal, resize_terminal,
    restart_terminal_session, send_terminal_input, TerminalState,
};
use futures_util::StreamExt as FuturesStreamExt;
use log::{error, info, warn};
use opencode_manager::OpenCodeManager;
use path_utils::expand_tilde_path;
use portpicker::pick_unused_port;
use reqwest::{header, Body as ReqwestBody, Client};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use session_activity::spawn_session_activity_tracker;
#[cfg(feature = "devtools")]
use tauri::WebviewWindow;
use tauri::{Emitter, Manager};
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
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[cfg(target_os = "macos")]
static NEEDS_TRAFFIC_LIGHT_FIX: AtomicBool = AtomicBool::new(false);

const PROXY_BODY_LIMIT: usize = 32 * 1024 * 1024; // 32MB
const CLIENT_RELOAD_DELAY_MS: u64 = 800;
const MODELS_DEV_API_URL: &str = "https://models.dev/api.json";
const MODELS_METADATA_CACHE_TTL: Duration = Duration::from_secs(5 * 60);
const MODELS_METADATA_REQUEST_TIMEOUT: Duration = Duration::from_secs(8);

const CHECK_FOR_UPDATES_EVENT: &str = "openchamber:check-for-updates";

#[cfg(target_os = "macos")]
const MENU_ITEM_CHECK_FOR_UPDATES_ID: &str = "openchamber_check_for_updates";
#[cfg(target_os = "macos")]
const MENU_ITEM_REPORT_BUG_ID: &str = "openchamber_report_bug";
#[cfg(target_os = "macos")]
const MENU_ITEM_REQUEST_FEATURE_ID: &str = "openchamber_request_feature";
#[cfg(target_os = "macos")]
const MENU_ITEM_JOIN_DISCORD_ID: &str = "openchamber_join_discord";

// App menu
#[cfg(target_os = "macos")]
const MENU_ITEM_ABOUT_ID: &str = "openchamber_about";
#[cfg(target_os = "macos")]
const MENU_ITEM_SETTINGS_ID: &str = "openchamber_settings";
#[cfg(target_os = "macos")]
const MENU_ITEM_COMMAND_PALETTE_ID: &str = "openchamber_command_palette";

// File menu
#[cfg(target_os = "macos")]
const MENU_ITEM_NEW_SESSION_ID: &str = "openchamber_new_session";
#[cfg(target_os = "macos")]
const MENU_ITEM_WORKTREE_CREATOR_ID: &str = "openchamber_worktree_creator";
#[cfg(target_os = "macos")]
const MENU_ITEM_CHANGE_WORKSPACE_ID: &str = "openchamber_change_workspace";

// View menu
#[cfg(target_os = "macos")]
const MENU_ITEM_OPEN_GIT_TAB_ID: &str = "openchamber_open_git_tab";
#[cfg(target_os = "macos")]
const MENU_ITEM_OPEN_DIFF_TAB_ID: &str = "openchamber_open_diff_tab";
#[cfg(target_os = "macos")]
const MENU_ITEM_OPEN_TERMINAL_TAB_ID: &str = "openchamber_open_terminal_tab";
#[cfg(target_os = "macos")]
const MENU_ITEM_THEME_LIGHT_ID: &str = "openchamber_theme_light";
#[cfg(target_os = "macos")]
const MENU_ITEM_THEME_DARK_ID: &str = "openchamber_theme_dark";
#[cfg(target_os = "macos")]
const MENU_ITEM_THEME_SYSTEM_ID: &str = "openchamber_theme_system";
#[cfg(target_os = "macos")]
const MENU_ITEM_TOGGLE_SIDEBAR_ID: &str = "openchamber_toggle_sidebar";
#[cfg(target_os = "macos")]
const MENU_ITEM_TOGGLE_MEMORY_DEBUG_ID: &str = "openchamber_toggle_memory_debug";

// Help menu
#[cfg(target_os = "macos")]
const MENU_ITEM_HELP_DIALOG_ID: &str = "openchamber_help_dialog";
#[cfg(target_os = "macos")]
const MENU_ITEM_DOWNLOAD_LOGS_ID: &str = "openchamber_download_logs";

const GITHUB_BUG_REPORT_URL: &str =
    "https://github.com/btriapitsyn/openchamber/issues/new?template=bug_report.yml";
const GITHUB_FEATURE_REQUEST_URL: &str =
    "https://github.com/btriapitsyn/openchamber/issues/new?template=feature_request.yml";
const DISCORD_INVITE_URL: &str = "https://discord.gg/ZYRSdnwwKA";

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
        let initial_dir = tauri::async_runtime::block_on(settings.last_directory())
            .ok()
            .flatten();
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
    scope: Option<opencode_config::CommandScope>,
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
    let has_last_directory = state
        .settings()
        .last_directory()
        .await
        .ok()
        .flatten()
        .is_some();
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
fn adjust_traffic_lights_position<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    x: f64,
    y: f64,
) {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    use objc2_foundation::{NSPoint, NSRect};

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

#[cfg(target_os = "macos")]
fn build_macos_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{
        Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID, WINDOW_SUBMENU_ID,
    };

    let pkg_info = app.package_info();

    let about = MenuItem::with_id(
        app,
        MENU_ITEM_ABOUT_ID,
        format!("About {}", pkg_info.name),
        true,
        None::<&str>,
    )?;

    let check_for_updates = MenuItem::with_id(
        app,
        MENU_ITEM_CHECK_FOR_UPDATES_ID,
        "Check for Updates",
        true,
        None::<&str>,
    )?;

    // App menu items
    let settings = MenuItem::with_id(app, MENU_ITEM_SETTINGS_ID, "Settings", true, Some("Cmd+,"))?;

    let command_palette = MenuItem::with_id(
        app,
        MENU_ITEM_COMMAND_PALETTE_ID,
        "Command Palette",
        true,
        Some("Ctrl+X"),
    )?;

    // File menu items
    let new_session = MenuItem::with_id(
        app,
        MENU_ITEM_NEW_SESSION_ID,
        "New Session",
        true,
        Some("Ctrl+N"),
    )?;

    let worktree_creator = MenuItem::with_id(
        app,
        MENU_ITEM_WORKTREE_CREATOR_ID,
        "New Worktree",
        true,
        Some("Ctrl+Shift+N"),
    )?;

    let change_workspace = MenuItem::with_id(
        app,
        MENU_ITEM_CHANGE_WORKSPACE_ID,
        "Change Workspace",
        true,
        None::<&str>,
    )?;

    // View menu items
    let open_git_tab =
        MenuItem::with_id(app, MENU_ITEM_OPEN_GIT_TAB_ID, "Git", true, Some("Ctrl+G"))?;

    let open_diff_tab = MenuItem::with_id(
        app,
        MENU_ITEM_OPEN_DIFF_TAB_ID,
        "Diff",
        true,
        Some("Ctrl+E"),
    )?;

    let open_terminal_tab = MenuItem::with_id(
        app,
        MENU_ITEM_OPEN_TERMINAL_TAB_ID,
        "Terminal",
        true,
        Some("Ctrl+T"),
    )?;

    let theme_light = MenuItem::with_id(
        app,
        MENU_ITEM_THEME_LIGHT_ID,
        "Light Theme",
        true,
        None::<&str>,
    )?;

    let theme_dark = MenuItem::with_id(
        app,
        MENU_ITEM_THEME_DARK_ID,
        "Dark Theme",
        true,
        None::<&str>,
    )?;

    let theme_system = MenuItem::with_id(
        app,
        MENU_ITEM_THEME_SYSTEM_ID,
        "System Theme",
        true,
        None::<&str>,
    )?;

    let toggle_sidebar = MenuItem::with_id(
        app,
        MENU_ITEM_TOGGLE_SIDEBAR_ID,
        "Toggle Session Sidebar",
        true,
        Some("Ctrl+L"),
    )?;

    let toggle_memory_debug = MenuItem::with_id(
        app,
        MENU_ITEM_TOGGLE_MEMORY_DEBUG_ID,
        "Toggle Memory Debug",
        true,
        Some("Cmd+Shift+M"),
    )?;

    // Help menu items
    let help_dialog = MenuItem::with_id(
        app,
        MENU_ITEM_HELP_DIALOG_ID,
        "Keyboard Shortcuts",
        true,
        Some("Ctrl+H"),
    )?;

    let download_logs = MenuItem::with_id(
        app,
        MENU_ITEM_DOWNLOAD_LOGS_ID,
        "Download Logs",
        true,
        Some("Ctrl+Shift+L"),
    )?;

    let report_bug = MenuItem::with_id(
        app,
        MENU_ITEM_REPORT_BUG_ID,
        "Report a Bug",
        true,
        None::<&str>,
    )?;

    let request_feature = MenuItem::with_id(
        app,
        MENU_ITEM_REQUEST_FEATURE_ID,
        "Request a Feature",
        true,
        None::<&str>,
    )?;

    let join_discord = MenuItem::with_id(
        app,
        MENU_ITEM_JOIN_DISCORD_ID,
        "Join Discord",
        true,
        None::<&str>,
    )?;

    let theme_submenu = Submenu::with_items(
        app,
        "Theme",
        true,
        &[&theme_light, &theme_dark, &theme_system],
    )?;

    let window_menu = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let help_menu = Submenu::with_id_and_items(
        app,
        HELP_SUBMENU_ID,
        "Help",
        true,
        &[
            &help_dialog,
            &download_logs,
            &PredefinedMenuItem::separator(app)?,
            &report_bug,
            &request_feature,
            &PredefinedMenuItem::separator(app)?,
            &join_discord,
        ],
    )?;

    Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                pkg_info.name.clone(),
                true,
                &[
                    &about,
                    &check_for_updates,
                    &PredefinedMenuItem::separator(app)?,
                    &settings,
                    &command_palette,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &new_session,
                    &worktree_creator,
                    &PredefinedMenuItem::separator(app)?,
                    &change_workspace,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "View",
                true,
                &[
                    &open_git_tab,
                    &open_diff_tab,
                    &open_terminal_tab,
                    &PredefinedMenuItem::separator(app)?,
                    &theme_submenu,
                    &PredefinedMenuItem::separator(app)?,
                    &toggle_sidebar,
                    &toggle_memory_debug,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::fullscreen(app, None)?,
                ],
            )?,
            &window_menu,
            &help_menu,
        ],
    )
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
            file_name: Some("openchamber".into()),
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
        .menu(|app| {
            #[cfg(target_os = "macos")]
            {
                return build_macos_menu(app);
            }
            #[cfg(not(target_os = "macos"))]
            {
                return tauri::menu::Menu::default(app);
            }
        })
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
                    if let Err(error) = apply_vibrancy(
                        &window,
                        NSVisualEffectMaterial::Sidebar,
                        None,
                        Some(corner_radius),
                    ) {
                        warn!(
                            "[desktop:vibrancy] Failed to apply macOS vibrancy: {}",
                            error
                        );
                    } else {
                        info!(
                            "[desktop:vibrancy] Applied macOS Sidebar vibrancy with radius {}",
                            corner_radius
                        );
                    }

                    if macos_version < 26 {
                        NEEDS_TRAFFIC_LIGHT_FIX.store(true, Ordering::SeqCst);
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
            let has_initial_dir =
                tauri::async_runtime::block_on(runtime.settings().last_directory())
                    .ok()
                    .flatten()
                    .is_some();
            tauri::async_runtime::spawn(async move {
                // Only start opencode if we have a saved directory, otherwise frontend will prompt
                if has_initial_dir {
                    runtime_clone.start_opencode().await;
                } else {
                    info!("[desktop] No saved directory - waiting for user to select one");
                }

                if let Err(e) =
                    restore_bookmarks_on_startup(app_handle.state::<DesktopRuntime>().clone()).await
                {
                    warn!("Failed to restore bookmarks on startup: {}", e);
                }

                let _ = app_handle.emit("openchamber:runtime-ready", ());
            });

            // Sidecar watchdog: restart on unexpected exit and notify UI
            {
                let app_handle = app.app_handle().clone();
                let runtime = runtime.clone();
                tauri::async_runtime::spawn(async move {
                    let mut backoff_ms: u64 = 1000;
                    loop {
                        if runtime.opencode_manager().is_shutting_down() {
                            break;
                        }

                        let mut sleep_ms = backoff_ms;

                        match runtime.opencode_manager().is_child_running().await {
                            Ok(true) => {
                                sleep_ms = 1000;
                                backoff_ms = 1000;
                            }
                            Ok(false) => {
                                let _ = app_handle.emit("server.instance.disposed", ());
                                if runtime.opencode_manager().is_cli_available() {
                                    if let Err(err) =
                                        runtime.opencode_manager().ensure_running().await
                                    {
                                        warn!(
                                            "[desktop:watchdog] Failed to restart OpenCode: {err}"
                                        );
                                    } else {
                                        backoff_ms = 1000;
                                    }
                                }
                            }
                            Err(err) => {
                                warn!("[desktop:watchdog] Failed to check child status: {err}");
                            }
                        }

                        tokio::time::sleep(Duration::from_millis(sleep_ms)).await;
                        backoff_ms = (backoff_ms * 2).min(8000);
                    }
                });
            }

            // Health and wake monitor: emit health and port updates to webview
            {
                let app_handle = app.app_handle().clone();
                let runtime = runtime.clone();
                tauri::async_runtime::spawn(async move {
                    #[derive(Clone, Serialize)]
                    struct HealthSnapshot {
                        ok: bool,
                        port: Option<u16>,
                        api_prefix: String,
                        cli_available: bool,
                    }

                    let mut last_snapshot: Option<HealthSnapshot> = None;
                    let mut last_tick = Instant::now();

                    loop {
                        if runtime.opencode_manager().is_shutting_down() {
                            break;
                        }

                        let now = Instant::now();
                        let gap_ms = now.saturating_duration_since(last_tick).as_millis() as u64;
                        last_tick = now;

                        let snapshot = HealthSnapshot {
                            ok: runtime.opencode_manager().is_ready(),
                            port: runtime.opencode_manager().current_port(),
                            api_prefix: runtime.opencode_manager().api_prefix(),
                            cli_available: opencode_manager::check_cli_exists(),
                        };

                        let changed = match &last_snapshot {
                            Some(prev) => {
                                prev.ok != snapshot.ok
                                    || prev.port != snapshot.port
                                    || prev.api_prefix != snapshot.api_prefix
                                    || prev.cli_available != snapshot.cli_available
                            }
                            None => true,
                        };

                        if changed {
                            let _ = app_handle.emit("openchamber:health-changed", &snapshot);
                            last_snapshot = Some(snapshot.clone());
                        }

                        if gap_ms > 15000 {
                            let _ = app_handle.emit("openchamber:wake", ());
                        }

                        tokio::time::sleep(Duration::from_secs(5)).await;
                    }
                });
            }

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
            restart_terminal_session,
            force_kill_terminal,
            fetch_desktop_logs,
            desktop_notify,
        ])
        .on_menu_event(|app, event| {
            #[cfg(target_os = "macos")]
            {
                let event_id = event.id().as_ref();

                // Check for updates
                if event_id == MENU_ITEM_CHECK_FOR_UPDATES_ID {
                    let _ = app.emit(CHECK_FOR_UPDATES_EVENT, ());
                    return;
                }

                // External links
                if event_id == MENU_ITEM_REPORT_BUG_ID {
                    use tauri_plugin_shell::ShellExt;
                    #[allow(deprecated)]
                    {
                        let _ = app.shell().open(GITHUB_BUG_REPORT_URL, None);
                    }
                    return;
                }

                if event_id == MENU_ITEM_REQUEST_FEATURE_ID {
                    use tauri_plugin_shell::ShellExt;
                    #[allow(deprecated)]
                    {
                        let _ = app.shell().open(GITHUB_FEATURE_REQUEST_URL, None);
                    }
                    return;
                }

                if event_id == MENU_ITEM_JOIN_DISCORD_ID {
                    use tauri_plugin_shell::ShellExt;
                    #[allow(deprecated)]
                    {
                        let _ = app.shell().open(DISCORD_INVITE_URL, None);
                    }
                    return;
                }

                // App menu actions
                if event_id == MENU_ITEM_ABOUT_ID {
                    let _ = app.emit("openchamber:menu-action", "about");
                    return;
                }

                if event_id == MENU_ITEM_SETTINGS_ID {
                    let _ = app.emit("openchamber:menu-action", "settings");
                    return;
                }

                if event_id == MENU_ITEM_COMMAND_PALETTE_ID {
                    let _ = app.emit("openchamber:menu-action", "command-palette");
                    return;
                }

                // File menu actions
                if event_id == MENU_ITEM_NEW_SESSION_ID {
                    let _ = app.emit("openchamber:menu-action", "new-session");
                    return;
                }

                if event_id == MENU_ITEM_WORKTREE_CREATOR_ID {
                    let _ = app.emit("openchamber:menu-action", "worktree-creator");
                    return;
                }

                if event_id == MENU_ITEM_CHANGE_WORKSPACE_ID {
                    let _ = app.emit("openchamber:menu-action", "change-workspace");
                    return;
                }

                // View menu actions
                if event_id == MENU_ITEM_OPEN_GIT_TAB_ID {
                    let _ = app.emit("openchamber:menu-action", "open-git-tab");
                    return;
                }

                if event_id == MENU_ITEM_OPEN_DIFF_TAB_ID {
                    let _ = app.emit("openchamber:menu-action", "open-diff-tab");
                    return;
                }

                if event_id == MENU_ITEM_OPEN_TERMINAL_TAB_ID {
                    let _ = app.emit("openchamber:menu-action", "open-terminal-tab");
                    return;
                }

                if event_id == MENU_ITEM_THEME_LIGHT_ID {
                    let _ = app.emit("openchamber:menu-action", "theme-light");
                    return;
                }

                if event_id == MENU_ITEM_THEME_DARK_ID {
                    let _ = app.emit("openchamber:menu-action", "theme-dark");
                    return;
                }

                if event_id == MENU_ITEM_THEME_SYSTEM_ID {
                    let _ = app.emit("openchamber:menu-action", "theme-system");
                    return;
                }

                if event_id == MENU_ITEM_TOGGLE_SIDEBAR_ID {
                    let _ = app.emit("openchamber:menu-action", "toggle-sidebar");
                    return;
                }

                if event_id == MENU_ITEM_TOGGLE_MEMORY_DEBUG_ID {
                    let _ = app.emit("openchamber:menu-action", "toggle-memory-debug");
                    return;
                }

                // Help menu actions
                if event_id == MENU_ITEM_HELP_DIALOG_ID {
                    let _ = app.emit("openchamber:menu-action", "help-dialog");
                    return;
                }

                if event_id == MENU_ITEM_DOWNLOAD_LOGS_ID {
                    let _ = app.emit("openchamber:menu-action", "download-logs");
                    return;
                }
            }
        })
        .on_window_event(|window, event| {
            let window_state_manager = window.state::<WindowStateManager>().inner().clone();

            match event {
                tauri::WindowEvent::Focused(true) => {
                    // Clear dock badge and underlying badge state when the window gains focus
                    let _ = window.set_badge_count(None);
                    let _ = window
                        .app_handle()
                        .emit("openchamber:clear-badge-sessions", ());
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
                    #[cfg(target_os = "macos")]
                    if NEEDS_TRAFFIC_LIGHT_FIX.load(Ordering::SeqCst) {
                        if let Some(webview) = window.app_handle().get_webview_window("main") {
                            adjust_traffic_lights_position(&webview, 17.0, 16.0);
                        }
                    }
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
        .route(
            "/api/openchamber/models-metadata",
            get(models_metadata_handler),
        )
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

async fn models_metadata_handler(
    State(state): State<ServerState>,
) -> Result<Json<Value>, StatusCode> {
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
    json_response(
        status,
        ConfigErrorResponse {
            error: message.into(),
        },
    )
}

async fn parse_request_payload(
    req: Request<Body>,
) -> Result<HashMap<String, Value>, Response<Body>> {
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
    state.opencode.restart().await.map_err(|err| {
        config_error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to restart OpenCode: {}", err),
        )
    })?;
    Ok(())
}

async fn handle_agent_route(
    state: &ServerState,
    method: Method,
    req: Request<Body>,
    name: String,
) -> Result<Response<Body>, StatusCode> {
    // Get working directory for project-level agent detection
    let working_directory = state.opencode.get_working_directory();

    match method {
        Method::GET => {
            match opencode_config::get_agent_sources(&name, Some(&working_directory)).await {
                Ok(sources) => {
                    let scope = sources.md.scope.clone().map(|s| match s {
                        opencode_config::Scope::User => opencode_config::CommandScope::User,
                        opencode_config::Scope::Project => opencode_config::CommandScope::Project,
                    });
                    Ok(json_response(
                        StatusCode::OK,
                        ConfigMetadataResponse {
                            name,
                            is_built_in: !sources.md.exists && !sources.json.exists,
                            scope,
                            sources,
                        },
                    ))
                }
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

            // Extract scope from payload if present
            let scope = payload
                .get("scope")
                .and_then(|v| v.as_str())
                .and_then(|s| match s {
                    "project" => Some(opencode_config::AgentScope::Project),
                    "user" => Some(opencode_config::AgentScope::User),
                    _ => None,
                });

            match opencode_config::create_agent(&name, &payload, Some(&working_directory), scope)
                .await
            {
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

            match opencode_config::update_agent(&name, &payload, Some(&working_directory)).await {
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
        Method::DELETE => {
            match opencode_config::delete_agent(&name, Some(&working_directory)).await {
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
            }
        }
        _ => Ok(StatusCode::METHOD_NOT_ALLOWED.into_response()),
    }
}

/// Response type for skill metadata
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillMetadataResponse {
    name: String,
    exists: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    scope: Option<opencode_config::Scope>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<opencode_config::SkillSource>,
    sources: opencode_config::SkillConfigSources,
}

/// Response type for skill list
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillListItem {
    name: String,
    path: String,
    scope: opencode_config::Scope,
    source: opencode_config::SkillSource,
    sources: opencode_config::SkillConfigSources,
}

/// Response type for skill file content
#[derive(Serialize)]
struct SkillFileResponse {
    path: String,
    content: String,
}

async fn handle_skill_list_route(state: &ServerState) -> Result<Response<Body>, StatusCode> {
    let working_directory = state.opencode.get_working_directory();
    let discovered = opencode_config::discover_skills(Some(&working_directory));

    let mut skills = Vec::new();
    for skill in discovered {
        match opencode_config::get_skill_sources(&skill.name, Some(&working_directory)).await {
            Ok(sources) => {
                skills.push(SkillListItem {
                    name: skill.name,
                    path: skill.path,
                    scope: skill.scope,
                    source: skill.source,
                    sources,
                });
            }
            Err(err) => {
                error!(
                    "[desktop:config] Failed to get skill sources for {}: {}",
                    skill.name, err
                );
            }
        }
    }

    Ok(json_response(
        StatusCode::OK,
        serde_json::json!({ "skills": skills }),
    ))
}

async fn handle_skill_route(
    state: &ServerState,
    method: Method,
    req: Request<Body>,
    name: String,
    file_path: Option<String>,
) -> Result<Response<Body>, StatusCode> {
    let working_directory = state.opencode.get_working_directory();

    // Handle file operations: /api/config/skills/:name/files/*
    if let Some(ref fp) = file_path {
        match method {
            Method::GET => {
                // Read supporting file
                match opencode_config::get_skill_sources(&name, Some(&working_directory)).await {
                    Ok(sources) => {
                        if !sources.md.exists {
                            return Ok(config_error_response(
                                StatusCode::NOT_FOUND,
                                "Skill not found",
                            ));
                        }
                        let skill_dir = sources.md.dir.ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
                        match opencode_config::read_skill_supporting_file(
                            std::path::Path::new(&skill_dir),
                            fp,
                        )
                        .await
                        {
                            Ok(content) => Ok(json_response(
                                StatusCode::OK,
                                SkillFileResponse {
                                    path: fp.clone(),
                                    content,
                                },
                            )),
                            Err(_) => Ok(config_error_response(
                                StatusCode::NOT_FOUND,
                                "File not found",
                            )),
                        }
                    }
                    Err(err) => {
                        error!("[desktop:config] Failed to read skill sources: {}", err);
                        Ok(config_error_response(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "Failed to read skill",
                        ))
                    }
                }
            }
            Method::PUT => {
                // Write supporting file
                let payload = match parse_request_payload(req).await {
                    Ok(data) => data,
                    Err(resp) => return Ok(resp),
                };
                let content = payload
                    .get("content")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                match opencode_config::get_skill_sources(&name, Some(&working_directory)).await {
                    Ok(sources) => {
                        if !sources.md.exists {
                            return Ok(config_error_response(
                                StatusCode::NOT_FOUND,
                                "Skill not found",
                            ));
                        }
                        let skill_dir = sources.md.dir.ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
                        match opencode_config::write_skill_supporting_file(
                            std::path::Path::new(&skill_dir),
                            fp,
                            content,
                        )
                        .await
                        {
                            Ok(()) => Ok(json_response(
                                StatusCode::OK,
                                ConfigActionResponse {
                                    success: true,
                                    requires_reload: false,
                                    message: format!("File {} saved successfully", fp),
                                    reload_delay_ms: 0,
                                },
                            )),
                            Err(err) => Ok(config_error_response(
                                StatusCode::INTERNAL_SERVER_ERROR,
                                err.to_string(),
                            )),
                        }
                    }
                    Err(err) => Ok(config_error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        err.to_string(),
                    )),
                }
            }
            Method::DELETE => {
                // Delete supporting file
                match opencode_config::get_skill_sources(&name, Some(&working_directory)).await {
                    Ok(sources) => {
                        if !sources.md.exists {
                            return Ok(config_error_response(
                                StatusCode::NOT_FOUND,
                                "Skill not found",
                            ));
                        }
                        let skill_dir = sources.md.dir.ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
                        match opencode_config::delete_skill_supporting_file(
                            std::path::Path::new(&skill_dir),
                            fp,
                        )
                        .await
                        {
                            Ok(()) => Ok(json_response(
                                StatusCode::OK,
                                ConfigActionResponse {
                                    success: true,
                                    requires_reload: false,
                                    message: format!("File {} deleted successfully", fp),
                                    reload_delay_ms: 0,
                                },
                            )),
                            Err(err) => Ok(config_error_response(
                                StatusCode::INTERNAL_SERVER_ERROR,
                                err.to_string(),
                            )),
                        }
                    }
                    Err(err) => Ok(config_error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        err.to_string(),
                    )),
                }
            }
            _ => Ok(StatusCode::METHOD_NOT_ALLOWED.into_response()),
        }
    } else {
        // Handle skill CRUD: /api/config/skills/:name
        match method {
            Method::GET => {
                match opencode_config::get_skill_sources(&name, Some(&working_directory)).await {
                    Ok(sources) => {
                        let scope = sources.md.scope.clone();
                        let source = sources.md.source.clone();
                        Ok(json_response(
                            StatusCode::OK,
                            SkillMetadataResponse {
                                name,
                                exists: sources.md.exists,
                                scope,
                                source,
                                sources,
                            },
                        ))
                    }
                    Err(err) => {
                        error!("[desktop:config] Failed to read skill sources: {}", err);
                        Ok(config_error_response(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "Failed to read skill configuration",
                        ))
                    }
                }
            }
            Method::POST => {
                let payload = match parse_request_payload(req).await {
                    Ok(data) => data,
                    Err(resp) => return Ok(resp),
                };

                let scope = payload
                    .get("scope")
                    .and_then(|v| v.as_str())
                    .and_then(|s| match s {
                        "project" => Some(opencode_config::SkillScope::Project),
                        "user" => Some(opencode_config::SkillScope::User),
                        _ => None,
                    });

                match opencode_config::create_skill(
                    &name,
                    &payload,
                    Some(&working_directory),
                    scope,
                )
                .await
                {
                    Ok(()) => {
                        if let Err(resp) =
                            refresh_opencode_after_config_change(state, "skill creation").await
                        {
                            return Ok(resp);
                        }

                        Ok(json_response(
                            StatusCode::OK,
                            ConfigActionResponse {
                                success: true,
                                requires_reload: true,
                                message: format!(
                                    "Skill {} created successfully. Reloading interface...",
                                    name
                                ),
                                reload_delay_ms: CLIENT_RELOAD_DELAY_MS,
                            },
                        ))
                    }
                    Err(err) => {
                        error!("[desktop:config] Failed to create skill {}: {}", name, err);
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

                match opencode_config::update_skill(&name, &payload, Some(&working_directory)).await
                {
                    Ok(()) => {
                        if let Err(resp) =
                            refresh_opencode_after_config_change(state, "skill update").await
                        {
                            return Ok(resp);
                        }

                        Ok(json_response(
                            StatusCode::OK,
                            ConfigActionResponse {
                                success: true,
                                requires_reload: true,
                                message: format!(
                                    "Skill {} updated successfully. Reloading interface...",
                                    name
                                ),
                                reload_delay_ms: CLIENT_RELOAD_DELAY_MS,
                            },
                        ))
                    }
                    Err(err) => {
                        error!("[desktop:config] Failed to update skill {}: {}", name, err);
                        Ok(config_error_response(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            err.to_string(),
                        ))
                    }
                }
            }
            Method::DELETE => {
                match opencode_config::delete_skill(&name, Some(&working_directory)).await {
                    Ok(()) => {
                        if let Err(resp) =
                            refresh_opencode_after_config_change(state, "skill deletion").await
                        {
                            return Ok(resp);
                        }

                        Ok(json_response(
                            StatusCode::OK,
                            ConfigActionResponse {
                                success: true,
                                requires_reload: true,
                                message: format!(
                                    "Skill {} deleted successfully. Reloading interface...",
                                    name
                                ),
                                reload_delay_ms: CLIENT_RELOAD_DELAY_MS,
                            },
                        ))
                    }
                    Err(err) => {
                        error!("[desktop:config] Failed to delete skill {}: {}", name, err);
                        let status = if err.to_string().contains("not found") {
                            StatusCode::NOT_FOUND
                        } else {
                            StatusCode::INTERNAL_SERVER_ERROR
                        };
                        Ok(config_error_response(status, err.to_string()))
                    }
                }
            }
            _ => Ok(StatusCode::METHOD_NOT_ALLOWED.into_response()),
        }
    }
}

async fn handle_command_route(
    state: &ServerState,
    method: Method,
    req: Request<Body>,
    name: String,
) -> Result<Response<Body>, StatusCode> {
    // Get working directory for project-level command detection
    let working_directory = state.opencode.get_working_directory();

    match method {
        Method::GET => {
            match opencode_config::get_command_sources(&name, Some(&working_directory)).await {
                Ok(sources) => {
                    let scope = sources.md.scope.clone().map(|s| match s {
                        opencode_config::Scope::User => opencode_config::CommandScope::User,
                        opencode_config::Scope::Project => opencode_config::CommandScope::Project,
                    });
                    Ok(json_response(
                        StatusCode::OK,
                        ConfigMetadataResponse {
                            name,
                            is_built_in: !sources.md.exists && !sources.json.exists,
                            scope,
                            sources,
                        },
                    ))
                }
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

            // Extract scope from payload if present
            let scope = payload
                .get("scope")
                .and_then(|v| v.as_str())
                .and_then(|s| match s {
                    "project" => Some(opencode_config::CommandScope::Project),
                    "user" => Some(opencode_config::CommandScope::User),
                    _ => None,
                });

            match opencode_config::create_command(&name, &payload, Some(&working_directory), scope)
                .await
            {
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
                    error!(
                        "[desktop:config] Failed to create command {}: {}",
                        name, err
                    );
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

            match opencode_config::update_command(&name, &payload, Some(&working_directory)).await {
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
                    error!(
                        "[desktop:config] Failed to update command {}: {}",
                        name, err
                    );
                    Ok(config_error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        err.to_string(),
                    ))
                }
            }
        }
        Method::DELETE => {
            match opencode_config::delete_command(&name, Some(&working_directory)).await {
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
                    error!(
                        "[desktop:config] Failed to delete command {}: {}",
                        name, err
                    );
                    let status = if err.to_string().contains("not found") {
                        StatusCode::NOT_FOUND
                    } else {
                        StatusCode::INTERNAL_SERVER_ERROR
                    };
                    Ok(config_error_response(status, err.to_string()))
                }
            }
        }
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

    // Skills catalog routes (must be checked before /api/config/skills/:name)
    if path == "/api/config/skills/catalog" && method == Method::GET {
        let refresh = req
            .uri()
            .query()
            .map(|q| q.contains("refresh=true"))
            .unwrap_or(false);

        let working_directory = state.opencode.get_working_directory();
        let payload = skills_catalog::get_catalog(&working_directory, refresh).await;
        return Ok(json_response(StatusCode::OK, payload));
    }

    if path == "/api/config/skills/scan" && method == Method::POST {
        let payload_map = match parse_request_payload(req).await {
            Ok(data) => data,
            Err(resp) => return Ok(resp),
        };

        let payload_value = serde_json::Value::Object(payload_map.into_iter().collect());
        let scan_request =
            match serde_json::from_value::<skills_catalog::SkillsScanRequest>(payload_value) {
                Ok(v) => v,
                Err(_) => {
                    return Ok(json_response(
                        StatusCode::BAD_REQUEST,
                        skills_catalog::SkillsRepoScanResponse {
                            ok: false,
                            items: None,
                            error: Some(skills_catalog::SkillsRepoError {
                                kind: "invalidSource".to_string(),
                                message: "Malformed scan request".to_string(),
                                ssh_only: None,
                                identities: None,
                                conflicts: None,
                            }),
                        },
                    ))
                }
            };

        let response = skills_catalog::scan_repository(scan_request).await;
        let status = if response.ok {
            StatusCode::OK
        } else if response.error.as_ref().map(|e| e.kind.as_str()) == Some("authRequired") {
            StatusCode::UNAUTHORIZED
        } else {
            StatusCode::BAD_REQUEST
        };

        return Ok(json_response(status, response));
    }

    if path == "/api/config/skills/install" && method == Method::POST {
        let payload_map = match parse_request_payload(req).await {
            Ok(data) => data,
            Err(resp) => return Ok(resp),
        };

        let payload_value = serde_json::Value::Object(payload_map.into_iter().collect());
        let install_request =
            match serde_json::from_value::<skills_catalog::SkillsInstallRequest>(payload_value) {
                Ok(v) => v,
                Err(_) => {
                    return Ok(json_response(
                        StatusCode::BAD_REQUEST,
                        skills_catalog::SkillsInstallResponse {
                            ok: false,
                            installed: None,
                            skipped: None,
                            error: Some(skills_catalog::SkillsRepoError {
                                kind: "invalidSource".to_string(),
                                message: "Malformed install request".to_string(),
                                ssh_only: None,
                                identities: None,
                                conflicts: None,
                            }),
                        },
                    ))
                }
            };

        let working_directory = state.opencode.get_working_directory();
        let response = skills_catalog::install_skills(&working_directory, install_request).await;

        let status = if response.ok {
            StatusCode::OK
        } else if response.error.as_ref().map(|e| e.kind.as_str()) == Some("conflicts") {
            StatusCode::CONFLICT
        } else if response.error.as_ref().map(|e| e.kind.as_str()) == Some("authRequired") {
            StatusCode::UNAUTHORIZED
        } else {
            StatusCode::BAD_REQUEST
        };

        return Ok(json_response(status, response));
    }

    // Handle skill routes: /api/config/skills and /api/config/skills/:name
    if path == "/api/config/skills" && method == Method::GET {
        return handle_skill_list_route(&state).await;
    }

    if let Some(rest) = path.strip_prefix("/api/config/skills/") {
        // Check if it's a file operation: /api/config/skills/:name/files/*
        if let Some(files_start) = rest.find("/files/") {
            let name = &rest[..files_start];
            let file_path_encoded = &rest[files_start + 7..]; // Skip "/files/"
                                                              // Decode URL-encoded path (e.g., "docs%2Foptimization.md" -> "docs/optimization.md")
            let file_path = urlencoding::decode(file_path_encoded)
                .map(|s| s.into_owned())
                .unwrap_or_else(|_| file_path_encoded.to_string());
            if name.is_empty() {
                return Ok(config_error_response(
                    StatusCode::BAD_REQUEST,
                    "Skill name is required",
                ));
            }
            return handle_skill_route(&state, method, req, name.to_string(), Some(file_path))
                .await;
        }

        let trimmed = rest.trim();
        if trimmed.is_empty() {
            return Ok(config_error_response(
                StatusCode::BAD_REQUEST,
                "Skill name is required",
            ));
        }
        return handle_skill_route(&state, method, req, trimmed.to_string(), None).await;
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
                message: "Configuration reloaded successfully. Refreshing interface...".to_string(),
                reload_delay_ms: CLIENT_RELOAD_DELAY_MS,
            },
        ));
    }

    // Handle provider auth removal: DELETE /api/provider/:providerId/auth
    if let Some(rest) = path.strip_prefix("/api/provider/") {
        if let Some(provider_id) = rest.strip_suffix("/auth") {
            if method == Method::DELETE {
                let trimmed = provider_id.trim();
                if trimmed.is_empty() {
                    return Ok(config_error_response(
                        StatusCode::BAD_REQUEST,
                        "Provider ID is required",
                    ));
                }

                match opencode_auth::remove_provider_auth(trimmed).await {
                    Ok(removed) => {
                        if let Err(resp) = refresh_opencode_after_config_change(
                            &state,
                            &format!("provider {} disconnected", trimmed),
                        )
                        .await
                        {
                            return Ok(resp);
                        }

                        return Ok(json_response(
                            StatusCode::OK,
                            ConfigActionResponse {
                                success: true,
                                requires_reload: true,
                                message: if removed {
                                    "Provider disconnected successfully".to_string()
                                } else {
                                    "Provider was not connected".to_string()
                                },
                                reload_delay_ms: CLIENT_RELOAD_DELAY_MS,
                            },
                        ));
                    }
                    Err(err) => {
                        error!(
                            "[desktop:config] Failed to disconnect provider {}: {}",
                            trimmed, err
                        );
                        return Ok(config_error_response(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            err.to_string(),
                        ));
                    }
                }
            }
        }
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

    let mut resolved_path = expand_tilde_path(requested_path);
    if !resolved_path.is_absolute() {
        resolved_path = state.opencode.get_working_directory().join(resolved_path);
    }

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

    if let Ok(canonicalized) = fs::canonicalize(&resolved_path).await {
        resolved_path = canonicalized;
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

    // Check if this is a provider auth deletion request (DELETE /api/provider/:id/auth)
    let is_provider_auth_delete = method == Method::DELETE
        && origin_path.starts_with("/api/provider/")
        && origin_path.ends_with("/auth")
        && origin_path != "/api/provider/auth"; // Exclude GET /api/provider/auth

    let is_desktop_config_route = origin_path.starts_with("/api/config/agents/")
        || origin_path.starts_with("/api/config/commands/")
        || origin_path.starts_with("/api/config/skills")
        || origin_path == "/api/config/reload"
        || is_provider_auth_delete;

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
            .map(expand_tilde_path);
        Ok(candidate)
    }
}
