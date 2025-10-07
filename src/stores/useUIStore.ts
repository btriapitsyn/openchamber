import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import type { SidebarSection } from '@/constants/sidebar';
import type { MarkdownDisplayMode } from '@/lib/markdownDisplayModes';
import type { MonoFontOption, UiFontOption } from '@/lib/fontOptions';
import { DEFAULT_MONO_FONT, DEFAULT_UI_FONT } from '@/lib/fontOptions';
import { getSafeStorage } from './utils/safeStorage';

interface UIStore {
  // State
  theme: 'light' | 'dark' | 'system';
  isSidebarOpen: boolean;
  isMobile: boolean;
  isCommandPaletteOpen: boolean;
  isHelpDialogOpen: boolean;
  sidebarSection: SidebarSection;
  markdownDisplayMode: MarkdownDisplayMode;
  uiFont: UiFontOption;
  monoFont: MonoFontOption;

  // Actions
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setIsMobile: (isMobile: boolean) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleHelpDialog: () => void;
  setHelpDialogOpen: (open: boolean) => void;
  applyTheme: () => void;
  setSidebarSection: (section: SidebarSection) => void;
  setMarkdownDisplayMode: (mode: MarkdownDisplayMode) => void;
  setUiFont: (font: UiFontOption) => void;
  setMonoFont: (font: MonoFontOption) => void;
}

export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial State
        theme: 'system',
        isSidebarOpen: true,
        isMobile: false,
        isCommandPaletteOpen: false,
        isHelpDialogOpen: false,
        sidebarSection: 'sessions',
        markdownDisplayMode: 'compact',
        uiFont: DEFAULT_UI_FONT,
        monoFont: DEFAULT_MONO_FONT,

        // Set theme
        setTheme: (theme) => {
          set({ theme });
          get().applyTheme();
        },

        // Toggle sidebar
        toggleSidebar: () => {
          set((state) => ({ isSidebarOpen: !state.isSidebarOpen }));
        },

        // Set sidebar open state
        setSidebarOpen: (open) => {
          set({ isSidebarOpen: open });
        },

        // Set mobile state
        setIsMobile: (isMobile) => {
          set({ isMobile });
        },

        // Toggle command palette
        toggleCommandPalette: () => {
          set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen }));
        },

        // Set command palette open state
        setCommandPaletteOpen: (open) => {
          set({ isCommandPaletteOpen: open });
        },

        // Toggle help dialog
        toggleHelpDialog: () => {
          set((state) => ({ isHelpDialogOpen: !state.isHelpDialogOpen }));
        },

        // Set help dialog open state
        setHelpDialogOpen: (open) => {
          set({ isHelpDialogOpen: open });
        },

        setSidebarSection: (section) => {
          set({ sidebarSection: section });
        },

        setMarkdownDisplayMode: (mode) => {
          set({ markdownDisplayMode: mode });
        },

        setUiFont: (font) => {
          set({ uiFont: font });
        },

        setMonoFont: (font) => {
          set({ monoFont: font });
        },

        // Apply theme to document
        applyTheme: () => {
          const { theme } = get();
          const root = document.documentElement;
          
          // Remove existing theme classes
          root.classList.remove('light', 'dark');
          
          if (theme === 'system') {
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            root.classList.add(systemTheme);
          } else {
            root.classList.add(theme);
          }
        }
      }),
      {
        name: 'ui-store',
        storage: createJSONStorage(() => getSafeStorage()),
        partialize: (state) => ({
          theme: state.theme,
          isSidebarOpen: state.isSidebarOpen,
          sidebarSection: state.sidebarSection,
          markdownDisplayMode: state.markdownDisplayMode,
          uiFont: state.uiFont,
          monoFont: state.monoFont,
        })
      }
    ),
    {
      name: 'ui-store'
    }
  )
);
