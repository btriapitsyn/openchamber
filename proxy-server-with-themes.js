import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4097;
const OPENCODE_URL = process.env.OPENCODE_URL || 'http://localhost:4096';

// Enable CORS for all origins
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// === Theme Storage API ===

// Get user's home directory and ensure themes directory exists
async function ensureThemesDir() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd();
  const themesDir = path.join(homeDir, '.config', 'opencode-webui', 'themes');
  try {
    await fs.mkdir(themesDir, { recursive: true });
    console.log(`Theme directory ready at: ${themesDir}`);
  } catch (error) {
    console.error('Failed to create themes directory:', error);
  }
  return themesDir;
}

// GET /api/themes/custom - List all custom themes
app.get('/api/themes/custom', async (req, res) => {
  try {
    const themesDir = await ensureThemesDir();
    const files = await fs.readdir(themesDir);
    const themeFiles = files.filter(f => f.endsWith('.json'));
    
    const themes = await Promise.all(
      themeFiles.map(async (file) => {
        try {
          const content = await fs.readFile(path.join(themesDir, file), 'utf-8');
          return JSON.parse(content);
        } catch (error) {
          console.error(`Failed to load theme ${file}:`, error);
          return null;
        }
      })
    );
    
    res.json(themes.filter(Boolean));
  } catch (error) {
    console.error('Failed to list themes:', error);
    res.status(500).json({ error: 'Failed to load themes' });
  }
});

// POST /api/themes/custom - Save a custom theme
app.post('/api/themes/custom', async (req, res) => {
  try {
    const theme = req.body;
    
    // Validate theme structure
    if (!theme?.metadata?.id || !theme?.colors) {
      return res.status(400).json({ error: 'Invalid theme format' });
    }
    
    const themesDir = await ensureThemesDir();
    const themePath = path.join(themesDir, `${theme.metadata.id}.json`);
    
    await fs.writeFile(themePath, JSON.stringify(theme, null, 2));
    
    res.json({ 
      success: true, 
      message: `Theme ${theme.metadata.id} saved successfully`,
      path: themePath 
    });
  } catch (error) {
    console.error('Failed to save theme:', error);
    res.status(500).json({ error: 'Failed to save theme' });
  }
});

// DELETE /api/themes/custom/:id - Delete a custom theme
app.delete('/api/themes/custom/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const themesDir = await ensureThemesDir();
    const themePath = path.join(themesDir, `${id}.json`);
    
    await fs.unlink(themePath);
    
    res.json({ 
      success: true, 
      message: `Theme ${id} deleted successfully` 
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Theme not found' });
    }
    console.error('Failed to delete theme:', error);
    res.status(500).json({ error: 'Failed to delete theme' });
  }
});

// HEAD /api/themes/custom - Check if backend storage is available
app.head('/api/themes/custom', (req, res) => {
  res.status(200).end();
});

// === Proxy all other requests to OpenCode server ===
app.use('/', createProxyMiddleware({
  target: OPENCODE_URL,
  changeOrigin: true,
  ws: true, // Enable WebSocket proxy
  onProxyReq: (proxyReq, req, res) => {
    console.log(`Proxying ${req.method} ${req.url} to ${OPENCODE_URL}`);
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy error', message: err.message });
  }
}));

app.listen(PORT, async () => {
  const themesDir = await ensureThemesDir();
  console.log(`OpenCode WebUI server running on http://localhost:${PORT}`);
  console.log(`- Theme storage API available at /api/themes/*`);
  console.log(`- Proxying OpenCode requests to ${OPENCODE_URL}`);
  console.log(`- Themes stored in: ${themesDir}`);
});