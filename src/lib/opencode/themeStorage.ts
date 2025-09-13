/**
 * Theme Storage Service
 * Handles persistent storage of custom themes for self-hosted installations
 */

import type { Theme } from '@/types/theme';

export class ThemeStorageService {
  private static instance: ThemeStorageService;
  
  static getInstance(): ThemeStorageService {
    if (!this.instance) {
      this.instance = new ThemeStorageService();
    }
    return this.instance;
  }
  
  /**
   * Load custom themes from backend storage
   */
  async loadCustomThemes(): Promise<Theme[]> {
    try {
      const response = await fetch('/api/themes/custom');
      if (!response.ok) {
        // Fallback to localStorage if backend not available
        return this.loadFromLocalStorage();
      }
      const themes = await response.json();
      return themes;
    } catch (error) {
      console.warn('Failed to load themes from backend, using localStorage:', error);
      return this.loadFromLocalStorage();
    }
  }
  
  /**
   * Save a custom theme to backend storage
   */
  async saveCustomTheme(theme: Theme): Promise<void> {
    try {
      const response = await fetch('/api/themes/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(theme)
      });
      
      if (!response.ok) {
        throw new Error('Failed to save theme to backend');
      }
      
      // Also save to localStorage as backup
      this.saveToLocalStorage(theme);
    } catch (error) {
      console.warn('Failed to save theme to backend, using localStorage:', error);
      this.saveToLocalStorage(theme);
    }
  }
  
  /**
   * Delete a custom theme from backend storage
   */
  async deleteCustomTheme(themeId: string): Promise<void> {
    try {
      const response = await fetch(`/api/themes/custom/${themeId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete theme from backend');
      }
      
      // Also remove from localStorage
      this.deleteFromLocalStorage(themeId);
    } catch (error) {
      console.warn('Failed to delete theme from backend, using localStorage:', error);
      this.deleteFromLocalStorage(themeId);
    }
  }
  
  /**
   * Export theme as downloadable file
   */
  exportTheme(theme: Theme): void {
    const json = JSON.stringify(theme, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${theme.metadata.id}-theme.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  /**
   * Import theme from file
   */
  async importTheme(file: File): Promise<Theme> {
    const text = await file.text();
    const theme = JSON.parse(text) as Theme;
    
    // Validate theme structure
    if (!theme.metadata?.id || !theme.colors) {
      throw new Error('Invalid theme format');
    }
    
    return theme;
  }
  
  // === LocalStorage Fallback Methods ===
  
  private loadFromLocalStorage(): Theme[] {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem('customThemes');
    return saved ? JSON.parse(saved) : [];
  }
  
  private saveToLocalStorage(theme: Theme): void {
    if (typeof window === 'undefined') return;
    
    const existing = this.loadFromLocalStorage();
    const index = existing.findIndex(t => t.metadata.id === theme.metadata.id);
    
    if (index >= 0) {
      existing[index] = theme;
    } else {
      existing.push(theme);
    }
    
    localStorage.setItem('customThemes', JSON.stringify(existing));
  }
  
  private deleteFromLocalStorage(themeId: string): void {
    if (typeof window === 'undefined') return;
    
    const existing = this.loadFromLocalStorage();
    const filtered = existing.filter(t => t.metadata.id !== themeId);
    localStorage.setItem('customThemes', JSON.stringify(filtered));
  }
  
  /**
   * Get storage info
   */
  async getStorageInfo(): Promise<{
    backend: boolean;
    localStorage: boolean;
    customThemeCount: number;
    storageSize?: number;
  }> {
    const themes = await this.loadCustomThemes();
    const localThemes = this.loadFromLocalStorage();
    
    // Check if backend is available
    let backendAvailable = false;
    try {
      const response = await fetch('/api/themes/custom', { method: 'HEAD' });
      backendAvailable = response.ok;
    } catch {}
    
    return {
      backend: backendAvailable,
      localStorage: true,
      customThemeCount: themes.length,
      storageSize: JSON.stringify(localThemes).length
    };
  }
}

export const themeStorage = ThemeStorageService.getInstance();