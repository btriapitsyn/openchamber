import type { Theme } from '@/types/theme';

/**
 * Generate a Prism syntax highlighting theme from the current theme
 */
export function generateSyntaxTheme(theme: Theme) {
  const syntax = theme.colors.syntax;
  const surface = theme.colors.surface;
  
  return {
    'code[class*="language-"]': {
      color: syntax.base.foreground,
      background: 'transparent',
      fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
      fontSize: '1em',
      textAlign: 'left' as const,
      whiteSpace: 'pre',
      wordSpacing: 'normal',
      wordBreak: 'normal' as const,
      wordWrap: 'normal' as const,
      lineHeight: '1.5',
      MozTabSize: '4',
      OTabSize: '4',
      tabSize: '4',
      WebkitHyphens: 'none' as const,
      MozHyphens: 'none' as const,
      msHyphens: 'none' as const,
      hyphens: 'none' as const,
    },
    'pre[class*="language-"]': {
      color: syntax.base.foreground,
      background: 'transparent',
      fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
      fontSize: '1em',
      textAlign: 'left' as const,
      whiteSpace: 'pre',
      wordSpacing: 'normal',
      wordBreak: 'normal' as const,
      wordWrap: 'normal' as const,
      lineHeight: '1.5',
      MozTabSize: '4',
      OTabSize: '4',
      tabSize: '4',
      WebkitHyphens: 'none' as const,
      MozHyphens: 'none' as const,
      msHyphens: 'none' as const,
      hyphens: 'none' as const,
      padding: '0',
      margin: '0',
      overflow: 'auto',
    },
    
    // Comments
    comment: {
      color: syntax.base.comment,
      fontStyle: 'italic',
    },
    prolog: {
      color: syntax.base.comment,
    },
    doctype: {
      color: syntax.base.comment,
    },
    cdata: {
      color: syntax.base.comment,
    },
    
    // Punctuation
    punctuation: {
      color: syntax.tokens?.punctuation || surface.mutedForeground,
    },
    
    // Properties and attributes
    property: {
      color: syntax.tokens?.variableProperty || syntax.base.variable,
    },
    tag: {
      color: syntax.tokens?.tag || syntax.base.keyword,
    },
    'attr-name': {
      color: syntax.tokens?.tagAttribute || syntax.base.variable,
    },
    'attr-value': {
      color: syntax.tokens?.tagAttributeValue || syntax.base.string,
    },
    
    // Literals
    boolean: {
      color: syntax.tokens?.boolean || syntax.base.number,
    },
    number: {
      color: syntax.base.number,
    },
    constant: {
      color: syntax.tokens?.constant || syntax.base.number,
    },
    symbol: {
      color: syntax.tokens?.constant || syntax.base.number,
    },
    
    // Strings
    string: {
      color: syntax.base.string,
    },
    char: {
      color: syntax.base.string,
    },
    
    // Functions
    function: {
      color: syntax.base.function,
    },
    builtin: {
      color: syntax.tokens?.functionBuiltin || syntax.base.function,
    },
    
    // Classes and types
    'class-name': {
      color: syntax.tokens?.className || syntax.base.type,
    },
    namespace: {
      color: syntax.tokens?.namespace || syntax.base.type,
      opacity: 0.8,
    },
    
    // Keywords
    keyword: {
      color: syntax.base.keyword,
    },
    atrule: {
      color: syntax.base.keyword,
    },
    selector: {
      color: syntax.base.function,
    },
    
    // Operators
    operator: {
      color: syntax.base.operator,
    },
    
    // Variables
    variable: {
      color: syntax.base.variable,
    },
    
    // Regex
    regex: {
      color: syntax.tokens?.regex || syntax.base.string,
    },
    
    // URLs
    url: {
      color: syntax.base.function,
      textDecoration: 'underline',
    },
    entity: {
      color: syntax.base.function,
      cursor: 'help',
    },
    
    // CSS specific
    '.language-css .token.string': {
      color: syntax.base.string,
    },
    '.style .token.string': {
      color: syntax.base.string,
    },
    
    // Diff colors
    deleted: {
      color: theme.colors.status.error,
      backgroundColor: theme.colors.status.errorBackground,
    },
    inserted: {
      color: theme.colors.status.success,
      backgroundColor: theme.colors.status.successBackground,
    },
    
    // Markdown tokens
    title: {
      color: theme.colors.primary.base,
      fontWeight: 'bold',
    },
    'code-block': {
      color: syntax.base.string,
    },
    'code-snippet': {
      color: syntax.base.string,
    },
    list: {
      color: syntax.base.variable,
    },
    hr: {
      color: surface.mutedForeground,
    },
    table: {
      color: syntax.base.function,
    },
    blockquote: {
      color: surface.mutedForeground,
      fontStyle: 'italic',
    },
    
    // Text formatting
    important: {
      color: syntax.base.keyword,
      fontWeight: 'bold',
    },
    bold: {
      fontWeight: 'bold',
    },
    italic: {
      fontStyle: 'italic',
    },
    strike: {
      textDecoration: 'line-through',
    },
    
    // Decorators
    decorator: {
      color: syntax.tokens?.decorator || syntax.base.function,
    },
    annotation: {
      color: syntax.tokens?.decorator || syntax.base.function,
    },
  };
}