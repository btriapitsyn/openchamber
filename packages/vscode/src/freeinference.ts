export const FREEINFERENCE_PROVIDER_ID = 'freeinference';
export const FREEINFERENCE_NAME = 'FreeInference';
export const FREEINFERENCE_BASE_URL = 'https://freeinference.org/v1';
export const FREEINFERENCE_MODELS_URL = 'https://freeinference.org/v1/models';
export const FREEINFERENCE_NPM = '@ai-sdk/openai-compatible';
const DEFAULT_DISCOVERY_TIMEOUT_MS = 10_000;

export class HttpError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number, cause?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export interface FreeInferenceModel {
  id: string;
  name: string;
}

export interface RawFreeInferenceModelInput {
  id?: string;
  name?: string;
  output_modalities?: string[];
}

export interface RawFreeInferenceResponse {
  data?: RawFreeInferenceModelInput[];
  error?: {
    message?: string;
  };
}

export function normalizeFreeInferenceModel(
  rawModel: RawFreeInferenceModelInput | null | undefined,
): FreeInferenceModel | null {
  if (!rawModel) {
    return null;
  }
  const id = rawModel.id?.trim();
  if (!id) {
    return null;
  }

  // Filter out embedding-only models if output_modalities is specified
  const modalities = rawModel.output_modalities;
  if (Array.isArray(modalities)) {
    const hasTextOutput = modalities.some(
      (modality) => modality.toLowerCase() === 'text',
    );
    if (!hasTextOutput) {
      return null;
    }
  }

  const name = rawModel.name?.trim() || id;
  return { id, name };
}

export interface FreeInferenceRequestHeaders extends Record<string, string | undefined> {
  Accept: string;
  Authorization?: string;
}

export interface FetchFreeInferenceModelsOptions {
  apiKey?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export async function fetchFreeInferenceModels({
  apiKey,
  fetchFn = globalThis.fetch,
  timeoutMs = DEFAULT_DISCOVERY_TIMEOUT_MS,
}: FetchFreeInferenceModelsOptions = {}): Promise<FreeInferenceModel[]> {
  const headers: FreeInferenceRequestHeaders = {
    Accept: 'application/json',
  };

  const trimmedKey = apiKey?.trim();
  if (trimmedKey) {
    headers.Authorization = `Bearer ${trimmedKey}`;
  }

  const signal = 'timeout' in AbortSignal
    ? AbortSignal.timeout(timeoutMs)
    : undefined;

  let response: Response;
  try {
    response = await fetchFn(FREEINFERENCE_MODELS_URL, {
      method: 'GET',
      headers,
      signal,
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    const message = isTimeout
      ? 'Timed out connecting to FreeInference'
      : `Unable to connect to FreeInference: ${error instanceof Error ? error.message : String(error)}`;
    throw new HttpError(message, isTimeout ? 504 : 502, error);
  }

  if (response.status === 401 || response.status === 403) {
    let message = 'Invalid or expired FreeInference API key';
    try {
      // SAFETY: Parsing error response body from FreeInference API to extract user-facing detail
      const errPayload = (await response.json()) as RawFreeInferenceResponse;
      if (errPayload?.error?.message) {
        message = `FreeInference authentication failed: ${errPayload.error.message}`;
      }
    } catch {
      // ignore parse failure on error body
    }
    throw new HttpError(message, response.status);
  }

  if (!response.ok) {
    let errorDetail = '';
    try {
      // SAFETY: Parsing error response body from FreeInference API to extract status detail
      const errPayload = (await response.json()) as RawFreeInferenceResponse;
      if (errPayload?.error?.message) {
        errorDetail = `: ${errPayload.error.message}`;
      }
    } catch {
      // ignore
    }
    const message = `FreeInference API returned status ${response.status}${errorDetail}`;
    throw new HttpError(message, response.status >= 500 ? 502 : response.status);
  }

  let data: RawFreeInferenceResponse;
  try {
    // SAFETY: Response payload from FreeInference /v1/models endpoint
    data = (await response.json()) as RawFreeInferenceResponse;
  } catch (error) {
    throw new HttpError('Invalid JSON received from FreeInference models endpoint', 502, error);
  }

  const rawEntries = Array.isArray(data?.data) ? data.data : null;
  if (!rawEntries) {
    throw new HttpError('FreeInference returned an unexpected payload structure (expected data array)', 502);
  }

  const models = rawEntries
    .map(normalizeFreeInferenceModel)
    .filter((model): model is FreeInferenceModel => Boolean(model));

  if (models.length === 0) {
    throw new HttpError('No usable chat completion models were returned by FreeInference', 502);
  }

  return models;
}

export interface FreeInferenceProviderOptions {
  baseURL: string;
  headers?: Record<string, string>;
}

export interface FreeInferenceProviderConfig {
  npm: string;
  name: string;
  options: FreeInferenceProviderOptions;
  models: Record<string, { name: string }>;
}

export function buildFreeInferenceProviderConfig(
  models: FreeInferenceModel[],
  existingConfig?: { options?: { headers?: Record<string, string> } },
): FreeInferenceProviderConfig {
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error('At least one model is required to build FreeInference provider config');
  }

  const modelsMap: Record<string, { name: string }> = {};
  for (const model of models) {
    if (model?.id) {
      modelsMap[model.id] = { name: model.name || model.id };
    }
  }

  const existingHeaders = existingConfig?.options?.headers;
  const options: FreeInferenceProviderOptions = {
    baseURL: FREEINFERENCE_BASE_URL,
  };
  if (existingHeaders) {
    options.headers = existingHeaders;
  }

  return {
    npm: FREEINFERENCE_NPM,
    name: FREEINFERENCE_NAME,
    options,
    models: modelsMap,
  };
}
