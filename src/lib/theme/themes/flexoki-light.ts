import type { Theme } from '@/types/theme';

/**
 * Flexoki Light Theme
 * An inky color scheme for prose and code
 * https://github.com/kepano/flexoki
 *
 * Usage Notes:
 * - All color variables defined here are actively used in OpenChamber
 * - Primary, surface, interactive, status colors → CSS variables via cssGenerator.ts
 * - Syntax colors → Prism syntax highlighting via syntaxThemeGenerator.ts
 * - Markdown/chat/tools → Component styling and CSS variables
 * - syntax.highlights.* → Used directly in code (no CSS var mapping)
 * - Additional fallback variables (markdown.bold, chat.background, etc.) auto-generated in cssGenerator.ts
 */
export const flexokiLightTheme: Theme = {
  metadata: {
    id: 'flexoki-light',
    name: 'Flexoki Light',
    description: 'An inky color scheme for prose and code - light variant',
    author: 'Steph Ango',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'warm', 'natural', 'paper']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#EC8B49',           // Send button, hyperlinks, selected sidebar item, active tab underline
      hover: '#F9AE77',          // Send button when mouse over, link when hovering
      active: '#DA702C',         // Send button while clicking, pressed down state
      foreground: '#FFFCF0',     // "Send" text on button, white text on colored badge
      muted: '#EC8B4980',        // Grayed-out button when can't send (empty input), faded accent lines
      emphasis: '#F9AE77'        // "New" badge highlight, unread message dot, attention marker
    },

    surface: {
      background: '#FFFCF0',     // Main page background, assistant bubbles, sidebars
      foreground: '#100F0F',     // Main text color, message content, headings
      muted: '#F2F0E5',          // User message bubbles, input boxes, inactive tabs
      mutedForeground: '#6F6E69', // Timestamps "2 min ago", file sizes "2.4 MB", captions
      elevated: '#E6E4D9',       // Settings dialogs, dropdown menus, tooltips
      elevatedForeground: '#100F0F', // Text in dialogs and menus
      overlay: '#100F0F20',      // Backdrop dimming behind modal dialogs
      subtle: '#DAD8CE'          // Subtle row hovers, light section dividers
    },

    interactive: {
      border: '#DAD8CE',         // Input borders, card edges, divider lines
      borderHover: '#CECDC3',    // Border color on hover
      borderFocus: '#EC8B49',    // Border when input focused/active
      selection: '#100F0F44',    // Text selection highlight background
      selectionForeground: '#100F0F', // Selected text color
      focus: '#EC8B49',          // Focus indicator color
      focusRing: '#EC8B4940',    // Focus ring glow (keyboard navigation)
      cursor: '#100F0F',         // Text input cursor |
      hover: '#DAD8CE',          // List/row hover background
      active: '#CECDC3'          // Active/pressed item background
    },

    status: {
      error: '#AF3029',          // "Error: Failed to send" message, Delete button text, red X icon
      errorForeground: '#FFFCF0', // White text on red error banner
      errorBackground: '#D14D4120', // Pink box behind error message, failed upload alert background
      errorBorder: '#D14D4150',  // Red border around error alert box

      warning: '#BC5215',        // "Warning: Large file" text, caution triangle icon
      warningForeground: '#FFFCF0', // White text on orange warning banner
      warningBackground: '#DA702C20', // Orange box behind warning, "Unsaved changes" alert background
      warningBorder: '#DA702C50', // Orange border around warning box

      success: '#66800B',        // "Message sent successfully" text, green checkmark icon
      successForeground: '#FFFCF0', // White text on green success banner
      successBackground: '#879A3920', // Green box behind "Saved!" message, confirmation background
      successBorder: '#879A3950', // Green border around success alert

      info: '#205EA6',           // "Pro tip:" text, blue info icon, help badge
      infoForeground: '#FFFCF0', // White text on blue info banner
      infoBackground: '#4385BE20', // Blue box behind helpful tip, info tooltip background
      infoBorder: '#4385BE50'    // Blue border around info box
    },

    // Syntax highlighting - Flexoki colors
    syntax: {
      base: {
        background: '#F2F0E5',   // Gray box behind ```python code```, terminal command background
        foreground: '#100F0F',   // Regular code text like 'print' or 'hello'
        comment: '#6F6E69',      // Gray text after // or # in code, explanatory notes
        keyword: '#66800B',      // Green words: if, for, while, def, class, return
        string: '#24837B',       // Cyan text in quotes: "hello world" or 'filename.txt'
        number: '#5E409D',       // Purple digits: 42, 3.14, 0xFF
        function: '#BC5215',     // Orange function names: print(), getUserData(), onClick()
        variable: '#100F0F',     // Black variable names: userName, count, data
        type: '#AD8301',         // Yellow types: String, Array, CustomClass, interface
        operator: '#AF3029'      // Red symbols: +, -, =, ==, &&, ||
      },

      tokens: {
        commentDoc: '#B7B5AC',        // JSDoc/docstring comments in code
        stringEscape: '#205EA6',      // Escape sequences \n \t in strings
        keywordImport: '#AF3029',     // import/from/require keywords
        functionCall: '#BC5215',      // Function calls console.log(), myFunc()
        variableProperty: '#205EA6',  // Object properties obj.prop, this.value
        className: '#AD8301',         // Class names in definitions/usage
        punctuation: '#6F6E69',       // Brackets, commas, semicolons
        tag: '#205EA6',               // HTML/JSX tag names <div>, <Component>
        tagAttribute: '#AD8301',      // HTML attributes class="", onClick=
        tagAttributeValue: '#24837B', // Attribute values in quotes
        boolean: '#AD8301',           // true/false values
        namespace: '#AD8301',         // Namespaces, modules
        decorator: '#AD8301',         // @decorator syntax
        method: '#66800B'             // Method names obj.method()
      },

      highlights: {
        diffAdded: '#66800B',         // Git diff + added lines (used directly, no CSS var)
        diffAddedBackground: '#879A3920', // Background for added lines
        diffRemoved: '#AF3029',       // Git diff - removed lines (used directly)
        diffRemovedBackground: '#D14D4120', // Background for removed lines
        diffModified: '#205EA6',      // Modified file indicators (used directly)
        diffModifiedBackground: '#4385BE20', // Background for modified sections
        lineNumber: '#CECDC3',        // Code editor line numbers (used directly)
        lineNumberActive: '#100F0F'   // Active line number highlight
      }
    },

    markdown: {
      heading1: '#AD8301',       // Large heading "# Installation Guide" at top of response
      heading2: '#BC5215',       // Medium heading "## Step 1: Setup" in message
      heading3: '#205EA6',       // Small heading "### Prerequisites" in text
      heading4: '#100F0F',       // Tiny headings "#### Note" in documentation
      link: '#205EA6',           // Blue clickable [link text](url) in chat messages
      linkHover: '#4385BE',      // Link color when hovering mouse over it
      inlineCode: '#24837B',     // Cyan `variable_name` or `npm install` in text
      inlineCodeBackground: '#F2F0E5', // Gray box behind `code` word
      blockquote: '#6F6E69',     // Gray "> quoted text" or indented quote
      blockquoteBorder: '#DAD8CE', // Vertical line on left of quoted text block
      listMarker: '#AD830199'    // Dots • or numbers 1. 2. 3. in bullet lists
    },

    chat: {
      userMessage: '#100F0F',    // User message text color in chat
      userMessageBackground: '#F2F0E5', // User message bubble background
      assistantMessage: '#100F0F', // Assistant message text color in chat
      assistantMessageBackground: '#FFFCF0', // Assistant message bubble background
      timestamp: '#6F6E69',      // Message timestamps "3:45 PM", date labels "Today"
      divider: '#DAD8CE'         // Lines between messages, section separators
    },

    tools: {
      background: '#F2F0E550',   // Light box behind terminal output, bash command results
      border: '#DAD8CE80',       // Border around tool result boxes, command output edges
      headerHover: '#DAD8CE',    // Tool header bar brightens when mouse over
      icon: '#6F6E69',           // Small wrench/tool icons, status indicators
      title: '#100F0F',          // "Terminal Output" heading, "File Created" title
      description: '#6F6E69',    // Gray text explaining tool result, parameter details

      edit: {
        added: '#66800B',        // Green + lines showing new code added (like git diff)
        addedBackground: '#879A3920', // Light green behind + added lines
        removed: '#AF3029',      // Red - lines showing deleted code
        removedBackground: '#D14D4120', // Light red behind - removed lines
        lineNumber: '#CECDC3'    // Gray numbers "1 2 3" on left of code editor
      }
    }
  },

  config: {
    fonts: {
      sans: '"IBM Plex Mono", monospace',
      mono: '"IBM Plex Mono", monospace',
      heading: '"IBM Plex Mono", monospace'
    },

    radius: {
      none: '0',
      sm: '0.125rem',
      md: '0.375rem',
      lg: '0.5rem',
      xl: '0.75rem',
      full: '9999px'
    },

    transitions: {
      fast: '150ms ease',
      normal: '250ms ease',
      slow: '350ms ease'
    }
  }
};
