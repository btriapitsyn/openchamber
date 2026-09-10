const FREEINFERENCE_PROVIDER_ID = 'freeinference';
const FREEINFERENCE_NAME = 'FreeInference';
const FREEINFERENCE_BASE_URL = 'https://freeinference.org/v1';
const FREEINFERENCE_MODELS_URL = 'https://freeinference.org/v1/models';
const FREEINFERENCE_NPM = '@ai-sdk/openai-compatible';
const DEFAULT_DISCOVERY_TIMEOUT_MS = 10_000;

function isString(value) {
  return Object.prototype.toString.call(value) === '[object String]';
}

function isPlainObject(value) {
  return value !== null && Object.prototype.toString.call(value) === '[object Object]';
}

function isFunction(value) {
  return Object.prototype.toString.call(value) === '[object Function]';
}

/**
 * Filter and normalize a model item returned by FreeInference /v1/models.
 * Excludes embedding-only models that cannot be used for chat completions.
 */
function normalizeFreeInferenceModel(rawModel) {
  if (!isPlainObject(rawModel)) {
    return null;
  }
  const id = isString(rawModel.id) ? rawModel.id.trim() : '';
  if (!id) {
    return null;
  }

  // Filter out embedding-only models if output_modalities is specified
  if (Array.isArray(rawModel.output_modalities)) {
    const hasTextOutput = rawModel.output_modalities.some(
      (modality) => isString(modality) && modality.toLowerCase() === 'text',
    );
    if (!hasTextOutput) {
      return null;
    }
  }

  const name = isString(rawModel.name) && rawModel.name.trim()
    ? rawModel.name.trim()
    : id;

  return { id, name };
}

/**
 * Fetch and parse authoritative model list from FreeInference.
 * Handles timeouts, network failures, auth rejection (401/403), malformed JSON, and empty lists.
 *
 * @param {Object} options
 * @param {string} [options.apiKey] - FreeInference API key
 * @param {Function} [options.fetchFn] - Custom fetch implementation
 * @param {number} [options.timeoutMs] - Request timeout in milliseconds
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
async function fetchFreeInferenceModels({
  apiKey,
  fetchFn = globalThis.fetch,
  timeoutMs = DEFAULT_DISCOVERY_TIMEOUT_MS,
} = {}) {
  const headers = {
    Accept: 'application/json',
  };

  const trimmedKey = isString(apiKey) ? apiKey.trim() : '';
  if (trimmedKey) {
    headers.Authorization = `Bearer ${trimmedKey}`;
  }

  const signal = isFunction(AbortSignal?.timeout)
    ? AbortSignal.timeout(timeoutMs)
    : undefined;

  let response;
  try {
    response = await fetchFn(FREEINFERENCE_MODELS_URL, {
      method: 'GET',
      headers,
      signal,
    });
  } catch (error) {
    const isTimeout = error?.name === 'TimeoutError' || error?.code === 23;
    const failure = new Error(
      isTimeout
        ? 'Timed out connecting to FreeInference'
        : `Unable to connect to FreeInference: ${error?.message || String(error)}`,
    );
    failure.statusCode = isTimeout ? 504 : 502;
    failure.cause = error;
    throw failure;
  }

  if (response.status === 401 || response.status === 403) {
    let message = 'Invalid or expired FreeInference API key';
    try {
      const errPayload = await response.json();
      if (errPayload?.error?.message) {
        message = `FreeInference authentication failed: ${errPayload.error.message}`;
      }
    } catch {
      // ignore parse failure on error body
    }
    const authError = new Error(message);
    authError.statusCode = 401;
    throw authError;
  }

  if (!response.ok) {
    let errorDetail = '';
    try {
      const errPayload = await response.json();
      if (errPayload?.error?.message) {
        errorDetail = `: ${errPayload.error.message}`;
      }
    } catch {
      // ignore
    }
    const apiError = new Error(`FreeInference API returned status ${response.status}${errorDetail}`);
    apiError.statusCode = response.status >= 500 ? 502 : response.status;
    throw apiError;
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    const parseError = new Error('Invalid JSON received from FreeInference models endpoint');
    parseError.statusCode = 502;
    parseError.cause = error;
    throw parseError;
  }

  const rawEntries = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data)
      ? data
      : null;

  if (!rawEntries) {
    const formatError = new Error('FreeInference returned an unexpected payload structure (expected data array)');
    formatError.statusCode = 502;
    throw formatError;
  }

  const models = rawEntries
    .map(normalizeFreeInferenceModel)
    .filter(Boolean);

  if (models.length === 0) {
    const emptyError = new Error('No usable chat completion models were returned by FreeInference');
    emptyError.statusCode = 502;
    throw emptyError;
  }

  return models;
}

/**
 * Builds standard OpenCode custom provider configuration for FreeInference.
 *
 * @param {Array<{ id: string, name: string }>} models
 * @param {Object} [existingConfig]
 * @returns {Object}
 */
function buildFreeInferenceProviderConfig(models, existingConfig = null) {
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error('At least one model is required to build FreeInference provider config');
  }

  const modelsMap = {};
  for (const model of models) {
    if (model?.id) {
      modelsMap[model.id] = { name: model.name || model.id };
    }
  }

  const existingOptions = isPlainObject(existingConfig?.options) ? existingConfig.options : {};
  const options = {
    baseURL: FREEINFERENCE_BASE_URL,
  };
  if (isPlainObject(existingOptions.headers)) {
    options.headers = existingOptions.headers;
  }

  return {
    npm: FREEINFERENCE_NPM,
    name: FREEINFERENCE_NAME,
    options,
    models: modelsMap,
  };
}

export {
  FREEINFERENCE_PROVIDER_ID,
  FREEINFERENCE_NAME,
  FREEINFERENCE_BASE_URL,
  FREEINFERENCE_MODELS_URL,
  FREEINFERENCE_NPM,
  normalizeFreeInferenceModel,
  fetchFreeInferenceModels,
  buildFreeInferenceProviderConfig,
};
