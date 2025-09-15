import type { Theme } from '@/types/theme';

/**
 * CSS Variable Generator
 * Converts theme objects to CSS variables with inheritance resolution
 */
export class CSSVariableGenerator {
  private inheritanceMap: Map<string, string> = new Map();
  
  constructor() {
    this.initializeInheritanceMap();
  }
  
  /**
   * Generate CSS variables from a theme object
   */
  generate(theme: Theme): string {
    const cssVars: string[] = [];
    
    // Generate Tailwind-compatible CSS variables first
    cssVars.push(...this.generateTailwindVariables(theme));
    
    // Generate core semantic colors
    cssVars.push(...this.generatePrimaryColors(theme.colors.primary));
    cssVars.push(...this.generateSurfaceColors(theme.colors.surface));
    cssVars.push(...this.generateInteractiveColors(theme.colors.interactive));
    cssVars.push(...this.generateStatusColors(theme.colors.status));
    
    // Generate syntax highlighting colors
    cssVars.push(...this.generateSyntaxColors(theme.colors.syntax));
    
    // Generate component-specific colors with inheritance
    cssVars.push(...this.generateComponentColors(theme.colors, theme));
    
    // Generate typography variables - centralized text styles
    cssVars.push(...this.generateTypographyVariables(theme.typography));
    
    // Generate config variables (fonts, radius, etc.)
    if (theme.config) {
      cssVars.push(...this.generateConfigVariables(theme.config));
    }
    
    return cssVars.join('\n');
  }
  
  private generateTailwindVariables(theme: Theme): string[] {
    const vars: string[] = [];
    
    // Map our theme colors to Tailwind CSS variables with !important to override hardcoded values
    vars.push(`  --background: ${theme.colors.surface.background} !important;`);
    vars.push(`  --foreground: ${theme.colors.surface.foreground} !important;`);
    
    vars.push(`  --muted: ${theme.colors.surface.muted} !important;`);
    vars.push(`  --muted-foreground: ${theme.colors.surface.mutedForeground} !important;`);
    
    vars.push(`  --card: ${theme.colors.surface.elevated} !important;`);
    vars.push(`  --card-foreground: ${theme.colors.surface.elevatedForeground} !important;`);
    
    vars.push(`  --popover: ${theme.colors.surface.elevated} !important;`);
    vars.push(`  --popover-foreground: ${theme.colors.surface.elevatedForeground} !important;`);
    
    vars.push(`  --border: ${theme.colors.interactive.border} !important;`);
    vars.push(`  --input: ${theme.colors.interactive.border} !important;`);
    
    vars.push(`  --primary: ${theme.colors.primary.base} !important;`);
    vars.push(`  --primary-foreground: ${theme.colors.primary.foreground} !important;`);
    
    vars.push(`  --secondary: ${theme.colors.surface.muted} !important;`);
    vars.push(`  --secondary-foreground: ${theme.colors.surface.mutedForeground} !important;`);
    
    vars.push(`  --accent: ${theme.colors.surface.subtle} !important;`);
    vars.push(`  --accent-foreground: ${theme.colors.surface.foreground} !important;`);
    
    vars.push(`  --destructive: ${theme.colors.status.error} !important;`);
    vars.push(`  --destructive-foreground: ${theme.colors.status.errorForeground} !important;`);
    
    vars.push(`  --ring: ${theme.colors.interactive.focusRing} !important;`);
    
    // Add radius if defined in config
    if (theme.config?.radius?.md) {
      vars.push(`  --radius: ${theme.config.radius.md} !important;`);
    }
    
    // Sidebar variables
    vars.push(`  --sidebar: ${theme.colors.surface.muted} !important;`);
    vars.push(`  --sidebar-foreground: ${theme.colors.surface.mutedForeground} !important;`);
    vars.push(`  --sidebar-primary: ${theme.colors.primary.base} !important;`);
    vars.push(`  --sidebar-primary-foreground: ${theme.colors.primary.foreground} !important;`);
    vars.push(`  --sidebar-accent: ${theme.colors.surface.subtle} !important;`);
    vars.push(`  --sidebar-accent-foreground: ${theme.colors.surface.foreground} !important;`);
    vars.push(`  --sidebar-border: ${theme.colors.interactive.border} !important;`);
    vars.push(`  --sidebar-ring: ${theme.colors.interactive.focusRing} !important;`);
    
    // Chart colors (if defined)
    if (theme.colors.charts?.series && Array.isArray(theme.colors.charts.series)) {
      theme.colors.charts.series.forEach((color: string, i: number) => {
        vars.push(`  --chart-${i + 1}: ${color};`);
      });
    }
    
    // Loading states (from theme or defaults)
    if (theme.colors.loading) {
      vars.push(`  --loading-spinner: ${theme.colors.loading.spinner || theme.colors.primary.base};`);
      vars.push(`  --loading-spinner-track: ${theme.colors.loading.spinnerTrack || theme.colors.surface.muted};`);
    } else {
      vars.push(`  --loading-spinner: ${theme.colors.primary.base};`);
      vars.push(`  --loading-spinner-track: ${theme.colors.surface.muted};`);
    }
    
    return vars;
  }
  
  /**
   * Apply theme to document root
   */
  apply(theme: Theme): void {
    const cssVars = this.generate(theme);
    const style = document.createElement('style');
    style.id = 'opencode-theme-variables';
    
    // Use more specific selectors to override existing CSS
    let styleContent = '';
    if (theme.metadata.variant === 'dark') {
      // For dark themes, apply to both :root and .dark
      styleContent = `:root {\n${cssVars}\n}\n\n.dark {\n${cssVars}\n}`;
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      // For light themes, apply to :root and remove dark class
      styleContent = `:root {\n${cssVars}\n}\n\n:root:not(.dark) {\n${cssVars}\n}`;
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
    
    style.textContent = styleContent;
    
    // Remove existing theme styles
    const existing = document.getElementById('opencode-theme-variables');
    if (existing) {
      existing.remove();
    }
    
    // Add new theme styles at the end of head to ensure they override
    document.head.appendChild(style);
    
    // Set theme variant on root element
    document.documentElement.setAttribute('data-theme', theme.metadata.variant);
  }
  
  private generatePrimaryColors(primary: Theme['colors']['primary']): string[] {
    const vars: string[] = [];
    vars.push(`  --primary-base: ${primary.base};`);
    vars.push(`  --primary-hover: ${primary.hover || this.darken(primary.base, 10)};`);
    vars.push(`  --primary-active: ${primary.active || this.darken(primary.base, 20)};`);
    vars.push(`  --primary-foreground: ${primary.foreground || '#ffffff'};`);
    vars.push(`  --primary-muted: ${primary.muted || this.opacity(primary.base, 0.5)};`);
    vars.push(`  --primary-emphasis: ${primary.emphasis || this.lighten(primary.base, 10)};`);
    return vars;
  }
  
  private generateSurfaceColors(surface: Theme['colors']['surface']): string[] {
    const vars: string[] = [];
    vars.push(`  --surface-background: ${surface.background};`);
    vars.push(`  --surface-foreground: ${surface.foreground};`);
    vars.push(`  --surface-muted: ${surface.muted};`);
    vars.push(`  --surface-muted-foreground: ${surface.mutedForeground};`);
    vars.push(`  --surface-elevated: ${surface.elevated};`);
    vars.push(`  --surface-elevated-foreground: ${surface.elevatedForeground};`);
    vars.push(`  --surface-overlay: ${surface.overlay};`);
    vars.push(`  --surface-subtle: ${surface.subtle};`);
    return vars;
  }
  
  private generateInteractiveColors(interactive: Theme['colors']['interactive']): string[] {
    const vars: string[] = [];
    vars.push(`  --interactive-border: ${interactive.border};`);
    vars.push(`  --interactive-border-hover: ${interactive.borderHover};`);
    vars.push(`  --interactive-border-focus: ${interactive.borderFocus};`);
    vars.push(`  --interactive-selection: ${interactive.selection};`);
    vars.push(`  --interactive-selection-foreground: ${interactive.selectionForeground};`);
    vars.push(`  --interactive-focus: ${interactive.focus};`);
    vars.push(`  --interactive-focus-ring: ${interactive.focusRing};`);
    vars.push(`  --interactive-cursor: ${interactive.cursor};`);
    vars.push(`  --interactive-hover: ${interactive.hover};`);
    vars.push(`  --interactive-active: ${interactive.active};`);
    return vars;
  }
  
  private generateStatusColors(status: Theme['colors']['status']): string[] {
    const vars: string[] = [];
    
    // Error colors
    vars.push(`  --status-error: ${status.error};`);
    vars.push(`  --status-error-foreground: ${status.errorForeground};`);
    vars.push(`  --status-error-background: ${status.errorBackground};`);
    vars.push(`  --status-error-border: ${status.errorBorder};`);
    
    // Warning colors
    vars.push(`  --status-warning: ${status.warning};`);
    vars.push(`  --status-warning-foreground: ${status.warningForeground};`);
    vars.push(`  --status-warning-background: ${status.warningBackground};`);
    vars.push(`  --status-warning-border: ${status.warningBorder};`);
    
    // Success colors
    vars.push(`  --status-success: ${status.success};`);
    vars.push(`  --status-success-foreground: ${status.successForeground};`);
    vars.push(`  --status-success-background: ${status.successBackground};`);
    vars.push(`  --status-success-border: ${status.successBorder};`);
    
    // Info colors
    vars.push(`  --status-info: ${status.info};`);
    vars.push(`  --status-info-foreground: ${status.infoForeground};`);
    vars.push(`  --status-info-background: ${status.infoBackground};`);
    vars.push(`  --status-info-border: ${status.infoBorder};`);
    
    return vars;
  }
  
  private generateSyntaxColors(syntax: Theme['colors']['syntax']): string[] {
    const vars: string[] = [];
    
    // Base syntax colors
    vars.push(`  --syntax-background: ${syntax.base.background};`);
    vars.push(`  --syntax-foreground: ${syntax.base.foreground};`);
    vars.push(`  --syntax-comment: ${syntax.base.comment};`);
    vars.push(`  --syntax-keyword: ${syntax.base.keyword};`);
    vars.push(`  --syntax-string: ${syntax.base.string};`);
    vars.push(`  --syntax-number: ${syntax.base.number};`);
    vars.push(`  --syntax-function: ${syntax.base.function};`);
    vars.push(`  --syntax-variable: ${syntax.base.variable};`);
    vars.push(`  --syntax-type: ${syntax.base.type};`);
    vars.push(`  --syntax-operator: ${syntax.base.operator};`);
    
    // Generate inherited tokens with smart defaults
    const tokens = this.generateSyntaxTokens(syntax);
    for (const [key, value] of Object.entries(tokens)) {
      vars.push(`  --syntax-${this.kebabCase(key)}: ${value};`);
    }
    
    return vars;
  }
  
  private generateSyntaxTokens(syntax: Theme['colors']['syntax']): Record<string, string> {
    const base = syntax.base;
    const tokens = syntax.tokens || {};
    
    return {
      // Comments
      commentDoc: tokens.commentDoc || this.lighten(base.comment, 10),
      
      // Strings
      stringEscape: tokens.stringEscape || this.darken(base.string, 20),
      stringInterpolation: tokens.stringInterpolation || base.variable,
      stringRegex: tokens.stringRegex || this.adjustHue(base.string, 15),
      
      // Keywords
      keywordControl: tokens.keywordControl || base.keyword,
      keywordOperator: tokens.keywordOperator || base.operator,
      keywordImport: tokens.keywordImport || this.lighten(base.keyword, 10),
      keywordReturn: tokens.keywordReturn || this.emphasize(base.keyword),
      
      // Functions
      functionCall: tokens.functionCall || this.lighten(base.function, 5),
      functionBuiltin: tokens.functionBuiltin || this.darken(base.function, 10),
      method: tokens.method || base.function,
      methodCall: tokens.methodCall || this.lighten(base.function, 5),
      
      // Variables
      variableBuiltin: tokens.variableBuiltin || this.emphasize(base.variable),
      variableProperty: tokens.variableProperty || this.lighten(base.variable, 10),
      variableReadonly: tokens.variableReadonly || base.number,
      parameter: tokens.parameter || base.variable,
      
      // Types
      typePrimitive: tokens.typePrimitive || this.darken(base.type, 10),
      typeInterface: tokens.typeInterface || base.type,
      className: tokens.className || this.emphasize(base.type),
      enum: tokens.enum || base.type,
      
      // Literals
      boolean: tokens.boolean || base.number,
      null: tokens.null || this.opacity(base.number, 0.7),
      constant: tokens.constant || base.number,
      
      // Operators & Punctuation
      punctuation: tokens.punctuation || this.opacity(base.foreground, 0.7),
      delimiter: tokens.delimiter || this.opacity(base.foreground, 0.8),
      bracket: tokens.bracket || base.foreground,
      
      // Markup
      tag: tokens.tag || base.keyword,
      tagAttribute: tokens.tagAttribute || base.variable,
      tagAttributeValue: tokens.tagAttributeValue || base.string,
      tagBracket: tokens.tagBracket || this.opacity(base.foreground, 0.8),
      
      // Decorators
      decorator: tokens.decorator || base.function,
      annotation: tokens.annotation || base.function,
      
      // Namespaces
      namespace: tokens.namespace || this.opacity(base.type, 0.8),
      module: tokens.module || this.opacity(base.type, 0.8),
      
      ...tokens // Include any explicit overrides
    };
  }
  
  private generateComponentColors(colors: Theme['colors'], theme: Theme): string[] {
    const vars: string[] = [];
    
    // Markdown colors with inheritance
    if (colors.markdown) {
      vars.push(...this.generateMarkdownColors(colors.markdown, theme));
    } else {
      // Generate defaults from inheritance
      vars.push(...this.generateDefaultMarkdownColors(theme));
    }
    
    // Chat colors
    if (colors.chat) {
      vars.push(...this.generateChatColors(colors.chat, theme));
    } else {
      vars.push(...this.generateDefaultChatColors(theme));
    }
    
    // Tool colors
    if (colors.tools) {
      vars.push(...this.generateToolColors(colors.tools, theme));
    } else {
      vars.push(...this.generateDefaultToolColors(theme));
    }
    
    // Add more component color generations as needed...
    
    return vars;
  }
  
  private generateMarkdownColors(markdown: Record<string, string>, theme: Theme): string[] {
    const vars: string[] = [];
    const primary = theme.colors.primary.base;
    
    vars.push(`  --markdown-heading1: ${markdown.heading1 || primary};`);
    vars.push(`  --markdown-heading2: ${markdown.heading2 || this.opacity(primary, 0.9)};`);
    vars.push(`  --markdown-heading3: ${markdown.heading3 || this.opacity(primary, 0.8)};`);
    vars.push(`  --markdown-heading4: ${markdown.heading4 || theme.colors.surface.foreground};`);
    vars.push(`  --markdown-link: ${markdown.link || primary};`);
    vars.push(`  --markdown-link-hover: ${markdown.linkHover || theme.colors.primary.hover || this.darken(primary, 10)};`);
    vars.push(`  --markdown-inline-code: ${markdown.inlineCode || theme.colors.syntax.base.string};`);
    vars.push(`  --markdown-inline-code-bg: ${markdown.inlineCodeBackground || theme.colors.surface.subtle};`);
    vars.push(`  --markdown-blockquote: ${markdown.blockquote || theme.colors.surface.mutedForeground};`);
    vars.push(`  --markdown-blockquote-border: ${markdown.blockquoteBorder || theme.colors.interactive.border};`);
    vars.push(`  --markdown-list-marker: ${markdown.listMarker || this.opacity(primary, 0.6)};`);
    vars.push(`  --markdown-bold: ${markdown.bold || theme.colors.surface.foreground};`);
    vars.push(`  --markdown-italic: ${markdown.italic || this.opacity(theme.colors.surface.foreground, 0.9)};`);
    vars.push(`  --markdown-strikethrough: ${markdown.strikethrough || theme.colors.surface.mutedForeground};`);
    vars.push(`  --markdown-hr: ${markdown.hr || theme.colors.interactive.border};`);
    
    return vars;
  }
  
  private generateDefaultMarkdownColors(theme: Theme): string[] {
    const vars: string[] = [];
    const primary = theme.colors.primary.base;
    
    vars.push(`  --markdown-heading1: ${primary};`);
    vars.push(`  --markdown-heading2: ${this.opacity(primary, 0.9)};`);
    vars.push(`  --markdown-heading3: ${this.opacity(primary, 0.8)};`);
    vars.push(`  --markdown-heading4: ${theme.colors.surface.foreground};`);
    vars.push(`  --markdown-link: ${primary};`);
    vars.push(`  --markdown-link-hover: ${theme.colors.primary.hover || this.darken(primary, 10)};`);
    vars.push(`  --markdown-inline-code: ${theme.colors.syntax.base.string};`);
    vars.push(`  --markdown-inline-code-bg: ${theme.colors.surface.subtle};`);
    vars.push(`  --markdown-blockquote: ${theme.colors.surface.mutedForeground};`);
    vars.push(`  --markdown-blockquote-border: ${theme.colors.interactive.border};`);
    vars.push(`  --markdown-list-marker: ${this.opacity(primary, 0.6)};`);
    vars.push(`  --markdown-bold: ${theme.colors.surface.foreground};`);
    vars.push(`  --markdown-italic: ${this.opacity(theme.colors.surface.foreground, 0.9)};`);
    vars.push(`  --markdown-strikethrough: ${theme.colors.surface.mutedForeground};`);
    vars.push(`  --markdown-hr: ${theme.colors.interactive.border};`);
    
    return vars;
  }
  
  private generateChatColors(chat: Record<string, string>, theme: Theme): string[] {
    const vars: string[] = [];
    
    vars.push(`  --chat-user-message: ${chat.userMessage || theme.colors.surface.foreground};`);
    vars.push(`  --chat-user-message-bg: ${chat.userMessageBackground || theme.colors.surface.elevated};`);
    vars.push(`  --chat-assistant-message: ${chat.assistantMessage || theme.colors.surface.foreground};`);
    vars.push(`  --chat-assistant-message-bg: ${chat.assistantMessageBackground || theme.colors.surface.muted};`);
    vars.push(`  --chat-timestamp: ${chat.timestamp || theme.colors.surface.mutedForeground};`);
    vars.push(`  --chat-divider: ${chat.divider || theme.colors.interactive.border};`);
    vars.push(`  --chat-typing: ${chat.typing || theme.colors.surface.mutedForeground};`);
    
    return vars;
  }
  
  private generateDefaultChatColors(theme: Theme): string[] {
    const vars: string[] = [];
    
    vars.push(`  --chat-user-message: ${theme.colors.surface.foreground};`);
    vars.push(`  --chat-user-message-bg: ${theme.colors.surface.elevated};`);
    vars.push(`  --chat-assistant-message: ${theme.colors.surface.foreground};`);
    vars.push(`  --chat-assistant-message-bg: ${theme.colors.surface.muted};`);
    vars.push(`  --chat-timestamp: ${theme.colors.surface.mutedForeground};`);
    vars.push(`  --chat-divider: ${theme.colors.interactive.border};`);
    vars.push(`  --chat-typing: ${theme.colors.surface.mutedForeground};`);
    
    return vars;
  }
  
  private generateToolColors(tools: Theme['colors']['tools'], theme: Theme): string[] {
    const vars: string[] = [];
    
    vars.push(`  --tools-background: ${tools?.background || this.opacity(theme.colors.surface.muted, 0.2)};`);
    vars.push(`  --tools-border: ${tools?.border || this.opacity(theme.colors.interactive.border, 0.3)};`);
    vars.push(`  --tools-header-hover: ${tools?.headerHover || this.opacity(theme.colors.surface.muted, 0.3)};`);
    vars.push(`  --tools-icon: ${tools?.icon || theme.colors.surface.mutedForeground};`);
    vars.push(`  --tools-title: ${tools?.title || theme.colors.surface.foreground};`);
    vars.push(`  --tools-description: ${tools?.description || this.opacity(theme.colors.surface.mutedForeground, 0.6)};`);
    
    // Edit tool colors
    if (tools?.edit) {
      vars.push(`  --tools-edit-added: ${tools.edit.added || theme.colors.status.success};`);
      vars.push(`  --tools-edit-added-bg: ${tools.edit.addedBackground || theme.colors.status.successBackground};`);
      vars.push(`  --tools-edit-removed: ${tools.edit.removed || theme.colors.status.error};`);
      vars.push(`  --tools-edit-removed-bg: ${tools.edit.removedBackground || theme.colors.status.errorBackground};`);
      vars.push(`  --tools-edit-modified: ${tools.edit.modified || theme.colors.status.info};`);
      vars.push(`  --tools-edit-modified-bg: ${tools.edit.modifiedBackground || theme.colors.status.infoBackground};`);
      vars.push(`  --tools-edit-line-number: ${tools.edit.lineNumber || this.opacity(theme.colors.surface.mutedForeground, 0.6)};`);
    } else {
      vars.push(`  --tools-edit-added: ${theme.colors.status.success};`);
      vars.push(`  --tools-edit-added-bg: ${theme.colors.status.successBackground};`);
      vars.push(`  --tools-edit-removed: ${theme.colors.status.error};`);
      vars.push(`  --tools-edit-removed-bg: ${theme.colors.status.errorBackground};`);
      vars.push(`  --tools-edit-modified: ${theme.colors.status.info};`);
      vars.push(`  --tools-edit-modified-bg: ${theme.colors.status.infoBackground};`);
      vars.push(`  --tools-edit-line-number: ${this.opacity(theme.colors.surface.mutedForeground, 0.6)};`);
    }
    
    return vars;
  }
  
  private generateDefaultToolColors(theme: Theme): string[] {
    const vars: string[] = [];
    
    vars.push(`  --tools-background: ${this.opacity(theme.colors.surface.muted, 0.2)};`);
    vars.push(`  --tools-border: ${this.opacity(theme.colors.interactive.border, 0.3)};`);
    vars.push(`  --tools-header-hover: ${this.opacity(theme.colors.surface.muted, 0.3)};`);
    vars.push(`  --tools-icon: ${theme.colors.surface.mutedForeground};`);
    vars.push(`  --tools-title: ${theme.colors.surface.foreground};`);
    vars.push(`  --tools-description: ${this.opacity(theme.colors.surface.mutedForeground, 0.6)};`);
    
    // Edit tool colors
    vars.push(`  --tools-edit-added: ${theme.colors.status.success};`);
    vars.push(`  --tools-edit-added-bg: ${theme.colors.status.successBackground};`);
    vars.push(`  --tools-edit-removed: ${theme.colors.status.error};`);
    vars.push(`  --tools-edit-removed-bg: ${theme.colors.status.errorBackground};`);
    vars.push(`  --tools-edit-modified: ${theme.colors.status.info};`);
    vars.push(`  --tools-edit-modified-bg: ${theme.colors.status.infoBackground};`);
    vars.push(`  --tools-edit-line-number: ${this.opacity(theme.colors.surface.mutedForeground, 0.6)};`);
    
    return vars;
  }
  
  private generateConfigVariables(config: Theme['config']): string[] {
    const vars: string[] = [];
    
    if (!config) return vars;
    
    // Fonts
    if (config.fonts) {
      if (config.fonts.sans) vars.push(`  --font-sans: ${config.fonts.sans};`);
      if (config.fonts.mono) vars.push(`  --font-mono: ${config.fonts.mono};`);
      if (config.fonts.heading) vars.push(`  --font-heading: ${config.fonts.heading};`);
    }
    
    // Border radius
    if (config.radius) {
      if (config.radius.none) vars.push(`  --radius-none: ${config.radius.none};`);
      if (config.radius.sm) vars.push(`  --radius-sm: ${config.radius.sm};`);
      if (config.radius.md) vars.push(`  --radius-md: ${config.radius.md};`);
      if (config.radius.lg) vars.push(`  --radius-lg: ${config.radius.lg};`);
      if (config.radius.xl) vars.push(`  --radius-xl: ${config.radius.xl};`);
      if (config.radius.full) vars.push(`  --radius-full: ${config.radius.full};`);
    }
    
    // Transitions
    if (config.transitions) {
      if (config.transitions.fast) vars.push(`  --transition-fast: ${config.transitions.fast};`);
      if (config.transitions.normal) vars.push(`  --transition-normal: ${config.transitions.normal};`);
      if (config.transitions.slow) vars.push(`  --transition-slow: ${config.transitions.slow};`);
    }
    
    return vars;
  }
  
  private generateTypographyVariables(typography: Theme['typography']): string[] {
    const vars: string[] = [];
    
    // Generate base scale variables
    vars.push('  /* Typography Scale */');
    for (const [size, styles] of Object.entries(typography.scale)) {
      const sizeKey = size.startsWith('2') || size.startsWith('3') || size.startsWith('4') || size.startsWith('5') 
        ? `-${size}` // Add hyphen before 2xl, 3xl, etc.
        : `-${size}`; // Add hyphen for xs, sm, base, lg, xl too
      vars.push(`  --font-size${sizeKey}: ${styles.fontSize};`);
      vars.push(`  --line-height${sizeKey}: ${styles.lineHeight};`);
      if (styles.letterSpacing) {
        vars.push(`  --letter-spacing${sizeKey}: ${styles.letterSpacing};`);
      }
      if (styles.fontWeight) {
        vars.push(`  --font-weight${sizeKey}: ${styles.fontWeight};`);
      }
    }
    
    // Generate heading variables
    vars.push('  /* Heading Typography */');
    for (const [level, styles] of Object.entries(typography.heading)) {
      vars.push(`  --${level}-font-size: ${styles.fontSize};`);
      vars.push(`  --${level}-line-height: ${styles.lineHeight};`);
      if (styles.letterSpacing) {
        vars.push(`  --${level}-letter-spacing: ${styles.letterSpacing};`);
      }
      if (styles.fontWeight) {
        vars.push(`  --${level}-font-weight: ${styles.fontWeight};`);
      }
    }
    
    // Generate UI element typography
    vars.push('  /* UI Typography */');
    for (const [element, styles] of Object.entries(typography.ui)) {
      const elementKey = this.kebabCase(element);
      vars.push(`  --ui-${elementKey}-font-size: ${styles.fontSize};`);
      vars.push(`  --ui-${elementKey}-line-height: ${styles.lineHeight};`);
      if (styles.letterSpacing) {
        vars.push(`  --ui-${elementKey}-letter-spacing: ${styles.letterSpacing};`);
      }
      if (styles.fontWeight) {
        vars.push(`  --ui-${elementKey}-font-weight: ${styles.fontWeight};`);
      }
    }
    
    // Generate code typography
    vars.push('  /* Code Typography */');
    for (const [type, styles] of Object.entries(typography.code)) {
      const typeKey = this.kebabCase(type);
      vars.push(`  --code-${typeKey}-font-size: ${styles.fontSize};`);
      vars.push(`  --code-${typeKey}-line-height: ${styles.lineHeight};`);
      if (styles.letterSpacing) {
        vars.push(`  --code-${typeKey}-letter-spacing: ${styles.letterSpacing};`);
      }
      if (styles.fontWeight) {
        vars.push(`  --code-${typeKey}-font-weight: ${styles.fontWeight};`);
      }
    }
    
    // Generate markdown typography
    vars.push('  /* Markdown Typography */');
    for (const [element, styles] of Object.entries(typography.markdown)) {
      const elementKey = this.kebabCase(element);
      vars.push(`  --markdown-${elementKey}-font-size: ${styles.fontSize};`);
      vars.push(`  --markdown-${elementKey}-line-height: ${styles.lineHeight};`);
      if (styles.letterSpacing) {
        vars.push(`  --markdown-${elementKey}-letter-spacing: ${styles.letterSpacing};`);
      }
      if (styles.fontWeight) {
        vars.push(`  --markdown-${elementKey}-font-weight: ${styles.fontWeight};`);
      }
    }
    
    return vars;
  }
  
  private initializeInheritanceMap(): void {
    // Component inheritance mappings
    this.inheritanceMap.set('header.background', 'surface.background');
    this.inheritanceMap.set('header.foreground', 'surface.foreground');
    this.inheritanceMap.set('header.logoTint', 'primary.base');
    this.inheritanceMap.set('header.divider', 'interactive.border');
    
    this.inheritanceMap.set('sidebar.background', 'surface.muted');
    this.inheritanceMap.set('sidebar.foreground', 'surface.mutedForeground');
    this.inheritanceMap.set('sidebar.hover', 'interactive.hover');
    this.inheritanceMap.set('sidebar.active', 'primary.base');
    this.inheritanceMap.set('sidebar.activeForeground', 'primary.foreground');
    
    // Add more mappings as needed...
  }
  
  // Color manipulation utilities
  private opacity(color: string, alpha: number): string {
    if (color.startsWith('#')) {
      return `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
    }
    if (color.startsWith('rgb')) {
      return color.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
    }
    return color;
  }
  
  private darken(color: string, percent: number): string {
    // Simple darkening - in production, use a proper color library
    if (color.startsWith('#')) {
      const num = parseInt(color.slice(1), 16);
      const amt = Math.round(2.55 * percent);
      const R = (num >> 16) - amt;
      const G = (num >> 8 & 0x00FF) - amt;
      const B = (num & 0x0000FF) - amt;
      return '#' + (0x1000000 + (R < 255 ? R < 0 ? 0 : R : 255) * 0x10000 + 
        (G < 255 ? G < 0 ? 0 : G : 255) * 0x100 + 
        (B < 255 ? B < 0 ? 0 : B : 255)).toString(16).slice(1);
    }
    return color;
  }
  
  private lighten(color: string, percent: number): string {
    // Simple lightening - in production, use a proper color library
    if (color.startsWith('#')) {
      const num = parseInt(color.slice(1), 16);
      const amt = Math.round(2.55 * percent);
      const R = (num >> 16) + amt;
      const G = (num >> 8 & 0x00FF) + amt;
      const B = (num & 0x0000FF) + amt;
      return '#' + (0x1000000 + (R < 255 ? R < 0 ? 0 : R : 255) * 0x10000 + 
        (G < 255 ? G < 0 ? 0 : G : 255) * 0x100 + 
        (B < 255 ? B < 0 ? 0 : B : 255)).toString(16).slice(1);
    }
    return color;
  }
  
  private adjustHue(color: string, degrees: number): string {
    // Simple hue adjustment - in production, use a proper color library
    // For now, just return the color slightly modified
    return this.lighten(color, degrees / 10);
  }
  
  private emphasize(color: string): string {
    // Make the color more prominent
    return this.lighten(color, 15);
  }
  
  private kebabCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }
}