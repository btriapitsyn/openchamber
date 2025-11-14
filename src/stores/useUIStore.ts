import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import type { SidebarSection } from '@/constants/sidebar';
import type { MarkdownDisplayMode } from '@/lib/markdownDisplayModes';
import type { MonoFontOption, UiFontOption } from '@/lib/fontOptions';
import { DEFAULT_MONO_FONT, DEFAULT_UI_FONT } from '@/lib/fontOptions';
import { type SemanticTypographyKey } from '@/lib/typography';
import { getTypographyScale } from '@/lib/typographyPresets';
import { getSafeStorage } from './utils/safeStorage';

export interface TypographySizes {
  markdown: string;
  code: string;
  uiHeader: string;
  uiLabel: string;
  meta: string;
  micro: string;
}

export type RightSidebarTab = 'git' | 'diff' | 'terminal' | 'prompt';
export type EventStreamStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'paused'
  | 'offline'
  | 'error';

interface UIStore {
  // State
  theme: 'light' | 'dark' | 'system';
  isSidebarOpen: boolean;
  sidebarWidth: number;
  hasManuallyResizedLeftSidebar: boolean;
  isSessionSwitcherOpen: boolean;
  isRightSidebarOpen: boolean;
  rightSidebarActiveTab: RightSidebarTab;
  rightSidebarWidth: number;
  hasManuallyResizedRightSidebar: boolean;
  isMobile: boolean;
  isCommandPaletteOpen: boolean;
  isHelpDialogOpen: boolean;
  isSessionCreateDialogOpen: boolean;
  isSettingsDialogOpen: boolean;
  sidebarSection: SidebarSection;
  markdownDisplayMode: MarkdownDisplayMode;
  uiFont: UiFontOption;
  monoFont: MonoFontOption;
  typographySizes: TypographySizes;
  eventStreamStatus: EventStreamStatus;
  eventStreamHint: string | null;
  showReasoningTraces: boolean;

  // Actions
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setSessionSwitcherOpen: (open: boolean) => void;
  toggleRightSidebar: () => void;
  setRightSidebarOpen: (open: boolean) => void;
  setRightSidebarActiveTab: (tab: RightSidebarTab) => void;
  setRightSidebarWidth: (width: number) => void;
  setIsMobile: (isMobile: boolean) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleHelpDialog: () => void;
  setHelpDialogOpen: (open: boolean) => void;
  setSessionCreateDialogOpen: (open: boolean) => void;
  setSettingsDialogOpen: (open: boolean) => void;
  applyTheme: () => void;
  setSidebarSection: (section: SidebarSection) => void;
  setMarkdownDisplayMode: (mode: MarkdownDisplayMode) => void;
  setUiFont: (font: UiFontOption) => void;
  setMonoFont: (font: MonoFontOption) => void;
  setTypographySize: (key: SemanticTypographyKey, value: string) => void;
  setTypographySizes: (sizes: TypographySizes) => void;
  resetTypographySizes: () => void;
  setEventStreamStatus: (status: EventStreamStatus, hint?: string | null) => void;
  setShowReasoningTraces: (value: boolean) => void;
  updateProportionalSidebarWidths: () => void;
}

const DEFAULT_TYPOGRAPHY_SIZES: TypographySizes = getTypographyScale('comfortable');

export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial State
        theme: 'system',
        isSidebarOpen: true,
        sidebarWidth: 264,
        hasManuallyResizedLeftSidebar: false,
        isSessionSwitcherOpen: false,
        isRightSidebarOpen: false,
        rightSidebarActiveTab: 'git',
        rightSidebarWidth: 460,
        hasManuallyResizedRightSidebar: false,
        isMobile: false,
        isCommandPaletteOpen: false,
        isHelpDialogOpen: false,
        isSessionCreateDialogOpen: false,
        isSettingsDialogOpen: false,
        sidebarSection: 'sessions',
        markdownDisplayMode: 'compact',
       uiFont: DEFAULT_UI_FONT,
        monoFont: DEFAULT_MONO_FONT,
        typographySizes: DEFAULT_TYPOGRAPHY_SIZES,
        eventStreamStatus: 'idle',
        eventStreamHint: null,
        showReasoningTraces: false,

        // Set theme
        setTheme: (theme) => {
          set({ theme });
          get().applyTheme();
        },

        // Toggle sidebar
        toggleSidebar: () => {
          set((state) => {
            const newOpen = !state.isSidebarOpen;
            // When opening, set width to 20% of window width and reset manual resize flag
            if (newOpen && typeof window !== 'undefined') {
              const proportionalWidth = Math.floor(window.innerWidth * 0.2);
              return {
                isSidebarOpen: newOpen,
                sidebarWidth: proportionalWidth,
                hasManuallyResizedLeftSidebar: false
              };
            }
            return { isSidebarOpen: newOpen };
          });
        },

        // Set sidebar open state
        setSidebarOpen: (open) => {
          set((state) => {
            // When opening, set width to 20% of window width and reset manual resize flag
            if (open && typeof window !== 'undefined') {
              const proportionalWidth = Math.floor(window.innerWidth * 0.2);
              return {
                isSidebarOpen: open,
                sidebarWidth: proportionalWidth,
                hasManuallyResizedLeftSidebar: false
              };
            }
            return { isSidebarOpen: open };
          });
        },

        // Set sidebar width
        setSidebarWidth: (width) => {
          set({ sidebarWidth: width, hasManuallyResizedLeftSidebar: true });
        },

        setSessionSwitcherOpen: (open) => {
          set({ isSessionSwitcherOpen: open });
        },

        // Toggle right sidebar
        toggleRightSidebar: () => {
          set((state) => {
            const newRightSidebarOpen = !state.isRightSidebarOpen;
            // When opening, set width to 40% of window width and reset manual resize flag
            if (newRightSidebarOpen && typeof window !== 'undefined') {
              const proportionalWidth = Math.floor(window.innerWidth * 0.4);
              return {
                isRightSidebarOpen: newRightSidebarOpen,
                rightSidebarWidth: proportionalWidth,
                hasManuallyResizedRightSidebar: false,
                // DISABLED: Auto-close left sidebar when right sidebar opens
                // isSidebarOpen: newRightSidebarOpen ? false : state.isSidebarOpen,
              };
            }
            return {
              isRightSidebarOpen: newRightSidebarOpen,
              // DISABLED: Auto-close left sidebar when right sidebar opens
              // isSidebarOpen: newRightSidebarOpen ? false : state.isSidebarOpen,
            };
          });
        },

        // Set right sidebar open state
        setRightSidebarOpen: (open) => {
          set((state) => {
            // When opening, set width to 40% of window width and reset manual resize flag
            if (open && typeof window !== 'undefined') {
              const proportionalWidth = Math.floor(window.innerWidth * 0.4);
              return {
                isRightSidebarOpen: open,
                rightSidebarWidth: proportionalWidth,
                hasManuallyResizedRightSidebar: false,
                // DISABLED: Auto-close left sidebar when right sidebar opens
                // isSidebarOpen: open ? false : state.isSidebarOpen,
              };
            }
            return {
              isRightSidebarOpen: open,
              // DISABLED: Auto-close left sidebar when right sidebar opens
              // isSidebarOpen: open ? false : state.isSidebarOpen,
            };
          });
        },

        // Set right sidebar active tab
        setRightSidebarActiveTab: (tab) => {
          set({ rightSidebarActiveTab: tab });
        },

        setRightSidebarWidth: (width) => {
          set({ rightSidebarWidth: width, hasManuallyResizedRightSidebar: true });
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

        setSessionCreateDialogOpen: (open) => {
          set({ isSessionCreateDialogOpen: open });
        },

        setSettingsDialogOpen: (open) => {
          set({ isSettingsDialogOpen: open });
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

        setEventStreamStatus: (status, hint) => {
          set({
            eventStreamStatus: status,
            eventStreamHint: hint ?? null,
          });
        },

        setShowReasoningTraces: (value) => {
          set({ showReasoningTraces: value });
        },

        // Update sidebar widths proportionally if not manually resized
        updateProportionalSidebarWidths: () => {
          if (typeof window === 'undefined') {
            return;
          }

          set((state) => {
            const updates: Partial<UIStore> = {};

            // Update left sidebar if open and not manually resized
            if (state.isSidebarOpen && !state.hasManuallyResizedLeftSidebar) {
              updates.sidebarWidth = Math.floor(window.innerWidth * 0.2);
            }

            // Update right sidebar if open and not manually resized
            if (state.isRightSidebarOpen && !state.hasManuallyResizedRightSidebar) {
              updates.rightSidebarWidth = Math.floor(window.innerWidth * 0.4);
            }

            return updates;
          });
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
          isSessionSwitcherOpen: state.isSessionSwitcherOpen,
          isRightSidebarOpen: state.isRightSidebarOpen,
          rightSidebarActiveTab: state.rightSidebarActiveTab,
          rightSidebarWidth: state.rightSidebarWidth,
          sidebarSection: state.sidebarSection,
          markdownDisplayMode: state.markdownDisplayMode,
          uiFont: state.uiFont,
          monoFont: state.monoFont,
          typographySizes: state.typographySizes,
          isSessionCreateDialogOpen: state.isSessionCreateDialogOpen,
          isSettingsDialogOpen: state.isSettingsDialogOpen,
          showReasoningTraces: state.showReasoningTraces,
        })
      }
    ),
    {
      name: 'ui-store'
    }
  )
);
