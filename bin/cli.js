#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import { spawn, spawnSync } from 'child_process';
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
OpenChamber - Desktop companion for the OpenCode AI coding agent

USAGE:
  openchamber [COMMAND] [OPTIONS]

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
  openchamber                    # Start on default port 3000
  openchamber --port 8080       # Start on port 8080
  openchamber serve --daemon    # Start in background
  openchamber stop              # Stop running instance
  openchamber status            # Check status
  openchamber enable --port 3000  # Install as systemd service
`);
}

const WINDOWS_EXTENSIONS = process.platform === 'win32'
  ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
      .split(';')
      .map((ext) => ext.trim().toLowerCase())
      .filter(Boolean)
      .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`))
  : [''];

function isExecutable(filePath) {
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return false;
    }
    if (process.platform === 'win32') {
      return true;
    }
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch (error) {
    return false;
  }
}

function resolveExplicitBinary(candidate) {
  if (!candidate) {
    return null;
  }
  if (candidate.includes(path.sep) || path.isAbsolute(candidate)) {
    const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(candidate);
    return isExecutable(resolved) ? resolved : null;
  }
  return null;
}

function searchPathFor(command) {
  const pathValue = process.env.PATH || '';
  const segments = pathValue.split(path.delimiter).filter(Boolean);
  for (const dir of segments) {
    for (const ext of WINDOWS_EXTENSIONS) {
      const fileName = process.platform === 'win32' ? `${command}${ext}` : command;
      const candidate = path.join(dir, fileName);
      if (isExecutable(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

async function checkOpenCodeCLI() {
  if (process.env.OPENCODE_BINARY) {
    const override = resolveExplicitBinary(process.env.OPENCODE_BINARY);
    if (override) {
      process.env.OPENCODE_BINARY = override;
      return override;
    }
    console.warn(`Warning: OPENCODE_BINARY="${process.env.OPENCODE_BINARY}" is not an executable file. Falling back to PATH lookup.`);
  }

  const resolvedFromPath = searchPathFor('opencode');
  if (resolvedFromPath) {
    process.env.OPENCODE_BINARY = resolvedFromPath;
    return resolvedFromPath;
  }

  if (process.platform !== 'win32') {
    const shellCandidates = [];
    if (process.env.SHELL) {
      shellCandidates.push(process.env.SHELL);
    }
    shellCandidates.push('/bin/bash', '/bin/zsh', '/bin/sh');

    for (const shellPath of shellCandidates) {
      if (!shellPath || !isExecutable(shellPath)) {
        continue;
      }
      try {
        const result = spawnSync(shellPath, ['-lic', 'command -v opencode'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        if (result.status === 0) {
          const candidate = result.stdout.trim().split(/\s+/).pop();
          if (candidate && isExecutable(candidate)) {
            const dir = path.dirname(candidate);
            const currentPath = process.env.PATH || '';
            const segments = currentPath.split(path.delimiter).filter(Boolean);
            if (!segments.includes(dir)) {
              segments.unshift(dir);
              process.env.PATH = segments.join(path.delimiter);
            }
            process.env.OPENCODE_BINARY = candidate;
            return candidate;
          }
        }
      } catch (error) {
        // ignore and try next shell
      }
    }
  } else {
    try {
      const result = spawnSync('where', ['opencode'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (result.status === 0) {
        const candidate = result.stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0);
        if (candidate && isExecutable(candidate)) {
          process.env.OPENCODE_BINARY = candidate;
          return candidate;
        }
      }
    } catch (error) {
      // ignore Windows where failure
    }
  }

  console.error('Error: Unable to locate the opencode CLI on PATH.');
  console.error(`Current PATH: ${process.env.PATH || '<empty>'}`);
  console.error('Ensure the CLI is installed and reachable, or set OPENCODE_BINARY to its full path.');
  process.exit(1);
}

// Get PID file path for given port
async function getPidFilePath(port) {
  const os = await import('os');
  const tmpDir = os.tmpdir();
  return path.join(tmpDir, `openchamber-${port}.pid`);
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
      console.error(`Error: OpenChamber is already running on port ${options.port} (PID: ${existingPid})`);
      console.error('Use "openchamber stop" to stop the existing instance');
      process.exit(1);
    }

    // Check OpenCode CLI availability
    const opencodeBinary = await checkOpenCodeCLI();

    // Start server
    const serverPath = path.join(__dirname, '..', 'server', 'index.js');
    
    if (options.daemon) {
      // Start in daemon mode
      const child = spawn(process.execPath, [serverPath, '--port', options.port.toString()], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, OPENCHAMBER_PORT: options.port.toString(), OPENCODE_BINARY: opencodeBinary }
      });
      
      child.unref();
      
      // Wait a bit and check if server started
      setTimeout(() => {
        if (isProcessRunning(child.pid)) {
          writePidFile(pidFilePath, child.pid);
          console.log(`OpenChamber started in daemon mode on port ${options.port}`);
          console.log(`PID: ${child.pid}`);
          console.log(`Visit: http://localhost:${options.port}`);
        } else {
          console.error('Failed to start server in daemon mode');
          process.exit(1);
        }
      }, 1000);
      
    } else {
      // Start in foreground
      process.env.OPENCODE_BINARY = opencodeBinary;
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
      const pidFiles = files.filter(file => file.startsWith('openchamber-') && file.endsWith('.pid'));

      for (const file of pidFiles) {
        const port = parseInt(file.replace('openchamber-', '').replace('.pid', ''));
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
      console.log('No running OpenChamber instances found');
      return;
    }

    // Check if user explicitly specified a port via --port flag
    const portWasSpecified = process.argv.includes('--port') || process.argv.includes('-p');

    // If port was specified, stop only that specific instance
    if (portWasSpecified) {
      const targetInstance = runningInstances.find(inst => inst.port === options.port);

      if (!targetInstance) {
        console.log(`No OpenChamber instance found running on port ${options.port}`);
        return;
      }

      console.log(`Stopping OpenChamber (PID: ${targetInstance.pid}, Port: ${targetInstance.port})...`);

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
            console.log('OpenChamber stopped successfully');
          } else if (attempts >= maxAttempts) {
            clearInterval(checkShutdown);
            console.log('Force killing process...');
            process.kill(targetInstance.pid, 'SIGKILL');
            removePidFile(targetInstance.pidFilePath);
            console.log('OpenChamber force stopped');
          }
        }, 500);

      } catch (error) {
        console.error(`Error stopping process: ${error.message}`);
        process.exit(1);
      }
    } else {
      // No port specified, stop all instances
      console.log(`Stopping all OpenChamber instances (${runningInstances.length} found)...`);

      for (const instance of runningInstances) {
        console.log(`  Stopping instance on port ${instance.port} (PID: ${instance.pid})...`);

        try {
          process.kill(instance.pid, 'SIGTERM');

          // Wait for graceful shutdown
          let attempts = 0;
          const maxAttempts = 10;

          await new Promise((resolve) => {
            const checkShutdown = setInterval(() => {
              attempts++;
              if (!isProcessRunning(instance.pid)) {
                clearInterval(checkShutdown);
                removePidFile(instance.pidFilePath);
                console.log(`    Port ${instance.port} stopped successfully`);
                resolve(true);
              } else if (attempts >= maxAttempts) {
                clearInterval(checkShutdown);
                console.log(`    Force killing port ${instance.port}...`);
                try {
                  process.kill(instance.pid, 'SIGKILL');
                  removePidFile(instance.pidFilePath);
                  console.log(`    Port ${instance.port} force stopped`);
                } catch (e) {
                  // Process might already be dead
                }
                resolve(true);
              }
            }, 500);
          });

        } catch (error) {
          console.error(`    Error stopping port ${instance.port}: ${error.message}`);
        }
      }

      console.log('\nAll OpenChamber instances stopped');
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
    
    // Find all PID files for openchamber
    let runningInstances = [];
    let stoppedInstances = [];
    
    try {
      const files = fs.readdirSync(tmpDir);
      const pidFiles = files.filter(file => file.startsWith('openchamber-') && file.endsWith('.pid'));
      
      for (const file of pidFiles) {
        const port = parseInt(file.replace('openchamber-', '').replace('.pid', ''));
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
      console.log('OpenChamber Status:');
      console.log('  Status: Stopped');
      if (stoppedInstances.length > 0) {
        console.log(`  Previously used ports: ${stoppedInstances.map(s => s.port).join(', ')}`);
      }
      return;
    }
    
    // Show status for all running instances
    console.log('OpenChamber Status:');
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
