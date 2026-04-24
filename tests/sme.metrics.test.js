const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/index');
const { mockInvoices } = require('../src/services/invoiceService');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

describe('SME Metrics API', () => {
  const userId = 'test_sme_user';
  const token = jwt.sign({ id: userId }, JWT_SECRET);

  beforeEach(() => {
    // Clear and repopulate mockInvoices for predictable tests
    mockInvoices.length = 0;
  });

  test('GET /api/sme/metrics - Returns correct counts for various statuses', async () => {
    mockInvoices.push(
      { id: '1', ownerId: userId, status: 'pending_verification' },
      { id: '2', ownerId: userId, status: 'verified' },
      { id: '3', ownerId: userId, status: 'funded' },
      { id: '4', ownerId: userId, status: 'settled' },
      { id: '5', ownerId: userId, status: 'paid' },
      { id: '6', ownerId: userId, status: 'defaulted' }
    );

    const res = await request(app)
      .get('/api/sme/metrics')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      open: 2,      // pending_verification + verified
      funded: 1,    // funded
      settled: 2,   // settled + paid
      defaulted: 1  // defaulted
    });
    expect(res.body.timestamp).toBeDefined();
  });

  test('GET /api/sme/metrics - Returns zeros for a new user with no invoices', async () => {
    const newUserToken = jwt.sign({ id: 'new_user' }, JWT_SECRET);

    const res = await request(app)
      .get('/api/sme/metrics')
      .set('Authorization', `Bearer ${newUserToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      open: 0,
      funded: 0,
      settled: 0,
      defaulted: 0
    });
  });

  test('GET /api/sme/metrics - Ensures "withdrawn" invoices are not counted', async () => {
    mockInvoices.push(
      { id: '1', ownerId: userId, status: 'withdrawn' },
      { id: '2', ownerId: userId, status: 'pending_verification' }
    );

    const res = await request(app)
      .get('/api/sme/metrics')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.open).toBe(1);
    // Ensure total sum of metrics is 1 (only the 'open' one)
    const total = Object.values(res.body.data).reduce((a, b) => a + b, 0);
    expect(total).toBe(1);
  });

  test('GET /api/sme/metrics - Rejects unauthorized requests', async () => {
    const res = await request(app).get('/api/sme/metrics');
    expect(res.status).toBe(401);
  });
});
