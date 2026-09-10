import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerOpenCodeRoutes } from './routes.js';

const createApp = (overrides = {}) => {
  const app = express();
  app.use(express.json());
  const dependencies = {
    getProviderSources: vi.fn(() => ({ sources: { user: { exists: false } } })),
    upsertProviderConfig: vi.fn((id, config) => ({ providerId: id, path: '/test/opencode.json', config })),
    resolveProjectDirectory: vi.fn(async () => ({ directory: '/workspace' })),
    fetchFreeInferenceModels: vi.fn(async ({ apiKey }) => {
      if (apiKey === 'bad-key') {
        const err = new Error('Invalid or expired FreeInference API key');
        err.statusCode = 401;
        throw err;
      }
      return [
        { id: 'qwen3.6-35b', name: 'Qwen3.6 35B' },
        { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
      ];
    }),
    ...overrides,
  };
  registerOpenCodeRoutes(app, dependencies);
  return { app, dependencies };
};

describe('FreeInference server routes', () => {
  describe('POST /api/provider/freeinference/models', () => {
    it('returns 400 when API key is not provided and no stored auth exists', async () => {
      const { app } = createApp();

      const response = await request(app)
        .post('/api/provider/freeinference/models')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('API key is required');
    });

    it('returns discovered models when apiKey is provided', async () => {
      const { app, dependencies } = createApp();

      const response = await request(app)
        .post('/api/provider/freeinference/models')
        .send({ apiKey: 'valid-test-key' })
        .expect(200);

      expect(dependencies.fetchFreeInferenceModels).toHaveBeenCalledWith({ apiKey: 'valid-test-key' });
      expect(response.body).toEqual({
        ok: true,
        models: [
          { id: 'qwen3.6-35b', name: 'Qwen3.6 35B' },
          { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
        ],
      });
    });

    it('returns 401 when API key is rejected by FreeInference', async () => {
      const { app } = createApp();

      const response = await request(app)
        .post('/api/provider/freeinference/models')
        .send({ apiKey: 'bad-key' })
        .expect(401);

      expect(response.body.error).toContain('Invalid or expired FreeInference API key');
    });
  });

  describe('POST /api/provider/freeinference/sync-models', () => {
    it('discovers models and upserts provider config', async () => {
      const { app, dependencies } = createApp();

      const response = await request(app)
        .post('/api/provider/freeinference/sync-models')
        .send({ apiKey: 'valid-test-key', scope: 'user' })
        .expect(200);

      expect(dependencies.fetchFreeInferenceModels).toHaveBeenCalledWith({ apiKey: 'valid-test-key' });
      expect(dependencies.upsertProviderConfig).toHaveBeenCalledWith(
        'freeinference',
        expect.objectContaining({
          npm: '@ai-sdk/openai-compatible',
          name: 'FreeInference',
          options: expect.objectContaining({ baseURL: 'https://freeinference.org/v1' }),
          models: {
            'qwen3.6-35b': { name: 'Qwen3.6 35B' },
            'deepseek-v4-flash': { name: 'DeepSeek V4 Flash' },
          },
        }),
        '/workspace',
        'user',
        { hasStoredAuth: true },
      );

      expect(response.body).toMatchObject({
        providerId: 'freeinference',
        requiresReload: false,
        requiresRestart: true,
        restartDeferred: true,
        models: [
          { id: 'qwen3.6-35b', name: 'Qwen3.6 35B' },
          { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
        ],
      });
    });

    it('does not upsert config when model discovery fails', async () => {
      const { app, dependencies } = createApp();

      const response = await request(app)
        .post('/api/provider/freeinference/sync-models')
        .send({ apiKey: 'bad-key' })
        .expect(401);

      expect(dependencies.upsertProviderConfig).not.toHaveBeenCalled();
      expect(response.body.error).toContain('Invalid or expired FreeInference API key');
    });
  });
});
