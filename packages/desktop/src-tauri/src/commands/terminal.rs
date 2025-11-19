use log::error;
use portable_pty::{Child, CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    env,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
};
use tauri::{Emitter, State, Window};

const DEFAULT_SHELL: &str = "/bin/zsh";
const DEFAULT_TERM: &str = "xterm-256color";
const DEFAULT_COLORTERM: &str = "truecolor";
const DEFAULT_LOCALE: &str = "en_US.UTF-8";
const TERM_PROGRAM_NAME: &str = "OpenChamber";
const TERM_PROGRAM_VERSION: &str = env!("CARGO_PKG_VERSION");

pub struct TerminalSession {
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
}

pub struct TerminalState {
    pub sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
}

impl TerminalState {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[derive(Deserialize)]
pub struct CreateTerminalPayload {
    pub cols: u16,
    pub rows: u16,
    pub cwd: Option<String>,
}

#[derive(Serialize)]
pub struct CreateTerminalResponse {
    pub session_id: String,
}

#[tauri::command]
pub async fn create_terminal_session(
    payload: CreateTerminalPayload,
    state: State<'_, TerminalState>,
    window: Window,
) -> Result<CreateTerminalResponse, String> {
    let pty_system = NativePtySystem::default();
    let size = PtySize {
        rows: payload.rows,
        cols: payload.cols,
        pixel_width: 0,
        pixel_height: 0,
    };

    let working_dir = resolve_working_directory(payload.cwd.as_deref())?;
    let shell_path = resolve_shell();

    let mut cmd = CommandBuilder::new(&shell_path);
    if shell_accepts_login_flag(&shell_path) {
        cmd.arg("-l");
    }
    if let Some(cwd) = working_dir.to_str() {
        cmd.cwd(cwd);
    }
    apply_terminal_environment(&mut cmd, &shell_path);

    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;
    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {e}"))?;
    drop(pair.slave);

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;
    let writer = Arc::new(Mutex::new(
        pair.master
            .take_writer()
            .map_err(|e| format!("Failed to take PTY writer: {e}"))?,
    ));
    let master = pair.master;
    let child = Arc::new(Mutex::new(child));

    let session_id = uuid::Uuid::new_v4().to_string();
    state.sessions.lock().unwrap().insert(
        session_id.clone(),
        TerminalSession {
            master,
            writer: writer.clone(),
            child: child.clone(),
        },
    );

    spawn_reader_thread(reader, window.clone(), session_id.clone());
    spawn_exit_watcher(child, window, state.sessions.clone(), session_id.clone());

    Ok(CreateTerminalResponse { session_id })
}

#[tauri::command]
pub async fn send_terminal_input(
    session_id: String,
    data: String,
    state: State<'_, TerminalState>,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    let Some(session) = sessions.get(&session_id) else {
        return Err("Terminal session not found".to_string());
    };

    let mut writer = session
        .writer
        .lock()
        .map_err(|_| "Terminal busy".to_string())?;
    writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Failed to write to terminal: {e}"))?;
    writer
        .flush()
        .map_err(|e| format!("Failed to flush terminal input: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn resize_terminal(
    session_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, TerminalState>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    let Some(session) = sessions.get_mut(&session_id) else {
        return Err("Terminal session not found".to_string());
    };

    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to resize terminal: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn close_terminal(
    session_id: String,
    state: State<'_, TerminalState>,
) -> Result<(), String> {
    let session = {
        let mut sessions = state.sessions.lock().unwrap();
        sessions.remove(&session_id)
    };

    if let Some(session) = session {
        if let Ok(mut child) = session.child.lock() {
            let _ = child.kill();
        }
    }

    Ok(())
}

fn spawn_reader_thread(mut reader: Box<dyn Read + Send>, window: Window, session_id: String) {
    thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        let event_name = format!("terminal://{}", session_id);
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                    if data.is_empty() {
                        continue;
                    }

                    if let Err(error) =
                        window.emit(&event_name, serde_json::json!({ "type": "data", "data": data }))
                    {
                        error!("Failed to emit terminal data: {error}");
                        break;
                    }
                }
                Err(error) => {
                    error!("Terminal read error: {error}");
                    break;
                }
            }
        }
    });
}

fn spawn_exit_watcher(
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    window: Window,
    sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
    session_id: String,
) {
    thread::spawn(move || {
        let status = {
            let mut guard = child.lock().expect("terminal child poisoned");
            guard.wait()
        };

        let (exit_code, signal) = match status {
            Ok(status) => (
                status.exit_code() as i32,
                status.signal().map(|sig| sig.to_string()),
            ),
            Err(err) => {
                error!("Failed to wait for terminal exit: {err}");
                (1, Some("Terminal crashed".to_string()))
            }
        };

        let event_name = format!("terminal://{}", session_id);
        let payload = serde_json::json!({
            "type": "exit",
            "exitCode": exit_code,
            "signal": signal
        });
        let _ = window.emit(&event_name, payload);

        let mut sessions = sessions.lock().unwrap();
        sessions.remove(&session_id);
    });
}

fn resolve_shell() -> String {
    env::var("SHELL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_SHELL.to_string())
}

fn shell_accepts_login_flag(shell_path: &str) -> bool {
    let shell_name = Path::new(shell_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(shell_path)
        .to_lowercase();

    matches!(
        shell_name.as_str(),
        name if name.contains("zsh")
            || name.contains("bash")
            || name.contains("sh")
            || name.contains("fish")
            || name.contains("ksh")
    )
}

fn resolve_working_directory(input: Option<&str>) -> Result<PathBuf, String> {
    let maybe_path = input
        .map(|value| PathBuf::from(value))
        .or_else(|| dirs::home_dir());

    let Some(path) = maybe_path else {
        return Err("Unable to determine working directory".to_string());
    };

    if !path.exists() || !path.is_dir() {
        return Err(format!(
            "Working directory is not accessible: {}",
            path.display()
        ));
    }

    Ok(path)
}

fn apply_terminal_environment(cmd: &mut CommandBuilder, shell_path: &str) {
    cmd.env(
        "TERM",
        env::var("TERM").unwrap_or_else(|_| DEFAULT_TERM.to_string()),
    );
    cmd.env(
        "COLORTERM",
        env::var("COLORTERM").unwrap_or_else(|_| DEFAULT_COLORTERM.to_string()),
    );
    cmd.env(
        "LC_ALL",
        env::var("LC_ALL").unwrap_or_else(|_| DEFAULT_LOCALE.to_string()),
    );
    cmd.env(
        "LANG",
        env::var("LANG").unwrap_or_else(|_| DEFAULT_LOCALE.to_string()),
    );
    cmd.env("TERM_PROGRAM", TERM_PROGRAM_NAME);
    cmd.env("TERM_PROGRAM_VERSION", TERM_PROGRAM_VERSION);
    cmd.env("OPENCHAMBER_DESKTOP", "1");
    cmd.env("SHELL", shell_path);
}
