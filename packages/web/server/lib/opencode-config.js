import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import { parse as parseJsonc } from 'jsonc-parser';

const OPENCODE_CONFIG_DIR = path.join(os.homedir(), '.config', 'opencode');
const AGENT_DIR = path.join(OPENCODE_CONFIG_DIR, 'agent');
const COMMAND_DIR = path.join(OPENCODE_CONFIG_DIR, 'command');
const SKILL_DIR = path.join(OPENCODE_CONFIG_DIR, 'skill');
const CONFIG_FILE = path.join(OPENCODE_CONFIG_DIR, 'opencode.json');
const CUSTOM_CONFIG_FILE = process.env.OPENCODE_CONFIG
  ? path.resolve(process.env.OPENCODE_CONFIG)
  : null;
const PROMPT_FILE_PATTERN = /^\{file:(.+)\}$/i;

// Scope types (shared by agents and commands)
const AGENT_SCOPE = {
  USER: 'user',
  PROJECT: 'project'
};

const COMMAND_SCOPE = {
  USER: 'user',
  PROJECT: 'project'
};

const SKILL_SCOPE = {
  USER: 'user',
  PROJECT: 'project'
};

function ensureDirs() {
  if (!fs.existsSync(OPENCODE_CONFIG_DIR)) {
    fs.mkdirSync(OPENCODE_CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(AGENT_DIR)) {
    fs.mkdirSync(AGENT_DIR, { recursive: true });
  }
  if (!fs.existsSync(COMMAND_DIR)) {
    fs.mkdirSync(COMMAND_DIR, { recursive: true });
  }
  if (!fs.existsSync(SKILL_DIR)) {
    fs.mkdirSync(SKILL_DIR, { recursive: true });
  }
}

// ============== AGENT SCOPE HELPERS ==============

/**
 * Ensure project-level agent directory exists
 */
function ensureProjectAgentDir(workingDirectory) {
  const projectAgentDir = path.join(workingDirectory, '.opencode', 'agent');
  if (!fs.existsSync(projectAgentDir)) {
    fs.mkdirSync(projectAgentDir, { recursive: true });
  }
  return projectAgentDir;
}

/**
 * Get project-level agent path
 */
function getProjectAgentPath(workingDirectory, agentName) {
  return path.join(workingDirectory, '.opencode', 'agent', `${agentName}.md`);
}

/**
 * Get user-level agent path
 */
function getUserAgentPath(agentName) {
  return path.join(AGENT_DIR, `${agentName}.md`);
}

/**
 * Determine agent scope based on where the .md file exists
 * Priority: project level > user level > null (built-in only)
 */
function getAgentScope(agentName, workingDirectory) {
  if (workingDirectory) {
    const projectPath = getProjectAgentPath(workingDirectory, agentName);
    if (fs.existsSync(projectPath)) {
      return { scope: AGENT_SCOPE.PROJECT, path: projectPath };
    }
  }
  
  const userPath = getUserAgentPath(agentName);
  if (fs.existsSync(userPath)) {
    return { scope: AGENT_SCOPE.USER, path: userPath };
  }
  
  return { scope: null, path: null };
}

/**
 * Get the path where an agent should be written based on scope
 */
function getAgentWritePath(agentName, workingDirectory, requestedScope) {
  // For updates: check existing location first (project takes precedence)
  const existing = getAgentScope(agentName, workingDirectory);
  if (existing.path) {
    return existing;
  }

  // For new agents or built-in overrides: use requested scope or default to user
  const scope = requestedScope || AGENT_SCOPE.USER;
  if (scope === AGENT_SCOPE.PROJECT && workingDirectory) {
    return {
      scope: AGENT_SCOPE.PROJECT,
      path: getProjectAgentPath(workingDirectory, agentName)
    };
  }

  return {
    scope: AGENT_SCOPE.USER,
    path: getUserAgentPath(agentName)
  };
}

/**
 * Detect where an agent's permission field is currently defined
 * Priority: project .md > user .md > project JSON > user JSON
 * Returns: { source: 'md'|'json'|null, scope: 'project'|'user'|null, path: string|null }
 */
function getAgentPermissionSource(agentName, workingDirectory) {
  // Check project-level .md first
  if (workingDirectory) {
    const projectMdPath = getProjectAgentPath(workingDirectory, agentName);
    if (fs.existsSync(projectMdPath)) {
      const { frontmatter } = parseMdFile(projectMdPath);
      if (frontmatter.permission !== undefined) {
        return { source: 'md', scope: AGENT_SCOPE.PROJECT, path: projectMdPath };
      }
    }
  }

  // Check user-level .md
  const userMdPath = getUserAgentPath(agentName);
  if (fs.existsSync(userMdPath)) {
    const { frontmatter } = parseMdFile(userMdPath);
    if (frontmatter.permission !== undefined) {
      return { source: 'md', scope: AGENT_SCOPE.USER, path: userMdPath };
    }
  }

  // Check JSON layers (project > user)
  const layers = readConfigLayers(workingDirectory);

  // Project opencode.json
  const projectJsonPermission = layers.projectConfig?.agent?.[agentName]?.permission;
  if (projectJsonPermission !== undefined && layers.paths.projectPath) {
    return { source: 'json', scope: AGENT_SCOPE.PROJECT, path: layers.paths.projectPath };
  }

  // User opencode.json
  const userJsonPermission = layers.userConfig?.agent?.[agentName]?.permission;
  if (userJsonPermission !== undefined) {
    return { source: 'json', scope: AGENT_SCOPE.USER, path: layers.paths.userPath };
  }

  // Custom config (env var)
  const customJsonPermission = layers.customConfig?.agent?.[agentName]?.permission;
  if (customJsonPermission !== undefined && layers.paths.customPath) {
    return { source: 'json', scope: 'custom', path: layers.paths.customPath };
  }

  return { source: null, scope: null, path: null };
}

// ============== COMMAND SCOPE HELPERS ==============

/**
 * Ensure project-level command directory exists
 */
function ensureProjectCommandDir(workingDirectory) {
  const projectCommandDir = path.join(workingDirectory, '.opencode', 'command');
  if (!fs.existsSync(projectCommandDir)) {
    fs.mkdirSync(projectCommandDir, { recursive: true });
  }
  return projectCommandDir;
}

/**
 * Get project-level command path
 */
function getProjectCommandPath(workingDirectory, commandName) {
  return path.join(workingDirectory, '.opencode', 'command', `${commandName}.md`);
}

/**
 * Get user-level command path
 */
function getUserCommandPath(commandName) {
  return path.join(COMMAND_DIR, `${commandName}.md`);
}

/**
 * Determine command scope based on where the .md file exists
 * Priority: project level > user level > null (built-in only)
 */
function getCommandScope(commandName, workingDirectory) {
  if (workingDirectory) {
    const projectPath = getProjectCommandPath(workingDirectory, commandName);
    if (fs.existsSync(projectPath)) {
      return { scope: COMMAND_SCOPE.PROJECT, path: projectPath };
    }
  }
  
  const userPath = getUserCommandPath(commandName);
  if (fs.existsSync(userPath)) {
    return { scope: COMMAND_SCOPE.USER, path: userPath };
  }
  
  return { scope: null, path: null };
}

/**
 * Get the path where a command should be written based on scope
 */
function getCommandWritePath(commandName, workingDirectory, requestedScope) {
  // For updates: check existing location first (project takes precedence)
  const existing = getCommandScope(commandName, workingDirectory);
  if (existing.path) {
    return existing;
  }
  
  // For new commands or built-in overrides: use requested scope or default to user
  const scope = requestedScope || COMMAND_SCOPE.USER;
  if (scope === COMMAND_SCOPE.PROJECT && workingDirectory) {
    return { 
      scope: COMMAND_SCOPE.PROJECT, 
      path: getProjectCommandPath(workingDirectory, commandName) 
    };
  }
  
  return { 
    scope: COMMAND_SCOPE.USER, 
    path: getUserCommandPath(commandName) 
  };
}

// ============== SKILL SCOPE HELPERS ==============

/**
 * Ensure project-level skill directory exists
 */
function ensureProjectSkillDir(workingDirectory) {
  const projectSkillDir = path.join(workingDirectory, '.opencode', 'skill');
  if (!fs.existsSync(projectSkillDir)) {
    fs.mkdirSync(projectSkillDir, { recursive: true });
  }
  return projectSkillDir;
}

/**
 * Get project-level skill directory path (.opencode/skill/{name}/)
 */
function getProjectSkillDir(workingDirectory, skillName) {
  return path.join(workingDirectory, '.opencode', 'skill', skillName);
}

/**
 * Get project-level skill SKILL.md path
 */
function getProjectSkillPath(workingDirectory, skillName) {
  return path.join(getProjectSkillDir(workingDirectory, skillName), 'SKILL.md');
}

/**
 * Get user-level skill directory path
 */
function getUserSkillDir(skillName) {
  return path.join(SKILL_DIR, skillName);
}

/**
 * Get user-level skill SKILL.md path
 */
function getUserSkillPath(skillName) {
  return path.join(getUserSkillDir(skillName), 'SKILL.md');
}

/**
 * Get Claude-compatible skill directory path (.claude/skills/{name}/)
 */
function getClaudeSkillDir(workingDirectory, skillName) {
  return path.join(workingDirectory, '.claude', 'skills', skillName);
}

/**
 * Get Claude-compatible skill SKILL.md path
 */
function getClaudeSkillPath(workingDirectory, skillName) {
  return path.join(getClaudeSkillDir(workingDirectory, skillName), 'SKILL.md');
}

/**
 * Determine skill scope based on where the SKILL.md file exists
 * Priority: project level (.opencode) > user level > claude-compat (.claude/skills)
 */
function getSkillScope(skillName, workingDirectory) {
  if (workingDirectory) {
    // Check .opencode/skill first
    const projectPath = getProjectSkillPath(workingDirectory, skillName);
    if (fs.existsSync(projectPath)) {
      return { scope: SKILL_SCOPE.PROJECT, path: projectPath, source: 'opencode' };
    }
    
    // Check .claude/skills (claude-compat)
    const claudePath = getClaudeSkillPath(workingDirectory, skillName);
    if (fs.existsSync(claudePath)) {
      return { scope: SKILL_SCOPE.PROJECT, path: claudePath, source: 'claude' };
    }
  }
  
  const userPath = getUserSkillPath(skillName);
  if (fs.existsSync(userPath)) {
    return { scope: SKILL_SCOPE.USER, path: userPath, source: 'opencode' };
  }
  
  return { scope: null, path: null, source: null };
}

/**
 * Get the path where a skill should be written based on scope
 * Note: We never write to .claude/skills, only read from there
 */
function getSkillWritePath(skillName, workingDirectory, requestedScope) {
  // For updates: check existing location first
  const existing = getSkillScope(skillName, workingDirectory);
  if (existing.path) {
    // If it's from .claude/skills, we still edit in place
    return existing;
  }
  
  // For new skills: use requested scope or default to user
  const scope = requestedScope || SKILL_SCOPE.USER;
  if (scope === SKILL_SCOPE.PROJECT && workingDirectory) {
    return { 
      scope: SKILL_SCOPE.PROJECT, 
      path: getProjectSkillPath(workingDirectory, skillName),
      source: 'opencode'
    };
  }
  
  return { 
    scope: SKILL_SCOPE.USER, 
    path: getUserSkillPath(skillName),
    source: 'opencode'
  };
}

/**
 * List all supporting files in a skill directory (excluding SKILL.md)
 */
function listSkillSupportingFiles(skillDir) {
  if (!fs.existsSync(skillDir)) {
    return [];
  }
  
  const files = [];
  
  function walkDir(dir, relativePath = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;
      
      if (entry.isDirectory()) {
        walkDir(fullPath, relPath);
      } else if (entry.name !== 'SKILL.md') {
        files.push({
          name: entry.name,
          path: relPath,
          fullPath: fullPath
        });
      }
    }
  }
  
  walkDir(skillDir);
  return files;
}

/**
 * Read a supporting file content
 */
function readSkillSupportingFile(skillDir, relativePath) {
  const fullPath = path.join(skillDir, relativePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return fs.readFileSync(fullPath, 'utf8');
}

/**
 * Write a supporting file
 */
function writeSkillSupportingFile(skillDir, relativePath, content) {
  const fullPath = path.join(skillDir, relativePath);
  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

/**
 * Delete a supporting file
 */
function deleteSkillSupportingFile(skillDir, relativePath) {
  const fullPath = path.join(skillDir, relativePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    // Clean up empty parent directories
    let parentDir = path.dirname(fullPath);
    while (parentDir !== skillDir) {
      try {
        const entries = fs.readdirSync(parentDir);
        if (entries.length === 0) {
          fs.rmdirSync(parentDir);
          parentDir = path.dirname(parentDir);
        } else {
          break;
        }
      } catch {
        break;
      }
    }
  }
}

function isPromptFileReference(value) {
  if (typeof value !== 'string') {
    return false;
  }
  return PROMPT_FILE_PATTERN.test(value.trim());
}

function resolvePromptFilePath(reference) {
  const match = typeof reference === 'string' ? reference.trim().match(PROMPT_FILE_PATTERN) : null;
  if (!match) {
    return null;
  }
  let target = match[1].trim();
  if (!target) {
    return null;
  }

  if (target.startsWith('./')) {
    target = target.slice(2);
    target = path.join(OPENCODE_CONFIG_DIR, target);
  } else if (!path.isAbsolute(target)) {
    target = path.join(OPENCODE_CONFIG_DIR, target);
  }

  return target;
}

function writePromptFile(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content ?? '', 'utf8');
  console.log(`Updated prompt file: ${filePath}`);
}

/**
 * Get all possible project config paths in priority order
 * Priority: root > .opencode/, json > jsonc
 */
function getProjectConfigCandidates(workingDirectory) {
  if (!workingDirectory) return [];
  return [
    path.join(workingDirectory, 'opencode.json'),
    path.join(workingDirectory, 'opencode.jsonc'),
    path.join(workingDirectory, '.opencode', 'opencode.json'),
    path.join(workingDirectory, '.opencode', 'opencode.jsonc'),
  ];
}

/**
 * Find existing project config file or return default path for new config
 */
function getProjectConfigPath(workingDirectory) {
  if (!workingDirectory) return null;

  const candidates = getProjectConfigCandidates(workingDirectory);

  // Return first existing config file
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Default to root opencode.json for new configs
  return candidates[0];
}

/**
 * Merge new permission config with existing non-wildcard patterns
 * Non-wildcard patterns (patterns other than "*") are preserved from existing config
 * @param {object|string|null} newPermission - New permission config from UI (wildcards only)
 * @param {object} permissionSource - Result from getAgentPermissionSource
 * @param {string} agentName - Agent name
 * @param {string|null} workingDirectory - Working directory
 * @returns {object|string|null} Merged permission config
 */
function mergePermissionWithNonWildcards(newPermission, permissionSource, agentName, workingDirectory) {
  // If no existing permission, return new permission as-is
  if (!permissionSource.source || !permissionSource.path) {
    return newPermission;
  }

  // Get existing permission config
  let existingPermission = null;
  if (permissionSource.source === 'md') {
    const { frontmatter } = parseMdFile(permissionSource.path);
    existingPermission = frontmatter.permission;
  } else if (permissionSource.source === 'json') {
    const config = readConfigFile(permissionSource.path);
    existingPermission = config?.agent?.[agentName]?.permission;
  }

  // If no existing permission or it's a simple string, return new permission as-is
  if (!existingPermission || typeof existingPermission === 'string') {
    return newPermission;
  }

  // If new permission is null/undefined, return null to clear it
  if (newPermission == null) {
    return null;
  }

  // If new permission is a simple string (e.g., "allow"), return it as-is
  if (typeof newPermission === 'string') {
    return newPermission;
  }

  // Extract non-wildcard patterns from existing permission
  const nonWildcardPatterns = {};
  for (const [permKey, permValue] of Object.entries(existingPermission)) {
    if (permKey === '*') continue; // Skip global default

    if (typeof permValue === 'object' && permValue !== null && !Array.isArray(permValue)) {
      // Permission has pattern-based config (e.g., { "npm *": "allow", "*": "ask" })
      const nonWildcards = {};
      for (const [pattern, action] of Object.entries(permValue)) {
        if (pattern !== '*') {
          nonWildcards[pattern] = action;
        }
      }
      if (Object.keys(nonWildcards).length > 0) {
        nonWildcardPatterns[permKey] = nonWildcards;
      }
    }
    // Simple string values (e.g., "allow") don't have patterns, skip them
  }

  // If no non-wildcard patterns to preserve, return new permission as-is
  if (Object.keys(nonWildcardPatterns).length === 0) {
    return newPermission;
  }

  // Merge non-wildcards into new permission
  const merged = { ...newPermission };
  for (const [permKey, patterns] of Object.entries(nonWildcardPatterns)) {
    const newValue = merged[permKey];
    if (typeof newValue === 'string') {
      // Convert string to object with wildcard + preserved patterns
      merged[permKey] = { '*': newValue, ...patterns };
    } else if (typeof newValue === 'object' && newValue !== null) {
      // Merge patterns, new wildcards take precedence
      merged[permKey] = { ...patterns, ...newValue };
    } else {
      // Permission not in new config - preserve existing patterns with their wildcard if it existed
      const existingValue = existingPermission[permKey];
      if (typeof existingValue === 'object' && existingValue !== null) {
        const wildcard = existingValue['*'];
        merged[permKey] = wildcard ? { '*': wildcard, ...patterns } : patterns;
      }
    }
  }

  return merged;
}

function getConfigPaths(workingDirectory) {
  return {
    userPath: CONFIG_FILE,
    projectPath: getProjectConfigPath(workingDirectory),
    customPath: CUSTOM_CONFIG_FILE
  };
}

function readConfigFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const normalized = content.trim();
    if (!normalized) {
      return {};
    }
    // jsonc-parser handles comments, trailing commas, unquoted keys
    return parseJsonc(normalized, [], { allowTrailingComma: true });
  } catch (error) {
    console.error(`Failed to read config file: ${filePath}`, error);
    throw new Error('Failed to read OpenCode configuration');
  }
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function mergeConfigs(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override;
  }
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (key in result) {
      const baseValue = result[key];
      if (isPlainObject(baseValue) && isPlainObject(value)) {
        result[key] = mergeConfigs(baseValue, value);
      } else {
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

function readConfigLayers(workingDirectory) {
  const { userPath, projectPath, customPath } = getConfigPaths(workingDirectory);
  const userConfig = readConfigFile(userPath);
  const projectConfig = readConfigFile(projectPath);
  const customConfig = readConfigFile(customPath);
  const mergedConfig = mergeConfigs(mergeConfigs(userConfig, projectConfig), customConfig);

  return {
    userConfig,
    projectConfig,
    customConfig,
    mergedConfig,
    paths: { userPath, projectPath, customPath }
  };
}

function readConfig(workingDirectory) {
  return readConfigLayers(workingDirectory).mergedConfig;
}

function writeConfig(config, filePath = CONFIG_FILE) {
  try {
    if (fs.existsSync(filePath)) {
      const backupFile = `${filePath}.openchamber.backup`;
      fs.copyFileSync(filePath, backupFile);
      console.log(`Created config backup: ${backupFile}`);
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`Successfully wrote config file: ${filePath}`);
  } catch (error) {
    console.error(`Failed to write config file: ${filePath}`, error);
    throw new Error('Failed to write OpenCode configuration');
  }
}

function getJsonEntrySource(layers, sectionKey, entryName) {
  const { userConfig, projectConfig, customConfig, paths } = layers;
  const customSection = customConfig?.[sectionKey]?.[entryName];
  if (customSection !== undefined) {
    return { section: customSection, config: customConfig, path: paths.customPath, exists: true };
  }

  const projectSection = projectConfig?.[sectionKey]?.[entryName];
  if (projectSection !== undefined) {
    return { section: projectSection, config: projectConfig, path: paths.projectPath, exists: true };
  }

  const userSection = userConfig?.[sectionKey]?.[entryName];
  if (userSection !== undefined) {
    return { section: userSection, config: userConfig, path: paths.userPath, exists: true };
  }

  return { section: null, config: null, path: null, exists: false };
}

function getJsonWriteTarget(layers, preferredScope) {
  const { userConfig, projectConfig, customConfig, paths } = layers;
  if (paths.customPath) {
    return { config: customConfig, path: paths.customPath };
  }
  if (preferredScope === AGENT_SCOPE.PROJECT && paths.projectPath) {
    return { config: projectConfig, path: paths.projectPath };
  }
  if (paths.projectPath) {
    return { config: projectConfig, path: paths.projectPath };
  }
  return { config: userConfig, path: paths.userPath };
}

function parseMdFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

  if (!match) {
    return { frontmatter: {}, body: content.trim() };
  }

  let frontmatter = {};
  try {
    frontmatter = yaml.parse(match[1]) || {};
  } catch (error) {
    console.warn(`Failed to parse markdown frontmatter ${filePath}, treating as empty:`, error);
    frontmatter = {};
  }

  const body = match[2].trim();
  return { frontmatter, body };
}

function writeMdFile(filePath, frontmatter, body) {
  try {
    // Filter out null/undefined values - OpenCode expects keys to be omitted rather than set to null
    const cleanedFrontmatter = Object.fromEntries(
      Object.entries(frontmatter).filter(([, value]) => value != null)
    );
    const yamlStr = yaml.stringify(cleanedFrontmatter);
    const content = `---\n${yamlStr}---\n\n${body}`;
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Successfully wrote markdown file: ${filePath}`);
  } catch (error) {
    console.error(`Failed to write markdown file ${filePath}:`, error);
    throw new Error('Failed to write agent markdown file');
  }
}

function getAgentSources(agentName, workingDirectory) {
  // Check project level first (takes precedence)
  const projectPath = workingDirectory ? getProjectAgentPath(workingDirectory, agentName) : null;
  const projectExists = projectPath && fs.existsSync(projectPath);
  
  // Then check user level
  const userPath = getUserAgentPath(agentName);
  const userExists = fs.existsSync(userPath);
  
  // Determine which md file to use (project takes precedence)
  const mdPath = projectExists ? projectPath : (userExists ? userPath : null);
  const mdExists = !!mdPath;
  const mdScope = projectExists ? AGENT_SCOPE.PROJECT : (userExists ? AGENT_SCOPE.USER : null);

  const layers = readConfigLayers(workingDirectory);
  const jsonSource = getJsonEntrySource(layers, 'agent', agentName);
  const jsonSection = jsonSource.section;
  const jsonPath = jsonSource.path || layers.paths.customPath || layers.paths.projectPath || layers.paths.userPath;
  const jsonScope = jsonSource.path === layers.paths.projectPath ? AGENT_SCOPE.PROJECT : AGENT_SCOPE.USER;

  const sources = {
    md: {
      exists: mdExists,
      path: mdPath,
      scope: mdScope,
      fields: []
    },
    json: {
      exists: jsonSource.exists,
      path: jsonPath,
      scope: jsonSource.exists ? jsonScope : null,
      fields: []
    },
    // Additional info about both levels
    projectMd: {
      exists: projectExists,
      path: projectPath
    },
    userMd: {
      exists: userExists,
      path: userPath
    }
  };

  if (mdExists) {
    const { frontmatter, body } = parseMdFile(mdPath);
    sources.md.fields = Object.keys(frontmatter);
    if (body) {
      sources.md.fields.push('prompt');
    }
  }

  if (jsonSection) {
    sources.json.fields = Object.keys(jsonSection);
  }

  return sources;
}

function getAgentConfig(agentName, workingDirectory) {
  // Prefer markdown agents (project > user)
  const projectPath = workingDirectory ? getProjectAgentPath(workingDirectory, agentName) : null;
  const projectExists = projectPath && fs.existsSync(projectPath);

  const userPath = getUserAgentPath(agentName);
  const userExists = fs.existsSync(userPath);

  if (projectExists || userExists) {
    const mdPath = projectExists ? projectPath : userPath;
    const { frontmatter, body } = parseMdFile(mdPath);

    return {
      source: 'md',
      scope: projectExists ? AGENT_SCOPE.PROJECT : AGENT_SCOPE.USER,
      config: {
        ...frontmatter,
        ...(typeof body === 'string' && body.length > 0 ? { prompt: body } : {}),
      },
    };
  }

  // Then fall back to opencode.json (highest-precedence entry)
  const layers = readConfigLayers(workingDirectory);
  const jsonSource = getJsonEntrySource(layers, 'agent', agentName);

  if (jsonSource.exists && jsonSource.section) {
    const scope = jsonSource.path === layers.paths.projectPath ? AGENT_SCOPE.PROJECT : AGENT_SCOPE.USER;
    return {
      source: 'json',
      scope,
      config: { ...jsonSource.section },
    };
  }

  return {
    source: 'none',
    scope: null,
    config: {},
  };
}

function createAgent(agentName, config, workingDirectory, scope) {
  ensureDirs();

  // Check if agent already exists at either level
  const projectPath = workingDirectory ? getProjectAgentPath(workingDirectory, agentName) : null;
  const userPath = getUserAgentPath(agentName);
  
  if (projectPath && fs.existsSync(projectPath)) {
    throw new Error(`Agent ${agentName} already exists as project-level .md file`);
  }
  
  if (fs.existsSync(userPath)) {
    throw new Error(`Agent ${agentName} already exists as user-level .md file`);
  }

  const layers = readConfigLayers(workingDirectory);
  const jsonSource = getJsonEntrySource(layers, 'agent', agentName);
  if (jsonSource.exists) {
    throw new Error(`Agent ${agentName} already exists in opencode.json`);
  }

  // Determine target path based on requested scope
  let targetPath;
  let targetScope;
  
  if (scope === AGENT_SCOPE.PROJECT && workingDirectory) {
    ensureProjectAgentDir(workingDirectory);
    targetPath = projectPath;
    targetScope = AGENT_SCOPE.PROJECT;
  } else {
    targetPath = userPath;
    targetScope = AGENT_SCOPE.USER;
  }

  // Extract scope and prompt from config - scope is only used for path determination, not written to file
  const { prompt, scope: _scopeFromConfig, ...frontmatter } = config;

  writeMdFile(targetPath, frontmatter, prompt || '');
  console.log(`Created new agent: ${agentName} (scope: ${targetScope}, path: ${targetPath})`);
}

function updateAgent(agentName, updates, workingDirectory) {
  ensureDirs();

  // Determine correct path: project level takes precedence
  const { scope, path: mdPath } = getAgentWritePath(agentName, workingDirectory);
  const mdExists = mdPath && fs.existsSync(mdPath);
  
  // Check if agent exists in opencode.json across all config layers
  const layers = readConfigLayers(workingDirectory);
  const jsonSource = getJsonEntrySource(layers, 'agent', agentName);
  const jsonSection = jsonSource.section;
  const hasJsonFields = jsonSource.exists && jsonSection && Object.keys(jsonSection).length > 0;
  const jsonTarget = jsonSource.exists
    ? { config: jsonSource.config, path: jsonSource.path }
    : getJsonWriteTarget(layers, AGENT_SCOPE.USER);
  let config = jsonTarget.config || {};
  
  // Determine if we should create a new md file:
  // Only for built-in agents (no md file AND no json config)
  const isBuiltinOverride = !mdExists && !hasJsonFields;
  
  let targetPath = mdPath;
  let targetScope = scope;
  
  if (!mdExists && isBuiltinOverride) {
    // Built-in agent override - create at user level
    targetPath = getUserAgentPath(agentName);
    targetScope = AGENT_SCOPE.USER;
  }

  // Only create md data for existing md files or built-in overrides
  let mdData = mdExists ? parseMdFile(mdPath) : (isBuiltinOverride ? { frontmatter: {}, body: '' } : null);

  let mdModified = false;
  let jsonModified = false;
  // Only create new md if it's a built-in override
  let creatingNewMd = isBuiltinOverride;

  for (const [field, value] of Object.entries(updates)) {

    if (field === 'prompt') {
      const normalizedValue = typeof value === 'string' ? value : (value == null ? '' : String(value));

      if (mdExists || creatingNewMd) {
        if (mdData) {
          mdData.body = normalizedValue;
          mdModified = true;
        }
        continue;
      } else if (isPromptFileReference(jsonSection?.prompt)) {
        const promptFilePath = resolvePromptFilePath(jsonSection.prompt);
        if (!promptFilePath) {
          throw new Error(`Invalid prompt file reference for agent ${agentName}`);
        }
        writePromptFile(promptFilePath, normalizedValue);
        continue;
      } else if (isPromptFileReference(normalizedValue)) {
        if (!config.agent) config.agent = {};
        if (!config.agent[agentName]) config.agent[agentName] = {};
        config.agent[agentName].prompt = normalizedValue;
        jsonModified = true;
        continue;
      }

      // For JSON-only agents, store prompt inline in JSON
      if (!config.agent) config.agent = {};
      if (!config.agent[agentName]) config.agent[agentName] = {};
      config.agent[agentName].prompt = normalizedValue;
      jsonModified = true;
      continue;
    }

    // Special handling for permission field - uses location detection and preserves non-wildcards
    if (field === 'permission') {
      const permissionSource = getAgentPermissionSource(agentName, workingDirectory);
      const newPermission = mergePermissionWithNonWildcards(value, permissionSource, agentName, workingDirectory);

      if (permissionSource.source === 'md') {
        // Write to existing .md file
        const existingMdData = parseMdFile(permissionSource.path);
        existingMdData.frontmatter.permission = newPermission;
        writeMdFile(permissionSource.path, existingMdData.frontmatter, existingMdData.body);
        console.log(`Updated permission in .md file: ${permissionSource.path}`);
      } else if (permissionSource.source === 'json') {
        // Write to existing JSON location
        const existingConfig = readConfigFile(permissionSource.path);
        if (!existingConfig.agent) existingConfig.agent = {};
        if (!existingConfig.agent[agentName]) existingConfig.agent[agentName] = {};
        existingConfig.agent[agentName].permission = newPermission;
        writeConfig(existingConfig, permissionSource.path);
        console.log(`Updated permission in JSON: ${permissionSource.path}`);
      } else {
        // Permission not defined anywhere - use agent's source location
        if ((mdExists || creatingNewMd) && mdData) {
          mdData.frontmatter.permission = newPermission;
          mdModified = true;
        } else if (hasJsonFields) {
          // Agent exists in JSON - add permission there
          if (!config.agent) config.agent = {};
          if (!config.agent[agentName]) config.agent[agentName] = {};
          config.agent[agentName].permission = newPermission;
          jsonModified = true;
        } else {
          // Built-in agent with no config - write to project JSON if available, else user JSON
          const writeTarget = workingDirectory
            ? { config: layers.projectConfig || {}, path: layers.paths.projectPath || layers.paths.userPath }
            : { config: layers.userConfig || {}, path: layers.paths.userPath };
          if (!writeTarget.config.agent) writeTarget.config.agent = {};
          if (!writeTarget.config.agent[agentName]) writeTarget.config.agent[agentName] = {};
          writeTarget.config.agent[agentName].permission = newPermission;
          writeConfig(writeTarget.config, writeTarget.path);
          console.log(`Created permission in JSON: ${writeTarget.path}`);
        }
      }
      continue;
    }

    const inMd = mdData?.frontmatter?.[field] !== undefined;
    const inJson = jsonSection?.[field] !== undefined;

    if (value === null) {
      // Treat null as a request to remove the field.
      if (mdData && inMd) {
        delete mdData.frontmatter[field];
        mdModified = true;
      }

      if (inJson) {
        if (config.agent?.[agentName]) {
          delete config.agent[agentName][field];

          if (Object.keys(config.agent[agentName]).length === 0) {
            delete config.agent[agentName];
          }
          if (Object.keys(config.agent).length === 0) {
            delete config.agent;
          }

          jsonModified = true;
        }
      }

      continue;
    }

    // JSON takes precedence over md, so update JSON first if field exists there
    if (inJson) {
      if (!config.agent) config.agent = {};
      if (!config.agent[agentName]) config.agent[agentName] = {};
      config.agent[agentName][field] = value;
      jsonModified = true;
    } else if (inMd || creatingNewMd) {
      if (mdData) {
        mdData.frontmatter[field] = value;
        mdModified = true;
      }
    } else {
      // New field - add to the appropriate location based on agent source
      if ((mdExists || creatingNewMd) && mdData) {
        mdData.frontmatter[field] = value;
        mdModified = true;
      } else {
        // JSON-only agent or has JSON fields - add to JSON
        if (!config.agent) config.agent = {};
        if (!config.agent[agentName]) config.agent[agentName] = {};
        config.agent[agentName][field] = value;
        jsonModified = true;
      }
    }
  }

  if (mdModified && mdData) {
    writeMdFile(targetPath, mdData.frontmatter, mdData.body);
  }

  if (jsonModified) {
    writeConfig(config, jsonTarget.path || CONFIG_FILE);
  }

  console.log(`Updated agent: ${agentName} (scope: ${targetScope}, md: ${mdModified}, json: ${jsonModified})`);
}

function deleteAgent(agentName, workingDirectory) {
  let deleted = false;

  // Check project level first (takes precedence)
  if (workingDirectory) {
    const projectPath = getProjectAgentPath(workingDirectory, agentName);
    if (fs.existsSync(projectPath)) {
      fs.unlinkSync(projectPath);
      console.log(`Deleted project-level agent .md file: ${projectPath}`);
      deleted = true;
    }
  }

  // Then check user level
  const userPath = getUserAgentPath(agentName);
  if (fs.existsSync(userPath)) {
    fs.unlinkSync(userPath);
    console.log(`Deleted user-level agent .md file: ${userPath}`);
    deleted = true;
  }

  // Also check json config (highest precedence entry only)
  const layers = readConfigLayers(workingDirectory);
  const jsonSource = getJsonEntrySource(layers, 'agent', agentName);
  if (jsonSource.exists && jsonSource.config && jsonSource.path) {
    if (!jsonSource.config.agent) jsonSource.config.agent = {};
    delete jsonSource.config.agent[agentName];
    writeConfig(jsonSource.config, jsonSource.path);
    console.log(`Removed agent from opencode.json: ${agentName}`);
    deleted = true;
  }

  // If nothing was deleted (built-in agent), disable it in highest-precedence config
  if (!deleted) {
    const jsonTarget = getJsonWriteTarget(layers, workingDirectory ? AGENT_SCOPE.PROJECT : AGENT_SCOPE.USER);
    const targetConfig = jsonTarget.config || {};
    if (!targetConfig.agent) targetConfig.agent = {};
    targetConfig.agent[agentName] = { disable: true };
    writeConfig(targetConfig, jsonTarget.path || CONFIG_FILE);
    console.log(`Disabled built-in agent: ${agentName}`);
  }
}

function getCommandSources(commandName, workingDirectory) {
  // Check project level first (takes precedence)
  const projectPath = workingDirectory ? getProjectCommandPath(workingDirectory, commandName) : null;
  const projectExists = projectPath && fs.existsSync(projectPath);
  
  // Then check user level
  const userPath = getUserCommandPath(commandName);
  const userExists = fs.existsSync(userPath);
  
  // Determine which md file to use (project takes precedence)
  const mdPath = projectExists ? projectPath : (userExists ? userPath : null);
  const mdExists = !!mdPath;
  const mdScope = projectExists ? COMMAND_SCOPE.PROJECT : (userExists ? COMMAND_SCOPE.USER : null);

  const layers = readConfigLayers(workingDirectory);
  const jsonSource = getJsonEntrySource(layers, 'command', commandName);
  const jsonSection = jsonSource.section;
  const jsonPath = jsonSource.path || layers.paths.customPath || layers.paths.projectPath || layers.paths.userPath;
  const jsonScope = jsonSource.path === layers.paths.projectPath ? COMMAND_SCOPE.PROJECT : COMMAND_SCOPE.USER;

  const sources = {
    md: {
      exists: mdExists,
      path: mdPath,
      scope: mdScope,
      fields: []
    },
    json: {
      exists: jsonSource.exists,
      path: jsonPath,
      scope: jsonSource.exists ? jsonScope : null,
      fields: []
    },
    // Additional info about both levels
    projectMd: {
      exists: projectExists,
      path: projectPath
    },
    userMd: {
      exists: userExists,
      path: userPath
    }
  };

  if (mdExists) {
    const { frontmatter, body } = parseMdFile(mdPath);
    sources.md.fields = Object.keys(frontmatter);
    if (body) {
      sources.md.fields.push('template');
    }
  }

  if (jsonSection) {
    sources.json.fields = Object.keys(jsonSection);
  }

  return sources;
}

function createCommand(commandName, config, workingDirectory, scope) {
  ensureDirs();

  // Check if command already exists at either level
  const projectPath = workingDirectory ? getProjectCommandPath(workingDirectory, commandName) : null;
  const userPath = getUserCommandPath(commandName);
  
  if (projectPath && fs.existsSync(projectPath)) {
    throw new Error(`Command ${commandName} already exists as project-level .md file`);
  }
  
  if (fs.existsSync(userPath)) {
    throw new Error(`Command ${commandName} already exists as user-level .md file`);
  }

  const layers = readConfigLayers(workingDirectory);
  const jsonSource = getJsonEntrySource(layers, 'command', commandName);
  if (jsonSource.exists) {
    throw new Error(`Command ${commandName} already exists in opencode.json`);
  }

  // Determine target path based on requested scope
  let targetPath;
  let targetScope;
  
  if (scope === COMMAND_SCOPE.PROJECT && workingDirectory) {
    ensureProjectCommandDir(workingDirectory);
    targetPath = projectPath;
    targetScope = COMMAND_SCOPE.PROJECT;
  } else {
    targetPath = userPath;
    targetScope = COMMAND_SCOPE.USER;
  }

  // Extract scope from config - it's only used for path determination, not written to file
  const { template, scope: _scopeFromConfig, ...frontmatter } = config;

  writeMdFile(targetPath, frontmatter, template || '');
  console.log(`Created new command: ${commandName} (scope: ${targetScope}, path: ${targetPath})`);
}

function updateCommand(commandName, updates, workingDirectory) {
  ensureDirs();

  // Determine correct path: project level takes precedence
  const { scope, path: mdPath } = getCommandWritePath(commandName, workingDirectory);
  const mdExists = mdPath && fs.existsSync(mdPath);

  const layers = readConfigLayers(workingDirectory);
  const jsonSource = getJsonEntrySource(layers, 'command', commandName);
  const jsonSection = jsonSource.section;
  const hasJsonFields = jsonSource.exists && jsonSection && Object.keys(jsonSection).length > 0;
  const jsonTarget = jsonSource.exists
    ? { config: jsonSource.config, path: jsonSource.path }
    : getJsonWriteTarget(layers, workingDirectory ? COMMAND_SCOPE.PROJECT : COMMAND_SCOPE.USER);
  let config = jsonTarget.config || {};

  // Only create a new md file for built-in overrides (no md + no json)
  const isBuiltinOverride = !mdExists && !hasJsonFields;

  let targetPath = mdPath;
  let targetScope = scope;

  if (!mdExists && isBuiltinOverride) {
    // Built-in command override - create at user level
    targetPath = getUserCommandPath(commandName);
    targetScope = COMMAND_SCOPE.USER;
  }

  const mdData = mdExists ? parseMdFile(mdPath) : (isBuiltinOverride ? { frontmatter: {}, body: '' } : null);

  let mdModified = false;
  let jsonModified = false;
  let creatingNewMd = isBuiltinOverride;

  for (const [field, value] of Object.entries(updates)) {

    if (field === 'template') {
      const normalizedValue = typeof value === 'string' ? value : (value == null ? '' : String(value));

      if (mdExists || creatingNewMd) {
        if (mdData) {
          mdData.body = normalizedValue;
          mdModified = true;
        }
        continue;
      } else if (isPromptFileReference(jsonSection?.template)) {
        const templateFilePath = resolvePromptFilePath(jsonSection.template);
        if (!templateFilePath) {
          throw new Error(`Invalid template file reference for command ${commandName}`);
        }
        writePromptFile(templateFilePath, normalizedValue);
        continue;
      } else if (isPromptFileReference(normalizedValue)) {
        if (!config.command) config.command = {};
        if (!config.command[commandName]) config.command[commandName] = {};
        config.command[commandName].template = normalizedValue;
        jsonModified = true;
        continue;
      }

      // For JSON-only commands, store template inline in JSON
      if (!config.command) config.command = {};
      if (!config.command[commandName]) config.command[commandName] = {};
      config.command[commandName].template = normalizedValue;
      jsonModified = true;
      continue;
    }

    const inMd = mdData?.frontmatter?.[field] !== undefined;
    const inJson = jsonSection?.[field] !== undefined;

    // JSON takes precedence over md, so update JSON first if field exists there
    if (inJson) {
      if (!config.command) config.command = {};
      if (!config.command[commandName]) config.command[commandName] = {};
      config.command[commandName][field] = value;
      jsonModified = true;
    } else if (inMd || creatingNewMd) {
      if (mdData) {
        mdData.frontmatter[field] = value;
        mdModified = true;
      }
    } else {
      // New field - add to appropriate location based on command source
      if ((mdExists || creatingNewMd) && mdData) {
        mdData.frontmatter[field] = value;
        mdModified = true;
      } else {
        if (!config.command) config.command = {};
        if (!config.command[commandName]) config.command[commandName] = {};
        config.command[commandName][field] = value;
        jsonModified = true;
      }
    }
  }

  if (mdModified && mdData) {
    writeMdFile(targetPath, mdData.frontmatter, mdData.body);
  }

  if (jsonModified) {
    writeConfig(config, jsonTarget.path || CONFIG_FILE);
  }

  console.log(`Updated command: ${commandName} (scope: ${targetScope}, md: ${mdModified}, json: ${jsonModified})`);
}

function deleteCommand(commandName, workingDirectory) {
  let deleted = false;

  // Check project level first (takes precedence)
  if (workingDirectory) {
    const projectPath = getProjectCommandPath(workingDirectory, commandName);
    if (fs.existsSync(projectPath)) {
      fs.unlinkSync(projectPath);
      console.log(`Deleted project-level command .md file: ${projectPath}`);
      deleted = true;
    }
  }

  // Then check user level
  const userPath = getUserCommandPath(commandName);
  if (fs.existsSync(userPath)) {
    fs.unlinkSync(userPath);
    console.log(`Deleted user-level command .md file: ${userPath}`);
    deleted = true;
  }

  // Also check json config (highest precedence entry only)
  const layers = readConfigLayers(workingDirectory);
  const jsonSource = getJsonEntrySource(layers, 'command', commandName);
  if (jsonSource.exists && jsonSource.config && jsonSource.path) {
    if (!jsonSource.config.command) jsonSource.config.command = {};
    delete jsonSource.config.command[commandName];
    writeConfig(jsonSource.config, jsonSource.path);
    console.log(`Removed command from opencode.json: ${commandName}`);
    deleted = true;
  }

  if (!deleted) {
    throw new Error(`Command "${commandName}" not found`);
  }
}

// ============== SKILL CRUD ==============

/**
 * Discover all skills from all sources
 */
function discoverSkills(workingDirectory) {
  const skills = new Map();
  
  // Helper to add skill if not already found (first found wins by priority)
  const addSkill = (name, skillPath, scope, source) => {
    if (!skills.has(name)) {
      skills.set(name, { name, path: skillPath, scope, source });
    }
  };
  
  // 1. Project level .opencode/skill/ (highest priority)
  if (workingDirectory) {
    const projectSkillDir = path.join(workingDirectory, '.opencode', 'skill');
    if (fs.existsSync(projectSkillDir)) {
      const entries = fs.readdirSync(projectSkillDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillMdPath = path.join(projectSkillDir, entry.name, 'SKILL.md');
          if (fs.existsSync(skillMdPath)) {
            addSkill(entry.name, skillMdPath, SKILL_SCOPE.PROJECT, 'opencode');
          }
        }
      }
    }
    
    // 2. Claude-compatible .claude/skills/
    const claudeSkillDir = path.join(workingDirectory, '.claude', 'skills');
    if (fs.existsSync(claudeSkillDir)) {
      const entries = fs.readdirSync(claudeSkillDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillMdPath = path.join(claudeSkillDir, entry.name, 'SKILL.md');
          if (fs.existsSync(skillMdPath)) {
            addSkill(entry.name, skillMdPath, SKILL_SCOPE.PROJECT, 'claude');
          }
        }
      }
    }
  }
  
  // 3. User level ~/.config/opencode/skill/
  if (fs.existsSync(SKILL_DIR)) {
    const entries = fs.readdirSync(SKILL_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillMdPath = path.join(SKILL_DIR, entry.name, 'SKILL.md');
        if (fs.existsSync(skillMdPath)) {
          addSkill(entry.name, skillMdPath, SKILL_SCOPE.USER, 'opencode');
        }
      }
    }
  }
  
  return Array.from(skills.values());
}

function getSkillSources(skillName, workingDirectory) {
  // Check all possible locations
  const projectPath = workingDirectory ? getProjectSkillPath(workingDirectory, skillName) : null;
  const projectExists = projectPath && fs.existsSync(projectPath);
  const projectDir = projectExists ? path.dirname(projectPath) : null;
  
  const claudePath = workingDirectory ? getClaudeSkillPath(workingDirectory, skillName) : null;
  const claudeExists = claudePath && fs.existsSync(claudePath);
  const claudeDir = claudeExists ? path.dirname(claudePath) : null;
  
  const userPath = getUserSkillPath(skillName);
  const userExists = fs.existsSync(userPath);
  const userDir = userExists ? path.dirname(userPath) : null;
  
  // Determine which md file to use (priority: project > claude > user)
  let mdPath = null;
  let mdScope = null;
  let mdSource = null;
  let mdDir = null;
  
  if (projectExists) {
    mdPath = projectPath;
    mdScope = SKILL_SCOPE.PROJECT;
    mdSource = 'opencode';
    mdDir = projectDir;
  } else if (claudeExists) {
    mdPath = claudePath;
    mdScope = SKILL_SCOPE.PROJECT;
    mdSource = 'claude';
    mdDir = claudeDir;
  } else if (userExists) {
    mdPath = userPath;
    mdScope = SKILL_SCOPE.USER;
    mdSource = 'opencode';
    mdDir = userDir;
  }
  
  const mdExists = !!mdPath;

  const sources = {
    md: {
      exists: mdExists,
      path: mdPath,
      dir: mdDir,
      scope: mdScope,
      source: mdSource,
      fields: [],
      supportingFiles: []
    },
    // Additional info about all locations
    projectMd: {
      exists: projectExists,
      path: projectPath,
      dir: projectDir
    },
    claudeMd: {
      exists: claudeExists,
      path: claudePath,
      dir: claudeDir
    },
    userMd: {
      exists: userExists,
      path: userPath,
      dir: userDir
    }
  };

  if (mdExists && mdDir) {
    const { frontmatter, body } = parseMdFile(mdPath);
    sources.md.fields = Object.keys(frontmatter);
    // Include actual content values
    sources.md.description = frontmatter.description || '';
    sources.md.name = frontmatter.name || skillName;
    if (body) {
      sources.md.fields.push('instructions');
      sources.md.instructions = body;
    } else {
      sources.md.instructions = '';
    }
    sources.md.supportingFiles = listSkillSupportingFiles(mdDir);
  }

  return sources;
}

function createSkill(skillName, config, workingDirectory, scope) {
  ensureDirs();

  // Validate skill name (must be lowercase alphanumeric with hyphens, max 64 chars)
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(skillName) || skillName.length > 64) {
    throw new Error(`Invalid skill name "${skillName}". Must be 1-64 lowercase alphanumeric characters with hyphens, cannot start or end with hyphen.`);
  }

  // Check if skill already exists at any location
  const existing = getSkillScope(skillName, workingDirectory);
  if (existing.path) {
    throw new Error(`Skill ${skillName} already exists at ${existing.path}`);
  }

  // Determine target path based on requested scope
  let targetDir;
  let targetPath;
  let targetScope;
  
  if (scope === SKILL_SCOPE.PROJECT && workingDirectory) {
    ensureProjectSkillDir(workingDirectory);
    targetDir = getProjectSkillDir(workingDirectory, skillName);
    targetPath = getProjectSkillPath(workingDirectory, skillName);
    targetScope = SKILL_SCOPE.PROJECT;
  } else {
    targetDir = getUserSkillDir(skillName);
    targetPath = getUserSkillPath(skillName);
    targetScope = SKILL_SCOPE.USER;
  }

  // Create skill directory
  fs.mkdirSync(targetDir, { recursive: true });

  // Extract fields - scope is only for path determination
  const { instructions, scope: _scopeFromConfig, supportingFiles, ...frontmatter } = config;

  // Ensure required fields
  if (!frontmatter.name) {
    frontmatter.name = skillName;
  }
  if (!frontmatter.description) {
    throw new Error('Skill description is required');
  }

  writeMdFile(targetPath, frontmatter, instructions || '');
  
  // Write supporting files if provided
  if (supportingFiles && Array.isArray(supportingFiles)) {
    for (const file of supportingFiles) {
      if (file.path && file.content !== undefined) {
        writeSkillSupportingFile(targetDir, file.path, file.content);
      }
    }
  }
  
  console.log(`Created new skill: ${skillName} (scope: ${targetScope}, path: ${targetPath})`);
}

function updateSkill(skillName, updates, workingDirectory) {
  ensureDirs();

  // Get existing skill location
  const existing = getSkillScope(skillName, workingDirectory);
  if (!existing.path) {
    throw new Error(`Skill "${skillName}" not found`);
  }
  
  const mdPath = existing.path;
  const mdDir = path.dirname(mdPath);
  const mdData = parseMdFile(mdPath);

  let mdModified = false;

  for (const [field, value] of Object.entries(updates)) {
    // Skip scope field - it's metadata only
    if (field === 'scope') {
      continue;
    }
    
    if (field === 'instructions') {
      const normalizedValue = typeof value === 'string' ? value : (value == null ? '' : String(value));
      mdData.body = normalizedValue;
      mdModified = true;
      continue;
    }

    if (field === 'supportingFiles') {
      // Handle supporting files updates
      if (Array.isArray(value)) {
        for (const file of value) {
          if (file.delete && file.path) {
            deleteSkillSupportingFile(mdDir, file.path);
          } else if (file.path && file.content !== undefined) {
            writeSkillSupportingFile(mdDir, file.path, file.content);
          }
        }
      }
      continue;
    }

    // Update frontmatter field
    mdData.frontmatter[field] = value;
    mdModified = true;
  }

  if (mdModified) {
    writeMdFile(mdPath, mdData.frontmatter, mdData.body);
  }

  console.log(`Updated skill: ${skillName} (path: ${mdPath})`);
}

function deleteSkill(skillName, workingDirectory) {
  let deleted = false;

  // Check and delete from all locations
  
  // Project level .opencode/skill/
  if (workingDirectory) {
    const projectDir = getProjectSkillDir(workingDirectory, skillName);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
      console.log(`Deleted project-level skill directory: ${projectDir}`);
      deleted = true;
    }
    
    // Claude-compat .claude/skills/ - we allow deletion here too
    const claudeDir = getClaudeSkillDir(workingDirectory, skillName);
    if (fs.existsSync(claudeDir)) {
      fs.rmSync(claudeDir, { recursive: true, force: true });
      console.log(`Deleted claude-compat skill directory: ${claudeDir}`);
      deleted = true;
    }
  }

  // User level
  const userDir = getUserSkillDir(skillName);
  if (fs.existsSync(userDir)) {
    fs.rmSync(userDir, { recursive: true, force: true });
    console.log(`Deleted user-level skill directory: ${userDir}`);
    deleted = true;
  }

  if (!deleted) {
    throw new Error(`Skill "${skillName}" not found`);
  }
}

export {
  getAgentSources,
  getAgentScope,
  getAgentPermissionSource,
  getAgentConfig,
  createAgent,
  updateAgent,
  deleteAgent,
  getCommandSources,
  getCommandScope,
  createCommand,
  updateCommand,
  deleteCommand,
  getSkillSources,
  getSkillScope,
  discoverSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  readSkillSupportingFile,
  writeSkillSupportingFile,
  deleteSkillSupportingFile,
  readConfig,
  writeConfig,
  AGENT_DIR,
  COMMAND_DIR,
  SKILL_DIR,
  CONFIG_FILE,
  AGENT_SCOPE,
  COMMAND_SCOPE,
  SKILL_SCOPE
};
