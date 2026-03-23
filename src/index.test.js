import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app, startServer } from './index';

describe('LiquiFact API', () => {
  it('GET /health - returns 200 and status ok', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('service', 'liquifact-api');
    expect(response.body).toHaveProperty('version');
    expect(response.body).toHaveProperty('timestamp');
  });

  it('GET /api - returns 200 and API info', async () => {
    const response = await request(app).get('/api');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('name', 'LiquiFact API');
    expect(response.body.endpoints).toHaveProperty('health');
    expect(response.body.endpoints).toHaveProperty('invoices');
    expect(response.body.endpoints).toHaveProperty('escrow');
  });

  it('GET /api/invoices - returns 200 and placeholder data', async () => {
    const response = await request(app).get('/api/invoices');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.message).toContain('Invoice service');
  });

  it('POST /api/invoices - returns 201 and placeholder message', async () => {
    const response = await request(app).post('/api/invoices').send({ test: 'data' });
    expect(response.status).toBe(201);
    expect(response.body.data).toHaveProperty('id', 'placeholder');
    expect(response.body.message).toContain('Invoice upload');
  });

  it('GET /api/escrow/:invoiceId - returns 200 and placeholder escrow state', async () => {
    const response = await request(app).get('/api/escrow/123');
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveProperty('invoiceId', '123');
    expect(response.body.data).toHaveProperty('status', 'not_found');
  });

  it('unknown route - returns 404', async () => {
    const response = await request(app).get('/unknown');
    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error', 'Not found');
  });

  it('error handler - returns 500 on unexpected error', async () => {
    // Mock console.error to avoid noise in test output
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request(app).get('/error-test-trigger');
    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty('error', 'Internal server error');

    consoleSpy.mockRestore();
  });

  it('startServer - starts the server and returns it', () => {
    const mockServer = { close: vi.fn() };
    const listenSpy = vi.spyOn(app, 'listen').mockImplementation((port, cb) => {
      if (cb) { cb(); }
      return mockServer;
    });

    const server = startServer();
    expect(listenSpy).toHaveBeenCalled();
    expect(server).toBe(mockServer);

    listenSpy.mockRestore();
  });
});
