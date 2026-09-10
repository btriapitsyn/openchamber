import { describe, expect, it } from 'bun:test';
import {
  FREEINFERENCE_BASE_URL,
  FREEINFERENCE_MODELS_URL,
  FREEINFERENCE_NPM,
  FREEINFERENCE_PROVIDER_ID,
  buildFreeInferenceProviderConfig,
  fetchFreeInferenceModels,
  normalizeFreeInferenceModel,
} from './freeinference.js';

describe('normalizeFreeInferenceModel', () => {
  it('normalizes a valid model with id and name', () => {
    const model = normalizeFreeInferenceModel({
      id: 'qwen3.6-35b',
      name: 'Qwen3.6 35B (high speed)',
      output_modalities: ['text'],
    });
    expect(model).toEqual({
      id: 'qwen3.6-35b',
      name: 'Qwen3.6 35B (high speed)',
    });
  });

  it('falls back to model id when name is missing or empty', () => {
    expect(normalizeFreeInferenceModel({ id: 'model-a' })).toEqual({
      id: 'model-a',
      name: 'model-a',
    });
    expect(normalizeFreeInferenceModel({ id: 'model-b', name: '  ' })).toEqual({
      id: 'model-b',
      name: 'model-b',
    });
  });

  it('rejects invalid or missing model ids', () => {
    expect(normalizeFreeInferenceModel(null)).toBeNull();
    expect(normalizeFreeInferenceModel({})).toBeNull();
    expect(normalizeFreeInferenceModel({ id: '' })).toBeNull();
    expect(normalizeFreeInferenceModel({ id: '   ' })).toBeNull();
  });

  it('filters out embedding-only models', () => {
    const embedding = normalizeFreeInferenceModel({
      id: 'bge-m3',
      name: 'BGE-M3',
      output_modalities: ['embedding'],
    });
    expect(embedding).toBeNull();

    const multimodal = normalizeFreeInferenceModel({
      id: 'gemini-vision',
      name: 'Gemini Vision',
      output_modalities: ['text', 'image'],
    });
    expect(multimodal).toEqual({
      id: 'gemini-vision',
      name: 'Gemini Vision',
    });
  });
});

describe('fetchFreeInferenceModels', () => {
  it('fetches and normalizes models with Authorization header', async () => {
    let capturedUrl = null;
    let capturedHeaders = null;

    const mockFetch = async (url, options) => {
      capturedUrl = url;
      capturedHeaders = options?.headers;
      return new Response(
        JSON.stringify({
          object: 'list',
          data: [
            {
              id: 'qwen3.6-35b',
              name: 'Qwen3.6 35B (high speed)',
              output_modalities: ['text'],
            },
            {
              id: 'deepseek-v4-flash',
              name: 'DeepSeek V4 Flash (high speed)',
              output_modalities: ['text'],
            },
            {
              id: 'bge-m3',
              name: 'BGE-M3',
              output_modalities: ['embedding'],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const models = await fetchFreeInferenceModels({
      apiKey: 'test-key-123',
      fetchFn: mockFetch,
    });

    expect(capturedUrl).toBe(FREEINFERENCE_MODELS_URL);
    expect(capturedHeaders.Authorization).toBe('Bearer test-key-123');
    expect(models).toEqual([
      { id: 'qwen3.6-35b', name: 'Qwen3.6 35B (high speed)' },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash (high speed)' },
    ]);
  });

  it('throws 401 when API key is rejected with error details', async () => {
    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          error: {
            message: 'Invalid or expired API key',
            code: 401,
          },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    };

    let thrownError = null;
    try {
      await fetchFreeInferenceModels({
        apiKey: 'bad-key',
        fetchFn: mockFetch,
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeTruthy();
    expect(thrownError.statusCode).toBe(401);
    expect(thrownError.message).toContain('Invalid or expired API key');
  });

  it('throws 502 on upstream 500 error', async () => {
    const mockFetch = async () => {
      return new Response('Server Error', { status: 500 });
    };

    let thrownError = null;
    try {
      await fetchFreeInferenceModels({
        apiKey: 'key',
        fetchFn: mockFetch,
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeTruthy();
    expect(thrownError.statusCode).toBe(502);
  });

  it('throws 502 when response body is not valid JSON', async () => {
    const mockFetch = async () => {
      return new Response('<html>Cloudflare Error</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    };

    let thrownError = null;
    try {
      await fetchFreeInferenceModels({
        apiKey: 'key',
        fetchFn: mockFetch,
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeTruthy();
    expect(thrownError.statusCode).toBe(502);
    expect(thrownError.message).toContain('Invalid JSON');
  });

  it('throws 502 when no usable chat models are returned', async () => {
    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          object: 'list',
          data: [
            { id: 'bge-m3', output_modalities: ['embedding'] },
          ],
        }),
        { status: 200 },
      );
    };

    let thrownError = null;
    try {
      await fetchFreeInferenceModels({
        apiKey: 'key',
        fetchFn: mockFetch,
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeTruthy();
    expect(thrownError.statusCode).toBe(502);
    expect(thrownError.message).toContain('No usable chat completion models');
  });

  it('handles connection network error', async () => {
    const mockFetch = async () => {
      throw new Error('Connection reset');
    };

    let thrownError = null;
    try {
      await fetchFreeInferenceModels({
        apiKey: 'key',
        fetchFn: mockFetch,
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeTruthy();
    expect(thrownError.statusCode).toBe(502);
    expect(thrownError.message).toContain('Unable to connect to FreeInference');
  });
});

describe('buildFreeInferenceProviderConfig', () => {
  it('builds standard OpenCode provider config with FreeInference constants', () => {
    const models = [
      { id: 'qwen3.6-35b', name: 'Qwen3.6 35B (high speed)' },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
    ];

    const config = buildFreeInferenceProviderConfig(models);

    expect(config).toEqual({
      npm: FREEINFERENCE_NPM,
      name: 'FreeInference',
      options: {
        baseURL: FREEINFERENCE_BASE_URL,
      },
      models: {
        'qwen3.6-35b': { name: 'Qwen3.6 35B (high speed)' },
        'deepseek-v4-flash': { name: 'DeepSeek V4 Flash' },
      },
    });
  });

  it('preserves existing custom headers if present', () => {
    const models = [{ id: 'test-model', name: 'Test Model' }];
    const existingConfig = {
      options: {
        headers: { 'X-Custom-Test': 'custom-value' },
      },
    };

    const config = buildFreeInferenceProviderConfig(models, existingConfig);
    expect(config.options.headers).toEqual({ 'X-Custom-Test': 'custom-value' });
  });

  it('throws when model list is empty', () => {
    expect(() => buildFreeInferenceProviderConfig([])).toThrow();
  });
});
