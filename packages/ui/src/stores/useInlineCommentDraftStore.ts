import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';

export type InlineCommentSource = 'diff' | 'plan' | 'file';

export interface InlineCommentDraft {
  id: string;
  sessionKey: string; // sessionId or 'draft' for new sessions
  source: InlineCommentSource;
  fileLabel: string; // filename or 'plan'
  startLine: number;
  endLine: number;
  side?: 'original' | 'modified'; // diff only
  code: string;
  language: string;
  text: string;
  createdAt: number;
}

interface InlineCommentDraftState {
  drafts: Record<string, InlineCommentDraft[]>; // sessionKey -> drafts
}

interface InlineCommentDraftActions {
  addDraft: (draft: Omit<InlineCommentDraft, 'id' | 'createdAt'>) => void;
  removeDraft: (sessionKey: string, draftId: string) => void;
  clearDrafts: (sessionKey: string) => void;
  getDrafts: (sessionKey: string) => InlineCommentDraft[];
  consumeDrafts: (sessionKey: string) => InlineCommentDraft[];
  getDraftCount: (sessionKey: string) => number;
  hasDrafts: (sessionKey: string) => boolean;
}

type InlineCommentDraftStore = InlineCommentDraftState & InlineCommentDraftActions;

export const useInlineCommentDraftStore = create<InlineCommentDraftStore>()(
  devtools(
    persist(
      (set, get) => ({
        drafts: {},

        addDraft: (draft) => {
          const id = `icd-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          const newDraft: InlineCommentDraft = {
            ...draft,
            id,
            createdAt: Date.now(),
          };

          set((state) => {
            const currentDrafts = state.drafts[draft.sessionKey] ?? [];
            return {
              drafts: {
                ...state.drafts,
                [draft.sessionKey]: [...currentDrafts, newDraft],
              },
            };
          });

          return id;
        },

        removeDraft: (sessionKey, draftId) => {
          set((state) => {
            const currentDrafts = state.drafts[sessionKey] ?? [];
            const newDrafts = currentDrafts.filter((d) => d.id !== draftId);

            if (newDrafts.length === 0) {
              const { [sessionKey]: _removed, ...rest } = state.drafts;
              void _removed;
              return { drafts: rest };
            }

            return {
              drafts: {
                ...state.drafts,
                [sessionKey]: newDrafts,
              },
            };
          });
        },

        clearDrafts: (sessionKey) => {
          set((state) => {
            const { [sessionKey]: _removed, ...rest } = state.drafts;
            void _removed;
            return { drafts: rest };
          });
        },

        getDrafts: (sessionKey) => {
          return get().drafts[sessionKey] ?? [];
        },

        consumeDrafts: (sessionKey) => {
          const drafts = get().drafts[sessionKey] ?? [];
          if (drafts.length === 0) return [];

          // Sort by creation time to maintain order
          const sortedDrafts = [...drafts].sort((a, b) => a.createdAt - b.createdAt);

          // Clear drafts after consuming
          set((state) => {
            const { [sessionKey]: _removed, ...rest } = state.drafts;
            void _removed;
            return { drafts: rest };
          });

          return sortedDrafts;
        },

        getDraftCount: (sessionKey) => {
          return (get().drafts[sessionKey] ?? []).length;
        },

        hasDrafts: (sessionKey) => {
          return (get().drafts[sessionKey] ?? []).length > 0;
        },
      }),
      {
        name: 'openchamber-inline-comment-drafts',
        storage: createJSONStorage(() => getSafeStorage()),
      }
    ),
    { name: 'inline-comment-draft-store' }
  )
);

export default useInlineCommentDraftStore;
