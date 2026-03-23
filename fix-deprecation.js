#!/usr/bin/env node

/**
 * Fix for http-proxy package util._extend deprecation warning
 * This script patches the http-proxy package to use Object.assign instead of util._extend
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function fixHttpProxyDeprecation() {
  try {
    // Find the http-proxy package in node_modules
    const httpProxyDir = path.join(__dirname, 'node_modules', 'http-proxy', 'lib', 'http-proxy');
    const indexPath = path.join(httpProxyDir, 'index.js');
    const commonPath = path.join(httpProxyDir, 'common.js');
    
    if (!fs.existsSync(indexPath) || !fs.existsSync(commonPath)) {
      return;
    }
    
    // Patch index.js
    let needsPatch = false;
    
    if (fs.existsSync(indexPath)) {
      let content = fs.readFileSync(indexPath, 'utf8');
      
      let indexPatched = false;
      
      if (content.includes("require('util')._extend")) {
        content = content.replace(
          /extend\s*=\s*require\('util'\)\._extend,/,
          "extend = Object.assign,"
        );
        indexPatched = true;
      }
      
      if (content.includes("require('util').inherits")) {
        content = content.replace(
          /require\('util'\)\.inherits\((\w+),\s*(\w+)\);/,
          "Object.setPrototypeOf($1.prototype, $2.prototype);"
        );
        indexPatched = true;
      }
      
      if (indexPatched) {
        fs.writeFileSync(indexPath, content, 'utf8');
        needsPatch = true;
      }
    }
    
    // Patch common.js
    if (fs.existsSync(commonPath)) {
      let content = fs.readFileSync(commonPath, 'utf8');
      
      let commonPatched = false;
      
      if (content.includes("require('util')._extend")) {
        content = content.replace(
          /extend\s*=\s*require\('util'\)\._extend,/,
          "extend = Object.assign,"
        );
        commonPatched = true;
      }
      
      if (commonPatched) {
        fs.writeFileSync(commonPath, content, 'utf8');
        needsPatch = true;
      }
    }
  } catch (error) {
    // Silently handle errors - functionality is not affected
  }
}

// Run the fix
fixHttpProxyDeprecation();