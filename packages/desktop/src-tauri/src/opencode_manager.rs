use anyhow::{anyhow, Result};
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
    binary: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    working_dir: PathBuf,
    desired_port: u16,
    child: Arc<Mutex<Option<Child>>>,
    port: Arc<RwLock<Option<u16>>>,
    api_prefix: Arc<RwLock<String>>,
    is_ready: Arc<AtomicBool>,
    shutting_down: Arc<AtomicBool>,
    http_client: Client,
}

impl OpenCodeManager {
    pub fn new() -> Result<Self> {
        let desired_port = std::env::var("OPENCHAMBER_OPENCODE_PORT")
            .ok()
            .and_then(|raw| raw.parse::<u16>().ok())
            .unwrap_or(0);

        let binary = resolve_opencode_binary()?;

        if !Path::new(&binary).is_absolute() {
            println!("[desktop:opencode] using PATH-resolved binary: {}", binary);
        } else if !Path::new(&binary).exists() {
            return Err(anyhow!("OpenCode binary not found at: {}", binary));
        }

        let mut args = vec!["serve".to_string(), "--port".to_string(), desired_port.to_string()];
        if let Ok(config) = std::env::var("OPENCHAMBER_OPENCODE_CONFIG") {
            if !config.is_empty() {
                args.push("--config".to_string());
                args.push(config);
            }
        }

        let env = build_augmented_env();
        let working_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

        Ok(Self {
            binary,
            args,
            env,
            working_dir,
            desired_port,
            child: Arc::new(Mutex::new(None)),
            port: Arc::new(RwLock::new(None)),
            api_prefix: Arc::new(RwLock::new(String::new())),
            is_ready: Arc::new(AtomicBool::new(false)),
            shutting_down: Arc::new(AtomicBool::new(false)),
            http_client: Client::builder()
                .timeout(Duration::from_secs(5))
                .build()
                .unwrap(),
        })
    }

    pub async fn ensure_running(&self) -> Result<()> {
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

        // Wait for OpenCode to become ready by polling endpoints
        self.wait_for_ready().await?;

        self.is_ready.store(true, Ordering::SeqCst);
        println!("[desktop:opencode] ready on port {}", self.current_port().unwrap());
        Ok(())
    }

    pub async fn restart(&self) -> Result<()> {
        println!("[desktop:opencode] restarting...");
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

    pub fn current_port(&self) -> Option<u16> {
        *self.port.read()
    }

    pub fn api_prefix(&self) -> String {
        self.api_prefix.read().clone()
    }

    pub fn rewrite_path(&self, incoming_path: &str) -> String {
        let suffix = incoming_path
            .strip_prefix("/api")
            .map(|rest| if rest.is_empty() { "/" } else { rest })
            .unwrap_or(incoming_path);

        let prefix = self.api_prefix();
        if prefix.is_empty() {
            suffix.to_string()
        } else if suffix.starts_with('/') {
            format!("{prefix}{suffix}")
        } else {
            format!("{prefix}/{suffix}")
        }
    }

    async fn spawn_process(&self) -> Result<Child> {
        println!("[desktop:opencode] launching {} {:?}", self.binary, self.args);

        let mut cmd = Command::new(&self.binary);
        cmd.args(&self.args)
            .current_dir(&self.working_dir)
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
                    self.binary
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

    fn spawn_output_reader<F>(&self, stream: impl tokio::io::AsyncRead + Unpin + Send + 'static, label: &'static str, on_first_line: F)
    where
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

                println!("[opencode:{label}] {line}");
                manager.ingest_output_line(&line);
            }
        });
    }

    fn ingest_output_line(&self, line: &str) {
        if let Some(captures) = URL_REGEX.captures(line) {
            if let Some(port_match) = captures.name("port").and_then(|m| m.as_str().parse::<u16>().ok()) {
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

            // Try /health, /config, /agent endpoints
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

        // Check /health
        let health_url = format!("{base_url}/health");
        let health_resp = self.http_client.get(&health_url).send().await?;
        if !health_resp.status().is_success() {
            return Err(anyhow!("/health returned {}", health_resp.status()));
        }

        // Check /config
        let config_url = format!("{base_url}/config");
        let config_resp = self.http_client.get(&config_url).send().await?;
        if !config_resp.status().is_success() {
            return Err(anyhow!("/config returned {}", config_resp.status()));
        }

        // Check /agent
        let agent_url = format!("{base_url}/agent");
        let agent_resp = self.http_client.get(&agent_url).send().await?;
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
            use nix::{sys::signal::{kill, Signal}, unistd::Pid};
            if let Some(id) = child.id() {
                let _ = kill(Pid::from_raw(id as i32), Signal::SIGTERM);
                println!("[desktop:opencode] sent SIGTERM");
            }
        }
        #[cfg(windows)]
        {
            let _ = child.kill().await;
        }

        // Wait 3 seconds for graceful exit
        match timeout(Duration::from_secs(3), child.wait()).await {
            Ok(_) => {
                println!("[desktop:opencode] exited gracefully");
                return Ok(());
            }
            Err(_) => {
                println!("[desktop:opencode] did not exit after SIGTERM, sending SIGKILL");
            }
        }

        // SIGKILL
        let _ = child.kill().await;

        // Wait up to 5 seconds for hard kill
        match timeout(Duration::from_secs(5), child.wait()).await {
            Ok(_) => {
                println!("[desktop:opencode] exited after SIGKILL");
            }
            Err(_) => {
                println!("[desktop:opencode] unresponsive after SIGKILL, continuing anyway");
            }
        }

        Ok(())
    }
}

fn resolve_opencode_binary() -> Result<String> {
    let env_candidates = [
        "OPENCODE_BINARY",
        "OPENCHAMBER_BINARY",
        "OPENCODE_PATH",
        "OPENCHAMBER_OPENCODE_PATH",
    ];

    for key in env_candidates {
        if let Ok(value) = std::env::var(key) {
            if !value.is_empty() && Path::new(&value).exists() {
                println!("[desktop:opencode] using binary from {}: {}", key, value);
                return Ok(value);
            }
        }
    }

    // Check common installation paths for macOS
    let path_candidates = [
        "/opt/homebrew/bin/opencode",
        "/usr/local/bin/opencode",
        "/usr/bin/opencode",
    ];

    for candidate in path_candidates {
        if Path::new(candidate).exists() {
            println!("[desktop:opencode] found binary at {}", candidate);
            return Ok(candidate.to_string());
        }
    }

    println!("[desktop:opencode] falling back to PATH resolution for 'opencode'");
    Ok("opencode".to_string())
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

fn detect_login_shell_path() -> Result<String> {
    #[cfg(not(unix))]
    {
        Err(anyhow!("login shell path unsupported"))
    }
    #[cfg(unix)]
    {
        use std::process::Command;
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let output = Command::new(shell)
            .arg("-lc")
            .arg("echo -n $PATH")
            .output()?;
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(anyhow!("shell PATH detection failed"))
        }
    }
}
