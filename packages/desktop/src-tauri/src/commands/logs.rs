use crate::logging::log_file_path;
use serde::Serialize;
use tokio::fs;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopLogFile {
    pub file_name: String,
    pub content: String,
}

#[tauri::command]
pub async fn fetch_desktop_logs() -> Result<DesktopLogFile, String> {
    let path = log_file_path().ok_or_else(|| "Log location unavailable".to_string())?;
    let content = fs::read_to_string(&path)
        .await
        .map_err(|err| format!("Failed to read log file: {err}"))?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("desktop.log")
        .to_string();

    Ok(DesktopLogFile { file_name, content })
}
