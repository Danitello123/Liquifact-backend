/**
 * @fileoverview Invoice File Operations with Integrity Verification
 * 
 * Handles PDF upload, storage, and SHA-256 hash-based integrity verification.
 * Protects against file tampering by computing and storing cryptographic hashes.
 * 
 * @module routes/invoiceFile
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// In-memory storage for invoice files and hashes (production: use database + S3/blob storage)
const invoiceFiles = new Map();

/**
 * Computes SHA-256 hash of buffer data.
 * 
 * @param {Buffer} buffer - File data as buffer
 * @returns {string} Hex-encoded SHA-256 hash
 */
function computeHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * POST /api/invoices/:id/file
 * Upload PDF file for an invoice and compute integrity hash.
 * 
 * Security:
 * - Validates Content-Type is application/pdf
 * - Enforces size limits via body parser
 * - Computes SHA-256 hash for tamper detection
 * - Stores hash with file metadata
 */
router.post('/:id/file', express.raw({ type: 'application/pdf', limit: '5mb' }), (req, res) => {
  const { id } = req.params;

  // Validate invoice ID
  if (!id || typeof id !== 'string' || id.trim() === '') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid invoice ID'
    });
  }

  // Validate Content-Type
  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('application/pdf')) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Content-Type must be application/pdf'
    });
  }

  // Validate file data exists
  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'No file data provided'
    });
  }

  // Compute SHA-256 hash
  const fileHash = computeHash(req.body);
  const fileSize = req.body.length;

  // Store file with metadata
  invoiceFiles.set(id, {
    invoiceId: id,
    fileData: req.body,
    fileHash,
    fileSize,
    contentType: 'application/pdf',
    uploadedAt: new Date().toISOString()
  });

  return res.status(201).json({
    data: {
      invoiceId: id,
      fileHash,
      fileSize,
      uploadedAt: invoiceFiles.get(id).uploadedAt
    },
    message: 'Invoice file uploaded successfully'
  });
});

/**
 * GET /api/invoices/:id/file
 * Retrieve the PDF file for an invoice.
 */
router.get('/:id/file', (req, res) => {
  const { id } = req.params;

  if (!id || typeof id !== 'string' || id.trim() === '') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid invoice ID'
    });
  }

  const fileRecord = invoiceFiles.get(id);

  if (!fileRecord) {
    return res.status(404).json({
      error: 'Not Found',
      message: `No file found for invoice ${id}`
    });
  }

  res.set('Content-Type', 'application/pdf');
  res.set('Content-Length', fileRecord.fileSize);
  res.set('X-File-Hash', fileRecord.fileHash);
  return res.send(fileRecord.fileData);
});

/**
 * GET /api/invoices/:id/file/verify
 * Verify integrity of uploaded PDF by comparing stored hash with current file hash.
 * 
 * Returns verification status and hash comparison details.
 */
router.get('/:id/file/verify', (req, res) => {
  const { id } = req.params;

  if (!id || typeof id !== 'string' || id.trim() === '') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid invoice ID'
    });
  }

  const fileRecord = invoiceFiles.get(id);

  if (!fileRecord) {
    return res.status(404).json({
      error: 'Not Found',
      message: `No file found for invoice ${id}`
    });
  }

  // Recompute hash from stored file data
  const currentHash = computeHash(fileRecord.fileData);
  const storedHash = fileRecord.fileHash;
  const isValid = currentHash === storedHash;

  return res.json({
    data: {
      invoiceId: id,
      isValid,
      storedHash,
      currentHash,
      uploadedAt: fileRecord.uploadedAt,
      verifiedAt: new Date().toISOString()
    },
    message: isValid ? 'File integrity verified' : 'File integrity check failed'
  });
});

/**
 * POST /api/invoices/:id/file/verify
 * Verify integrity of a provided PDF against the stored hash.
 * 
 * Accepts PDF in request body and compares its hash with stored hash.
 * Use case: Client wants to verify a downloaded file hasn't been tampered with.
 */
router.post('/:id/file/verify', express.raw({ type: 'application/pdf', limit: '5mb' }), (req, res) => {
  const { id } = req.params;

  if (!id || typeof id !== 'string' || id.trim() === '') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid invoice ID'
    });
  }

  const fileRecord = invoiceFiles.get(id);

  if (!fileRecord) {
    return res.status(404).json({
      error: 'Not Found',
      message: `No file found for invoice ${id}`
    });
  }

  // Validate file data provided
  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'No file data provided for verification'
    });
  }

  // Compute hash of provided file
  const providedHash = computeHash(req.body);
  const storedHash = fileRecord.fileHash;
  const isValid = providedHash === storedHash;

  return res.json({
    data: {
      invoiceId: id,
      isValid,
      storedHash,
      providedHash,
      uploadedAt: fileRecord.uploadedAt,
      verifiedAt: new Date().toISOString()
    },
    message: isValid ? 'File integrity verified' : 'File integrity check failed - file may have been tampered with'
  });
});

module.exports = router;
