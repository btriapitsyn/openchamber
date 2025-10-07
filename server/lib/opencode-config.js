import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'yaml';

const OPENCODE_CONFIG_DIR = path.join(os.homedir(), '.config', 'opencode');
const AGENT_DIR = path.join(OPENCODE_CONFIG_DIR, 'agent');
const CONFIG_FILE = path.join(OPENCODE_CONFIG_DIR, 'opencode.json');

/**
 * Ensure required directories exist
 */
function ensureDirs() {
  if (!fs.existsSync(OPENCODE_CONFIG_DIR)) {
    fs.mkdirSync(OPENCODE_CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(AGENT_DIR)) {
    fs.mkdirSync(AGENT_DIR, { recursive: true });
  }
}

/**
 * Read opencode.json configuration file
 * @returns {Object} Configuration object
 */
function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to read config file:', error);
    throw new Error('Failed to read OpenCode configuration');
  }
}

/**
 * Write opencode.json configuration file
 * @param {Object} config - Configuration object to write
 */
function writeConfig(config) {
  try {
    // Create backup before writing
    if (fs.existsSync(CONFIG_FILE)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const backupFile = `${CONFIG_FILE}.backup.${timestamp}`;
      fs.copyFileSync(CONFIG_FILE, backupFile);
      console.log(`Created config backup: ${backupFile}`);
    }

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    console.log('Successfully wrote config file');
  } catch (error) {
    console.error('Failed to write config file:', error);
    throw new Error('Failed to write OpenCode configuration');
  }
}

/**
 * Parse markdown file with YAML frontmatter
 * @param {string} filePath - Path to .md file
 * @returns {Object} { frontmatter: {}, body: string }
 */
function parseMdFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

    if (!match) {
      return { frontmatter: {}, body: content.trim() };
    }

    const frontmatter = yaml.parse(match[1]) || {};
    const body = match[2].trim();

    return { frontmatter, body };
  } catch (error) {
    console.error(`Failed to parse markdown file ${filePath}:`, error);
    throw new Error('Failed to parse agent markdown file');
  }
}

/**
 * Write markdown file with YAML frontmatter
 * @param {string} filePath - Path to .md file
 * @param {Object} frontmatter - Frontmatter object
 * @param {string} body - Body content
 */
function writeMdFile(filePath, frontmatter, body) {
  try {
    const yamlStr = yaml.stringify(frontmatter);
    const content = `---\n${yamlStr}---\n\n${body}`;
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Successfully wrote markdown file: ${filePath}`);
  } catch (error) {
    console.error(`Failed to write markdown file ${filePath}:`, error);
    throw new Error('Failed to write agent markdown file');
  }
}

/**
 * Get information about where agent configuration is stored
 * @param {string} agentName - Name of the agent
 * @returns {Object} Sources information
 */
function getAgentSources(agentName) {
  const mdPath = path.join(AGENT_DIR, `${agentName}.md`);
  const mdExists = fs.existsSync(mdPath);

  const config = readConfig();
  const jsonSection = config.agent?.[agentName];

  const sources = {
    md: {
      exists: mdExists,
      path: mdExists ? mdPath : null,
      fields: []
    },
    json: {
      exists: !!jsonSection,
      path: CONFIG_FILE,
      fields: []
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

/**
 * Create new agent as .md file
 * @param {string} agentName - Name of the agent
 * @param {Object} config - Agent configuration
 */
function createAgent(agentName, config) {
  ensureDirs();

  const mdPath = path.join(AGENT_DIR, `${agentName}.md`);

  // Check if agent already exists
  if (fs.existsSync(mdPath)) {
    throw new Error(`Agent ${agentName} already exists as .md file`);
  }

  const existingConfig = readConfig();
  if (existingConfig.agent?.[agentName]) {
    throw new Error(`Agent ${agentName} already exists in opencode.json`);
  }

  // Extract prompt from config
  const { prompt, ...frontmatter } = config;

  // Write .md file
  writeMdFile(mdPath, frontmatter, prompt || '');
  console.log(`Created new agent: ${agentName}`);
}

/**
 * Update existing agent using field-level logic
 * @param {string} agentName - Name of the agent
 * @param {Object} updates - Fields to update
 */
function updateAgent(agentName, updates) {
  ensureDirs();

  const mdPath = path.join(AGENT_DIR, `${agentName}.md`);
  const mdExists = fs.existsSync(mdPath);

  let mdData = mdExists ? parseMdFile(mdPath) : null;
  let config = readConfig();
  const jsonSection = config.agent?.[agentName];

  let mdModified = false;
  let jsonModified = false;

  for (const [field, value] of Object.entries(updates)) {
    // Special handling for prompt field
    if (field === 'prompt') {
      if (mdExists) {
        mdData.body = value || '';
        mdModified = true;
      } else {
        if (!config.agent) config.agent = {};
        if (!config.agent[agentName]) config.agent[agentName] = {};
        config.agent[agentName].prompt = value;
        jsonModified = true;
      }
      continue;
    }

    // Check where field is currently defined
    const inMd = mdData?.frontmatter?.[field] !== undefined;
    const inJson = jsonSection?.[field] !== undefined;

    if (inMd) {
      // Update in .md frontmatter
      mdData.frontmatter[field] = value;
      mdModified = true;
    } else if (inJson) {
      // Update in opencode.json
      if (!config.agent) config.agent = {};
      if (!config.agent[agentName]) config.agent[agentName] = {};
      config.agent[agentName][field] = value;
      jsonModified = true;
    } else {
      // Field not defined - apply priority rules
      if (mdExists && jsonSection) {
        // Both exist → add to opencode.json (higher priority)
        if (!config.agent) config.agent = {};
        if (!config.agent[agentName]) config.agent[agentName] = {};
        config.agent[agentName][field] = value;
        jsonModified = true;
      } else if (mdExists) {
        // Only .md exists → add to frontmatter
        mdData.frontmatter[field] = value;
        mdModified = true;
      } else {
        // Only JSON or built-in → add/create section in opencode.json
        if (!config.agent) config.agent = {};
        if (!config.agent[agentName]) config.agent[agentName] = {};
        config.agent[agentName][field] = value;
        jsonModified = true;
      }
    }
  }

  // Write changes
  if (mdModified) {
    writeMdFile(mdPath, mdData.frontmatter, mdData.body);
  }

  if (jsonModified) {
    writeConfig(config);
  }

  console.log(`Updated agent: ${agentName} (md: ${mdModified}, json: ${jsonModified})`);
}

/**
 * Delete agent configuration
 * @param {string} agentName - Name of the agent
 */
function deleteAgent(agentName) {
  const mdPath = path.join(AGENT_DIR, `${agentName}.md`);
  let deleted = false;

  // 1. Delete .md file if exists
  if (fs.existsSync(mdPath)) {
    fs.unlinkSync(mdPath);
    console.log(`Deleted agent .md file: ${mdPath}`);
    deleted = true;
  }

  // 2. Remove section from opencode.json if exists
  const config = readConfig();
  if (config.agent?.[agentName]) {
    delete config.agent[agentName];
    writeConfig(config);
    console.log(`Removed agent from opencode.json: ${agentName}`);
    deleted = true;
  }

  // 3. If nothing was deleted (built-in agent), disable it
  if (!deleted) {
    if (!config.agent) config.agent = {};
    config.agent[agentName] = { disable: true };
    writeConfig(config);
    console.log(`Disabled built-in agent: ${agentName}`);
  }
}

export {
  getAgentSources,
  createAgent,
  updateAgent,
  deleteAgent,
  readConfig,
  writeConfig,
  AGENT_DIR,
  CONFIG_FILE
};
