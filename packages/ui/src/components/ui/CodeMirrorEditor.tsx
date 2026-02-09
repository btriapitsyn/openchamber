import React from 'react';

import type { Extension } from '@codemirror/state';
import { Compartment, EditorState, RangeSetBuilder, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, WidgetType, gutters, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { search, searchKeymap, openSearchPanel, closeSearchPanel } from '@codemirror/search';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

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

// Map to store widget container elements by ID
// This allows us to render portals into them even if they are created by CM
const widgetContainers = new Map<string, HTMLElement>();

class BlockWidget extends WidgetType {
  constructor(readonly id: string) {
    super();
  }

  toDOM() {
    let div = widgetContainers.get(this.id);
    if (!div) {
      div = document.createElement('div');
      div.className = 'oc-block-widget';
      div.dataset.widgetId = this.id;
      widgetContainers.set(this.id, div);
    }
    return div;
  }

  eq(other: BlockWidget) {
    return other.id === this.id;
  }
  
  destroy() {
    // Optional: cleanup if needed, but we might want to keep the element for React to unmount gracefully?
    // Actually, if CM destroys the DOM, React portal might complain if we don't unmount.
    // But since we render portals based on the 'blockWidgets' prop, if the widget is removed from prop, 
    // the portal will be removed by React.
    // If CM removes it because it's out of viewport, we still want the container to exist in our map?
    // No, if CM removes it, we should probably let it go.
    // But for now let's keep it simple.
  }
}

const createBlockWidgetsExtension = (widgets?: BlockWidgetDef[]) => {
  if (!widgets || widgets.length === 0) return [];

  return StateField.define<DecorationSet>({
    create(state) {
      const builder = new RangeSetBuilder<Decoration>();
      // Sort widgets by line number to add them in order
      const sorted = [...widgets].sort((a, b) => a.afterLine - b.afterLine);
      
      for (const w of sorted) {
        const lineCount = state.doc.lines;
        if (w.afterLine > lineCount) continue;
        
        const line = state.doc.line(w.afterLine);
        // Add widget decoration
        builder.add(line.to, line.to, Decoration.widget({
          widget: new BlockWidget(w.id),
          block: true,
          side: 1, 
        }));
      }
      return builder.finish();
    },
    update(deco, tr) {
      // Always rebuild decorations when doc changes or widgets config changes
      // But here we only see transaction. 
      // Since we reconfigure the compartment when props change, this update might mostly handle doc changes.
      // For simplicity, we can map existing decorations or rebuild.
      // Let's rebuild to ensure correct line placement.
      // Wait, we can't access 'widgets' prop here easily unless we use a closure or effect.
      // The `create` method runs when state is created.
      // When we reconfigure the compartment, `create` might run again or we need `provide`.
      
      // Actually, standard pattern is to map decorations.
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
}: CodeMirrorEditorProps) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  const valueRef = React.useRef(value);
  const onChangeRef = React.useRef(onChange);
  const onViewReadyRef = React.useRef(onViewReady);
  const onViewDestroyRef = React.useRef(onViewDestroy);
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

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
        blockWidgetsCompartment.of(createBlockWidgetsExtension(blockWidgets)),
        searchCompartment.of(enableSearch ? [search({ top: true }), keymap.of(searchKeymap)] : []),
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
        blockWidgetsCompartment.reconfigure(createBlockWidgetsExtension(blockWidgets)),
        searchCompartment.reconfigure(enableSearch ? [search({ top: true }), keymap.of(searchKeymap)] : []),
      ],
    });
  }, [extensions, highlightLines, lineNumbersConfig, readOnly, blockWidgets, enableSearch]);

  React.useEffect(() => {
    const view = viewRef.current;
    if (!view || enableSearch === false) {
      return;
    }
    if (searchOpen) {
      openSearchPanel(view);
    } else {
      closeSearchPanel(view);
    }
  }, [searchOpen, enableSearch]);

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

  return (
    <>
      <div
        ref={hostRef}
        className={cn(
          'h-full w-full',
          '[&_.cm-editor]:h-full [&_.cm-editor]:w-full',
          '[&_.cm-scroller]:font-mono [&_.cm-scroller]:text-[var(--text-code)] [&_.cm-scroller]:leading-6',
          '[&_.cm-lineNumbers]:text-[var(--tools-edit-line-number)]',
          className,
        )}
      />
      {blockWidgets?.map((w) => {
        // Look for the widget container in the editor DOM
        // Since we store them in a map too (as backup/optimization), we could check there,
        // but querySelector is safer to ensure it's actually in the DOM
        const container = viewRef.current?.dom.querySelector(`[data-widget-id="${w.id}"]`);
        if (!container) return null;
        return createPortal(w.content, container, w.id);
      })}
    </>
  );
}
