/**
 * @fileoverview Invoice File Integrity Tests
 * 
 * Tests SHA-256 hash-based integrity verification for invoice PDFs.
 * Validates upload, retrieval, and tamper detection capabilities.
 */

'use strict';

const request = require('supertest');
const express = require('express');
const crypto = require('crypto');
const invoiceFileRouter = require('../src/routes/invoiceFile');

describe('Invoice File Integrity', () => {
  let app;

  beforeEach(() => {
    // Create fresh app instance for each test
    app = express();
    app.use('/api/invoices', invoiceFileRouter);
  });

  describe('POST /api/invoices/:id/file - Upload PDF', () => {
    it('should upload PDF and return SHA-256 hash', async () => {
      const invoiceId = 'inv_001';
      const pdfContent = Buffer.from('%PDF-1.4 fake pdf content');

      const res = await request(app)
        .post(`/api/invoices/${invoiceId}/file`)
        .set('Content-Type', 'application/pdf')
        .send(pdfContent);

      expect(res.statusCode).toBe(201);
      expect(res.body.data).toHaveProperty('invoiceId', invoiceId);
      expect(res.body.data).toHaveProperty('fileHash');
      expect(res.body.data.fileHash).toHaveLength(64); // SHA-256 hex length
      expect(res.body.data).toHaveProperty('fileSize', pdfContent.length);
      expect(res.body.data).toHaveProperty('uploadedAt');
      expect(res.body.message).toBe('Invoice file uploaded successfully');
    });

    it('should compute correct SHA-256 hash', async () => {
      const invoiceId = 'inv_002';
      const pdfContent = Buffer.from('%PDF-1.4 test content');
      const expectedHash = crypto.createHash('sha256').update(pdfContent).digest('hex');

      const res = await request(app)
        .post(`/api/invoices/${invoiceId}/file`)
        .set('Content-Type', 'application/pdf')
        .send(pdfContent);

      expect(res.statusCode).toBe(201);
      expect(res.body.data.fileHash).toBe(expectedHash);
    });

    it('should reject non-PDF content type', async () => {
      const invoiceId = 'inv_003';
      const content = Buffer.from('not a pdf');

      const res = await request(app)
        .post(`/api/invoices/${invoiceId}/file`)
        .set('Content-Type', 'application/json')
        .send(content);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toBe('Content-Type must be application/pdf');
    });

    it('should reject empty file data', async () => {
      const invoiceId = 'inv_004';

      const res = await request(app)
        .post(`/api/invoices/${invoiceId}/file`)
        .set('Content-Type', 'application/pdf')
        .send(Buffer.alloc(0));

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toBe('No file data provided');
    });

    it('should reject invalid invoice ID', async () => {
      const pdfContent = Buffer.from('%PDF-1.4 content');

      const res = await request(app)
        .post('/api/invoices/ /file')
        .set('Content-Type', 'application/pdf')
        .send(pdfContent);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toBe('Invalid invoice ID');
    });

    it('should handle large PDF files within limit', async () => {
      const invoiceId = 'inv_005';
      const largePdf = Buffer.alloc(1024 * 1024); // 1 MB
      largePdf.write('%PDF-1.4');

      const res = await request(app)
        .post(`/api/invoices/${invoiceId}/file`)
        .set('Content-Type', 'application/pdf')
        .send(largePdf);

      expect(res.statusCode).toBe(201);
      expect(res.body.data.fileSize).toBe(largePdf.length);
    });
  });


  describe('GET /api/invoices/:id/file - Retrieve PDF', () => {
    it('should retrieve uploaded PDF with hash header', async () => {
      const invoiceId = 'inv_101';
      const pdfContent = Buffer.from('%PDF-1.4 retrieve test');

      // Upload first
      await request(app)
        .post(`/api/invoices/${invoiceId}/file`)
        .set('Content-Type', 'application/pdf')
        .send(pdfContent);

      // Retrieve
      const res = await request(app)
        .get(`/api/invoices/${invoiceId}/file`);

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['x-file-hash']).toBeDefined();
      expect(res.headers['x-file-hash']).toHaveLength(64);
      expect(res.body).toEqual(pdfContent);
    });

    it('should return 404 for non-existent file', async () => {
      const res = await request(app)
        .get('/api/invoices/nonexistent/file');

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('Not Found');
      expect(res.body.message).toContain('No file found');
    });

    it('should reject invalid invoice ID', async () => {
      const res = await request(app)
        .get('/api/invoices/ /file');

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Bad Request');
    });
  });

  describe('GET /api/invoices/:id/file/verify - Verify Stored File', () => {
    it('should verify integrity of stored file', async () => {
      const invoiceId = 'inv_201';
      const pdfContent = Buffer.from('%PDF-1.4 verify test');

      // Upload
      const uploadRes = await request(app)
        .post(`/api/invoices/${invoiceId}/file`)
        .set('Content-Type', 'application/pdf')
        .send(pdfContent);

      const uploadedHash = uploadRes.body.data.fileHash;

      // Verify
      const res = await request(app)
        .get(`/api/invoices/${invoiceId}/file/verify`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.isValid).toBe(true);
      expect(res.body.data.storedHash).toBe(uploadedHash);
      expect(res.body.data.currentHash).toBe(uploadedHash);
      expect(res.body.data.invoiceId).toBe(invoiceId);
      expect(res.body.data).toHaveProperty('uploadedAt');
      expect(res.body.data).toHaveProperty('verifiedAt');
      expect(res.body.message).toBe('File integrity verified');
    });

    it('should return 404 for non-existent file', async () => {
      const res = await request(app)
        .get('/api/invoices/nonexistent/file/verify');

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('Not Found');
    });

    it('should reject invalid invoice ID', async () => {
      const res = await request(app)
        .get('/api/invoices/ /file/verify');

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Bad Request');
    });
  });

  describe('POST /api/invoices/:id/file/verify - Verify Provided File', () => {
    it('should verify matching file successfully', async () => {
      const invoiceId = 'inv_301';
      const pdfContent = Buffer.from('%PDF-1.4 match test');

      // Upload original
      await request(app)
        .post(`/api/invoices/${invoiceId}/file`)
        .set('Content-Type', 'application/pdf')
        .send(pdfContent);

      // Verify with same content
      const res = await request(app)
        .post(`/api/invoices/${invoiceId}/file/verify`)
        .set('Content-Type', 'application/pdf')
        .send(pdfContent);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.isValid).toBe(true);
      expect(res.body.data.storedHash).toBe(res.body.data.providedHash);
      expect(res.body.message).toBe('File integrity verified');
    });

    it('should detect tampered file', async () => {
      const invoiceId = 'inv_302';
      const originalContent = Buffer.from('%PDF-1.4 original');
      const tamperedContent = Buffer.from('%PDF-1.4 tampered');

      // Upload original
      const uploadRes = await request(app)
        .post(`/api/invoices/${invoiceId}/file`)
        .set('Content-Type', 'application/pdf')
        .send(originalContent);

      const originalHash = uploadRes.body.data.fileHash;

      // Verify with tampered content
      const res = await request(app)
        .post(`/api/invoices/${invoiceId}/file/verify`)
        .set('Content-Type', 'application/pdf')
        .send(tamperedContent);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.isValid).toBe(false);
      expect(res.body.data.storedHash).toBe(originalHash);
      expect(res.body.data.providedHash).not.toBe(originalHash);
      expect(res.body.message).toContain('failed');
      expect(res.body.message).toContain('tampered');
    });

    it('should detect single byte modification', async () => {
      const invoiceId = 'inv_303';
      const originalContent = Buffer.from('%PDF-1.4 original content');
      const modifiedContent = Buffer.from('%PDF-1.4 original content');
      modifiedContent[10] = modifiedContent[10] + 1; // Change one byte

      // Upload original
      await request(app)
        .post(`/api/invoices/${invoiceId}/file`)
        .set('Content-Type', 'application/pdf')
        .send(originalContent);

      // Verify with modified content
      const res = await request(app)
        .post(`/api/invoices/${invoiceId}/file/verify`)
        .set('Content-Type', 'application/pdf')
        .send(modifiedContent);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.isValid).toBe(false);
    });

    it('should reject empty verification data', async () => {
      const invoiceId = 'inv_304';
      const pdfContent = Buffer.from('%PDF-1.4 content');

      // Upload
      await request(app)
        .post(`/api/invoices/${invoiceId}/file`)
        .set('Content-Type', 'application/pdf')
        .send(pdfContent);

      // Verify with empty data
      const res = await request(app)
        .post(`/api/invoices/${invoiceId}/file/verify`)
        .set('Content-Type', 'application/pdf')
        .send(Buffer.alloc(0));

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toBe('No file data provided for verification');
    });

    it('should return 404 for non-existent invoice', async () => {
      const pdfContent = Buffer.from('%PDF-1.4 content');

      const res = await request(app)
        .post('/api/invoices/nonexistent/file/verify')
        .set('Content-Type', 'application/pdf')
        .send(pdfContent);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('Not Found');
    });
  });

  describe('Hash Consistency', () => {
    it('should produce identical hashes for identical content', async () => {
      const content = Buffer.from('%PDF-1.4 consistency test');

      // Upload to two different invoices
      const res1 = await request(app)
        .post('/api/invoices/inv_401/file')
        .set('Content-Type', 'application/pdf')
        .send(content);

      const res2 = await request(app)
        .post('/api/invoices/inv_402/file')
        .set('Content-Type', 'application/pdf')
        .send(content);

      expect(res1.body.data.fileHash).toBe(res2.body.data.fileHash);
    });

    it('should produce different hashes for different content', async () => {
      const content1 = Buffer.from('%PDF-1.4 content A');
      const content2 = Buffer.from('%PDF-1.4 content B');

      const res1 = await request(app)
        .post('/api/invoices/inv_403/file')
        .set('Content-Type', 'application/pdf')
        .send(content1);

      const res2 = await request(app)
        .post('/api/invoices/inv_404/file')
        .set('Content-Type', 'application/pdf')
        .send(content2);

      expect(res1.body.data.fileHash).not.toBe(res2.body.data.fileHash);
    });
  });

  describe('Edge Cases', () => {
    it('should handle PDF with special characters', async () => {
      const invoiceId = 'inv_501';
      const pdfContent = Buffer.from('%PDF-1.4\n<special>chars&symbols</special>');

      const res = await request(app)
        .post(`/api/invoices/${invoiceId}/file`)
        .set('Content-Type', 'application/pdf')
        .send(pdfContent);

      expect(res.statusCode).toBe(201);
      expect(res.body.data.fileHash).toHaveLength(64);
    });

    it('should handle binary PDF data', async () => {
      const invoiceId = 'inv_502';
      const binaryData = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0xFF, 0xFE]);

      const res = await request(app)
        .post(`/api/invoices/${invoiceId}/file`)
        .set('Content-Type', 'application/pdf')
        .send(binaryData);

      expect(res.statusCode).toBe(201);
      expect(res.body.data.fileSize).toBe(binaryData.length);
    });

    it('should handle invoice ID with special characters', async () => {
      const invoiceId = 'inv-2024-001_test';
      const pdfContent = Buffer.from('%PDF-1.4 content');

      const res = await request(app)
        .post(`/api/invoices/${invoiceId}/file`)
        .set('Content-Type', 'application/pdf')
        .send(pdfContent);

      expect(res.statusCode).toBe(201);
      expect(res.body.data.invoiceId).toBe(invoiceId);
    });
  });
});
