const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');

describe('Rate Limiting Middleware', () => {
  const secret = process.env.JWT_SECRET || 'test-secret';
  const validToken = jwt.sign({ id: 'test_user_1' }, secret);

  it('should return 200 for health check (global limiter allows many)', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.headers).toHaveProperty('ratelimit-limit');
  });

  it('should allow authenticated POST /api/invoices', async () => {
    const response = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ amount: 100, buyer: 'Rate Test Buyer', seller: 'Rate Test Seller', dueDate: '2025-12-31', currency: 'USD' });
    expect(response.status).toBe(201);
  });
});
