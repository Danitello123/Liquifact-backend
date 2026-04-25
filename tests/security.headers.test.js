const request = require('supertest');
const { createApp } = require('../src/index');

describe('Security Headers', () => {
  let app;

  beforeEach(() => {
    app = createApp({ enableTestRoutes: true });
  });

  it('sets security headers on /health', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['x-dns-prefetch-control']).toBe('off');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBeDefined();
  });

  it('sets security headers on /api', async () => {
    const res = await request(app).get('/api');

    expect(res.headers['x-dns-prefetch-control']).toBe('off');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});