import React from 'react';
import type { EditorView } from '@codemirror/view';
import type { InlineCommentDraft } from '@/stores/useInlineCommentDraftStore';
import { InlineCommentCard } from './InlineCommentCard';
import { InlineCommentInput } from './InlineCommentInput';

type SelectedLineRange = { start: number; end: number };

type CommentPos = {
  top: number;
  flipUp: boolean;
};

const COMMENT_POPOVER_HEIGHT = 200;

function getLineTop(view: EditorView, wrapper: HTMLElement, lineNumber: number, position: 'top' | 'bottom'): number | undefined {
  const lineCount = view.state.doc.lines;
  if (lineNumber < 1 || lineNumber > lineCount) return undefined;

  const line = view.state.doc.line(lineNumber);
  const coords = view.coordsAtPos(line.from);
  if (!coords) return undefined;

  const wrapperRect = wrapper.getBoundingClientRect();
  if (position === 'bottom') {
    return coords.bottom - wrapperRect.top;
  }
  return coords.top - wrapperRect.top;
}

function shouldFlipUp(view: EditorView, endLine: number, scrollContainer: HTMLElement | null): boolean {
  const lineCount = view.state.doc.lines;
  if (endLine < 1 || endLine > lineCount) return false;

  const line = view.state.doc.line(endLine);
  const coords = view.coordsAtPos(line.from);
  if (!coords) return false;

  const viewportBottom = scrollContainer
    ? scrollContainer.getBoundingClientRect().bottom
    : window.innerHeight;

  return (coords.bottom + COMMENT_POPOVER_HEIGHT + 30) > viewportBottom;
}

function computePosition(
  view: EditorView,
  wrapper: HTMLElement,
  scrollContainer: HTMLElement | null,
  range: { start: number; end: number },
): CommentPos | undefined {
  const flipUp = shouldFlipUp(view, range.end, scrollContainer);

  const top = flipUp
    ? getLineTop(view, wrapper, range.start, 'top')
    : getLineTop(view, wrapper, range.end, 'bottom');

  if (top === undefined) return undefined;
  return { top, flipUp };
}

type FloatingCommentsProps = {
  editorView: EditorView | null;
  wrapperRef: React.RefObject<HTMLElement | null>;
  fileDrafts: InlineCommentDraft[];
  editingDraftId: string | null;
  commentText: string;
  lineSelection: SelectedLineRange | null;
  isDragging: boolean;
  fileLabel: string;
  onSaveComment: (text: string, range?: SelectedLineRange) => void;
  onCancelComment: () => void;
  onEditDraft: (draft: InlineCommentDraft) => void;
  onDeleteDraft: (draft: InlineCommentDraft) => void;
};

export function useFloatingComments({
  editorView,
  wrapperRef,
  fileDrafts,
  editingDraftId,
  commentText,
  lineSelection,
  isDragging,
  fileLabel,
  onSaveComment,
  onCancelComment,
  onEditDraft,
  onDeleteDraft,
}: FloatingCommentsProps): React.ReactNode {
  const [positions, setPositions] = React.useState<Record<string, CommentPos | undefined>>({});

  const updatePositions = React.useCallback(() => {
    const view = editorView;
    const wrapper = wrapperRef.current;
    if (!view || !wrapper) return;

    const scrollContainer = wrapper.closest('.overlay-scrollbar-container') as HTMLElement | null;
    const next: Record<string, CommentPos | undefined> = {};

    for (const d of fileDrafts) {
      next[d.id] = computePosition(view, wrapper, scrollContainer, {
        start: d.startLine,
        end: d.endLine,
      });
    }

    if (lineSelection && !editingDraftId && !isDragging) {
      next['__new__'] = computePosition(view, wrapper, scrollContainer, {
        start: lineSelection.start,
        end: lineSelection.end,
      });
    }

    setPositions(next);
  }, [editorView, wrapperRef, fileDrafts, editingDraftId, lineSelection, isDragging]);

  React.useEffect(() => {
    requestAnimationFrame(updatePositions);
  }, [updatePositions]);

  // Also update on scroll
  React.useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const scrollContainer = wrapper.closest('.overlay-scrollbar-container') as HTMLElement | null;
    if (!scrollContainer) return;

    const onScroll = () => requestAnimationFrame(updatePositions);
    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', onScroll);
  }, [wrapperRef, updatePositions]);

  const popoverStyle = (flipUp: boolean): React.CSSProperties => flipUp
    ? { position: 'absolute', bottom: 'calc(100% + 4px)', right: -8, zIndex: 40, width: 380, maxWidth: 'min(380px, calc(100vw - 48px))', borderRadius: 14 }
    : { position: 'absolute', top: 'calc(100% + 4px)', right: -8, zIndex: 40, width: 380, maxWidth: 'min(380px, calc(100vw - 48px))', borderRadius: 14 };

  return (
    <>
      {fileDrafts.map((d) => {
        const pos = positions[d.id];
        if (!pos) return null;

        if (d.id === editingDraftId) {
          return (
            <div
              key={`edit-${d.id}`}
              style={{ position: 'absolute', right: 24, top: pos.top, zIndex: 100, pointerEvents: 'auto' }}
            >
              <div style={popoverStyle(pos.flipUp)}>
                <InlineCommentInput
                  initialText={commentText}
                  fileLabel={fileLabel}
                  lineRange={{ start: d.startLine, end: d.endLine }}
                  isEditing={true}
                  onSave={onSaveComment}
                  onCancel={onCancelComment}
                />
              </div>
            </div>
          );
        }

        return (
          <div
            key={`saved-${d.id}`}
            style={{ position: 'absolute', right: 24, top: pos.top, zIndex: 30, pointerEvents: 'auto' }}
          >
            <InlineCommentCard
              draft={d}
              onEdit={() => onEditDraft(d)}
              onDelete={() => onDeleteDraft(d)}
            />
          </div>
        );
      })}

      {lineSelection && !editingDraftId && !isDragging && positions['__new__'] && (
        <div
          key="new-comment"
          style={{ position: 'absolute', right: 24, top: positions['__new__'].top, zIndex: 100, pointerEvents: 'auto' }}
        >
          <div style={popoverStyle(positions['__new__'].flipUp)}>
            <InlineCommentInput
              initialText={commentText}
              fileLabel={fileLabel}
              lineRange={lineSelection}
              isEditing={false}
              onSave={onSaveComment}
              onCancel={onCancelComment}
            />
          </div>
        </div>
      )}
    </>
  );
}
