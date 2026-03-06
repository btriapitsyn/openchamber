import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import {
  createCard as apiCreateCard,
  createColumn as apiCreateColumn,
  deleteCard as apiDeleteCard,
  deleteColumn as apiDeleteColumn,
  getBoard,
  moveCard as apiMoveCard,
  renameColumn as apiRenameColumn,
  updateCard as apiUpdateCard,
} from '@/lib/kanbanApi';
import type { BoardCard, ProjectBoard } from '@/types/kanban';

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
};

const withProjectId = (board: ProjectBoard, projectId: string): ProjectBoard => {
  if (board.projectId === projectId) {
    return board;
  }
  return {
    ...board,
    projectId,
  };
};

interface KanbanStore {
  boards: Map<string, ProjectBoard>;
  isLoadingByProject: Map<string, boolean>;
  isMutatingByProject: Map<string, boolean>;
  errorByProject: Map<string, string | null>;
  hydratedProjects: Set<string>;

  hydrateProjectBoard: (projectId: string, directory: string) => Promise<void>;
  resetProjectBoard: (projectId: string) => void;
  getProjectBoard: (projectId: string) => ProjectBoard | null;

  createColumn: (projectId: string, directory: string, name: string, afterColumnId?: string) => Promise<void>;
  renameColumn: (projectId: string, directory: string, columnId: string, name: string) => Promise<void>;
  deleteColumn: (projectId: string, directory: string, columnId: string) => Promise<void>;
  createCard: (
    projectId: string,
    directory: string,
    columnId: string,
    title: string,
    description: string,
    worktreeId: string,
  ) => Promise<void>;
  updateCard: (projectId: string, directory: string, cardId: string, updates: Partial<BoardCard>) => Promise<void>;
  deleteCard: (projectId: string, directory: string, cardId: string) => Promise<void>;
  moveCard: (projectId: string, directory: string, cardId: string, toColumnId: string, toOrder?: number) => Promise<void>;
}

export const useKanbanStore = create<KanbanStore>()(
  devtools(
    (set, get) => {
      const setProjectLoading = (projectId: string, isLoading: boolean) => {
        set((state) => {
          const next = new Map(state.isLoadingByProject);
          next.set(projectId, isLoading);
          return { isLoadingByProject: next };
        });
      };

      const setProjectMutating = (projectId: string, isMutating: boolean) => {
        set((state) => {
          const next = new Map(state.isMutatingByProject);
          next.set(projectId, isMutating);
          return { isMutatingByProject: next };
        });
      };

      const setProjectError = (projectId: string, error: string | null) => {
        set((state) => {
          const next = new Map(state.errorByProject);
          next.set(projectId, error);
          return { errorByProject: next };
        });
      };

      const applyBoard = (projectId: string, board: ProjectBoard) => {
        set((state) => {
          const nextBoards = new Map(state.boards);
          nextBoards.set(projectId, withProjectId(board, projectId));
          return { boards: nextBoards };
        });
      };

      const runProjectMutation = async (
        projectId: string,
        directory: string,
        request: () => Promise<{ board: ProjectBoard }>,
        fallbackError: string,
      ) => {
        if (!projectId || !directory.trim()) {
          return;
        }

        setProjectMutating(projectId, true);
        setProjectError(projectId, null);

        try {
          const response = await request();
          applyBoard(projectId, response.board);
          setProjectMutating(projectId, false);
        } catch (error) {
          setProjectMutating(projectId, false);
          setProjectError(projectId, getErrorMessage(error, fallbackError));
          throw error;
        }
      };

      return {
        boards: new Map(),
        isLoadingByProject: new Map(),
        isMutatingByProject: new Map(),
        errorByProject: new Map(),
        hydratedProjects: new Set(),

        hydrateProjectBoard: async (projectId: string, directory: string) => {
          if (!projectId || !directory.trim()) {
            return;
          }

          const { hydratedProjects, isLoadingByProject } = get();
          if (hydratedProjects.has(projectId) || isLoadingByProject.get(projectId)) {
            return;
          }

          setProjectLoading(projectId, true);
          setProjectError(projectId, null);

          try {
            const response = await getBoard(directory);

            set((state) => {
              const nextBoards = new Map(state.boards);
              nextBoards.set(projectId, withProjectId(response.board, projectId));

              const nextLoading = new Map(state.isLoadingByProject);
              nextLoading.set(projectId, false);

              const nextHydrated = new Set(state.hydratedProjects);
              nextHydrated.add(projectId);

              const nextErrors = new Map(state.errorByProject);
              nextErrors.set(projectId, null);

              return {
                boards: nextBoards,
                isLoadingByProject: nextLoading,
                hydratedProjects: nextHydrated,
                errorByProject: nextErrors,
              };
            });
          } catch (error) {
            setProjectLoading(projectId, false);
            setProjectError(projectId, getErrorMessage(error, 'Failed to load board'));
            throw error;
          }
        },

        resetProjectBoard: (projectId: string) => {
          set((state) => {
            const nextBoards = new Map(state.boards);
            nextBoards.delete(projectId);

            const nextLoading = new Map(state.isLoadingByProject);
            nextLoading.delete(projectId);

            const nextMutating = new Map(state.isMutatingByProject);
            nextMutating.delete(projectId);

            const nextErrors = new Map(state.errorByProject);
            nextErrors.delete(projectId);

            const nextHydrated = new Set(state.hydratedProjects);
            nextHydrated.delete(projectId);

            return {
              boards: nextBoards,
              isLoadingByProject: nextLoading,
              isMutatingByProject: nextMutating,
              errorByProject: nextErrors,
              hydratedProjects: nextHydrated,
            };
          });
        },

        getProjectBoard: (projectId: string) => {
          if (!projectId) {
            return null;
          }
          return get().boards.get(projectId) ?? null;
        },

        createColumn: async (projectId: string, directory: string, name: string, afterColumnId?: string) => {
          await runProjectMutation(
            projectId,
            directory,
            () => apiCreateColumn(directory, name, afterColumnId),
            'Failed to create column',
          );
        },

        renameColumn: async (projectId: string, directory: string, columnId: string, name: string) => {
          await runProjectMutation(
            projectId,
            directory,
            () => apiRenameColumn(directory, columnId, name),
            'Failed to rename column',
          );
        },

        deleteColumn: async (projectId: string, directory: string, columnId: string) => {
          await runProjectMutation(
            projectId,
            directory,
            () => apiDeleteColumn(directory, columnId),
            'Failed to delete column',
          );
        },

        createCard: async (
          projectId: string,
          directory: string,
          columnId: string,
          title: string,
          description: string,
          worktreeId: string,
        ) => {
          await runProjectMutation(
            projectId,
            directory,
            () => apiCreateCard(directory, columnId, title, description, worktreeId),
            'Failed to create card',
          );
        },

        updateCard: async (projectId: string, directory: string, cardId: string, updates: Partial<BoardCard>) => {
          await runProjectMutation(
            projectId,
            directory,
            () => apiUpdateCard(directory, cardId, updates),
            'Failed to update card',
          );
        },

        deleteCard: async (projectId: string, directory: string, cardId: string) => {
          await runProjectMutation(
            projectId,
            directory,
            () => apiDeleteCard(directory, cardId),
            'Failed to delete card',
          );
        },

        moveCard: async (projectId: string, directory: string, cardId: string, toColumnId: string, toOrder?: number) => {
          await runProjectMutation(
            projectId,
            directory,
            () => apiMoveCard(directory, cardId, toColumnId, toOrder),
            'Failed to move card',
          );
        },
      };
    },
    { name: 'kanban-store' },
  ),
);

export const getActiveProjectBoard = (projectId: string | null): ProjectBoard | null => {
  if (!projectId) {
    return null;
  }
  return useKanbanStore.getState().getProjectBoard(projectId);
};
