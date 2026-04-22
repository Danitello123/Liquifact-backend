'use strict';

const request = require('supertest');
const { createApp } = require('../../src/index');

describe('Observability Integration', () => {
  let app;

  beforeAll(() => {
    app = createApp({ enableTestRoutes: true });
  });

  it('should include X-Request-Id in all responses', async () => {
    const response = await request(app).get('/health');
    
    expect(response.headers['x-request-id']).toBeDefined();
    expect(typeof response.headers['x-request-id']).toBe('string');
  });

  it('should return the same correlation_id in error responses', async () => {
    const response = await request(app).get('/unknown-route');
    
    expect(response.status).toBe(404);
    const requestId = response.headers['x-request-id'];
    expect(requestId).toBeDefined();
    expect(response.body.error.correlation_id).toBe(requestId);
  });
});
