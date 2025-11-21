pub(crate) mod sse;

use std::{sync::Arc, time::Duration};

use opencode_client::apis::{configuration::Configuration, default_api};
use opencode_client::models;
use tauri::AppHandle;
use tokio::sync::Mutex;
use anyhow::Result;

/// Thin facade over the generated OpenAPI client.
/// Adds directory injection and a shared reqwest client with timeouts.
#[derive(Clone)]
pub struct OpenCodeClient {
    #[allow(dead_code)]
    base_path: String,
    directory: Option<String>,
    config: Arc<Mutex<Configuration>>,
}

impl OpenCodeClient {
    pub fn new(base_path: impl Into<String>, directory: Option<String>, timeout: Duration) -> Result<Self> {
        let client = reqwest::Client::builder().timeout(timeout).build()?;
        let mut cfg = Configuration::new();
        cfg.base_path = base_path.into();
        cfg.client = client;

        Ok(Self {
            base_path: cfg.base_path.clone(),
            directory: directory.filter(|d| !d.is_empty()),
            config: Arc::new(Mutex::new(cfg)),
        })
    }

    fn current_directory(&self, override_dir: Option<&str>) -> Option<String> {
        override_dir
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(String::from)
            .or_else(|| self.directory.clone())
    }

    #[allow(dead_code)]
    pub async fn set_directory(&mut self, directory: Option<String>) {
        let mut cfg = self.config.lock().await;
        self.directory = directory;
        cfg.base_path = self.base_path.clone();
    }

    pub async fn list_sessions(&self, directory: Option<&str>) -> Result<Vec<models::Session>> {
        let cfg = self.config.lock().await;
        let dir = self.current_directory(directory);
        let res = default_api::session_list(&cfg, dir.as_deref()).await?;
        Ok(res)
    }

    pub async fn create_session(
        &self,
        request: Option<models::SessionCreateRequest>,
        directory: Option<&str>,
    ) -> Result<models::Session> {
        let cfg = self.config.lock().await;
        let dir = self.current_directory(directory);
        let res = default_api::session_create(&cfg, dir.as_deref(), request).await?;
        Ok(res)
    }

    pub async fn update_session(
        &self,
        session_id: &str,
        request: Option<models::SessionUpdateRequest>,
        directory: Option<&str>,
    ) -> Result<models::Session> {
        let cfg = self.config.lock().await;
        let dir = self.current_directory(directory);
        let res = default_api::session_update(&cfg, session_id, dir.as_deref(), request).await?;
        Ok(res)
    }

    pub async fn get_session(&self, session_id: &str, directory: Option<&str>) -> Result<models::Session> {
        let cfg = self.config.lock().await;
        let dir = self.current_directory(directory);
        let res = default_api::session_get(&cfg, session_id, dir.as_deref()).await?;
        Ok(res)
    }

    pub async fn delete_session(&self, session_id: &str, directory: Option<&str>) -> Result<bool> {
        let cfg = self.config.lock().await;
        let dir = self.current_directory(directory);
        let res = default_api::session_delete(&cfg, session_id, dir.as_deref()).await?;
        Ok(res)
    }

    pub async fn get_session_messages(
        &self,
        session_id: &str,
        limit: Option<i32>,
        directory: Option<&str>,
    ) -> Result<Vec<models::SessionMessages200ResponseInner>> {
        let cfg = self.config.lock().await;
        let dir = self.current_directory(directory);
        let limit_f = limit.map(|v| v as f64);
        let res = default_api::session_messages(&cfg, session_id, dir.as_deref(), limit_f).await?;
        Ok(res)
    }

    pub async fn prompt_session(
        &self,
        session_id: &str,
        request: Option<models::SessionPromptRequest>,
        directory: Option<&str>,
    ) -> Result<models::SessionPrompt200Response> {
        let cfg = self.config.lock().await;
        let dir = self.current_directory(directory);
        let res = default_api::session_prompt(&cfg, session_id, dir.as_deref(), request).await?;
        Ok(res)
    }

    pub async fn command_session(
        &self,
        session_id: &str,
        request: Option<models::SessionCommandRequest>,
        directory: Option<&str>,
    ) -> Result<models::SessionPrompt200Response> {
        let cfg = self.config.lock().await;
        let dir = self.current_directory(directory);
        let res = default_api::session_command(&cfg, session_id, dir.as_deref(), request).await?;
        Ok(res)
    }

    pub async fn shell_session(
        &self,
        session_id: &str,
        request: Option<models::SessionShellRequest>,
        directory: Option<&str>,
    ) -> Result<models::AssistantMessage> {
        let cfg = self.config.lock().await;
        let dir = self.current_directory(directory);
        let res = default_api::session_shell(&cfg, session_id, dir.as_deref(), request).await?;
        Ok(res)
    }

    pub async fn abort_session(&self, session_id: &str, directory: Option<&str>) -> Result<bool> {
        let cfg = self.config.lock().await;
        let dir = self.current_directory(directory);
        let res = default_api::session_abort(&cfg, session_id, dir.as_deref()).await?;
        Ok(res)
    }
}

/// Start the Rust-side SSE runner. Emits `opencode:event` into the Tauri event bus.
pub fn start_sse_runner(
    app_handle: AppHandle,
    base_path: String,
    directory: Option<String>,
) -> sse::SseManager {
    sse::SseManager::start(app_handle, base_path, directory)
}
