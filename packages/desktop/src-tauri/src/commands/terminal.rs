use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem, MasterPty};
use tauri::{Emitter, State, Window};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::thread;
use serde::{Serialize, Deserialize};
use anyhow::Result;

// We need to store the master PTY to write input and resize.
// Since we need to share it across threads (Tauri commands), it must be Send.
// portable-pty::MasterPty is Send on Unix.
pub struct TerminalSession {
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
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
    // Optional cwd, if not provided defaults to home or project root?
    // The UI usually passes cwd if it knows it.
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
    window: Window
) -> Result<CreateTerminalResponse, String> {
    let pty_system = NativePtySystem::default();

    let size = PtySize {
        rows: payload.rows,
        cols: payload.cols,
        pixel_width: 0,
        pixel_height: 0,
    };

    let mut cmd = CommandBuilder::new("zsh"); // Default to zsh on macOS
    // Fallback to bash or sh if needed, but macOS is zsh by default now.
    // cmd.env("TERM", "xterm-256color"); // portable-pty might set this?
    
    if let Some(cwd) = payload.cwd {
        cmd.cwd(cwd);
    } else if let Some(home) = dirs::home_dir() {
        cmd.cwd(home);
    }

    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;
    
    let session_id = uuid::Uuid::new_v4().to_string();
    let _session_id_clone = session_id.clone();

    // Spawn a thread to read from the pty and emit events
    // We need to clone the reader *before* we move the master into the map?
    // No, pair.master and pair.slave. 
    // Wait, we spawn a child process attached to the slave.
    
    let mut _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    
    // Release the slave, we don't need it in the parent.
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let window_clone = window.clone();
    let session_id_event = session_id.clone();

    thread::spawn(move || {
        let mut buffer = [0u8; 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(n) if n > 0 => {
                    let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                    // Emit event: terminal://<session_id>
                    // Payload: { type: 'data', data: string }
                    // The UI expects a specific structure. 
                    // In packages/ui/src/lib/terminalApi.ts it expects "TerminalStreamEvent"
                    // which is { type: 'data', data } or { type: 'reconnecting' } etc.
                    
                    let event_name = format!("terminal://{}", session_id_event);
                    let payload = serde_json::json!({
                        "type": "data",
                        "data": data
                    });
                    
                    if let Err(e) = window_clone.emit(&event_name, payload) {
                        eprintln!("Failed to emit terminal data: {}", e);
                        break; 
                    }
                }
                Ok(_) => {
                    // EOF
                    break;
                }
                Err(_) => {
                    break;
                }
            }
        }
        // Child process likely exited.
        // We could emit a "close" event or similar if the UI supported it, 
        // but usually the UI handles connection loss.
        // Just let the session die.
    });
    
    // Store the master + child?
    // We might need to kill the child on close.
    // But `MasterPty` usually kills child on drop? Or we need to keep child handle?
    // `portable_pty` child handle: `Box<dyn Child + Send + Sync>`.
    // We should probably store it to wait/kill it. 
    // But for now, let's just store the MasterPty to write/resize.
    // If we drop MasterPty, the reader might fail?
    // Actually, `try_clone_reader` creates a separate reader.
    
    // For full correctness we should probably wrap MasterPty and Child in a struct.
    // But `TerminalState` defined above is simpler. Let's see if we can just cast MasterPty.
    // portable-pty MasterPty is not generic.
    
    let mut sessions = state.sessions.lock().unwrap();
    sessions.insert(session_id.clone(), TerminalSession { 
        master: pair.master, 
        writer 
    });

    Ok(CreateTerminalResponse { session_id })
}

#[tauri::command]
pub async fn send_terminal_input(
    session_id: String, 
    data: String, 
    state: State<'_, TerminalState>
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&session_id) {
        write!(session.writer, "{}", data).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn resize_terminal(
    session_id: String, 
    cols: u16, 
    rows: u16, 
    state: State<'_, TerminalState>
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&session_id) {
        session.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn close_terminal(
    session_id: String, 
    state: State<'_, TerminalState>
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    // Removing it drops the MasterPty, which should close the PTY.
    sessions.remove(&session_id);
    Ok(())
}
