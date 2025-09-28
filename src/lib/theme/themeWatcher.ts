/**
 * Theme File System Watcher
 * Automatically detects themes added to ~/.config/opencode-webui/themes/
 */

import type { Theme } from '@/types/theme';

export class ThemeWatcher {
  private checkInterval: number = 5000; // Check every 5 seconds
  private intervalId: NodeJS.Timeout | null = null;
  private lastThemeIds: Set<string> = new Set();
  private onThemeAdded?: (theme: Theme) => void;
  private onThemeRemoved?: (themeId: string) => void;
  
  /**
   * Start watching for theme changes
   */
  start(
    onThemeAdded: (theme: Theme) => void,
    onThemeRemoved: (themeId: string) => void
  ) {
    this.onThemeAdded = onThemeAdded;
    this.onThemeRemoved = onThemeRemoved;
    
    // Initial scan
    this.checkForChanges();
    
    // Start periodic checking
    this.intervalId = setInterval(() => {
      this.checkForChanges();
    }, this.checkInterval);
  }
  
  /**
   * Stop watching
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
  
  /**
   * Check for theme changes
   */
  private async checkForChanges() {
    try {
      // Use relative path for internal communication (WebUI server handles this endpoint)
      const apiUrl = '/api/themes/custom';
      
      const response = await fetch(apiUrl);
      if (!response.ok) return;
      
      const themes: Theme[] = await response.json();
      const currentThemeIds = new Set(themes.map(t => t.metadata.id));
      
      // Check for new themes
      for (const theme of themes) {
        if (!this.lastThemeIds.has(theme.metadata.id)) {
          this.onThemeAdded?.(theme);
        }
      }
      
      // Check for removed themes
      for (const themeId of this.lastThemeIds) {
        if (!currentThemeIds.has(themeId)) {
          this.onThemeRemoved?.(themeId);
        }
      }
      
      this.lastThemeIds = currentThemeIds;
    } catch (error) {
      // Failed to check for theme changes
    }
  }
  
  /**
   * Manually trigger a check
   */
  async refresh(): Promise<Theme[]> {
    try {
      // Use relative path for internal communication (WebUI server handles this endpoint)
      const apiUrl = '/api/themes/custom';
      
      const response = await fetch(apiUrl);
      if (!response.ok) return [];
      
      const themes: Theme[] = await response.json();
      this.lastThemeIds = new Set(themes.map(t => t.metadata.id));
      return themes;
    } catch (error) {
      return [];
    }
  }
}

export const themeWatcher = new ThemeWatcher();