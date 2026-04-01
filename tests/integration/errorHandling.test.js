const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/index');

const TEST_SECRET = process.env.JWT_SECRET || 'test-secret';
const validToken = jwt.sign({ id: 1, role: 'user' }, TEST_SECRET, { expiresIn: '1h' });

describe('API Integration Tests (RFC 7807)', () => {
  test('GET /health should return status ok', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  test('GET /api should return api info', async () => {
    const response = await request(app).get('/api');
    expect(response.status).toBe(200);
    expect(response.body.name).toBe('LiquiFact API');
  });

  test('GET /api/invoices should return 200 with active invoices', async () => {
    const response = await request(app).get('/api/invoices');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  test('POST /api/invoices without required fields should return 400 Bad Request', async () => {
    const response = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${validToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.title).toBe('Validation Error');
    expect(response.body.status).toBe(400);
  });

  test('POST /api/invoices with required fields should return 201', async () => {
    const response = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ amount: 100, customer: 'Test Corp' });
    expect(response.status).toBe(201);
  });

  test('GET /api/escrow/:invoiceId should return escrow data', async () => {
    const response = await request(app)
      .get('/api/escrow/test-invoice')
      .set('Authorization', `Bearer ${validToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.invoiceId).toBe('test-invoice');
  });

  test('GET /unknown-route should return 404 standardized error', async () => {
    const response = await request(app).get('/unknown-route');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body.error).toBeDefined();
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  test('GET /error-test-trigger should return 500 Internal Server Error', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request(app).get('/error-test-trigger');
    expect(response.status).toBe(500);
    expect(response.body.title).toBe('Internal Server Error');
    console.error.mockRestore();
  });
});
