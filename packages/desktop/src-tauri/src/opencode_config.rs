use anyhow::{anyhow, Result};
use log::info;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::env;
use std::path::{Path, PathBuf};
use tokio::fs;

static PROMPT_FILE_PATTERN: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)^\{file:(.+)\}$").expect("valid regex"));

/// Agent scope types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentScope {
    User,
    Project,
}

/// Command scope types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CommandScope {
    User,
    Project,
}

/// Generic scope enum for SourceInfo (agents and commands share same structure)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    User,
    Project,
}

impl From<AgentScope> for Scope {
    fn from(scope: AgentScope) -> Self {
        match scope {
            AgentScope::User => Scope::User,
            AgentScope::Project => Scope::Project,
        }
    }
}

impl From<CommandScope> for Scope {
    fn from(scope: CommandScope) -> Self {
        match scope {
            CommandScope::User => Scope::User,
            CommandScope::Project => Scope::Project,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub exists: bool,
    pub path: Option<String>,
    pub fields: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<Scope>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MdLocationInfo {
    pub exists: bool,
    pub path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigSources {
    pub md: SourceInfo,
    pub json: SourceInfo,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_md: Option<MdLocationInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_md: Option<MdLocationInfo>,
}

/// Get OpenCode config directory path
fn get_config_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Cannot determine home directory")
        .join(".config")
        .join("opencode")
}

/// Get agent directory path
fn get_agent_dir() -> PathBuf {
    get_config_dir().join("agent")
}

/// Get user-level command directory path
fn get_command_dir() -> PathBuf {
    get_config_dir().join("command")
}

/// Get config file path
fn get_config_file() -> PathBuf {
    get_config_dir().join("opencode.json")
}

/// Get project config file path
fn get_project_config_file(working_directory: &Path) -> PathBuf {
    working_directory.join("opencode.json")
}

/// Get custom config file path from OPENCODE_CONFIG env var
fn get_custom_config_file() -> Option<PathBuf> {
    env::var("OPENCODE_CONFIG").ok().map(PathBuf::from)
}

struct ConfigPaths {
    user: PathBuf,
    project: Option<PathBuf>,
    custom: Option<PathBuf>,
}

struct ConfigLayers {
    user: Value,
    project: Value,
    custom: Value,
    #[allow(dead_code)]
    merged: Value,
    paths: ConfigPaths,
}

fn get_config_paths(working_directory: Option<&Path>) -> ConfigPaths {
    ConfigPaths {
        user: get_config_file(),
        project: working_directory.map(get_project_config_file),
        custom: get_custom_config_file(),
    }
}

fn merge_values(base: &Value, overlay: &Value) -> Value {
    match (base, overlay) {
        (Value::Object(base_map), Value::Object(overlay_map)) => {
            let mut merged = base_map.clone();
            for (key, value) in overlay_map.iter() {
                let base_value = merged.get(key).unwrap_or(&Value::Null).clone();
                let merged_value = merge_values(&base_value, value);
                merged.insert(key.clone(), merged_value);
            }
            Value::Object(merged)
        }
        _ => overlay.clone(),
    }
}

async fn read_config_file(path: &Path) -> Result<Value> {
    if !path.exists() {
        return Ok(Value::Object(serde_json::Map::new()));
    }

    let content = fs::read_to_string(path).await?;
    let normalized = strip_json_comments(&content).trim().to_string();

    if normalized.is_empty() {
        return Ok(Value::Object(serde_json::Map::new()));
    }

    serde_json::from_str(&normalized).map_err(|e| anyhow!("Failed to parse config: {}", e))
}

async fn read_config_layers(working_directory: Option<&Path>) -> Result<ConfigLayers> {
    let paths = get_config_paths(working_directory);
    let user = read_config_file(&paths.user).await?;
    let project = if let Some(ref path) = paths.project {
        read_config_file(path).await?
    } else {
        Value::Object(serde_json::Map::new())
    };
    let custom = if let Some(ref path) = paths.custom {
        read_config_file(path).await?
    } else {
        Value::Object(serde_json::Map::new())
    };

    let merged = merge_values(&merge_values(&user, &project), &custom);

    Ok(ConfigLayers {
        user,
        project,
        custom,
        merged,
        paths,
    })
}

struct JsonEntrySource {
    exists: bool,
    path: Option<PathBuf>,
    section: Option<Value>,
}

fn get_json_entry_source(
    layers: &ConfigLayers,
    section_key: &str,
    entry_name: &str,
) -> JsonEntrySource {
    if let Some(ref custom_path) = layers.paths.custom {
        if let Some(section) = layers.custom.get(section_key).and_then(|v| v.as_object()) {
            if let Some(value) = section.get(entry_name) {
                return JsonEntrySource {
                    exists: true,
                    path: Some(custom_path.clone()),
                    section: Some(value.clone()),
                };
            }
        }
    }

    if let Some(ref project_path) = layers.paths.project {
        if let Some(section) = layers.project.get(section_key).and_then(|v| v.as_object()) {
            if let Some(value) = section.get(entry_name) {
                return JsonEntrySource {
                    exists: true,
                    path: Some(project_path.clone()),
                    section: Some(value.clone()),
                };
            }
        }
    }

    if let Some(section) = layers.user.get(section_key).and_then(|v| v.as_object()) {
        if let Some(value) = section.get(entry_name) {
            return JsonEntrySource {
                exists: true,
                path: Some(layers.paths.user.clone()),
                section: Some(value.clone()),
            };
        }
    }

    JsonEntrySource {
        exists: false,
        path: None,
        section: None,
    }
}

fn get_json_write_target(layers: &ConfigLayers, preferred_scope: Option<Scope>) -> PathBuf {
    if let Some(ref custom_path) = layers.paths.custom {
        return custom_path.clone();
    }

    if preferred_scope == Some(Scope::Project) {
        if let Some(ref project_path) = layers.paths.project {
            return project_path.clone();
        }
    }

    if let Some(ref project_path) = layers.paths.project {
        return project_path.clone();
    }

    layers.paths.user.clone()
}

fn get_default_json_path(layers: &ConfigLayers) -> PathBuf {
    if let Some(ref custom_path) = layers.paths.custom {
        return custom_path.clone();
    }
    if let Some(ref project_path) = layers.paths.project {
        return project_path.clone();
    }
    layers.paths.user.clone()
}

fn get_config_for_path<'a>(layers: &'a mut ConfigLayers, target_path: &Path) -> &'a mut Value {
    if let Some(ref custom_path) = layers.paths.custom {
        if custom_path == target_path {
            return &mut layers.custom;
        }
    }
    if let Some(ref project_path) = layers.paths.project {
        if project_path == target_path {
            return &mut layers.project;
        }
    }
    &mut layers.user
}

// ============== AGENT SCOPE HELPERS ==============

/// Get project-level agent directory path
fn get_project_agent_dir(working_directory: &Path) -> PathBuf {
    working_directory.join(".opencode").join("agent")
}

/// Get project-level agent path
fn get_project_agent_path(working_directory: &Path, agent_name: &str) -> PathBuf {
    get_project_agent_dir(working_directory).join(format!("{}.md", agent_name))
}

/// Get user-level agent path
fn get_user_agent_path(agent_name: &str) -> PathBuf {
    get_agent_dir().join(format!("{}.md", agent_name))
}

/// Ensure project agent directory exists
async fn ensure_project_agent_dir(working_directory: &Path) -> Result<PathBuf> {
    let project_agent_dir = get_project_agent_dir(working_directory);
    fs::create_dir_all(&project_agent_dir).await?;
    Ok(project_agent_dir)
}

/// Determine agent scope based on where the .md file exists
pub fn get_agent_scope(
    agent_name: &str,
    working_directory: Option<&Path>,
) -> (Option<AgentScope>, Option<PathBuf>) {
    if let Some(wd) = working_directory {
        let project_path = get_project_agent_path(wd, agent_name);
        if project_path.exists() {
            return (Some(AgentScope::Project), Some(project_path));
        }
    }

    let user_path = get_user_agent_path(agent_name);
    if user_path.exists() {
        return (Some(AgentScope::User), Some(user_path));
    }

    (None, None)
}

/// Get the path where an agent should be written based on scope
fn get_agent_write_path(
    agent_name: &str,
    working_directory: Option<&Path>,
    requested_scope: Option<AgentScope>,
) -> (AgentScope, PathBuf) {
    // For updates: check existing location first (project takes precedence)
    let (existing_scope, existing_path) = get_agent_scope(agent_name, working_directory);
    if let Some(path) = existing_path {
        return (existing_scope.unwrap(), path);
    }

    // For new agents or built-in overrides: use requested scope or default to user
    let scope = requested_scope.unwrap_or(AgentScope::User);
    if scope == AgentScope::Project {
        if let Some(wd) = working_directory {
            return (AgentScope::Project, get_project_agent_path(wd, agent_name));
        }
    }

    (AgentScope::User, get_user_agent_path(agent_name))
}

// ============== COMMAND SCOPE HELPERS ==============

/// Get project-level command directory path
fn get_project_command_dir(working_directory: &Path) -> PathBuf {
    working_directory.join(".opencode").join("command")
}

/// Get project-level command path
fn get_project_command_path(working_directory: &Path, command_name: &str) -> PathBuf {
    get_project_command_dir(working_directory).join(format!("{}.md", command_name))
}

/// Get user-level command path
fn get_user_command_path(command_name: &str) -> PathBuf {
    get_command_dir().join(format!("{}.md", command_name))
}

/// Ensure project command directory exists
async fn ensure_project_command_dir(working_directory: &Path) -> Result<PathBuf> {
    let project_command_dir = get_project_command_dir(working_directory);
    fs::create_dir_all(&project_command_dir).await?;
    Ok(project_command_dir)
}

/// Determine command scope based on where the .md file exists
pub fn get_command_scope(
    command_name: &str,
    working_directory: Option<&Path>,
) -> (Option<CommandScope>, Option<PathBuf>) {
    if let Some(wd) = working_directory {
        let project_path = get_project_command_path(wd, command_name);
        if project_path.exists() {
            return (Some(CommandScope::Project), Some(project_path));
        }
    }

    let user_path = get_user_command_path(command_name);
    if user_path.exists() {
        return (Some(CommandScope::User), Some(user_path));
    }

    (None, None)
}

/// Get the path where a command should be written based on scope
fn get_command_write_path(
    command_name: &str,
    working_directory: Option<&Path>,
    requested_scope: Option<CommandScope>,
) -> (CommandScope, PathBuf) {
    // For updates: check existing location first (project takes precedence)
    let (existing_scope, existing_path) = get_command_scope(command_name, working_directory);
    if let Some(path) = existing_path {
        return (existing_scope.unwrap(), path);
    }

    // For new commands or built-in overrides: use requested scope or default to user
    let scope = requested_scope.unwrap_or(CommandScope::User);
    if scope == CommandScope::Project {
        if let Some(wd) = working_directory {
            return (
                CommandScope::Project,
                get_project_command_path(wd, command_name),
            );
        }
    }

    (CommandScope::User, get_user_command_path(command_name))
}

/// Ensure required directories exist
async fn ensure_dirs() -> Result<()> {
    let config_dir = get_config_dir();
    let agent_dir = get_agent_dir();
    let command_dir = get_command_dir();

    fs::create_dir_all(&config_dir).await?;
    fs::create_dir_all(&agent_dir).await?;
    fs::create_dir_all(&command_dir).await?;

    Ok(())
}

/// Check if a value is a prompt file reference like {file:./prompts/agent.txt}
fn is_prompt_file_reference(value: &str) -> bool {
    PROMPT_FILE_PATTERN.is_match(value.trim())
}

/// Resolve a prompt file reference to an absolute path
fn resolve_prompt_file_path(reference: &str) -> Option<PathBuf> {
    let trimmed = reference.trim();
    let captures = PROMPT_FILE_PATTERN.captures(trimmed)?;
    let target = captures.get(1)?.as_str().trim();

    if target.is_empty() {
        return None;
    }

    let path = if target.starts_with("./") {
        get_config_dir().join(&target[2..])
    } else if Path::new(target).is_absolute() {
        PathBuf::from(target)
    } else {
        get_config_dir().join(target)
    };

    Some(path)
}

/// Write content to a prompt file
async fn write_prompt_file(file_path: &Path, content: &str) -> Result<()> {
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).await?;
    }
    fs::write(file_path, content).await?;
    info!("Updated prompt file: {}", file_path.display());
    Ok(())
}

/// Strip JSON comments from content
fn strip_json_comments(content: &str) -> String {
    let mut result = String::new();
    let mut in_string = false;
    let mut escape_next = false;
    let mut chars = content.chars().peekable();

    while let Some(ch) = chars.next() {
        if escape_next {
            result.push(ch);
            escape_next = false;
            continue;
        }

        if ch == '\\' && in_string {
            result.push(ch);
            escape_next = true;
            continue;
        }

        if ch == '"' {
            in_string = !in_string;
            result.push(ch);
            continue;
        }

        if !in_string {
            if ch == '/' {
                if let Some(&next_ch) = chars.peek() {
                    if next_ch == '/' {
                        // Line comment - skip until end of line
                        chars.next(); // consume the second '/'
                        while let Some(c) = chars.next() {
                            if c == '\n' {
                                result.push('\n');
                                break;
                            }
                        }
                        continue;
                    } else if next_ch == '*' {
                        // Block comment - skip until */
                        chars.next(); // consume the '*'
                        let mut prev = ' ';
                        while let Some(c) = chars.next() {
                            if prev == '*' && c == '/' {
                                break;
                            }
                            prev = c;
                        }
                        continue;
                    }
                }
            }
        }

        result.push(ch);
    }

    result
}

/// Read merged opencode.json configuration files
#[allow(dead_code)]
pub async fn read_config(working_directory: Option<&Path>) -> Result<Value> {
    Ok(read_config_layers(working_directory).await?.merged)
}

/// Write opencode.json configuration file with backup
pub async fn write_config_at(config: &Value, config_file: &Path) -> Result<()> {
    // Create/overwrite single backup before writing
    if config_file.exists() {
        let file_name = config_file
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| anyhow!("Invalid config file name"))?;

        let backup_path = config_file.with_file_name(format!("{file_name}.openchamber.backup"));
        fs::copy(&config_file, &backup_path).await?;
        info!("Created config backup: {}", backup_path.display());
    }

    let json_string = serde_json::to_string_pretty(config)?;
    if let Some(parent) = config_file.parent() {
        fs::create_dir_all(parent).await?;
    }
    fs::write(config_file, json_string).await?;
    info!("Successfully wrote config file: {}", config_file.display());

    Ok(())
}

/// Write user-level opencode.json configuration file
#[allow(dead_code)]
pub async fn write_config(config: &Value) -> Result<()> {
    let config_file = get_config_file();
    write_config_at(config, &config_file).await
}

/// Markdown file data
#[derive(Debug)]
struct MdData {
    frontmatter: HashMap<String, Value>,
    body: String,
}

/// Parse markdown file with YAML frontmatter
async fn parse_md_file(file_path: &Path) -> Result<MdData> {
    let content = fs::read_to_string(file_path).await?;

    // Match YAML frontmatter: ---\n...\n---\n
    let re = Regex::new(r"(?s)^---\r?\n(.*?)\r?\n---\r?\n(.*)$").expect("valid regex");

    if let Some(captures) = re.captures(&content) {
        let yaml_str = captures.get(1).map(|m| m.as_str()).unwrap_or("");
        let body = captures.get(2).map(|m| m.as_str()).unwrap_or("").trim();

        let frontmatter: HashMap<String, Value> =
            serde_yaml::from_str(yaml_str).unwrap_or_default();

        Ok(MdData {
            frontmatter,
            body: body.to_string(),
        })
    } else {
        // No frontmatter, treat entire content as body
        Ok(MdData {
            frontmatter: HashMap::new(),
            body: content.trim().to_string(),
        })
    }
}

/// Write markdown file with YAML frontmatter
async fn write_md_file(
    file_path: &Path,
    frontmatter: &HashMap<String, Value>,
    body: &str,
) -> Result<()> {
    // Filter out null values - OpenCode expects keys to be omitted rather than set to null
    let cleaned_frontmatter: HashMap<String, Value> = frontmatter
        .iter()
        .filter(|(_, v)| !v.is_null())
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    let yaml_str = serde_yaml::to_string(&cleaned_frontmatter)?;
    let content = format!("---\n{}---\n\n{}", yaml_str, body);

    fs::write(file_path, content).await?;
    info!("Successfully wrote markdown file: {}", file_path.display());

    Ok(())
}

/// Get information about where agent configuration is stored
pub async fn get_agent_sources(
    agent_name: &str,
    working_directory: Option<&Path>,
) -> Result<ConfigSources> {
    ensure_dirs().await?;

    // Check project level first (takes precedence)
    let project_path = working_directory.map(|wd| get_project_agent_path(wd, agent_name));
    let project_exists = project_path.as_ref().map(|p| p.exists()).unwrap_or(false);

    // Then check user level
    let user_path = get_user_agent_path(agent_name);
    let user_exists = user_path.exists();

    // Determine which md file to use (project takes precedence)
    let (md_path, md_exists, md_scope) = if project_exists {
        (project_path.clone(), true, Some(Scope::Project))
    } else if user_exists {
        (Some(user_path.clone()), true, Some(Scope::User))
    } else {
        (None, false, None)
    };

    let mut md_fields = Vec::new();
    if md_exists {
        if let Some(ref path) = md_path {
            let md_data = parse_md_file(path).await?;
            md_fields.extend(md_data.frontmatter.keys().cloned());
            if !md_data.body.trim().is_empty() {
                md_fields.push("prompt".to_string());
            }
        }
    }

    let layers = read_config_layers(working_directory).await?;
    let json_source = get_json_entry_source(&layers, "agent", agent_name);
    let json_section = json_source.section.as_ref();

    let json_fields = json_section
        .and_then(|value| value.as_object())
        .map(|obj| obj.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();

    let json_path_buf = json_source
        .path
        .unwrap_or_else(|| get_default_json_path(&layers));
    let json_path = json_path_buf.display().to_string();
    let json_scope = if layers.paths.project.as_ref() == Some(&json_path_buf) {
        Some(Scope::Project)
    } else {
        Some(Scope::User)
    };

    let sources = ConfigSources {
        md: SourceInfo {
            exists: md_exists,
            path: md_path.map(|p| p.display().to_string()),
            fields: md_fields,
            scope: md_scope,
        },
        json: SourceInfo {
            exists: json_source.exists,
            path: Some(json_path),
            fields: json_fields,
            scope: if json_source.exists { json_scope } else { None },
        },
        project_md: Some(MdLocationInfo {
            exists: project_exists,
            path: project_path.map(|p| p.display().to_string()),
        }),
        user_md: Some(MdLocationInfo {
            exists: user_exists,
            path: Some(user_path.display().to_string()),
        }),
    };

    Ok(sources)
}

/// Create new agent as .md file
pub async fn create_agent(
    agent_name: &str,
    config: &HashMap<String, Value>,
    working_directory: Option<&Path>,
    scope: Option<AgentScope>,
) -> Result<()> {
    ensure_dirs().await?;

    // Check if agent already exists at either level
    if let Some(wd) = working_directory {
        let project_path = get_project_agent_path(wd, agent_name);
        if project_path.exists() {
            return Err(anyhow!(
                "Agent {} already exists as project-level .md file",
                agent_name
            ));
        }
    }

    let user_path = get_user_agent_path(agent_name);
    if user_path.exists() {
        return Err(anyhow!(
            "Agent {} already exists as user-level .md file",
            agent_name
        ));
    }

    let layers = read_config_layers(working_directory).await?;
    let json_source = get_json_entry_source(&layers, "agent", agent_name);
    if json_source.exists {
        return Err(anyhow!(
            "Agent {} already exists in opencode.json",
            agent_name
        ));
    }

    // Determine target path based on requested scope
    let (target_scope, target_path) = if scope == Some(AgentScope::Project) {
        if let Some(wd) = working_directory {
            ensure_project_agent_dir(wd).await?;
            (AgentScope::Project, get_project_agent_path(wd, agent_name))
        } else {
            (AgentScope::User, user_path)
        }
    } else {
        (AgentScope::User, user_path)
    };

    // Extract prompt and scope from config - scope is only used for path determination, not written to file
    let mut frontmatter = config.clone();
    let prompt = frontmatter
        .remove("prompt")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();
    frontmatter.remove("scope"); // Remove scope - it's not a valid agent field

    // Write .md file
    write_md_file(&target_path, &frontmatter, &prompt).await?;
    info!(
        "Created new agent: {} (scope: {:?}, path: {})",
        agent_name,
        target_scope,
        target_path.display()
    );

    Ok(())
}

/// Update existing agent using field-level logic
pub async fn update_agent(
    agent_name: &str,
    updates: &HashMap<String, Value>,
    working_directory: Option<&Path>,
) -> Result<()> {
    ensure_dirs().await?;

    // Determine correct path: project level takes precedence
    let (scope, md_path) = get_agent_write_path(agent_name, working_directory, None);
    let md_exists = md_path.exists();

    // Check if agent exists in opencode.json across all config layers
    let mut layers = read_config_layers(working_directory).await?;
    let json_source = get_json_entry_source(&layers, "agent", agent_name);
    let mut existing_agent = json_source
        .section
        .as_ref()
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_else(Map::new);
    let had_json_fields = !existing_agent.is_empty();

    let preferred_scope = if working_directory.is_some() {
        Some(Scope::Project)
    } else {
        Some(Scope::User)
    };
    let json_target_path = if json_source.exists {
        json_source
            .path
            .clone()
            .unwrap_or_else(|| get_json_write_target(&layers, preferred_scope))
    } else {
        get_json_write_target(&layers, preferred_scope)
    };
    let config = get_config_for_path(&mut layers, &json_target_path);

    // Determine if we should create a new md file:
    // Only for built-in agents (no md file AND no json config)
    let is_builtin_override = !md_exists && !had_json_fields;

    let target_path = if !md_exists && is_builtin_override {
        // Built-in agent override - create at user level
        get_user_agent_path(agent_name)
    } else {
        md_path.clone()
    };

    let mut md_data = if md_exists {
        Some(parse_md_file(&md_path).await?)
    } else if is_builtin_override {
        // Only create new md data for built-in overrides
        Some(MdData {
            frontmatter: HashMap::new(),
            body: String::new(),
        })
    } else {
        None
    };

    // Only create new md if it's a built-in override
    let creating_new_md = is_builtin_override;

    let mut md_modified = false;
    let mut json_modified = false;

    for (field, value) in updates.iter() {
        // Handle explicit removals (null payload) for scalar/frontmatter/JSON fields
        if value.is_null() {
            if md_exists {
                if let Some(ref mut data) = md_data {
                    if data.frontmatter.remove(field).is_some() {
                        md_modified = true;
                    }
                }
            }
            if existing_agent.remove(field).is_some() {
                json_modified = true;
            }
            continue;
        }

        // Special handling for prompt field
        if field == "prompt" {
            let normalized_value = value.as_str().unwrap_or("").to_string();

            if md_exists || creating_new_md {
                if let Some(ref mut data) = md_data {
                    data.body = normalized_value.clone();
                    md_modified = true;
                }
                continue;
            } else if let Some(prompt_ref) = existing_agent.get("prompt").and_then(|v| v.as_str()) {
                if is_prompt_file_reference(prompt_ref) {
                    if let Some(prompt_file_path) = resolve_prompt_file_path(prompt_ref) {
                        write_prompt_file(&prompt_file_path, &normalized_value).await?;
                    } else {
                        return Err(anyhow!(
                            "Invalid prompt file reference for agent {}",
                            agent_name
                        ));
                    }
                    continue;
                }
            }

            // For JSON-only agents, store prompt inline in JSON
            existing_agent.insert("prompt".to_string(), Value::String(normalized_value));
            json_modified = true;
            continue;
        }

        // Check where field is currently defined
        let in_md = md_data
            .as_ref()
            .map(|data| data.frontmatter.contains_key(field))
            .unwrap_or(false);
        let in_json = existing_agent.contains_key(field);

        // JSON takes precedence over md, so update JSON first if field exists there
        if in_json {
            // Update in opencode.json (takes precedence)
            existing_agent.insert(field.clone(), value.clone());
            json_modified = true;
        } else if in_md || creating_new_md {
            // Update in .md frontmatter
            if let Some(ref mut data) = md_data {
                data.frontmatter.insert(field.clone(), value.clone());
                md_modified = true;
            }
        } else {
            // New field - add to the appropriate location based on agent source
            if (md_exists || creating_new_md) && md_data.is_some() {
                if let Some(ref mut data) = md_data {
                    data.frontmatter.insert(field.clone(), value.clone());
                    md_modified = true;
                }
            } else {
                // JSON-only agent or has JSON fields - add to JSON
                existing_agent.insert(field.clone(), value.clone());
                json_modified = true;
            }
        }
    }

    // Write changes
    if md_modified {
        if let Some(data) = md_data {
            write_md_file(&target_path, &data.frontmatter, &data.body).await?;
        }
    }

    if json_modified {
        // Avoid creating a new JSON section for agents that already live exclusively in .md
        if md_exists && !had_json_fields {
            json_modified = false;
        }
    }

    if json_modified {
        if !config.is_object() {
            *config = Value::Object(Map::new());
        }

        let config_obj = config.as_object_mut().unwrap();
        let agents_entry = config_obj
            .entry("agent".to_string())
            .or_insert_with(|| Value::Object(Map::new()));

        if !agents_entry.is_object() {
            *agents_entry = Value::Object(Map::new());
        }

        let agents_obj = agents_entry.as_object_mut().unwrap();
        agents_obj.insert(agent_name.to_string(), Value::Object(existing_agent));

        write_config_at(config, &json_target_path).await?;
    }

    info!(
        "Updated agent: {} (scope: {:?}, md: {}, json: {})",
        agent_name, scope, md_modified, json_modified
    );

    Ok(())
}

/// Delete agent configuration
pub async fn delete_agent(agent_name: &str, working_directory: Option<&Path>) -> Result<()> {
    let mut deleted = false;

    // 1. Check project level first (takes precedence)
    if let Some(wd) = working_directory {
        let project_path = get_project_agent_path(wd, agent_name);
        if project_path.exists() {
            fs::remove_file(&project_path).await?;
            info!(
                "Deleted project-level agent .md file: {}",
                project_path.display()
            );
            deleted = true;
        }
    }

    // 2. Check user level
    let user_path = get_user_agent_path(agent_name);
    if user_path.exists() {
        fs::remove_file(&user_path).await?;
        info!("Deleted user-level agent .md file: {}", user_path.display());
        deleted = true;
    }

    // 3. Remove section from opencode.json if exists (highest precedence entry only)
    let mut layers = read_config_layers(working_directory).await?;
    let json_source = get_json_entry_source(&layers, "agent", agent_name);
    if json_source.exists {
        if let Some(json_path) = json_source.path.clone() {
            let config = get_config_for_path(&mut layers, &json_path);
            if let Some(agents) = config.get_mut("agent").and_then(|v| v.as_object_mut()) {
                if agents.remove(agent_name).is_some() {
                    write_config_at(config, &json_path).await?;
                    info!("Removed agent from opencode.json: {}", agent_name);
                    deleted = true;
                }
            }
        }
    }

    // 4. If nothing was deleted (built-in agent), disable it in highest-precedence config
    if !deleted {
        let preferred_scope = if working_directory.is_some() {
            Some(Scope::Project)
        } else {
            Some(Scope::User)
        };
        let json_path = get_json_write_target(&layers, preferred_scope);
        let config = get_config_for_path(&mut layers, &json_path);
        if !config.is_object() {
            *config = Value::Object(serde_json::Map::new());
        }
        let config_obj = config.as_object_mut().unwrap();
        if !config_obj.contains_key("agent") {
            config_obj.insert("agent".to_string(), Value::Object(serde_json::Map::new()));
        }
        let agents = config_obj.get_mut("agent").unwrap();
        if !agents.is_object() {
            *agents = Value::Object(serde_json::Map::new());
        }
        let mut disable_obj = serde_json::Map::new();
        disable_obj.insert("disable".to_string(), Value::Bool(true));
        agents
            .as_object_mut()
            .unwrap()
            .insert(agent_name.to_string(), Value::Object(disable_obj));
        write_config_at(config, &json_path).await?;
        info!("Disabled built-in agent: {}", agent_name);
    }

    Ok(())
}

/// Get information about where command configuration is stored
pub async fn get_command_sources(
    command_name: &str,
    working_directory: Option<&Path>,
) -> Result<ConfigSources> {
    ensure_dirs().await?;

    // Check project level first (takes precedence)
    let project_path = working_directory.map(|wd| get_project_command_path(wd, command_name));
    let project_exists = project_path.as_ref().map(|p| p.exists()).unwrap_or(false);

    // Then check user level
    let user_path = get_user_command_path(command_name);
    let user_exists = user_path.exists();

    // Determine which md file to use (project takes precedence)
    let (md_path, md_exists, md_scope) = if project_exists {
        (project_path.clone(), true, Some(Scope::Project))
    } else if user_exists {
        (Some(user_path.clone()), true, Some(Scope::User))
    } else {
        (None, false, None)
    };

    let mut md_fields = Vec::new();
    if md_exists {
        if let Some(ref path) = md_path {
            let md_data = parse_md_file(path).await?;
            md_fields.extend(md_data.frontmatter.keys().cloned());
            if !md_data.body.trim().is_empty() {
                md_fields.push("template".to_string());
            }
        }
    }

    let layers = read_config_layers(working_directory).await?;
    let json_source = get_json_entry_source(&layers, "command", command_name);
    let json_section = json_source.section.as_ref();

    let json_fields = json_section
        .and_then(|value| value.as_object())
        .map(|obj| obj.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();

    let json_path_buf = json_source
        .path
        .unwrap_or_else(|| get_default_json_path(&layers));
    let json_path = json_path_buf.display().to_string();
    let json_scope = if layers.paths.project.as_ref() == Some(&json_path_buf) {
        Some(Scope::Project)
    } else {
        Some(Scope::User)
    };

    let sources = ConfigSources {
        md: SourceInfo {
            exists: md_exists,
            path: md_path.map(|p| p.display().to_string()),
            fields: md_fields,
            scope: md_scope,
        },
        json: SourceInfo {
            exists: json_source.exists,
            path: Some(json_path),
            fields: json_fields,
            scope: if json_source.exists { json_scope } else { None },
        },
        project_md: Some(MdLocationInfo {
            exists: project_exists,
            path: project_path.map(|p| p.display().to_string()),
        }),
        user_md: Some(MdLocationInfo {
            exists: user_exists,
            path: Some(user_path.display().to_string()),
        }),
    };

    Ok(sources)
}

/// Create new command as .md file
pub async fn create_command(
    command_name: &str,
    config: &HashMap<String, Value>,
    working_directory: Option<&Path>,
    scope: Option<CommandScope>,
) -> Result<()> {
    ensure_dirs().await?;

    // Check if command already exists at either level
    if let Some(wd) = working_directory {
        let project_path = get_project_command_path(wd, command_name);
        if project_path.exists() {
            return Err(anyhow!(
                "Command {} already exists as project-level .md file",
                command_name
            ));
        }
    }

    let user_path = get_user_command_path(command_name);
    if user_path.exists() {
        return Err(anyhow!(
            "Command {} already exists as user-level .md file",
            command_name
        ));
    }

    let layers = read_config_layers(working_directory).await?;
    let json_source = get_json_entry_source(&layers, "command", command_name);
    if json_source.exists {
        return Err(anyhow!(
            "Command {} already exists in opencode.json",
            command_name
        ));
    }

    // Determine target path based on requested scope
    let (target_scope, target_path) = if scope == Some(CommandScope::Project) {
        if let Some(wd) = working_directory {
            ensure_project_command_dir(wd).await?;
            (
                CommandScope::Project,
                get_project_command_path(wd, command_name),
            )
        } else {
            (CommandScope::User, user_path)
        }
    } else {
        (CommandScope::User, user_path)
    };

    // Extract template and scope from config - scope is only used for path determination, not written to file
    let mut frontmatter = config.clone();
    let template = frontmatter
        .remove("template")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();
    frontmatter.remove("scope"); // Remove scope - it's not a valid command field

    // Write .md file
    write_md_file(&target_path, &frontmatter, &template).await?;
    info!(
        "Created new command: {} (scope: {:?}, path: {})",
        command_name,
        target_scope,
        target_path.display()
    );

    Ok(())
}

/// Update existing command using field-level logic
pub async fn update_command(
    command_name: &str,
    updates: &HashMap<String, Value>,
    working_directory: Option<&Path>,
) -> Result<()> {
    ensure_dirs().await?;

    // Determine correct path: project level takes precedence
    let (scope, md_path) = get_command_write_path(command_name, working_directory, None);
    let md_exists = md_path.exists();

    let mut layers = read_config_layers(working_directory).await?;
    let json_source = get_json_entry_source(&layers, "command", command_name);
    let mut existing_command = json_source
        .section
        .as_ref()
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_else(Map::new);
    let had_json_fields = !existing_command.is_empty();

    let preferred_scope = if working_directory.is_some() {
        Some(Scope::Project)
    } else {
        Some(Scope::User)
    };
    let json_target_path = if json_source.exists {
        json_source
            .path
            .clone()
            .unwrap_or_else(|| get_json_write_target(&layers, preferred_scope))
    } else {
        get_json_write_target(&layers, preferred_scope)
    };
    let config = get_config_for_path(&mut layers, &json_target_path);

    // Only create a new md file for built-in overrides (no md + no json)
    let is_builtin_override = !md_exists && !had_json_fields;

    let target_path = if !md_exists && is_builtin_override {
        // Built-in command override - create at user level
        get_user_command_path(command_name)
    } else {
        md_path.clone()
    };

    let mut md_data = if md_exists {
        Some(parse_md_file(&md_path).await?)
    } else if is_builtin_override {
        Some(MdData {
            frontmatter: HashMap::new(),
            body: String::new(),
        })
    } else {
        None
    };

    let creating_new_md = is_builtin_override;

    let mut md_modified = false;
    let mut json_modified = false;

    for (field, value) in updates.iter() {
        // Handle explicit removals (null payload) for scalar/frontmatter/JSON fields
        if value.is_null() {
            if md_exists {
                if let Some(ref mut data) = md_data {
                    if data.frontmatter.remove(field).is_some() {
                        md_modified = true;
                    }
                }
            }
            if existing_command.remove(field).is_some() {
                json_modified = true;
            }
            continue;
        }

        // Special handling for template field
        if field == "template" {
            let normalized_value = value.as_str().unwrap_or("").to_string();

            if md_exists || creating_new_md {
                if let Some(ref mut data) = md_data {
                    data.body = normalized_value.clone();
                    md_modified = true;
                }
                continue;
            } else if let Some(template_ref) =
                existing_command.get("template").and_then(|v| v.as_str())
            {
                if is_prompt_file_reference(template_ref) {
                    if let Some(template_file_path) = resolve_prompt_file_path(template_ref) {
                        write_prompt_file(&template_file_path, &normalized_value).await?;
                    } else {
                        return Err(anyhow!(
                            "Invalid template file reference for command {}",
                            command_name
                        ));
                    }
                    continue;
                }
            }

            // For JSON-only commands, store template inline in JSON
            existing_command.insert("template".to_string(), Value::String(normalized_value));
            json_modified = true;
            continue;
        }

        // Check where field is currently defined
        let in_md = md_data
            .as_ref()
            .map(|data| data.frontmatter.contains_key(field))
            .unwrap_or(false);
        let in_json = existing_command.contains_key(field);

        // JSON takes precedence over md, so update JSON first if field exists there
        if in_json {
            // Update in opencode.json while preserving existing fields
            existing_command.insert(field.clone(), value.clone());
            json_modified = true;
        } else if in_md || creating_new_md {
            // Update in .md frontmatter
            if let Some(ref mut data) = md_data {
                data.frontmatter.insert(field.clone(), value.clone());
                md_modified = true;
            }
        } else {
            // New field - add to the appropriate location based on command source
            if (md_exists || creating_new_md) && md_data.is_some() {
                if let Some(ref mut data) = md_data {
                    data.frontmatter.insert(field.clone(), value.clone());
                    md_modified = true;
                }
            } else {
                // JSON-only command or built-in - add to JSON
                existing_command.insert(field.clone(), value.clone());
                json_modified = true;
            }
        }
    }

    // Write changes
    if md_modified {
        if let Some(data) = md_data {
            write_md_file(&target_path, &data.frontmatter, &data.body).await?;
        }
    }

    if json_modified {
        // Avoid creating a new JSON section for commands that already live exclusively in .md
        if md_exists && !had_json_fields {
            json_modified = false;
        }
    }

    if json_modified {
        if !config.is_object() {
            *config = Value::Object(Map::new());
        }

        let config_obj = config.as_object_mut().unwrap();
        let commands_entry = config_obj
            .entry("command".to_string())
            .or_insert_with(|| Value::Object(Map::new()));

        if !commands_entry.is_object() {
            *commands_entry = Value::Object(Map::new());
        }

        let commands_obj = commands_entry.as_object_mut().unwrap();
        commands_obj.insert(command_name.to_string(), Value::Object(existing_command));

        write_config_at(config, &json_target_path).await?;
    }

    info!(
        "Updated command: {} (scope: {:?}, md: {}, json: {})",
        command_name, scope, md_modified, json_modified
    );

    Ok(())
}

/// Delete command configuration
pub async fn delete_command(command_name: &str, working_directory: Option<&Path>) -> Result<()> {
    let mut deleted = false;

    // 1. Check project level first (takes precedence)
    if let Some(wd) = working_directory {
        let project_path = get_project_command_path(wd, command_name);
        if project_path.exists() {
            fs::remove_file(&project_path).await?;
            info!(
                "Deleted project-level command .md file: {}",
                project_path.display()
            );
            deleted = true;
        }
    }

    // 2. Check user level
    let user_path = get_user_command_path(command_name);
    if user_path.exists() {
        fs::remove_file(&user_path).await?;
        info!(
            "Deleted user-level command .md file: {}",
            user_path.display()
        );
        deleted = true;
    }

    // 3. Remove section from opencode.json if exists (highest precedence entry only)
    let mut layers = read_config_layers(working_directory).await?;
    let json_source = get_json_entry_source(&layers, "command", command_name);
    if json_source.exists {
        if let Some(json_path) = json_source.path.clone() {
            let config = get_config_for_path(&mut layers, &json_path);
            if let Some(commands) = config.get_mut("command").and_then(|v| v.as_object_mut()) {
                if commands.remove(command_name).is_some() {
                    write_config_at(config, &json_path).await?;
                    info!("Removed command from opencode.json: {}", command_name);
                    deleted = true;
                }
            }
        }
    }

    // 4. If nothing was deleted, throw error
    if !deleted {
        return Err(anyhow!("Command \"{}\" not found", command_name));
    }

    Ok(())
}

// ============== SKILL SCOPE TYPES ==============

/// Skill scope types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SkillScope {
    User,
    Project,
}

impl From<SkillScope> for Scope {
    fn from(scope: SkillScope) -> Self {
        match scope {
            SkillScope::User => Scope::User,
            SkillScope::Project => Scope::Project,
        }
    }
}

/// Skill source type (opencode vs claude-compat)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SkillSource {
    Opencode,
    Claude,
}

/// Supporting file info
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportingFile {
    pub name: String,
    pub path: String,
    pub full_path: String,
}

/// Skill-specific source info with supporting files
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSourceInfo {
    pub exists: bool,
    pub path: Option<String>,
    pub dir: Option<String>,
    pub fields: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<Scope>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<SkillSource>,
    pub supporting_files: Vec<SupportingFile>,
    // Actual content values
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instructions: Option<String>,
}

/// Skill config sources
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillConfigSources {
    pub md: SkillSourceInfo,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_md: Option<MdLocationInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claude_md: Option<MdLocationInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_md: Option<MdLocationInfo>,
}

/// Discovered skill info
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredSkill {
    pub name: String,
    pub path: String,
    pub scope: Scope,
    pub source: SkillSource,
}

// ============== SKILL SCOPE HELPERS ==============

/// Get user-level skill directory path
fn get_skill_dir() -> PathBuf {
    get_config_dir().join("skill")
}

/// Get user-level skill directory for a specific skill
fn get_user_skill_dir(skill_name: &str) -> PathBuf {
    get_skill_dir().join(skill_name)
}

/// Get user-level skill SKILL.md path
fn get_user_skill_path(skill_name: &str) -> PathBuf {
    get_user_skill_dir(skill_name).join("SKILL.md")
}

/// Get project-level skill directory (.opencode/skill/)
fn get_project_skill_dir(working_directory: &Path, skill_name: &str) -> PathBuf {
    working_directory
        .join(".opencode")
        .join("skill")
        .join(skill_name)
}

/// Get project-level skill SKILL.md path
fn get_project_skill_path(working_directory: &Path, skill_name: &str) -> PathBuf {
    get_project_skill_dir(working_directory, skill_name).join("SKILL.md")
}

/// Get Claude-compatible skill directory (.claude/skills/)
fn get_claude_skill_dir(working_directory: &Path, skill_name: &str) -> PathBuf {
    working_directory
        .join(".claude")
        .join("skills")
        .join(skill_name)
}

/// Get Claude-compatible skill SKILL.md path
fn get_claude_skill_path(working_directory: &Path, skill_name: &str) -> PathBuf {
    get_claude_skill_dir(working_directory, skill_name).join("SKILL.md")
}

/// Ensure skill directories exist
async fn ensure_skill_dirs() -> Result<()> {
    let skill_dir = get_skill_dir();
    fs::create_dir_all(&skill_dir).await?;
    Ok(())
}

/// Ensure project skill directory exists
async fn ensure_project_skill_dir(working_directory: &Path, skill_name: &str) -> Result<PathBuf> {
    let project_skill_dir = get_project_skill_dir(working_directory, skill_name);
    fs::create_dir_all(&project_skill_dir).await?;
    Ok(project_skill_dir)
}

/// Determine skill scope based on where the SKILL.md file exists
pub fn get_skill_scope(
    skill_name: &str,
    working_directory: Option<&Path>,
) -> (Option<SkillScope>, Option<PathBuf>, Option<SkillSource>) {
    if let Some(wd) = working_directory {
        // Check .opencode/skill first
        let project_path = get_project_skill_path(wd, skill_name);
        if project_path.exists() {
            return (
                Some(SkillScope::Project),
                Some(project_path),
                Some(SkillSource::Opencode),
            );
        }

        // Check .claude/skills (claude-compat)
        let claude_path = get_claude_skill_path(wd, skill_name);
        if claude_path.exists() {
            return (
                Some(SkillScope::Project),
                Some(claude_path),
                Some(SkillSource::Claude),
            );
        }
    }

    let user_path = get_user_skill_path(skill_name);
    if user_path.exists() {
        return (
            Some(SkillScope::User),
            Some(user_path),
            Some(SkillSource::Opencode),
        );
    }

    (None, None, None)
}

/// List supporting files in a skill directory (excluding SKILL.md)
fn list_supporting_files(skill_dir: &Path) -> Vec<SupportingFile> {
    let mut files = Vec::new();

    fn walk_dir(dir: &Path, relative_base: &Path, files: &mut Vec<SupportingFile>) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let file_name = entry.file_name().to_string_lossy().to_string();

                if path.is_dir() {
                    walk_dir(&path, relative_base, files);
                } else if file_name != "SKILL.md" {
                    let relative_path = path
                        .strip_prefix(relative_base)
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|_| file_name.clone());

                    files.push(SupportingFile {
                        name: file_name,
                        path: relative_path,
                        full_path: path.display().to_string(),
                    });
                }
            }
        }
    }

    walk_dir(skill_dir, skill_dir, &mut files);
    files
}

/// Discover all skills from all sources
pub fn discover_skills(working_directory: Option<&Path>) -> Vec<DiscoveredSkill> {
    let mut skills: std::collections::HashMap<String, DiscoveredSkill> =
        std::collections::HashMap::new();

    // Helper to add skill if not already found
    let mut add_skill = |name: String, path: PathBuf, scope: Scope, source: SkillSource| {
        if !skills.contains_key(&name) {
            skills.insert(
                name.clone(),
                DiscoveredSkill {
                    name,
                    path: path.display().to_string(),
                    scope,
                    source,
                },
            );
        }
    };

    // 1. Project level .opencode/skill/ (highest priority)
    if let Some(wd) = working_directory {
        let project_skill_dir = wd.join(".opencode").join("skill");
        if project_skill_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&project_skill_dir) {
                for entry in entries.flatten() {
                    if entry.path().is_dir() {
                        let skill_name = entry.file_name().to_string_lossy().to_string();
                        let skill_md = entry.path().join("SKILL.md");
                        if skill_md.exists() {
                            add_skill(skill_name, skill_md, Scope::Project, SkillSource::Opencode);
                        }
                    }
                }
            }
        }

        // 2. Claude-compatible .claude/skills/
        let claude_skill_dir = wd.join(".claude").join("skills");
        if claude_skill_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&claude_skill_dir) {
                for entry in entries.flatten() {
                    if entry.path().is_dir() {
                        let skill_name = entry.file_name().to_string_lossy().to_string();
                        let skill_md = entry.path().join("SKILL.md");
                        if skill_md.exists() {
                            add_skill(skill_name, skill_md, Scope::Project, SkillSource::Claude);
                        }
                    }
                }
            }
        }
    }

    // 3. User level ~/.config/opencode/skill/
    let user_skill_dir = get_skill_dir();
    if user_skill_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&user_skill_dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    let skill_name = entry.file_name().to_string_lossy().to_string();
                    let skill_md = entry.path().join("SKILL.md");
                    if skill_md.exists() {
                        add_skill(skill_name, skill_md, Scope::User, SkillSource::Opencode);
                    }
                }
            }
        }
    }

    skills.into_values().collect()
}

/// Get information about where skill configuration is stored
pub async fn get_skill_sources(
    skill_name: &str,
    working_directory: Option<&Path>,
) -> Result<SkillConfigSources> {
    ensure_skill_dirs().await?;

    // Check all possible locations
    let project_path = working_directory.map(|wd| get_project_skill_path(wd, skill_name));
    let project_exists = project_path.as_ref().map(|p| p.exists()).unwrap_or(false);
    let project_dir = project_exists
        .then(|| working_directory.map(|wd| get_project_skill_dir(wd, skill_name)))
        .flatten();

    let claude_path = working_directory.map(|wd| get_claude_skill_path(wd, skill_name));
    let claude_exists = claude_path.as_ref().map(|p| p.exists()).unwrap_or(false);
    let claude_dir = claude_exists
        .then(|| working_directory.map(|wd| get_claude_skill_dir(wd, skill_name)))
        .flatten();

    let user_path = get_user_skill_path(skill_name);
    let user_exists = user_path.exists();
    let user_dir = if user_exists {
        Some(get_user_skill_dir(skill_name))
    } else {
        None
    };

    // Determine which md file to use (priority: project > claude > user)
    let (md_path, md_exists, md_scope, md_source, md_dir) = if project_exists {
        (
            project_path.clone(),
            true,
            Some(Scope::Project),
            Some(SkillSource::Opencode),
            project_dir.clone(),
        )
    } else if claude_exists {
        (
            claude_path.clone(),
            true,
            Some(Scope::Project),
            Some(SkillSource::Claude),
            claude_dir.clone(),
        )
    } else if user_exists {
        (
            Some(user_path.clone()),
            true,
            Some(Scope::User),
            Some(SkillSource::Opencode),
            user_dir.clone(),
        )
    } else {
        (None, false, None, None, None)
    };

    let mut md_fields = Vec::new();
    let mut supporting_files = Vec::new();
    let mut md_name: Option<String> = None;
    let mut md_description: Option<String> = None;
    let mut md_instructions: Option<String> = None;

    if md_exists {
        if let Some(ref path) = md_path {
            let md_data = parse_md_file(path).await?;
            md_fields.extend(md_data.frontmatter.keys().cloned());

            // Extract actual content values
            md_name = md_data
                .frontmatter
                .get("name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            md_description = md_data
                .frontmatter
                .get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            if !md_data.body.trim().is_empty() {
                md_fields.push("instructions".to_string());
                md_instructions = Some(md_data.body.clone());
            }
        }
        if let Some(ref dir) = md_dir {
            supporting_files = list_supporting_files(dir);
        }
    }

    Ok(SkillConfigSources {
        md: SkillSourceInfo {
            exists: md_exists,
            path: md_path.map(|p| p.display().to_string()),
            dir: md_dir.map(|d| d.display().to_string()),
            fields: md_fields,
            scope: md_scope,
            source: md_source,
            supporting_files,
            name: md_name,
            description: md_description,
            instructions: md_instructions,
        },
        project_md: Some(MdLocationInfo {
            exists: project_exists,
            path: project_path.map(|p| p.display().to_string()),
        }),
        claude_md: Some(MdLocationInfo {
            exists: claude_exists,
            path: claude_path.map(|p| p.display().to_string()),
        }),
        user_md: Some(MdLocationInfo {
            exists: user_exists,
            path: Some(user_path.display().to_string()),
        }),
    })
}

/// Read a supporting file content
pub async fn read_skill_supporting_file(skill_dir: &Path, relative_path: &str) -> Result<String> {
    let full_path = skill_dir.join(relative_path);
    if !full_path.exists() {
        return Err(anyhow!("File not found: {}", relative_path));
    }
    let content = fs::read_to_string(&full_path).await?;
    Ok(content)
}

/// Write a supporting file
pub async fn write_skill_supporting_file(
    skill_dir: &Path,
    relative_path: &str,
    content: &str,
) -> Result<()> {
    let full_path = skill_dir.join(relative_path);
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).await?;
    }
    fs::write(&full_path, content).await?;
    info!("Wrote supporting file: {}", full_path.display());
    Ok(())
}

/// Delete a supporting file
pub async fn delete_skill_supporting_file(skill_dir: &Path, relative_path: &str) -> Result<()> {
    let full_path = skill_dir.join(relative_path);
    if full_path.exists() {
        fs::remove_file(&full_path).await?;
        info!("Deleted supporting file: {}", full_path.display());

        // Clean up empty parent directories
        let mut parent = full_path.parent();
        while let Some(p) = parent {
            if p == skill_dir {
                break;
            }
            if let Ok(mut entries) = std::fs::read_dir(p) {
                if entries.next().is_none() {
                    let _ = std::fs::remove_dir(p);
                    parent = p.parent();
                } else {
                    break;
                }
            } else {
                break;
            }
        }
    }
    Ok(())
}

/// Validate skill name (lowercase alphanumeric with hyphens, 1-64 chars)
fn validate_skill_name(skill_name: &str) -> Result<()> {
    let re = Regex::new(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$").expect("valid regex");
    if !re.is_match(skill_name) || skill_name.len() > 64 {
        return Err(anyhow!(
            "Invalid skill name \"{}\". Must be 1-64 lowercase alphanumeric characters with hyphens, cannot start or end with hyphen.",
            skill_name
        ));
    }
    Ok(())
}

/// Create new skill
pub async fn create_skill(
    skill_name: &str,
    config: &HashMap<String, Value>,
    working_directory: Option<&Path>,
    scope: Option<SkillScope>,
) -> Result<()> {
    ensure_skill_dirs().await?;
    validate_skill_name(skill_name)?;

    // Check if skill already exists
    let (_existing_scope, existing_path, _) = get_skill_scope(skill_name, working_directory);
    if existing_path.is_some() {
        return Err(anyhow!("Skill {} already exists", skill_name));
    }

    // Determine target directory
    let (target_scope, target_dir) = if scope == Some(SkillScope::Project) {
        if let Some(wd) = working_directory {
            let dir = ensure_project_skill_dir(wd, skill_name).await?;
            (SkillScope::Project, dir)
        } else {
            let dir = get_user_skill_dir(skill_name);
            fs::create_dir_all(&dir).await?;
            (SkillScope::User, dir)
        }
    } else {
        let dir = get_user_skill_dir(skill_name);
        fs::create_dir_all(&dir).await?;
        (SkillScope::User, dir)
    };

    let target_path = target_dir.join("SKILL.md");

    // Extract fields
    let mut frontmatter = config.clone();
    let instructions = frontmatter
        .remove("instructions")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();
    frontmatter.remove("scope");
    frontmatter.remove("supportingFiles");

    // Ensure required fields
    if !frontmatter.contains_key("name") {
        frontmatter.insert("name".to_string(), Value::String(skill_name.to_string()));
    }
    if !frontmatter.contains_key("description") {
        return Err(anyhow!("Skill description is required"));
    }

    write_md_file(&target_path, &frontmatter, &instructions).await?;

    // Write supporting files if provided
    if let Some(supporting_files) = config.get("supportingFiles").and_then(|v| v.as_array()) {
        for file in supporting_files {
            if let (Some(path), Some(content)) = (
                file.get("path").and_then(|v| v.as_str()),
                file.get("content").and_then(|v| v.as_str()),
            ) {
                write_skill_supporting_file(&target_dir, path, content).await?;
            }
        }
    }

    info!(
        "Created new skill: {} (scope: {:?}, path: {})",
        skill_name,
        target_scope,
        target_path.display()
    );
    Ok(())
}

/// Update existing skill
pub async fn update_skill(
    skill_name: &str,
    updates: &HashMap<String, Value>,
    working_directory: Option<&Path>,
) -> Result<()> {
    let (_, existing_path, _) = get_skill_scope(skill_name, working_directory);
    let md_path = existing_path.ok_or_else(|| anyhow!("Skill \"{}\" not found", skill_name))?;
    let md_dir = md_path
        .parent()
        .ok_or_else(|| anyhow!("Invalid skill path"))?;

    let mut md_data = parse_md_file(&md_path).await?;
    let mut md_modified = false;

    for (field, value) in updates.iter() {
        if field == "scope" {
            continue;
        }

        if field == "instructions" {
            let normalized = value.as_str().unwrap_or("").to_string();
            md_data.body = normalized;
            md_modified = true;
            continue;
        }

        if field == "supportingFiles" {
            if let Some(files) = value.as_array() {
                for file in files {
                    if let Some(true) = file.get("delete").and_then(|v| v.as_bool()) {
                        if let Some(path) = file.get("path").and_then(|v| v.as_str()) {
                            delete_skill_supporting_file(md_dir, path).await?;
                        }
                    } else if let (Some(path), Some(content)) = (
                        file.get("path").and_then(|v| v.as_str()),
                        file.get("content").and_then(|v| v.as_str()),
                    ) {
                        write_skill_supporting_file(md_dir, path, content).await?;
                    }
                }
            }
            continue;
        }

        md_data.frontmatter.insert(field.clone(), value.clone());
        md_modified = true;
    }

    if md_modified {
        write_md_file(&md_path, &md_data.frontmatter, &md_data.body).await?;
    }

    info!(
        "Updated skill: {} (path: {})",
        skill_name,
        md_path.display()
    );
    Ok(())
}

/// Delete skill
pub async fn delete_skill(skill_name: &str, working_directory: Option<&Path>) -> Result<()> {
    let mut deleted = false;

    // Check and delete from all locations
    if let Some(wd) = working_directory {
        // Project level .opencode/skill/
        let project_dir = get_project_skill_dir(wd, skill_name);
        if project_dir.exists() {
            fs::remove_dir_all(&project_dir).await?;
            info!(
                "Deleted project-level skill directory: {}",
                project_dir.display()
            );
            deleted = true;
        }

        // Claude-compat .claude/skills/
        let claude_dir = get_claude_skill_dir(wd, skill_name);
        if claude_dir.exists() {
            fs::remove_dir_all(&claude_dir).await?;
            info!(
                "Deleted claude-compat skill directory: {}",
                claude_dir.display()
            );
            deleted = true;
        }
    }

    // User level
    let user_dir = get_user_skill_dir(skill_name);
    if user_dir.exists() {
        fs::remove_dir_all(&user_dir).await?;
        info!("Deleted user-level skill directory: {}", user_dir.display());
        deleted = true;
    }

    if !deleted {
        return Err(anyhow!("Skill \"{}\" not found", skill_name));
    }

    Ok(())
}
