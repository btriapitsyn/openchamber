import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { registerSmallModelRoutes } from './routes.js';

describe('small-model routes', () => {
  it('uses the requested directory for preview and callable provider discovery', async () => {
    const describeSmallModel = vi.fn(async () => null);
    const listAuthenticatedProviders = vi.fn(async () => ['custom']);
    const app = express();
    registerSmallModelRoutes(app, {
      getSmallModelService: async () => ({ describeSmallModel, listAuthenticatedProviders }),
    });

    const response = await request(app)
      .get('/api/small-model')
      .query({ directory: '/repo' })
      .expect(200);

    expect(describeSmallModel).toHaveBeenCalledWith(expect.objectContaining({ directory: '/repo' }));
    expect(listAuthenticatedProviders).toHaveBeenCalledWith('/repo');
    expect(response.body.authenticatedProviders).toEqual(['custom']);
  });
});
