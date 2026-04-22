/**
 * Pure helper for building a structured brief from a GitHub issue.
 * No external dependencies, fully deterministic.
 */

const ACCEPTANCE_CRITERIA_HEADINGS = [
  '## acceptance criteria',
  '## acceptance',
  '## criteria',
  '### acceptance criteria',
  '### acceptance',
];

const MENTIONED_FILE_PATTERN = /(?:^|[\s\(\[\{"'`])([a-zA-Z0-9._\-]+\/[a-zA-Z0-9._\-/]+\.[a-zA-Z0-9]+)(?=[\s\)\]\}\"'`]|$)/gm;

/**
 * Extract the acceptance criteria section from a Markdown body, if any.
 * Parses line-by-line to avoid substring-match bugs.
 * @param {string} body
 * @returns {string | undefined}
 */
export function extractAcceptanceCriteria(body) {
  const lines = body.replace(/\r\n/g, '\n').split('\n');

  let startLine = -1;
  let bestHeading = '';

  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase().trim();
    for (const heading of ACCEPTANCE_CRITERIA_HEADINGS) {
      if (lower.startsWith(heading)) {
        if (heading.length > bestHeading.length) {
          startLine = i;
          bestHeading = heading;
        }
        break;
      }
    }
  }

  if (startLine === -1) {
    return undefined;
  }

  // Collect lines after the heading until the next h2/h3 or blank-double-line
  const result = [];
  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{2,3}\s/.test(line.trim())) {
      break;
    }
    result.push(line);
  }

  const raw = result.join('\n').trim();
  if (!raw) {
    return undefined;
  }

  return raw.replace(/^[:\s]+/, '');
}

/**
 * Extract file paths mentioned in the issue body.
 * Uses a conservative regex to avoid false positives.
 * @param {string} body
 * @returns {string[]}
 */
export function extractMentionedFiles(body) {
  const matches = new Set();
  let m;
  const pattern = new RegExp(MENTIONED_FILE_PATTERN.source, MENTIONED_FILE_PATTERN.flags);
  // eslint-disable-next-line no-cond-assign
  while ((m = pattern.exec(body)) !== null) {
    matches.add(m[1]);
  }
  return Array.from(matches);
}

/**
 * Build a structured brief from raw issue data.
 * @param {{number: number, title: string, body: string, labels: string[], repoFullName: string}} args
 * @returns {{title: string, body: string, acceptanceCriteria?: string, mentionedFiles: string[], labels: string[], number: number, repoFullName: string}}
 */
export function buildIssueBrief(args) {
  const acceptanceCriteria = extractAcceptanceCriteria(args.body);
  const mentionedFiles = extractMentionedFiles(args.body);

  return {
    title: args.title,
    body: args.body,
    ...(acceptanceCriteria ? { acceptanceCriteria } : {}),
    mentionedFiles,
    labels: args.labels,
    number: args.number,
    repoFullName: args.repoFullName,
  };
}

/**
 * Render the brief as a plain Markdown string suitable for
 * prefilling an OpenCode session message.
 * @param {{title: string, body: string, acceptanceCriteria?: string, mentionedFiles: string[], labels: string[], number: number, repoFullName: string}} brief
 * @returns {string}
 */
export function renderBrief(brief) {
  const lines = [
    `## Issue #${brief.number}: ${brief.title}`,
    '',
    `Repository: ${brief.repoFullName}`,
    `Labels: ${brief.labels.join(', ') || 'none'}`,
    '',
    '### Description',
    brief.body || '(no description provided)',
  ];

  if (brief.acceptanceCriteria) {
    lines.push('', '### Acceptance Criteria', brief.acceptanceCriteria);
  }

  if (brief.mentionedFiles.length > 0) {
    lines.push('', '### Mentioned Files', ...brief.mentionedFiles.map((f) => `- \`${f}\``));
  }

  return lines.join('\n');
}
