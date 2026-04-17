import type { Message, Part } from '@opencode-ai/sdk/v2';

type SessionMessageRecord = { info: Message; parts: Part[] };

function extractTextFromParts(parts: Part[]): string {
  return parts
    .filter((p): p is Part & { type: 'text'; text: string } => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
}

function formatMessageAsMarkdown(record: SessionMessageRecord): string {
  const role = record.info.role === 'user' ? '### User' : '### Assistant';
  const text = extractTextFromParts(record.parts).trim();

  if (!text) return '';
  return `${role}\n\n${text}`;
}

export function formatSessionAsMarkdown(
  messages: SessionMessageRecord[],
  sessionTitle?: string | null,
): string {
  const title = sessionTitle?.trim() || 'Session';
  const date = new Date().toISOString().split('T')[0];

  const header = `# ${title}\n\n*Exported on ${date}*\n\n---\n\n`;

  const body = messages
    .map(formatMessageAsMarkdown)
    .filter(Boolean)
    .join('\n\n---\n\n');

  return header + body;
}

export function downloadAsMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function buildExportFilename(sessionTitle?: string | null): string {
  const base = sessionTitle?.trim() || 'session';
  const safe = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const date = new Date().toISOString().split('T')[0];
  return `${safe}-${date}.md`;
}
