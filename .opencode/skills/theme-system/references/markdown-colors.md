---
title: Markdown Colors via VSCode TextMate Themes
---

# Markdown Colors

## How It Works

Markdown in OpenChamber is rendered by **Streamdown**. We override Streamdown's hardcoded styles with CSS variables from our theme system via `index.css`.

## CSS Variables from Theme

All markdown elements use these CSS variables (defined in `cssGenerator.ts`):

| Element | CSS Variable | Theme Key | Fallback |
|---------|--------------|-----------|----------|
| H1 | `--markdown-heading1` | `markdown.heading1` | `primary` |
| H2 | `--markdown-heading2` | `markdown.heading2` | `primary` (90% opacity) |
| H3 | `--markdown-heading3` | `markdown.heading3` | `primary` (80% opacity) |
| H4-H6 | `--markdown-heading4` | `markdown.heading4` | `foreground` |
| Links | `--markdown-link` | `markdown.link` | `primary` |
| Links hover | `--markdown-link-hover` | `markdown.linkHover` | `primary.hover` |
| Inline code | `--markdown-inline-code` | `markdown.inlineCode` | `syntax.base.string` |
| Inline code bg | `--markdown-inline-code-bg` | `markdown.inlineCodeBackground` | `chat.background` |
| Blockquote | `--markdown-blockquote` | `markdown.blockquote` | `mutedForeground` |
| Blockquote border | `--markdown-blockquote-border` | `markdown.blockquoteBorder` | `interactive.border` |
| List markers | `--markdown-list-marker` | `markdown.listMarker` | `primary` (60% opacity) |
| Bold | `--markdown-bold` | `markdown.bold` | `foreground` |
| Italic | `--markdown-italic` | `markdown.italic` | `foreground` (90% opacity) |
| Strikethrough | `--markdown-strikethrough` | `markdown.strikethrough` | `mutedForeground` |
| HR | `--markdown-hr` | `markdown.hr` | `interactive.border` |

## Override Location

All markdown color overrides are in `packages/ui/src/index.css`:

```css
.streamdown-content h1 { color: var(--markdown-heading1, var(--primary)); }
.streamdown-content a { color: var(--markdown-link, var(--primary)); }
.streamdown-content code[data-streamdown="inline-code"] { 
  background-color: var(--markdown-inline-code-bg, var(--surface-muted)); 
}
/* etc. */
```

## Adding Custom Markdown Colors

Add to `colors.markdown` in theme JSON:

```json
{
  "colors": {
    "markdown": {
      "heading1": "#AD8301",
      "link": "#205EA6",
      "linkHover": "#4385BE",
      "inlineCode": "#24837B",
      "inlineCodeBackground": "#F2F0E5",
      "blockquote": "#6F6E69",
      "blockquoteBorder": "#DAD8CE"
    }
  }
}
```

If a key is missing, it falls back to the values shown in the table above.

## Code Blocks

Fenced code blocks use Shiki syntax highlighting with VSCode TextMate themes (via `textMateThemeFromAppTheme.ts`):
- **Background**: `syntax.base.background`
- **Syntax colors**: From `syntax.base` and `syntax.tokens`

## References

- CSS overrides: `packages/ui/src/index.css` (search for `.streamdown-content`)
- CSS generator: `packages/ui/src/lib/theme/cssGenerator.ts` (lines 366-381)
- Theme types: `packages/ui/src/types/theme.ts`
