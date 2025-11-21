use serde::Deserialize;
use serde_json::Value;
use tauri::{Emitter, State, Window};

use crate::DesktopRuntime;

#[tauri::command]
pub async fn opencode_events_snapshot(state: State<'_, DesktopRuntime>) -> Result<Vec<Value>, String> {
    let manager = state.sse_manager.lock().clone();
    if let Some(mgr) = manager {
        Ok(mgr.replay_buffer())
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub async fn opencode_events_subscribe(window: Window, state: State<'_, DesktopRuntime>) -> Result<(), String> {
    if let Some(manager) = state.sse_manager.lock().as_ref() {
        manager.increment_subscribers();
        // Replay buffer to the new subscriber only
        for payload in manager.replay_buffer() {
            let _ = window.emit("opencode:event", payload);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn opencode_events_unsubscribe(state: State<'_, DesktopRuntime>) -> Result<(), String> {
    if let Some(manager) = state.sse_manager.lock().as_ref() {
        manager.decrement_subscribers();
    }
    Ok(())
}

#[tauri::command]
pub async fn opencode_events_replay(window: Window, state: State<'_, DesktopRuntime>) -> Result<(), String> {
    if let Some(manager) = state.sse_manager.lock().as_ref() {
        for payload in manager.replay_buffer() {
            let _ = window.emit("opencode:event", payload);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn opencode_events_set_directory(
    state: State<'_, DesktopRuntime>,
    directory: Option<String>,
) -> Result<(), String> {
    if let Some(manager) = state.sse_manager.lock().as_ref() {
        manager.set_directory(directory);
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessagePayload {
    pub id: String,
    #[serde(alias = "providerID", alias = "providerId", alias = "provider_id")]
    pub provider_id: String,
    #[serde(alias = "modelID", alias = "modelId", alias = "model_id")]
    pub model_id: String,
    pub text: String,
    pub agent: Option<String>,
    pub files: Option<Vec<FilePartPayload>>,
    #[allow(dead_code)]
    pub message_id: Option<String>,
    pub directory: Option<String>,
}

#[derive(Deserialize)]
pub struct FilePartPayload {
    #[serde(rename = "type")]
    #[allow(dead_code)]
    pub kind: String,
    pub mime: String,
    pub filename: Option<String>,
    pub url: String,
}

#[derive(Deserialize)]
pub struct SessionCreatePayload {
    pub title: Option<String>,
    pub parent_id: Option<String>,
    pub directory: Option<String>,
}

#[derive(Deserialize)]
pub struct SessionUpdatePayload {
    pub id: String,
    pub title: Option<String>,
    pub directory: Option<String>,
}

#[tauri::command]
pub async fn opencode_session_list(
    state: State<'_, DesktopRuntime>,
    directory: Option<String>,
) -> Result<Vec<opencode_client::models::Session>, String> {
    let client = state.opencode_client();
    client
        .list_sessions(directory.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn opencode_session_get(
    state: State<'_, DesktopRuntime>,
    id: String,
    directory: Option<String>,
) -> Result<opencode_client::models::Session, String> {
    let client = state.opencode_client();
    client
        .get_session(&id, directory.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn opencode_session_delete(
    state: State<'_, DesktopRuntime>,
    id: String,
    directory: Option<String>,
) -> Result<bool, String> {
    let client = state.opencode_client();
    client
        .delete_session(&id, directory.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn opencode_session_messages(
    state: State<'_, DesktopRuntime>,
    id: String,
    limit: Option<i32>,
    directory: Option<String>,
) -> Result<Vec<opencode_client::models::SessionMessages200ResponseInner>, String> {
    let client = state.opencode_client();
    client
        .get_session_messages(&id, limit, directory.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn opencode_session_create(
    state: State<'_, DesktopRuntime>,
    payload: SessionCreatePayload,
) -> Result<opencode_client::models::Session, String> {
    let client = state.opencode_client();
    let request = opencode_client::models::SessionCreateRequest {
        parent_id: payload.parent_id.map(Into::into),
        title: payload.title.map(Into::into),
    };

    client
        .create_session(Some(request), payload.directory.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn opencode_session_update(
    state: State<'_, DesktopRuntime>,
    payload: SessionUpdatePayload,
) -> Result<opencode_client::models::Session, String> {
    let client = state.opencode_client();
    let request = opencode_client::models::SessionUpdateRequest {
        title: payload.title.map(Into::into),
    };

    client
        .update_session(&payload.id, Some(request), payload.directory.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn opencode_session_prompt(
    state: State<'_, DesktopRuntime>,
    payload: SendMessagePayload,
) -> Result<opencode_client::models::SessionPrompt200Response, String> {
    let client = state.opencode_client();
    use opencode_client::models::session_prompt_request_parts_inner::Type as PromptPartType;
    use opencode_client::models::SessionPromptRequestPartsInner;

    let mut parts: Vec<SessionPromptRequestPartsInner> = Vec::new();
    if !payload.text.trim().is_empty() {
        parts.push(SessionPromptRequestPartsInner {
            id: None,
            r#type: PromptPartType::Text,
            text: payload.text.clone(),
            synthetic: None,
            time: None,
            metadata: None,
            mime: "text/plain".to_string(),
            filename: None,
            url: "".to_string(),
            source: None,
            name: "user".to_string(),
            prompt: payload.text.clone(),
            description: String::new(),
            agent: payload.agent.clone().unwrap_or_else(|| "user".to_string()),
        });
    }
    if let Some(files) = payload.files {
        for file in files {
            parts.push(SessionPromptRequestPartsInner {
                id: None,
                r#type: PromptPartType::File,
                text: String::new(),
                synthetic: None,
                time: None,
                metadata: None,
                mime: file.mime,
                filename: file.filename,
                url: file.url,
                source: None,
                name: String::new(),
                prompt: String::new(),
                description: String::new(),
                agent: payload.agent.clone().unwrap_or_else(|| "user".to_string()),
            });
        }
    }

    let request = opencode_client::models::SessionPromptRequest {
        agent: payload.agent,
        // Keep server-generated message IDs; client-side optimistic IDs are not sent
        message_id: None,
        model: Some(Box::new(opencode_client::models::SessionSummarizeRequest {
            provider_id: payload.provider_id,
            model_id: payload.model_id,
        })),
        parts,
        no_reply: None,
        system: None,
        tools: None,
    };

    client
        .prompt_session(&payload.id, Some(request), payload.directory.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn opencode_session_command(
    state: State<'_, DesktopRuntime>,
    payload: SendMessagePayload,
) -> Result<opencode_client::models::SessionPrompt200Response, String> {
    let client = state.opencode_client();
    let request = opencode_client::models::SessionCommandRequest {
        agent: payload.agent,
        model: Some(payload.model_id),
        arguments: String::new(),
        command: payload.text,
        message_id: None,
    };

    client
        .command_session(&payload.id, Some(request), payload.directory.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn opencode_session_shell(
    state: State<'_, DesktopRuntime>,
    payload: SendMessagePayload,
) -> Result<opencode_client::models::AssistantMessage, String> {
    let client = state.opencode_client();
    let request = opencode_client::models::SessionShellRequest {
        agent: payload
            .agent
            .unwrap_or_else(|| "agent".to_string()),
        model: Some(Box::new(opencode_client::models::SessionSummarizeRequest {
            provider_id: payload.provider_id,
            model_id: payload.model_id,
        })),
        command: payload.text,
    };

    client
        .shell_session(&payload.id, Some(request), payload.directory.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn opencode_session_abort(
    state: State<'_, DesktopRuntime>,
    id: String,
    directory: Option<String>,
) -> Result<bool, String> {
    let client = state.opencode_client();
    client
        .abort_session(&id, directory.as_deref())
        .await
        .map_err(|err| err.to_string())
}
