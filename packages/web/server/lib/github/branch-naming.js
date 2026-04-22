/**
 * Pure helper for deriving git branch names from GitHub issue metadata.
 * No external dependencies, fully deterministic.
 */

/**
 * Map issue labels to branch prefixes.
 * @param {string[]} labels
 * @returns {string}
 */
export function resolveBranchPrefix(labels) {
  const normalized = labels.map((l) => l.toLowerCase().trim());
  if (normalized.includes('bug')) {
    return 'fix';
  }
  if (normalized.includes('enhancement') || normalized.includes('feature')) {
    return 'feat';
  }
  return 'work';
}

/**
 * Create a URL-friendly slug from arbitrary text.
 * Rules:
 * - ASCII lower-case
 * - non-[a-z0-9] → '-'
 * - collapse repeated dashes
 * - trim dashes from edges
 * - max 40 characters
 * @param {string} value
 * @returns {string}
 */
export function slugify(value) {
  const ascii =
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\x00-\x7F]/g, '') // strip non-ASCII
      .replace(/[^a-z0-9]+/g, '-') // non-alphanum → dash
      .replace(/^-+|-+$/g, '') // trim dashes
      .replace(/-+/g, '-') || // collapse repeated dashes
    'issue'; // absolute fallback

  return ascii.slice(0, 40);
}

/**
 * Build a branch name from an issue number, title, and labels.
 * Format: <prefix>/<number>-<slug>
 * @param {{number: number, title: string, labels?: string[]}} args
 * @returns {string}
 */
export function buildBranchName(args) {
  const prefix = resolveBranchPrefix(args.labels ?? []);
  const slug = slugify(args.title);
  return `${prefix}/${args.number}-${slug}`;
}
