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
}

export interface PromptEnhancementResponse {
  prompt: string;
  rationale: string[];
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
