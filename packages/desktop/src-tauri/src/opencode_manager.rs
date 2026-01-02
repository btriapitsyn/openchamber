use anyhow::{anyhow, Result};
use log::{debug, info, warn};
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use regex::Regex;
use reqwest::Client;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::{Child, Command},
    sync::Mutex,
    time::timeout,
};

static URL_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"https?://[^:\s]+:(?P<port>\d+)(?P<path>/[^\s"']*)?"#).expect("valid regex")
});

const FIRST_SIGNAL_TIMEOUT_MS: u64 = 750;
const READY_CHECK_TIMEOUT_MS: u64 = 20000;
const READY_CHECK_INTERVAL_MS: u64 = 400;

#[derive(Clone)]
pub struct OpenCodeManager {
    binary: Option<String>,
    args: Vec<String>,
    env: HashMap<String, String>,
    working_dir: Arc<RwLock<PathBuf>>,
    desired_port: u16,
    child: Arc<Mutex<Option<Child>>>,
    port: Arc<RwLock<Option<u16>>>,
    api_prefix: Arc<RwLock<String>>,
    is_ready: Arc<AtomicBool>,
    shutting_down: Arc<AtomicBool>,
    http_client: Client,
}

fn normalize_api_prefix(prefix: &str) -> String {
    let trimmed = prefix.trim();
    if trimmed.is_empty() || trimmed == "/" {
        return String::new();
    }

    let mut normalized = trimmed.trim_end_matches('/').to_string();
    if !normalized.starts_with('/') {
        normalized.insert(0, '/');
    }
    normalized
}

impl OpenCodeManager {
    pub fn new_with_directory(initial_dir: Option<PathBuf>) -> Self {
        let desired_port = std::env::var("OPENCHAMBER_OPENCODE_PORT")
            .ok()
            .and_then(|raw| raw.parse::<u16>().ok())
            .unwrap_or(0);

        let binary = resolve_opencode_binary();

        if let Some(ref bin) = binary {
            if !Path::new(bin).is_absolute() {
                info!("[desktop:opencode] using PATH-resolved binary: {}", bin);
            } else {
                info!("[desktop:opencode] using binary: {}", bin);
            }
        } else {
            warn!("[desktop:opencode] OpenCode CLI not found - app will run in limited mode");
        }

        let mut args = vec![
            "serve".to_string(),
            "--port".to_string(),
            desired_port.to_string(),
        ];
        if let Ok(config) = std::env::var("OPENCHAMBER_OPENCODE_CONFIG") {
            if !config.is_empty() {
                args.push("--config".to_string());
                args.push(config);
            }
        }

        let env = build_augmented_env();
        let working_dir = initial_dir
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

        info!(
            "[desktop:opencode] Initial working directory: {:?}",
            working_dir
        );

        Self {
            binary,
            args,
            env,
            working_dir: Arc::new(RwLock::new(working_dir)),
            desired_port,
            child: Arc::new(Mutex::new(None)),
            port: Arc::new(RwLock::new(None)),
            api_prefix: Arc::new(RwLock::new(String::new())),
            is_ready: Arc::new(AtomicBool::new(false)),
            shutting_down: Arc::new(AtomicBool::new(false)),
            http_client: Client::builder()
                .timeout(Duration::from_secs(2))
                .build()
                .unwrap(),
        }
    }

    pub fn is_cli_available(&self) -> bool {
        self.binary.is_some()
    }

    pub async fn ensure_running(&self) -> Result<()> {
        if self.binary.is_none() {
            return Err(anyhow!("OpenCode CLI is not available"));
        }

        let mut guard = self.child.lock().await;
        if let Some(child) = guard.as_mut() {
            if child.try_wait()?.is_none() && self.is_ready.load(Ordering::SeqCst) {
                return Ok(());
            }
        }

        self.is_ready.store(false, Ordering::SeqCst);
        let child = self.spawn_process().await?;
        *guard = Some(child);
        drop(guard);

        // Wait for port detection from logs
        if self.desired_port == 0 {
            self.wait_for_port_detection().await?;
        }

        // Detect API prefix early so proxy can forward correctly
        let _ = self.detect_api_prefix().await;

        // Wait for OpenCode to become ready by polling endpoints
        self.wait_for_ready().await?;

        self.is_ready.store(true, Ordering::SeqCst);
        if let Some(port) = self.current_port() {
            info!("[desktop:opencode] ready on port {port}");
        }
        Ok(())
    }

    pub async fn restart(&self) -> Result<()> {
        info!("[desktop:opencode] restarting...");
        self.is_ready.store(false, Ordering::SeqCst);

        self.graceful_stop().await?;

        // Brief delay to let OS release resources
        tokio::time::sleep(Duration::from_millis(250)).await;

        // Reset state
        if self.desired_port == 0 {
            *self.port.write() = None;
        }
        *self.api_prefix.write() = String::new();

        self.ensure_running().await
    }

    pub async fn shutdown(&self) -> Result<()> {
        self.shutting_down.store(true, Ordering::SeqCst);
        self.is_ready.store(false, Ordering::SeqCst);
        self.graceful_stop().await
    }

    pub async fn set_working_directory(&self, new_dir: PathBuf) -> Result<()> {
        *self.working_dir.write() = new_dir;
        Ok(())
    }

    pub fn get_working_directory(&self) -> PathBuf {
        self.working_dir.read().clone()
    }

    async fn detect_api_prefix(&self) -> Result<()> {
        let Some(port) = self.current_port() else {
            return Err(anyhow!("Cannot detect API prefix without port"));
        };

        // Try empty prefix first (OpenCode default), then /api (some installations)
        let candidates = ["", "/api"];
        for candidate in candidates {
            let base = if candidate.is_empty() {
                format!("http://127.0.0.1:{port}")
            } else {
                format!("http://127.0.0.1:{port}{candidate}")
            };

            let url = format!("{base}/config");
            match self.http_client.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    // Validate it's actually JSON config, not HTML
                    if let Ok(text) = resp.text().await {
                        if text.trim().starts_with('{') || text.trim().starts_with('[') {
                            info!("[desktop:opencode] Detected API prefix: {:?}", candidate);
                            *self.api_prefix.write() = normalize_api_prefix(candidate);
                            return Ok(());
                        }
                    }
                }
                _ => continue,
            }
        }

        info!("[desktop:opencode] No API prefix detected, using empty prefix");
        *self.api_prefix.write() = String::new();
        Ok(())
    }

    pub fn current_port(&self) -> Option<u16> {
        *self.port.read()
    }

    pub fn api_prefix(&self) -> String {
        self.api_prefix.read().clone()
    }

    pub fn is_ready(&self) -> bool {
        self.is_ready.load(Ordering::SeqCst)
    }

    pub fn is_shutting_down(&self) -> bool {
        self.shutting_down.load(Ordering::SeqCst)
    }

    pub async fn is_child_running(&self) -> Result<bool> {
        let mut guard = self.child.lock().await;
        if let Some(child) = guard.as_mut() {
            match child.try_wait()? {
                None => return Ok(true),
                Some(_status) => {
                    *guard = None;
                    self.is_ready.store(false, Ordering::SeqCst);
                    return Ok(false);
                }
            }
        }
        Ok(false)
    }

    pub fn rewrite_path(&self, incoming_path: &str) -> String {
        // Strip /api prefix to get OpenCode path
        let result = incoming_path
            .strip_prefix("/api")
            .map(|rest| if rest.is_empty() { "/" } else { rest })
            .unwrap_or(incoming_path)
            .to_string();

        debug!(
            "[opencode_manager] rewrite_path: '{}' -> '{}'",
            incoming_path, result
        );
        result
    }

    async fn spawn_process(&self) -> Result<Child> {
        let binary = self
            .binary
            .as_ref()
            .ok_or_else(|| anyhow!("Cannot spawn process: OpenCode CLI is not available"))?;

        info!("[desktop:opencode] launching {} {:?}", binary, self.args);

        let working_dir = self.working_dir.read().clone();
        let mut cmd = Command::new(binary);
        cmd.args(&self.args)
            .current_dir(&working_dir)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(false);

        for (key, value) in &self.env {
            cmd.env(key, value);
        }

        let mut child = cmd.spawn().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                anyhow!(
                    "OpenCode binary '{}' not found. Set OPENCODE_BINARY or ensure it's in PATH.",
                    binary
                )
            } else {
                anyhow!("Failed to spawn OpenCode: {}", e)
            }
        })?;

        // Set port immediately if pre-configured
        if self.desired_port > 0 {
            *self.port.write() = Some(self.desired_port);
        }

        // Wait for first signal (stdout/stderr) within 750ms to confirm startup
        let first_signal_received = Arc::new(AtomicBool::new(false));

        if let Some(stdout) = child.stdout.take() {
            let signal_flag = first_signal_received.clone();
            self.spawn_output_reader(stdout, "stdout", move || {
                signal_flag.store(true, Ordering::SeqCst);
            });
        }

        if let Some(stderr) = child.stderr.take() {
            let signal_flag = first_signal_received.clone();
            self.spawn_output_reader(stderr, "stderr", move || {
                signal_flag.store(true, Ordering::SeqCst);
            });
        }

        // Wait for first signal or timeout
        let start = std::time::Instant::now();
        while start.elapsed() < Duration::from_millis(FIRST_SIGNAL_TIMEOUT_MS) {
            if first_signal_received.load(Ordering::SeqCst) {
                break;
            }
            if let Ok(Some(_)) = child.try_wait() {
                return Err(anyhow!("OpenCode process exited immediately after spawn"));
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }

        Ok(child)
    }

    fn spawn_output_reader<F>(
        &self,
        stream: impl tokio::io::AsyncRead + Unpin + Send + 'static,
        label: &'static str,
        on_first_line: F,
    ) where
        F: FnOnce() + Send + 'static,
    {
        let manager = self.clone();
        let first_line_flag = Arc::new(Mutex::new(Some(on_first_line)));

        tauri::async_runtime::spawn(async move {
            let reader = BufReader::new(stream);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                // Trigger first signal callback
                if let Some(callback) = first_line_flag.lock().await.take() {
                    callback();
                }

                debug!("[opencode:{label}] {line}");
                manager.ingest_output_line(&line);
            }
        });
    }

    fn ingest_output_line(&self, line: &str) {
        if let Some(captures) = URL_REGEX.captures(line) {
            if let Some(port_match) = captures
                .name("port")
                .and_then(|m| m.as_str().parse::<u16>().ok())
            {
                *self.port.write() = Some(port_match);
            }

            if let Some(path_match) = captures.name("path") {
                let value = path_match.as_str();
                if !value.is_empty() && value != "/" {
                    *self.api_prefix.write() = value.to_string();
                }
            }
        }
    }

    async fn wait_for_port_detection(&self) -> Result<()> {
        let start = std::time::Instant::now();
        let timeout_duration = Duration::from_secs(15);

        while start.elapsed() < timeout_duration {
            if self.current_port().is_some() {
                return Ok(());
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        Err(anyhow!("OpenCode did not report port within 15 seconds"))
    }

    async fn wait_for_ready(&self) -> Result<()> {
        let Some(port) = self.current_port() else {
            return Err(anyhow!("Cannot check readiness without port"));
        };

        let deadline = tokio::time::Instant::now() + Duration::from_millis(READY_CHECK_TIMEOUT_MS);
        let mut last_error: Option<String> = None;

        while tokio::time::Instant::now() < deadline {
            let api_prefix = self.api_prefix();

            // Try /config, /agent endpoints
            match self.check_endpoints(port, &api_prefix).await {
                Ok(()) => {
                    return Ok(());
                }
                Err(e) => {
                    last_error = Some(e.to_string());
                }
            }

            tokio::time::sleep(Duration::from_millis(READY_CHECK_INTERVAL_MS)).await;
        }

        Err(anyhow!(
            "OpenCode not ready after {}ms: {}",
            READY_CHECK_TIMEOUT_MS,
            last_error.unwrap_or_else(|| "no error details".to_string())
        ))
    }

    async fn check_endpoints(&self, port: u16, prefix: &str) -> Result<()> {
        let base_url = format!("http://127.0.0.1:{port}{prefix}");

        let config_url = format!("{base_url}/config");
        let agent_url = format!("{base_url}/agent");

        let (config_resp, agent_resp) = tokio::join!(
            self.http_client.get(&config_url).send(),
            self.http_client.get(&agent_url).send()
        );

        let config_resp = config_resp?;
        if !config_resp.status().is_success() {
            return Err(anyhow!("/config returned {}", config_resp.status()));
        }

        let agent_resp = agent_resp?;
        if !agent_resp.status().is_success() {
            return Err(anyhow!("/agent returned {}", agent_resp.status()));
        }

        Ok(())
    }

    async fn graceful_stop(&self) -> Result<()> {
        let mut guard = self.child.lock().await;
        let Some(mut child) = guard.take() else {
            return Ok(());
        };

        if child.try_wait()?.is_some() {
            // Already exited
            return Ok(());
        }

        // SIGTERM
        #[cfg(unix)]
        {
            use nix::{
                sys::signal::{kill, Signal},
                unistd::Pid,
            };
            if let Some(id) = child.id() {
                let _ = kill(Pid::from_raw(id as i32), Signal::SIGTERM);
                info!("[desktop:opencode] sent SIGTERM");
            }
        }
        #[cfg(windows)]
        {
            let _ = child.kill().await;
        }

        // Wait 3 seconds for graceful exit
        match timeout(Duration::from_secs(3), child.wait()).await {
            Ok(_) => {
                info!("[desktop:opencode] exited gracefully");
                return Ok(());
            }
            Err(_) => {
                warn!("[desktop:opencode] did not exit after SIGTERM, sending SIGKILL");
            }
        }

        // SIGKILL
        let _ = child.kill().await;

        match timeout(Duration::from_secs(2), child.wait()).await {
            Ok(_) => {
                info!("[desktop:opencode] exited after SIGKILL");
            }
            Err(_) => {
                warn!("[desktop:opencode] unresponsive after SIGKILL, continuing anyway");
            }
        }

        Ok(())
    }
}

/// Check if CLI binary exists (can be called dynamically for polling)
pub fn check_cli_exists() -> bool {
    if std::env::var("OPENCHAMBER_DISABLE_CLI").is_ok() {
        return false;
    }
    resolve_opencode_binary().is_some()
}

fn resolve_opencode_binary() -> Option<String> {
    if std::env::var("OPENCHAMBER_DISABLE_CLI").is_ok() {
        return None;
    }

    if let Ok(value) = std::env::var("OPENCODE_BINARY") {
        if !value.is_empty() && Path::new(&value).exists() {
            info!(
                "[desktop:opencode] using binary from OPENCODE_BINARY env: {}",
                value
            );
            return Some(value);
        }
    }

    let shell_env = detect_shell_env();

    if let Some(ref binary) = shell_env.opencode_binary {
        if Path::new(binary).exists() {
            info!(
                "[desktop:opencode] using binary from shell OPENCODE_BINARY: {}",
                binary
            );
            return Some(binary.clone());
        }
    }

    if let Some(ref login_path) = shell_env.path {
        for dir in login_path.split(':') {
            let candidate = format!("{}/opencode", dir);
            if Path::new(&candidate).exists() {
                info!("[desktop:opencode] found binary in PATH: {}", candidate);
                return Some(candidate);
            }
        }
    }

    if let Some(home) = dirs::home_dir() {
        let fallback = home.join(".opencode/bin/opencode");
        if fallback.exists() {
            info!(
                "[desktop:opencode] found binary in fallback location: {:?}",
                fallback
            );
            return Some(fallback.to_string_lossy().to_string());
        }
    }

    warn!("[desktop:opencode] opencode binary not found");
    None
}

fn build_augmented_env() -> HashMap<String, String> {
    let mut env: HashMap<String, String> = std::env::vars().collect();
    if let Ok(login_path) = detect_login_shell_path() {
        let current = env.get("PATH").cloned().unwrap_or_default();
        env.insert("PATH".to_string(), merge_paths(&login_path, &current));
    }
    env
}

fn merge_paths(login_path: &str, current: &str) -> String {
    let mut segments = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for part in login_path.split(':').chain(current.split(':')) {
        if part.is_empty() || seen.contains(part) {
            continue;
        }
        seen.insert(part.to_string());
        segments.push(part);
    }

    segments.join(":")
}

#[derive(Default)]
struct ShellEnv {
    path: Option<String>,
    opencode_binary: Option<String>,
}

#[cfg(target_os = "macos")]
fn get_user_shell() -> Option<String> {
    use std::process::Command;

    let username =
        dirs::home_dir().and_then(|p| p.file_name().map(|s| s.to_string_lossy().to_string()))?;

    let output = Command::new("dscl")
        .args([".", "-read", &format!("/Users/{}", username), "UserShell"])
        .output()
        .ok()?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        stdout.split(':').nth(1).map(|s| s.trim().to_string())
    } else {
        None
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn get_user_shell() -> Option<String> {
    std::env::var("SHELL").ok()
}

#[cfg(not(unix))]
fn get_user_shell() -> Option<String> {
    None
}

fn build_shell_env_command(shell: &str) -> Vec<String> {
    let shell_name = std::path::Path::new(shell)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("sh");

    match shell_name {
        "nu" | "nushell" => vec![
            "-l".to_string(),
            "-i".to_string(),
            "-c".to_string(),
            "echo $\"__PATH__=($env.PATH | str join (char esep))\"; echo $\"__OPENCODE_BINARY__=($env.OPENCODE_BINARY? | default '')\"".to_string(),
        ],
        "bash" => vec![
            "-lic".to_string(),
            "source ~/.bashrc 2>/dev/null; echo \"__PATH__=$PATH\"; echo \"__OPENCODE_BINARY__=$OPENCODE_BINARY\"".to_string(),
        ],
        _ => vec![
            "-lic".to_string(),
            "echo \"__PATH__=$PATH\"; echo \"__OPENCODE_BINARY__=$OPENCODE_BINARY\"".to_string(),
        ],
    }
}

fn detect_shell_env() -> ShellEnv {
    #[cfg(not(unix))]
    {
        ShellEnv::default()
    }
    #[cfg(unix)]
    {
        use std::process::Command;

        let shell = get_user_shell().unwrap_or_else(|| "/bin/zsh".into());
        info!("[desktop:opencode] detected user shell: {}", shell);
        let args = build_shell_env_command(&shell);
        info!("[desktop:opencode] shell args: {:?}", args);

        let output = match Command::new(&shell).args(&args).output() {
            Ok(o) => o,
            Err(e) => {
                warn!("[desktop:opencode] failed to run shell {}: {}", shell, e);
                return ShellEnv::default();
            }
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            warn!(
                "[desktop:opencode] shell env detection failed for {}, stderr: {}",
                shell, stderr
            );
            return ShellEnv::default();
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        info!("[desktop:opencode] shell stdout length: {}", stdout.len());
        let mut env = ShellEnv::default();

        for line in stdout.lines() {
            if let Some(path) = line.strip_prefix("__PATH__=") {
                if !path.is_empty() {
                    env.path = Some(path.to_string());
                }
            } else if let Some(binary) = line.strip_prefix("__OPENCODE_BINARY__=") {
                if !binary.is_empty() {
                    env.opencode_binary = Some(binary.to_string());
                }
            }
        }

        info!(
            "[desktop:opencode] parsed path exists: {}",
            env.path.is_some()
        );
        env
    }
}

fn detect_login_shell_path() -> Result<String> {
    detect_shell_env()
        .path
        .ok_or_else(|| anyhow!("shell PATH detection failed"))
}
