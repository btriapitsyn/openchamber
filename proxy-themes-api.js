/**
 * Theme Storage API for OpenCode WebUI
 * Provides persistent theme storage for self-hosted installations
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

// Ensure themes directory exists
async function ensureThemesDir() {
  const themesDir = path.join(process.cwd(), '.opencode', 'themes');
  try {
    await fs.mkdir(themesDir, { recursive: true });
  } catch (error) {
    console.error('Failed to create themes directory:', error);
  }
  return themesDir;
}

// GET /api/themes/custom - List all custom themes
router.get('/themes/custom', async (req, res) => {
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
router.post('/themes/custom', async (req, res) => {
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
router.delete('/themes/custom/:id', async (req, res) => {
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
router.head('/themes/custom', (req, res) => {
  res.status(200).end();
});

// GET /api/themes/shared - Get shared/community themes (future feature)
router.get('/themes/shared', async (req, res) => {
  // In the future, this could connect to a theme repository
  res.json([]);
});

module.exports = router;