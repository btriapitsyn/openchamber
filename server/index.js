import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import os from 'os';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DEFAULT_PORT = 3000;
const DEFAULT_OPENCODE_PORT = 4101;
const OPENCODE_PORT_RANGE = 5; // Try ports 4101-4105
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const SHUTDOWN_TIMEOUT = 10000; // 10 seconds

// Global state
let openCodeProcess = null;
let openCodePort = null;
let healthCheckInterval = null;
let server = null;
let isShuttingDown = false;

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = { port: DEFAULT_PORT };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const optionName = arg.slice(2);
      const optionValue = args[i + 1];
      
      if (optionName === 'port' || optionName === 'p') {
        options.port = parseInt(optionValue) || DEFAULT_PORT;
        i++; // skip next arg as it's the value
      }
    }
  }
  
  return options;
}

// Find available OpenCode port
async function findOpenCodePort() {
  for (let i = 0; i < OPENCODE_PORT_RANGE; i++) {
    const port = DEFAULT_OPENCODE_PORT + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available ports in range ${DEFAULT_OPENCODE_PORT}-${DEFAULT_OPENCODE_PORT + OPENCODE_PORT_RANGE - 1}`);
}

// Check if port is available
async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const testServer = http.createServer();
    
    testServer.listen(port, () => {
      testServer.close(() => {
        resolve(true);
      });
    });
    
    testServer.on('error', () => {
      resolve(false);
    });
  });
}

// Start OpenCode process
async function startOpenCode(port) {
  console.log(`Starting OpenCode on port ${port}...`);
  
  const child = spawn('opencode', ['serve', '--port', port.toString()], {
    stdio: 'pipe',
    env: { ...process.env }
  });
  
  // Handle output
  child.stdout.on('data', (data) => {
    console.log(`OpenCode: ${data.toString().trim()}`);
  });
  
  child.stderr.on('data', (data) => {
    console.error(`OpenCode Error: ${data.toString().trim()}`);
  });
  
  child.on('exit', (code, signal) => {
    if (!isShuttingDown) {
      console.log(`OpenCode process exited with code ${code}, signal ${signal}`);
      // Restart OpenCode if not shutting down
      setTimeout(() => restartOpenCode(), 5000);
    }
  });
  
  child.on('error', (error) => {
    console.error(`OpenCode process error: ${error.message}`);
    if (!isShuttingDown) {
      // Restart OpenCode if not shutting down
      setTimeout(() => restartOpenCode(), 5000);
    }
  });
  
  // Wait a bit for OpenCode to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return child;
}

// Restart OpenCode process
async function restartOpenCode() {
  if (isShuttingDown) return;
  
  console.log('Restarting OpenCode process...');
  
  if (openCodeProcess) {
    openCodeProcess.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  try {
    openCodePort = await findOpenCodePort();
    openCodeProcess = await startOpenCode(openCodePort);
    setupProxy(app);
  } catch (error) {
    console.error(`Failed to restart OpenCode: ${error.message}`);
  }
}

// Setup proxy middleware
function setupProxy(app) {
  if (!openCodePort) return;
  
  console.log(`Setting up proxy to OpenCode on port ${openCodePort}`);
  
  // Debug middleware for OpenCode API routes (must be before proxy)
  app.use('/api', (req, res, next) => {
    // Skip debug for theme endpoints (already handled above)
    if (req.path.startsWith('/themes/custom')) {
      return next();
    }
    console.log(`API → OpenCode: ${req.method} ${req.path}`);
    next();
  });
  
  // Add proxy middleware
  app.use('/api', createProxyMiddleware({
    target: `http://localhost:${openCodePort}`,
    changeOrigin: true,
    pathRewrite: {
      '^/api': '' // Remove /api prefix
    },
    onError: (err, req, res) => {
      console.error(`Proxy error: ${err.message}`);
      if (!res.headersSent) {
        res.status(503).json({ error: 'OpenCode service unavailable' });
      }
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log(`Proxying ${req.method} ${req.path} to OpenCode`);
    }
  }));
}

// Start health monitoring
function startHealthMonitoring() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  
  healthCheckInterval = setInterval(async () => {
    if (!openCodeProcess || isShuttingDown) return;
    
    try {
      // Check if OpenCode process is still running
      if (openCodeProcess.exitCode !== null) {
        console.log('OpenCode process not running, restarting...');
        await restartOpenCode();
      }
    } catch (error) {
      console.error(`Health check error: ${error.message}`);
    }
  }, HEALTH_CHECK_INTERVAL);
}

// Graceful shutdown
async function gracefulShutdown() {
  if (isShuttingDown) return;
  
  isShuttingDown = true;
  console.log('Starting graceful shutdown...');
  
  // Stop health monitoring
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  
  // Stop OpenCode process
  if (openCodeProcess) {
    console.log('Stopping OpenCode process...');
    openCodeProcess.kill('SIGTERM');
    
    // Wait for graceful shutdown
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        openCodeProcess.kill('SIGKILL');
        resolve();
      }, SHUTDOWN_TIMEOUT);
      
      openCodeProcess.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  
  // Close HTTP server
  if (server) {
    await new Promise((resolve) => {
      server.close(() => {
        console.log('HTTP server closed');
        resolve();
      });
    });
  }
  
  console.log('Graceful shutdown complete');
  process.exit(0);
}

// Main function
async function main() {
  const options = parseArgs();
  const port = options.port || DEFAULT_PORT;
  
  console.log(`Starting OpenCode WebUI on port ${port}`);
  
  // Create Express app
  const app = express();
  server = http.createServer(app);
  
  // Basic middleware - skip JSON parsing for /api routes (handled by proxy)
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/themes/custom')) {
      // Only parse JSON for WebUI endpoints (themes)
      express.json()(req, res, next);
    } else if (req.path.startsWith('/api')) {
      // Skip JSON parsing for OpenCode API routes (let proxy handle it)
      next();
    } else {
      // Parse JSON for other routes
      express.json()(req, res, next);
    }
  });
  app.use(express.urlencoded({ extended: true }));
  
  // Request logging
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      openCodePort: openCodePort,
      openCodeRunning: openCodeProcess && openCodeProcess.exitCode === null
    });
  });



  // Theme storage endpoints (WebUI-specific, not OpenCode API)
  const themesConfigDir = path.join(os.homedir(), '.config', 'opencode-webui', 'themes');
  
  // Ensure themes directory exists
  if (!fs.existsSync(themesConfigDir)) {
    fs.mkdirSync(themesConfigDir, { recursive: true });
  }

  // GET /api/themes/custom - List custom themes
  app.get('/api/themes/custom', (req, res) => {
    try {
      const themes = [];
      if (fs.existsSync(themesConfigDir)) {
        const files = fs.readdirSync(themesConfigDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            try {
              const filePath = path.join(themesConfigDir, file);
              const content = fs.readFileSync(filePath, 'utf8');
              const theme = JSON.parse(content);
              themes.push(theme);
            } catch (error) {
              console.warn(`Failed to load theme file ${file}:`, error.message);
            }
          }
        }
      }
      res.json(themes);
    } catch (error) {
      console.error('Failed to list custom themes:', error);
      res.status(500).json({ error: 'Failed to list custom themes' });
    }
  });

  // POST /api/themes/custom - Save custom theme
  app.post('/api/themes/custom', (req, res) => {
    try {
      const theme = req.body;
      if (!theme.metadata?.id) {
        return res.status(400).json({ error: 'Theme must have metadata.id' });
      }
      
      const filename = `${theme.metadata.id}.json`;
      const filePath = path.join(themesConfigDir, filename);
      
      fs.writeFileSync(filePath, JSON.stringify(theme, null, 2), 'utf8');
      console.log(`Saved custom theme: ${theme.metadata.name} (${theme.metadata.id})`);
      
      res.json({ success: true, message: 'Theme saved successfully' });
    } catch (error) {
      console.error('Failed to save custom theme:', error);
      res.status(500).json({ error: 'Failed to save custom theme' });
    }
  });

  // DELETE /api/themes/custom/:id - Delete custom theme
  app.delete('/api/themes/custom/:id', (req, res) => {
    try {
      const themeId = req.params.id;
      const filename = `${themeId}.json`;
      const filePath = path.join(themesConfigDir, filename);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted custom theme: ${themeId}`);
        res.json({ success: true, message: 'Theme deleted successfully' });
      } else {
        res.status(404).json({ error: 'Theme not found' });
      }
    } catch (error) {
      console.error('Failed to delete custom theme:', error);
      res.status(500).json({ error: 'Failed to delete custom theme' });
    }
  });

  // HEAD /api/themes/custom - Check if theme storage is available
  app.head('/api/themes/custom', (req, res) => {
    res.status(200).end();
  });


  
  // Start OpenCode and setup proxy BEFORE static file serving
  try {
    openCodePort = await findOpenCodePort();
    openCodeProcess = await startOpenCode(openCodePort);
    setupProxy(app);
    startHealthMonitoring();
  } catch (error) {
    console.error(`Failed to start OpenCode: ${error.message}`);
    console.log('Continuing without OpenCode integration...');
  }
  
  // Static file serving (AFTER proxy setup)
  const distPath = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(distPath)) {
    console.log(`Serving static files from ${distPath}`);
    app.use(express.static(distPath));
    
    // Fallback to index.html for client-side routing (EXCEPT /api routes)
    app.get(/^(?!\/api).*$/, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.warn(`Warning: ${distPath} not found, static files will not be served`);
    app.get(/^(?!\/api).*$/, (req, res) => {
      res.status(404).send('Static files not found. Please build the application first.');
    });
  }
  
  // Start HTTP server
  server.listen(port, () => {
    console.log(`OpenCode WebUI server running on port ${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`Web interface: http://localhost:${port}`);
  });
  
  // Handle signals
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGQUIT', gracefulShutdown);
  
  // Handle unhandled rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
  
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown();
  });
}

// Run main function
main().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export { gracefulShutdown, setupProxy, restartOpenCode };