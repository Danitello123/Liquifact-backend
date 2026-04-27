const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/index');

describe('API Validation Integration Tests', () => {
  let app;
  let validToken;

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret';
    app = createApp({ enableTestRoutes: false });
    
    validToken = jwt.sign({ userId: 'test-user' }, 'test-secret', { expiresIn: '1h' });
  });

  describe('POST /api/invoices - Invoice Creation', () => {
    const validPayload = {
      amount: 1000.50,
      buyer: 'Acme Corp',
      seller: 'Globex Inc',
      dueDate: '2025-12-31',
      currency: 'USD',
      description: 'Invoice for services rendered',
      invoiceNumber: 'INV-2025-001',
    };

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/invoices')
        .send(validPayload);

      expect(response.status).toBe(401);
    });

    it('should reject empty body with 400 and fieldErrors', async () => {
      const response = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Failed');
      expect(response.body).toHaveProperty('fieldErrors');
      expect(response.body.fieldErrors).toHaveProperty('amount');
    });

    it('should reject missing amount with 400', async () => {
      const { amount, ...payload } = validPayload;
      const response = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toHaveProperty('amount');
    });

    it('should reject negative amount with 400', async () => {
      const response = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ ...validPayload, amount: -100 });

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toHaveProperty('amount');
    });

    it('should reject zero amount with 400', async () => {
      const response = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ ...validPayload, amount: 0 });

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toHaveProperty('amount');
    });

    it('should reject non-number amount with 400', async () => {
      const response = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ ...validPayload, amount: 'not-a-number' });

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toHaveProperty('amount');
    });

    it('should reject invalid dueDate format with 400', async () => {
      const response = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ ...validPayload, dueDate: '31-12-2025' });

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toHaveProperty('dueDate');
    });

    it('should reject empty buyer with 400', async () => {
      const response = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ ...validPayload, buyer: '' });

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toHaveProperty('buyer');
    });

    it('should reject empty seller with 400', async () => {
      const response = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ ...validPayload, seller: '' });

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toHaveProperty('seller');
    });

    it('should reject unsupported currency with 400', async () => {
      const response = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ ...validPayload, currency: 'XYZ' });

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toHaveProperty('currency');
    });

    it('should reject invalid currency length with 400', async () => {
      const response = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ ...validPayload, currency: 'US' });

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toHaveProperty('currency');
    });

    it('should reject description over 1000 chars with 400', async () => {
      const longDescription = 'A'.repeat(1001);
      const response = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ ...validPayload, description: longDescription });

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toHaveProperty('description');
    });

    it('should accept valid payload and return 201', async () => {
      const response = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validPayload);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.amount).toBe(1000.50);
      expect(response.body.data.buyer).toBe('Acme Corp');
      expect(response.body.data.seller).toBe('Globex Inc');
      expect(response.body.data.currency).toBe('USD');
    });
  });

  describe('GET /api/invoices - Pagination Query Parameters', () => {
    it('should reject invalid page with 400', async () => {
      const response = await request(app)
        .get('/api/invoices')
        .query({ page: -1 });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Failed');
      expect(response.body.fieldErrors).toHaveProperty('page');
    });

    it('should reject non-integer page with 400', async () => {
      const response = await request(app)
        .get('/api/invoices')
        .query({ page: 1.5 });

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toHaveProperty('page');
    });

    it('should reject limit below 1 with 400', async () => {
      const response = await request(app)
        .get('/api/invoices')
        .query({ limit: 0 });

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toHaveProperty('limit');
    });

    it('should reject limit above 100 with 400', async () => {
      const response = await request(app)
        .get('/api/invoices')
        .query({ limit: 101 });

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toHaveProperty('limit');
    });

    it('should reject invalid status with 400', async () => {
      const response = await request(app)
        .get('/api/invoices')
        .query({ status: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toHaveProperty('status');
    });

    it('should reject invalid date format with 400', async () => {
      const response = await request(app)
        .get('/api/invoices')
        .query({ dateFrom: '01-01-2025' });

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toHaveProperty('dateFrom');
    });

    it('should accept valid pagination params and return 200', async () => {
      const response = await request(app)
        .get('/api/invoices')
        .query({ page: 1, limit: 20, status: 'pending', sortBy: 'amount', order: 'desc' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination).toHaveProperty('page');
      expect(response.body.pagination).toHaveProperty('limit');
      expect(response.body.pagination).toHaveProperty('total');
      expect(response.body.pagination).toHaveProperty('totalPages');
    });

    it('should use default values when params not provided', async () => {
      const response = await request(app)
        .get('/api/invoices');

      expect(response.status).toBe(200);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(20);
    });
  });
});

module.exports = {};