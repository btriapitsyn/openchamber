# OpenCode WebUI Theming System

## Overview

This document outlines a comprehensive, centralized theming system for the OpenCode WebUI. The system provides semantic color definitions, component-specific theming, and a flexible inheritance model that ensures consistency while allowing detailed customization.

## Core Principles

1. **Semantic Color Definitions**: Colors are defined by their purpose, not their values
2. **Component Grouping**: Related UI elements share consistent theming
3. **Inheritance Model**: Components can inherit from core semantics with overrides
4. **Type Safety**: Full TypeScript support for theme definitions
5. **Runtime Flexibility**: Themes can be switched without rebuilding
6. **Accessibility First**: Contrast ratios and WCAG compliance built-in

## Theme Definition Structure

### Complete Type Definition

```typescript
interface Theme {
  metadata: {
    id: string;
    name: string;
    description: string;
    author: string;
    version: string;
    variant: 'light' | 'dark';
    tags: string[]; // e.g., ['desert', 'warm', 'high-contrast', 'colorblind-safe']
    wcagCompliance?: {
      AA: boolean;
      AAA: boolean;
    };
  };
  
  colors: {
    // =================================================================
    // CORE SEMANTIC COLORS (Required)
    // =================================================================
    
    primary: {
      base: string;           // Main brand color
      hover: string;          // Hover state
      active: string;         // Active/pressed state
      foreground: string;     // Text on primary background
      muted: string;          // Muted variant
      emphasis: string;       // High emphasis variant
    };
    
    surface: {
      background: string;         // Main app background
      foreground: string;         // Main text color
      muted: string;             // Secondary background
      mutedForeground: string;   // Secondary text
      elevated: string;          // Cards, elevated surfaces
      elevatedForeground: string; // Text on elevated surfaces
      overlay: string;           // Modal overlays
      subtle: string;            // Very subtle background
    };
    
    interactive: {
      border: string;
      borderHover: string;
      borderFocus: string;
      selection: string;
      selectionForeground: string;
      focus: string;
      focusRing: string;
      cursor: string;
      hover: string;
      active: string;
    };
    
    status: {
      error: string;
      errorForeground: string;
      errorBackground: string;
      errorBorder: string;
      
      warning: string;
      warningForeground: string;
      warningBackground: string;
      warningBorder: string;
      
      success: string;
      successForeground: string;
      successBackground: string;
      successBorder: string;
      
      info: string;
      infoForeground: string;
      infoBackground: string;
      infoBorder: string;
    };
    
    // =================================================================
    // SYNTAX HIGHLIGHTING (Minimal required + semantic inheritance)
    // =================================================================
    
    syntax: {
      // REQUIRED: Core semantic colors for syntax
      // These 8-10 colors can generate a complete syntax theme
      base: {
        background: string;           // Code block background
        foreground: string;           // Default text/punctuation
        comment: string;              // Comments (muted)
        keyword: string;              // Keywords & control flow
        string: string;               // Strings & char literals
        number: string;               // Numbers & constants
        function: string;             // Functions & methods
        variable: string;             // Variables & properties
        type: string;                 // Types & classes
        operator: string;             // Operators
      };
      
      // OPTIONAL: Override specific tokens (all inherit from base)
      // If not specified, intelligent defaults apply
      tokens?: {
        // Comments
        comment?: string;                    // inherit:syntax.base.comment
        commentDoc?: string;                 // inherit:syntax.base.comment:lighten(10)
        
        // Strings
        string?: string;                     // inherit:syntax.base.string
        stringEscape?: string;               // inherit:syntax.base.string:darken(20)
        stringInterpolation?: string;        // inherit:syntax.base.variable
        stringRegex?: string;                // inherit:syntax.base.string:hue(+15)
        
        // Keywords
        keyword?: string;                    // inherit:syntax.base.keyword
        keywordControl?: string;             // inherit:syntax.base.keyword
        keywordOperator?: string;            // inherit:syntax.base.operator
        keywordImport?: string;              // inherit:syntax.base.keyword:lighten(10)
        keywordReturn?: string;              // inherit:syntax.base.keyword:emphasis
        
        // Functions
        function?: string;                   // inherit:syntax.base.function
        functionCall?: string;               // inherit:syntax.base.function:lighten(5)
        functionBuiltin?: string;            // inherit:syntax.base.function:darken(10)
        method?: string;                     // inherit:syntax.base.function
        methodCall?: string;                 // inherit:syntax.base.function:lighten(5)
        
        // Variables
        variable?: string;                   // inherit:syntax.base.variable
        variableBuiltin?: string;            // inherit:syntax.base.variable:emphasis
        variableProperty?: string;           // inherit:syntax.base.variable:lighten(10)
        variableReadonly?: string;           // inherit:syntax.base.number
        parameter?: string;                  // inherit:syntax.base.variable:italic
        
        // Types
        type?: string;                       // inherit:syntax.base.type
        typePrimitive?: string;              // inherit:syntax.base.type:darken(10)
        typeInterface?: string;              // inherit:syntax.base.type
        className?: string;                  // inherit:syntax.base.type:emphasis
        enum?: string;                       // inherit:syntax.base.type
        
        // Literals
        number?: string;                     // inherit:syntax.base.number
        boolean?: string;                    // inherit:syntax.base.number
        null?: string;                       // inherit:syntax.base.number:muted
        constant?: string;                   // inherit:syntax.base.number
        
        // Operators & Punctuation
        operator?: string;                   // inherit:syntax.base.operator
        punctuation?: string;                // inherit:syntax.base.foreground:muted(30)
        delimiter?: string;                  // inherit:syntax.base.foreground:muted(20)
        bracket?: string;                    // inherit:syntax.base.foreground
        
        // Markup (HTML/JSX/TSX)
        tag?: string;                        // inherit:syntax.base.keyword
        tagAttribute?: string;               // inherit:syntax.base.variable
        tagAttributeValue?: string;          // inherit:syntax.base.string
        tagBracket?: string;                 // inherit:syntax.base.foreground:muted(20)
        
        // Decorators
        decorator?: string;                  // inherit:syntax.base.function:italic
        annotation?: string;                 // inherit:syntax.base.function:italic
        
        // Namespaces
        namespace?: string;                  // inherit:syntax.base.type:muted(20)
        module?: string;                     // inherit:syntax.base.type:muted(20)
      };
      
      // OPTIONAL: Language-specific overrides
      languages?: {
        // JSON tokens
        json?: {
          key?: string;                      // inherit:syntax.base.variable
          string?: string;                    // inherit:syntax.base.string
          number?: string;                    // inherit:syntax.base.number
          boolean?: string;                   // inherit:syntax.base.number
          null?: string;                      // inherit:syntax.base.number:muted
        };
        
        // YAML tokens
        yaml?: {
          key?: string;                      // inherit:syntax.base.type
          string?: string;                    // inherit:syntax.base.string
          number?: string;                    // inherit:syntax.base.number
          boolean?: string;                   // inherit:syntax.base.number
          anchor?: string;                    // inherit:syntax.base.function
        };
        
        // Markdown in code
        markdown?: {
          heading?: string;                  // inherit:syntax.base.keyword:emphasis
          bold?: string;                     // inherit:syntax.base.foreground:bold
          italic?: string;                   // inherit:syntax.base.foreground:italic
          link?: string;                     // inherit:primary.base
          code?: string;                     // inherit:syntax.base.string
          list?: string;                     // inherit:syntax.base.operator
        };
        
        // Shell/Bash
        shell?: {
          command?: string;                  // inherit:syntax.base.function
          variable?: string;                 // inherit:syntax.base.variable
          operator?: string;                 // inherit:syntax.base.operator
          prompt?: string;                   // inherit:primary.base
        };
        
        // CSS
        css?: {
          selector?: string;                 // inherit:syntax.base.function
          property?: string;                 // inherit:syntax.base.variable
          value?: string;                    // inherit:syntax.base.string
          unit?: string;                     // inherit:syntax.base.number
          atRule?: string;                   // inherit:syntax.base.keyword
        };
      };
      
      // OPTIONAL: Special highlights (inherit from status colors)
      highlights?: {
        // Diff colors
        diffAdded?: string;                  // inherit:status.success
        diffAddedBackground?: string;        // inherit:status.successBackground
        diffRemoved?: string;                // inherit:status.error
        diffRemovedBackground?: string;      // inherit:status.errorBackground
        diffModified?: string;               // inherit:status.info
        diffModifiedBackground?: string;     // inherit:status.infoBackground
        diffHeader?: string;                 // inherit:syntax.base.comment:emphasis
        
        // Editor highlights
        selection?: string;                  // inherit:interactive.selection
        lineHighlight?: string;              // inherit:surface.muted@10%
        lineNumber?: string;                 // inherit:surface.mutedForeground@40%
        lineNumberActive?: string;           // inherit:surface.mutedForeground
        
        // Error/Warning highlights
        error?: string;                      // inherit:status.error
        errorBackground?: string;            // inherit:status.errorBackground
        warning?: string;                    // inherit:status.warning
        warningBackground?: string;          // inherit:status.warningBackground
        
        // Special
        invalid?: string;                    // inherit:status.error
        deprecated?: string;                 // inherit:surface.mutedForeground:strikethrough
      };
    };
    
    // =================================================================
    // COMPONENT-SPECIFIC COLORS (Optional with inheritance)
    // =================================================================
    
    // HEADER & NAVIGATION
    header?: {
      background?: string;        // inherit:surface.background
      foreground?: string;        // inherit:surface.foreground
      logoTint?: string;          // inherit:primary.base
      divider?: string;           // inherit:interactive.border
      badge?: string;             // inherit:status.error
      badgeText?: string;         // inherit:status.errorForeground
    };
    
    // SIDEBAR
    sidebar?: {
      background?: string;        // inherit:surface.muted
      foreground?: string;        // inherit:surface.mutedForeground
      hover?: string;             // inherit:interactive.hover
      active?: string;            // inherit:primary.base
      activeForeground?: string;  // inherit:primary.foreground
      border?: string;            // inherit:interactive.border
      groupHeader?: string;       // inherit:surface.mutedForeground
    };
    
    // CHAT INTERFACE
    chat?: {
      userMessage?: string;              // inherit:surface.foreground
      userMessageBackground?: string;    // inherit:surface.elevated
      assistantMessage?: string;         // inherit:surface.foreground
      assistantMessageBackground?: string; // inherit:surface.muted
      timestamp?: string;                // inherit:surface.mutedForeground
      divider?: string;                  // inherit:interactive.border
      typing?: string;                   // inherit:surface.mutedForeground
    };
    
    // MARKDOWN RENDERING
    markdown?: {
      heading1?: string;              // inherit:primary.base
      heading2?: string;              // inherit:primary.base@90%
      heading3?: string;              // inherit:primary.base@80%
      heading4?: string;              // inherit:surface.foreground
      link?: string;                  // inherit:primary.base
      linkHover?: string;             // inherit:primary.hover
      inlineCode?: string;            // inherit:syntax.string
      inlineCodeBackground?: string;  // inherit:surface.subtle
      blockquote?: string;            // inherit:surface.mutedForeground
      blockquoteBorder?: string;      // inherit:interactive.border
      listMarker?: string;            // inherit:primary.base@60%
      bold?: string;                  // inherit:surface.foreground
      italic?: string;                // inherit:surface.foreground@90%
      strikethrough?: string;         // inherit:surface.mutedForeground
      hr?: string;                    // inherit:interactive.border
    };
    
    // TOOL DISPLAYS
    tools?: {
      // General tool UI
      background?: string;            // inherit:surface.muted@20%
      border?: string;                // inherit:interactive.border@30%
      headerHover?: string;           // inherit:surface.muted@30%
      icon?: string;                  // inherit:surface.mutedForeground
      title?: string;                 // inherit:surface.foreground
      description?: string;           // inherit:surface.mutedForeground@60%
      
      // Edit tool specific
      edit?: {
        added?: string;               // inherit:status.success
        addedBackground?: string;     // inherit:status.successBackground
        removed?: string;             // inherit:status.error
        removedBackground?: string;   // inherit:status.errorBackground
        modified?: string;            // inherit:status.info
        modifiedBackground?: string;  // inherit:status.infoBackground
        lineNumber?: string;          // inherit:surface.mutedForeground@60%
      };
      
      // Bash/terminal tool
      bash?: {
        prompt?: string;              // inherit:primary.base
        output?: string;              // inherit:surface.foreground
        error?: string;               // inherit:status.error
        command?: string;             // inherit:syntax.function
      };
      
      // LSP diagnostics
      lsp?: {
        error?: string;               // inherit:status.error
        warning?: string;             // inherit:status.warning
        info?: string;                // inherit:status.info
        hint?: string;                // inherit:surface.mutedForeground
      };
    };
    
    // FORMS & INPUTS
    forms?: {
      inputBackground?: string;        // inherit:surface.background
      inputForeground?: string;        // inherit:surface.foreground
      inputBorder?: string;           // inherit:interactive.border
      inputBorderFocus?: string;      // inherit:interactive.borderFocus
      inputPlaceholder?: string;      // inherit:surface.mutedForeground@60%
      inputDisabled?: string;         // inherit:surface.muted
      inputError?: string;            // inherit:status.errorBorder
      labelColor?: string;            // inherit:surface.foreground
      helperText?: string;            // inherit:surface.mutedForeground
      checkbox?: string;              // inherit:primary.base
      radio?: string;                 // inherit:primary.base
      switch?: string;                // inherit:primary.base
      switchTrack?: string;           // inherit:surface.muted
    };
    
    // BUTTONS
    buttons?: {
      // Primary button
      primary?: {
        bg?: string;                  // inherit:primary.base
        fg?: string;                  // inherit:primary.foreground
        border?: string;              // transparent
        hover?: string;               // inherit:primary.hover
        active?: string;              // inherit:primary.active
        disabled?: string;            // inherit:surface.muted
      };
      
      // Secondary button
      secondary?: {
        bg?: string;                  // inherit:surface.muted
        fg?: string;                  // inherit:surface.foreground
        border?: string;              // inherit:interactive.border
        hover?: string;               // inherit:surface.elevated
        active?: string;              // inherit:interactive.active
        disabled?: string;            // inherit:surface.muted@50%
      };
      
      // Ghost button
      ghost?: {
        bg?: string;                  // transparent
        fg?: string;                  // inherit:surface.foreground
        border?: string;              // transparent
        hover?: string;               // inherit:surface.muted@30%
        active?: string;              // inherit:surface.muted@50%
        disabled?: string;            // inherit:surface.mutedForeground@30%
      };
      
      // Destructive button
      destructive?: {
        bg?: string;                  // inherit:status.error
        fg?: string;                  // inherit:status.errorForeground
        border?: string;              // transparent
        hover?: string;               // inherit:status.error@90%
        active?: string;              // inherit:status.error@80%
        disabled?: string;            // inherit:status.error@30%
      };
    };
    
    // MODALS & DIALOGS
    modal?: {
      backdrop?: string;              // rgba(0,0,0,0.5)
      background?: string;            // inherit:surface.elevated
      foreground?: string;            // inherit:surface.foreground
      border?: string;                // inherit:interactive.border
      headerBg?: string;              // inherit:surface.elevated
      headerFg?: string;              // inherit:surface.foreground
      footerBg?: string;              // inherit:surface.muted
      closeButton?: string;           // inherit:surface.mutedForeground
      closeButtonHover?: string;      // inherit:surface.foreground
    };
    
    // TOOLTIPS & POPOVERS
    popover?: {
      background?: string;            // inherit:surface.elevated
      foreground?: string;            // inherit:surface.foreground
      border?: string;                // inherit:interactive.border
      shadow?: string;                // rgba(0,0,0,0.1)
      arrow?: string;                 // inherit:surface.elevated
    };
    
    // COMMAND PALETTE
    commandPalette?: {
      background?: string;            // inherit:surface.elevated
      foreground?: string;            // inherit:surface.foreground
      inputBg?: string;               // inherit:surface.background
      inputBorder?: string;           // inherit:interactive.border
      itemHover?: string;             // inherit:surface.muted
      itemSelected?: string;          // inherit:primary.base@10%
      itemSelectedBorder?: string;    // inherit:primary.base
      shortcutKey?: string;           // inherit:surface.mutedForeground
      shortcutKeyBg?: string;         // inherit:surface.muted
      groupHeader?: string;           // inherit:surface.mutedForeground@70%
      separator?: string;             // inherit:interactive.border
    };
    
    // FILE ATTACHMENTS
    fileAttachment?: {
      background?: string;            // inherit:surface.muted
      border?: string;                // inherit:interactive.border
      iconColor?: string;             // inherit:primary.base
      nameColor?: string;             // inherit:surface.foreground
      sizeColor?: string;             // inherit:surface.mutedForeground
      removeButton?: string;          // inherit:status.error
      removeButtonHover?: string;     // inherit:status.error@80%
      dragActive?: string;            // inherit:primary.base@20%
      dragBorder?: string;            // inherit:primary.base
    };
    
    // SESSION LIST
    sessions?: {
      itemBg?: string;                // transparent
      itemHover?: string;             // inherit:surface.muted@50%
      itemActive?: string;            // inherit:primary.base@10%
      itemActiveBorder?: string;      // inherit:primary.base
      itemText?: string;              // inherit:surface.foreground
      timestamp?: string;             // inherit:surface.mutedForeground
      divider?: string;               // inherit:interactive.border
      newButton?: string;             // inherit:primary.base
      deleteButton?: string;          // inherit:status.error
    };
    
    // MODEL/PROVIDER SELECTOR
    modelSelector?: {
      background?: string;            // inherit:surface.elevated
      categoryHeader?: string;        // inherit:surface.mutedForeground
      optionBg?: string;              // inherit:surface.background
      optionHover?: string;           // inherit:surface.muted
      optionSelected?: string;        // inherit:primary.base@10%
      providerIcon?: string;          // inherit:surface.mutedForeground
      costIndicator?: string;         // inherit:status.warning
      badge?: string;                 // inherit:primary.base
      badgeText?: string;             // inherit:primary.foreground
    };
    
    // PERMISSION DIALOGS
    permissions?: {
      background?: string;            // inherit:surface.elevated
      iconAllow?: string;             // inherit:status.success
      iconDeny?: string;              // inherit:status.error
      iconWarning?: string;           // inherit:status.warning
      buttonAllow?: string;           // inherit:status.success
      buttonDeny?: string;            // inherit:status.error
      buttonAlways?: string;          // inherit:primary.base
      description?: string;           // inherit:surface.foreground
      title?: string;                 // inherit:surface.foreground
    };
    
    // LOADING STATES
    loading?: {
      spinner?: string;               // inherit:primary.base
      spinnerTrack?: string;          // inherit:surface.muted
      skeleton?: string;              // inherit:surface.muted
      skeletonShimmer?: string;       // inherit:surface.elevated
      progressBar?: string;           // inherit:primary.base
      progressTrack?: string;         // inherit:surface.muted
      dots?: string;                  // inherit:surface.mutedForeground
    };
    
    // SCROLLBARS
    scrollbar?: {
      track?: string;                 // inherit:surface.muted@30%
      thumb?: string;                 // inherit:surface.mutedForeground@30%
      thumbHover?: string;            // inherit:surface.mutedForeground@50%
      thumbActive?: string;           // inherit:surface.mutedForeground@70%
    };
    
    // BADGES & TAGS
    badges?: {
      default?: {
        bg?: string;                  // inherit:surface.muted
        fg?: string;                  // inherit:surface.foreground
        border?: string;              // inherit:interactive.border
      };
      info?: {
        bg?: string;                  // inherit:status.infoBackground
        fg?: string;                  // inherit:status.info
        border?: string;              // inherit:status.infoBorder
      };
      success?: {
        bg?: string;                  // inherit:status.successBackground
        fg?: string;                  // inherit:status.success
        border?: string;              // inherit:status.successBorder
      };
      warning?: {
        bg?: string;                  // inherit:status.warningBackground
        fg?: string;                  // inherit:status.warning
        border?: string;              // inherit:status.warningBorder
      };
      error?: {
        bg?: string;                  // inherit:status.errorBackground
        fg?: string;                  // inherit:status.error
        border?: string;              // inherit:status.errorBorder
      };
    };
    
    // TOAST NOTIFICATIONS
    toast?: {
      background?: string;            // inherit:surface.elevated
      foreground?: string;            // inherit:surface.foreground
      border?: string;                // inherit:interactive.border
      closeButton?: string;           // inherit:surface.mutedForeground
      closeButtonHover?: string;      // inherit:surface.foreground
      progressBar?: string;           // inherit:primary.base
      
      success?: {
        bg?: string;                  // inherit:status.successBackground
        fg?: string;                  // inherit:status.success
        icon?: string;                // inherit:status.success
        border?: string;              // inherit:status.successBorder
      };
      error?: {
        bg?: string;                  // inherit:status.errorBackground
        fg?: string;                  // inherit:status.error
        icon?: string;                // inherit:status.error
        border?: string;              // inherit:status.errorBorder
      };
      warning?: {
        bg?: string;                  // inherit:status.warningBackground
        fg?: string;                  // inherit:status.warning
        icon?: string;                // inherit:status.warning
        border?: string;              // inherit:status.warningBorder
      };
      info?: {
        bg?: string;                  // inherit:status.infoBackground
        fg?: string;                  // inherit:status.info
        icon?: string;                // inherit:status.info
        border?: string;              // inherit:status.infoBorder
      };
    };
    
    // EMPTY STATES
    emptyState?: {
      icon?: string;                  // inherit:surface.mutedForeground@50%
      heading?: string;               // inherit:surface.foreground
      description?: string;           // inherit:surface.mutedForeground
      background?: string;            // inherit:surface.muted@30%
      border?: string;                // inherit:interactive.border@50%
      action?: string;                // inherit:primary.base
    };
    
    // TABLES (for future use)
    table?: {
      headerBg?: string;              // inherit:surface.muted
      headerFg?: string;              // inherit:surface.foreground
      rowBg?: string;                 // inherit:surface.background
      rowBgAlt?: string;              // inherit:surface.muted@30%
      rowHover?: string;              // inherit:surface.muted@50%
      border?: string;                // inherit:interactive.border
      sortIcon?: string;              // inherit:surface.mutedForeground
      cellPadding?: string;           // spacing token
    };
    
    // CHARTS & GRAPHS
    charts?: {
      background?: string;            // inherit:surface.background
      grid?: string;                  // inherit:interactive.border@20%
      axis?: string;                  // inherit:surface.mutedForeground
      axisLabel?: string;             // inherit:surface.mutedForeground@80%
      tooltip?: string;               // inherit:surface.elevated
      tooltipText?: string;           // inherit:surface.foreground
      legend?: string;                // inherit:surface.mutedForeground
      // Data series colors (array for multiple data points)
      series?: string[];              // Array of colors for chart data
    };
    
    // ACCESSIBILITY
    a11y?: {
      focusRing?: string;             // inherit:primary.base
      focusRingOffset?: string;       // inherit:surface.background
      skipLink?: string;              // inherit:primary.base
      ariaLiveRegion?: string;        // inherit:status.info
      highContrastBorder?: string;    // inherit:surface.foreground
      reducedMotion?: boolean;        // Flag for reduced motion preference
    };
    
    // SHADOWS (as color tokens)
    shadows?: {
      sm?: string;                    // rgba(0,0,0,0.05)
      md?: string;                    // rgba(0,0,0,0.1)
      lg?: string;                    // rgba(0,0,0,0.15)
      xl?: string;                    // rgba(0,0,0,0.25)
      inner?: string;                 // inset rgba(0,0,0,0.05)
      none?: string;                  // transparent
      colored?: string;               // inherit:primary.base@20%
    };
    
    // ANIMATIONS
    animation?: {
      pulse?: string;                 // inherit:primary.base@50%
      ping?: string;                  // inherit:primary.base
      bounce?: string;                // inherit:primary.base
      shimmer?: string;               // linear-gradient using surface colors
      skeleton?: string;              // inherit:surface.muted
    };
  };
  
  // Additional theme configuration
  config?: {
    // Font configurations
    fonts?: {
      sans?: string;
      mono?: string;
      heading?: string;
    };
    
    // Border radius tokens
    radius?: {
      none?: string;
      sm?: string;
      md?: string;
      lg?: string;
      xl?: string;
      full?: string;
    };
    
    // Spacing scale
    spacing?: {
      xs?: string;
      sm?: string;
      md?: string;
      lg?: string;
      xl?: string;
    };
    
    // Animation durations
    transitions?: {
      fast?: string;
      normal?: string;
      slow?: string;
    };
  };
}
```

## Inheritance System

### How Inheritance Works

The inheritance system allows theme authors to create minimal themes while ensuring all UI elements are properly styled. Components can inherit colors from core semantic definitions with optional overrides.

### Syntax Highlighting Inheritance

The syntax highlighting system is designed to work with just 8-10 core colors, making it extremely easy to create cohesive themes:

```typescript
// Minimal syntax theme - just define base colors
syntax: {
  base: {
    background: "#1e1e1e",
    foreground: "#d4d4d4",
    comment: "#6a9955",
    keyword: "#569cd6",
    string: "#ce9178",
    number: "#b5cea8",
    function: "#dcdcaa",
    variable: "#9cdcfe",
    type: "#4ec9b0",
    operator: "#c586c0"
  }
  // That's it! All other tokens automatically inherit
}

// The system automatically generates:
// - commentDoc inherits from comment but lighter
// - stringEscape inherits from string but darker
// - functionCall inherits from function but slightly lighter
// - className inherits from type with emphasis
// - punctuation inherits from foreground but muted
// And 50+ other token colors...
```

This approach means:
1. **Quick theme creation**: Define 10 colors, get a complete syntax theme
2. **Consistency**: Related tokens automatically share color families
3. **Smart defaults**: The system knows that escape sequences should be darker than strings
4. **Override when needed**: Can still customize any specific token

### Inheritance Syntax

```typescript
// In theme definition
"chat.userMessageBackground": "inherit:surface.elevated"
// This means: use the value from colors.surface.elevated

// With opacity modifier
"markdown.listMarker": "inherit:primary.base@60%"
// This means: use primary.base at 60% opacity

// With color manipulation
"buttons.primary.hover": "inherit:primary.base:darken(10)"
// This means: use primary.base darkened by 10%
```

### Resolution Order

1. Check if component has explicit color defined
2. If value starts with "inherit:", resolve the reference
3. If no value defined, use default inheritance mapping
4. Fall back to core semantic color

## Implementation Architecture

### 1. Theme Context Provider

```typescript
// src/contexts/ThemeContext.tsx
interface ThemeContextValue {
  currentTheme: Theme;
  availableThemes: Theme[];
  setTheme: (themeId: string) => void;
  isSystemPreference: boolean;
  setSystemPreference: (use: boolean) => void;
  customThemes: Theme[];
  addCustomTheme: (theme: Theme) => void;
  removeCustomTheme: (themeId: string) => void;
  exportTheme: (themeId: string) => string;
  importTheme: (themeJson: string) => void;
}
```

### 2. CSS Variable Generator

```typescript
// src/lib/theme/cssGenerator.ts
class CSSVariableGenerator {
  generate(theme: Theme): string {
    // Flatten theme object to CSS variables
    // Handle inheritance resolution
    // Apply opacity modifiers
    // Return CSS string
  }
  
  private resolveInheritance(value: string, theme: Theme): string {
    // Parse inherit: syntax
    // Resolve references
    // Apply modifiers
    // Return final value
  }
}
```

### 3. Theme Validator

```typescript
// src/lib/theme/validator.ts
class ThemeValidator {
  validate(theme: Partial<Theme>): ValidationResult {
    // Check required fields
    // Validate color formats
    // Check contrast ratios
    // Verify inheritance references
    // Return validation result with errors/warnings
  }
  
  checkAccessibility(theme: Theme): AccessibilityReport {
    // Calculate contrast ratios
    // Check WCAG compliance
    // Identify problematic combinations
    // Return detailed report
  }
}
```

### 4. Runtime Theme Application

```typescript
// src/lib/theme/ThemeApplicator.ts
class ThemeApplicator {
  apply(theme: Theme): void {
    // Generate CSS variables
    const cssVars = new CSSVariableGenerator().generate(theme);
    
    // Apply to document root
    document.documentElement.style.cssText = cssVars;
    
    // Update syntax highlighter
    this.updateSyntaxHighlighter(theme);
    
    // Update any runtime-dependent theming
    this.updateChartColors(theme);
    
    // Persist selection
    localStorage.setItem('selectedThemeId', theme.metadata.id);
    
    // Emit event for external listeners
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: theme }));
  }
  
  private updateSyntaxHighlighter(theme: Theme): void {
    // Generate Prism theme from theme.colors.syntax
    // Apply to all code blocks
  }
}
```

## Built-in Themes

### Core Themes

1. **Dune Arrakis** (Current - Dark)
   - Desert night aesthetic
   - Warm sand and spice colors
   - Golden accents

2. **Dune Caladan** (Light)
   - Ocean world theme
   - Blues and greens
   - Light, airy feeling

3. **Dune Sietch** (Dark)
   - Deep desert cave theme
   - High contrast
   - Minimal color palette

4. **Dune Spice** (Dark)
   - Orange/melange focused
   - Warm and energetic
   - Amber highlights

### Popular Developer Themes

5. **GitHub Light/Dark**
   - Clean, professional
   - Familiar to developers
   - Excellent readability

6. **Monokai Pro**
   - Classic syntax highlighting
   - Vibrant but balanced
   - Purple and green accents

7. **Nord Aurora**
   - Cool, arctic palette
   - Soft contrast
   - Blue-green focus

8. **Gruvbox Dark/Light**
   - Retro terminal aesthetic
   - Warm, comfortable colors
   - Brown and orange tones

9. **Tokyo Night**
   - Cyberpunk aesthetic
   - Purple and blue focus
   - Neon accents

10. **Catppuccin Mocha/Latte**
    - Modern pastel palette
    - Soft, pleasant colors
    - Multiple variants

## Theme Creation Guide

### Minimal Theme Example

```json
{
  "metadata": {
    "id": "minimal-dark",
    "name": "Minimal Dark",
    "variant": "dark"
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
      "mutedForeground": "#a0a0a0"
    },
    "status": {
      "error": "#ff4444",
      "warning": "#ffaa00",
      "success": "#00aa00",
      "info": "#0088ff"
    },
    "syntax": {
      "base": {
        "background": "#1a1a1a",
        "foreground": "#e0e0e0",
        "comment": "#608b4e",
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

With just these ~25 color definitions, the theme system will automatically generate:
- 100+ UI component colors through inheritance
- 50+ syntax highlighting tokens through intelligent defaults
- Consistent color relationships across the entire interface

### Complete Theme Example

See `src/lib/theme/themes/dune-arrakis.ts` for a complete theme implementation with all color definitions and component overrides.

## Migration Plan

### Phase 1: Foundation (Week 1)
- [ ] Create type definitions
- [ ] Build CSS variable generator
- [ ] Implement inheritance resolver
- [ ] Create theme context/provider
- [ ] Add theme validator

### Phase 2: Core Themes (Week 2)
- [ ] Convert current Dune theme to new format
- [ ] Create 3-4 additional Dune variants
- [ ] Add GitHub Light/Dark themes
- [ ] Implement theme switcher UI

### Phase 3: Component Migration (Week 3-4)
- [ ] Update all components to use CSS variables
- [ ] Remove hardcoded colors
- [ ] Update syntax highlighter integration
- [ ] Test all themes across components

### Phase 4: Advanced Features (Week 5)
- [ ] Theme import/export
- [ ] Custom theme creator UI
- [ ] Accessibility checker
- [ ] Theme marketplace preparation

### Phase 5: Polish (Week 6)
- [ ] Add remaining popular themes
- [ ] Performance optimization
- [ ] Documentation
- [ ] Migration guide for custom themes

## Component Usage Examples

### Using Theme Colors in Components

```tsx
// Direct CSS variable usage
<div className="bg-[var(--surface-background)] text-[var(--surface-foreground)]">
  <h1 className="text-[var(--markdown-heading1)]">Title</h1>
</div>

// With Tailwind arbitrary values
<button className="bg-[var(--primary-base)] hover:bg-[var(--primary-hover)]">
  Click me
</button>

// In styled components or CSS-in-JS
const StyledCard = styled.div`
  background: var(--surface-elevated);
  border: 1px solid var(--interactive-border);
  
  &:hover {
    background: var(--surface-muted);
  }
`;
```

### Accessing Theme in JavaScript

```typescript
import { useTheme } from '@/contexts/ThemeContext';

function MyComponent() {
  const { currentTheme, setTheme } = useTheme();
  
  // Access theme colors programmatically
  const primaryColor = currentTheme.colors.primary.base;
  
  // Use for dynamic styling
  const chartColors = currentTheme.colors.charts?.series || [
    currentTheme.colors.primary.base,
    currentTheme.colors.status.success,
    currentTheme.colors.status.info,
  ];
  
  return <div>...</div>;
}
```

## Theme Export/Import Format

Themes can be exported as JSON for sharing and distribution:

```typescript
// Export
const themeJson = JSON.stringify(theme, null, 2);
// Save to file or share via URL

// Import
const importedTheme = JSON.parse(themeJson);
// Validate
const validation = themeValidator.validate(importedTheme);
if (validation.isValid) {
  addCustomTheme(importedTheme);
}
```

## Accessibility Considerations

### Contrast Requirements

All themes must meet WCAG 2.1 guidelines:
- Normal text: 4.5:1 contrast ratio (AA)
- Large text: 3:1 contrast ratio (AA)
- Enhanced: 7:1 and 4.5:1 (AAA)

### Theme Validator Checks

```typescript
const accessibilityReport = themeValidator.checkAccessibility(theme);
// Returns:
{
  wcagAA: boolean;
  wcagAAA: boolean;
  issues: [{
    foreground: string;
    background: string;
    ratio: number;
    requirement: number;
    pass: boolean;
  }];
}
```

## Performance Considerations

### CSS Variable Performance

- CSS variables are computed at runtime but cached by browsers
- Changes trigger reflow/repaint only for affected elements
- Use specific selectors to minimize impact

### Theme Switching

- Instant application via CSS variables
- No component re-renders required
- Smooth transitions possible with CSS transitions

### Bundle Size

- Core system: ~15KB minified
- Each theme: ~3-5KB
- Lazy load non-default themes
- Code-split theme creator UI

## Future Enhancements

1. **Theme Interpolation**: Smooth transitions between themes with CSS transitions for a polished user experience

## Testing Strategy

### Unit Tests
- Color manipulation functions
- Inheritance resolution
- CSS variable generation
- Theme validation

### Integration Tests
- Theme application
- Component rendering with different themes
- Accessibility compliance
- Browser compatibility

### Visual Regression Tests
- Screenshot comparison across themes
- Ensure consistent layouts
- Verify color application

## Developer Tools

### Theme Development Mode

```typescript
// Enable in development
if (process.env.NODE_ENV === 'development') {
  window.__THEME_DEVTOOLS__ = {
    getCurrentTheme: () => currentTheme,
    setColor: (path: string, value: string) => {
      // Live edit theme colors
    },
    exportCurrent: () => JSON.stringify(currentTheme),
    validateCurrent: () => themeValidator.validate(currentTheme),
  };
}
```

### Browser Extension

Future: Create a browser extension for live theme editing and testing.

## Conclusion

This theming system provides a robust, flexible, and maintainable solution for the OpenCode WebUI. It ensures consistency across the application while allowing for extensive customization and future expansion. The semantic color system, combined with component-specific overrides and an inheritance model, creates a powerful yet approachable theming architecture.

The system is designed to scale from simple two-color themes to complex, fully-customized designs, making it suitable for both individual developers and enterprise deployments.