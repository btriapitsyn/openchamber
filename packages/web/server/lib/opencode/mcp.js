import fs from 'fs';
import {
  CONFIG_FILE,
  readConfigFile,
  writeConfig,
} from './shared.js';

// ============== MCP CONFIG HELPERS ==============

/**
 * Validate MCP server name
 */
function validateMcpName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('MCP server name is required');
  }
  if (!/^[a-z0-9][a-z0-9_-]*[a-z0-9]$|^[a-z0-9]$/.test(name)) {
    throw new Error('MCP server name must be lowercase alphanumeric with hyphens/underscores');
  }
}

/**
 * List all MCP server configs from user-level opencode.json
 */
function listMcpConfigs() {
  const config = readConfigFile(CONFIG_FILE);
  const mcp = config?.mcp || {};

  return Object.entries(mcp).map(([name, entry]) => ({
    name,
    ...entry,
  }));
}

/**
 * Get a single MCP server config by name
 */
function getMcpConfig(name) {
  const config = readConfigFile(CONFIG_FILE);
  const entry = config?.mcp?.[name];

  if (!entry) {
    return null;
  }

  return { name, ...entry };
}

/**
 * Create a new MCP server config entry
 */
function createMcpConfig(name, mcpConfig) {
  validateMcpName(name);

  const config = fs.existsSync(CONFIG_FILE) ? readConfigFile(CONFIG_FILE) : {};

  if (!config.mcp) config.mcp = {};

  if (config.mcp[name] !== undefined) {
    throw new Error(`MCP server "${name}" already exists`);
  }

  const { name: _ignoredName, ...entryData } = mcpConfig;
  config.mcp[name] = buildMcpEntry(entryData);

  writeConfig(config, CONFIG_FILE);
  console.log(`Created MCP server config: ${name}`);
}

/**
 * Update an existing MCP server config entry
 */
function updateMcpConfig(name, updates) {
  const config = fs.existsSync(CONFIG_FILE) ? readConfigFile(CONFIG_FILE) : {};

  if (!config.mcp) config.mcp = {};

  const existing = config.mcp[name] ?? {};
  const { name: _ignoredName, ...updateData } = updates;

  config.mcp[name] = buildMcpEntry({ ...existing, ...updateData });

  writeConfig(config, CONFIG_FILE);
  console.log(`Updated MCP server config: ${name}`);
}

/**
 * Delete an MCP server config entry
 */
function deleteMcpConfig(name) {
  const config = fs.existsSync(CONFIG_FILE) ? readConfigFile(CONFIG_FILE) : {};

  if (!config.mcp || config.mcp[name] === undefined) {
    throw new Error(`MCP server "${name}" not found`);
  }

  delete config.mcp[name];

  if (Object.keys(config.mcp).length === 0) {
    delete config.mcp;
  }

  writeConfig(config, CONFIG_FILE);
  console.log(`Deleted MCP server config: ${name}`);
}

/**
 * Build a clean MCP entry object, omitting undefined/null values
 */
function buildMcpEntry(data) {
  const entry = {};

  // type is required
  entry.type = data.type === 'remote' ? 'remote' : 'local';

  if (entry.type === 'local') {
    // command must be a non-empty array of strings
    if (Array.isArray(data.command) && data.command.length > 0) {
      entry.command = data.command.map(String);
    }
  } else {
    // remote: url required
    if (data.url && typeof data.url === 'string') {
      entry.url = data.url.trim();
    }
  }

  // environment: flat Record<string, string>
  if (data.environment && typeof data.environment === 'object' && !Array.isArray(data.environment)) {
    const cleaned = {};
    for (const [k, v] of Object.entries(data.environment)) {
      if (k && v !== undefined && v !== null) {
        cleaned[k] = String(v);
      }
    }
    if (Object.keys(cleaned).length > 0) {
      entry.environment = cleaned;
    }
  }

  // enabled defaults to true
  entry.enabled = data.enabled !== false;

  return entry;
}

export {
  listMcpConfigs,
  getMcpConfig,
  createMcpConfig,
  updateMcpConfig,
  deleteMcpConfig,
};
