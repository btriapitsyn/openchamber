import type { PromptEnhancerConfig } from '@/types/promptEnhancer';

export interface PromptEnhancementSelections {
  single: Record<string, string>;
  multi: Record<string, string[]>;
}

export interface PromptEnhancementRequest {
  prompt: string;
  selections: PromptEnhancementSelections;
  configuration: PromptEnhancerConfig;
  additionalConstraints?: string[];
  contextSummary?: string;
  diffDigest?: string;
  includeProjectContext?: boolean;
  includeRepositoryDiff?: boolean;
  workspaceDirectory?: string;
}

export interface PromptEnhancementResponse {
  prompt: string;
  rationale: string[];
}

export interface PromptEnhancementPreviewResponse {
  systemPrompt: string;
  userContent: string;
  userPromptPreview?: string;
  messages: Array<{ role: string; content: string }>;
  summaryEntries: string[];
  summaryBlock: string;
  instructions: string[];
  additionalConstraints: string[];
  contextSummary?: string;
  diffDigest?: string;
  rawPrompt: string;
  projectContext?: string;
  repositoryDiff?: string;
  includeProjectContext?: boolean;
  includeRepositoryDiff?: boolean;
}

const parseErrorResponse = async (response: Response): Promise<string> => {
  const body = await response.json().catch(() => ({}));
  const message =
    typeof body?.error === 'string' && body.error.trim().length > 0
      ? body.error.trim()
      : `${response.status} ${response.statusText || 'Request failed'}`;
  return message;
};

export async function fetchPromptEnhancerConfig(): Promise<PromptEnhancerConfig | null> {
  const response = await fetch('/api/config/prompt-enhancer', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') {
    return null;
  }
  return data as PromptEnhancerConfig;
}

export async function persistPromptEnhancerConfig(config: PromptEnhancerConfig): Promise<PromptEnhancerConfig> {
  const response = await fetch('/api/config/prompt-enhancer', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }
  const data = await response.json().catch(() => null);
  if (data && typeof data === 'object') {
    return data as PromptEnhancerConfig;
  }
  return config;
}

export async function generatePromptEnhancement(
  payload: PromptEnhancementRequest
): Promise<PromptEnhancementResponse> {
  const response = await fetch('/api/prompts/refine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  const data = await response.json().catch(() => null);
  const prompt = typeof data?.prompt === 'string' ? data.prompt.trim() : '';
  const rationale = Array.isArray(data?.rationale)
    ? data.rationale
        .map((item: unknown) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item: string) => item.length > 0)
    : [];

  if (!prompt) {
    throw new Error('Prompt enhancer returned an empty response');
  }

  return { prompt, rationale };
}

export async function previewPromptEnhancement(
  payload: PromptEnhancementRequest
): Promise<PromptEnhancementPreviewResponse> {
  const response = await fetch('/api/prompts/refine/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  const data = await response.json().catch(() => null);
  if (!data || typeof data !== 'object' || typeof (data as any).systemPrompt !== 'string' || typeof (data as any).userContent !== 'string') {
    throw new Error('Prompt preview response malformed');
  }

  const normalizeStringArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item): item is string => item.length > 0)
      : [];

  const normalizeMessages = (value: unknown): Array<{ role: string; content: string }> =>
    Array.isArray(value)
      ? value
          .map((entry) => {
            if (!entry || typeof entry !== 'object') {
              return null;
            }
            const role = typeof (entry as any).role === 'string' ? (entry as any).role : '';
            const content = typeof (entry as any).content === 'string' ? (entry as any).content : '';
            if (!role || !content) {
              return null;
            }
            return { role, content };
          })
          .filter((entry): entry is { role: string; content: string } => Boolean(entry))
      : [];

  return {
    systemPrompt: (data as any).systemPrompt as string,
    userContent: (data as any).userContent as string,
    userPromptPreview:
      typeof (data as any).userPromptPreview === 'string' ? (data as any).userPromptPreview : undefined,
    messages: normalizeMessages((data as any).messages),
    summaryEntries: normalizeStringArray((data as any).summaryEntries),
    summaryBlock: typeof (data as any).summaryBlock === 'string' ? (data as any).summaryBlock : '',
    instructions: normalizeStringArray((data as any).instructions),
    additionalConstraints: normalizeStringArray((data as any).additionalConstraints),
    contextSummary: typeof (data as any).contextSummary === 'string' ? (data as any).contextSummary : undefined,
    diffDigest: typeof (data as any).diffDigest === 'string' ? (data as any).diffDigest : undefined,
    rawPrompt: typeof (data as any).rawPrompt === 'string' ? (data as any).rawPrompt : '',
    projectContext: typeof (data as any).projectContext === 'string' ? (data as any).projectContext : undefined,
    repositoryDiff: typeof (data as any).repositoryDiff === 'string' ? (data as any).repositoryDiff : undefined,
    includeProjectContext: typeof (data as any).includeProjectContext === 'boolean'
      ? (data as any).includeProjectContext
      : undefined,
    includeRepositoryDiff: typeof (data as any).includeRepositoryDiff === 'boolean'
      ? (data as any).includeRepositoryDiff
      : undefined,
  };
}
