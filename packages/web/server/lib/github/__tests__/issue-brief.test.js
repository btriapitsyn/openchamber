import { describe, it, expect } from 'vitest';
import {
  extractAcceptanceCriteria,
  extractMentionedFiles,
  buildIssueBrief,
  renderBrief,
} from '../issue-brief.js';

describe('extractAcceptanceCriteria', () => {
  it('finds the acceptance criteria section', () => {
    const body = 'Some intro\n\n## Acceptance Criteria\n- Must handle 404\n- Must retry 3 times\n\n## Notes\nextra';
    expect(extractAcceptanceCriteria(body)).toBe('- Must handle 404\n- Must retry 3 times');
  });

  it('returns undefined when missing', () => {
    expect(extractAcceptanceCriteria('No criteria here')).toBeUndefined();
  });

  it('handles variations of heading', () => {
    expect(extractAcceptanceCriteria('## Criteria\n- Foo')).toBe('- Foo');
    expect(extractAcceptanceCriteria('### Acceptance Criteria\n- Bar')).toBe('- Bar');
  });

  it('handles windows line endings', () => {
    const body = 'Intro\r\n\r\n## Acceptance Criteria\r\n- One\r\n- Two';
    expect(extractAcceptanceCriteria(body)).toBe('- One\n- Two');
  });
});

describe('extractMentionedFiles', () => {
  it('finds file paths in text', () => {
    const body = 'Check src/auth/login.ts and tests/auth/login.test.ts for details.';
    expect(extractMentionedFiles(body)).toEqual([
      'src/auth/login.ts',
      'tests/auth/login.test.ts',
    ]);
  });

  it('ignores non-file-looking paths', () => {
    expect(extractMentionedFiles('See /etc/passwd or http://example.com')).toEqual([]);
  });
});

describe('buildIssueBrief', () => {
  it('builds a complete brief', () => {
    const brief = buildIssueBrief({
      number: 42,
      title: 'Auth bug',
      body: '## Acceptance Criteria\n- Fix it\n\nCheck src/auth.ts',
      labels: ['bug'],
      repoFullName: 'acme/app',
    });

    expect(brief.number).toBe(42);
    expect(brief.title).toBe('Auth bug');
    expect(brief.acceptanceCriteria).toBe('- Fix it\n\nCheck src/auth.ts');
    expect(brief.mentionedFiles).toContain('src/auth.ts');
    expect(brief.labels).toEqual(['bug']);
    expect(brief.repoFullName).toBe('acme/app');
  });
});

describe('renderBrief', () => {
  it('renders a plain Markdown brief', () => {
    const brief = buildIssueBrief({
      number: 1,
      title: 'Hello',
      body: 'World',
      labels: ['feature'],
      repoFullName: 'a/b',
    });
    const text = renderBrief(brief);
    expect(text).toContain('Issue #1: Hello');
    expect(text).toContain('Repository: a/b');
    expect(text).toContain('World');
    expect(text).not.toContain('Acceptance Criteria');
  });

  it('includes acceptance criteria when present', () => {
    const brief = buildIssueBrief({
      number: 2,
      title: 'X',
      body: '## Acceptance Criteria\n- Y',
      labels: [],
      repoFullName: 'a/b',
    });
    const text = renderBrief(brief);
    expect(text).toContain('### Acceptance Criteria');
    expect(text).toContain('- Y');
  });
});
