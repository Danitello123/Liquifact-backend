const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/index');
const { getAuditLogs } = require('../src/services/auditLog');

test('Security Middlewares Integration', async (t) => {
  // Task 4.1: A 403 is returned for a disallowed Origin.
  await t.test('CORS: returns 403 for disallowed origin', async () => {
    // Save original env
    const originalCorsOrigins = process.env.CORS_ORIGINS;
    process.env.CORS_ORIGINS = 'https://allowed.com';
    
    // We need to re-create the app or ensure the config is fresh
    // Since createApp calls createCorsOptions which reads env, it should work if we call it now
    const app = createApp({ enableTestRoutes: true });
    const response = await request(app)
      .get('/health')
      .set('Origin', 'https://disallowed.com');
    
    assert.strictEqual(response.status, 403);
    
    // Restore env
    process.env.CORS_ORIGINS = originalCorsOrigins;
  });

  // Task 4.2: A 413 is returned when the Content-Length exceeds 100kb.
  await t.test('Body Limit: returns 413 when Content-Length exceeds 100kb', async () => {
    const app = createApp({ enableTestRoutes: true });
    // Default JSON limit is 100kb. 101kb should trigger it.
    const largeBody = JSON.stringify({ data: 'a'.repeat(101 * 1024) });
    
    const response = await request(app)
      .post('/api/invoices')
      .set('Content-Type', 'application/json')
      .send(largeBody);
    
    assert.strictEqual(response.status, 413);
    assert.strictEqual(response.body.error, 'Payload Too Large');
  });

  // Task 4.3: The audit log does not contain the Authorization header.
  await t.test('Audit Log: does not contain Authorization header', async () => {
    const originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-secret';
    
    const app = createApp({ enableTestRoutes: true });
    const token = jwt.sign({ id: 'user-1', sub: 'user-1' }, 'test-secret');
    
    // Perform a mutation (POST) to trigger audit log
    const response = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, customer: 'Test Corp' });
    
    assert.strictEqual(response.status, 201);
    
    const logs = getAuditLogs();
    const lastLog = logs[logs.length - 1];
    
    // Check if Authorization header or token is in the log
    const logString = JSON.stringify(lastLog).toLowerCase();
    
    // The audit log captures req.body as beforeState and res.body as afterState.
    // It does NOT capture req.headers in metadata or anywhere else.
    // So the token should not be there anyway.
    assert.strictEqual(logString.includes('bearer'), false, 'Audit log should not contain Bearer token');
    assert.strictEqual(logString.includes(token.toLowerCase()), false, 'Audit log should not contain the token');
    
    // Restore env
    process.env.JWT_SECRET = originalSecret;
  });
});
