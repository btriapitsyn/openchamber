use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{LogicalPosition, LogicalSize, WebviewWindow, Window};
use tokio::fs as async_fs;

const WINDOW_STATE_FILE: &str = "window-state.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub width: f64,
    pub height: f64,
    pub x: f64,
    pub y: f64,
    pub is_maximized: bool,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            width: 1280.0,
            height: 800.0,
            x: 0.0,
            y: 0.0,
            is_maximized: false,
        }
    }
}

#[derive(Serialize, Deserialize)]
struct WindowStateFile {
    #[serde(rename = "windowState")]
    pub window_state: WindowState,
}

#[derive(Clone)]
pub struct WindowStateManager {
    inner: Arc<Mutex<WindowState>>,
}

impl WindowStateManager {
    pub fn new(initial: WindowState) -> Self {
        Self {
            inner: Arc::new(Mutex::new(initial)),
        }
    }

    pub fn snapshot(&self) -> WindowState {
        self.inner.lock().expect("window state poisoned").clone()
    }

    pub fn update_position(&self, x: f64, y: f64, is_maximized: bool) {
        if is_maximized {
            return;
        }
        if let Ok(mut state) = self.inner.lock() {
            if !state.is_maximized {
                state.x = x;
                state.y = y;
            }
        }
    }

    pub fn update_size(&self, width: f64, height: f64, is_maximized: bool) {
        if let Ok(mut state) = self.inner.lock() {
            if !is_maximized {
                state.width = width;
                state.height = height;
            }
            state.is_maximized = is_maximized;
        }
    }
}

fn state_file_path() -> Result<PathBuf> {
    let mut path = dirs::home_dir().ok_or_else(|| anyhow!("No home directory"))?;
    path.push(".config");
    path.push("openchamber");
    path.push(WINDOW_STATE_FILE);
    Ok(path)
}

pub async fn load_window_state() -> Result<Option<WindowState>> {
    let path = state_file_path()?;
    match async_fs::read(&path).await {
        Ok(bytes) => {
            let file: WindowStateFile = serde_json::from_slice(&bytes)?;
            Ok(Some(file.window_state))
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.into()),
    }
}

pub async fn save_window_state(state: &WindowState) -> Result<()> {
    let path = state_file_path()?;
    if let Some(parent) = path.parent() {
        async_fs::create_dir_all(parent).await?;
    }
    let payload = WindowStateFile {
        window_state: state.clone(),
    };
    let data = serde_json::to_vec_pretty(&payload)?;
    async_fs::write(&path, data).await?;
    Ok(())
}

pub fn apply_window_state(window: &WebviewWindow, state: &WindowState) -> Result<()> {
    let mut normalized = state.clone();
    clamp_to_visible_region(window, &mut normalized);

    if normalized.width > 0.0 && normalized.height > 0.0 {
        let _ = window.set_size(LogicalSize::new(normalized.width, normalized.height));
    }
    let _ = window.set_position(LogicalPosition::new(normalized.x, normalized.y));
    if state.is_maximized {
        let _ = window.maximize();
    } else {
        let _ = window.unmaximize();
    }
    Ok(())
}

pub async fn persist_window_state(window: &Window, manager: &WindowStateManager) -> Result<()> {
    let mut snapshot = manager.snapshot();
    let is_maximized = window.is_maximized().unwrap_or(snapshot.is_maximized);
    snapshot.is_maximized = is_maximized;

    if !is_maximized {
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        if let Ok(size) = window.outer_size() {
            let logical: LogicalSize<f64> = size.to_logical(scale_factor);
            snapshot.width = logical.width.max(200.0);
            snapshot.height = logical.height.max(200.0);
        }
        if let Ok(position) = window.outer_position() {
            let logical: LogicalPosition<f64> = position.to_logical(scale_factor);
            snapshot.x = logical.x;
            snapshot.y = logical.y;
        }
    }

    save_window_state(&snapshot).await
}

fn clamp_to_visible_region(window: &WebviewWindow, state: &mut WindowState) {
    let monitor = match window.current_monitor() {
        Ok(Some(monitor)) => monitor,
        _ => return,
    };
    let scale_factor = monitor.scale_factor();
    let monitor_size: LogicalSize<f64> = monitor.size().to_logical(scale_factor);
    let monitor_position: LogicalPosition<f64> = monitor.position().to_logical(scale_factor);

    state.width = state.width.clamp(400.0, monitor_size.width);
    state.height = state.height.clamp(300.0, monitor_size.height);

    let max_x = monitor_position.x + (monitor_size.width - state.width).max(0.0);
    let max_y = monitor_position.y + (monitor_size.height - state.height).max(0.0);

    state.x = state.x.clamp(monitor_position.x, max_x);
    state.y = state.y.clamp(monitor_position.y, max_y);
}
