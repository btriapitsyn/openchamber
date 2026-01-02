use anyhow::{anyhow, Result};
use log::info;
use serde_json::Value;
use std::path::PathBuf;
use tokio::fs;

/// Get OpenCode data directory path (~/.local/share/opencode)
fn get_data_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Cannot determine home directory")
        .join(".local")
        .join("share")
        .join("opencode")
}

/// Get auth file path
fn get_auth_file() -> PathBuf {
    get_data_dir().join("auth.json")
}

/// Ensure data directory exists
async fn ensure_data_dir() -> Result<()> {
    let data_dir = get_data_dir();
    fs::create_dir_all(&data_dir).await?;
    Ok(())
}

/// Read auth.json file
pub async fn read_auth() -> Result<Value> {
    let auth_file = get_auth_file();

    if !auth_file.exists() {
        return Ok(Value::Object(serde_json::Map::new()));
    }

    let content = fs::read_to_string(&auth_file).await?;
    let trimmed = content.trim();

    if trimmed.is_empty() {
        return Ok(Value::Object(serde_json::Map::new()));
    }

    serde_json::from_str(trimmed).map_err(|e| anyhow!("Failed to parse auth file: {}", e))
}

/// Write auth.json file with backup
pub async fn write_auth(auth: &Value) -> Result<()> {
    ensure_data_dir().await?;

    let auth_file = get_auth_file();

    // Create backup before writing
    if auth_file.exists() {
        let file_name = auth_file
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| anyhow!("Invalid auth file name"))?;

        let backup_path = auth_file.with_file_name(format!("{file_name}.openchamber.backup"));
        fs::copy(&auth_file, &backup_path).await?;
        info!("Created auth backup: {}", backup_path.display());
    }

    let json_string = serde_json::to_string_pretty(auth)?;
    fs::write(&auth_file, json_string).await?;
    info!("Successfully wrote auth file");

    Ok(())
}

/// Remove provider auth entry from auth.json
pub async fn remove_provider_auth(provider_id: &str) -> Result<bool> {
    if provider_id.is_empty() {
        return Err(anyhow!("Provider ID is required"));
    }

    let mut auth = read_auth().await?;

    let auth_obj = auth
        .as_object_mut()
        .ok_or_else(|| anyhow!("Auth file is not a valid JSON object"))?;

    if !auth_obj.contains_key(provider_id) {
        info!(
            "Provider {} not found in auth file, nothing to remove",
            provider_id
        );
        return Ok(false);
    }

    auth_obj.remove(provider_id);
    write_auth(&auth).await?;
    info!("Removed provider auth: {}", provider_id);

    Ok(true)
}
