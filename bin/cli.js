#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CLI configuration
const DEFAULT_PORT = 3000;
const PACKAGE_JSON = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = { port: DEFAULT_PORT, daemon: false };
  let command = 'serve'; // default command

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      const optionName = arg.slice(2);
      const optionValue = args[i + 1];
      
      switch (optionName) {
        case 'port':
        case 'p':
          options.port = parseInt(optionValue) || DEFAULT_PORT;
          i++; // skip next arg as it's the value
          break;
        case 'daemon':
        case 'd':
          options.daemon = true;
          break;
        case 'help':
        case 'h':
          showHelp();
          process.exit(0);
          break;
        case 'version':
        case 'v':
          console.log(PACKAGE_JSON.version);
          process.exit(0);
          break;
      }
    } else if (!arg.startsWith('-')) {
      // This is a command
      command = arg;
    }
  }

  return { command, options };
}

// Show help information
function showHelp() {
  console.log(`
OpenCode WebUI - Web interface companion for OpenCode AI coding agent

USAGE:
  opencode-webui [COMMAND] [OPTIONS]

COMMANDS:
  serve          Start the web server (default)
  stop           Stop running instance
  restart        Stop and start the server
  status         Show server status
  enable         Install as system service (Linux)
  disable        Remove system service (Linux)

OPTIONS:
  --port, -p     Web server port (default: ${DEFAULT_PORT})
  --daemon, -d   Run in background (serve command)
  --help, -h     Show help
  --version, -v  Show version

EXAMPLES:
  opencode-webui                    # Start on default port 3000
  opencode-webui --port 8080       # Start on port 8080
  opencode-webui serve --daemon    # Start in background
  opencode-webui stop              # Stop running instance
  opencode-webui status            # Check status
  opencode-webui enable --port 3000  # Install as systemd service
`);
}

// Check if OpenCode CLI is available
async function checkOpenCodeCLI() {
  try {
    const { execSync } = await import('child_process');
    execSync('opencode --version', { stdio: 'pipe' });
    return true;
  } catch (error) {
    console.error('Error: OpenCode CLI not found in PATH');
    console.error('Please install OpenCode CLI first:');
    console.error('  npm install -g @opencode-ai/cli');
    process.exit(1);
  }
}

// Get PID file path for given port
async function getPidFilePath(port) {
  const os = await import('os');
  const tmpDir = os.tmpdir();
  return path.join(tmpDir, `opencode-webui-${port}.pid`);
}

// Read PID from file
function readPidFile(pidFilePath) {
  try {
    const content = fs.readFileSync(pidFilePath, 'utf8').trim();
    const pid = parseInt(content);
    if (isNaN(pid)) {
      return null;
    }
    return pid;
  } catch (error) {
    return null;
  }
}

// Write PID to file
function writePidFile(pidFilePath, pid) {
  try {
    fs.writeFileSync(pidFilePath, pid.toString());
  } catch (error) {
    console.warn(`Warning: Could not write PID file: ${error.message}`);
  }
}

// Remove PID file
function removePidFile(pidFilePath) {
  try {
    if (fs.existsSync(pidFilePath)) {
      fs.unlinkSync(pidFilePath);
    }
  } catch (error) {
    console.warn(`Warning: Could not remove PID file: ${error.message}`);
  }
}

// Check if process is running
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0); // Send signal 0 to check if process exists
    return true;
  } catch (error) {
    return false;
  }
}

// Command handlers
const commands = {
  async serve(options) {
    const pidFilePath = await getPidFilePath(options.port);
    
    // Check if already running
    const existingPid = readPidFile(pidFilePath);
    if (existingPid && isProcessRunning(existingPid)) {
      console.error(`Error: OpenCode WebUI is already running on port ${options.port} (PID: ${existingPid})`);
      console.error('Use "opencode-webui stop" to stop the existing instance');
      process.exit(1);
    }

    // Check OpenCode CLI availability
    checkOpenCodeCLI();

    // Start server
    const serverPath = path.join(__dirname, '..', 'server', 'index.js');
    
    if (options.daemon) {
      // Start in daemon mode
      const child = spawn(process.execPath, [serverPath, '--port', options.port.toString()], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, OPENCODE_WEBUI_PORT: options.port.toString() }
      });
      
      child.unref();
      
      // Wait a bit and check if server started
      setTimeout(() => {
        if (isProcessRunning(child.pid)) {
          writePidFile(pidFilePath, child.pid);
          console.log(`OpenCode WebUI started in daemon mode on port ${options.port}`);
          console.log(`PID: ${child.pid}`);
          console.log(`Visit: http://localhost:${options.port}`);
        } else {
          console.error('Failed to start server in daemon mode');
          process.exit(1);
        }
      }, 1000);
      
    } else {
      // Start in foreground
      await import(serverPath);
    }
  },

  async stop(options) {
    const os = await import('os');
    const tmpDir = os.tmpdir();
    
    // Find all running instances
    let runningInstances = [];
    
    try {
      const files = fs.readdirSync(tmpDir);
      const pidFiles = files.filter(file => file.startsWith('opencode-webui-') && file.endsWith('.pid'));
      
      for (const file of pidFiles) {
        const port = parseInt(file.replace('opencode-webui-', '').replace('.pid', ''));
        if (!isNaN(port)) {
          const pidFilePath = path.join(tmpDir, file);
          const pid = readPidFile(pidFilePath);
          
          if (pid && isProcessRunning(pid)) {
            runningInstances.push({ port, pid, pidFilePath });
          } else {
            // Clean up stale PID files
            removePidFile(pidFilePath);
          }
        }
      }
    } catch (error) {
      // Ignore directory read errors
    }
    
    if (runningInstances.length === 0) {
      console.log('No running OpenCode WebUI instances found');
      return;
    }
    
    // If specific port is requested, stop only that instance
    if (options.port !== DEFAULT_PORT || runningInstances.length === 1) {
      const targetInstance = runningInstances.find(inst => inst.port === options.port) || runningInstances[0];
      
      console.log(`Stopping OpenCode WebUI (PID: ${targetInstance.pid}, Port: ${targetInstance.port})...`);
      
      try {
        process.kill(targetInstance.pid, 'SIGTERM');
        
        // Wait for graceful shutdown
        let attempts = 0;
        const maxAttempts = 10;
        
        const checkShutdown = setInterval(() => {
          attempts++;
          if (!isProcessRunning(targetInstance.pid)) {
            clearInterval(checkShutdown);
            removePidFile(targetInstance.pidFilePath);
            console.log('OpenCode WebUI stopped successfully');
          } else if (attempts >= maxAttempts) {
            clearInterval(checkShutdown);
            console.log('Force killing process...');
            process.kill(targetInstance.pid, 'SIGKILL');
            removePidFile(targetInstance.pidFilePath);
            console.log('OpenCode WebUI force stopped');
          }
        }, 500);
        
      } catch (error) {
        console.error(`Error stopping process: ${error.message}`);
        process.exit(1);
      }
    } else {
      // Multiple instances running and no specific port requested
      console.log('Multiple OpenCode WebUI instances are running:');
      runningInstances.forEach((instance, index) => {
        console.log(`  ${index + 1}. Port ${instance.port} (PID: ${instance.pid})`);
      });
      console.log('\nPlease specify which instance to stop:');
      console.log('  opencode-webui stop --port <PORT>');
      console.log('Example: opencode-webui stop --port 3001');
    }
  },

  async restart(options) {
    await commands.stop(options);
    // Wait a bit for clean shutdown
    setTimeout(() => commands.serve(options), 1000);
  },

  async status(options) {
    const os = await import('os');
    const tmpDir = os.tmpdir();
    
    // Find all PID files for opencode-webui
    let runningInstances = [];
    let stoppedInstances = [];
    
    try {
      const files = fs.readdirSync(tmpDir);
      const pidFiles = files.filter(file => file.startsWith('opencode-webui-') && file.endsWith('.pid'));
      
      for (const file of pidFiles) {
        const port = parseInt(file.replace('opencode-webui-', '').replace('.pid', ''));
        if (!isNaN(port)) {
          const pidFilePath = path.join(tmpDir, file);
          const pid = readPidFile(pidFilePath);
          
          if (pid && isProcessRunning(pid)) {
            runningInstances.push({ port, pid, pidFilePath });
          } else {
            // Clean up stale PID files
            removePidFile(pidFilePath);
            stoppedInstances.push({ port });
          }
        }
      }
    } catch (error) {
      // Ignore directory read errors
    }
    
    if (runningInstances.length === 0) {
      console.log('OpenCode WebUI Status:');
      console.log('  Status: Stopped');
      if (stoppedInstances.length > 0) {
        console.log(`  Previously used ports: ${stoppedInstances.map(s => s.port).join(', ')}`);
      }
      return;
    }
    
    // Show status for all running instances
    console.log('OpenCode WebUI Status:');
    for (const [index, instance] of runningInstances.entries()) {
      if (runningInstances.length > 1) {
        console.log(`\nInstance ${index + 1}:`);
      }
      console.log('  Status: Running');
      console.log(`  PID: ${instance.pid}`);
      console.log(`  Port: ${instance.port}`);
      console.log(`  Visit: http://localhost:${instance.port}`);
      
      // Try to get more info if possible
      try {
        const { execSync } = await import('child_process');
        const startTime = execSync(`ps -o lstart= -p ${instance.pid}`, { encoding: 'utf8' }).trim();
        console.log(`  Start Time: ${startTime}`);
      } catch (error) {
        // Ignore if we can't get start time
      }
    }
  },

  async enable(options) {
    console.log('Error: System service installation not yet implemented');
    console.log('This feature will be available in a future version');
    process.exit(1);
  },

  async disable(options) {
    console.log('Error: System service removal not yet implemented');
    console.log('This feature will be available in a future version');
    process.exit(1);
  }
};

// Main execution
async function main() {
  const { command, options } = parseArgs();
  
  // Validate command
  if (!commands[command]) {
    console.error(`Error: Unknown command '${command}'`);
    console.error('Use --help to see available commands');
    process.exit(1);
  }

  // Execute command
  try {
    await commands[command](options);
  } catch (error) {
    console.error(`Error executing command '${command}': ${error.message}`);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run main function
main();

export { commands, parseArgs, getPidFilePath };