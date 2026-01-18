import { describe, it, expect } from 'vitest';
import {
  SEMANTIC_TYPOGRAPHY,
  FONT_SIZE_SCALES,
  VSCODE_TYPOGRAPHY,
  getTypographyVariable,
  getTypographyClass,
  getTypographyStyle,
  typography,
  toolDisplayStyles,
  TYPOGRAPHY_CLASSES,
} from './typography';

describe('SEMANTIC_TYPOGRAPHY constants', () => {
  it('should have all required typography keys', () => {
    expect(SEMANTIC_TYPOGRAPHY.markdown).toBeDefined();
    expect(SEMANTIC_TYPOGRAPHY.code).toBeDefined();
    expect(SEMANTIC_TYPOGRAPHY.uiHeader).toBeDefined();
    expect(SEMANTIC_TYPOGRAPHY.uiLabel).toBeDefined();
    expect(SEMANTIC_TYPOGRAPHY.meta).toBeDefined();
    expect(SEMANTIC_TYPOGRAPHY.micro).toBeDefined();
  });

  it('should have valid rem values', () => {
    Object.values(SEMANTIC_TYPOGRAPHY).forEach((value) => {
      expect(value).toMatch(/^\d+(\.\d+)?rem$/);
    });
  });
});

describe('FONT_SIZE_SCALES', () => {
  it('should have small, medium, and large scales', () => {
    expect(FONT_SIZE_SCALES.small).toBeDefined();
    expect(FONT_SIZE_SCALES.medium).toBeDefined();
    expect(FONT_SIZE_SCALES.large).toBeDefined();
  });

  it('should have medium equal to SEMANTIC_TYPOGRAPHY', () => {
    expect(FONT_SIZE_SCALES.medium).toBe(SEMANTIC_TYPOGRAPHY);
  });

  it('should have smaller values in small scale', () => {
    expect(parseFloat(FONT_SIZE_SCALES.small.markdown)).toBeLessThan(
      parseFloat(FONT_SIZE_SCALES.medium.markdown)
    );
  });

  it('should have larger values in large scale', () => {
    expect(parseFloat(FONT_SIZE_SCALES.large.markdown)).toBeGreaterThan(
      parseFloat(FONT_SIZE_SCALES.medium.markdown)
    );
  });
});

describe('VSCODE_TYPOGRAPHY', () => {
  it('should have all required typography keys', () => {
    expect(VSCODE_TYPOGRAPHY.markdown).toBeDefined();
    expect(VSCODE_TYPOGRAPHY.code).toBeDefined();
    expect(VSCODE_TYPOGRAPHY.uiHeader).toBeDefined();
    expect(VSCODE_TYPOGRAPHY.uiLabel).toBeDefined();
    expect(VSCODE_TYPOGRAPHY.meta).toBeDefined();
    expect(VSCODE_TYPOGRAPHY.micro).toBeDefined();
  });

  it('should have slightly smaller values than SEMANTIC_TYPOGRAPHY', () => {
    expect(parseFloat(VSCODE_TYPOGRAPHY.markdown)).toBeLessThanOrEqual(
      parseFloat(SEMANTIC_TYPOGRAPHY.markdown)
    );
  });
});

describe('getTypographyVariable', () => {
  it('should convert camelCase to kebab-case CSS variable', () => {
    expect(getTypographyVariable('markdown')).toBe('--text-markdown');
    expect(getTypographyVariable('uiHeader')).toBe('--text-ui-header');
    expect(getTypographyVariable('uiLabel')).toBe('--text-ui-label');
  });

  it('should handle single word keys', () => {
    expect(getTypographyVariable('meta')).toBe('--text-meta');
    expect(getTypographyVariable('micro')).toBe('--text-micro');
    expect(getTypographyVariable('code')).toBe('--text-code');
  });
});

describe('getTypographyClass', () => {
  it('should return correct class for each key', () => {
    expect(getTypographyClass('markdown')).toBe('typography-markdown');
    expect(getTypographyClass('code')).toBe('typography-code');
    expect(getTypographyClass('uiHeader')).toBe('typography-ui-header');
    expect(getTypographyClass('uiLabel')).toBe('typography-ui-label');
    expect(getTypographyClass('meta')).toBe('typography-meta');
    expect(getTypographyClass('micro')).toBe('typography-micro');
  });
});

describe('TYPOGRAPHY_CLASSES', () => {
  it('should have all semantic typography classes', () => {
    expect(TYPOGRAPHY_CLASSES.markdown).toBe('typography-markdown');
    expect(TYPOGRAPHY_CLASSES.code).toBe('typography-code');
    expect(TYPOGRAPHY_CLASSES.uiHeader).toBe('typography-ui-header');
    expect(TYPOGRAPHY_CLASSES.uiLabel).toBe('typography-ui-label');
    expect(TYPOGRAPHY_CLASSES.meta).toBe('typography-meta');
    expect(TYPOGRAPHY_CLASSES.micro).toBe('typography-micro');
  });
});

describe('getTypographyStyle', () => {
  it('should return style object for valid path', () => {
    const style = getTypographyStyle('ui.button');
    expect(style).toHaveProperty('fontSize');
    expect(style.fontSize).toBe('var(--text-ui-label)');
  });

  it('should return style for nested paths', () => {
    const style = getTypographyStyle('code.inline');
    expect(style.fontSize).toBe('var(--text-code)');
  });

  it('should return empty object for invalid path', () => {
    const style = getTypographyStyle('nonexistent.path');
    expect(style).toEqual({});
  });

  it('should return fallback for invalid path when provided', () => {
    const fallback = { fontSize: '16px' };
    const style = getTypographyStyle('invalid', fallback);
    expect(style).toEqual(fallback);
  });

  it('should handle single segment paths', () => {
    const style = getTypographyStyle('meta');
    expect(style).toHaveProperty('fontSize');
  });
});

describe('typography object', () => {
  it('should have semantic styles', () => {
    expect(typography.semanticMarkdown.fontSize).toBe('var(--text-markdown)');
    expect(typography.semanticCode.fontSize).toBe('var(--text-code)');
  });

  it('should have ui styles', () => {
    expect(typography.ui.button).toBeDefined();
    expect(typography.ui.label).toBeDefined();
    expect(typography.ui.input).toBeDefined();
  });

  it('should have code styles', () => {
    expect(typography.code.inline).toBeDefined();
    expect(typography.code.block).toBeDefined();
    expect(typography.code.lineNumbers).toBeDefined();
  });

  it('should have markdown styles', () => {
    expect(typography.markdown.body).toBeDefined();
    expect(typography.markdown.blockquote).toBeDefined();
    expect(typography.markdown.code).toBeDefined();
  });

  it('should have tool styles', () => {
    expect(typography.tool.collapsed).toBeDefined();
    expect(typography.tool.popup).toBeDefined();
    expect(typography.tool.inline).toBeDefined();
  });
});

describe('toolDisplayStyles', () => {
  it('should have padding values', () => {
    expect(toolDisplayStyles.padding.collapsed).toBeDefined();
    expect(toolDisplayStyles.padding.popup).toBeDefined();
    expect(toolDisplayStyles.padding.popupContainer).toBeDefined();
  });

  it('should have background opacity values', () => {
    expect(toolDisplayStyles.backgroundOpacity.muted).toBe('30');
    expect(toolDisplayStyles.backgroundOpacity.mutedAlt).toBe('50');
  });

  it('should return collapsed styles', () => {
    const styles = toolDisplayStyles.getCollapsedStyles();
    expect(styles.padding).toBe(toolDisplayStyles.padding.collapsed);
    expect(styles.background).toBe('transparent');
    expect(styles.borderRadius).toBe(0);
  });

  it('should return popup styles', () => {
    const styles = toolDisplayStyles.getPopupStyles();
    expect(styles.padding).toBe(toolDisplayStyles.padding.popup);
    expect(styles.borderRadius).toBe('0.75rem');
  });

  it('should return popup container styles', () => {
    const styles = toolDisplayStyles.getPopupContainerStyles();
    expect(styles.padding).toBe(toolDisplayStyles.padding.popupContainer);
    expect(styles.overflowX).toBe('auto');
  });

  it('should return inline styles', () => {
    const styles = toolDisplayStyles.getInlineStyles();
    expect(styles).toEqual(typography.tool.inline);
  });
});
