import fs from 'fs/promises';
import path from 'path';
import type { Plugin } from 'vite';

async function ensureThemesDir(): Promise<string> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd();
  const themesDir = path.join(homeDir, '.config', 'opencode-webui', 'themes');
  try {
    await fs.mkdir(themesDir, { recursive: true });
    console.log(`✓ Theme directory ready at: ${themesDir}`);
  } catch (error) {
    console.error('Failed to create themes directory:', error);
  }
  return themesDir;
}

export function themeStoragePlugin(): Plugin {
  return {
    name: 'theme-storage',
    configureServer(server) {
      // Ensure themes directory exists on server start
      ensureThemesDir();
      
      server.middlewares.use(async (req, res, next) => {
        // Only handle theme API routes
        if (!req.url?.startsWith('/api/themes/')) {
          return next();
        }
        
        const url = req.url;
        
        // GET /api/themes/custom - List themes
        if (url === '/api/themes/custom' && req.method === 'GET') {
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
            
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(themes.filter(Boolean)));
          } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Failed to load themes' }));
          }
          return;
        }
        
        // POST /api/themes/custom - Save theme
        if (url === '/api/themes/custom' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const theme = JSON.parse(body);
              
              if (!theme?.metadata?.id || !theme?.colors) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid theme format' }));
                return;
              }
              
              const themesDir = await ensureThemesDir();
              const themePath = path.join(themesDir, `${theme.metadata.id}.json`);
              
              await fs.writeFile(themePath, JSON.stringify(theme, null, 2));
              
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ 
                success: true, 
                message: `Theme ${theme.metadata.id} saved successfully` 
              }));
            } catch (error) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Failed to save theme' }));
            }
          });
          return;
        }
        
        // DELETE /api/themes/custom/:id
        if (url.startsWith('/api/themes/custom/') && req.method === 'DELETE') {
          const themeId = url.split('/').pop();
          try {
            const themesDir = await ensureThemesDir();
            const themePath = path.join(themesDir, `${themeId}.json`);
            
            await fs.unlink(themePath);
            
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ 
              success: true, 
              message: `Theme ${themeId} deleted successfully` 
            }));
          } catch (error: any) {
            if (error.code === 'ENOENT') {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Theme not found' }));
            } else {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Failed to delete theme' }));
            }
          }
          return;
        }
        
        // HEAD /api/themes/custom - Health check
        if (url === '/api/themes/custom' && req.method === 'HEAD') {
          res.statusCode = 200;
          res.end();
          return;
        }
        
        next();
      });
    }
  };
}