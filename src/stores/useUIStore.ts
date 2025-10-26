import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import type { SidebarSection } from '@/constants/sidebar';
import type { MarkdownDisplayMode } from '@/lib/markdownDisplayModes';
import type { MonoFontOption, UiFontOption } from '@/lib/fontOptions';
import { DEFAULT_MONO_FONT, DEFAULT_UI_FONT } from '@/lib/fontOptions';
import { SEMANTIC_TYPOGRAPHY, type SemanticTypographyKey } from '@/lib/typography';
import { getSafeStorage } from './utils/safeStorage';

export interface TypographySizes {
  markdown: string;
  code: string;
  uiHeader: string;
  uiLabel: string;
  meta: string;
  micro: string;
}

export type RightSidebarTab = 'git' | 'diff' | 'terminal';
interface UIStore {
  // State
  theme: 'light' | 'dark' | 'system';
  isSidebarOpen: boolean;
  sidebarWidth: number;
  isRightSidebarOpen: boolean;
  rightSidebarActiveTab: RightSidebarTab;
  rightSidebarWidth: number;
  isMobile: boolean;
  isCommandPaletteOpen: boolean;
  isHelpDialogOpen: boolean;
  sidebarSection: SidebarSection;
  markdownDisplayMode: MarkdownDisplayMode;
  uiFont: UiFontOption;
  monoFont: MonoFontOption;
  typographySizes: TypographySizes;

  // Actions
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  toggleRightSidebar: () => void;
  setRightSidebarOpen: (open: boolean) => void;
  setRightSidebarActiveTab: (tab: RightSidebarTab) => void;
  setRightSidebarWidth: (width: number) => void;
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
  setTypographySize: (key: SemanticTypographyKey, value: string) => void;
  setTypographySizes: (sizes: TypographySizes) => void;
  resetTypographySizes: () => void;
}

const DEFAULT_TYPOGRAPHY_SIZES: TypographySizes = {
  markdown: SEMANTIC_TYPOGRAPHY.markdown,
  code: SEMANTIC_TYPOGRAPHY.code,
  uiHeader: SEMANTIC_TYPOGRAPHY.uiHeader,
  uiLabel: SEMANTIC_TYPOGRAPHY.uiLabel,
  meta: SEMANTIC_TYPOGRAPHY.meta,
  micro: SEMANTIC_TYPOGRAPHY.micro,
};

export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial State
        theme: 'system',
        isSidebarOpen: true,
        sidebarWidth: 264,
        isRightSidebarOpen: false,
        rightSidebarActiveTab: 'git',
        rightSidebarWidth: 460,
        isMobile: false,
        isCommandPaletteOpen: false,
        isHelpDialogOpen: false,
        sidebarSection: 'sessions',
        markdownDisplayMode: 'compact',
        uiFont: DEFAULT_UI_FONT,
        monoFont: DEFAULT_MONO_FONT,
        typographySizes: DEFAULT_TYPOGRAPHY_SIZES,

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

        // Set sidebar width
        setSidebarWidth: (width) => {
          set({ sidebarWidth: width });
        },

        // Toggle right sidebar
        toggleRightSidebar: () => {
          set((state) => ({ isRightSidebarOpen: !state.isRightSidebarOpen }));
        },

        // Set right sidebar open state
        setRightSidebarOpen: (open) => {
          set({ isRightSidebarOpen: open });
        },

        // Set right sidebar active tab
        setRightSidebarActiveTab: (tab) => {
          set({ rightSidebarActiveTab: tab });
        },

        setRightSidebarWidth: (width) => {
          set({ rightSidebarWidth: width });
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

        setTypographySize: (key, value) => {
          set((state) => ({
            typographySizes: {
              ...state.typographySizes,
              [key]: value,
            },
          }));
        },

        setTypographySizes: (sizes) => {
          set({ typographySizes: sizes });
        },

        resetTypographySizes: () => {
          set({ typographySizes: DEFAULT_TYPOGRAPHY_SIZES });
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
          sidebarWidth: state.sidebarWidth,
          isRightSidebarOpen: state.isRightSidebarOpen,
          rightSidebarActiveTab: state.rightSidebarActiveTab,
          rightSidebarWidth: state.rightSidebarWidth,
          sidebarSection: state.sidebarSection,
          markdownDisplayMode: state.markdownDisplayMode,
          uiFont: state.uiFont,
          monoFont: state.monoFont,
          typographySizes: state.typographySizes,
        })
      }
    ),
    {
      name: 'ui-store'
    }
  )
);
