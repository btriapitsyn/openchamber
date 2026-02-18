/**
 * Text segment type for inline code parsing.
 */
export type TextSegment = { type: 'text'; content: string } | { type: 'code'; content: string };

/**
 * Parse text to extract inline code segments (single backticks).
 * - Triple backticks are NOT parsed (left as literal text)
 * - Empty backticks (``) render as empty code element
 * - Unmatched backticks render as literal backtick
 */
export function parseInlineCode(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let i = 0;

  while (i < text.length) {
    // Check for triple backticks - skip them (leave as literal text)
    if (text.slice(i, i + 3) === '```') {
      // Find the end of the triple backtick block or just consume the opening
      const endTriple = text.indexOf('```', i + 3);
      if (endTriple !== -1) {
        // Found closing triple backticks - add entire block as text
        segments.push({ type: 'text', content: text.slice(i, endTriple + 3) });
        i = endTriple + 3;
      } else {
        // No closing triple backticks - add as text
        segments.push({ type: 'text', content: text.slice(i, i + 3) });
        i += 3;
      }
      continue;
    }

    // Check for single backtick
    if (text[i] === '`') {
      // Find the closing backtick (but not a triple backtick situation)
      let j = i + 1;
      while (j < text.length && text[j] !== '`') {
        j++;
      }

      if (j < text.length) {
        // Found closing backtick
        const codeContent = text.slice(i + 1, j);
        segments.push({ type: 'code', content: codeContent });
        i = j + 1;
      } else {
        // No closing backtick - render as literal backtick
        segments.push({ type: 'text', content: '`' });
        i++;
      }
      continue;
    }

    // Regular text - collect until we hit a backtick
    let j = i;
    while (j < text.length && text[j] !== '`') {
      j++;
    }
    segments.push({ type: 'text', content: text.slice(i, j) });
    i = j;
  }

  return segments;
}
