/**
 * SerializeAddon for ghostty-web
 * 
 * Port of xterm.js addon-serialize for ghostty-web terminal.
 * Enables serialization of terminal contents to restore state after reconnection.
 * 
 * Features:
 * - ANSI color preservation (16-color, 256-color, RGB)
 * - Text attributes (bold, italic, underline, faint, strikethrough, blink, inverse, invisible, dim)
 * - Scrollback support with configurable limits
 * - Round-trip compatibility
 * - Cursor positioning
 */

import type { Terminal as GhosttyTerminal } from 'ghostty-web';

// Constants for ANSI escape codes
const C0 = {
  ESC: '\u001b',
};

const SGR = {
  RESET: 0,
  BOLD: 1,
  DIM: 2,
  ITALIC: 3,
  UNDERLINE: 4,
  SLOW_BLINK: 5,
  RAPID_BLINK: 6,
  INVERSE: 7,
  INVISIBLE: 8,
  STRIKETHROUGH: 9,
  NORMAL_INTENSITY: 22,
  NO_ITALIC: 23,
  NO_UNDERLINE: 24,
  NO_BLINK: 25,
  NO_INVERSE: 27,
  VISIBLE: 28,
  NO_STRIKETHROUGH: 29,
  FG_DEFAULT: 39,
  BG_DEFAULT: 49,
};

export interface SerializeOptions {
  /**
   * The row range to serialize. When an explicit range is specified, the cursor
   * will get its final repositioning.
   */
  range?: {
    start: number;
    end: number;
  };

  /**
   * The number of rows in the scrollback buffer to serialize, starting from
   * the bottom of the scrollback buffer. When not specified, all available
   * rows in the scrollback buffer will be serialized.
   */
  scrollback?: number;

  /**
   * Whether to exclude the terminal modes from the serialization.
   * Default: false
   */
  excludeModes?: boolean;

  /**
   * Whether to exclude the alt buffer from the serialization.
   * Default: false
   */
  excludeAltBuffer?: boolean;
}

export interface TextSerializeOptions {
  /**
   * The number of rows in the scrollback buffer to serialize, starting from
   * the bottom of the scrollback buffer.
   */
  scrollback?: number;

  /**
   * Whether to trim trailing whitespace from lines.
   * Default: true
   */
  trimWhitespace?: boolean;
}

interface CellState {
  fg: number | null;
  bg: number | null;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  blink: boolean;
  inverse: boolean;
  invisible: boolean;
  strikethrough: boolean;
}

const NULL_CELL_STATE: CellState = {
  fg: null,
  bg: null,
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  blink: false,
  inverse: false,
  invisible: false,
  strikethrough: false,
};

/**
 * SerializeAddon for ghostty-web terminal
 */
export class SerializeAddon {
  private _terminal: GhosttyTerminal | undefined;

  /**
   * Activate the addon
   */
  activate(terminal: GhosttyTerminal): void {
    this._terminal = terminal;
  }

  /**
   * Dispose the addon
   */
  dispose(): void {
    this._terminal = undefined;
  }

  /**
   * Serialize the terminal buffer to ANSI escape sequences
   */
  serialize(options: SerializeOptions = {}): string {
    if (!this._terminal) {
      throw new Error('SerializeAddon not activated');
    }

    const buffer = this._terminal.buffer.active;
    if (!buffer) {
      return '';
    }

    const result: string[] = [];
    let currentState: CellState = { ...NULL_CELL_STATE };

    // Determine range to serialize
    const scrollbackLimit = options.scrollback ?? buffer.length;

    let startRow: number;
    let endRow: number;

    if (options.range) {
      startRow = options.range.start;
      endRow = options.range.end;
    } else {
      // Serialize scrollback + viewport
      const totalRows = buffer.length;
      const scrollbackRows = Math.min(scrollbackLimit, totalRows - buffer.baseY);
      startRow = Math.max(0, buffer.baseY - scrollbackRows);
      endRow = buffer.baseY + buffer.cursorY;
    }

    // Clamp to valid range
    startRow = Math.max(0, startRow);
    endRow = Math.min(buffer.length - 1, endRow);

    for (let y = startRow; y <= endRow; y++) {
      const line = buffer.getLine(y);
      if (!line) {
        result.push('\r\n');
        continue;
      }

      let lineContent = '';
      let lastNonSpaceCol = -1;

      // Find the last non-space column
      for (let x = line.length - 1; x >= 0; x--) {
        const cell = line.getCell(x);
        if (cell) {
          const char = this._getCellChar(cell);
          if (char !== ' ' && char !== '') {
            lastNonSpaceCol = x;
            break;
          }
        }
      }

      // Serialize each cell up to the last non-space
      for (let x = 0; x <= lastNonSpaceCol; x++) {
        const cell = line.getCell(x);
        if (!cell) {
          lineContent += ' ';
          continue;
        }

        // Get cell attributes and generate SGR sequences if needed
        const newState = this._getCellState(cell);
        const sgrSequences = this._generateSgrDiff(currentState, newState);
        if (sgrSequences) {
          lineContent += sgrSequences;
          currentState = newState;
        }

        // Get character
        const char = this._getCellChar(cell);
        lineContent += char || ' ';
      }

      // Reset attributes at end of line if any were set
      if (this._hasAttributes(currentState)) {
        lineContent += `${C0.ESC}[${SGR.RESET}m`;
        currentState = { ...NULL_CELL_STATE };
      }

      result.push(lineContent);

      // Add newline unless it's the last row with cursor
      if (y < endRow) {
        result.push('\r\n');
      }
    }

    // Position cursor
    const cursorY = buffer.cursorY;
    const cursorX = buffer.cursorX;
    if (cursorY >= 0 && cursorX >= 0) {
      // Use CUP (Cursor Position) to move cursor to correct position
      // CUP is 1-based, so add 1 to both coordinates
      const relativeY = cursorY - (endRow - buffer.baseY);
      if (relativeY !== 0 || cursorX !== 0) {
        result.push(`${C0.ESC}[${cursorY + 1};${cursorX + 1}H`);
      }
    }

    return result.join('');
  }

  /**
   * Serialize the terminal buffer to plain text (no escape sequences)
   */
  serializeAsText(options: TextSerializeOptions = {}): string {
    if (!this._terminal) {
      throw new Error('SerializeAddon not activated');
    }

    const buffer = this._terminal.buffer.active;
    if (!buffer) {
      return '';
    }

    const trimWhitespace = options.trimWhitespace ?? true;
    const scrollbackLimit = options.scrollback ?? buffer.length;
    
    const result: string[] = [];

    // Determine range
    const totalRows = buffer.length;
    const scrollbackRows = Math.min(scrollbackLimit, totalRows - buffer.baseY);
    const startRow = Math.max(0, buffer.baseY - scrollbackRows);
    const endRow = buffer.baseY + buffer.cursorY;

    for (let y = startRow; y <= endRow; y++) {
      const line = buffer.getLine(y);
      if (!line) {
        result.push('');
        continue;
      }

      let lineContent = '';
      for (let x = 0; x < line.length; x++) {
        const cell = line.getCell(x);
        if (cell) {
          const char = this._getCellChar(cell);
          lineContent += char || ' ';
        } else {
          lineContent += ' ';
        }
      }

      if (trimWhitespace) {
        lineContent = lineContent.trimEnd();
      }

      result.push(lineContent);
    }

    return result.join('\n');
  }

  /**
   * Get the character from a cell, handling wide characters and special codepoints
   */
  private _getCellChar(cell: { getChars?: () => string; getCodepoint?: () => number }): string {
    // Try getChars() first (ghostty-web standard)
    if (typeof cell.getChars === 'function') {
      const chars = cell.getChars();
      if (chars) return chars;
    }

    // Try getCodepoint()
    if (typeof cell.getCodepoint === 'function') {
      const codepoint = cell.getCodepoint();
      if (codepoint && codepoint > 0 && codepoint <= 0x10FFFF && 
          !(codepoint >= 0xD800 && codepoint <= 0xDFFF)) {
        return String.fromCodePoint(codepoint);
      }
    }

    // Fallback
    return ' ';
  }

  /**
   * Get the state of a cell (colors and attributes)
   */
  private _getCellState(cell: {
    getFgColor?: () => number;
    getBgColor?: () => number;
    isBold?: () => boolean | number;
    isDim?: () => boolean | number;
    isFaint?: () => boolean | number;
    isItalic?: () => boolean | number;
    isUnderline?: () => boolean | number;
    isBlink?: () => boolean | number;
    isInverse?: () => boolean | number;
    isInvisible?: () => boolean | number;
    isStrikethrough?: () => boolean | number;
  }): CellState {
    const state: CellState = { ...NULL_CELL_STATE };

    // Get foreground color
    if (typeof cell.getFgColor === 'function') {
      const fg = cell.getFgColor();
      if (fg !== undefined && fg !== null && fg !== -1) {
        state.fg = fg;
      }
    }

    // Get background color
    if (typeof cell.getBgColor === 'function') {
      const bg = cell.getBgColor();
      if (bg !== undefined && bg !== null && bg !== -1) {
        state.bg = bg;
      }
    }

    // Get attributes
    if (typeof cell.isBold === 'function') {
      state.bold = !!cell.isBold();
    }
    if (typeof cell.isDim === 'function') {
      state.dim = !!cell.isDim();
    } else if (typeof cell.isFaint === 'function') {
      state.dim = !!cell.isFaint();
    }
    if (typeof cell.isItalic === 'function') {
      state.italic = !!cell.isItalic();
    }
    if (typeof cell.isUnderline === 'function') {
      state.underline = !!cell.isUnderline();
    }
    if (typeof cell.isBlink === 'function') {
      state.blink = !!cell.isBlink();
    }
    if (typeof cell.isInverse === 'function') {
      state.inverse = !!cell.isInverse();
    }
    if (typeof cell.isInvisible === 'function') {
      state.invisible = !!cell.isInvisible();
    }
    if (typeof cell.isStrikethrough === 'function') {
      state.strikethrough = !!cell.isStrikethrough();
    }

    return state;
  }

  /**
   * Generate SGR escape sequences for the difference between two cell states
   */
  private _generateSgrDiff(from: CellState, to: CellState): string | null {
    const codes: number[] = [];

    // Check if we need a full reset
    const needsReset = 
      (from.bold && !to.bold) ||
      (from.dim && !to.dim) ||
      (from.italic && !to.italic) ||
      (from.underline && !to.underline) ||
      (from.blink && !to.blink) ||
      (from.inverse && !to.inverse) ||
      (from.invisible && !to.invisible) ||
      (from.strikethrough && !to.strikethrough);

    if (needsReset) {
      codes.push(SGR.RESET);
      // After reset, we need to re-apply all 'to' attributes
      if (to.bold) codes.push(SGR.BOLD);
      if (to.dim) codes.push(SGR.DIM);
      if (to.italic) codes.push(SGR.ITALIC);
      if (to.underline) codes.push(SGR.UNDERLINE);
      if (to.blink) codes.push(SGR.SLOW_BLINK);
      if (to.inverse) codes.push(SGR.INVERSE);
      if (to.invisible) codes.push(SGR.INVISIBLE);
      if (to.strikethrough) codes.push(SGR.STRIKETHROUGH);
      
      // Re-apply colors
      if (to.fg !== null) {
        this._appendColorCode(codes, to.fg, true);
      }
      if (to.bg !== null) {
        this._appendColorCode(codes, to.bg, false);
      }
    } else {
      // Apply only changed attributes
      if (!from.bold && to.bold) codes.push(SGR.BOLD);
      if (!from.dim && to.dim) codes.push(SGR.DIM);
      if (!from.italic && to.italic) codes.push(SGR.ITALIC);
      if (!from.underline && to.underline) codes.push(SGR.UNDERLINE);
      if (!from.blink && to.blink) codes.push(SGR.SLOW_BLINK);
      if (!from.inverse && to.inverse) codes.push(SGR.INVERSE);
      if (!from.invisible && to.invisible) codes.push(SGR.INVISIBLE);
      if (!from.strikethrough && to.strikethrough) codes.push(SGR.STRIKETHROUGH);

      // Handle color changes
      if (from.fg !== to.fg) {
        if (to.fg === null) {
          codes.push(SGR.FG_DEFAULT);
        } else {
          this._appendColorCode(codes, to.fg, true);
        }
      }
      if (from.bg !== to.bg) {
        if (to.bg === null) {
          codes.push(SGR.BG_DEFAULT);
        } else {
          this._appendColorCode(codes, to.bg, false);
        }
      }
    }

    if (codes.length === 0) {
      return null;
    }

    return `${C0.ESC}[${codes.join(';')}m`;
  }

  /**
   * Append color code to the codes array
   */
  private _appendColorCode(codes: number[], color: number, isForeground: boolean): void {
    const base = isForeground ? 30 : 40;
    const extBase = isForeground ? 38 : 48;

    if (color < 8) {
      // Basic 8 colors
      codes.push(base + color);
    } else if (color < 16) {
      // Bright 8 colors
      codes.push(base + 60 + (color - 8));
    } else if (color < 256) {
      // 256-color palette
      codes.push(extBase, 5, color);
    } else {
      // RGB (24-bit) color encoded as 0xRRGGBB + 0x1000000
      const rgb = color - 0x1000000;
      const r = (rgb >> 16) & 0xFF;
      const g = (rgb >> 8) & 0xFF;
      const b = rgb & 0xFF;
      codes.push(extBase, 2, r, g, b);
    }
  }

  /**
   * Check if the state has any attributes set
   */
  private _hasAttributes(state: CellState): boolean {
    return (
      state.fg !== null ||
      state.bg !== null ||
      state.bold ||
      state.dim ||
      state.italic ||
      state.underline ||
      state.blink ||
      state.inverse ||
      state.invisible ||
      state.strikethrough
    );
  }
}
