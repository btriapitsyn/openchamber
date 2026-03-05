import React from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { RiAddLine } from '@remixicon/react';

import { KanbanCard } from '@/components/kanban/KanbanCard';
import { KanbanCardDialog } from '@/components/kanban/KanbanCardDialog';
import { KanbanColumn } from '@/components/kanban/KanbanColumn';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useKanbanStore } from '@/stores/useKanbanStore';
import { useUIStore } from '@/stores/useUIStore';
import type { BoardCard, BoardColumn } from '@/types/kanban';

type CardDialogState = {
  open: boolean;
  mode: 'create' | 'edit';
  columnId: string;
  card: BoardCard | null;
};

type RenameColumnDialogState = {
  open: boolean;
  columnId: string;
  name: string;
};

type CreateColumnDialogState = {
  open: boolean;
  name: string;
};

const CLOSED_CARD_DIALOG: CardDialogState = {
  open: false,
  mode: 'create',
  columnId: '',
  card: null,
};

const CLOSED_RENAME_DIALOG: RenameColumnDialogState = {
  open: false,
  columnId: '',
  name: '',
};

const CLOSED_CREATE_COLUMN_DIALOG: CreateColumnDialogState = {
  open: false,
  name: '',
};

export const KanbanView: React.FC = () => {
  const activeProject = useProjectsStore((state) => state.getActiveProject());
  const effectiveDirectory = useEffectiveDirectory();
  const isMobile = useUIStore((state) => state.isMobile);

  const projectId = activeProject?.id ?? null;

  const board = useKanbanStore(
    React.useCallback(
      (state) => (projectId ? (state.boards.get(projectId) ?? null) : null),
      [projectId],
    ),
  );

  const ensureProjectBoard = useKanbanStore((state) => state.ensureProjectBoard);
  const createColumn = useKanbanStore((state) => state.createColumn);
  const renameColumn = useKanbanStore((state) => state.renameColumn);
  const deleteColumn = useKanbanStore((state) => state.deleteColumn);
  const createCard = useKanbanStore((state) => state.createCard);
  const updateCard = useKanbanStore((state) => state.updateCard);
  const deleteCard = useKanbanStore((state) => state.deleteCard);
  const moveCard = useKanbanStore((state) => state.moveCard);
  const reorderCardsInColumn = useKanbanStore((state) => state.reorderCardsInColumn);

  const [draggedCardId, setDraggedCardId] = React.useState<string | null>(null);
  const [cardDialog, setCardDialog] = React.useState<CardDialogState>(CLOSED_CARD_DIALOG);
  const [renameDialog, setRenameDialog] = React.useState<RenameColumnDialogState>(CLOSED_RENAME_DIALOG);
  const [createColumnDialog, setCreateColumnDialog] = React.useState<CreateColumnDialogState>(CLOSED_CREATE_COLUMN_DIALOG);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  React.useEffect(() => {
    if (!projectId || board) {
      return;
    }
    ensureProjectBoard(projectId);
  }, [board, ensureProjectBoard, projectId]);

  const columns = React.useMemo(() => {
    if (!board) {
      return [];
    }
    return [...board.columns].sort((a, b) => a.order - b.order);
  }, [board]);

  const cardsByColumn = React.useMemo(() => {
    const map = new Map<string, BoardCard[]>();
    if (!board) {
      return map;
    }

    for (const column of columns) {
      const cards = board.cards
        .filter((card) => card.columnId === column.id)
        .sort((a, b) => a.order - b.order);
      map.set(column.id, cards);
    }

    return map;
  }, [board, columns]);

  const draggedCard = React.useMemo(() => {
    if (!draggedCardId || !board) {
      return null;
    }
    return board.cards.find((card) => card.id === draggedCardId) ?? null;
  }, [board, draggedCardId]);

  const closeCardDialog = React.useCallback(() => {
    setCardDialog(CLOSED_CARD_DIALOG);
  }, []);

  const closeRenameDialog = React.useCallback(() => {
    setRenameDialog(CLOSED_RENAME_DIALOG);
  }, []);

  const closeCreateColumnDialog = React.useCallback(() => {
    setCreateColumnDialog(CLOSED_CREATE_COLUMN_DIALOG);
  }, []);

  const handleDragStart = React.useCallback((event: DragStartEvent) => {
    setDraggedCardId(String(event.active.id));
  }, []);

  const handleDragEnd = React.useCallback((event: DragEndEvent) => {
    setDraggedCardId(null);

    if (!projectId || !board || !event.over) {
      return;
    }

    const activeID = String(event.active.id);
    const overID = String(event.over.id);
    if (activeID === overID) {
      return;
    }

    const activeCard = board.cards.find((card) => card.id === activeID);
    if (!activeCard) {
      return;
    }

    const overColumn = board.columns.find((column) => column.id === overID);
    if (overColumn) {
      const targetCards = (cardsByColumn.get(overColumn.id) ?? []).filter((card) => card.id !== activeID);
      moveCard(projectId, activeID, overColumn.id, targetCards.length);
      return;
    }

    const overCard = board.cards.find((card) => card.id === overID);
    if (!overCard) {
      return;
    }

    const targetCards = cardsByColumn.get(overCard.columnId) ?? [];
    const toIndex = targetCards.findIndex((card) => card.id === overCard.id);
    if (toIndex < 0) {
      return;
    }

    if (activeCard.columnId !== overCard.columnId) {
      moveCard(projectId, activeID, overCard.columnId, toIndex);
      return;
    }

    const fromIndex = targetCards.findIndex((card) => card.id === activeID);
    if (fromIndex < 0 || fromIndex === toIndex) {
      return;
    }

    reorderCardsInColumn(projectId, overCard.columnId, fromIndex, toIndex);
  }, [board, cardsByColumn, moveCard, projectId, reorderCardsInColumn]);

  const handleAddColumn = React.useCallback(() => {
    setCreateColumnDialog({
      open: true,
      name: '',
    });
  }, []);

  const handleSaveCreateColumn = React.useCallback(() => {
    if (!projectId || !createColumnDialog.open) {
      return;
    }

    const name = createColumnDialog.name.trim();
    if (!name) {
      return;
    }

    createColumn(projectId, name);
    closeCreateColumnDialog();
  }, [closeCreateColumnDialog, createColumn, createColumnDialog, projectId]);

  const handleRenameColumn = React.useCallback((columnID: string, currentName: string) => {
    setRenameDialog({
      open: true,
      columnId: columnID,
      name: currentName,
    });
  }, []);

  const handleSaveRename = React.useCallback(() => {
    if (!projectId || !renameDialog.open) {
      return;
    }

    const nextName = renameDialog.name.trim();
    if (!nextName) {
      return;
    }

    renameColumn(projectId, renameDialog.columnId, nextName);
    closeRenameDialog();
  }, [closeRenameDialog, projectId, renameColumn, renameDialog]);

  const handleDeleteColumn = React.useCallback(() => {
    if (!projectId || !renameDialog.open) {
      return;
    }

    deleteColumn(projectId, renameDialog.columnId);
    closeRenameDialog();
  }, [closeRenameDialog, deleteColumn, projectId, renameDialog.columnId, renameDialog.open]);

  const handleCreateCard = React.useCallback((columnID: string) => {
    setCardDialog({
      open: true,
      mode: 'create',
      columnId: columnID,
      card: null,
    });
  }, []);

  const handleEditCard = React.useCallback((card: BoardCard) => {
    setCardDialog({
      open: true,
      mode: 'edit',
      columnId: card.columnId,
      card,
    });
  }, []);

  const handleSaveCard = React.useCallback((data: { title: string; description: string; worktreeId: string }) => {
    if (!projectId) {
      return;
    }

    if (cardDialog.mode === 'create') {
      createCard(projectId, cardDialog.columnId, data.title, data.description, data.worktreeId);
      closeCardDialog();
      return;
    }

    if (cardDialog.card) {
      updateCard(projectId, cardDialog.card.id, {
        title: data.title,
        description: data.description,
        worktreeId: data.worktreeId,
      });
    }

    closeCardDialog();
  }, [cardDialog, closeCardDialog, createCard, projectId, updateCard]);

  const handleDeleteCard = React.useCallback(() => {
    if (!projectId || !cardDialog.card) {
      return;
    }

    deleteCard(projectId, cardDialog.card.id);
    closeCardDialog();
  }, [cardDialog.card, closeCardDialog, deleteCard, projectId]);

  if (isMobile) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <p className="typography-ui-label text-foreground">Board view is not available on mobile.</p>
          <p className="typography-micro text-muted-foreground">Use desktop to access the Kanban board.</p>
        </div>
      </div>
    );
  }

  if (!activeProject || !effectiveDirectory) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <p className="typography-ui-label text-foreground">No active project selected.</p>
          <p className="typography-micro text-muted-foreground">Select a project to open the board.</p>
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="typography-ui-label text-foreground">Loading board...</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <ScrollableOverlay className="h-full">
        <div className="flex h-full flex-col p-6">
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex h-full min-w-max gap-4">
              {columns.map((column: BoardColumn) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={cardsByColumn.get(column.id) ?? []}
                  onRenameClick={handleRenameColumn}
                  onAddCardClick={handleCreateCard}
                  onCardClick={handleEditCard}
                />
              ))}
              <button
                type="button"
                onClick={handleAddColumn}
                className="flex flex-col items-center justify-center gap-2 min-w-[280px] max-w-[340px] flex-shrink-0 min-h-[120px] rounded-lg border-2 border-dashed border-border/40 text-muted-foreground hover:border-[var(--interactive-hover)] hover:text-foreground transition-colors"
              >
                <RiAddLine className="h-5 w-5" />
                <span className="typography-ui-label">Add Column</span>
              </button>
            </div>
          </div>
        </div>
      </ScrollableOverlay>

      <DragOverlay dropAnimation={null}>
        {draggedCard ? (
          <div className="scale-105 rotate-3 opacity-90">
            <KanbanCard card={draggedCard} />
          </div>
        ) : null}
      </DragOverlay>

      <KanbanCardDialog
        open={cardDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            closeCardDialog();
          }
        }}
        onSave={handleSaveCard}
        mode={cardDialog.mode}
        initialData={cardDialog.card ? {
          title: cardDialog.card.title,
          description: cardDialog.card.description,
          worktreeId: cardDialog.card.worktreeId,
        } : undefined}
        onDelete={cardDialog.mode === 'edit' ? handleDeleteCard : undefined}
      />

      <Dialog
        open={renameDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            closeRenameDialog();
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Column</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleSaveRename();
            }}
            className="space-y-4"
          >
            <Input
              autoFocus
              value={renameDialog.name}
              onChange={(event) => {
                setRenameDialog((prev) => ({
                  ...prev,
                  name: event.target.value,
                }));
              }}
              placeholder="Column name"
            />
            <DialogFooter>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteColumn}
              >
                Delete Column
              </Button>
              <Button type="button" variant="outline" onClick={closeRenameDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={!renameDialog.name.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createColumnDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            closeCreateColumnDialog();
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Column</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleSaveCreateColumn();
            }}
            className="space-y-4"
          >
            <Input
              autoFocus
              value={createColumnDialog.name}
              onChange={(event) => {
                setCreateColumnDialog((prev) => ({
                  ...prev,
                  name: event.target.value,
                }));
              }}
              placeholder="Column name"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeCreateColumnDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={!createColumnDialog.name.trim()}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DndContext>
  );
};
