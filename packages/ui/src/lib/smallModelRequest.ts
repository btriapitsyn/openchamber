import { toast } from 'sonner';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { z } from 'zod';

const SMALL_MODEL_TOAST_ID = 'small-model-unavailable';
const callableProvidersSchema = z.object({ authenticatedProviders: z.array(z.string()) });

type RuntimeFetch = typeof runtimeFetch;

export async function fetchCallableSmallModelProviders(
  directory: string | null | undefined,
  fetchImpl: RuntimeFetch = runtimeFetch,
): Promise<string[]> {
  const response = await fetchImpl('/api/small-model', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    query: directory ? { directory } : undefined,
  });
  if (!response.ok) throw new Error(`Small Model provider discovery failed (${response.status})`);
  const parsed = callableProvidersSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error('Small Model provider discovery returned an invalid response');
  return [...new Set(parsed.data.authenticatedProviders)];
}

const notifySmallModelUnavailable = (): void => {
  toast.error('Small Model unavailable', {
    id: SMALL_MODEL_TOAST_ID,
    description: 'Choose another model in Settings → Sessions → Small Model and try again.',
  });
};

export async function requestSmallModel(
  init: RequestInit,
  options: { silentStatuses?: number[] } = {},
): Promise<Response> {
  try {
    const response = await runtimeFetch('/api/small-model/generate', init);
    if (!response.ok && !options.silentStatuses?.includes(response.status)) {
      notifySmallModelUnavailable();
    }
    return response;
  } catch (error) {
    notifySmallModelUnavailable();
    throw error;
  }
}
