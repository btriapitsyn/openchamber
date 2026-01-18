import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface NotesStore {
  notesByWorktree: Map<string, string>;
  getNote: (worktreeId: string) => string;
  setNote: (worktreeId: string, content: string) => void;
  clearNote: (worktreeId: string) => void;
}

export const useNotesStore = create<NotesStore>()(
  devtools(
    persist(
      (set, get) => ({
        notesByWorktree: new Map(),

        getNote: (worktreeId: string) => {
          return get().notesByWorktree.get(worktreeId) ?? '';
        },

        setNote: (worktreeId: string, content: string) => {
          set((state) => {
            const newMap = new Map(state.notesByWorktree);
            newMap.set(worktreeId, content);
            return { notesByWorktree: newMap };
          });
        },

        clearNote: (worktreeId: string) => {
          set((state) => {
            const newMap = new Map(state.notesByWorktree);
            newMap.delete(worktreeId);
            return { notesByWorktree: newMap };
          });
        },
      }),
      {
        name: 'openchamber-notes-store',
        partialize: (state) => ({
          notesByWorktree: Object.fromEntries(state.notesByWorktree),
        }),
        merge: (persisted, current) => {
          const persistedState = persisted as {
            notesByWorktree?: Record<string, string>;
          };
          return {
            ...current,
            notesByWorktree: new Map(Object.entries(persistedState.notesByWorktree ?? {})),
          };
        },
      }
    ),
    { name: 'notes-store' }
  )
);
