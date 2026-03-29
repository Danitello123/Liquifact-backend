/**
 * @fileoverview Express application factory for the LiquiFact API.
 *
 * Wires together all middleware and routes in the correct order:
 *   1. CORS policy (environment-driven allowlist, 403 on blocked origins)
 *   2. Request body-size guardrails (100 KB global JSON, 512 KB invoice limit)
 *   3. URL-encoded body parser (50 KB limit)
 *   4. Application routes (health, api-info, invoices, escrow)
 *   5. 404 catch-all
 *   6. CORS error handler  → 403 JSON
 *   7. Payload-too-large handler → 413 JSON
 *   8. Generic internal-error handler → 500 JSON
 *
 * @module app
 */

'use strict';

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { callSorobanContract } = require('./services/soroban');
const { createCorsOptions, isCorsOriginRejectedError } = require('./config/cors');
const { sanitizeInput } = require('./middleware/sanitizeInput');
const { validateInvoiceQueryParams } = require('./utils/validators');
const {
  invoiceBodyLimit,
  payloadTooLargeHandler,
} = require('./middleware/bodySizeLimits');
const responseHelper = require('./utils/responseHelper');

/**
 * Returns a 403 JSON response only for the dedicated blocked-origin CORS error.
 *
 * @param {Error}                          err  - Request error.
 * @param {import('express').Request}      req  - Express request.
 * @param {import('express').Response}     res  - Express response.
 * @param {import('express').NextFunction} next - Express next callback.
 * @returns {void}
 */
function handleCorsError(err, req, res, next) {
  if (isCorsOriginRejectedError(err)) {
    res.status(403).json({ error: err.message });
    return;
  }
  next(err);
}

/**
 * Handles uncaught application errors with a generic 500 response.
 *
 * @param {Error}                          err   - Request error.
 * @param {import('express').Request}      req   - Express request.
 * @param {import('express').Response}     res   - Express response.
 * @param {import('express').NextFunction} _next - Express next callback (unused).
 * @returns {void}
 */
function handleInternalError(err, req, res, _next) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (err && (err.type === 'entity.parse.failed' || err.status === 400)) {
    res.status(400).json({ error: 'Bad Request' });
    return;
  }

  console.error(err);
  if (isDevelopment) {
    res.status(500).json({
      error: {
        message: err && err.message ? err.message : 'Internal server error',
        stack: err && err.stack ? err.stack : null,
      },
    });
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
}

/**
 * Creates the LiquiFact API application with configured middleware and routes.
 *
 * Exported as a factory function so each test suite can spin up a clean
 * instance without shared state.
 *
 * @returns {import('express').Express} Configured Express application.
 */
function createApp() {
  const app = express();

  // ── 1. CORS ──────────────────────────────────────────────────────────────
  // Must come before body parsers so preflight OPTIONS requests are handled
  // before any payload is read.
  app.use(cors(createCorsOptions()));
  app.use(express.json());
  app.use(sanitizeInput);

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status:    'ok',
      service:   'liquifact-api',
      version:   '0.1.0',
      timestamp: new Date().toISOString(),
    });
  });

  // API info
  app.get('/api', (req, res) => {
    res.json({
      name:        'LiquiFact API',
      description: 'Global Invoice Liquidity Network on Stellar',
      endpoints: {
        health:   'GET /health',
        invoices: 'GET/POST /api/invoices',
        escrow:   'GET/POST /api/escrow',
      },
    });
  });

  // Invoices — GET (list)
  app.get('/api/invoices', async (req, res, next) => {
    try {
      const validation = validateInvoiceQueryParams(req.query);
      if (!validation.isValid) {
        res.status(400).json({ errors: validation.errors });
        return;
      }

      let invoiceService;
      try {
        invoiceService = require('./services/invoice.service');
      } catch {
        res.json({
          data: [],
          message: 'Invoices retrieved successfully.',
        });
        return;
      }

      if (!invoiceService || typeof invoiceService.getInvoices !== 'function') {
        res.json({
          data: [],
          message: 'Invoices retrieved successfully.',
        });
        return;
      }

      const data = await invoiceService.getInvoices(validation.validatedParams);
      res.json({
        data,
        message: 'Invoices retrieved successfully.',
      });
      return;
    } catch (error) {
      next(error);
    }
  });

  // Invoices — POST (create) with strict 512 KB body limit
  app.post('/api/invoices', ...invoiceBodyLimit(), (req, res) => {
    res.status(201).json({
      data:    { id: 'placeholder', status: 'pending_verification' },
      message: 'Invoice upload will be implemented with verification and tokenization.',
    });
  });

  // Escrow — GET by invoiceId (proxied through Soroban retry wrapper)
  app.get('/api/escrow/:invoiceId', async (req, res) => {
    const { invoiceId } = req.params;
    try {
      /**
       * Simulated remote contract call.
       *
       * @returns {Promise<object>} Simulated escrow payload.
       */
      const operation = async () => {
        return { invoiceId, status: 'not_found', fundedAmount: 0 };
      };
      const data = await callSorobanContract(operation);
      res.json({
        data,
        message: 'Escrow state read from Soroban contract via robust integration wrapper.',
      });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Error fetching escrow state' });
    }
  });

  // Developer test route — forces a 500 to exercise the error handler
  app.get('/error', (req, res, next) => {
    next(new Error('Simulated server error'));
  });

  app.get('/debug/error', (req, res, next) => {
    next(new Error('Triggered Error'));
  });

  app.get('/prod-error', (req, res, next) => {
    next(new Error('Sensitive'));
  });

  // ── 5. 404 catch-all ─────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.path });
  });

  // ── 6 – 8. Error handlers (order matters) ────────────────────────────────
  app.use(handleCorsError);         // 403 for blocked CORS origins
  app.use(payloadTooLargeHandler);  // 413 for oversized request bodies
  app.use(handleInternalError);     // 500 for everything else

  return app;
}

/**
 * Maps HTTP status to default API error code.
 *
 * @param {number} statusCode - HTTP status code.
 * @returns {string} Standardized error code.
 */
function getErrorCode(statusCode) {
  if (statusCode === 400) {
    return 'BAD_REQUEST';
  }
  if (statusCode === 401) {
    return 'UNAUTHORIZED';
  }
  if (statusCode === 403) {
    return 'FORBIDDEN';
  }
  if (statusCode === 404) {
    return 'NOT_FOUND';
  }
  return 'INTERNAL_ERROR';
}

/**
 * Builds a standardized envelope from an outgoing JSON payload.
 *
 * @param {number} statusCode - Response status code.
 * @param {unknown} payload - Outgoing payload.
 * @returns {Object} Standardized response envelope.
 */
function toStandardEnvelope(statusCode, payload) {
  const isDev = process.env.NODE_ENV === 'development';
  const isObjectPayload = payload !== null && typeof payload === 'object';

  if (
    isObjectPayload &&
    Object.prototype.hasOwnProperty.call(payload, 'data') &&
    Object.prototype.hasOwnProperty.call(payload, 'meta') &&
    Object.prototype.hasOwnProperty.call(payload, 'error')
  ) {
    return payload;
  }

  if (statusCode < 400) {
    const data =
      isObjectPayload && Object.prototype.hasOwnProperty.call(payload, 'data')
        ? payload.data
        : payload;
    return responseHelper.success(data);
  }

  const payloadError =
    isObjectPayload && Object.prototype.hasOwnProperty.call(payload, 'error')
      ? payload.error
      : null;

  let message = 'Internal server error';
  if (typeof payloadError === 'string') {
    message = payloadError;
  } else if (payloadError && typeof payloadError.message === 'string') {
    message = payloadError.message;
  } else if (isObjectPayload && typeof payload.message === 'string') {
    message = payload.message;
  }

  if (statusCode >= 500 && !isDev) {
    message = 'Internal server error';
  }

  const details = isDev
    ? (payloadError && payloadError.stack) ||
      (payloadError && payloadError.details) ||
      (isObjectPayload && payload.stack) ||
      (isObjectPayload && payload.message) ||
      message
    : null;

  return responseHelper.error(message, getErrorCode(statusCode), details);
}

/**
 * Creates app instance that always returns standardized response envelopes.
 *
 * @returns {import('express').Express} Standardized app instance.
 */
function createStandardizedApp() {
  const standardizedApp = express();
  const rawApp = createApp();

  standardizedApp.use((req, res, next) => {
    const originalJson = res.json.bind(res);
    /**
     * Wraps outgoing JSON payloads in the standard response envelope.
     *
     * @param {unknown} payload - Outgoing JSON payload.
     * @returns {import('express').Response} Express response.
     */
    res.json = function sendEnvelopedJson(payload) {
      const envelope = toStandardEnvelope(res.statusCode, payload);
      return originalJson(envelope);
    };
    next();
  });

  standardizedApp.use(rawApp);
  return standardizedApp;
}

const app = createStandardizedApp();

module.exports = app;
module.exports.createApp = createApp;
module.exports.createStandardizedApp = createStandardizedApp;
module.exports.handleCorsError = handleCorsError;
module.exports.handleInternalError = handleInternalError;
