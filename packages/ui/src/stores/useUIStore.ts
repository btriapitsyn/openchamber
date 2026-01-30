import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import type { SidebarSection } from '@/constants/sidebar';
import { getSafeStorage } from './utils/safeStorage';
import { SEMANTIC_TYPOGRAPHY, getTypographyVariable, type SemanticTypographyKey } from '@/lib/typography';

export type MainTab = 'chat' | 'plan' | 'git' | 'diff' | 'terminal' | 'files';

export type MainTabGuard = (nextTab: MainTab) => boolean;
export type EventStreamStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'paused'
  | 'offline'
  | 'error';

interface UIStore {

  theme: 'light' | 'dark' | 'system';
  isMultiRunLauncherOpen: boolean;
  multiRunLauncherPrefillPrompt: string;
  isSidebarOpen: boolean;
  sidebarWidth: number;
  hasManuallyResizedLeftSidebar: boolean;
  isSessionSwitcherOpen: boolean;
  activeMainTab: MainTab;
  mainTabGuard: MainTabGuard | null;
  pendingDiffFile: string | null;
  isMobile: boolean;
  isKeyboardOpen: boolean;
  isCommandPaletteOpen: boolean;
  isHelpDialogOpen: boolean;
  isAboutDialogOpen: boolean;
  isSessionCreateDialogOpen: boolean;
  isSettingsDialogOpen: boolean;
  isModelSelectorOpen: boolean;
  sidebarSection: SidebarSection;
  eventStreamStatus: EventStreamStatus;
  eventStreamHint: string | null;
  showReasoningTraces: boolean;
  showTextJustificationActivity: boolean;
  autoDeleteEnabled: boolean;
  autoDeleteAfterDays: number;
  autoDeleteLastRunAt: number | null;
  memoryLimitHistorical: number;
  memoryLimitViewport: number;
  memoryLimitActiveSession: number;

  toolCallExpansion: 'collapsed' | 'activity' | 'detailed';
  fontSize: number;
  padding: number;
  cornerRadius: number;
  inputBarOffset: number;

  favoriteModels: Array<{ providerID: string; modelID: string }>;
  recentModels: Array<{ providerID: string; modelID: string }>;
  recentAgents: string[];
  recentEfforts: Record<string, string[]>;

  diffLayoutPreference: 'dynamic' | 'inline' | 'side-by-side';
  diffFileLayout: Record<string, 'inline' | 'side-by-side'>;
  diffWrapLines: boolean;
  diffViewMode: 'single' | 'stacked';
  isTimelineDialogOpen: boolean;
  isImagePreviewOpen: boolean;
  nativeNotificationsEnabled: boolean;
  notificationMode: 'always' | 'hidden-only';
  notifyOnSubtasks: boolean;

  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setSessionSwitcherOpen: (open: boolean) => void;
  setActiveMainTab: (tab: MainTab) => void;
  setMainTabGuard: (guard: MainTabGuard | null) => void;
  setPendingDiffFile: (filePath: string | null) => void;
  navigateToDiff: (filePath: string) => void;
  consumePendingDiffFile: () => string | null;
  setIsMobile: (isMobile: boolean) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleHelpDialog: () => void;
  setHelpDialogOpen: (open: boolean) => void;
  setAboutDialogOpen: (open: boolean) => void;
  setSessionCreateDialogOpen: (open: boolean) => void;
  setSettingsDialogOpen: (open: boolean) => void;
  setModelSelectorOpen: (open: boolean) => void;
  applyTheme: () => void;
  setSidebarSection: (section: SidebarSection) => void;
  setEventStreamStatus: (status: EventStreamStatus, hint?: string | null) => void;
  setShowReasoningTraces: (value: boolean) => void;
  setShowTextJustificationActivity: (value: boolean) => void;
  setAutoDeleteEnabled: (value: boolean) => void;
  setAutoDeleteAfterDays: (days: number) => void;
  setAutoDeleteLastRunAt: (timestamp: number | null) => void;
  setMemoryLimitHistorical: (value: number) => void;
  setMemoryLimitViewport: (value: number) => void;
  setMemoryLimitActiveSession: (value: number) => void;
  setToolCallExpansion: (value: 'collapsed' | 'activity' | 'detailed') => void;
  setFontSize: (size: number) => void;
  setPadding: (size: number) => void;
  setCornerRadius: (radius: number) => void;
  setInputBarOffset: (offset: number) => void;
  setKeyboardOpen: (open: boolean) => void;
  applyTypography: () => void;
  applyPadding: () => void;
  updateProportionalSidebarWidths: () => void;
  toggleFavoriteModel: (providerID: string, modelID: string) => void;
  isFavoriteModel: (providerID: string, modelID: string) => boolean;
  addRecentModel: (providerID: string, modelID: string) => void;
  addRecentAgent: (agentName: string) => void;
  addRecentEffort: (providerID: string, modelID: string, variant: string | undefined) => void;
  setDiffLayoutPreference: (mode: 'dynamic' | 'inline' | 'side-by-side') => void;
  setDiffFileLayout: (filePath: string, mode: 'inline' | 'side-by-side') => void;
  setDiffWrapLines: (wrap: boolean) => void;
  setDiffViewMode: (mode: 'single' | 'stacked') => void;
  setMultiRunLauncherOpen: (open: boolean) => void;
  setTimelineDialogOpen: (open: boolean) => void;
  setImagePreviewOpen: (open: boolean) => void;
  setNativeNotificationsEnabled: (value: boolean) => void;
  setNotificationMode: (mode: 'always' | 'hidden-only') => void;
  setNotifyOnSubtasks: (value: boolean) => void;
  openMultiRunLauncher: () => void;
  openMultiRunLauncherWithPrompt: (prompt: string) => void;
}

export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      (set, get) => ({

        theme: 'system',
        isMultiRunLauncherOpen: false,
        multiRunLauncherPrefillPrompt: '',
        isSidebarOpen: true,
        sidebarWidth: 264,
        hasManuallyResizedLeftSidebar: false,
        isSessionSwitcherOpen: false,
        activeMainTab: 'chat',
        mainTabGuard: null,
        pendingDiffFile: null,
        isMobile: false,
        isKeyboardOpen: false,
        isCommandPaletteOpen: false,
        isHelpDialogOpen: false,
        isAboutDialogOpen: false,
        isSessionCreateDialogOpen: false,
        isSettingsDialogOpen: false,
        isModelSelectorOpen: false,
        sidebarSection: 'sessions',
        eventStreamStatus: 'idle',
        eventStreamHint: null,
        showReasoningTraces: true,
        showTextJustificationActivity: false,
        autoDeleteEnabled: false,
        autoDeleteAfterDays: 30,
        autoDeleteLastRunAt: null,
        memoryLimitHistorical: 90,
        memoryLimitViewport: 120,
        memoryLimitActiveSession: 180,
        toolCallExpansion: 'collapsed',
        fontSize: 100,
        padding: 100,
        cornerRadius: 12,
        inputBarOffset: 0,
        favoriteModels: [],
        recentModels: [],
        recentAgents: [],
        recentEfforts: {},
        diffLayoutPreference: 'inline',
        diffFileLayout: {},
        diffWrapLines: false,
        diffViewMode: 'stacked',
        isTimelineDialogOpen: false,
        isImagePreviewOpen: false,
        nativeNotificationsEnabled: false,
        notificationMode: 'hidden-only',
        notifyOnSubtasks: true,

        setTheme: (theme) => {
          set({ theme });
          get().applyTheme();
        },

        toggleSidebar: () => {
          set((state) => {
            const newOpen = !state.isSidebarOpen;

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

        setSidebarOpen: (open) => {
          set(() => {

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

        setSidebarWidth: (width) => {
          set({ sidebarWidth: width, hasManuallyResizedLeftSidebar: true });
        },

        setSessionSwitcherOpen: (open) => {
          set({ isSessionSwitcherOpen: open });
        },

        setMainTabGuard: (guard) => {
          set({ mainTabGuard: guard });
        },

        setActiveMainTab: (tab) => {
          const guard = get().mainTabGuard;
          if (guard && !guard(tab)) {
            return;
          }
          set({ activeMainTab: tab });
        },

        setPendingDiffFile: (filePath) => {
          set({ pendingDiffFile: filePath });
        },

        navigateToDiff: (filePath) => {
          const guard = get().mainTabGuard;
          if (guard && !guard('diff')) {
            return;
          }
          set({ pendingDiffFile: filePath, activeMainTab: 'diff' });
        },

        consumePendingDiffFile: () => {
          const { pendingDiffFile } = get();
          if (pendingDiffFile) {
            set({ pendingDiffFile: null });
          }
          return pendingDiffFile;
        },

        setIsMobile: (isMobile) => {
          set({ isMobile });
        },

        toggleCommandPalette: () => {
          set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen }));
        },

        setCommandPaletteOpen: (open) => {
          set({ isCommandPaletteOpen: open });
        },

        toggleHelpDialog: () => {
          set((state) => ({ isHelpDialogOpen: !state.isHelpDialogOpen }));
        },

        setHelpDialogOpen: (open) => {
          set({ isHelpDialogOpen: open });
        },

        setAboutDialogOpen: (open) => {
          set({ isAboutDialogOpen: open });
        },

        setSessionCreateDialogOpen: (open) => {
          set({ isSessionCreateDialogOpen: open });
        },

        setSettingsDialogOpen: (open) => {
          set({ isSettingsDialogOpen: open });
        },

        setModelSelectorOpen: (open) => {
          set({ isModelSelectorOpen: open });
        },

        setSidebarSection: (section) => {
          set({ sidebarSection: section });
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

        setShowTextJustificationActivity: (value) => {
          set({ showTextJustificationActivity: value });
        },

        setAutoDeleteEnabled: (value) => {
          set({ autoDeleteEnabled: value });
        },

        setAutoDeleteAfterDays: (days) => {
          const clampedDays = Math.max(1, Math.min(365, days));
          set({ autoDeleteAfterDays: clampedDays });
        },

        setAutoDeleteLastRunAt: (timestamp) => {
          set({ autoDeleteLastRunAt: timestamp });
        },

        setMemoryLimitHistorical: (value) => {
          const clamped = Math.max(10, Math.min(500, Math.round(value)));
          set({ memoryLimitHistorical: clamped });
        },

        setMemoryLimitViewport: (value) => {
          const clamped = Math.max(20, Math.min(500, Math.round(value)));
          set({ memoryLimitViewport: clamped });
        },

        setMemoryLimitActiveSession: (value) => {
          const clamped = Math.max(30, Math.min(1000, Math.round(value)));
          set({ memoryLimitActiveSession: clamped });
        },

        setToolCallExpansion: (value) => {
          set({ toolCallExpansion: value });
        },

        setFontSize: (size) => {
          // Clamp between 50% and 200%
          const clampedSize = Math.max(50, Math.min(200, size));
          set({ fontSize: clampedSize });
          get().applyTypography();
        },

        setPadding: (size) => {
          // Clamp between 50% and 200%
          const clampedSize = Math.max(50, Math.min(200, size));
          set({ padding: clampedSize });
          get().applyPadding();
        },

        setCornerRadius: (radius) => {
          set({ cornerRadius: radius });
        },

        applyTypography: () => {
          const { fontSize } = get();
          const root = document.documentElement;

          // 100 = default (1.0x), 50 = half size (0.5x), 200 = double (2.0x)
          const scale = fontSize / 100;

          const entries = Object.entries(SEMANTIC_TYPOGRAPHY) as Array<[SemanticTypographyKey, string]>;

          // Default must be SEMANTIC_TYPOGRAPHY (from CSS). Remove overrides.
          if (scale === 1) {
            for (const [key] of entries) {
              root.style.removeProperty(getTypographyVariable(key));
            }
            return;
          }

          for (const [key, baseValue] of entries) {
            const numericValue = parseFloat(baseValue);
            if (!Number.isFinite(numericValue)) {
              continue;
            }
            root.style.setProperty(getTypographyVariable(key), `${numericValue * scale}rem`);
          }
        },

        applyPadding: () => {
          const { padding } = get();
          const root = document.documentElement;

          const scale = padding / 100;

          if (scale === 1) {
            root.style.removeProperty('--padding-scale');
            root.style.removeProperty('--line-height-tight');
            root.style.removeProperty('--line-height-normal');
            root.style.removeProperty('--line-height-relaxed');
            root.style.removeProperty('--line-height-loose');
            return;
          }

          // Apply padding as a percentage scale with non-linear scaling
          // Use square root for more natural scaling at extremes
          const adjustedScale = Math.sqrt(scale);

          // Set the CSS custom property that all spacing tokens reference
          root.style.setProperty('--padding-scale', adjustedScale.toString());

          // Dampened line-height scaling at extremes
          const lineHeightScale = 1 + (scale - 1) * 0.15;

          root.style.setProperty('--line-height-tight', (1.25 * lineHeightScale).toFixed(3));
          root.style.setProperty('--line-height-normal', (1.5 * lineHeightScale).toFixed(3));
          root.style.setProperty('--line-height-relaxed', (1.625 * lineHeightScale).toFixed(3));
          root.style.setProperty('--line-height-loose', (2 * lineHeightScale).toFixed(3));
        },

        setDiffLayoutPreference: (mode) => {
          set({ diffLayoutPreference: mode });
        },

        setDiffFileLayout: (filePath, mode) => {
          set((state) => ({
            diffFileLayout: {
              ...state.diffFileLayout,
              [filePath]: mode,
            },
          }));
        },

        setDiffWrapLines: (wrap) => {
          set({ diffWrapLines: wrap });
        },

        setDiffViewMode: (mode) => {
          set({ diffViewMode: mode });
        },
 
        setInputBarOffset: (offset) => {
          set({ inputBarOffset: offset });
        },

        setKeyboardOpen: (open) => {
          set({ isKeyboardOpen: open });
        },

        toggleFavoriteModel: (providerID, modelID) => {
          set((state) => {
            const exists = state.favoriteModels.some(
              (fav) => fav.providerID === providerID && fav.modelID === modelID
            );
            
            if (exists) {
              // Remove from favorites
              return {
                favoriteModels: state.favoriteModels.filter(
                  (fav) => !(fav.providerID === providerID && fav.modelID === modelID)
                ),
              };
            } else {
              // Add to favorites (newest first)
              return {
                favoriteModels: [{ providerID, modelID }, ...state.favoriteModels],
              };
            }
          });
        },

        isFavoriteModel: (providerID, modelID) => {
          const { favoriteModels } = get();
          return favoriteModels.some(
            (fav) => fav.providerID === providerID && fav.modelID === modelID
          );
        },

        addRecentModel: (providerID, modelID) => {
          set((state) => {
            // Remove existing instance if any
            const filtered = state.recentModels.filter(
              (m) => !(m.providerID === providerID && m.modelID === modelID)
            );
            // Add to front, limit to 5
            return {
              recentModels: [{ providerID, modelID }, ...filtered].slice(0, 5),
            };
          });
        },

        addRecentAgent: (agentName) => {
          const normalized = typeof agentName === 'string' ? agentName.trim() : '';
          if (!normalized) {
            return;
          }
          set((state) => {
            if (state.recentAgents.includes(normalized)) {
              return state;
            }
            const filtered = state.recentAgents;
            return {
              recentAgents: [normalized, ...filtered].slice(0, 5),
            };
          });
        },

        addRecentEffort: (providerID, modelID, variant) => {
          const provider = typeof providerID === 'string' ? providerID.trim() : '';
          const model = typeof modelID === 'string' ? modelID.trim() : '';
          if (!provider || !model) {
            return;
          }
          const key = `${provider}/${model}`;
          const normalizedVariant = typeof variant === 'string' && variant.trim().length > 0 ? variant.trim() : 'default';
          set((state) => {
            const current = state.recentEfforts[key] ?? [];
            if (current.includes(normalizedVariant)) {
              return state;
            }
            const filtered = current;
            return {
              recentEfforts: {
                ...state.recentEfforts,
                [key]: [normalizedVariant, ...filtered].slice(0, 5),
              },
            };
          });
        },

        updateProportionalSidebarWidths: () => {
          if (typeof window === 'undefined') {
            return;
          }

          set((state) => {
            const updates: Partial<UIStore> = {};

            if (state.isSidebarOpen && !state.hasManuallyResizedLeftSidebar) {
              updates.sidebarWidth = Math.floor(window.innerWidth * 0.2);
            }

            return updates;
          });
        },

        applyTheme: () => {
          const { theme } = get();
          const root = document.documentElement;

          root.classList.remove('light', 'dark');

          if (theme === 'system') {
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            root.classList.add(systemTheme);
          } else {
            root.classList.add(theme);
          }
        },

        setMultiRunLauncherOpen: (open) => {
          set((state) => ({
            isMultiRunLauncherOpen: open,
            multiRunLauncherPrefillPrompt: open ? state.multiRunLauncherPrefillPrompt : '',
          }));
        },

        openMultiRunLauncher: () => {
          set({
            isMultiRunLauncherOpen: true,
            multiRunLauncherPrefillPrompt: '',
            isSessionSwitcherOpen: false,
          });
        },

        openMultiRunLauncherWithPrompt: (prompt) => {
          set({
            isMultiRunLauncherOpen: true,
            multiRunLauncherPrefillPrompt: prompt,
            isSessionSwitcherOpen: false,
          });
        },

        setTimelineDialogOpen: (open) => {
          set({ isTimelineDialogOpen: open });
        },

        setImagePreviewOpen: (open) => {
          set({ isImagePreviewOpen: open });
        },

        setNativeNotificationsEnabled: (value) => {
          set({ nativeNotificationsEnabled: value });
        },

        setNotificationMode: (mode) => {
          set({ notificationMode: mode });
        },

        setNotifyOnSubtasks: (value) => {
          set({ notifyOnSubtasks: value });
        },
      }),
      {
        name: 'ui-store',
        storage: createJSONStorage(() => getSafeStorage()),
        partialize: (state) => ({
          theme: state.theme,
          isSidebarOpen: state.isSidebarOpen,
          sidebarWidth: state.sidebarWidth,
          isSessionSwitcherOpen: state.isSessionSwitcherOpen,
          activeMainTab: state.activeMainTab,
          sidebarSection: state.sidebarSection,
          isSessionCreateDialogOpen: state.isSessionCreateDialogOpen,
          isSettingsDialogOpen: state.isSettingsDialogOpen,
          showReasoningTraces: state.showReasoningTraces,
          showTextJustificationActivity: state.showTextJustificationActivity,
          autoDeleteEnabled: state.autoDeleteEnabled,
          autoDeleteAfterDays: state.autoDeleteAfterDays,
          autoDeleteLastRunAt: state.autoDeleteLastRunAt,
          memoryLimitHistorical: state.memoryLimitHistorical,
          memoryLimitViewport: state.memoryLimitViewport,
          memoryLimitActiveSession: state.memoryLimitActiveSession,
          toolCallExpansion: state.toolCallExpansion,
          fontSize: state.fontSize,
          padding: state.padding,
          cornerRadius: state.cornerRadius,
          favoriteModels: state.favoriteModels,
          recentModels: state.recentModels,
          recentAgents: state.recentAgents,
          recentEfforts: state.recentEfforts,
          diffLayoutPreference: state.diffLayoutPreference,
          diffWrapLines: state.diffWrapLines,
          diffViewMode: state.diffViewMode,
          nativeNotificationsEnabled: state.nativeNotificationsEnabled,
          notificationMode: state.notificationMode,
          notifyOnSubtasks: state.notifyOnSubtasks,
        })
      }
    ),
    {
      name: 'ui-store'
    }
  )
);
