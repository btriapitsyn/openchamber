import type { Theme } from '@/types/theme';

/**
 * Flexoki Dark Theme
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
export const flexokiDarkTheme: Theme = {
  metadata: {
    id: 'flexoki-dark',
    name: 'Flexoki Dark',
    description: 'An inky color scheme for prose and code - dark variant',
    author: 'Steph Ango',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'warm', 'natural', 'ink']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#EC8B49',           // Send button, hyperlinks, selected sidebar item, active tab underline
      hover: '#DA702C',          // Send button when mouse over, link when hovering
      active: '#F9AE77',         // Send button while clicking, pressed down state
      foreground: '#100F0F',     // "Send" text on button, white text on colored badge
      muted: '#EC8B4980',        // Grayed-out button when can't send (empty input), faded accent lines
      emphasis: '#F9AE77'        // "New" badge highlight, unread message dot, attention marker
    },

    surface: {
      background: '#100F0F',     // Main page background, assistant bubbles, sidebars
      foreground: '#CECDC3',     // Main text color, message content, headings
      muted: '#1C1B1A',          // User message bubbles, input boxes, inactive tabs
      mutedForeground: '#878580', // Timestamps "2 min ago", file sizes "2.4 MB", captions
      elevated: '#282726',       // Settings dialogs, dropdown menus, tooltips
      elevatedForeground: '#CECDC3', // Text in dialogs and menus
      overlay: '#00000080',      // Backdrop dimming behind modal dialogs
      subtle: '#343331'          // Subtle row hovers, light section dividers
    },

    interactive: {
      border: '#343331',         // Input borders, card edges, divider lines
      borderHover: '#403E3C',    // Border color on hover
      borderFocus: '#EC8B49',    // Border when input focused/active
      selection: '#CECDC330',    // Text selection highlight background
      selectionForeground: '#CECDC3', // Selected text color
      focus: '#EC8B49',          // Focus indicator color
      focusRing: '#EC8B4950',    // Focus ring glow (keyboard navigation)
      cursor: '#CECDC3',         // Text input cursor |
      hover: '#343331',          // List/row hover background
      active: '#403E3C'          // Active/pressed item background
    },

    status: {
      error: '#D14D41',          // "Error: Failed to send" message, Delete button text, red close icon
      errorForeground: '#100F0F', // White text on red error banner
      errorBackground: '#AF302920', // Pink box behind error message, failed upload alert background
      errorBorder: '#AF302950',  // Red border around error alert box

      warning: '#DA702C',        // "Alert: Large file" text, caution triangle icon
      warningForeground: '#100F0F', // White text on orange warning banner
      warningBackground: '#BC521520', // Orange box behind warning, "Unsaved changes" alert background
      warningBorder: '#BC521550', // Orange border around warning box

      success: '#A0AF54',        // "Message sent successfully" text, green checkmark icon
      successForeground: '#100F0F', // White text on green success banner
      successBackground: '#66800B20', // Green box behind "Saved!" message, confirmation background
      successBorder: '#66800B50', // Green border around success alert

      info: '#4385BE',           // "Pro tip:" text, blue info icon, help badge
      infoForeground: '#100F0F', // White text on blue info banner
      infoBackground: '#205EA620', // Blue box behind helpful tip, info tooltip background
      infoBorder: '#205EA650'    // Blue border around info box
    },

    // Syntax highlighting - Flexoki colors
    syntax: {
      base: {
        background: '#1C1B1A',   // Gray box behind ```python code```, terminal command background
        foreground: '#CECDC3',   // Regular code text like 'print' or 'hello'
        comment: '#878580',      // Gray text after // or # in code, explanatory notes
        keyword: '#879A39',      // Green words: if, for, while, def, class, return
        string: '#3AA99F',       // Cyan text in quotes: "hello world" or 'filename.txt'
        number: '#8B7EC8',       // Purple digits: 42, 3.14, 0xFF
        function: '#DA702C',     // Orange function names: print(), getUserData(), onClick()
        variable: '#CECDC3',     // Light variable names: userName, count, data
        type: '#D0A215',         // Yellow types: String, Array, CustomClass, interface
        operator: '#D14D41'      // Red symbols: +, -, =, ==, &&, ||
      },

      tokens: {
        commentDoc: '#575653',        // JSDoc/docstring comments in code
        stringEscape: '#4385BE',      // Escape sequences \n \t in strings
        keywordImport: '#D14D41',     // import/from/require keywords
        functionCall: '#DA702C',      // Function calls console.log(), myFunc()
        variableProperty: '#4385BE',  // Object properties obj.prop, this.value
        className: '#D0A215',         // Class names in definitions/usage
        punctuation: '#878580',       // Brackets, commas, semicolons
        tag: '#4385BE',               // HTML/JSX tag names <div>, <Component>
        tagAttribute: '#D0A215',      // HTML attributes class="", onClick=
        tagAttributeValue: '#3AA99F', // Attribute values in quotes
        boolean: '#D0A215',           // true/false values
        namespace: '#D0A215',         // Namespaces, modules
        decorator: '#D0A215',         // @decorator syntax
        method: '#879A39'             // Method names obj.method()
      },

      highlights: {
        diffAdded: '#879A39',         // Git diff + added lines (used directly, no CSS var)
        diffAddedBackground: '#66800B20', // Background for added lines
        diffRemoved: '#D14D41',       // Git diff - removed lines (used directly)
        diffRemovedBackground: '#AF302920', // Background for removed lines
        diffModified: '#4385BE',      // Modified file indicators (used directly)
        diffModifiedBackground: '#205EA620', // Background for modified sections
        lineNumber: '#403E3C',        // Code editor line numbers (used directly)
        lineNumberActive: '#CECDC3'   // Active line number highlight
      }
    },

    markdown: {
      heading1: '#D0A215',       // Large heading "# Installation Guide" at top of response
      heading2: '#DA702C',       // Medium heading "## Step 1: Setup" in message
      heading3: '#4385BE',       // Small heading "### Prerequisites" in text
      heading4: '#CECDC3',       // Tiny headings "#### Note" in documentation
      link: '#4385BE',           // Blue clickable [link text](url) in chat messages
      linkHover: '#205EA6',      // Link color when hovering mouse over it
      inlineCode: '#A0AF54',     // Cyan `variable_name` or `npm install` in text
      inlineCodeBackground: '#1C1B1A', // Gray box behind `code` word
      blockquote: '#878580',     // Gray "> quoted text" or indented quote
      blockquoteBorder: '#343331', // Vertical line on left of quoted text block
      listMarker: '#D0A21599'    // Dots • or numbers 1. 2. 3. in bullet lists
    },

    chat: {
      userMessage: '#CECDC3',    // User message text color in chat
      userMessageBackground: '#282726', // User message bubble background
      assistantMessage: '#CECDC3', // Assistant message text color in chat
      assistantMessageBackground: '#100F0F', // Assistant message bubble background
      timestamp: '#878580',      // Message timestamps "3:45 PM", date labels "Today"
      divider: '#343331'         // Lines between messages, section separators
    },

    tools: {
      background: '#1C1B1A50',   // Light box behind terminal output, bash command results
      border: '#34333180',       // Border around tool result boxes, command output edges
      headerHover: '#34333150',  // Tool header bar brightens when mouse over
      icon: '#878580',           // Small wrench/tool icons, status indicators
      title: '#CECDC3',          // "RiTerminalBoxLine Output" heading, "RiFileLine Created" title
      description: '#878580',    // Gray text explaining tool result, parameter details

      edit: {
        added: '#879A39',        // Green + lines showing new code added (like git diff)
        addedBackground: '#66800B20', // Light green behind + added lines
        removed: '#D14D41',      // Red - lines showing deleted code
        removedBackground: '#AF302920', // Light red behind - removed lines
        lineNumber: '#403E3C'    // Gray numbers "1 2 3" on left of code editor
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
