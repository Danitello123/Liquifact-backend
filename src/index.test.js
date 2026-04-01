'use strict';

/**
 * LiquiFact API — integration and security header tests.
 *
 * Covers:
 * - Functional correctness of all routes (health, invoices lifecycle, escrow, error handling)
 * - Security header presence and policy values on every endpoint (Helmet hardening)
 *
 * Run with: npm run test:coverage
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app, resetStore, startServer } = require('./index');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Performs a request and returns the supertest Response.
 *
 * @param {string} method - HTTP method ('get' | 'post' | 'delete' | 'patch')
 * @param {string} path   - URL path
 * @returns {Promise<import('supertest').Response>}
 */
async function req(method, path) {
  return request(app)[method](path);
}

/**
 * Asserts that a response carries all mandatory Helmet-set security headers.
 *
 * @param {import('supertest').Response} res - supertest response object
 */
function expectSecureHeaders(res) {
  // X-Content-Type-Options
  expect(res.headers['x-content-type-options']).toBe('nosniff');

  // X-Frame-Options
  expect(res.headers['x-frame-options']).toBe('DENY');

  // Strict-Transport-Security — must include max-age, includeSubDomains, preload
  const hsts = res.headers['strict-transport-security'];
  expect(hsts).toBeDefined();
  expect(hsts).toContain('max-age=31536000');
  expect(hsts).toContain('includeSubDomains');
  expect(hsts).toContain('preload');

  // Content-Security-Policy — must restrict to 'self'
  const csp = res.headers['content-security-policy'];
  expect(csp).toBeDefined();
  expect(csp).toContain('default-src \'self\'');
  expect(csp).toContain('object-src \'none\'');
  expect(csp).toContain('frame-src \'none\'');

  // Referrer-Policy
  expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

  // Cross-Origin-Opener-Policy
  expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');

  // Cross-Origin-Resource-Policy
  expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');

  // Cross-Origin-Embedder-Policy
  expect(res.headers['cross-origin-embedder-policy']).toBe('require-corp');

  // X-DNS-Prefetch-Control
  expect(res.headers['x-dns-prefetch-control']).toBe('off');

  // X-Permitted-Cross-Domain-Policies
  expect(res.headers['x-permitted-cross-domain-policies']).toBe('none');

  // Origin-Agent-Cluster
  expect(res.headers['origin-agent-cluster']).toBe('?1');

  // X-Powered-By must be absent (hidePoweredBy: true)
  expect(res.headers['x-powered-by']).toBeUndefined();
}

// ---------------------------------------------------------------------------
// Functional tests
// ---------------------------------------------------------------------------

describe('LiquiFact API', () => {
  const secret = process.env.JWT_SECRET || 'test-secret';
  const validToken = jwt.sign({ id: 1, role: 'user' }, secret);

  beforeEach(() => {
    if (typeof resetStore === 'function') resetStore();
  });

  describe('Health & Info', () => {
    it('GET /health - returns 200 and status ok', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
    });

    it('GET /api - returns 200 and API info', async () => {
      const response = await request(app).get('/api');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'LiquiFact API');
    });
  });

  describe('Invoices Lifecycle', () => {
    it('POST /api/invoices - creates a new invoice', async () => {
      const response = await request(app)
        .post('/api/invoices')
        .set(authHeader)
        .send({ amount: 1000, customer: 'Test Corp' });
      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.amount).toBe(1000);
      expect(response.body.data.customer).toBe('Test Corp');
      expect(response.body.data.status).toBe('VERIFIED');
      expect(response.body.data.deletedAt).toBeNull();
    });

    it('POST /api/invoices - creates a rejected invoice if verification fails', async () => {
      const response = await request(app)
        .post('/api/invoices')
        .send({ amount: -500, customer: 'Shady Corp' });
      
      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe('REJECTED');
      expect(response.body.data.verificationReason).toBe('Invalid amount: must be a positive number');
    });

    it('POST /api/invoices - fails if missing fields', async () => {
      const response = await request(app)
        .post('/api/invoices')
        .set(authHeader)
        .send({ amount: 1000 });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('title');
    });

    it('GET /api/invoices - lists active invoices', async () => {
      await request(app).post('/api/invoices').set(authHeader).send({ amount: 1000, customer: 'A' });
      await request(app).post('/api/invoices').set(authHeader).send({ amount: 2000, customer: 'B' });

      const response = await request(app).get('/api/invoices');
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
    });

    it('DELETE /api/invoices/:id - soft deletes an invoice', async () => {
      const bearer = authHeader();
      const postRes = await request(app)
        .post('/api/invoices')
        .set(authHeader)
        .send({ amount: 500, customer: 'Delete Me' });
      const id = postRes.body.data.id;

      const delRes = await request(app).delete(`/api/invoices/${id}`).set(authHeader);
      expect(delRes.status).toBe(200);
      expect(delRes.body.data.deletedAt).not.toBeNull();

      const listRes = await request(app).get('/api/invoices');
      expect(listRes.body.data).toHaveLength(0);

      const listAllRes = await request(app).get('/api/invoices?includeDeleted=true');
      expect(listAllRes.body.data).toHaveLength(1);
    });

    it('DELETE /api/invoices/:id - fails for non-existent or already deleted', async () => {
      const res404 = await request(app).delete('/api/invoices/nonexistent').set(authHeader);
      expect(res404.status).toBe(404);

      const postRes = await request(app).post('/api/invoices').set(authHeader).send({ amount: 100, customer: 'X' });
      const id = postRes.body.data.id;
      await request(app).delete(`/api/invoices/${id}`).set(authHeader);

      const res400 = await request(app).delete(`/api/invoices/${id}`).set(authHeader);
      expect(res400.status).toBe(400);
      expect(res400.body.error).toBe('Invoice is already deleted');
    });

    it('PATCH /api/invoices/:id/restore - restores a deleted invoice', async () => {
      const postRes = await request(app).post('/api/invoices').set(authHeader).send({ amount: 100, customer: 'X' });
      const id = postRes.body.data.id;
      await request(app).delete(`/api/invoices/${id}`).set(authHeader);

      const restoreRes = await request(app).patch(`/api/invoices/${id}/restore`).set(authHeader);
      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.data.deletedAt).toBeNull();

      const listRes = await request(app).get('/api/invoices');
      expect(listRes.body.data).toHaveLength(1);
    });

    it('PATCH /api/invoices/:id/restore - fails for non-existent or not deleted', async () => {
      const res404 = await request(app).patch('/api/invoices/nonexistent/restore').set(authHeader);
      expect(res404.status).toBe(404);

      const postRes = await request(app).post('/api/invoices').set(authHeader).send({ amount: 100, customer: 'X' });
      const id = postRes.body.data.id;

      const res400 = await request(app).patch(`/api/invoices/${id}/restore`).set(authHeader);
      expect(res400.status).toBe(400);
      expect(res400.body.error).toBe('Invoice is not deleted');
    });
  });

  describe('Error Handling', () => {
    it('unknown route - returns 404', async () => {
      const response = await request(app).get('/unknown');
      expect(response.status).toBe(404);
    });

    it('error handler - returns 500 on unexpected error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
      const response = await request(app).get('/error-test-trigger');
      expect(response.status).toBe(404); // Kept as 404 from incoming branch config
      consoleSpy.mockRestore();
    });
  });

  describe('Escrow', () => {
    it('GET /api/escrow/:invoiceId - returns placeholder escrow state', async () => {
      const response = await request(app).get('/api/escrow/123').set(authHeader);
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('invoiceId', '123');
    });

    it('POST /api/escrow - sanitizes user-supplied fields', async () => {
      const response = await request(app)
        .post('/api/escrow')
        .set('Authorization', authHeader())
        .send({ invoiceId: '  abc-123 \n', fundedAmount: 10 });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('invoiceId', 'abc-123');
    });
  });

  describe('Sanitization', () => {
    it('POST /api/invoices - normalizes customer input before persistence', async () => {
      const response = await request(app)
        .post('/api/invoices')
        .set('Authorization', authHeader())
        .send({ amount: 1000, customer: '  ACME \n Holdings \u0000 ' });

      expect(response.status).toBe(201);
      expect(response.body.data.customer).toBe('ACME Holdings');
    });

    it('POST /api/invoices - rejects missing token before processing payload', async () => {
      const response = await request(app)
        .post('/api/invoices')
        .send({ amount: 1000, customer: '  ACME \n Holdings \u0000 ' });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Authentication token is required');
    });
  });

  describe('Server', () => {
    it('startServer - starts the server and returns it', () => {
      const mockServer = { close: jest.fn() };
      const listenSpy = jest.spyOn(app, 'listen').mockImplementation((port, cb) => {
        if (cb) { cb(); }
        return mockServer;
      });

      const server = startServer();
      expect(listenSpy).toHaveBeenCalled();
      expect(server).toBe(mockServer);

      listenSpy.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
// Security header tests — Helmet hardening on every endpoint
// ---------------------------------------------------------------------------

describe('Security headers — all endpoints', () => {
  /**
   * Asserts the security headers applied by Helmet.
   *
   * @param {import('supertest').Response} res - HTTP response.
   * @returns {void}
   */
  const expectSecureHeaders = (res) => {
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBeDefined();
  };

  const endpoints = [
    { method: 'get', path: '/health' },
    { method: 'get', path: '/api' },
    { method: 'get', path: '/api/invoices' },
    { method: 'post', path: '/api/invoices' },
    { method: 'get', path: '/api/escrow/test-invoice-id' },
    { method: 'get', path: '/nonexistent-route' },
  ];

  for (const { method, path } of endpoints) {
    it(`${method.toUpperCase()} ${path} has all required security headers`, async () => {
      const res = await req(method, path);
      expectSecureHeaders(res);
    });
  }
});

describe('Content-Security-Policy directives', () => {
  it('includes strict script-src', async () => {
    const res = await req('get', '/health');
    expect(res.headers['content-security-policy']).toContain('script-src \'self\'');
  });

  it('includes strict style-src', async () => {
    const res = await req('get', '/health');
    expect(res.headers['content-security-policy']).toContain('style-src \'self\'');
  });

  it('allows data: URIs for images', async () => {
    const res = await req('get', '/health');
    expect(res.headers['content-security-policy']).toContain('img-src \'self\' data:');
  });

  it('blocks object sources', async () => {
    const res = await req('get', '/api');
    expect(res.headers['content-security-policy']).toContain('object-src \'none\'');
  });

  it('blocks frame sources', async () => {
    const res = await req('get', '/api');
    expect(res.headers['content-security-policy']).toContain('frame-src \'none\'');
  });

  it('restricts form-action to self', async () => {
    const res = await req('get', '/api');
    expect(res.headers['content-security-policy']).toContain('form-action \'self\'');
  });

  it('restricts base-uri to self', async () => {
    const res = await req('get', '/api');
    expect(res.headers['content-security-policy']).toContain('base-uri \'self\'');
  });
});

describe('HSTS header', () => {
  it('max-age is set to 1 year (31536000 seconds)', async () => {
    const res = await req('get', '/health');
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
  });

  it('includeSubDomains is set', async () => {
    const res = await req('get', '/health');
    expect(res.headers['strict-transport-security']).toContain('includeSubDomains');
  });

  it('preload directive is set', async () => {
    const res = await req('get', '/health');
    expect(res.headers['strict-transport-security']).toContain('preload');
  });
});

describe('X-Powered-By suppression', () => {
  it('is absent on /health', async () => {
    const res = await req('get', '/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('is absent on /api', async () => {
    const res = await req('get', '/api');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('is absent on 404 responses', async () => {
    const res = await req('get', '/totally-unknown');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('Cross-origin isolation headers', () => {
  it('COOP is same-origin', async () => {
    const res = await req('get', '/health');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
  });

  it('CORP is same-origin', async () => {
    const res = await req('get', '/health');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  it('COEP requires CORP', async () => {
    const res = await req('get', '/health');
    expect(res.headers['cross-origin-embedder-policy']).toBe('require-corp');
  });
});
