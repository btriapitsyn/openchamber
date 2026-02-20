import fs from 'fs';
import path from 'path';
import {
  CONFIG_FILE,
  readConfigLayers,
  readConfigFile,
  writeConfig,
} from './shared.js';

function getProviderSources(providerId, workingDirectory) {
  const layers = readConfigLayers(workingDirectory);
  
  const providers = {
    user: {
      exists: false,
      disabled: false,
      config: null,
      path: layers.paths.userPath
    },
    project: {
      exists: false,
      disabled: false,
      config: null,
      path: layers.paths.projectPath
    },
    custom: {
      exists: false,
      disabled: false,
      config: null,
      path: layers.paths.customPath
    }
  };

  const checkConfig = (config, path, scopeKey) => {
    if (!config) return;
    
    if (config.disabled_providers && Array.isArray(config.disabled_providers)) {
      if (config.disabled_providers.includes(providerId)) {
        providers[scopeKey].exists = true;
        providers[scopeKey].disabled = true;
      }
    }
  };

  checkConfig(layers.customConfig, layers.paths.customPath, 'custom');
  checkConfig(layers.projectConfig, layers.paths.projectPath, 'project');
  checkConfig(layers.userConfig, layers.paths.userPath, 'user');

  return {
    sources: providers,
    providerId
  };
}

function removeProviderConfig(providerId, workingDirectory, scope) {
  const layers = readConfigLayers(workingDirectory);
  
  let targetConfig = null;
  let targetPath = null;

  if (scope === 'custom' && layers.paths.customPath) {
    targetConfig = layers.customConfig;
    targetPath = layers.paths.customPath;
  } else if (scope === 'project' && layers.paths.projectPath) {
    targetConfig = layers.projectConfig;
    targetPath = layers.paths.projectPath;
  } else if (scope === 'user') {
    targetConfig = layers.userConfig;
    targetPath = layers.paths.userPath;
  } else {
    return false;
  }

  if (!targetConfig || !targetPath) {
    return false;
  }

  if (!fs.existsSync(targetPath)) {
    return false;
  }

  const modified = readConfigFile(targetPath);
  let changed = false;

  if (modified.disabled_providers && Array.isArray(modified.disabled_providers)) {
    const index = modified.disabled_providers.indexOf(providerId);
    if (index !== -1) {
      modified.disabled_providers.splice(index, 1);
      changed = true;
    }
  }

  if (changed) {
    writeConfig(modified, targetPath);
    console.log(`Removed provider ${providerId} from config: ${targetPath}`);
    return true;
  }

  return false;
}

export {
  getProviderSources,
  removeProviderConfig,
};
