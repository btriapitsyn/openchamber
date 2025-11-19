use tauri::{AppHandle, Runtime};
use tauri_plugin_notification::NotificationExt;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPayload {
    pub title: Option<String>,
    pub body: Option<String>,
}

#[tauri::command]
pub async fn notify_agent_completion<R: Runtime>(
    app: AppHandle<R>,
    payload: Option<NotificationPayload>
) -> Result<bool, String> {
    println!("[notifications] Command received. Payload: {:?}", payload.as_ref().map(|p| &p.title));
    
    let title = payload.as_ref().and_then(|p| p.title.as_deref()).unwrap_or("OpenCode Agent");
    let body = payload.as_ref().and_then(|p| p.body.as_deref()).unwrap_or("Task completed");

    match app.notification()
        .builder()
        .title(title)
        .body(body)
        .sound("Glass")
        .show() 
    {
        Ok(_) => {
            println!("[notifications] Notification sent successfully");
            Ok(true)
        },
        Err(e) => {
            println!("[notifications] Failed to show notification: {}", e);
            Err(e.to_string())
        }
    }
}
