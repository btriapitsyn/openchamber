import type { Extension } from '@codemirror/state';

import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

import type { Theme } from '@/types/theme';

export function createFlexokiCodeMirrorTheme(theme: Theme): Extension {
  const isDark = theme.metadata.variant === 'dark';

  const monoFont = theme.config?.fonts?.mono || 'monospace';
  const highlights = theme.colors.syntax.highlights || {};
  const tokens = theme.colors.syntax.tokens || {};

  const ui = EditorView.theme({
    '&': {
      backgroundColor: 'var(--background)',
      color: theme.colors.syntax.base.foreground,
      fontSize: 'var(--text-code)',
      lineHeight: '1.5rem',
    },
    '.cm-scroller': {
      fontFamily: monoFont,
      backgroundColor: 'var(--background)',
    },

    /* StreamLanguage/legacy-modes tokens (class-based) */
    '.cm-comment': {
      color: theme.colors.syntax.base.comment,
    },
    '.cm-keyword': {
      color: theme.colors.syntax.base.keyword,
    },
    '.cm-string': {
      color: theme.colors.syntax.base.string,
    },
    '.cm-string-2': {
      color: tokens.stringEscape || theme.colors.syntax.base.string,
    },
    '.cm-number': {
      color: theme.colors.syntax.base.number,
    },
    '.cm-atom': {
      color: tokens.boolean || theme.colors.syntax.base.number,
    },
    '.cm-builtin': {
      color: tokens.functionCall || theme.colors.syntax.base.function,
    },
    '.cm-def': {
      color: tokens.variableGlobal || theme.colors.syntax.base.variable,
    },
    // Legacy shell flags (--foo, -bar)
    '.cm-attribute': {
      color: tokens.variableOther || tokens.variableProperty || theme.colors.syntax.base.operator,
    },
    '.cm-meta': {
      color: theme.colors.syntax.base.comment,
    },
    '.cm-property': {
      color: tokens.variableProperty || theme.colors.syntax.base.keyword,
    },
    '.cm-variable': {
      color: theme.colors.syntax.base.variable,
    },
    '.cm-variable-2': {
      color: tokens.variableOther || theme.colors.syntax.base.function,
    },
    '.cm-variable-3': {
      color: tokens.variableGlobal || theme.colors.syntax.base.type,
    },
    '.cm-tag': {
      color: tokens.tag || theme.colors.syntax.base.keyword,
    },
    '.cm-link': {
      color: tokens.url || theme.colors.syntax.base.keyword,
      textDecoration: 'underline',
    },
    '.cm-content': {
      caretColor: theme.colors.interactive.cursor,
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: theme.colors.interactive.cursor,
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: theme.colors.interactive.selection,
    },
    '.cm-gutters': {
      backgroundColor: 'var(--background)',
      color: highlights.lineNumber || theme.colors.syntax.base.comment,
      borderRight: `1px solid ${theme.colors.interactive.border}`,
      position: 'sticky',
      paddingRight: '8px',
      left: 0,
      zIndex: 2,
      boxShadow: `0 0 0 var(--background)`,
    },
    '.cm-gutter': {
      backgroundColor: 'var(--background)',
    },
    '.cm-gutterElement': {
      backgroundColor: 'var(--background)',
    },
    '.cm-lineNumbers': {
      backgroundColor: 'var(--background)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      paddingLeft: '8px',
      paddingRight: '8px',
      minWidth: '42px',
    },
    '.cm-activeLineGutter': {
      color: highlights.lineNumberActive || theme.colors.syntax.base.foreground,
    },
    '.cm-activeLine': {
      backgroundColor: theme.colors.surface.overlay,
    },
    '&.cm-focused': {
      outline: 'none',
    },
  }, { dark: isDark });

  const syntax = HighlightStyle.define([
    { tag: t.comment, color: theme.colors.syntax.base.comment },
    { tag: t.docComment, color: tokens.commentDoc || theme.colors.syntax.base.comment },

    { tag: t.keyword, color: theme.colors.syntax.base.keyword },
    { tag: t.controlKeyword, color: theme.colors.syntax.base.keyword },
    { tag: t.operatorKeyword, color: theme.colors.syntax.base.operator },
    { tag: t.moduleKeyword, color: tokens.keywordImport || theme.colors.syntax.base.keyword },
    { tag: [t.definitionKeyword, t.modifier], color: tokens.storageModifier || theme.colors.syntax.base.keyword },

    { tag: t.atom, color: tokens.boolean || theme.colors.syntax.base.number },
    { tag: [t.null, t.self], color: theme.colors.syntax.base.number },
    { tag: [t.meta, t.documentMeta], color: theme.colors.syntax.base.comment },

    { tag: t.string, color: theme.colors.syntax.base.string },
    { tag: t.escape, color: tokens.stringEscape || theme.colors.syntax.base.foreground },
    { tag: t.regexp, color: tokens.regex || theme.colors.syntax.base.string },

    { tag: t.number, color: theme.colors.syntax.base.number },
    { tag: t.bool, color: tokens.boolean || theme.colors.syntax.base.number },

    // Operators + punctuation
    { tag: t.operator, color: theme.colors.syntax.base.operator },
    { tag: [t.derefOperator, t.updateOperator, t.definitionOperator, t.typeOperator, t.controlOperator], color: theme.colors.syntax.base.operator },
    { tag: [t.logicOperator, t.bitwiseOperator, t.arithmeticOperator], color: theme.colors.syntax.base.operator },
    { tag: [t.compareOperator], color: tokens.diffModified || theme.colors.syntax.base.operator },
    { tag: [t.punctuation, t.separator, t.bracket, t.paren, t.brace, t.squareBracket, t.angleBracket], color: tokens.punctuation || theme.colors.syntax.base.comment },

    // Calls vs definitions
    { tag: t.function(t.variableName), color: tokens.functionCall || theme.colors.syntax.base.function },
    { tag: t.function(t.definition(t.variableName)), color: theme.colors.syntax.base.function },
    { tag: t.function(t.propertyName), color: tokens.method || tokens.functionCall || theme.colors.syntax.base.function },

    // Names
    { tag: t.namespace, color: tokens.namespace || theme.colors.syntax.base.type },
    { tag: t.moduleKeyword, color: tokens.module || theme.colors.syntax.base.keyword },
    { tag: t.macroName, color: tokens.macro || theme.colors.syntax.base.keyword },
    { tag: t.labelName, color: tokens.label || theme.colors.syntax.base.keyword },
    { tag: t.annotation, color: tokens.decorator || theme.colors.syntax.base.keyword },

    // Variables/properties
    { tag: t.propertyName, color: tokens.variableProperty || theme.colors.syntax.base.keyword },
    { tag: t.attributeName, color: tokens.tagAttribute || theme.colors.syntax.base.keyword },

    // StreamLanguage/legacy token tags resolve to these
    { tag: t.standard(t.variableName), color: tokens.method || theme.colors.syntax.base.function },
    { tag: t.definition(t.variableName), color: theme.colors.syntax.base.variable },
    { tag: t.local(t.variableName), color: theme.colors.syntax.base.variable },
    { tag: t.special(t.variableName), color: tokens.variableOther || theme.colors.syntax.base.function },
    { tag: t.variableName, color: theme.colors.syntax.base.variable },
    { tag: t.special(t.string), color: theme.colors.syntax.base.string },

    // Types/constants
    { tag: t.className, color: tokens.className || theme.colors.syntax.base.type },
    { tag: t.typeName, color: theme.colors.syntax.base.type },
    { tag: t.constant(t.variableName), color: tokens.constant || theme.colors.syntax.base.variable },
    { tag: t.literal, color: tokens.constant || theme.colors.syntax.base.variable },

    // Markup
    { tag: t.tagName, color: tokens.tag || theme.colors.syntax.base.keyword },
    { tag: t.attributeValue, color: tokens.tagAttributeValue || theme.colors.syntax.base.string },

    // Markdown-ish
    { tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], color: theme.colors.syntax.base.keyword, fontWeight: '600' },
    { tag: t.monospace, color: theme.colors.syntax.base.string },

    { tag: t.link, color: tokens.url || theme.colors.syntax.base.keyword, textDecoration: 'underline' },
  ]);

  return [ui, syntaxHighlighting(syntax)];
}
