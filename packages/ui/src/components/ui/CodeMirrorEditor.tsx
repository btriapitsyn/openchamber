import React from 'react';

import type { Extension } from '@codemirror/state';
import { Compartment, EditorState, RangeSetBuilder, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, type KeyBinding, ViewPlugin, WidgetType, gutters, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import {
  search,
  searchKeymap,
  openSearchPanel,
  closeSearchPanel,
  SearchQuery,
  getSearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
} from '@codemirror/search';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export type BlockWidgetDef = {
  afterLine: number;
  id: string;
  content: React.ReactNode;
};

type CodeMirrorEditorProps = {
  value: string;
  onChange: (value: string) => void;
  extensions?: Extension[];
  className?: string;
  readOnly?: boolean;
  lineNumbersConfig?: Parameters<typeof lineNumbers>[0];
  highlightLines?: { start: number; end: number };
  blockWidgets?: BlockWidgetDef[];
  onViewReady?: (view: EditorView) => void;
  onViewDestroy?: () => void;
  enableSearch?: boolean;
  searchOpen?: boolean;
  onSearchOpenChange?: (open: boolean) => void;
};

const lineNumbersCompartment = new Compartment();
const editableCompartment = new Compartment();
const externalExtensionsCompartment = new Compartment();
const highlightLinesCompartment = new Compartment();
const blockWidgetsCompartment = new Compartment();
const searchCompartment = new Compartment();

const toViewKeyBindings = (bindings: readonly unknown[]): readonly KeyBinding[] => {
  return bindings as readonly KeyBinding[];
};

const openSearchPanelCompat = openSearchPanel as unknown as (view: EditorView) => void;
const closeSearchPanelCompat = closeSearchPanel as unknown as (view: EditorView) => void;

// BlockWidget class definition moved inside helper or adapted to take map
class BlockWidget extends WidgetType {
  constructor(readonly id: string, readonly containerMap: Map<string, HTMLElement>) {
    super();
  }

  toDOM() {
    let div = this.containerMap.get(this.id);
    if (!div) {
      div = document.createElement('div');
      div.className = 'oc-block-widget';
      div.dataset.widgetId = this.id;
      this.containerMap.set(this.id, div);
    }
    return div;
  }

  eq(other: BlockWidget) {
    return other.id === this.id;
  }

  destroy() {
    // We do NOT remove from map here because CM might destroy the widget
    // when it scrolls out of view, but we want to reuse the same container (and Portal)
    // when it scrolls back in.
  }
}

const createBlockWidgetsExtension = (widgets: BlockWidgetDef[] | undefined, containerMap: Map<string, HTMLElement>) => {
  if (!widgets || widgets.length === 0) return [];

  return StateField.define<DecorationSet>({
    create(state) {
      const builder = new RangeSetBuilder<Decoration>();
      const sorted = [...widgets].sort((a, b) => a.afterLine - b.afterLine);
      
      for (const w of sorted) {
        const lineCount = state.doc.lines;
        if (w.afterLine > lineCount) continue;
        
        const line = state.doc.line(w.afterLine);
        builder.add(line.to, line.to, Decoration.widget({
          widget: new BlockWidget(w.id, containerMap),
          block: true,
          side: 1, 
        }));
      }
      return builder.finish();
    },
    update(deco, tr) {
      // If the doc changed, map the decorations.
      // If the widgets prop changed, the compartment reconfigure will handle it (create() will run).
      return deco.map(tr.changes);
    },
    provide: f => EditorView.decorations.from(f)
  });
};

const createHighlightLinesExtension = (range?: { start: number; end: number }): Extension => {
  if (!range) {
    return [];
  }

  const start = Math.max(1, range.start);
  const end = Math.max(start, range.end);

  return ViewPlugin.fromClass(class {
    decorations;

    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: import('@codemirror/view').ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }

    build(view: EditorView) {
      const builder = new RangeSetBuilder<Decoration>();
      for (let lineNo = start; lineNo <= end && lineNo <= view.state.doc.lines; lineNo += 1) {
        const line = view.state.doc.line(lineNo);
        builder.add(line.from, line.from, Decoration.line({ class: 'oc-cm-selected-line' }));
      }
      return builder.finish();
    }
  }, { decorations: (v) => v.decorations });
};

// Hidden panel that returns a Panel but doesn't render visible UI
// This allows us to use custom React UI while keeping CM search state
const createHiddenPanel = () => {
  const dom = document.createElement('div');
  dom.style.cssText = 'position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; pointer-events: none;';
  dom.className = 'cm-search-hidden-panel';
  return {
    dom,
    top: true,
    mount: () => {},
    destroy: () => {},
  };
};

// Search Widget Component
interface SearchWidgetProps {
  view: EditorView;
  readOnly?: boolean;
  onClose: () => void;
}

const SearchWidget: React.FC<SearchWidgetProps> = ({ view, readOnly, onClose }) => {
  const [findText, setFindText] = React.useState('');
  const [replaceText, setReplaceText] = React.useState('');
  const [matchCount, setMatchCount] = React.useState(0);
  const [currentMatch, setCurrentMatch] = React.useState(0);
  const findInputRef = React.useRef<HTMLInputElement>(null);

  // Compute match count and current match index
  const updateMatchInfo = React.useCallback(() => {
    const query = getSearchQuery(view.state);
    if (!query.search || query.search === '') {
      setMatchCount(0);
      setCurrentMatch(0);
      return;
    }

    let count = 0;
    let current = 0;
    const cursor = query.getCursor(view.state.doc);
    const selection = view.state.selection.main;
    
    let result = cursor.next();
    while (!result.done) {
      count++;
      const { from, to } = result.value;
      // Check if this match contains the cursor or is closest
      if (from <= selection.head && to >= selection.head) {
        current = count;
      } else if (selection.head < from && current === 0) {
        // Cursor is before this match, this will be the first match after cursor
        if (current === 0) current = count;
      }
      result = cursor.next();
    }

    // If cursor is after all matches, show count as last match
    if (current === 0 && count > 0) {
      current = count;
    }

    setMatchCount(count);
    setCurrentMatch(current);
  }, [view]);

  // Sync with CM search query on mount and when search opens
  React.useEffect(() => {
    const query = getSearchQuery(view.state);
    setFindText(query.search || '');
    setReplaceText(query.replace || '');
    updateMatchInfo();
  }, [view, updateMatchInfo]);

  // Listen to CM state changes
  React.useEffect(() => {
    // Poll for updates when search is open
    const interval = setInterval(() => {
      const query = getSearchQuery(view.state);
      if (query.search !== findText) {
        setFindText(query.search || '');
      }
      updateMatchInfo();
    }, 100);
    return () => clearInterval(interval);
  }, [view, findText, updateMatchInfo]);

  // Focus find input on mount
  React.useEffect(() => {
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, []);

  const handleFindChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFindText(value);
    const currentQuery = getSearchQuery(view.state);
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ 
        search: value, 
        replace: currentQuery.replace,
        caseSensitive: false, 
        literal: true 
      }))
    });
  };

  const handleReplaceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setReplaceText(value);
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ 
        search: findText, 
        replace: value,
        caseSensitive: false, 
        literal: true 
      }))
    });
  };

  const handleFindKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        findPrevious(view);
      } else {
        findNext(view);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleReplaceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) {
        replaceAll(view);
      } else {
        replaceNext(view);
        findNext(view);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleFindNext = () => findNext(view);
  const handleFindPrevious = () => findPrevious(view);
  const handleReplaceNext = () => {
    replaceNext(view);
    findNext(view);
  };
  const handleReplaceAll = () => replaceAll(view);

  return (
    <div 
      className="absolute top-3 right-3 z-50 flex flex-col gap-2 rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)] p-3 shadow-lg min-w-[320px]"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2">
          <Input
            ref={findInputRef}
            type="text"
            value={findText}
            onChange={handleFindChange}
            onKeyDown={handleFindKeyDown}
            placeholder="Find"
            className="h-8 flex-1 bg-[var(--surface-background)] text-sm"
            aria-label="Find"
          />
          <span className="text-xs text-[var(--surface-muted-foreground)] whitespace-nowrap min-w-[3rem] text-right">
            {matchCount > 0 ? `${currentMatch} of ${matchCount}` : '0 of 0'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFindPrevious}
            className="h-7 w-7 p-0 text-[var(--surface-muted-foreground)] hover:text-[var(--surface-foreground)]"
            title="Previous match (Shift+Enter)"
            aria-label="Previous match"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m18 15-6-6-6 6"/>
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFindNext}
            className="h-7 w-7 p-0 text-[var(--surface-muted-foreground)] hover:text-[var(--surface-foreground)]"
            title="Next match (Enter)"
            aria-label="Next match"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </Button>
        </div>
      </div>

      {!readOnly && (
        <div className="flex items-center gap-2">
          <Input
            type="text"
            value={replaceText}
            onChange={handleReplaceChange}
            onKeyDown={handleReplaceKeyDown}
            placeholder="Replace"
            className="h-8 flex-1 bg-[var(--surface-background)] text-sm"
            aria-label="Replace"
          />
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReplaceNext}
              disabled={matchCount === 0}
              className="h-7 px-2 text-xs text-[var(--surface-muted-foreground)] hover:text-[var(--surface-foreground)] disabled:opacity-40"
              title="Replace (Enter)"
            >
              Replace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReplaceAll}
              disabled={matchCount === 0}
              className="h-7 px-2 text-xs text-[var(--surface-muted-foreground)] hover:text-[var(--surface-foreground)] disabled:opacity-40"
              title="Replace All (Ctrl/Cmd+Enter)"
            >
              All
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-1 pt-1 border-t border-[var(--interactive-border)]">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-6 px-2 text-xs text-[var(--surface-muted-foreground)] hover:text-[var(--surface-foreground)]"
        >
          Close
        </Button>
      </div>
    </div>
  );
};

export function CodeMirrorEditor({
  value,
  onChange,
  extensions,
  className,
  readOnly,
  lineNumbersConfig,
  highlightLines,
  onViewReady,
  onViewDestroy,
  blockWidgets,
  enableSearch,
  searchOpen,
  onSearchOpenChange,
}: CodeMirrorEditorProps) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  const valueRef = React.useRef(value);
  const onChangeRef = React.useRef(onChange);
  const onViewReadyRef = React.useRef(onViewReady);
  const onViewDestroyRef = React.useRef(onViewDestroy);
  const onSearchOpenChangeRef = React.useRef(onSearchOpenChange);
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  
  // Scoped map for widget containers to avoid global collisions and memory leaks
  const widgetContainersRef = React.useRef(new Map<string, HTMLElement>());
  const [isSearchPanelOpen, setIsSearchPanelOpen] = React.useState(false);

  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);

  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  React.useEffect(() => {
    onViewReadyRef.current = onViewReady;
    onViewDestroyRef.current = onViewDestroy;
  }, [onViewReady, onViewDestroy]);

  React.useEffect(() => {
    onSearchOpenChangeRef.current = onSearchOpenChange;
  }, [onSearchOpenChange]);

  React.useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const state = EditorState.create({
      doc: valueRef.current,
      extensions: [
        gutters({ fixed: true }),
        lineNumbersCompartment.of(lineNumbers(lineNumbersConfig)),
        history(),
        indentUnit.of('  '),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged || update.viewportChanged || update.geometryChanged) {
            forceUpdate();
          }
          if (!update.docChanged) {
            return;
          }
          const next = update.state.doc.toString();
          valueRef.current = next;
          onChangeRef.current(next);
        }),
        editableCompartment.of(EditorView.editable.of(!readOnly)),
        externalExtensionsCompartment.of(extensions ?? []),
        highlightLinesCompartment.of(createHighlightLinesExtension(highlightLines)),
        blockWidgetsCompartment.of(createBlockWidgetsExtension(blockWidgets, widgetContainersRef.current)),
        searchCompartment.of(enableSearch 
          ? [search({ top: true, createPanel: createHiddenPanel }), keymap.of(toViewKeyBindings(searchKeymap))] 
          : []),
      ],
    });

    viewRef.current = new EditorView({
      state,
      parent: hostRef.current,
    });

    if (viewRef.current) {
      onViewReadyRef.current?.(viewRef.current);
    }

    return () => {
      onViewDestroyRef.current?.();
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    view.dispatch({
      effects: [
        lineNumbersCompartment.reconfigure(lineNumbers(lineNumbersConfig)),
        editableCompartment.reconfigure(EditorView.editable.of(!readOnly)),
        externalExtensionsCompartment.reconfigure(extensions ?? []),
        highlightLinesCompartment.reconfigure(createHighlightLinesExtension(highlightLines)),
        blockWidgetsCompartment.reconfigure(createBlockWidgetsExtension(blockWidgets, widgetContainersRef.current)),
        searchCompartment.reconfigure(enableSearch 
          ? [search({ top: true, createPanel: createHiddenPanel }), keymap.of(toViewKeyBindings(searchKeymap))] 
          : []),
      ],
    });

    // Force a re-render to ensure Portals can find the new widget containers in the DOM
    // The containers are created synchronously by CodeMirror during dispatch -> toDOM
    forceUpdate();
  }, [extensions, highlightLines, lineNumbersConfig, readOnly, blockWidgets, enableSearch]);

  // Sync search open state from props
  React.useEffect(() => {
    const view = viewRef.current;
    if (!view || enableSearch === false) {
      return;
    }
    if (searchOpen) {
      openSearchPanelCompat(view);
      setIsSearchPanelOpen(true);
    } else {
      closeSearchPanelCompat(view);
      setIsSearchPanelOpen(false);
    }
  }, [searchOpen, enableSearch]);

  // Watch for CM-driven search panel state changes
  // The search panel is "open" when our custom SearchWidget is rendered
  // We track this via the isSearchPanelOpen state which is synced with props

  React.useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  const handleCloseSearch = React.useCallback(() => {
    const view = viewRef.current;
    if (view) {
      closeSearchPanelCompat(view);
    }
    onSearchOpenChange?.(false);
    setIsSearchPanelOpen(false);
    // Return focus to editor
    view?.focus();
  }, [onSearchOpenChange]);

  return (
    <>
      <div
        ref={hostRef}
        className={cn(
          'h-full w-full relative',
          '[&_.cm-editor]:h-full [&_.cm-editor]:w-full',
          '[&_.cm-scroller]:font-mono [&_.cm-scroller]:text-[var(--text-code)] [&_.cm-scroller]:leading-6',
          '[&_.cm-lineNumbers]:text-[var(--tools-edit-line-number)]',
          className,
        )}
      >
        {enableSearch && isSearchPanelOpen && viewRef.current && (
          <SearchWidget
            view={viewRef.current}
            readOnly={readOnly}
            onClose={handleCloseSearch}
          />
        )}
      </div>
      {blockWidgets?.map((w) => {
        // Look for the widget container in our scoped map
        // We prefer the map over querySelector because the container might be created but not yet attached,
        // or detached temporarily by CM (virtual scrolling). Keeping the portal mounted preserves state.
        const container = widgetContainersRef.current.get(w.id);
        if (!container) return null;
        return createPortal(w.content, container, w.id);
      })}
    </>
  );
}
