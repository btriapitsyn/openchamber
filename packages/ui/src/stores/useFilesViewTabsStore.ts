import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

import { getSafeStorage } from './utils/safeStorage';

type RootTabsState = {
  openPaths: string[];
  selectedPath: string | null;
  touchedAt: number;
};

type FilesViewTabsState = {
  byRoot: Record<string, RootTabsState>;
};

type FilesViewTabsActions = {
  addOpenPath: (root: string, path: string) => void;
  removeOpenPath: (root: string, path: string) => void;
  removeOpenPathsByPrefix: (root: string, prefixPath: string) => void;
  setSelectedPath: (root: string, path: string | null) => void;
  ensureSelectedPath: (root: string) => void;
};

export type FilesViewTabsStore = FilesViewTabsState & FilesViewTabsActions;

const normalizePath = (value: string): string => value.replace(/\\/g, '/');

const clampRoots = (byRoot: Record<string, RootTabsState>, maxRoots: number): Record<string, RootTabsState> => {
  const entries = Object.entries(byRoot);
  if (entries.length <= maxRoots) {
    return byRoot;
  }

  entries.sort((a, b) => (b[1]?.touchedAt ?? 0) - (a[1]?.touchedAt ?? 0));
  const next: Record<string, RootTabsState> = {};
  for (const [root, state] of entries.slice(0, maxRoots)) {
    next[root] = state;
  }
  return next;
};

const touchRoot = (prev: RootTabsState | undefined): RootTabsState => {
  if (prev) {
    return { ...prev, touchedAt: Date.now() };
  }
  return { openPaths: [], selectedPath: null, touchedAt: Date.now() };
};

export const useFilesViewTabsStore = create<FilesViewTabsStore>()(
  devtools(
    persist(
      (set, get) => ({
        byRoot: {},

        addOpenPath: (root, path) => {
          const normalizedRoot = normalizePath((root || '').trim());
          const normalizedPath = normalizePath((path || '').trim());
          if (!normalizedRoot || !normalizedPath) {
            return;
          }

          set((state) => {
            const prev = state.byRoot[normalizedRoot];
            const current = touchRoot(prev);
            const exists = current.openPaths.includes(normalizedPath);
            const nextOpenPaths = exists ? current.openPaths : [...current.openPaths, normalizedPath];
            const nextSelectedPath = current.selectedPath ?? normalizedPath;

            if (prev && exists && prev.selectedPath === nextSelectedPath) {
              return state;
            }
            const byRoot = {
              ...state.byRoot,
              [normalizedRoot]: {
                ...current,
                openPaths: nextOpenPaths,
                selectedPath: nextSelectedPath,
              },
            };
            return { byRoot: clampRoots(byRoot, 20) };
          });
        },

        removeOpenPath: (root, path) => {
          const normalizedRoot = normalizePath((root || '').trim());
          const normalizedPath = normalizePath((path || '').trim());
          if (!normalizedRoot || !normalizedPath) {
            return;
          }

          set((state) => {
            const current = state.byRoot[normalizedRoot];
            if (!current) {
              return state;
            }

            if (!current.openPaths.includes(normalizedPath) && current.selectedPath !== normalizedPath) {
              return state;
            }

            const openPaths = current.openPaths.filter((p) => p !== normalizedPath);
            const selectedPath = current.selectedPath === normalizedPath ? (openPaths[0] ?? null) : current.selectedPath;

            const byRoot = {
              ...state.byRoot,
              [normalizedRoot]: {
                ...current,
                openPaths,
                selectedPath,
                touchedAt: Date.now(),
              },
            };
            return { byRoot: clampRoots(byRoot, 20) };
          });
        },

        removeOpenPathsByPrefix: (root, prefixPath) => {
          const normalizedRoot = normalizePath((root || '').trim());
          const normalizedPrefix = normalizePath((prefixPath || '').trim());
          if (!normalizedRoot || !normalizedPrefix) {
            return;
          }

          set((state) => {
            const current = state.byRoot[normalizedRoot];
            if (!current) {
              return state;
            }

            const prefixWithSlash = normalizedPrefix.endsWith('/') ? normalizedPrefix : `${normalizedPrefix}/`;
            const openPaths = current.openPaths.filter((p) => p !== normalizedPrefix && !p.startsWith(prefixWithSlash));
            if (openPaths.length === current.openPaths.length) {
              return state;
            }

            const selectedPath = current.selectedPath && (current.selectedPath === normalizedPrefix || current.selectedPath.startsWith(prefixWithSlash))
              ? (openPaths[0] ?? null)
              : current.selectedPath;

            const byRoot = {
              ...state.byRoot,
              [normalizedRoot]: {
                ...current,
                openPaths,
                selectedPath,
                touchedAt: Date.now(),
              },
            };

            return { byRoot: clampRoots(byRoot, 20) };
          });
        },

        setSelectedPath: (root, path) => {
          const normalizedRoot = normalizePath((root || '').trim());
          const normalizedPath = path ? normalizePath(path.trim()) : null;
          if (!normalizedRoot) {
            return;
          }

          set((state) => {
            const prev = state.byRoot[normalizedRoot];
            const current = touchRoot(prev);
            const openPaths = normalizedPath && !current.openPaths.includes(normalizedPath)
              ? [...current.openPaths, normalizedPath]
              : current.openPaths;

            if (prev && prev.selectedPath === normalizedPath && openPaths === prev.openPaths) {
              return state;
            }

            const byRoot = {
              ...state.byRoot,
              [normalizedRoot]: {
                ...current,
                openPaths,
                selectedPath: normalizedPath,
              },
            };
            return { byRoot: clampRoots(byRoot, 20) };
          });
        },

        ensureSelectedPath: (root) => {
          const normalizedRoot = normalizePath((root || '').trim());
          if (!normalizedRoot) {
            return;
          }

          const current = get().byRoot[normalizedRoot];
          if (!current || current.selectedPath) {
            return;
          }

          const first = current.openPaths[0] ?? null;
          if (!first) {
            return;
          }

          get().setSelectedPath(normalizedRoot, first);
        },
      }),
      {
        name: 'files-view-tabs-store',
        storage: createJSONStorage(() => getSafeStorage()),
        partialize: (state) => ({ byRoot: state.byRoot }),
      }
    ),
    { name: 'files-view-tabs-store' }
  )
);
