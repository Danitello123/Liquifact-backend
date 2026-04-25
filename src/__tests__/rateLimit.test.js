const request = require('supertest');
const jwt = require('jsonwebtoken');

const {
  globalLimiter,
  sensitiveLimiter,
  apiKeyLimiter,
  parseRateLimitEnv,
  keyGenerator,
  apiKeyKeyGenerator,
  getApiKey,
} = require('../middleware/rateLimit');

describe('Rate Limiting Middleware', () => {
  let app;

  beforeAll(() => {
    const express = require('express');
    app = express();
    app.use(globalLimiter);
    app.get('/test', (req, res) => res.status(200).json({ ok: true }));
  });

  describe('parseRateLimitEnv', () => {
    it('should return default value when env var is undefined', () => {
      expect(parseRateLimitEnv('NON_EXISTENT_VAR', 100)).toBe(100);
    });

    it('should return parsed value when env var is valid', () => {
      process.env.TEST_RATE_VAR = '50';
      expect(parseRateLimitEnv('TEST_RATE_VAR', 100)).toBe(50);
      delete process.env.TEST_RATE_VAR;
    });

    it('should return default when env var is not a number', () => {
      process.env.TEST_RATE_VAR = 'abc';
      expect(parseRateLimitEnv('TEST_RATE_VAR', 100)).toBe(100);
      delete process.env.TEST_RATE_VAR;
    });

    it('should return default when env var is negative', () => {
      process.env.TEST_RATE_VAR = '-5';
      expect(parseRateLimitEnv('TEST_RATE_VAR', 100)).toBe(100);
      delete process.env.TEST_RATE_VAR;
    });
  });

  describe('keyGenerator', () => {
    it('should use user ID when req.user exists', () => {
      const req = { user: { id: 'user_123' }, ip: '127.0.0.1' };
      expect(keyGenerator(req)).toBe('user_user_123');
    });

    it('should use API key when no user but API key present', () => {
      const req = { headers: { 'x-api-key': 'lf_test_key' }, ip: '127.0.0.1' };
      expect(keyGenerator(req)).toBe('apikey_lf_test_key');
    });

    it('should fall back to IP address', () => {
      const req = { ip: '192.168.1.1', socket: null };
      expect(keyGenerator(req)).toBe('192.168.1.1');
    });

    it('should fall back to socket remoteAddress', () => {
      const req = { ip: undefined, socket: { remoteAddress: '10.0.0.1' } };
      expect(keyGenerator(req)).toBe('10.0.0.1');
    });

    it('should fall back to localhost', () => {
      const req = { ip: undefined, socket: null };
      expect(keyGenerator(req)).toBe('127.0.0.1');
    });
  });

  describe('apiKeyKeyGenerator', () => {
    it('should use API key when present', () => {
      const req = { headers: { 'x-api-key': 'lf_prod_key' }, ip: '127.0.0.1' };
      expect(apiKeyKeyGenerator(req)).toBe('apikey_lf_prod_key');
    });

    it('should fall back to IP when no API key', () => {
      const req = { headers: {}, ip: '192.168.1.50' };
      expect(apiKeyKeyGenerator(req)).toBe('192.168.1.50');
    });

    it('should fall back to socket remoteAddress when no IP', () => {
      const req = { headers: {}, ip: undefined, socket: { remoteAddress: '10.0.0.5' } };
      expect(apiKeyKeyGenerator(req)).toBe('10.0.0.5');
    });

    it('should fall back to localhost when no IP or socket', () => {
      const req = { headers: {}, ip: undefined, socket: null };
      expect(apiKeyKeyGenerator(req)).toBe('127.0.0.1');
    });
  });

  describe('getApiKey', () => {
    it('should return trimmed API key when present', () => {
      const req = { headers: { 'x-api-key': '  lf_key_123  ' } };
      expect(getApiKey(req)).toBe('lf_key_123');
    });

    it('should return undefined when no API key', () => {
      const req = { headers: {} };
      expect(getApiKey(req)).toBeUndefined();
    });

    it('should return undefined when API key is not a string', () => {
      const req = { headers: { 'x-api-key': 12345 } };
      expect(getApiKey(req)).toBeUndefined();
    });
  });

  describe('globalLimiter', () => {
    it('should return 200 for requests under limit', async () => {
      const response = await request(app).get('/test');
      expect(response.status).toBe(200);
    });

    it('should set rate limit headers', async () => {
      const response = await request(app).get('/test');
      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
    });
  });

  describe('sensitiveLimiter', () => {
    let sensitiveApp;

    beforeAll(() => {
      const express = require('express');
      sensitiveApp = express();
      sensitiveApp.use(sensitiveLimiter);
      sensitiveApp.post('/sensitive', (req, res) => res.status(201).json({ ok: true }));
    });

    it('should allow requests to sensitive endpoint', async () => {
      const response = await request(sensitiveApp).post('/sensitive');
      expect(response.status).toBe(201);
    });

    it('should include rate limit headers', async () => {
      const response = await request(sensitiveApp).post('/sensitive');
      expect(response.headers).toHaveProperty('ratelimit-limit');
    });
  });

  describe('apiKeyLimiter', () => {
    let apiKeyApp;

    beforeAll(() => {
      const express = require('express');
      apiKeyApp = express();
      apiKeyApp.use(apiKeyLimiter);
      apiKeyApp.get('/apikey', (req, res) => res.status(200).json({ ok: true }));
    });

    it('should allow requests with API key', async () => {
      const response = await request(apiKeyApp)
        .get('/apikey')
        .set('X-API-Key', 'lf_test_key_123');
      expect(response.status).toBe(200);
    });

    it('should set distinct rate limit for API key', async () => {
      const response = await request(apiKeyApp)
        .get('/apikey')
        .set('X-API-Key', 'lf_test_key_456');
      expect(response.headers).toHaveProperty('ratelimit-limit');
    });
  });
});

describe('Rate Limiting Integration', () => {
  const validToken = jwt.sign({ id: 'test_user_1' }, process.env.JWT_SECRET || 'test-secret');

  it('should apply global limiter to health endpoint', async () => {
    const app = require('../index');
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.headers).toHaveProperty('ratelimit-limit');
  });

  it('should apply sensitive limiter to POST /api/invoices', async () => {
    const app = require('../index');
    const response = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ amount: 100, buyer: 'Rate Test Buyer', seller: 'Rate Test Seller', dueDate: '2025-12-31', currency: 'USD' });
    expect(response.status).toBe(201);
    expect(response.headers).toHaveProperty('ratelimit-limit');
  });

  it('should apply sensitive limiter to POST /api/escrow', async () => {
    const app = require('../index');
    const response = await request(app)
      .post('/api/escrow')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ invoiceId: 'test_inv' });
    expect(response.status).toBe(200);
    expect(response.headers).toHaveProperty('ratelimit-limit');
  });

  it('should apply global limiter to GET /api/invoices', async () => {
    const app = require('../index');
    const response = await request(app).get('/api/invoices');
    expect(response.status).toBe(200);
    expect(response.headers).toHaveProperty('ratelimit-limit');
  });
});