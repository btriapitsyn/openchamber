use anyhow::{anyhow, Context, Result};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tokio::process::Command;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::opencode_config;

static SKILL_NAME_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$").expect("valid skill name regex"));

static AUTH_ERROR_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(permission denied|publickey|could not read from remote repository|authentication failed)")
        .expect("valid auth error regex")
});

const CACHE_TTL: Duration = Duration::from_secs(30 * 60);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsCatalogSource {
    pub id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_subpath: Option<String>,

    #[serde(skip_serializing)]
    pub git_identity_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsCatalogInstalledBadge {
    pub is_installed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsCatalogItem {
    pub source_id: String,
    pub repo_source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo_subpath: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_identity_id: Option<String>,
    pub skill_dir: String,
    pub skill_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frontmatter_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub installable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warnings: Option<Vec<String>>,
    pub installed: SkillsCatalogInstalledBadge,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsCatalogResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sources: Option<Vec<SkillsCatalogSource>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub items_by_source: Option<HashMap<String, Vec<SkillsCatalogItem>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<SkillsRepoError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsRepoScanResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub items: Option<Vec<SkillsCatalogItem>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<SkillsRepoError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsInstallResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub installed: Option<Vec<InstalledSkill>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skipped: Option<Vec<SkippedSkill>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<SkillsRepoError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkill {
    pub skill_name: String,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedSkill {
    pub skill_name: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillConflict {
    pub skill_name: String,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentitySummary {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsRepoError {
    pub kind: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssh_only: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identities: Option<Vec<IdentitySummary>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflicts: Option<Vec<SkillConflict>>,
}

#[derive(Debug, Clone)]
struct RepoParsed {
    normalized_repo: String,
    clone_https: String,
    clone_ssh: String,
    effective_subpath: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitIdentityWrapper {
    profiles: Vec<GitIdentityProfile>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitIdentityProfile {
    id: String,
    name: String,
    #[serde(default)]
    ssh_key: Option<String>,
}

fn identities_storage_path() -> Result<PathBuf> {
    let mut path = dirs::home_dir().ok_or_else(|| anyhow!("Could not find home directory"))?;
    path.push(".config");
    path.push("openchamber");
    path.push("git-identities.json");
    Ok(path)
}

fn list_identities() -> Vec<IdentitySummary> {
    let Ok(path) = identities_storage_path() else {
        return vec![];
    };

    let Ok(content) = std::fs::read_to_string(path) else {
        return vec![];
    };

    let Ok(wrapper) = serde_json::from_str::<GitIdentityWrapper>(&content) else {
        return vec![];
    };

    wrapper
        .profiles
        .into_iter()
        .map(|p| IdentitySummary {
            id: p.id,
            name: p.name,
        })
        .collect()
}

fn resolve_identity_ssh_key(identity_id: Option<&str>) -> Option<String> {
    let id = identity_id?.trim();
    if id.is_empty() {
        return None;
    }

    let path = identities_storage_path().ok()?;
    let content = std::fs::read_to_string(path).ok()?;
    let wrapper = serde_json::from_str::<GitIdentityWrapper>(&content).ok()?;

    wrapper
        .profiles
        .into_iter()
        .find(|p| p.id == id)
        .and_then(|p| p.ssh_key)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn parse_repo_source(source: &str, subpath: Option<&str>) -> Result<RepoParsed> {
    let raw = source.trim();
    if raw.is_empty() {
        return Err(anyhow!("Repository source is required"));
    }

    let explicit_subpath = subpath
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    // SSH URL
    let ssh_re = Regex::new(r"^git@github\.com:([^/\s]+)/([^\s#]+)$").unwrap();
    if let Some(caps) = ssh_re.captures(raw) {
        let owner = caps.get(1).unwrap().as_str();
        let repo = caps.get(2).unwrap().as_str().trim_end_matches(".git");
        return Ok(RepoParsed {
            normalized_repo: format!("{}/{}", owner, repo),
            clone_https: format!("https://github.com/{}/{}.git", owner, repo),
            clone_ssh: format!("git@github.com:{}/{}.git", owner, repo),
            effective_subpath: explicit_subpath,
        });
    }

    // HTTPS URL
    let https_re = Regex::new(r"^https?://github\.com/([^/\s]+)/([^\s#]+)$").unwrap();
    if let Some(caps) = https_re.captures(raw) {
        let owner = caps.get(1).unwrap().as_str();
        let repo = caps.get(2).unwrap().as_str().trim_end_matches(".git");
        return Ok(RepoParsed {
            normalized_repo: format!("{}/{}", owner, repo),
            clone_https: format!("https://github.com/{}/{}.git", owner, repo),
            clone_ssh: format!("git@github.com:{}/{}.git", owner, repo),
            effective_subpath: explicit_subpath,
        });
    }

    // Shorthand owner/repo[/subpath]
    let shorthand_re = Regex::new(r"^([^/\s]+)/([^/\s]+)(?:/(.+))?$").unwrap();
    if let Some(caps) = shorthand_re.captures(raw) {
        let owner = caps.get(1).unwrap().as_str();
        let repo = caps.get(2).unwrap().as_str().trim_end_matches(".git");
        let shorthand_subpath = caps
            .get(3)
            .map(|m| m.as_str().trim().to_string())
            .filter(|s| !s.is_empty());

        return Ok(RepoParsed {
            normalized_repo: format!("{}/{}", owner, repo),
            clone_https: format!("https://github.com/{}/{}.git", owner, repo),
            clone_ssh: format!("git@github.com:{}/{}.git", owner, repo),
            effective_subpath: explicit_subpath.or(shorthand_subpath),
        });
    }

    Err(anyhow!("Unsupported repository source format"))
}

fn validate_skill_name(name: &str) -> bool {
    if name.len() < 1 || name.len() > 64 {
        return false;
    }
    SKILL_NAME_RE.is_match(name)
}

fn parse_skill_md_frontmatter(contents: &str) -> (Option<String>, Option<String>, Vec<String>) {
    // Expect:
    // ---
    // yaml
    // ---
    // body...
    let mut warnings = vec![];
    if !contents.starts_with("---") {
        warnings.push("Invalid SKILL.md: missing YAML frontmatter delimiter".to_string());
        return (None, None, warnings);
    }

    let parts: Vec<&str> = contents.splitn(3, "---").collect();
    if parts.len() < 3 {
        warnings.push("Invalid SKILL.md: missing YAML frontmatter delimiter".to_string());
        return (None, None, warnings);
    }

    let yaml_text = parts[1];
    let parsed: serde_yaml::Value = match serde_yaml::from_str(yaml_text) {
        Ok(v) => v,
        Err(_) => {
            warnings.push("Invalid SKILL.md: failed to parse YAML frontmatter".to_string());
            return (None, None, warnings);
        }
    };

    let name = parsed
        .get("name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let description = parsed
        .get("description")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    (name, description, warnings)
}

async fn run_git(
    args: &[String],
    cwd: &Path,
    ssh_key: Option<&str>,
    timeout: Duration,
) -> Result<(String, String)> {
    let mut cmd = Command::new("git");

    if let Some(key) = ssh_key {
        let key = key.trim();
        if !key.is_empty() {
            let ssh_command = format!(
                "ssh -i {} -o BatchMode=yes -o StrictHostKeyChecking=accept-new",
                key
            );
            cmd.arg("-c")
                .arg(format!("core.sshCommand={}", ssh_command));
        }
    }

    cmd.args(args)
        .current_dir(cwd)
        .stdin(std::process::Stdio::null())
        .kill_on_drop(true)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .env("LC_ALL", "C");

    let output = tokio::time::timeout(timeout, cmd.output())
        .await
        .map_err(|_| anyhow!("Git command timed out"))?
        .context("Failed to execute git command")?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        let combined = format!("{}\n{}", stderr, stdout);
        return Err(anyhow!(combined.trim().to_string()));
    }

    Ok((stdout, stderr))
}

fn auth_required_error(message: &str) -> SkillsRepoError {
    SkillsRepoError {
        kind: "authRequired".to_string(),
        message: message.to_string(),
        ssh_only: Some(true),
        identities: Some(list_identities()),
        conflicts: None,
    }
}

fn simple_error(kind: &str, message: &str) -> SkillsRepoError {
    SkillsRepoError {
        kind: kind.to_string(),
        message: message.to_string(),
        ssh_only: None,
        identities: None,
        conflicts: None,
    }
}

fn conflicts_error(conflicts: Vec<SkillConflict>) -> SkillsRepoError {
    SkillsRepoError {
        kind: "conflicts".to_string(),
        message: "Some skills already exist in the selected scope".to_string(),
        ssh_only: None,
        identities: None,
        conflicts: Some(conflicts),
    }
}

async fn clone_repo(clone_url: &str, target_dir: &Path, ssh_key: Option<&str>) -> Result<()> {
    let preferred = vec![
        "clone".to_string(),
        "--depth".to_string(),
        "1".to_string(),
        "--filter=blob:none".to_string(),
        "--no-checkout".to_string(),
        clone_url.to_string(),
        target_dir.display().to_string(),
    ];

    let fallback = vec![
        "clone".to_string(),
        "--depth".to_string(),
        "1".to_string(),
        "--no-checkout".to_string(),
        clone_url.to_string(),
        target_dir.display().to_string(),
    ];

    let cwd = std::env::temp_dir();

    if run_git(&preferred, &cwd, ssh_key, Duration::from_secs(60))
        .await
        .is_ok()
    {
        return Ok(());
    }

    run_git(&fallback, &cwd, ssh_key, Duration::from_secs(60)).await?;
    Ok(())
}

async fn safe_rm(dir: &Path) {
    let _ = tokio::fs::remove_dir_all(dir).await;
}

async fn scan_repo_items(
    source: &str,
    subpath: Option<&str>,
    default_subpath: Option<&str>,
    ssh_key: Option<&str>,
) -> Result<(
    String,
    Option<String>,
    Vec<(
        String,
        String,
        Option<String>,
        Option<String>,
        Vec<String>,
        bool,
    )>,
)> {
    let parsed = parse_repo_source(source, subpath)?;
    let effective_subpath = parsed
        .effective_subpath
        .clone()
        .or_else(|| default_subpath.map(|s| s.to_string()))
        .filter(|s| !s.trim().is_empty());

    let clone_url = if ssh_key.is_some() {
        parsed.clone_ssh.clone()
    } else {
        parsed.clone_https.clone()
    };

    let temp_base = std::env::temp_dir().join(format!(
        "openchamber-desktop-skills-scan-{}",
        Uuid::new_v4()
    ));

    // Clone into temp_base (directory must not exist for git clone target)
    let _ = tokio::fs::remove_dir_all(&temp_base).await;

    let clone_res = clone_repo(&clone_url, &temp_base, ssh_key).await;
    if let Err(err) = clone_res {
        let msg = err.to_string();
        if AUTH_ERROR_RE.is_match(&msg) {
            return Err(anyhow!("AUTH_REQUIRED"));
        }
        return Err(anyhow!(msg));
    }

    // Fast path: sparse checkout only SKILL.md files, then read them from disk.
    // This avoids spawning `git show` per skill.
    let patterns: Vec<String> = if let Some(ref sp) = effective_subpath {
        vec![format!("{}/SKILL.md", sp), format!("{}/**/SKILL.md", sp)]
    } else {
        vec!["SKILL.md".to_string(), "**/SKILL.md".to_string()]
    };

    let sparse_init = run_git(
        &vec![
            "-C".to_string(),
            temp_base.display().to_string(),
            "sparse-checkout".to_string(),
            "init".to_string(),
            "--no-cone".to_string(),
        ],
        &std::env::temp_dir(),
        ssh_key,
        Duration::from_secs(15),
    )
    .await;

    let mut skill_md_paths: Vec<String> = vec![];

    if sparse_init.is_ok() {
        let mut set_args = vec![
            "-C".to_string(),
            temp_base.display().to_string(),
            "sparse-checkout".to_string(),
            "set".to_string(),
        ];
        set_args.extend(patterns.clone());

        let sparse_set = run_git(
            &set_args,
            &std::env::temp_dir(),
            ssh_key,
            Duration::from_secs(30),
        )
        .await;
        if sparse_set.is_ok() {
            let checkout = run_git(
                &vec![
                    "-C".to_string(),
                    temp_base.display().to_string(),
                    "checkout".to_string(),
                    "--force".to_string(),
                    "HEAD".to_string(),
                ],
                &std::env::temp_dir(),
                ssh_key,
                Duration::from_secs(60),
            )
            .await;

            if checkout.is_ok() {
                let ls_files = run_git(
                    &vec![
                        "-C".to_string(),
                        temp_base.display().to_string(),
                        "ls-files".to_string(),
                    ],
                    &std::env::temp_dir(),
                    ssh_key,
                    Duration::from_secs(15),
                )
                .await;

                if let Ok((out, _)) = ls_files {
                    skill_md_paths = out
                        .lines()
                        .map(|l| l.trim().to_string())
                        .filter(|l| !l.is_empty())
                        .filter(|p| p.ends_with("/SKILL.md") || p == "SKILL.md")
                        .collect();
                }
            }
        }
    }

    // Fallback: use ls-tree to find SKILL.md paths.
    if skill_md_paths.is_empty() {
        let mut list_args = vec![
            "-C".to_string(),
            temp_base.display().to_string(),
            "ls-tree".to_string(),
            "-r".to_string(),
            "--name-only".to_string(),
            "HEAD".to_string(),
        ];

        if let Some(ref sp) = effective_subpath {
            list_args.push("--".to_string());
            list_args.push(sp.clone());
        }

        let list_out = run_git(
            &list_args,
            &std::env::temp_dir(),
            ssh_key,
            Duration::from_secs(30),
        )
        .await;
        let stdout = match list_out {
            Ok((out, _)) => out,
            Err(_) => {
                safe_rm(&temp_base).await;
                return Ok((parsed.normalized_repo, effective_subpath, vec![]));
            }
        };

        skill_md_paths = stdout
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .filter(|p| p.ends_with("/SKILL.md") || p == "SKILL.md")
            .collect();
    }

    let mut skill_dirs: Vec<String> = skill_md_paths
        .into_iter()
        .filter(|p| p != "SKILL.md")
        .map(|p| {
            let dir = Path::new(&p)
                .parent()
                .map(|d| d.to_string_lossy().to_string())
                .unwrap_or_else(|| "".to_string());
            dir.replace('\\', "/")
        })
        .collect();

    skill_dirs.sort();
    skill_dirs.dedup();

    let mut items = vec![];

    for skill_dir in skill_dirs {
        let skill_name = skill_dir
            .split('/')
            .filter(|s| !s.is_empty())
            .last()
            .unwrap_or("")
            .to_string();

        if skill_name.is_empty() {
            continue;
        }

        let mut warnings = vec![];

        let skill_md_repo_path = if skill_dir.is_empty() {
            "SKILL.md".to_string()
        } else {
            format!("{}/SKILL.md", skill_dir)
        };

        let skill_md_fs_path = repo_path_to_fs(&temp_base, &skill_md_repo_path);
        let contents = match tokio::fs::read_to_string(&skill_md_fs_path).await {
            Ok(text) => text,
            Err(_) => {
                // Fallback to git show if the file is not present in working tree.
                let show_args = vec![
                    "-C".to_string(),
                    temp_base.display().to_string(),
                    "show".to_string(),
                    format!("HEAD:{}", skill_md_repo_path),
                ];

                match run_git(
                    &show_args,
                    &std::env::temp_dir(),
                    ssh_key,
                    Duration::from_secs(15),
                )
                .await
                {
                    Ok((out, _)) => out,
                    Err(_) => {
                        warnings.push("Failed to read SKILL.md".to_string());
                        String::new()
                    }
                }
            }
        };

        let (frontmatter_name, description, mut fm_warnings) =
            parse_skill_md_frontmatter(&contents);
        warnings.append(&mut fm_warnings);

        let installable = validate_skill_name(&skill_name);
        if !installable {
            warnings.push("Skill directory name is not a valid OpenCode skill name".to_string());
        }

        items.push((
            source.to_string(),
            skill_dir,
            frontmatter_name,
            description,
            warnings,
            installable,
        ));
    }

    safe_rm(&temp_base).await;

    Ok((parsed.normalized_repo, effective_subpath, items))
}

#[derive(Debug, Clone)]
struct CacheEntry {
    created_at: Instant,
    items: Vec<SkillsCatalogItem>,
}

static CATALOG_CACHE: Lazy<Mutex<HashMap<String, CacheEntry>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn cache_key(normalized_repo: &str, subpath: Option<&str>, identity_id: Option<&str>) -> String {
    format!(
        "{}::{}::{}",
        normalized_repo,
        subpath.unwrap_or(""),
        identity_id.unwrap_or("")
    )
}

fn load_custom_catalog_sources() -> Vec<SkillsCatalogSource> {
    let settings_path = dirs::home_dir().map(|mut home| {
        home.push(".config");
        home.push("openchamber");
        home.push("settings.json");
        home
    });

    let Some(path) = settings_path else {
        return vec![];
    };

    let Ok(content) = std::fs::read_to_string(path) else {
        return vec![];
    };

    let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) else {
        return vec![];
    };

    let Some(arr) = value.get("skillCatalogs").and_then(|v| v.as_array()) else {
        return vec![];
    };

    let mut result = vec![];
    let mut seen = std::collections::HashSet::new();

    for entry in arr {
        let Some(obj) = entry.as_object() else {
            continue;
        };

        let id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
        let label = obj
            .get("label")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        let source = obj
            .get("source")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        let subpath = obj
            .get("subpath")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        let git_identity_id = obj
            .get("gitIdentityId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();

        if id.is_empty() || label.is_empty() || source.is_empty() {
            continue;
        }

        if seen.contains(id) {
            continue;
        }
        seen.insert(id.to_string());

        result.push(SkillsCatalogSource {
            id: id.to_string(),
            label: label.to_string(),
            description: Some(source.to_string()),
            source: source.to_string(),
            default_subpath: if subpath.is_empty() {
                None
            } else {
                Some(subpath.to_string())
            },
            git_identity_id: if git_identity_id.is_empty() {
                None
            } else {
                Some(git_identity_id.to_string())
            },
        });
    }

    result
}

pub async fn get_curated_sources() -> Vec<SkillsCatalogSource> {
    let mut sources = vec![SkillsCatalogSource {
        id: "anthropic".to_string(),
        label: "Anthropic".to_string(),
        description: Some("Anthropic’s public skills repository".to_string()),
        source: "anthropics/skills".to_string(),
        default_subpath: Some("skills".to_string()),
        git_identity_id: None,
    }];

    sources.extend(load_custom_catalog_sources());
    sources
}

pub async fn get_catalog(working_directory: &Path, refresh: bool) -> SkillsCatalogResponse {
    let sources = get_curated_sources().await;

    let discovered = opencode_config::discover_skills(Some(working_directory));
    let installed_by_name: HashMap<String, opencode_config::DiscoveredSkill> = discovered
        .into_iter()
        .map(|s| (s.name.clone(), s))
        .collect();

    let mut items_by_source: HashMap<String, Vec<SkillsCatalogItem>> = HashMap::new();

    for src in &sources {
        let parsed = match parse_repo_source(&src.source, None) {
            Ok(p) => p,
            Err(_) => {
                items_by_source.insert(src.id.clone(), vec![]);
                continue;
            }
        };

        let effective_subpath = src
            .default_subpath
            .as_deref()
            .or(parsed.effective_subpath.as_deref())
            .unwrap_or("");

        let key = cache_key(
            &parsed.normalized_repo,
            Some(effective_subpath),
            src.git_identity_id.as_deref(),
        );

        let maybe_cached = if refresh {
            None
        } else {
            let cache = CATALOG_CACHE.lock().await;
            cache.get(&key).cloned()
        };

        let cached_items = maybe_cached.and_then(|entry| {
            if entry.created_at.elapsed() < CACHE_TTL {
                Some(entry.items)
            } else {
                None
            }
        });

        let scanned_items = if let Some(items) = cached_items {
            items
        } else {
            let ssh_key = resolve_identity_ssh_key(src.git_identity_id.as_deref());
            let scan = scan_repo_items(
                &src.source,
                None,
                src.default_subpath.as_deref(),
                ssh_key.as_deref(),
            )
            .await;

            let (_, _, raw_items) = match scan {
                Ok(v) => v,
                Err(_) => {
                    items_by_source.insert(src.id.clone(), vec![]);
                    continue;
                }
            };

            let mut items: Vec<SkillsCatalogItem> = vec![];
            for (repo_source, skill_dir, fm_name, desc, warnings, installable) in raw_items {
                let skill_name = skill_dir
                    .split('/')
                    .filter(|s| !s.is_empty())
                    .last()
                    .unwrap_or("")
                    .to_string();

                let installed = installed_by_name.get(&skill_name);

                items.push(SkillsCatalogItem {
                    source_id: src.id.clone(),
                    repo_source,
                    repo_subpath: src.default_subpath.clone(),
                    git_identity_id: src.git_identity_id.clone(),
                    skill_dir,
                    skill_name,
                    frontmatter_name: fm_name,
                    description: desc,
                    installable,
                    warnings: if warnings.is_empty() {
                        None
                    } else {
                        Some(warnings)
                    },
                    installed: SkillsCatalogInstalledBadge {
                        is_installed: installed.is_some(),
                        scope: installed.map(|s| match s.scope {
                            opencode_config::Scope::User => "user".to_string(),
                            opencode_config::Scope::Project => "project".to_string(),
                        }),
                    },
                });
            }

            items.sort_by(|a, b| a.skill_name.cmp(&b.skill_name));

            let mut cache = CATALOG_CACHE.lock().await;
            cache.insert(
                key,
                CacheEntry {
                    created_at: Instant::now(),
                    items: items.clone(),
                },
            );

            items
        };

        // Update installed badges at request time (cache may be stale for installs)
        let mut enriched = vec![];
        for mut item in scanned_items {
            let installed = installed_by_name.get(&item.skill_name);
            item.installed = SkillsCatalogInstalledBadge {
                is_installed: installed.is_some(),
                scope: installed.map(|s| match s.scope {
                    opencode_config::Scope::User => "user".to_string(),
                    opencode_config::Scope::Project => "project".to_string(),
                }),
            };
            enriched.push(item);
        }

        items_by_source.insert(src.id.clone(), enriched);
    }

    SkillsCatalogResponse {
        ok: true,
        sources: Some(sources),
        items_by_source: Some(items_by_source),
        error: None,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsScanRequest {
    pub source: String,
    pub subpath: Option<String>,
    pub git_identity_id: Option<String>,
}

pub async fn scan_repository(req: SkillsScanRequest) -> SkillsRepoScanResponse {
    let ssh_key = resolve_identity_ssh_key(req.git_identity_id.as_deref());

    match scan_repo_items(
        &req.source,
        req.subpath.as_deref(),
        None,
        ssh_key.as_deref(),
    )
    .await
    {
        Ok((_normalized, effective_subpath, raw_items)) => {
            let mut items = vec![];
            for (repo_source, skill_dir, fm_name, desc, warnings, installable) in raw_items {
                let skill_name = skill_dir
                    .split('/')
                    .filter(|s| !s.is_empty())
                    .last()
                    .unwrap_or("")
                    .to_string();

                items.push(SkillsCatalogItem {
                    source_id: "manual".to_string(),
                    repo_source,
                    repo_subpath: effective_subpath.clone(),
                    git_identity_id: req.git_identity_id.clone(),
                    skill_dir,
                    skill_name,
                    frontmatter_name: fm_name,
                    description: desc,
                    installable,
                    warnings: if warnings.is_empty() {
                        None
                    } else {
                        Some(warnings)
                    },
                    installed: SkillsCatalogInstalledBadge {
                        is_installed: false,
                        scope: None,
                    },
                });
            }
            items.sort_by(|a, b| a.skill_name.cmp(&b.skill_name));

            SkillsRepoScanResponse {
                ok: true,
                items: Some(items),
                error: None,
            }
        }
        Err(err) => {
            if err.to_string().contains("AUTH_REQUIRED") {
                return SkillsRepoScanResponse {
                    ok: false,
                    items: None,
                    error: Some(auth_required_error(
                        "Authentication required to access this repository",
                    )),
                };
            }

            SkillsRepoScanResponse {
                ok: false,
                items: None,
                error: Some(simple_error("networkError", &err.to_string())),
            }
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsInstallSelection {
    pub skill_dir: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsInstallRequest {
    pub source: String,
    pub subpath: Option<String>,
    pub git_identity_id: Option<String>,
    pub scope: String,
    pub selections: Vec<SkillsInstallSelection>,
    pub conflict_policy: Option<String>,
    pub conflict_decisions: Option<HashMap<String, String>>,
}

fn user_skill_dir() -> Result<PathBuf> {
    Ok(dirs::home_dir()
        .ok_or_else(|| anyhow!("Could not find home directory"))?
        .join(".config")
        .join("opencode")
        .join("skill"))
}

fn target_skill_dir(scope: &str, working_directory: &Path, skill_name: &str) -> Result<PathBuf> {
    if scope == "user" {
        return Ok(user_skill_dir()?.join(skill_name));
    }

    if scope == "project" {
        return Ok(working_directory
            .join(".opencode")
            .join("skill")
            .join(skill_name));
    }

    Err(anyhow!("Invalid scope"))
}

fn repo_path_to_fs(base: &Path, repo_rel_posix: &str) -> PathBuf {
    let mut current = base.to_path_buf();
    for part in repo_rel_posix.split('/') {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }
        current.push(trimmed);
    }
    current
}

async fn copy_dir_no_symlinks(src: &Path, dst: &Path) -> Result<()> {
    let src_real = tokio::fs::canonicalize(src).await?;

    tokio::fs::create_dir_all(dst).await?;

    let mut stack: Vec<(PathBuf, PathBuf)> = vec![(src.to_path_buf(), dst.to_path_buf())];

    while let Some((current_src, current_dst)) = stack.pop() {
        tokio::fs::create_dir_all(&current_dst).await?;

        let current_src_real = tokio::fs::canonicalize(&current_src).await?;
        if !current_src_real.starts_with(&src_real) {
            return Err(anyhow!("Invalid source path traversal detected"));
        }

        let mut dir = tokio::fs::read_dir(&current_src).await?;
        while let Some(entry) = dir.next_entry().await? {
            let next_src = entry.path();
            let next_dst = current_dst.join(entry.file_name());

            let meta = tokio::fs::symlink_metadata(&next_src).await?;
            if meta.file_type().is_symlink() {
                return Err(anyhow!("Symlinks are not supported in skills"));
            }

            if meta.is_dir() {
                stack.push((next_src, next_dst));
                continue;
            }

            if meta.is_file() {
                if let Some(parent) = next_dst.parent() {
                    tokio::fs::create_dir_all(parent).await?;
                }
                tokio::fs::copy(&next_src, &next_dst).await?;

                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let mode = meta.permissions().mode() & 0o777;
                    let mut perms = tokio::fs::metadata(&next_dst).await?.permissions();
                    perms.set_mode(mode);
                    let _ = tokio::fs::set_permissions(&next_dst, perms).await;
                }
            }
        }
    }

    Ok(())
}

pub async fn install_skills(
    working_directory: &Path,
    req: SkillsInstallRequest,
) -> SkillsInstallResponse {
    let ssh_key = resolve_identity_ssh_key(req.git_identity_id.as_deref());

    let selections: Vec<String> = req
        .selections
        .into_iter()
        .map(|s| s.skill_dir.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    if selections.is_empty() {
        return SkillsInstallResponse {
            ok: false,
            installed: None,
            skipped: None,
            error: Some(simple_error(
                "invalidSource",
                "No skills selected for installation",
            )),
        };
    }

    // Compute conflicts in target scope only.
    let mut conflicts = vec![];
    for skill_dir in &selections {
        let skill_name = skill_dir
            .split('/')
            .filter(|s| !s.is_empty())
            .last()
            .unwrap_or("")
            .to_string();

        if !validate_skill_name(&skill_name) {
            continue;
        }

        let target = match target_skill_dir(&req.scope, working_directory, &skill_name) {
            Ok(p) => p,
            Err(_) => {
                return SkillsInstallResponse {
                    ok: false,
                    installed: None,
                    skipped: None,
                    error: Some(simple_error("invalidSource", "Invalid scope")),
                };
            }
        };

        if target.exists() {
            let decision = req
                .conflict_decisions
                .as_ref()
                .and_then(|m| m.get(&skill_name))
                .map(|s| s.as_str());

            let auto = req.conflict_policy.as_deref().unwrap_or("prompt");

            if decision.is_none() && auto != "skipAll" && auto != "overwriteAll" {
                conflicts.push(SkillConflict {
                    skill_name,
                    scope: req.scope.clone(),
                });
            }
        }
    }

    if !conflicts.is_empty() {
        return SkillsInstallResponse {
            ok: false,
            installed: None,
            skipped: None,
            error: Some(conflicts_error(conflicts)),
        };
    }

    // Clone
    let parsed = match parse_repo_source(&req.source, req.subpath.as_deref()) {
        Ok(p) => p,
        Err(err) => {
            return SkillsInstallResponse {
                ok: false,
                installed: None,
                skipped: None,
                error: Some(simple_error("invalidSource", &err.to_string())),
            };
        }
    };

    let clone_url = if ssh_key.is_some() {
        parsed.clone_ssh.clone()
    } else {
        parsed.clone_https.clone()
    };

    let temp_base = std::env::temp_dir().join(format!(
        "openchamber-desktop-skills-install-{}",
        Uuid::new_v4()
    ));
    let _ = tokio::fs::remove_dir_all(&temp_base).await;

    let clone_res = clone_repo(&clone_url, &temp_base, ssh_key.as_deref()).await;
    if let Err(err) = clone_res {
        let msg = err.to_string();
        if AUTH_ERROR_RE.is_match(&msg) {
            return SkillsInstallResponse {
                ok: false,
                installed: None,
                skipped: None,
                error: Some(auth_required_error(
                    "Authentication required to access this repository",
                )),
            };
        }

        return SkillsInstallResponse {
            ok: false,
            installed: None,
            skipped: None,
            error: Some(simple_error("networkError", &msg)),
        };
    }

    // sparse-checkout selected dirs
    let init_args = vec![
        "-C".to_string(),
        temp_base.display().to_string(),
        "sparse-checkout".to_string(),
        "init".to_string(),
        "--cone".to_string(),
    ];
    let _ = run_git(
        &init_args,
        &std::env::temp_dir(),
        ssh_key.as_deref(),
        Duration::from_secs(15),
    )
    .await;

    let mut set_args = vec![
        "-C".to_string(),
        temp_base.display().to_string(),
        "sparse-checkout".to_string(),
        "set".to_string(),
    ];
    for dir in &selections {
        set_args.push(dir.clone());
    }

    if let Err(err) = run_git(
        &set_args,
        &std::env::temp_dir(),
        ssh_key.as_deref(),
        Duration::from_secs(30),
    )
    .await
    {
        safe_rm(&temp_base).await;
        return SkillsInstallResponse {
            ok: false,
            installed: None,
            skipped: None,
            error: Some(simple_error("unknown", &err.to_string())),
        };
    }

    let checkout_args = vec![
        "-C".to_string(),
        temp_base.display().to_string(),
        "checkout".to_string(),
        "--force".to_string(),
        "HEAD".to_string(),
    ];

    if let Err(err) = run_git(
        &checkout_args,
        &std::env::temp_dir(),
        ssh_key.as_deref(),
        Duration::from_secs(60),
    )
    .await
    {
        safe_rm(&temp_base).await;
        return SkillsInstallResponse {
            ok: false,
            installed: None,
            skipped: None,
            error: Some(simple_error("unknown", &err.to_string())),
        };
    }

    let mut installed = vec![];
    let mut skipped = vec![];

    for skill_dir in selections {
        let skill_name = skill_dir
            .split('/')
            .filter(|s| !s.is_empty())
            .last()
            .unwrap_or("")
            .to_string();

        if !validate_skill_name(&skill_name) {
            skipped.push(SkippedSkill {
                skill_name,
                reason: "Invalid skill name (directory basename)".to_string(),
            });
            continue;
        }

        let src_dir = repo_path_to_fs(&temp_base, &skill_dir);
        let skill_md = src_dir.join("SKILL.md");
        if !skill_md.exists() {
            skipped.push(SkippedSkill {
                skill_name,
                reason: "SKILL.md not found in selected directory".to_string(),
            });
            continue;
        }

        let target_dir = match target_skill_dir(&req.scope, working_directory, &skill_name) {
            Ok(p) => p,
            Err(err) => {
                skipped.push(SkippedSkill {
                    skill_name,
                    reason: err.to_string(),
                });
                continue;
            }
        };

        let exists = target_dir.exists();

        let mut decision: Option<String> = req
            .conflict_decisions
            .as_ref()
            .and_then(|m| m.get(&skill_name))
            .cloned();

        let auto = req
            .conflict_policy
            .as_deref()
            .unwrap_or("prompt")
            .to_string();

        if decision.is_none() {
            if exists && auto == "skipAll" {
                decision = Some("skip".to_string());
            }
            if exists && auto == "overwriteAll" {
                decision = Some("overwrite".to_string());
            }
            if !exists {
                decision = Some("overwrite".to_string());
            }
        }

        if exists && decision.as_deref() == Some("skip") {
            skipped.push(SkippedSkill {
                skill_name,
                reason: "Already installed (skipped)".to_string(),
            });
            continue;
        }

        if exists && decision.as_deref() == Some("overwrite") {
            let _ = tokio::fs::remove_dir_all(&target_dir).await;
        }

        if let Some(parent) = target_dir.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }

        if let Err(err) = copy_dir_no_symlinks(&src_dir, &target_dir).await {
            let _ = tokio::fs::remove_dir_all(&target_dir).await;
            skipped.push(SkippedSkill {
                skill_name,
                reason: err.to_string(),
            });
            continue;
        }

        installed.push(InstalledSkill {
            skill_name,
            scope: req.scope.clone(),
        });
    }

    safe_rm(&temp_base).await;

    SkillsInstallResponse {
        ok: true,
        installed: Some(installed),
        skipped: Some(skipped),
        error: None,
    }
}
