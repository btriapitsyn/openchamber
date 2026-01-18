import { describe, it, expect } from 'vitest';
import { getEditModeColors } from './editModeColors';

describe('getEditModeColors', () => {
  it('should return null for undefined mode', () => {
    expect(getEditModeColors(undefined)).toBeNull();
  });

  it('should return null for null mode', () => {
    expect(getEditModeColors(null)).toBeNull();
  });

  it('should return null for ask mode', () => {
    expect(getEditModeColors('ask')).toBeNull();
  });

  it('should return null for deny mode', () => {
    expect(getEditModeColors('deny')).toBeNull();
  });

  it('should return info colors for full mode', () => {
    const colors = getEditModeColors('full');
    expect(colors).not.toBeNull();
    expect(colors?.text).toBe('var(--status-info)');
    expect(colors?.border).toBe('var(--status-info-border)');
    expect(colors?.background).toBe('var(--status-info-background)');
    expect(colors?.borderWidth).toBe(1.5);
  });

  it('should return success colors for allow mode', () => {
    const colors = getEditModeColors('allow');
    expect(colors).not.toBeNull();
    expect(colors?.text).toBe('var(--status-success)');
    expect(colors?.border).toBe('var(--status-success-border)');
    expect(colors?.background).toBe('var(--status-success-background)');
    expect(colors?.borderWidth).toBe(1.5);
  });
});
