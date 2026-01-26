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
pub struct GitHubPullRequestHeadRepo {
    owner: String,
    repo: String,
    url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    clone_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestContextResult {
    connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    repo: Option<GitHubRepoRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pr: Option<GitHubPullRequestContext>,
    #[serde(skip_serializing_if = "Option::is_none")]
    issue_comments: Option<Vec<GitHubIssueComment>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    review_comments: Option<Vec<GitHubPullRequestReviewComment>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    files: Option<Vec<GitHubPullRequestFile>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    diff: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    checks: Option<GitHubChecksSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    check_runs: Option<Vec<GitHubCheckRun>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCheckRun {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    app: Option<GitHubCheckRunApp>,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    conclusion: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    details_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output: Option<GitHubCheckRunOutput>,
    #[serde(skip_serializing_if = "Option::is_none")]
    job: Option<GitHubCheckRunJob>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCheckRunApp {
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    slug: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCheckRunJob {
    #[serde(skip_serializing_if = "Option::is_none")]
    run_id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    job_id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    conclusion: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    steps: Option<Vec<GitHubCheckRunJobStep>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCheckRunJobStep {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    conclusion: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    number: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCheckRunOutput {
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestsListResult {
    connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    repo: Option<GitHubRepoRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    prs: Option<Vec<GitHubPullRequestContext>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    has_more: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestContext {
    #[serde(flatten)]
    summary: GitHubPullRequestSummary,
    #[serde(skip_serializing_if = "Option::is_none")]
    author: Option<GitHubUserSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    head_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    head_repo: Option<GitHubPullRequestHeadRepo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestFile {
    filename: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    additions: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    deletions: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    changes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    patch: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestReviewComment {
    id: u64,
    url: String,
    body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    author: Option<GitHubUserSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    line: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    position: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    updated_at: Option<String>,
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
pub struct GitHubIssueLabel {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    color: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueSummary {
    number: u64,
    title: String,
    url: String,
    state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    author: Option<GitHubUserSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    labels: Option<Vec<GitHubIssueLabel>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssue {
    #[serde(flatten)]
    summary: GitHubIssueSummary,
    #[serde(skip_serializing_if = "Option::is_none")]
    body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    assignees: Option<Vec<GitHubUserSummary>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueComment {
    id: u64,
    url: String,
    body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    author: Option<GitHubUserSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssuesListResult {
    connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    repo: Option<GitHubRepoRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    issues: Option<Vec<GitHubIssueSummary>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    has_more: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueGetResult {
    connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    repo: Option<GitHubRepoRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    issue: Option<GitHubIssue>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueCommentsResult {
    connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    repo: Option<GitHubRepoRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    comments: Option<Vec<GitHubIssueComment>>,
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
pub struct GitHubAuthAccount {
    id: String,
    user: GitHubUserSummary,
    #[serde(skip_serializing_if = "Option::is_none")]
    scope: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    current: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubAuthStatus {
    connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    user: Option<GitHubUserSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    scope: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    accounts: Option<Vec<GitHubAuthAccount>>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    account_id: Option<String>,
    #[serde(default)]
    current: bool,
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
struct IssueUser {
    login: String,
    #[serde(default)]
    id: Option<u64>,
    #[serde(default)]
    avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct IssueLabel {
    name: String,
    #[serde(default)]
    color: Option<String>,
}

#[derive(Debug, Deserialize)]
struct IssueListItem {
    number: u64,
    title: String,
    html_url: String,
    state: String,
    #[serde(default)]
    user: Option<IssueUser>,
    #[serde(default)]
    labels: Vec<IssueLabel>,
    #[serde(default)]
    pull_request: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct IssueDetailsResponse {
    number: u64,
    title: String,
    html_url: String,
    state: String,
    #[serde(default)]
    user: Option<IssueUser>,
    #[serde(default)]
    labels: Vec<IssueLabel>,
    #[serde(default)]
    assignees: Vec<IssueUser>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
    #[serde(default)]
    pull_request: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct IssueCommentResponse {
    id: u64,
    html_url: String,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    user: Option<IssueUser>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PullFileResponse {
    filename: String,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    additions: Option<u64>,
    #[serde(default)]
    deletions: Option<u64>,
    #[serde(default)]
    changes: Option<u64>,
    #[serde(default)]
    patch: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PullReviewCommentResponse {
    id: u64,
    html_url: String,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    user: Option<IssueUser>,
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    line: Option<i64>,
    #[serde(default)]
    position: Option<i64>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
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
    name: Option<String>,
    #[serde(default)]
    app: Option<CheckRunApp>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    conclusion: Option<String>,
    #[serde(default)]
    details_url: Option<String>,
    #[serde(default)]
    output: Option<CheckRunOutput>,
}

#[derive(Debug, Deserialize)]
struct CheckRunApp {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    slug: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CheckRunOutput {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    text: Option<String>,
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

fn resolve_account_id(auth: &StoredAuth) -> Option<String> {
    if let Some(account_id) = auth.account_id.as_ref().map(|id| id.trim()).filter(|id| !id.is_empty()) {
        return Some(account_id.to_string());
    }
    if let Some(user) = auth.user.as_ref() {
        if !user.login.trim().is_empty() {
            return Some(user.login.trim().to_string());
        }
        if let Some(id) = user.id {
            return Some(id.to_string());
        }
    }
    if !auth.access_token.trim().is_empty() {
        return Some(format!("token:{}", &auth.access_token[..auth.access_token.len().min(8)]));
    }
    None
}

fn normalize_auth_list(list: &mut Vec<StoredAuth>) -> bool {
    let mut changed = false;
    let mut has_current = false;
    for entry in list.iter_mut() {
        if entry.account_id.is_none() {
            entry.account_id = resolve_account_id(entry);
            changed = true;
        }
        if entry.current && !has_current {
            has_current = true;
        } else if entry.current && has_current {
            entry.current = false;
            changed = true;
        }
    }
    if !has_current {
        if let Some(first) = list.first_mut() {
            first.current = true;
            changed = true;
        }
    }
    changed
}

fn build_auth_accounts(list: &[StoredAuth]) -> Option<Vec<GitHubAuthAccount>> {
    let mut accounts = Vec::new();
    for entry in list.iter() {
        let Some(user) = entry.user.clone() else { continue; };
        let Some(id) = resolve_account_id(entry) else { continue; };
        accounts.push(GitHubAuthAccount {
            id,
            user,
            scope: entry.scope.clone(),
            current: Some(entry.current),
        });
    }
    if accounts.is_empty() {
        None
    } else {
        Some(accounts)
    }
}

async fn resolve_auth_status() -> Result<GitHubAuthStatus, String> {
    let list = read_auth_list().await;
    let accounts = build_auth_accounts(&list);
    let current = list.iter().find(|entry| entry.current).cloned().or_else(|| list.first().cloned());
    let Some(stored) = current else {
        return Ok(GitHubAuthStatus {
            connected: false,
            user: None,
            scope: None,
            accounts,
        });
    };

    if stored.access_token.trim().is_empty() {
        let _ = clear_auth_file().await;
        return Ok(GitHubAuthStatus {
            connected: false,
            user: None,
            scope: None,
            accounts: build_auth_accounts(&read_auth_list().await),
        });
    }

    match fetch_me(&stored.access_token).await {
        Ok(user) => Ok(GitHubAuthStatus {
            connected: true,
            user: Some(user),
            scope: stored.scope,
            accounts,
        }),
        Err(err) if err == "unauthorized" => {
            let _ = clear_auth_file().await;
            Ok(GitHubAuthStatus {
                connected: false,
                user: None,
                scope: None,
                accounts: build_auth_accounts(&read_auth_list().await),
            })
        }
        Err(err) => Err(err),
    }
}

async fn read_auth_list() -> Vec<StoredAuth> {
    let path = match github_auth_path() {
        Ok(path) => path,
        Err(_) => return Vec::new(),
    };
    let bytes = match fs::read(&path).await {
        Ok(bytes) => bytes,
        Err(_) => return Vec::new(),
    };

    let mut list = if let Ok(list) = serde_json::from_slice::<Vec<StoredAuth>>(&bytes) {
        list
    } else if let Ok(entry) = serde_json::from_slice::<StoredAuth>(&bytes) {
        vec![entry]
    } else {
        Vec::new()
    };

    let changed = normalize_auth_list(&mut list);
    if changed {
        let _ = persist_auth_list(&list).await;
    }
    list
}

async fn persist_auth_list(list: &Vec<StoredAuth>) -> Result<(), String> {
    let path = github_auth_path()?;
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent).await;
    }
    let bytes = serde_json::to_vec_pretty(list).map_err(|e| e.to_string())?;
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

async fn read_auth_file() -> Option<StoredAuth> {
    let list = read_auth_list().await;
    let current = list.iter().find(|entry| entry.current).cloned();
    current.or_else(|| list.into_iter().next())
}

async fn write_auth_file(auth: &StoredAuth) -> Result<(), String> {
    let mut list = read_auth_list().await;
    let mut next = auth.clone();
    next.current = true;
    next.account_id = resolve_account_id(&next);
    let account_id = next.account_id.clone();

    if let Some(account_id) = account_id.as_ref() {
        if let Some(index) = list.iter().position(|entry| entry.account_id.as_ref() == Some(account_id)) {
            list[index] = next;
        } else {
            list.push(next);
        }
    } else {
        list.push(next);
    }

    for entry in list.iter_mut() {
        entry.current = account_id.is_some() && entry.account_id.as_ref() == account_id.as_ref();
    }

    persist_auth_list(&list).await
}

async fn clear_auth_file() -> bool {
    let path = match github_auth_path() {
        Ok(p) => p,
        Err(_) => return false,
    };

    let mut list = read_auth_list().await;
    if list.is_empty() {
        return true;
    }
    list.retain(|entry| !entry.current);
    if list.is_empty() {
        return fs::remove_file(&path).await.is_ok() || !path.exists();
    }
    normalize_auth_list(&mut list);
    persist_auth_list(&list).await.is_ok()
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

fn map_issue_user(user: &IssueUser) -> GitHubUserSummary {
    GitHubUserSummary {
        login: user.login.clone(),
        id: user.id,
        avatar_url: user.avatar_url.clone(),
        name: None,
        email: None,
    }
}

fn map_issue_labels(labels: Vec<IssueLabel>) -> Vec<GitHubIssueLabel> {
    labels
        .into_iter()
        .filter(|l| !l.name.trim().is_empty())
        .map(|l| GitHubIssueLabel {
            name: l.name,
            color: l.color,
        })
        .collect()
}

#[tauri::command]
pub async fn github_auth_status(
    _state: State<'_, DesktopRuntime>,
) -> Result<GitHubAuthStatus, String> {
    resolve_auth_status().await
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
        account_id: None,
        current: true,
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
#[allow(non_snake_case)]
pub async fn github_auth_activate(
    accountId: String,
    _state: State<'_, DesktopRuntime>,
) -> Result<GitHubAuthStatus, String> {
    let account_id = accountId.trim().to_string();
    if account_id.is_empty() {
        return Err("accountId is required".to_string());
    }

    let mut list = read_auth_list().await;
    if list.is_empty() {
        return Ok(GitHubAuthStatus {
            connected: false,
            user: None,
            scope: None,
            accounts: None,
        });
    }

    let mut found = false;
    for entry in list.iter_mut() {
        let entry_id = resolve_account_id(entry);
        if entry_id.as_deref() == Some(account_id.as_str()) {
            entry.current = true;
            found = true;
        } else {
            entry.current = false;
        }
    }

    if !found {
        return Err("GitHub account not found".to_string());
    }

    persist_auth_list(&list).await?;
    resolve_auth_status().await
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

    let mut first_number = list.first().map(|p| p.number);

    // Fork PR support: if head owner differs, head filter returns empty.
    // Fall back to listing open PRs and matching by head ref name.
    if first_number.is_none() {
        let open_list_url = format!(
            "{}/{}/{}/pulls?state=open&per_page=100",
            API_PULLS_URL_PREFIX, repo.owner, repo.repo
        );
        let open_list = github_get_json::<Vec<Value>>(&open_list_url, &stored.access_token).await;
        if let Ok(items) = open_list {
            for item in items.iter() {
                let head_ref = item
                    .get("head")
                    .and_then(|h| h.get("ref"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if head_ref == branch {
                    first_number = item.get("number").and_then(|v| v.as_u64());
                    break;
                }
            }
        }
    }

    let Some(first_number) = first_number else {
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
        API_PULLS_URL_PREFIX, repo.owner, repo.repo, first_number
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

#[tauri::command]
pub async fn github_issues_list(
    directory: String,
    page: Option<u32>,
    _state: State<'_, DesktopRuntime>,
) -> Result<GitHubIssuesListResult, String> {
    let directory = directory.trim().to_string();
    if directory.is_empty() {
        return Err("directory is required".to_string());
    }

    let stored = read_auth_file().await;
    let Some(stored) = stored else {
        return Ok(GitHubIssuesListResult {
            connected: false,
            repo: None,
            issues: None,
            page: None,
            has_more: None,
        });
    };
    if stored.access_token.trim().is_empty() {
        let _ = clear_auth_file().await;
        return Ok(GitHubIssuesListResult {
            connected: false,
            repo: None,
            issues: None,
            page: None,
            has_more: None,
        });
    }

    let repo = resolve_repo_from_directory(&directory).await;
    let Some(repo) = repo else {
        return Ok(GitHubIssuesListResult {
            connected: true,
            repo: None,
            issues: Some(vec![]),
            page: Some(page.unwrap_or(1).max(1) as u64),
            has_more: Some(false),
        });
    };

    let page = page.unwrap_or(1).max(1);
    let url = format!(
        "{}/{}/{}/issues?state=open&per_page=50&page={}",
        API_PULLS_URL_PREFIX, repo.owner, repo.repo, page
    );

    let resp = reqwest::Client::new()
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .header("Authorization", format!("Bearer {}", stored.access_token))
        .header("User-Agent", "OpenChamber")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        let _ = clear_auth_file().await;
        return Ok(GitHubIssuesListResult {
            connected: false,
            repo: None,
            issues: None,
            page: None,
            has_more: None,
        });
    }
    if !resp.status().is_success() {
        return Err(format!("GitHub request failed: {}", resp.status()));
    }
    let link = resp
        .headers()
        .get("link")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let has_more = link.contains("rel=\"next\"");
    let list = resp.json::<Vec<IssueListItem>>().await.map_err(|e| e.to_string())?;

    let issues = list
        .into_iter()
        .filter(|item| item.pull_request.is_none())
        .map(|item| GitHubIssueSummary {
            number: item.number,
            title: item.title,
            url: item.html_url,
            state: item.state,
            author: item.user.as_ref().map(map_issue_user),
            labels: Some(map_issue_labels(item.labels)),
        })
        .collect::<Vec<_>>();

    Ok(GitHubIssuesListResult {
        connected: true,
        repo: Some(repo),
        issues: Some(issues),
        page: Some(page as u64),
        has_more: Some(has_more),
    })
}

#[tauri::command]
pub async fn github_issue_get(
    directory: String,
    number: u64,
    _state: State<'_, DesktopRuntime>,
) -> Result<GitHubIssueGetResult, String> {
    let directory = directory.trim().to_string();
    if directory.is_empty() {
        return Err("directory is required".to_string());
    }
    if number == 0 {
        return Err("number is required".to_string());
    }

    let stored = read_auth_file().await;
    let Some(stored) = stored else {
        return Ok(GitHubIssueGetResult {
            connected: false,
            repo: None,
            issue: None,
        });
    };
    if stored.access_token.trim().is_empty() {
        let _ = clear_auth_file().await;
        return Ok(GitHubIssueGetResult {
            connected: false,
            repo: None,
            issue: None,
        });
    }

    let repo = resolve_repo_from_directory(&directory).await;
    let Some(repo) = repo else {
        return Ok(GitHubIssueGetResult {
            connected: true,
            repo: None,
            issue: None,
        });
    };

    let url = format!(
        "{}/{}/{}/issues/{}",
        API_PULLS_URL_PREFIX, repo.owner, repo.repo, number
    );

    let issue = github_get_json::<IssueDetailsResponse>(&url, &stored.access_token).await;
    let issue = match issue {
        Ok(v) => v,
        Err(err) if err == "unauthorized" => {
            let _ = clear_auth_file().await;
            return Ok(GitHubIssueGetResult {
                connected: false,
                repo: None,
                issue: None,
            });
        }
        Err(err) => return Err(err),
    };

    if issue.pull_request.is_some() {
        return Err("Not a GitHub issue".to_string());
    }

    let summary = GitHubIssueSummary {
        number: issue.number,
        title: issue.title,
        url: issue.html_url,
        state: issue.state,
        author: issue.user.as_ref().map(map_issue_user),
        labels: Some(map_issue_labels(issue.labels)),
    };
    let assignees = issue
        .assignees
        .iter()
        .map(map_issue_user)
        .collect::<Vec<_>>();

    Ok(GitHubIssueGetResult {
        connected: true,
        repo: Some(repo),
        issue: Some(GitHubIssue {
            summary,
            body: issue.body,
            assignees: Some(assignees),
            created_at: issue.created_at,
            updated_at: issue.updated_at,
        }),
    })
}

#[tauri::command]
pub async fn github_issue_comments(
    directory: String,
    number: u64,
    _state: State<'_, DesktopRuntime>,
) -> Result<GitHubIssueCommentsResult, String> {
    let directory = directory.trim().to_string();
    if directory.is_empty() {
        return Err("directory is required".to_string());
    }
    if number == 0 {
        return Err("number is required".to_string());
    }

    let stored = read_auth_file().await;
    let Some(stored) = stored else {
        return Ok(GitHubIssueCommentsResult {
            connected: false,
            repo: None,
            comments: None,
        });
    };
    if stored.access_token.trim().is_empty() {
        let _ = clear_auth_file().await;
        return Ok(GitHubIssueCommentsResult {
            connected: false,
            repo: None,
            comments: None,
        });
    }

    let repo = resolve_repo_from_directory(&directory).await;
    let Some(repo) = repo else {
        return Ok(GitHubIssueCommentsResult {
            connected: true,
            repo: None,
            comments: Some(vec![]),
        });
    };

    let url = format!(
        "{}/{}/{}/issues/{}/comments?per_page=100",
        API_PULLS_URL_PREFIX, repo.owner, repo.repo, number
    );

    let comments = github_get_json::<Vec<IssueCommentResponse>>(&url, &stored.access_token).await;
    let comments = match comments {
        Ok(v) => v,
        Err(err) if err == "unauthorized" => {
            let _ = clear_auth_file().await;
            return Ok(GitHubIssueCommentsResult {
                connected: false,
                repo: None,
                comments: None,
            });
        }
        Err(err) => return Err(err),
    };

    let mapped = comments
        .into_iter()
        .map(|c| GitHubIssueComment {
            id: c.id,
            url: c.html_url,
            body: c.body.unwrap_or_default(),
            author: c.user.as_ref().map(map_issue_user),
            created_at: c.created_at,
            updated_at: c.updated_at,
        })
        .collect::<Vec<_>>();

    Ok(GitHubIssueCommentsResult {
        connected: true,
        repo: Some(repo),
        comments: Some(mapped),
    })
}

fn read_string_field(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn read_bool_field(value: &Value, key: &str) -> Option<bool> {
    value.get(key).and_then(|v| v.as_bool())
}

fn read_number_field(value: &Value, key: &str) -> Option<u64> {
    value.get(key).and_then(|v| v.as_u64())
}

fn map_pr_user(value: &Value) -> Option<GitHubUserSummary> {
    let login = value.get("login").and_then(|v| v.as_str()).unwrap_or("");
    if login.trim().is_empty() {
        return None;
    }
    Some(GitHubUserSummary {
        login: login.to_string(),
        id: value.get("id").and_then(|v| v.as_u64()),
        avatar_url: value
            .get("avatar_url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        name: None,
        email: None,
    })
}

fn map_pr_head_repo(value: &Value) -> Option<GitHubPullRequestHeadRepo> {
    let owner = value
        .get("owner")
        .and_then(|o| o.get("login"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let repo = value.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let url = value.get("html_url").and_then(|v| v.as_str()).unwrap_or("");
    if owner.trim().is_empty() || repo.trim().is_empty() || url.trim().is_empty() {
        return None;
    }
    Some(GitHubPullRequestHeadRepo {
        owner: owner.to_string(),
        repo: repo.to_string(),
        url: url.to_string(),
        clone_url: value
            .get("clone_url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    })
}

async fn github_get_text(url: &str, access_token: &str, accept: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(url)
        .header("Accept", accept)
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
    resp.text().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn github_prs_list(
    directory: String,
    page: Option<u32>,
    _state: State<'_, DesktopRuntime>,
) -> Result<GitHubPullRequestsListResult, String> {
    let directory = directory.trim().to_string();
    if directory.is_empty() {
        return Err("directory is required".to_string());
    }

    let stored = read_auth_file().await;
    let Some(stored) = stored else {
        return Ok(GitHubPullRequestsListResult {
            connected: false,
            repo: None,
            prs: None,
            page: None,
            has_more: None,
        });
    };
    if stored.access_token.trim().is_empty() {
        let _ = clear_auth_file().await;
        return Ok(GitHubPullRequestsListResult {
            connected: false,
            repo: None,
            prs: None,
            page: None,
            has_more: None,
        });
    }

    let repo = resolve_repo_from_directory(&directory).await;
    let Some(repo) = repo else {
        return Ok(GitHubPullRequestsListResult {
            connected: true,
            repo: None,
            prs: Some(vec![]),
            page: Some(page.unwrap_or(1).max(1) as u64),
            has_more: Some(false),
        });
    };

    let page = page.unwrap_or(1).max(1);
    let url = format!(
        "{}/{}/{}/pulls?state=open&per_page=50&page={}",
        API_PULLS_URL_PREFIX, repo.owner, repo.repo, page
    );

    let resp = reqwest::Client::new()
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .header("Authorization", format!("Bearer {}", stored.access_token))
        .header("User-Agent", "OpenChamber")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        let _ = clear_auth_file().await;
        return Ok(GitHubPullRequestsListResult {
            connected: false,
            repo: None,
            prs: None,
            page: None,
            has_more: None,
        });
    }
    if !resp.status().is_success() {
        return Err(format!("GitHub request failed: {}", resp.status()));
    }
    let link = resp
        .headers()
        .get("link")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let has_more = link.contains("rel=\"next\"");
    let list = resp.json::<Vec<Value>>().await.map_err(|e| e.to_string())?;

    let prs = list
        .into_iter()
        .filter_map(|pr| {
            let number = read_number_field(&pr, "number")?;
            let head = pr.get("head")?;
            let base = pr.get("base")?;
            let head_ref = read_string_field(head, "ref");
            let base_ref = read_string_field(base, "ref");
            let merged = read_bool_field(&pr, "merged").unwrap_or(false);
            let state_raw = read_string_field(&pr, "state");
            let state = if merged {
                "merged".to_string()
            } else if state_raw == "closed" {
                "closed".to_string()
            } else {
                "open".to_string()
            };
            let head_sha = read_string_field(head, "sha");
            let head_sha = if head_sha.trim().is_empty() { None } else { Some(head_sha) };
            let mergeable = read_bool_field(&pr, "mergeable");
            let mergeable_state = pr
                .get("mergeable_state")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let author = pr.get("user").and_then(map_pr_user);
            let head_label = head.get("label").and_then(|v| v.as_str()).map(|s| s.to_string());
            let head_repo = head.get("repo").and_then(map_pr_head_repo);

            Some(GitHubPullRequestContext {
                summary: GitHubPullRequestSummary {
                    number,
                    title: read_string_field(&pr, "title"),
                    url: read_string_field(&pr, "html_url"),
                    state,
                    draft: read_bool_field(&pr, "draft").unwrap_or(false),
                    base: base_ref,
                    head: head_ref,
                    head_sha,
                    mergeable,
                    mergeable_state,
                },
                author,
                head_label,
                head_repo,
                body: None,
                created_at: None,
                updated_at: None,
            })
        })
        .collect::<Vec<_>>();

    Ok(GitHubPullRequestsListResult {
        connected: true,
        repo: Some(repo),
        prs: Some(prs),
        page: Some(page as u64),
        has_more: Some(has_more),
    })
}

#[tauri::command]
pub async fn github_pr_context(
    directory: String,
    number: u64,
    #[allow(non_snake_case)]
    includeDiff: bool,
    #[allow(non_snake_case)]
    includeCheckDetails: Option<bool>,
    _state: State<'_, DesktopRuntime>,
) -> Result<GitHubPullRequestContextResult, String> {
    let directory = directory.trim().to_string();
    if directory.is_empty() {
        return Err("directory is required".to_string());
    }
    if number == 0 {
        return Err("number is required".to_string());
    }

    let stored = read_auth_file().await;
    let Some(stored) = stored else {
        return Ok(GitHubPullRequestContextResult {
            connected: false,
            repo: None,
            pr: None,
            issue_comments: None,
            review_comments: None,
            files: None,
            diff: None,
            checks: None,
            check_runs: None,
        });
    };
    if stored.access_token.trim().is_empty() {
        let _ = clear_auth_file().await;
        return Ok(GitHubPullRequestContextResult {
            connected: false,
            repo: None,
            pr: None,
            issue_comments: None,
            review_comments: None,
            files: None,
            diff: None,
            checks: None,
            check_runs: None,
        });
    }

    let repo = resolve_repo_from_directory(&directory).await;
    let Some(repo) = repo else {
        return Ok(GitHubPullRequestContextResult {
            connected: true,
            repo: None,
            pr: None,
            issue_comments: None,
            review_comments: None,
            files: None,
            diff: None,
            checks: None,
            check_runs: None,
        });
    };

    let pr_url = format!("{}/{}/{}/pulls/{}", API_PULLS_URL_PREFIX, repo.owner, repo.repo, number);
    let pr_json = github_get_json::<Value>(&pr_url, &stored.access_token).await;
    let pr_json = match pr_json {
        Ok(v) => v,
        Err(err) if err == "unauthorized" => {
            let _ = clear_auth_file().await;
            return Ok(GitHubPullRequestContextResult {
                connected: false,
                repo: None,
                pr: None,
                issue_comments: None,
                review_comments: None,
                files: None,
                diff: None,
                checks: None,
                check_runs: None,
            });
        }
        Err(err) => return Err(err),
    };

    let head = pr_json.get("head").cloned().unwrap_or(Value::Null);
    let base = pr_json.get("base").cloned().unwrap_or(Value::Null);
    let head_ref = read_string_field(&head, "ref");
    let base_ref = read_string_field(&base, "ref");
    let merged = read_bool_field(&pr_json, "merged").unwrap_or(false);
    let state_raw = read_string_field(&pr_json, "state");
    let state = if merged {
        "merged".to_string()
    } else if state_raw == "closed" {
        "closed".to_string()
    } else {
        "open".to_string()
    };
    let head_sha = read_string_field(&head, "sha");
    let head_sha = if head_sha.trim().is_empty() { None } else { Some(head_sha) };

    let pr = GitHubPullRequestContext {
        summary: GitHubPullRequestSummary {
            number,
            title: read_string_field(&pr_json, "title"),
            url: read_string_field(&pr_json, "html_url"),
            state,
            draft: read_bool_field(&pr_json, "draft").unwrap_or(false),
            base: base_ref,
            head: head_ref,
            head_sha,
            mergeable: read_bool_field(&pr_json, "mergeable"),
            mergeable_state: pr_json
                .get("mergeable_state")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
        },
        author: pr_json.get("user").and_then(map_pr_user),
        head_label: head.get("label").and_then(|v| v.as_str()).map(|s| s.to_string()),
        head_repo: head.get("repo").and_then(map_pr_head_repo),
        body: pr_json.get("body").and_then(|v| v.as_str()).map(|s| s.to_string()),
        created_at: pr_json.get("created_at").and_then(|v| v.as_str()).map(|s| s.to_string()),
        updated_at: pr_json.get("updated_at").and_then(|v| v.as_str()).map(|s| s.to_string()),
    };

    let issue_comments_url = format!(
        "{}/{}/{}/issues/{}/comments?per_page=100",
        API_PULLS_URL_PREFIX, repo.owner, repo.repo, number
    );
    let issue_comments = github_get_json::<Vec<IssueCommentResponse>>(&issue_comments_url, &stored.access_token).await?;
    let issue_comments = issue_comments
        .into_iter()
        .map(|c| GitHubIssueComment {
            id: c.id,
            url: c.html_url,
            body: c.body.unwrap_or_default(),
            author: c.user.as_ref().map(map_issue_user),
            created_at: c.created_at,
            updated_at: c.updated_at,
        })
        .collect::<Vec<_>>();

    let review_comments_url = format!(
        "{}/{}/{}/pulls/{}/comments?per_page=100",
        API_PULLS_URL_PREFIX, repo.owner, repo.repo, number
    );
    let review_comments = github_get_json::<Vec<PullReviewCommentResponse>>(&review_comments_url, &stored.access_token).await?;
    let review_comments = review_comments
        .into_iter()
        .map(|c| GitHubPullRequestReviewComment {
            id: c.id,
            url: c.html_url,
            body: c.body.unwrap_or_default(),
            author: c.user.as_ref().map(map_issue_user),
            path: c.path,
            line: c.line,
            position: c.position,
            created_at: c.created_at,
            updated_at: c.updated_at,
        })
        .collect::<Vec<_>>();

    let files_url = format!(
        "{}/{}/{}/pulls/{}/files?per_page=100",
        API_PULLS_URL_PREFIX, repo.owner, repo.repo, number
    );
    let files = github_get_json::<Vec<PullFileResponse>>(&files_url, &stored.access_token).await?;
    let files = files
        .into_iter()
        .map(|f| GitHubPullRequestFile {
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            changes: f.changes,
            patch: f.patch,
        })
        .collect::<Vec<_>>();

    // checks summary (same as github_pr_status)
    let mut checks: Option<GitHubChecksSummary> = None;
    let mut check_runs_out: Option<Vec<GitHubCheckRun>> = None;
    let include_check_details = includeCheckDetails.unwrap_or(false);

    // actions jobs cache per run_id
    let mut jobs_by_run_id: std::collections::HashMap<u64, Vec<Value>> = std::collections::HashMap::new();

    if let Some(ref sha) = pr.summary.head_sha {
        let check_runs_url = format!(
            "{}/{}/{}/commits/{}/check-runs",
            API_PULLS_URL_PREFIX, repo.owner, repo.repo, sha
        );
        if let Ok(runs) = github_get_json::<CheckRunsResponse>(&check_runs_url, &stored.access_token).await {
            if !runs.check_runs.is_empty() {
                let mut out: Vec<GitHubCheckRun> = Vec::new();

                for run in runs.check_runs.iter() {
                    let name = run.name.clone().unwrap_or_default();
                    if name.trim().is_empty() {
                        continue;
                    }

                    let mut job: Option<GitHubCheckRunJob> = None;
                    if include_check_details {
                        if let Some(details_url) = &run.details_url {
                            let (run_id, job_id) = (|| {
                                let marker = "/actions/runs/";
                                let idx = details_url.find(marker)?;
                                let rest = &details_url[(idx + marker.len())..];
                                let mut iter = rest.split('/');
                                let run_id_str = iter.next()?;
                                let run_id_val = run_id_str.parse::<u64>().ok()?;
                                let mut job_id_val: Option<u64> = None;
                                let next = iter.next().unwrap_or("");
                                if next == "job" {
                                    job_id_val = iter.next().and_then(|s| s.parse::<u64>().ok());
                                }
                                Some((run_id_val, job_id_val))
                            })().unwrap_or((0, None));

                            if run_id > 0 {
                                if !jobs_by_run_id.contains_key(&run_id) {
                                    let jobs_url = format!(
                                        "{}/{}/{}/actions/runs/{}/jobs?per_page=100",
                                        API_PULLS_URL_PREFIX, repo.owner, repo.repo, run_id
                                    );
                                    let jobs_json = github_get_json::<Value>(&jobs_url, &stored.access_token).await;
                                    let jobs = jobs_json
                                        .ok()
                                        .and_then(|v| v.get("jobs").cloned())
                                        .and_then(|v| v.as_array().cloned())
                                        .unwrap_or_default();
                                    jobs_by_run_id.insert(run_id, jobs);
                                }

                                let jobs = jobs_by_run_id.get(&run_id).cloned().unwrap_or_default();
                                let picked = if let Some(job_id_val) = job_id {
                                    jobs.iter()
                                        .find(|j| j.get("id").and_then(|v| v.as_u64()) == Some(job_id_val))
                                        .cloned()
                                } else {
                                    jobs.iter()
                                        .find(|j| j.get("name").and_then(|v| v.as_str()) == Some(name.as_str()))
                                        .cloned()
                                };

                                if let Some(picked) = picked {
                                    let steps = picked
                                        .get("steps")
                                        .and_then(|v| v.as_array())
                                        .map(|arr| {
                                            arr.iter()
                                                .filter_map(|s| {
                                                    let step_name = s
                                                        .get("name")
                                                        .and_then(|v| v.as_str())
                                                        .unwrap_or("");
                                                    if step_name.trim().is_empty() {
                                                        return None;
                                                    }
                                                    Some(GitHubCheckRunJobStep {
                                                        name: step_name.to_string(),
                                                        status: s
                                                            .get("status")
                                                            .and_then(|v| v.as_str())
                                                            .map(|s| s.to_string()),
                                                        conclusion: s
                                                            .get("conclusion")
                                                            .and_then(|v| v.as_str())
                                                            .map(|s| s.to_string()),
                                                        number: s.get("number").and_then(|v| v.as_u64()),
                                                    })
                                                })
                                                .collect::<Vec<_>>()
                                        });

                                    job = Some(GitHubCheckRunJob {
                                        run_id: Some(run_id),
                                        job_id: picked.get("id").and_then(|v| v.as_u64()),
                                        url: picked
                                            .get("html_url")
                                            .and_then(|v| v.as_str())
                                            .map(|s| s.to_string()),
                                        name: picked
                                            .get("name")
                                            .and_then(|v| v.as_str())
                                            .map(|s| s.to_string()),
                                        conclusion: picked
                                            .get("conclusion")
                                            .and_then(|v| v.as_str())
                                            .map(|s| s.to_string()),
                                        steps,
                                    });
                                } else {
                                    job = Some(GitHubCheckRunJob {
                                        run_id: Some(run_id),
                                        job_id,
                                        url: Some(details_url.clone()),
                                        name: None,
                                        conclusion: None,
                                        steps: None,
                                    });
                                }
                            }
                        }
                    }

                    out.push(GitHubCheckRun {
                        name,
                        app: run.app.as_ref().map(|a| GitHubCheckRunApp {
                            name: a.name.clone(),
                            slug: a.slug.clone(),
                        }),
                        status: run.status.clone(),
                        conclusion: run.conclusion.clone(),
                        details_url: run.details_url.clone(),
                        output: run.output.as_ref().map(|o| GitHubCheckRunOutput {
                            title: o.title.clone(),
                            summary: o.summary.clone(),
                            text: o.text.clone(),
                        }),
                        job,
                    });
                }

                check_runs_out = Some(out);

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
                API_PULLS_URL_PREFIX, repo.owner, repo.repo, sha
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
    }

    let diff = if includeDiff {
        let diff_text = github_get_text(&pr_url, &stored.access_token, "application/vnd.github.v3.diff").await;
        match diff_text {
            Ok(v) => Some(v),
            Err(err) if err == "unauthorized" => {
                let _ = clear_auth_file().await;
                return Ok(GitHubPullRequestContextResult {
                    connected: false,
                    repo: None,
                    pr: None,
                    issue_comments: None,
                    review_comments: None,
                    files: None,
                    diff: None,
                    checks: None,
                    check_runs: None,
                });
            }
            Err(_) => None,
        }
    } else {
        None
    };

    Ok(GitHubPullRequestContextResult {
        connected: true,
        repo: Some(repo),
        pr: Some(pr),
        issue_comments: Some(issue_comments),
        review_comments: Some(review_comments),
        files: Some(files),
        diff,
        checks,
        check_runs: check_runs_out,
    })
}
