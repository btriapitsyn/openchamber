/**
 * Get first 2 grapheme clusters from a string
 * Uses Intl.Segmenter when available for proper Unicode handling
 */
export function getFirstTwoGraphemes(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter !== 'undefined') {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    const segments = Array.from(segmenter.segment(trimmed));
    if (segments.length === 0) {
      return '';
    }
    return segments.slice(0, 2).map(s => s.segment).join('');
  }
  
  // Fallback: treat each character as a grapheme cluster
  const chars = Array.from(trimmed);
  return chars.slice(0, 2).join('');
}
