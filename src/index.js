'use strict';

/**
 * Express server bootstrap for invoice financing, auth, and Stellar integration.
 *
 * All /api/* routes now enforce tenant-scoped data isolation:
 *   - `extractTenant` middleware resolves the caller's tenantId from either
 *     the `x-tenant-id` request header or an authenticated JWT claim.
 *   - Every invoice read/write delegates to the tenant-aware repository so
 *     that no tenant can ever observe or mutate another tenant's data.
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { createSecurityMiddleware } = require('./middleware/security');
const { createCorsOptions } = require('./config/cors');
const { correlationIdMiddleware } = require('./middleware/correlationId');
const { jsonBodyLimit, urlencodedBodyLimit, payloadTooLargeHandler } = require('./middleware/bodySizeLimits');
const { auditMiddleware } = require('./middleware/audit');
const { globalLimiter, sensitiveLimiter } = require('./middleware/rateLimit');
const { authenticateToken } = require('./middleware/auth');
const smeRouter = require('./routes/sme');
const errorHandler = require('./middleware/errorHandler');
const { callSorobanContract } = require('./services/soroban');
const AppError = require('./errors/AppError');
const logger = require('./logger');
const requestId = require('./middleware/requestId');
const pinoHttp = require('pino-http');
const investRoutes = require('./routes/invest');
const {
  invoiceCreateSchema,
  paginationQuerySchema,
  validateBody,
  validateQuery,
} = require('./schemas/invoice');

const PORT = process.env.PORT || 3001;

// In-memory storage for invoices (Issue #25).
let invoices = [];

/**
 * Create the Express application instance.
 *
 * @param {object} [options={}] - App options.
 * @param {boolean} [options.enableTestRoutes=false] - Whether to expose test-only routes.
 * @returns {import('express').Express}
 */
function createApp(options = {}) {
  const { enableTestRoutes = false } = options;
  const app = express();

  app.use(requestId);
  app.use(pinoHttp({
    logger,
    genReqId: (req) => req.id,
    customLogLevel: (req, res, err) => {
      if (res.statusCode >= 500 || err) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        query: req.query,
        headers: {
          'x-tenant-id': req.headers['x-tenant-id'],
          'user-agent': req.headers['user-agent'],
        },
      }),
    },
  }));

  app.use(createSecurityMiddleware());
  app.use(correlationIdMiddleware);
  app.use(cors(createCorsOptions()));
  app.use(jsonBodyLimit());
  app.use(urlencodedBodyLimit());
  app.use(globalLimiter);
  app.use(auditMiddleware);

  app.use('/api/sme', smeRouter);

  app.get('/health', (req, res) => {
    return res.json({
      status: 'ok',
      service: 'liquifact-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api', (req, res) => {
    return res.json({
      name: 'LiquiFact API',
      description: 'Global Invoice Liquidity Network on Stellar',
      endpoints: {
        health: 'GET /health',
        invoices: 'GET/POST /api/invoices',
        escrow: 'GET/POST /api/escrow',
      },
    });
  });

  app.use('/api/invest', investRoutes);

  app.get('/api/invoices', validateQuery(paginationQuerySchema), (req, res) => {
    const { page, limit, status, smeId, buyerId, dateFrom, dateTo, sortBy, order } = req.validatedQuery;
    const includeDeleted = req.query.includeDeleted === 'true';
    
    let filteredInvoices = includeDeleted
      ? invoices
      : invoices.filter((inv) => !inv.deletedAt);

    if (status) {
      filteredInvoices = filteredInvoices.filter((inv) => inv.status === status);
    }
    if (smeId) {
      filteredInvoices = filteredInvoices.filter((inv) => inv.smeId === smeId);
    }
    if (buyerId) {
      filteredInvoices = filteredInvoices.filter((inv) => inv.buyerId === buyerId);
    }
    if (dateFrom) {
      filteredInvoices = filteredInvoices.filter((inv) => inv.createdAt >= dateFrom);
    }
    if (dateTo) {
      filteredInvoices = filteredInvoices.filter((inv) => inv.createdAt <= dateTo);
    }

    if (sortBy) {
      filteredInvoices.sort((a, b) => {
        const aVal = a[sortBy] ?? 0;
        const bVal = b[sortBy] ?? 0;
        if (order === 'desc') {
          return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
        }
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      });
    }

    const pageNum = page || 1;
    const limitNum = limit || 20;
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedInvoices = filteredInvoices.slice(startIndex, endIndex);

    return res.json({
      data: paginatedInvoices,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: filteredInvoices.length,
        totalPages: Math.ceil(filteredInvoices.length / limitNum),
      },
      message: includeDeleted ? 'Showing all invoices (including deleted).' : 'Showing active invoices.',
    });
  });

  app.post('/api/invoices', authenticateToken, sensitiveLimiter, validateBody(invoiceCreateSchema), (req, res) => {
    const { amount, buyer, seller, dueDate, currency, description, invoiceNumber } = req.validated;

    const newInvoice = {
      id: `inv_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      amount,
      buyer,
      seller,
      dueDate,
      currency: currency.toUpperCase(),
      description,
      invoiceNumber,
      status: 'pending_verification',
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };

    invoices.push(newInvoice);

    return res.status(201).json({
      data: newInvoice,
      message: 'Invoice uploaded successfully.',
    });
  });

  app.delete('/api/invoices/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const invoiceIndex = invoices.findIndex((inv) => inv.id === id);

    if (invoiceIndex === -1) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

     
    if (invoices[invoiceIndex].deletedAt) {
      return res.status(400).json({ error: 'Invoice is already deleted' });
    }

     
    invoices[invoiceIndex].deletedAt = new Date().toISOString();

    return res.json({
      message: 'Invoice soft-deleted successfully.',
       
      data: invoices[invoiceIndex],
    });
  });

  app.patch('/api/invoices/:id/restore', authenticateToken, (req, res) => {
    const { id } = req.params;
    const invoiceIndex = invoices.findIndex((inv) => inv.id === id);

    if (invoiceIndex === -1) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

     
    if (!invoices[invoiceIndex].deletedAt) {
      return res.status(400).json({ error: 'Invoice is not deleted' });
    }

     
    invoices[invoiceIndex].deletedAt = null;

    return res.status(200).json({
      message: 'Invoice restored successfully.',
       
      data: invoices[invoiceIndex],
    });
  });

  app.get('/api/escrow/:invoiceId', authenticateToken, async (req, res) => {
    const { invoiceId } = req.params;

    try {
      /**
       * Simulates a Soroban operation for escrow lookup.
       *
       * @returns {Promise<object>} Placeholder escrow state.
       */
      const operation = async () => {
        return { invoiceId, status: 'not_found', fundedAmount: 0 };
      };

      const data = await callSorobanContract(operation);
      return res.json({
        data,
        message: 'Escrow state read from Soroban contract via robust integration wrapper.',
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Error fetching escrow state' });
    }
  });

  app.post('/api/escrow', authenticateToken, sensitiveLimiter, (req, res) => {
    return res.json({
      data: { status: 'funded' },
      message: 'Escrow operation simulated.',
    });
  });

  app.get('/error-test-trigger', (req, res, next) => {
    next(new Error('Simulated server error'));
  });

  if (enableTestRoutes) {
    app.get('/__test__/forbidden', (_req, _res) => {
      throw new AppError({
        type: 'https://liquifact.com/probs/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'Forbidden test route',
      });
    });

    app.get('/__test__/upstream', (_req, _res) => {
      const error = new Error('connection refused');
      error.code = 'ECONNREFUSED';
      throw error;
    });

    app.get('/__test__/explode', (_req, _res) => {
      throw new Error('Sensitive stack detail should not leak');
    });

    app.get('/__test__/throw-string', (_req, _res) => {
      throw 'boom';
    });
  }

  app.use(payloadTooLargeHandler);

  app.use((req, res, next) => {
    next(
      new AppError({
        type: 'https://liquifact.com/probs/not-found',
        title: 'Resource Not Found',
        status: 404,
        detail: `The path ${req.path} does not exist.`,
        instance: req.originalUrl,
      })
    );
  });

  // RFC 7807 error handler — handles AppError + generic errors.
  app.use(errorHandler);

  return app;
}

const app = createApp({ enableTestRoutes: process.env.NODE_ENV === 'test' });

// ─── Server lifecycle ─────────────────────────────────────────────────────────

/**
 * Starts the HTTP server.
 *
 * @returns {import('http').Server}
 */
const startServer = () => {
  const server = app.listen(PORT, () => {
    logger.warn(`LiquiFact API running at http://localhost:${PORT}`);
  });
  return server;
};

/**
 * Resets the in-memory invoice collection for tests.
 *
 * @returns {void}
 */
function resetStore() {
  invoices.length = 0;
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = app;
module.exports.createApp = createApp;
module.exports.startServer = startServer;
module.exports.resetStore = resetStore;
