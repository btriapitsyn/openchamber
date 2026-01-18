import fs from 'fs';
import path from 'path';
import os from 'os';
import { parse as parseJsonc } from 'jsonc-parser';

const OPENCODE_CONFIG_DIR = path.join(os.homedir(), '.config', 'opencode');
const CONFIG_FILE = path.join(OPENCODE_CONFIG_DIR, 'opencode.json');

/**
 * Read a config file (supports JSON and JSONC)
 */
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
    return parseJsonc(normalized, [], { allowTrailingComma: true });
  } catch (error) {
    console.error(`Failed to read config file: ${filePath}`, error);
    return {};
  }
}

/**
 * Write config file with backup
 */
function writeConfigFile(config, filePath) {
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

/**
 * Get all possible project config paths in priority order
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
 * Find existing project config file
 */
function getProjectConfigPath(workingDirectory) {
  if (!workingDirectory) return null;

  const candidates = getProjectConfigCandidates(workingDirectory);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Get provider sources - where a provider is defined
 * Returns info about auth.json, user config, and project config
 */
function getProviderSources(providerId, workingDirectory) {
  const sources = {
    auth: false,
    userConfig: false,
    projectConfig: false,
    userConfigPath: CONFIG_FILE,
    projectConfigPath: null,
  };

  // Check auth.json
  const AUTH_FILE = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');
  if (fs.existsSync(AUTH_FILE)) {
    try {
      const authContent = fs.readFileSync(AUTH_FILE, 'utf8').trim();
      if (authContent) {
        const auth = JSON.parse(authContent);
        sources.auth = !!auth[providerId];
      }
    } catch (error) {
      console.error('Failed to read auth file:', error);
    }
  }

  // Check user config
  const userConfig = readConfigFile(CONFIG_FILE);
  if (userConfig.provider && userConfig.provider[providerId]) {
    sources.userConfig = true;
  }

  // Check project config
  if (workingDirectory) {
    const projectConfigPath = getProjectConfigPath(workingDirectory);
    if (projectConfigPath) {
      sources.projectConfigPath = projectConfigPath;
      const projectConfig = readConfigFile(projectConfigPath);
      if (projectConfig.provider && projectConfig.provider[providerId]) {
        sources.projectConfig = true;
      }
    }
  }

  return sources;
}

/**
 * Remove provider from config file
 * @param {string} providerId - Provider ID to remove
 * @param {string} scope - 'user' or 'project'
 * @param {string|null} workingDirectory - Working directory for project scope
 * @returns {boolean} - Whether provider was removed
 */
function removeProviderFromConfig(providerId, scope, workingDirectory) {
  let configPath;
  
  if (scope === 'project' && workingDirectory) {
    configPath = getProjectConfigPath(workingDirectory);
    if (!configPath) {
      console.log(`No project config found in ${workingDirectory}`);
      return false;
    }
  } else {
    configPath = CONFIG_FILE;
  }

  const config = readConfigFile(configPath);
  
  if (!config.provider || !config.provider[providerId]) {
    console.log(`Provider ${providerId} not found in ${configPath}`);
    return false;
  }

  delete config.provider[providerId];
  
  // Clean up empty provider section
  if (Object.keys(config.provider).length === 0) {
    delete config.provider;
  }

  writeConfigFile(config, configPath);
  console.log(`Removed provider ${providerId} from ${scope} config: ${configPath}`);
  return true;
}

/**
 * Check if provider can be disconnected and from where
 */
function canDisconnectProvider(providerId, workingDirectory) {
  const sources = getProviderSources(providerId, workingDirectory);
  
  return {
    canDisconnect: sources.auth || sources.userConfig || sources.projectConfig,
    sources: {
      auth: sources.auth,
      userConfig: sources.userConfig,
      projectConfig: sources.projectConfig,
    },
    paths: {
      userConfig: sources.userConfigPath,
      projectConfig: sources.projectConfigPath,
    }
  };
}

export {
  getProviderSources,
  removeProviderFromConfig,
  canDisconnectProvider,
  readConfigFile,
  writeConfigFile,
  CONFIG_FILE,
};
