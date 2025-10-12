# OpenCode WebUI Theming Guide

## Quick Reference for Component Development

This guide helps developers understand which CSS variables to use when creating new components or modifying existing ones in the OpenCode WebUI.

## Table of Contents
- [Theme System Overview](#theme-system-overview)
- [Standard UI Elements](#standard-ui-elements)
- [Component-Specific Variables](#component-specific-variables)
- [Color Variable Reference](#color-variable-reference)
- [Usage Examples](#usage-examples)
- [Theme File Locations](#theme-file-locations)
- [Theme Management](#theme-management)
- [Creating New Components](#creating-new-components)

## Theme System Overview

The OpenCode WebUI uses a CSS variable-based theming system. All colors are defined as CSS variables that automatically update when themes change.

### Key Principles
1. **Never hardcode colors** - Always use CSS variables
2. **Semantic naming** - Variables describe purpose, not color (e.g., `--status-error` not `--red`)
3. **Inheritance** - Components inherit from core semantic colors
4. **Runtime switching** - Themes change instantly without reload
5. **Built-in themes only** - All themes are defined in the codebase

### Architecture

The theming system consists of:

1. **Theme Engine** (`/src/lib/theme/cssGenerator.ts`)
   - Converts theme objects to CSS variables
   - Handles inheritance and color manipulation
   - Applies themes to DOM at runtime

2. **Theme Context** (`/src/contexts/ThemeSystemContext.tsx`)
   - React context for theme state management
   - Handles theme switching and persistence
   - Manages user theme preferences

3. **Theme Definitions** (`/src/lib/theme/themes/`)
   - All available themes defined as TypeScript modules
   - Each theme follows the same structure
   - Exported via centralized index

## Standard UI Elements

### Background & Text Colors

| Element | CSS Variable | Usage |
|---------|-------------|--------|
| Main background | `--background` | Page/app background |
| Main text | `--foreground` | Primary text color |
| Card/elevated surface | `--card` | Cards, modals, elevated elements |
| Card text | `--card-foreground` | Text on cards |
| Muted background | `--muted` | Secondary backgrounds |
| Muted text | `--muted-foreground` | Secondary/helper text |
| Subtle background | `--accent` | Very subtle backgrounds |

```tsx
// Example usage
<div style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
  <p style={{ color: 'var(--muted-foreground)' }}>Secondary text</p>
</div>
```

### Interactive Elements

| Element | CSS Variable | Usage |
|---------|-------------|--------|
| Border default | `--border` | Default borders |
| Border hover | `--interactive-border-hover` | Hover state borders |
| Border focus | `--interactive-border-focus` | Focused input borders |
| Focus ring | `--ring` | Focus ring color |
| Selection background | `--interactive-selection` | Selected text/items |
| Hover background | `--interactive-hover` | Hover state backgrounds |

```tsx
// Input field example
<input 
  className="border rounded"
  style={{ 
    borderColor: 'var(--border)',
    '--tw-ring-color': 'var(--ring)'
  }}
/>
```

### Primary Actions

| Element | CSS Variable | Usage |
|---------|-------------|--------|
| Primary color | `--primary` | Main brand color, primary buttons |
| Primary text | `--primary-foreground` | Text on primary backgrounds |
| Primary hover | `--primary-hover` | Primary button hover |
| Primary active | `--primary-active` | Primary button pressed |

```tsx
// Primary button
<button 
  style={{ 
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)'
  }}
  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--primary-hover)'}
  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--primary)'}
>
  Click Me
</button>
```

### Status Colors

| Status | Variables | Usage |
|--------|-----------|--------|
| **Success** | | |
| Base | `--status-success` | Success text/icons |
| Background | `--status-success-background` | Success alert backgrounds |
| Foreground | `--status-success-foreground` | Text on success backgrounds |
| Border | `--status-success-border` | Success alert borders |
| **Error** | | |
| Base | `--status-error` | Error text/icons |
| Background | `--status-error-background` | Error alert backgrounds |
| Foreground | `--status-error-foreground` | Text on error backgrounds |
| Border | `--status-error-border` | Error alert borders |
| **Warning** | | |
| Base | `--status-warning` | Warning text/icons |
| Background | `--status-warning-background` | Warning alert backgrounds |
| Foreground | `--status-warning-foreground` | Text on warning backgrounds |
| Border | `--status-warning-border` | Warning alert borders |
| **Info** | | |
| Base | `--status-info` | Info text/icons |
| Background | `--status-info-background` | Info alert backgrounds |
| Foreground | `--status-info-foreground` | Text on info backgrounds |
| Border | `--status-info-border` | Info alert borders |

```tsx
// Status examples
<CheckCircle style={{ color: 'var(--status-success)' }} />
<div style={{ 
  backgroundColor: 'var(--status-error-background)',
  color: 'var(--status-error)',
  borderColor: 'var(--status-error-border)'
}}>
  Error message
</div>
```

## Component-Specific Variables

### Markdown Content

| Element | CSS Variable | Usage |
|---------|-------------|--------|
| Heading 1 | `--markdown-heading1` | # Main headings |
| Heading 2 | `--markdown-heading2` | ## Subheadings |
| Heading 3 | `--markdown-heading3` | ### Section headings |
| Heading 4 | `--markdown-heading4` | #### Minor headings |
| Links | `--markdown-link` | Hyperlinks |
| Link hover | `--markdown-link-hover` | Hyperlink hover state |
| Inline code | `--markdown-inline-code` | `code` text color |
| Inline code bg | `--markdown-inline-code-bg` | `code` background |
| Blockquote | `--markdown-blockquote` | > Quote text |
| Blockquote border | `--markdown-blockquote-border` | Quote left border |
| List markers | `--markdown-list-marker` | Bullet/number color |

### Chat Interface

| Element | CSS Variable | Usage |
|---------|-------------|--------|
| User message text | `--chat-user-message` | User message text |
| User message bg | `--chat-user-message-bg` | User message background |
| Assistant message text | `--chat-assistant-message` | AI message text |
| Assistant message bg | `--chat-assistant-message-bg` | AI message background |
| Timestamp | `--chat-timestamp` | Message timestamps |
| Divider | `--chat-divider` | Message separators |

### Tool Displays

| Element | CSS Variable | Usage |
|---------|-------------|--------|
| Tool background | `--tools-background` | Tool container bg |
| Tool border | `--tools-border` | Tool container border |
| Tool header hover | `--tools-header-hover` | Expandable header hover |
| Tool icon | `--tools-icon` | Tool icons |
| Tool title | `--tools-title` | Tool names |
| Tool description | `--tools-description` | Tool descriptions |

### Diff/Edit Views

| Element | CSS Variable | Usage |
|---------|-------------|--------|
| Added line | `--tools-edit-added` | Added text color |
| Added background | `--tools-edit-added-bg` | Added line background |
| Removed line | `--tools-edit-removed` | Removed text color |
| Removed background | `--tools-edit-removed-bg` | Removed line background |
| Line numbers | `--tools-edit-line-number` | Diff line numbers |

### Syntax Highlighting

| Element | CSS Variable | Usage |
|---------|-------------|--------|
| Background | `--syntax-background` | Code block background |
| Text | `--syntax-foreground` | Default code text |
| Comments | `--syntax-comment` | // Comments |
| Keywords | `--syntax-keyword` | if, const, function |
| Strings | `--syntax-string` | "string values" |
| Numbers | `--syntax-number` | 123, true, false |
| Functions | `--syntax-function` | functionName() |
| Variables | `--syntax-variable` | variableName |
| Types | `--syntax-type` | TypeName, Interface |
| Operators | `--syntax-operator` | +, -, =, => |

### Loading States

| Element | CSS Variable | Usage |
|---------|-------------|--------|
| Spinner color | `--loading-spinner` | Spinner border color |
| Spinner track | `--loading-spinner-track` | Spinner background track |

```tsx
// Loading spinner
<div 
  className="animate-spin border-2 border-t-transparent rounded-full"
  style={{ borderColor: 'var(--loading-spinner)' }}
/>
```

### Sidebar

| Element | CSS Variable | Usage |
|---------|-------------|--------|
| Background | `--sidebar` | Sidebar background |
| Text | `--sidebar-foreground` | Sidebar text |
| Primary | `--sidebar-primary` | Active items |
| Primary text | `--sidebar-primary-foreground` | Active item text |
| Accent | `--sidebar-accent` | Sidebar accents |
| Border | `--sidebar-border` | Sidebar borders |

## Creating New Components

### Step-by-Step Guide

1. **Identify the component type** - Is it informational, interactive, status-related?

2. **Choose appropriate variables**:
   - Use status colors for success/error/warning/info states
   - Use interactive colors for clickable elements
   - Use surface colors for backgrounds
   - Use primary colors for main actions

3. **Apply variables via styles**:
   ```tsx
   // Prefer inline styles for dynamic colors
   <div style={{ color: 'var(--foreground)' }}>
   
   // Or use Tailwind with CSS variables
   <div className="text-[var(--foreground)]">
   ```

4. **Handle hover/focus states**:
   ```tsx
   <button
     style={{ borderColor: 'var(--border)' }}
     onMouseEnter={(e) => {
       e.currentTarget.style.borderColor = 'var(--interactive-border-hover)';
     }}
     onMouseLeave={(e) => {
       e.currentTarget.style.borderColor = 'var(--border)';
     }}
   >
   ```

### Common Patterns

#### Alert/Notification Component
```tsx
function Alert({ type, message }) {
  const styles = {
    success: {
      backgroundColor: 'var(--status-success-background)',
      color: 'var(--status-success)',
      borderColor: 'var(--status-success-border)'
    },
    error: {
      backgroundColor: 'var(--status-error-background)',
      color: 'var(--status-error)',
      borderColor: 'var(--status-error-border)'
    },
    warning: {
      backgroundColor: 'var(--status-warning-background)',
      color: 'var(--status-warning)',
      borderColor: 'var(--status-warning-border)'
    }
  };
  
  return (
    <div className="p-4 rounded border" style={styles[type]}>
      {message}
    </div>
  );
}
```

#### Card Component
```tsx
function Card({ children }) {
  return (
    <div 
      className="p-4 rounded border"
      style={{
        backgroundColor: 'var(--card)',
        color: 'var(--card-foreground)',
        borderColor: 'var(--border)'
      }}
    >
      {children}
    </div>
  );
}
```

#### Button Component
```tsx
function Button({ variant = 'primary', children, onClick }) {
  const variants = {
    primary: {
      backgroundColor: 'var(--primary)',
      color: 'var(--primary-foreground)',
      hoverBg: 'var(--primary-hover)'
    },
    secondary: {
      backgroundColor: 'var(--secondary)',
      color: 'var(--secondary-foreground)',
      hoverBg: 'var(--muted)'
    },
    destructive: {
      backgroundColor: 'var(--destructive)',
      color: 'var(--destructive-foreground)',
      hoverBg: 'var(--status-error)'
    }
  };
  
  const [isHovered, setIsHovered] = useState(false);
  const style = variants[variant];
  
  return (
    <button
      onClick={onClick}
      style={{
        backgroundColor: isHovered ? style.hoverBg : style.backgroundColor,
        color: style.color
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
    </button>
  );
}
```

## Theme File Locations

### Built-in Themes
- **Default themes**: `/src/lib/theme/themes/`
  - `default-dark.ts` - Default dark theme
  - `default-light.ts` - Default light theme
  - `index.ts` - Theme exports

### Custom Theme Storage
- **User themes**: `~/.config/opencode-webui/themes/`
  - JSON files automatically detected
  - Persists across sessions
  - Shareable between installations

### Core Files
- **Type definitions**: `/src/types/theme.ts`
- **CSS generator**: `/src/lib/theme/cssGenerator.ts`
- **Theme provider**: `/src/contexts/ThemeSystemContext.tsx`
- **Theme switcher UI**: `/src/components/ui/ThemeSwitcher.tsx`

### Checking Available Variables

1. **In browser DevTools**:
   - Open DevTools → Elements → Select `<html>` element
   - Look at Styles panel → `:root` section
   - All CSS variables are listed there

2. **In theme files**:
   - Check `/src/lib/theme/themes/default-dark.ts` for dark theme colors
   - Check `/src/lib/theme/themes/default-light.ts` for light theme colors

3. **In CSS generator**:
   - Check `/src/lib/theme/cssGenerator.ts` to see how variables are generated
   - Look at `generateTailwindVariables()` for standard UI colors
   - Look at component-specific generation methods

## Theme Management

### Available Themes

OpenCode WebUI includes a curated collection of **built-in themes**:

- **All themes** are bundled with the application
- **Light variants**: Default Light, GitHub Light, Ayu Light, Catppuccin Light, and more
- **Dark variants**: Default Dark, Dracula, Gruvbox Dark, Nord, Monokai, and more
- **Cannot be deleted** - themes are part of the application
- **Always available** - no external files required

### Switching Themes

1. Click the theme switcher icon (palette icon) in the header
2. Toggle "Use System Theme" to follow OS preference, or select a specific theme
3. Choose from Light or Dark theme categories
4. Theme applies instantly without reload

### System Theme Preference

Enable "Use System Theme" to automatically switch between light and dark variants based on your operating system's appearance settings.

## Adding New Themes (Developers)

### Theme Structure

To add a new theme to the application, create a TypeScript file in `/src/lib/theme/themes/`:

```typescript
// my-theme-dark.ts
import type { Theme } from '@/types/theme';

export const myThemeDark: Theme = {
  metadata: {
    id: "my-theme-dark",
    name: "My Theme Dark",
    description: "A new dark theme",
    "author": "Your Name",
    "version": "1.0.0",
    "variant": "dark",  // or "light"
    "tags": ["custom", "warm"]
  },
  "colors": {
    "primary": {
      "base": "#0066cc",
      "hover": "#0052a3",
      "active": "#004080",
      "foreground": "#ffffff"
    },
    "surface": {
      "background": "#1a1a1a",
      "foreground": "#e0e0e0",
      "muted": "#2a2a2a",
      "mutedForeground": "#a0a0a0",
      "elevated": "#333333",
      "elevatedForeground": "#e5e5e5",
      "overlay": "#00000080",
      "subtle": "#404040"
    },
    "interactive": {
      "border": "#404040",
      "borderHover": "#505050",
      "borderFocus": "#0066cc",
      "selection": "#0066cc30",
      "selectionForeground": "#e0e0e0",
      "focus": "#0066cc",
      "focusRing": "#0066cc50",
      "cursor": "#0066cc",
      "hover": "#2a2a2a",
      "active": "#333333"
    },
    "status": {
      "error": "#ff4444",
      "errorForeground": "#ffffff",
      "errorBackground": "#ff444420",
      "errorBorder": "#ff444450",
      
      "warning": "#ffaa00",
      "warningForeground": "#000000",
      "warningBackground": "#ffaa0020",
      "warningBorder": "#ffaa0050",
      
      "success": "#00aa00",
      "successForeground": "#ffffff",
      "successBackground": "#00aa0020",
      "successBorder": "#00aa0050",
      
      "info": "#0088ff",
      "infoForeground": "#ffffff",
      "infoBackground": "#0088ff20",
      "infoBorder": "#0088ff50"
    },
    "syntax": {
      "base": {
        "background": "#1e1e1e",
        "foreground": "#d4d4d4",
        "comment": "#6a9955",
        "keyword": "#569cd6",
        "string": "#ce9178",
        "number": "#b5cea8",
        "function": "#dcdcaa",
        "variable": "#9cdcfe",
        "type": "#4ec9b0",
        "operator": "#d4d4d4"
      }
    }
  }
}
```

### Minimal Theme

You only need ~25 colors for a complete theme. The system generates the rest through inheritance:

```json
{
  "metadata": {
    "id": "minimal-dark",
    "name": "Minimal Dark",
    "variant": "dark"
  },
  "colors": {
    "primary": {
      "base": "#007acc",
      "foreground": "#ffffff"
    },
    "surface": {
      "background": "#1e1e1e",
      "foreground": "#cccccc",
      "muted": "#252526",
      "mutedForeground": "#999999",
      "elevated": "#2d2d30",
      "elevatedForeground": "#cccccc",
      "overlay": "#00000080",
      "subtle": "#3e3e42"
    },
    "interactive": {
      "border": "#464647",
      "borderHover": "#595959",
      "borderFocus": "#007acc",
      "selection": "#007acc30",
      "selectionForeground": "#cccccc",
      "focus": "#007acc",
      "focusRing": "#007acc50",
      "cursor": "#007acc",
      "hover": "#2a2d2e",
      "active": "#094771"
    },
    "status": {
      "error": "#f48771",
      "errorForeground": "#ffffff",
      "errorBackground": "#f4877120",
      "errorBorder": "#f4877150",
      "warning": "#ffcc00",
      "warningForeground": "#000000",
      "warningBackground": "#ffcc0020",
      "warningBorder": "#ffcc0050",
      "success": "#89d185",
      "successForeground": "#000000",
      "successBackground": "#89d18520",
      "successBorder": "#89d18550",
      "info": "#75beff",
      "infoForeground": "#ffffff",
      "infoBackground": "#75beff20",
      "infoBorder": "#75beff50"
    },
    "syntax": {
      "base": {
        "background": "#1e1e1e",
        "foreground": "#d4d4d4",
        "comment": "#6a9955",
        "keyword": "#569cd6",
        "string": "#ce9178",
        "number": "#b5cea8",
        "function": "#dcdcaa",
        "variable": "#9cdcfe",
        "type": "#4ec9b0",
        "operator": "#d4d4d4"
      }
    }
  }
}
```

### Theme Creation Steps

1. **Create theme file**: Add a new TypeScript file in `/src/lib/theme/themes/my-theme-dark.ts`
2. **Define theme object**: Follow the existing theme structure (see other themes for reference)
3. **Export theme**: Export the theme as a named constant
4. **Register in index**: Add your theme to `/src/lib/theme/themes/index.ts`:
   ```typescript
   import { myThemeDark } from './my-theme-dark';

   export const themes: Theme[] = [
     // ... existing themes
     myThemeDark,
   ];
   ```
5. **Test**: Run the app and verify your theme appears in the theme switcher

### Theme Creation Tips

1. **Copy existing theme**: Start with a similar theme and modify colors
2. **Test both variants**: Create light/dark versions for consistency
3. **Use color tools**: Tools like [coolors.co](https://coolors.co) for palettes
4. **Check accessibility**: Verify WCAG contrast ratios
5. **Be consistent**: Use similar hues for related elements

## Best Practices

### DO ✅
- Use semantic variables (`--status-error` not `--red`)
- Test components with both light and dark themes
- Use hover/focus state variables for interactions
- Apply variables via inline styles for dynamic colors
- Group related colors (all status colors together)

### DON'T ❌
- Hardcode hex colors (`#ff0000`)
- Use Tailwind color classes (`text-red-500`)
- Mix semantic systems (don't use `--status-error` for non-error states)
- Create one-off color variables for single components
- Use dark: prefixes (`dark:bg-gray-800`)

## Testing Your Components

1. **Switch themes** - Test with Default Dark and Default Light themes
2. **Check contrast** - Ensure text is readable on all backgrounds
3. **Test states** - Verify hover, focus, active states work
4. **Try different themes** - Test with various built-in themes (Dracula, Gruvbox, Nord, etc.)

## Adding New Theme Variables

If you need a new color variable:

1. **Add to theme type** (`/src/types/theme.ts`):
   ```typescript
   interface Theme {
     colors: {
       myComponent?: {
         background?: string;
         foreground?: string;
       }
     }
   }
   ```

2. **Add to CSS generator** (`/src/lib/theme/cssGenerator.ts`):
   ```typescript
   if (theme.colors.myComponent) {
     vars.push(`--my-component-bg: ${theme.colors.myComponent.background}`);
   }
   ```

3. **Add to theme definitions** (`/src/lib/theme/themes/*.ts`):
   ```typescript
   myComponent: {
     background: '#...',
     foreground: '#...'
   }
   ```

## Quick Decision Tree

**Q: What color should I use for...?**

- **Main content?** → `--foreground` on `--background`
- **Secondary content?** → `--muted-foreground` on `--muted`
- **Error message?** → `--status-error` with `--status-error-background`
- **Success indicator?** → `--status-success`
- **Primary button?** → `--primary` with `--primary-foreground`
- **Input border?** → `--border`, `--interactive-border-focus` on focus
- **Link?** → `--markdown-link` or `--primary`
- **Code?** → `--syntax-*` variables for syntax highlighting
- **Loading spinner?** → `--loading-spinner`
- **Card/Modal?** → `--card` with `--card-foreground`

## Migration Checklist

When updating an existing component:

- [ ] Remove all hardcoded colors (`#xxx`, `rgb()`)
- [ ] Remove all Tailwind color classes (`text-red-500`, `bg-blue-100`)
- [ ] Remove all `dark:` prefixes
- [ ] Replace with appropriate CSS variables
- [ ] Test with both light and dark themes
- [ ] Check hover/focus states
- [ ] Verify contrast ratios

---

*This guide is a living document. Update it when adding new theme variables or patterns.*