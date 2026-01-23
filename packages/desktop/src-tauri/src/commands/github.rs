use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use tauri::State;
use tokio::fs;
use tokio::process::Command;

use crate::DesktopRuntime;

const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const API_USER_URL: &str = "https://api.github.com/user";
const API_EMAILS_URL: &str = "https://api.github.com/user/emails";
const API_PULLS_URL_PREFIX: &str = "https://api.github.com/repos";
const API_GRAPHQL_URL: &str = "https://api.github.com/graphql";
const DEVICE_GRANT_TYPE: &str = "urn:ietf:params:oauth:grant-type:device_code";

const DEFAULT_GITHUB_CLIENT_ID: &str = "Ov23liNd8TxDcMXtAHHM";
const DEFAULT_GITHUB_SCOPES: &str = "repo read:org workflow read:user user:email";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepoRef {
    owner: String,
    repo: String,
    url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubChecksSummary {
    state: String,
    total: u64,
    success: u64,
    failure: u64,
    pending: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestSummary {
    number: u64,
    title: String,
    url: String,
    state: String,
    draft: bool,
    base: String,
    head: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    head_sha: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mergeable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mergeable_state: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestStatus {
    connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    repo: Option<GitHubRepoRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pr: Option<GitHubPullRequestSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    checks: Option<GitHubChecksSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    can_merge: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestMergeResult {
    merged: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestReadyResult {
    ready: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubUserSummary {
    login: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    avatar_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    email: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubAuthStatus {
    connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    user: Option<GitHubUserSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    scope: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDeviceFlowStart {
    device_code: String,
    user_code: String,
    verification_uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    verification_uri_complete: Option<String>,
    expires_in: u64,
    interval: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    scope: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDeviceFlowCompleteSuccess {
    connected: bool,
    user: GitHubUserSummary,
    #[serde(skip_serializing_if = "Option::is_none")]
    scope: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDeviceFlowCompletePending {
    connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum GitHubDeviceFlowComplete {
    Success(GitHubDeviceFlowCompleteSuccess),
    Pending(GitHubDeviceFlowCompletePending),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDisconnectResult {
    removed: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StoredAuth {
    access_token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    scope: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    token_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    user: Option<GitHubUserSummary>,
}

#[derive(Debug, Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    #[serde(default)]
    verification_uri_complete: Option<String>,
    expires_in: u64,
    interval: u64,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    #[serde(default)]
    access_token: Option<String>,
    #[serde(default)]
    scope: Option<String>,
    #[serde(default)]
    token_type: Option<String>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiUserResponse {
    login: String,
    id: u64,
    #[serde(default)]
    avatar_url: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PrListItem {
    number: u64,
}

#[derive(Debug, Deserialize)]
struct PullRef {
    #[serde(rename = "ref")]
    ref_name: String,
    sha: String,
}

#[derive(Debug, Deserialize)]
struct PullBaseRef {
    #[serde(rename = "ref")]
    ref_name: String,
}

#[derive(Debug, Deserialize)]
struct PullDetailsResponse {
    number: u64,
    title: String,
    html_url: String,
    state: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    merged: bool,
    #[serde(default)]
    mergeable: Option<bool>,
    #[serde(default)]
    mergeable_state: Option<String>,
    head: PullRef,
    base: PullBaseRef,
    #[serde(default)]
    node_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CombinedStatusEntry {
    state: String,
}

#[derive(Debug, Deserialize)]
struct CombinedStatusResponse {
    #[serde(default)]
    statuses: Vec<CombinedStatusEntry>,
}

#[derive(Debug, Deserialize)]
struct CheckRunEntry {
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    conclusion: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CheckRunsResponse {
    #[serde(default)]
    check_runs: Vec<CheckRunEntry>,
}

#[derive(Debug, Deserialize)]
struct PermissionResponse {
    permission: String,
}

#[derive(Debug, Serialize)]
struct PullCreateRequest<'a> {
    title: &'a str,
    head: &'a str,
    base: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    body: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    draft: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct PullCreateResponse {
    number: u64,
    title: String,
    html_url: String,
    state: String,
    #[serde(default)]
    draft: bool,
    head: PullRef,
    base: PullBaseRef,
    #[serde(default)]
    mergeable: Option<bool>,
    #[serde(default)]
    mergeable_state: Option<String>,
}

#[derive(Debug, Serialize)]
struct PullMergeRequest<'a> {
    merge_method: &'a str,
}

#[derive(Debug, Deserialize)]
struct PullMergeResponse {
    merged: bool,
    #[serde(default)]
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiEmailEntry {
    email: String,
    #[serde(default)]
    primary: bool,
    #[serde(default)]
    verified: bool,
}

fn github_auth_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "No home directory".to_string())?;
    let mut dir = home;
    dir.push(".config");
    dir.push("openchamber");
    dir.push("github-auth.json");
    Ok(dir)
}

async fn read_auth_file() -> Option<StoredAuth> {
    let path = github_auth_path().ok()?;
    let bytes = fs::read(&path).await.ok()?;
    serde_json::from_slice::<StoredAuth>(&bytes).ok()
}

async fn write_auth_file(auth: &StoredAuth) -> Result<(), String> {
    let path = github_auth_path()?;
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent).await;
    }
    let bytes = serde_json::to_vec_pretty(auth).map_err(|e| e.to_string())?;
    fs::write(&path, bytes).await.map_err(|e| e.to_string())?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = std::fs::metadata(&path) {
            let mut perms = metadata.permissions();
            perms.set_mode(0o600);
            let _ = std::fs::set_permissions(&path, perms);
        }
    }

    Ok(())
}

async fn clear_auth_file() -> bool {
    let path = match github_auth_path() {
        Ok(p) => p,
        Err(_) => return false,
    };
    match fs::remove_file(&path).await {
        Ok(_) => true,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => true,
        Err(_) => false,
    }
}

fn read_string_setting(settings: &Value, key: &str) -> Option<String> {
    settings
        .get(key)?
        .as_str()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

async fn resolve_client_config(state: &DesktopRuntime) -> (String, String) {
    let settings = state
        .settings()
        .load()
        .await
        .unwrap_or(Value::Object(Default::default()));
    let client_id = read_string_setting(&settings, "githubClientId")
        .unwrap_or_else(|| DEFAULT_GITHUB_CLIENT_ID.to_string());
    let scopes = read_string_setting(&settings, "githubScopes")
        .unwrap_or_else(|| DEFAULT_GITHUB_SCOPES.to_string());
    (client_id, scopes)
}

async fn fetch_primary_email(access_token: &str) -> Result<Option<String>, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(API_EMAILS_URL)
        .header("Accept", "application/vnd.github+json")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "OpenChamber")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("unauthorized".to_string());
    }

    if !resp.status().is_success() {
        return Ok(None);
    }

    let list = resp
        .json::<Vec<ApiEmailEntry>>()
        .await
        .map_err(|e| e.to_string())?;

    let primary_verified = list
        .iter()
        .find(|e| e.primary && e.verified)
        .map(|e| e.email.clone());
    if primary_verified.is_some() {
        return Ok(primary_verified);
    }

    let any_verified = list.iter().find(|e| e.verified).map(|e| e.email.clone());
    Ok(any_verified)
}

async fn get_origin_remote_url(directory: &str) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(directory)
        .arg("remote")
        .arg("get-url")
        .arg("origin")
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn parse_github_remote_url(remote_url: &str) -> Option<GitHubRepoRef> {
    let trimmed = remote_url.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(rest) = trimmed.strip_prefix("git@github.com:") {
        let cleaned = rest.trim_end_matches(".git");
        let (owner, repo) = cleaned.split_once('/')?;
        if owner.is_empty() || repo.is_empty() {
            return None;
        }
        return Some(GitHubRepoRef {
            owner: owner.to_string(),
            repo: repo.to_string(),
            url: format!("https://github.com/{}/{}", owner, repo),
        });
    }

    if let Some(rest) = trimmed.strip_prefix("ssh://git@github.com/") {
        let cleaned = rest.trim_end_matches(".git");
        let (owner, repo) = cleaned.split_once('/')?;
        if owner.is_empty() || repo.is_empty() {
            return None;
        }
        return Some(GitHubRepoRef {
            owner: owner.to_string(),
            repo: repo.to_string(),
            url: format!("https://github.com/{}/{}", owner, repo),
        });
    }

    if let Ok(url) = url::Url::parse(trimmed) {
        if url.host_str() != Some("github.com") {
            return None;
        }
        let path = url.path().trim_matches('/').trim_end_matches(".git");
        let (owner, repo) = path.split_once('/')?;
        if owner.is_empty() || repo.is_empty() {
            return None;
        }
        return Some(GitHubRepoRef {
            owner: owner.to_string(),
            repo: repo.to_string(),
            url: format!("https://github.com/{}/{}", owner, repo),
        });
    }

    None
}

async fn resolve_repo_from_directory(directory: &str) -> Option<GitHubRepoRef> {
    let remote = get_origin_remote_url(directory).await?;
    parse_github_remote_url(&remote)
}

async fn github_get_json<T: for<'de> Deserialize<'de>>(
    url: &str,
    access_token: &str,
) -> Result<T, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "OpenChamber")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("unauthorized".to_string());
    }
    if !resp.status().is_success() {
        return Err(format!("GitHub request failed: {}", resp.status()));
    }
    resp.json::<T>().await.map_err(|e| e.to_string())
}

async fn github_post_json<T: for<'de> Deserialize<'de>, B: Serialize>(
    url: &str,
    access_token: &str,
    body: &B,
) -> Result<T, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(url)
        .header("Accept", "application/vnd.github+json")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "OpenChamber")
        .json(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("unauthorized".to_string());
    }
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("GitHub request failed: {} {}", status, text));
    }
    resp.json::<T>().await.map_err(|e| e.to_string())
}


async fn fetch_me(access_token: &str) -> Result<GitHubUserSummary, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(API_USER_URL)
        .header("Accept", "application/vnd.github+json")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "OpenChamber")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("unauthorized".to_string());
    }

    if !resp.status().is_success() {
        return Err(format!("GitHub /user failed: {}", resp.status()));
    }

    let payload = resp
        .json::<ApiUserResponse>()
        .await
        .map_err(|e| e.to_string())?;

    let email = match payload.email.clone() {
        Some(v) if !v.trim().is_empty() => Some(v),
        _ => fetch_primary_email(access_token).await.ok().flatten(),
    };

    Ok(GitHubUserSummary {
        login: payload.login,
        id: Some(payload.id),
        avatar_url: payload.avatar_url,
        name: payload.name,
        email,
    })
}

#[tauri::command]
pub async fn github_auth_status(
    _state: State<'_, DesktopRuntime>,
) -> Result<GitHubAuthStatus, String> {
    let stored = read_auth_file().await;
    let Some(stored) = stored else {
        return Ok(GitHubAuthStatus {
            connected: false,
            user: None,
            scope: None,
        });
    };

    if stored.access_token.trim().is_empty() {
        let _ = clear_auth_file().await;
        return Ok(GitHubAuthStatus {
            connected: false,
            user: None,
            scope: None,
        });
    }

    match fetch_me(&stored.access_token).await {
        Ok(user) => Ok(GitHubAuthStatus {
            connected: true,
            user: Some(user),
            scope: stored.scope,
        }),
        Err(err) if err == "unauthorized" => {
            let _ = clear_auth_file().await;
            Ok(GitHubAuthStatus {
                connected: false,
                user: None,
                scope: None,
            })
        }
        Err(err) => Err(err),
    }
}

#[tauri::command]
pub async fn github_auth_start(
    state: State<'_, DesktopRuntime>,
) -> Result<GitHubDeviceFlowStart, String> {
    let (client_id, scopes) = resolve_client_config(state.inner()).await;

    let client = reqwest::Client::new();
    let resp = client
        .post(DEVICE_CODE_URL)
        .header("Accept", "application/json")
        .header("User-Agent", "OpenChamber")
        .form(&[
            ("client_id", client_id.as_str()),
            ("scope", scopes.as_str()),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("GitHub device code failed: {}", resp.status()));
    }

    let payload = resp
        .json::<DeviceCodeResponse>()
        .await
        .map_err(|e| e.to_string())?;
    Ok(GitHubDeviceFlowStart {
        device_code: payload.device_code,
        user_code: payload.user_code,
        verification_uri: payload.verification_uri,
        verification_uri_complete: payload.verification_uri_complete,
        expires_in: payload.expires_in,
        interval: payload.interval,
        scope: Some(scopes),
    })
}

#[tauri::command]
pub async fn github_auth_complete(
    #[allow(non_snake_case)]
    deviceCode: String,
    state: State<'_, DesktopRuntime>,
) -> Result<GitHubDeviceFlowComplete, String> {
    let device_code = deviceCode;
    if device_code.trim().is_empty() {
        return Err("deviceCode is required".to_string());
    }

    let (client_id, _) = resolve_client_config(state.inner()).await;

    let client = reqwest::Client::new();
    let resp = client
        .post(ACCESS_TOKEN_URL)
        .header("Accept", "application/json")
        .header("User-Agent", "OpenChamber")
        .form(&[
            ("client_id", client_id.as_str()),
            ("device_code", device_code.as_str()),
            ("grant_type", DEVICE_GRANT_TYPE),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("GitHub token exchange failed: {}", resp.status()));
    }

    let payload = resp
        .json::<TokenResponse>()
        .await
        .map_err(|e| e.to_string())?;
    if let Some(error) = payload.error.clone() {
        return Ok(GitHubDeviceFlowComplete::Pending(
            GitHubDeviceFlowCompletePending {
                connected: false,
                status: Some(error.clone()),
                error: Some(payload.error_description.unwrap_or(error)),
            },
        ));
    }

    let access_token = payload.access_token.unwrap_or_default();
    if access_token.trim().is_empty() {
        return Err("Missing access_token from GitHub".to_string());
    }

    let user = fetch_me(&access_token).await.map_err(|e| {
        if e == "unauthorized" {
            "GitHub token invalid".to_string()
        } else {
            e
        }
    })?;

    let stored = StoredAuth {
        access_token: access_token.clone(),
        scope: payload.scope.clone(),
        token_type: payload.token_type.clone(),
        created_at: Some(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        ),
        user: Some(user.clone()),
    };
    write_auth_file(&stored).await?;

    Ok(GitHubDeviceFlowComplete::Success(
        GitHubDeviceFlowCompleteSuccess {
            connected: true,
            user,
            scope: payload.scope,
        },
    ))
}

#[tauri::command]
pub async fn github_auth_disconnect(
    _state: State<'_, DesktopRuntime>,
) -> Result<GitHubDisconnectResult, String> {
    let removed = clear_auth_file().await;
    Ok(GitHubDisconnectResult { removed })
}

#[tauri::command]
pub async fn github_me(_state: State<'_, DesktopRuntime>) -> Result<GitHubUserSummary, String> {
    let stored = read_auth_file().await;
    let Some(stored) = stored else {
        return Err("GitHub not connected".to_string());
    };
    match fetch_me(&stored.access_token).await {
        Ok(user) => Ok(user),
        Err(err) if err == "unauthorized" => {
            let _ = clear_auth_file().await;
            Err("GitHub token expired or revoked".to_string())
        }
        Err(err) => Err(err),
    }
}

#[tauri::command]
pub async fn github_pr_status(
    directory: String,
    branch: String,
    _state: State<'_, DesktopRuntime>,
) -> Result<GitHubPullRequestStatus, String> {
    let directory = directory.trim().to_string();
    let branch = branch.trim().to_string();
    if directory.is_empty() || branch.is_empty() {
        return Err("directory and branch are required".to_string());
    }

    let stored = read_auth_file().await;
    let Some(stored) = stored else {
        return Ok(GitHubPullRequestStatus {
            connected: false,
            repo: None,
            branch: Some(branch),
            pr: None,
            checks: None,
            can_merge: None,
        });
    };

    if stored.access_token.trim().is_empty() {
        let _ = clear_auth_file().await;
        return Ok(GitHubPullRequestStatus {
            connected: false,
            repo: None,
            branch: Some(branch),
            pr: None,
            checks: None,
            can_merge: None,
        });
    }

    let repo = resolve_repo_from_directory(&directory).await;
    let Some(repo) = repo else {
        return Ok(GitHubPullRequestStatus {
            connected: true,
            repo: None,
            branch: Some(branch),
            pr: None,
            checks: None,
            can_merge: Some(false),
        });
    };

    let head = format!("{}:{}", repo.owner, branch);
    let head_encoded = urlencoding::encode(&head);
    let list_url = format!(
        "{}/{}/{}/pulls?state=open&head={}&per_page=10",
        API_PULLS_URL_PREFIX, repo.owner, repo.repo, head_encoded
    );

    let list = github_get_json::<Vec<PrListItem>>(&list_url, &stored.access_token).await;
    let list = match list {
        Ok(v) => v,
        Err(err) if err == "unauthorized" => {
            let _ = clear_auth_file().await;
            return Ok(GitHubPullRequestStatus {
                connected: false,
                repo: None,
                branch: Some(branch),
                pr: None,
                checks: None,
                can_merge: None,
            });
        }
        Err(err) => return Err(err),
    };

    let Some(first) = list.first() else {
        return Ok(GitHubPullRequestStatus {
            connected: true,
            repo: Some(repo),
            branch: Some(branch),
            pr: None,
            checks: None,
            can_merge: Some(false),
        });
    };

    let pr_url = format!(
        "{}/{}/{}/pulls/{}",
        API_PULLS_URL_PREFIX, repo.owner, repo.repo, first.number
    );
    let pr = github_get_json::<PullDetailsResponse>(&pr_url, &stored.access_token).await?;

    // Checks summary: prefer check-runs (Actions), fallback to classic statuses
    let mut checks: Option<GitHubChecksSummary> = None;

    let check_runs_url = format!(
        "{}/{}/{}/commits/{}/check-runs",
        API_PULLS_URL_PREFIX, repo.owner, repo.repo, pr.head.sha
    );

    if let Ok(runs) = github_get_json::<CheckRunsResponse>(&check_runs_url, &stored.access_token).await {
        if !runs.check_runs.is_empty() {
            let mut success = 0;
            let mut failure = 0;
            let mut pending = 0;

            for run in runs.check_runs.iter() {
                let status = run.status.as_deref().unwrap_or("");
                let conclusion = run.conclusion.as_deref().unwrap_or("");
                if status == "queued" || status == "in_progress" {
                    pending += 1;
                    continue;
                }
                if conclusion.is_empty() {
                    pending += 1;
                    continue;
                }
                if conclusion == "success" || conclusion == "neutral" || conclusion == "skipped" {
                    success += 1;
                } else {
                    failure += 1;
                }
            }

            let total = success + failure + pending;
            let state = if failure > 0 {
                "failure"
            } else if pending > 0 {
                "pending"
            } else if total > 0 {
                "success"
            } else {
                "unknown"
            };
            checks = Some(GitHubChecksSummary {
                state: state.to_string(),
                total,
                success,
                failure,
                pending,
            });
        }
    }

    if checks.is_none() {
        let status_url = format!(
            "{}/{}/{}/commits/{}/status",
            API_PULLS_URL_PREFIX, repo.owner, repo.repo, pr.head.sha
        );
        if let Ok(status) = github_get_json::<CombinedStatusResponse>(&status_url, &stored.access_token).await {
            let mut success = 0;
            let mut failure = 0;
            let mut pending = 0;
            for s in status.statuses.iter() {
                match s.state.as_str() {
                    "success" => success += 1,
                    "failure" | "error" => failure += 1,
                    "pending" => pending += 1,
                    _ => {}
                }
            }
            let total = success + failure + pending;
            let state = if failure > 0 {
                "failure"
            } else if pending > 0 {
                "pending"
            } else if total > 0 {
                "success"
            } else {
                "unknown"
            };
            checks = Some(GitHubChecksSummary {
                state: state.to_string(),
                total,
                success,
                failure,
                pending,
            });
        }
    }

    // Permissions (best-effort)
    let mut can_merge = None;
    if let Some(user) = stored.user.as_ref() {
        if !user.login.is_empty() {
            let perm_url = format!(
                "{}/{}/{}/collaborators/{}/permission",
                API_PULLS_URL_PREFIX,
                repo.owner,
                repo.repo,
                urlencoding::encode(&user.login)
            );
            if let Ok(perm) = github_get_json::<PermissionResponse>(&perm_url, &stored.access_token).await {
                let p = perm.permission;
                can_merge = Some(p == "admin" || p == "maintain" || p == "write");
            }
        }
    }

    let state = if pr.merged {
        "merged"
    } else if pr.state == "closed" {
        "closed"
    } else {
        "open"
    };

    Ok(GitHubPullRequestStatus {
        connected: true,
        repo: Some(repo),
        branch: Some(branch),
        pr: Some(GitHubPullRequestSummary {
            number: pr.number,
            title: pr.title,
            url: pr.html_url,
            state: state.to_string(),
            draft: pr.draft,
            base: pr.base.ref_name,
            head: pr.head.ref_name,
            head_sha: Some(pr.head.sha),
            mergeable: pr.mergeable,
            mergeable_state: pr.mergeable_state,
        }),
        checks,
        can_merge,
    })
}

#[tauri::command]
pub async fn github_pr_create(
    directory: String,
    title: String,
    head: String,
    base: String,
    body: Option<String>,
    draft: Option<bool>,
    _state: State<'_, DesktopRuntime>,
) -> Result<GitHubPullRequestSummary, String> {
    let directory = directory.trim().to_string();
    let title = title.trim().to_string();
    let head = head.trim().to_string();
    let base = base.trim().to_string();
    if directory.is_empty() || title.is_empty() || head.is_empty() || base.is_empty() {
        return Err("directory, title, head, base are required".to_string());
    }

    let stored = read_auth_file().await;
    let Some(stored) = stored else {
        return Err("GitHub not connected".to_string());
    };
    if stored.access_token.trim().is_empty() {
        let _ = clear_auth_file().await;
        return Err("GitHub not connected".to_string());
    }

    let repo = resolve_repo_from_directory(&directory)
        .await
        .ok_or_else(|| "Unable to resolve GitHub repo from git remote".to_string())?;

    let url = format!("{}/{}/{}/pulls", API_PULLS_URL_PREFIX, repo.owner, repo.repo);
    let request = PullCreateRequest {
        title: &title,
        head: &head,
        base: &base,
        body: body.as_deref(),
        draft,
    };

    let created = github_post_json::<PullCreateResponse, _>(&url, &stored.access_token, &request).await?;

    Ok(GitHubPullRequestSummary {
        number: created.number,
        title: created.title,
        url: created.html_url,
        state: if created.state == "closed" {
            "closed".to_string()
        } else {
            "open".to_string()
        },
        draft: created.draft,
        base: created.base.ref_name,
        head: created.head.ref_name,
        head_sha: Some(created.head.sha),
        mergeable: created.mergeable,
        mergeable_state: created.mergeable_state,
    })
}

#[tauri::command]
pub async fn github_pr_merge(
    directory: String,
    number: u64,
    method: String,
    _state: State<'_, DesktopRuntime>,
) -> Result<GitHubPullRequestMergeResult, String> {
    let directory = directory.trim().to_string();
    let method = method.trim().to_string();
    if directory.is_empty() {
        return Err("directory is required".to_string());
    }
    if number == 0 {
        return Err("number is required".to_string());
    }

    let stored = read_auth_file().await;
    let Some(stored) = stored else {
        return Err("GitHub not connected".to_string());
    };
    if stored.access_token.trim().is_empty() {
        let _ = clear_auth_file().await;
        return Err("GitHub not connected".to_string());
    }

    let repo = resolve_repo_from_directory(&directory)
        .await
        .ok_or_else(|| "Unable to resolve GitHub repo from git remote".to_string())?;

    let url = format!(
        "{}/{}/{}/pulls/{}/merge",
        API_PULLS_URL_PREFIX, repo.owner, repo.repo, number
    );
    let merge_method = if method.is_empty() { "merge" } else { method.as_str() };
    let request = PullMergeRequest { merge_method };

    let client = reqwest::Client::new();
    let resp = client
        .put(url)
        .header("Accept", "application/vnd.github+json")
        .header("Authorization", format!("Bearer {}", stored.access_token))
        .header("User-Agent", "OpenChamber")
        .json(&request)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        let _ = clear_auth_file().await;
        return Err("GitHub token expired or revoked".to_string());
    }
    if resp.status() == reqwest::StatusCode::FORBIDDEN {
        return Err("Not authorized to merge this PR".to_string());
    }
    if resp.status() == reqwest::StatusCode::METHOD_NOT_ALLOWED
        || resp.status() == reqwest::StatusCode::CONFLICT
    {
        return Ok(GitHubPullRequestMergeResult {
            merged: false,
            message: Some("PR not mergeable".to_string()),
        });
    }
    if !resp.status().is_success() {
        return Err(format!("GitHub merge failed: {}", resp.status()));
    }

    let parsed = resp.json::<PullMergeResponse>().await.map_err(|e| e.to_string())?;
    Ok(GitHubPullRequestMergeResult {
        merged: parsed.merged,
        message: parsed.message,
    })
}

#[tauri::command]
pub async fn github_pr_ready(
    directory: String,
    number: u64,
    _state: State<'_, DesktopRuntime>,
) -> Result<GitHubPullRequestReadyResult, String> {
    let directory = directory.trim().to_string();
    if directory.is_empty() {
        return Err("directory is required".to_string());
    }
    if number == 0 {
        return Err("number is required".to_string());
    }

    let stored = read_auth_file().await;
    let Some(stored) = stored else {
        return Err("GitHub not connected".to_string());
    };
    if stored.access_token.trim().is_empty() {
        let _ = clear_auth_file().await;
        return Err("GitHub not connected".to_string());
    }

    let repo = resolve_repo_from_directory(&directory)
        .await
        .ok_or_else(|| "Unable to resolve GitHub repo from git remote".to_string())?;

    let pr_url = format!(
        "{}/{}/{}/pulls/{}",
        API_PULLS_URL_PREFIX, repo.owner, repo.repo, number
    );
    let pr = github_get_json::<PullDetailsResponse>(&pr_url, &stored.access_token).await?;
    let node_id = pr
        .node_id
        .ok_or_else(|| "Failed to resolve PR node id".to_string())?;

    if !pr.draft {
        return Ok(GitHubPullRequestReadyResult { ready: true });
    }

    let query = "mutation($pullRequestId: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) { pullRequest { id isDraft } } }";
    let payload = serde_json::json!({
        "query": query,
        "variables": { "pullRequestId": node_id }
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(API_GRAPHQL_URL)
        .header("Accept", "application/vnd.github+json")
        .header("Authorization", format!("Bearer {}", stored.access_token))
        .header("User-Agent", "OpenChamber")
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        let _ = clear_auth_file().await;
        return Err("GitHub token expired or revoked".to_string());
    }
    if resp.status() == reqwest::StatusCode::FORBIDDEN {
        return Err("Not authorized to mark PR ready".to_string());
    }
    if !resp.status().is_success() {
        return Err(format!("GitHub request failed: {}", resp.status()));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    if body.get("errors").is_some() {
        return Err("GitHub GraphQL error".to_string());
    }

    Ok(GitHubPullRequestReadyResult { ready: true })
}
