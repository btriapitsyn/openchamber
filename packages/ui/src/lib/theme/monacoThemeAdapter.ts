import type { Theme } from '@/types/theme';
import type * as monaco from 'monaco-editor';

/**
 * Converts an OpenChamber theme to a Monaco Editor theme definition.
 * Monaco themes use a specific format with base theme inheritance and token colors.
 */
export function createMonacoTheme(theme: Theme): monaco.editor.IStandaloneThemeData {
  const isDark = theme.metadata.variant === 'dark';
  const colors = theme.colors;
  const syntax = colors.syntax.base;

  // Monaco requires #RRGGBB format (no alpha for most colors)
  const normalizeColor = (color: string): string => {
    if (!color) return '';
    // If it's rgba, convert to hex (stripping alpha)
    const rgbaMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbaMatch) {
      const r = Number.parseInt(rgbaMatch[1], 10).toString(16).padStart(2, '0');
      const g = Number.parseInt(rgbaMatch[2], 10).toString(16).padStart(2, '0');
      const b = Number.parseInt(rgbaMatch[3], 10).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
    // Handle #RGB shorthand
    if (color.match(/^#[0-9a-fA-F]{3}$/)) {
      const r = color[1];
      const g = color[2];
      const b = color[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    // Return as-is if already valid hex
    return color;
  };

  // For colors that support alpha (like selection), keep the full value
  const normalizeColorWithAlpha = (color: string): string => {
    if (!color) return '';
    // Convert rgba to hex with alpha if present
    const rgbaMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (rgbaMatch) {
      const r = Number.parseInt(rgbaMatch[1], 10).toString(16).padStart(2, '0');
      const g = Number.parseInt(rgbaMatch[2], 10).toString(16).padStart(2, '0');
      const b = Number.parseInt(rgbaMatch[3], 10).toString(16).padStart(2, '0');
      if (rgbaMatch[4]) {
        const a = Math.round(Number.parseFloat(rgbaMatch[4]) * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}${a}`;
      }
      return `#${r}${g}${b}`;
    }
    return color;
  };

  return {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      // Comments
      { token: 'comment', foreground: normalizeColor(syntax.comment).replace('#', ''), fontStyle: 'italic' },
      { token: 'comment.block', foreground: normalizeColor(syntax.comment).replace('#', ''), fontStyle: 'italic' },
      { token: 'comment.line', foreground: normalizeColor(syntax.comment).replace('#', ''), fontStyle: 'italic' },
      
      // Keywords
      { token: 'keyword', foreground: normalizeColor(syntax.keyword).replace('#', ''), fontStyle: 'bold' },
      { token: 'keyword.control', foreground: normalizeColor(syntax.keyword).replace('#', '') },
      { token: 'keyword.operator', foreground: normalizeColor(syntax.operator).replace('#', '') },
      { token: 'storage', foreground: normalizeColor(syntax.keyword).replace('#', '') },
      { token: 'storage.type', foreground: normalizeColor(syntax.keyword).replace('#', '') },
      
      // Strings
      { token: 'string', foreground: normalizeColor(syntax.string).replace('#', '') },
      { token: 'string.quoted', foreground: normalizeColor(syntax.string).replace('#', '') },
      { token: 'string.template', foreground: normalizeColor(syntax.string).replace('#', '') },
      { token: 'string.regex', foreground: normalizeColor(syntax.string).replace('#', '') },
      
      // Numbers
      { token: 'number', foreground: normalizeColor(syntax.number).replace('#', '') },
      { token: 'constant.numeric', foreground: normalizeColor(syntax.number).replace('#', '') },
      
      // Functions
      { token: 'entity.name.function', foreground: normalizeColor(syntax.function).replace('#', '') },
      { token: 'support.function', foreground: normalizeColor(syntax.function).replace('#', '') },
      { token: 'meta.function-call', foreground: normalizeColor(syntax.function).replace('#', '') },
      
      // Variables
      { token: 'variable', foreground: normalizeColor(syntax.variable).replace('#', '') },
      { token: 'variable.parameter', foreground: normalizeColor(syntax.variable).replace('#', '') },
      { token: 'variable.other', foreground: normalizeColor(syntax.variable).replace('#', '') },
      
      // Types
      { token: 'entity.name.type', foreground: normalizeColor(syntax.type).replace('#', '') },
      { token: 'entity.name.class', foreground: normalizeColor(syntax.type).replace('#', '') },
      { token: 'support.type', foreground: normalizeColor(syntax.type).replace('#', '') },
      { token: 'support.class', foreground: normalizeColor(syntax.type).replace('#', '') },
      
      // Operators
      { token: 'keyword.operator', foreground: normalizeColor(syntax.operator).replace('#', '') },
      { token: 'punctuation', foreground: normalizeColor(syntax.foreground).replace('#', '') },
      
      // Constants
      { token: 'constant', foreground: normalizeColor(syntax.number).replace('#', '') },
      { token: 'constant.language', foreground: normalizeColor(syntax.keyword).replace('#', '') },
      
      // Tags (HTML/JSX)
      { token: 'tag', foreground: normalizeColor(syntax.keyword).replace('#', '') },
      { token: 'tag.attribute.name', foreground: normalizeColor(syntax.variable).replace('#', '') },
      
      // JSON
      { token: 'string.key.json', foreground: normalizeColor(syntax.variable).replace('#', '') },
      { token: 'string.value.json', foreground: normalizeColor(syntax.string).replace('#', '') },
      
      // Markdown
      { token: 'markup.heading', foreground: normalizeColor(syntax.keyword).replace('#', ''), fontStyle: 'bold' },
      { token: 'markup.bold', fontStyle: 'bold' },
      { token: 'markup.italic', fontStyle: 'italic' },
      { token: 'markup.inline.raw', foreground: normalizeColor(syntax.string).replace('#', '') },
      
      // Default
      { token: '', foreground: normalizeColor(syntax.foreground).replace('#', '') },
    ],
    colors: {
      // Editor background and foreground
      'editor.background': normalizeColor(syntax.background),
      'editor.foreground': normalizeColor(syntax.foreground),
      
      // Selection
      'editor.selectionBackground': normalizeColorWithAlpha(colors.interactive.selection),
      'editor.selectionForeground': normalizeColor(colors.interactive.selectionForeground),
      'editor.inactiveSelectionBackground': normalizeColorWithAlpha(colors.interactive.selection),
      
      // Line highlight
      'editor.lineHighlightBackground': normalizeColorWithAlpha(colors.surface.muted),
      'editor.lineHighlightBorder': '#00000000',
      
      // Cursor
      'editorCursor.foreground': normalizeColor(colors.interactive.cursor),
      
      // Line numbers
      'editorLineNumber.foreground': normalizeColor(colors.surface.mutedForeground),
      'editorLineNumber.activeForeground': normalizeColor(colors.surface.foreground),
      
      // Gutter
      'editorGutter.background': normalizeColor(syntax.background),
      
      // Widget (autocomplete, etc.)
      'editorWidget.background': normalizeColor(colors.surface.elevated),
      'editorWidget.foreground': normalizeColor(colors.surface.elevatedForeground),
      'editorWidget.border': normalizeColor(colors.interactive.border),
      
      // Suggest widget (autocomplete dropdown)
      'editorSuggestWidget.background': normalizeColor(colors.surface.elevated),
      'editorSuggestWidget.foreground': normalizeColor(colors.surface.elevatedForeground),
      'editorSuggestWidget.border': normalizeColor(colors.interactive.border),
      'editorSuggestWidget.selectedBackground': normalizeColorWithAlpha(colors.interactive.hover),
      'editorSuggestWidget.highlightForeground': normalizeColor(colors.primary.base),
      
      // Hover widget
      'editorHoverWidget.background': normalizeColor(colors.surface.elevated),
      'editorHoverWidget.foreground': normalizeColor(colors.surface.elevatedForeground),
      'editorHoverWidget.border': normalizeColor(colors.interactive.border),
      
      // Find/Replace widget
      'editor.findMatchBackground': normalizeColorWithAlpha(`${colors.primary.base}40`),
      'editor.findMatchHighlightBackground': normalizeColorWithAlpha(`${colors.primary.base}25`),
      
      // Scrollbar
      'scrollbarSlider.background': normalizeColorWithAlpha(`${colors.surface.mutedForeground}30`),
      'scrollbarSlider.hoverBackground': normalizeColorWithAlpha(`${colors.surface.mutedForeground}50`),
      'scrollbarSlider.activeBackground': normalizeColorWithAlpha(`${colors.surface.mutedForeground}70`),
      
      // Minimap
      'minimap.background': normalizeColor(syntax.background),
      
      // Indent guides
      'editorIndentGuide.background': normalizeColorWithAlpha(colors.interactive.border),
      'editorIndentGuide.activeBackground': normalizeColorWithAlpha(colors.surface.mutedForeground),
      
      // Bracket matching
      'editorBracketMatch.background': normalizeColorWithAlpha(`${colors.primary.base}30`),
      'editorBracketMatch.border': normalizeColor(colors.primary.base),
      
      // Error/Warning squiggles
      'editorError.foreground': normalizeColor(colors.status.error),
      'editorWarning.foreground': normalizeColor(colors.status.warning),
      'editorInfo.foreground': normalizeColor(colors.status.info),
    },
  };
}

/**
 * Maps common file extensions to Monaco language identifiers.
 * Monaco uses specific language IDs that may differ from other systems.
 */
export function getMonacoLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const filename = filePath.split('/').pop()?.toLowerCase() || '';

  // Handle special filenames
  const filenameMap: Record<string, string> = {
    'dockerfile': 'dockerfile',
    'makefile': 'makefile',
    'cmakelists.txt': 'cmake',
    '.gitignore': 'plaintext',
    '.env': 'shell',
    'tsconfig.json': 'json',
    'package.json': 'json',
  };

  if (filenameMap[filename]) {
    return filenameMap[filename];
  }

  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'mjs': 'javascript',
    'cjs': 'javascript',
    'mts': 'typescript',
    'cts': 'typescript',

    // Web
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'scss': 'scss',
    'less': 'less',
    'vue': 'html',
    'svelte': 'html',

    // Data formats
    'json': 'json',
    'jsonc': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'toml': 'ini',
    'xml': 'xml',
    'svg': 'xml',

    // Python
    'py': 'python',
    'pyw': 'python',

    // Ruby
    'rb': 'ruby',
    'erb': 'html',

    // PHP
    'php': 'php',

    // Java/Kotlin
    'java': 'java',
    'kt': 'kotlin',
    'kts': 'kotlin',

    // C/C++
    'c': 'c',
    'h': 'c',
    'cpp': 'cpp',
    'cc': 'cpp',
    'cxx': 'cpp',
    'hpp': 'cpp',

    // C#
    'cs': 'csharp',

    // Go
    'go': 'go',

    // Rust
    'rs': 'rust',

    // Swift
    'swift': 'swift',

    // Shell
    'sh': 'shell',
    'bash': 'shell',
    'zsh': 'shell',
    'ps1': 'powershell',

    // SQL
    'sql': 'sql',

    // GraphQL
    'graphql': 'graphql',
    'gql': 'graphql',

    // Markdown
    'md': 'markdown',
    'mdx': 'markdown',

    // Plain text
    'txt': 'plaintext',
    'text': 'plaintext',

    // Config files
    'ini': 'ini',
    'cfg': 'ini',
    'conf': 'ini',

    // Diff
    'diff': 'diff',
    'patch': 'diff',
  };

  return languageMap[ext || ''] || 'plaintext';
}
