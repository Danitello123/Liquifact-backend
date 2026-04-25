const request = require('supertest');
const app = require('../src/index');

describe('OpenAPI Documentation', () => {
  test('GET /openapi.json - Returns valid OpenAPI 3.0 specification', async () => {
    const res = await request(app).get('/openapi.json');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');

    const spec = res.body;
    expect(spec.openapi).toBe('3.0.0');
    expect(spec.info.title).toBe('LiquiFact API');
    expect(spec.info.version).toBe('1.0.0');
    expect(spec.servers).toBeDefined();
    expect(spec.components.schemas).toBeDefined();
    expect(spec.components.schemas.Invoice).toBeDefined();
    expect(spec.components.schemas.EscrowState).toBeDefined();
    expect(spec.paths).toBeDefined();
  });

  test('GET /docs - Serves Swagger UI', async () => {
    const res = await request(app).get('/docs');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('swagger-ui');
  });

  test('OpenAPI spec includes all documented endpoints', async () => {
    const res = await request(app).get('/openapi.json');
    const spec = res.body;

    // Check that key endpoints are documented
    expect(spec.paths['/health']).toBeDefined();
    expect(spec.paths['/api']).toBeDefined();
    expect(spec.paths['/api/invoices']).toBeDefined();
    expect(spec.paths['/api/invoices/{id}']).toBeDefined();
    expect(spec.paths['/api/escrow/{invoiceId}']).toBeDefined();
    expect(spec.paths['/api/escrow']).toBeDefined();
    expect(spec.paths['/api/invest/opportunities']).toBeDefined();
    expect(spec.paths['/api/sme/metrics']).toBeDefined();
  });

  test('OpenAPI spec includes proper security schemes', async () => {
    const res = await request(app).get('/openapi.json');
    const spec = res.body;

    expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
    expect(spec.components.securitySchemes.bearerAuth.type).toBe('http');
    expect(spec.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
  });
});