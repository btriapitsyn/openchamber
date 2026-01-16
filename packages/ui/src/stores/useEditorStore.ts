import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';

export interface EditorTab {
  id: string;
  filePath: string;
  fileName: string;
  language: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
}

interface EditorStore {
  tabs: EditorTab[];
  activeTabId: string | null;

  // Internal action to add/update a tab (used by openFile)
  _setTab: (tab: EditorTab) => void;
  
  // Actions
  openFile: (filePath: string, content: string, language: string) => void;
  closeTab: (tabId: string) => void;
  closeAllTabs: () => void;
  setActiveTab: (tabId: string) => void;
  updateContent: (tabId: string, content: string) => void;
  markSaved: (tabId: string, newContent?: string) => void;
  getTab: (tabId: string) => EditorTab | undefined;
  getTabByPath: (filePath: string) => EditorTab | undefined;
  hasUnsavedChanges: () => boolean;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
}

const generateTabId = (): string => {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const getFileName = (filePath: string): string => {
  return filePath.split('/').pop() || filePath;
};

export const useEditorStore = create<EditorStore>()(
  devtools(
    persist(
      (set, get) => ({
        tabs: [],
        activeTabId: null,

        _setTab: (tab) => {
          set((state) => {
            const existingIndex = state.tabs.findIndex((t) => t.id === tab.id);
            if (existingIndex >= 0) {
              const newTabs = [...state.tabs];
              newTabs[existingIndex] = tab;
              return { tabs: newTabs };
            }
            return { tabs: [...state.tabs, tab] };
          });
        },

        openFile: (filePath, content, language) => {
          const state = get();
          
          // Check if file is already open
          const existingTab = state.tabs.find((t) => t.filePath === filePath);
          if (existingTab) {
            // Just activate the existing tab
            set({ activeTabId: existingTab.id });
            return;
          }

          // Create new tab
          const newTab: EditorTab = {
            id: generateTabId(),
            filePath,
            fileName: getFileName(filePath),
            language,
            content,
            originalContent: content,
            isDirty: false,
          };

          set((state) => ({
            tabs: [...state.tabs, newTab],
            activeTabId: newTab.id,
          }));
        },

        closeTab: (tabId) => {
          set((state) => {
            const tabIndex = state.tabs.findIndex((t) => t.id === tabId);
            if (tabIndex === -1) return state;

            const newTabs = state.tabs.filter((t) => t.id !== tabId);
            
            // Determine new active tab
            let newActiveTabId = state.activeTabId;
            if (state.activeTabId === tabId) {
              if (newTabs.length === 0) {
                newActiveTabId = null;
              } else if (tabIndex >= newTabs.length) {
                // Was last tab, activate the new last tab
                newActiveTabId = newTabs[newTabs.length - 1].id;
              } else {
                // Activate the tab that took this position
                newActiveTabId = newTabs[tabIndex].id;
              }
            }

            return {
              tabs: newTabs,
              activeTabId: newActiveTabId,
            };
          });
        },

        closeAllTabs: () => {
          set({ tabs: [], activeTabId: null });
        },

        setActiveTab: (tabId) => {
          const tab = get().tabs.find((t) => t.id === tabId);
          if (tab) {
            set({ activeTabId: tabId });
          }
        },

        updateContent: (tabId, content) => {
          set((state) => {
            const newTabs = state.tabs.map((tab) => {
              if (tab.id !== tabId) return tab;
              return {
                ...tab,
                content,
                isDirty: content !== tab.originalContent,
              };
            });
            return { tabs: newTabs };
          });
        },

        markSaved: (tabId, newContent) => {
          set((state) => {
            const newTabs = state.tabs.map((tab) => {
              if (tab.id !== tabId) return tab;
              const content = newContent ?? tab.content;
              return {
                ...tab,
                content,
                originalContent: content,
                isDirty: false,
              };
            });
            return { tabs: newTabs };
          });
        },

        getTab: (tabId) => {
          return get().tabs.find((t) => t.id === tabId);
        },

        getTabByPath: (filePath) => {
          return get().tabs.find((t) => t.filePath === filePath);
        },

        hasUnsavedChanges: () => {
          return get().tabs.some((t) => t.isDirty);
        },

        reorderTabs: (fromIndex, toIndex) => {
          set((state) => {
            if (fromIndex === toIndex) return state;
            if (fromIndex < 0 || fromIndex >= state.tabs.length) return state;
            if (toIndex < 0 || toIndex >= state.tabs.length) return state;

            const newTabs = [...state.tabs];
            const [movedTab] = newTabs.splice(fromIndex, 1);
            newTabs.splice(toIndex, 0, movedTab);
            return { tabs: newTabs };
          });
        },
      }),
      {
        name: 'editor-store',
        storage: createJSONStorage(() => getSafeStorage()),
        partialize: (state) => ({
          // Only persist tab metadata, not content (files should be re-read on load)
          tabs: state.tabs.map((t) => ({
            id: t.id,
            filePath: t.filePath,
            fileName: t.fileName,
            language: t.language,
            // Don't persist content - will reload from disk
            content: '',
            originalContent: '',
            isDirty: false,
          })),
          activeTabId: state.activeTabId,
        }),
      }
    ),
    { name: 'editor-store' }
  )
);
