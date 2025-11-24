use anyhow::{anyhow, Result};
use log::info;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::fs;

static PROMPT_FILE_PATTERN: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)^\{file:(.+)\}$").expect("valid regex"));

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub exists: bool,
    pub path: Option<String>,
    pub fields: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigSources {
    pub md: SourceInfo,
    pub json: SourceInfo,
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

/// Get command directory path
fn get_command_dir() -> PathBuf {
    get_config_dir().join("command")
}

/// Get config file path
fn get_config_file() -> PathBuf {
    get_config_dir().join("opencode.json")
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

/// Read opencode.json configuration file
pub async fn read_config() -> Result<Value> {
    let config_file = get_config_file();

    if !config_file.exists() {
        return Ok(Value::Object(serde_json::Map::new()));
    }

    let content = fs::read_to_string(&config_file).await?;
    let normalized = strip_json_comments(&content).trim().to_string();

    if normalized.is_empty() {
        return Ok(Value::Object(serde_json::Map::new()));
    }

    serde_json::from_str(&normalized).map_err(|e| anyhow!("Failed to parse config: {}", e))
}

/// Write opencode.json configuration file with backup
pub async fn write_config(config: &Value) -> Result<()> {
    let config_file = get_config_file();

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
    fs::write(&config_file, json_string).await?;
    info!("Successfully wrote config file");

    Ok(())
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
    let yaml_str = serde_yaml::to_string(frontmatter)?;
    let content = format!("---\n{}---\n\n{}", yaml_str, body);

    fs::write(file_path, content).await?;
    info!("Successfully wrote markdown file: {}", file_path.display());

    Ok(())
}

/// Get information about where agent configuration is stored
pub async fn get_agent_sources(agent_name: &str) -> Result<ConfigSources> {
    ensure_dirs().await?;

    let md_path = get_agent_dir().join(format!("{}.md", agent_name));
    let md_exists = md_path.exists();

    let mut md_fields = Vec::new();
    if md_exists {
        let md_data = parse_md_file(&md_path).await?;
        md_fields.extend(md_data.frontmatter.keys().cloned());
        if !md_data.body.trim().is_empty() {
            md_fields.push("prompt".to_string());
        }
    }

    let config = read_config().await?;
    let json_section = config
        .get("agent")
        .and_then(|v| v.as_object())
        .and_then(|obj| obj.get(agent_name));

    let json_fields = json_section
        .and_then(|value| value.as_object())
        .map(|obj| obj.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();

    let sources = ConfigSources {
        md: SourceInfo {
            exists: md_exists,
            path: md_exists.then(|| md_path.display().to_string()),
            fields: md_fields,
        },
        json: SourceInfo {
            exists: json_section.is_some(),
            path: Some(get_config_file().display().to_string()),
            fields: json_fields,
        },
    };

    Ok(sources)
}

/// Create new agent as .md file
pub async fn create_agent(agent_name: &str, config: &HashMap<String, Value>) -> Result<()> {
    ensure_dirs().await?;

    let md_path = get_agent_dir().join(format!("{}.md", agent_name));

    // Check if agent already exists
    if md_path.exists() {
        return Err(anyhow!("Agent {} already exists as .md file", agent_name));
    }

    let existing_config = read_config().await?;
    if let Some(agents) = existing_config.get("agent").and_then(|v| v.as_object()) {
        if agents.contains_key(agent_name) {
            return Err(anyhow!(
                "Agent {} already exists in opencode.json",
                agent_name
            ));
        }
    }

    // Extract prompt from config
    let mut frontmatter = config.clone();
    let prompt = frontmatter
        .remove("prompt")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();

    // Write .md file
    write_md_file(&md_path, &frontmatter, &prompt).await?;
    info!("Created new agent: {}", agent_name);

    Ok(())
}

/// Update existing agent using field-level logic
pub async fn update_agent(agent_name: &str, updates: &HashMap<String, Value>) -> Result<()> {
    ensure_dirs().await?;

    let md_path = get_agent_dir().join(format!("{}.md", agent_name));
    let md_exists = md_path.exists();

    let mut md_data = if md_exists {
        Some(parse_md_file(&md_path).await?)
    } else {
        None
    };

    let mut config = read_config().await?;
    let mut existing_agent = config
        .get("agent")
        .and_then(|v| v.as_object())
        .and_then(|obj| obj.get(agent_name))
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_else(Map::new);
    let had_json_fields = !existing_agent.is_empty();

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

            if md_exists {
                if let Some(ref mut data) = md_data {
                    data.body = normalized_value.clone();
                    md_modified = true;
                }
            } else if let Some(prompt_ref) = existing_agent.get("prompt").and_then(|v| v.as_str())
            {
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

            // Write prompt directly to JSON entry (file ref or inline string)
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

        if in_md {
            // Update in .md frontmatter
            if let Some(ref mut data) = md_data {
                data.frontmatter.insert(field.clone(), value.clone());
                md_modified = true;
            }
        } else if in_json {
            // Update in opencode.json while preserving existing fields
            existing_agent.insert(field.clone(), value.clone());
            json_modified = true;
        } else {
            // Field not defined - apply priority rules
            if md_exists && !existing_agent.is_empty() {
                // Both exist → add to opencode.json (higher priority) without dropping other keys
                existing_agent.insert(field.clone(), value.clone());
                json_modified = true;
            } else if md_exists {
                // Only .md exists → add to frontmatter
                if let Some(ref mut data) = md_data {
                    data.frontmatter.insert(field.clone(), value.clone());
                    md_modified = true;
                }
            } else {
                // Only JSON or built-in → add/create section in opencode.json
                existing_agent.insert(field.clone(), value.clone());
                json_modified = true;
            }
        }
    }

    // Write changes
    if md_modified {
        if let Some(data) = md_data {
            write_md_file(&md_path, &data.frontmatter, &data.body).await?;
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
            config = Value::Object(Map::new());
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

        write_config(&config).await?;
    }

    info!(
        "Updated agent: {} (md: {}, json: {})",
        agent_name, md_modified, json_modified
    );

    Ok(())
}

/// Delete agent configuration
pub async fn delete_agent(agent_name: &str) -> Result<()> {
    let md_path = get_agent_dir().join(format!("{}.md", agent_name));
    let mut deleted = false;

    // 1. Delete .md file if exists
    if md_path.exists() {
        fs::remove_file(&md_path).await?;
        info!("Deleted agent .md file: {}", md_path.display());
        deleted = true;
    }

    // 2. Remove section from opencode.json if exists
    let mut config = read_config().await?;
    if let Some(agents) = config.get_mut("agent").and_then(|v| v.as_object_mut()) {
        if agents.remove(agent_name).is_some() {
            write_config(&config).await?;
            info!("Removed agent from opencode.json: {}", agent_name);
            deleted = true;
        }
    }

    // 3. If nothing was deleted (built-in agent), disable it
    if !deleted {
        if !config.is_object() {
            config = Value::Object(serde_json::Map::new());
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
        write_config(&config).await?;
        info!("Disabled built-in agent: {}", agent_name);
    }

    Ok(())
}

/// Get information about where command configuration is stored
pub async fn get_command_sources(command_name: &str) -> Result<ConfigSources> {
    ensure_dirs().await?;

    let md_path = get_command_dir().join(format!("{}.md", command_name));
    let md_exists = md_path.exists();

    let mut md_fields = Vec::new();
    if md_exists {
        let md_data = parse_md_file(&md_path).await?;
        md_fields.extend(md_data.frontmatter.keys().cloned());
        if !md_data.body.trim().is_empty() {
            md_fields.push("template".to_string());
        }
    }

    let config = read_config().await?;
    let json_section = config
        .get("command")
        .and_then(|v| v.as_object())
        .and_then(|obj| obj.get(command_name));

    let json_fields = json_section
        .and_then(|value| value.as_object())
        .map(|obj| obj.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();

    let sources = ConfigSources {
        md: SourceInfo {
            exists: md_exists,
            path: md_exists.then(|| md_path.display().to_string()),
            fields: md_fields,
        },
        json: SourceInfo {
            exists: json_section.is_some(),
            path: Some(get_config_file().display().to_string()),
            fields: json_fields,
        },
    };

    Ok(sources)
}

/// Create new command as .md file
pub async fn create_command(command_name: &str, config: &HashMap<String, Value>) -> Result<()> {
    ensure_dirs().await?;

    let md_path = get_command_dir().join(format!("{}.md", command_name));

    // Check if command already exists
    if md_path.exists() {
        return Err(anyhow!(
            "Command {} already exists as .md file",
            command_name
        ));
    }

    let existing_config = read_config().await?;
    if let Some(commands) = existing_config.get("command").and_then(|v| v.as_object()) {
        if commands.contains_key(command_name) {
            return Err(anyhow!(
                "Command {} already exists in opencode.json",
                command_name
            ));
        }
    }

    // Extract template from config
    let mut frontmatter = config.clone();
    let template = frontmatter
        .remove("template")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();

    // Write .md file
    write_md_file(&md_path, &frontmatter, &template).await?;
    info!("Created new command: {}", command_name);

    Ok(())
}

/// Update existing command using field-level logic
pub async fn update_command(
    command_name: &str,
    updates: &HashMap<String, Value>,
) -> Result<()> {
    ensure_dirs().await?;

    let md_path = get_command_dir().join(format!("{}.md", command_name));
    let md_exists = md_path.exists();

    let mut md_data = if md_exists {
        Some(parse_md_file(&md_path).await?)
    } else {
        None
    };

    let mut config = read_config().await?;
    let mut existing_command = config
        .get("command")
        .and_then(|v| v.as_object())
        .and_then(|obj| obj.get(command_name))
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_else(Map::new);
    let had_json_fields = !existing_command.is_empty();

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

            if md_exists {
                if let Some(ref mut data) = md_data {
                    data.body = normalized_value.clone();
                    md_modified = true;
                }
                continue;
            } else if let Some(template_ref) = existing_command.get("template").and_then(|v| v.as_str()) {
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

            // Write template directly to JSON entry (file ref or inline string)
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

        if in_md {
            // Update in .md frontmatter
            if let Some(ref mut data) = md_data {
                data.frontmatter.insert(field.clone(), value.clone());
                md_modified = true;
            }
        } else if in_json {
            // Update in opencode.json while preserving existing fields
            existing_command.insert(field.clone(), value.clone());
            json_modified = true;
        } else {
            // Field not defined - apply priority rules
            if md_exists && !existing_command.is_empty() {
                // Both exist → add to opencode.json (higher priority)
                existing_command.insert(field.clone(), value.clone());
                json_modified = true;
            } else if md_exists {
                // Only .md exists → add to frontmatter
                if let Some(ref mut data) = md_data {
                    data.frontmatter.insert(field.clone(), value.clone());
                    md_modified = true;
                }
            } else {
                // Only JSON or built-in → add/create section in opencode.json
                existing_command.insert(field.clone(), value.clone());
                json_modified = true;
            }
        }
    }

    // Write changes
    if md_modified {
        if let Some(data) = md_data {
            write_md_file(&md_path, &data.frontmatter, &data.body).await?;
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
            config = Value::Object(Map::new());
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

        write_config(&config).await?;
    }

    info!(
        "Updated command: {} (md: {}, json: {})",
        command_name, md_modified, json_modified
    );

    Ok(())
}

/// Delete command configuration
pub async fn delete_command(command_name: &str) -> Result<()> {
    let md_path = get_command_dir().join(format!("{}.md", command_name));
    let mut deleted = false;

    // 1. Delete .md file if exists
    if md_path.exists() {
        fs::remove_file(&md_path).await?;
        info!("Deleted command .md file: {}", md_path.display());
        deleted = true;
    }

    // 2. Remove section from opencode.json if exists
    let mut config = read_config().await?;
    if let Some(commands) = config.get_mut("command").and_then(|v| v.as_object_mut()) {
        if commands.remove(command_name).is_some() {
            write_config(&config).await?;
            info!("Removed command from opencode.json: {}", command_name);
            deleted = true;
        }
    }

    // 3. If nothing was deleted, throw error
    if !deleted {
        return Err(anyhow!("Command \"{}\" not found", command_name));
    }

    Ok(())
}
