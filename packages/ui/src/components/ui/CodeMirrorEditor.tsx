import React from 'react';

import type { Extension } from '@codemirror/state';
import { Compartment, EditorState, RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, gutters, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';

import { cn } from '@/lib/utils';

type CodeMirrorEditorProps = {
  value: string;
  onChange: (value: string) => void;
  extensions?: Extension[];
  className?: string;
  readOnly?: boolean;
  lineNumbersConfig?: Parameters<typeof lineNumbers>[0];
  highlightLines?: { start: number; end: number };
  onViewReady?: (view: EditorView) => void;
  onViewDestroy?: () => void;
};

const lineNumbersCompartment = new Compartment();
const editableCompartment = new Compartment();
const externalExtensionsCompartment = new Compartment();
const highlightLinesCompartment = new Compartment();

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
}: CodeMirrorEditorProps) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  const valueRef = React.useRef(value);
  const onChangeRef = React.useRef(onChange);
  const onViewReadyRef = React.useRef(onViewReady);
  const onViewDestroyRef = React.useRef(onViewDestroy);

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
      ],
    });
  }, [extensions, highlightLines, lineNumbersConfig, readOnly]);

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
  );
}
