import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface UIStore {
  // State
  theme: 'light' | 'dark' | 'system';
  isSidebarOpen: boolean;
  isMobile: boolean;
  isCommandPaletteOpen: boolean;

  // Actions
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setIsMobile: (isMobile: boolean) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  applyTheme: () => void;
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
          // Auto-close sidebar on mobile
          if (isMobile) {
            set({ isSidebarOpen: false });
          }
        },

        // Toggle command palette
        toggleCommandPalette: () => {
          set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen }));
        },

        // Set command palette open state
        setCommandPaletteOpen: (open) => {
          set({ isCommandPaletteOpen: open });
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
        partialize: (state) => ({
          theme: state.theme,
          isSidebarOpen: state.isSidebarOpen
        })
      }
    ),
    {
      name: 'ui-store'
    }
  )
);