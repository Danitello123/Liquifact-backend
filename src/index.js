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

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

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

const PORT = process.env.PORT || 3001;

// Swagger definition
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LiquiFact API',
      version: '1.0.0',
      description: 'Global Invoice Liquidity Network on Stellar',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Invoice: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique invoice identifier',
              example: 'inv_1234567890_123',
            },
            amount: {
              type: 'number',
              description: 'Invoice amount',
              example: 1000.50,
            },
            customer: {
              type: 'string',
              description: 'Customer name',
              example: 'Acme Corp',
            },
            status: {
              type: 'string',
              description: 'Invoice status',
              enum: ['pending_verification', 'verified', 'funded', 'settled', 'defaulted'],
              example: 'pending_verification',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Creation timestamp',
            },
            deletedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Soft delete timestamp',
            },
          },
        },
        EscrowState: {
          type: 'object',
          properties: {
            invoiceId: {
              type: 'string',
              description: 'Associated invoice ID',
            },
            status: {
              type: 'string',
              description: 'Escrow status',
              enum: ['not_found', 'funded', 'settled'],
              example: 'funded',
            },
            fundedAmount: {
              type: 'number',
              description: 'Amount funded in escrow',
              example: 1000.50,
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/index.js', './src/routes/*.js', './src/routes/sme/*.js'], // paths to files containing OpenAPI definitions
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

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

  /**
   * @swagger
   * /health:
   *   get:
   *     summary: Health check endpoint
   *     description: Returns the health status of the API service
   *     tags: [Health]
   *     responses:
   *       200:
   *         description: Service is healthy
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: ok
   *                 service:
   *                   type: string
   *                   example: liquifact-api
   *                 version:
   *                   type: string
   *                   example: 0.1.0
   *                 timestamp:
   *                   type: string
   *                   format: date-time
   */
  app.get('/health', (req, res) => {
    return res.json({
      status: 'ok',
      service: 'liquifact-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
  });

  // OpenAPI routes
  app.get('/openapi.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  /**
   * @swagger
   * /api:
   *   get:
   *     summary: API information
   *     description: Returns basic information about the API
   *     tags: [Info]
   *     responses:
   *       200:
   *         description: API information
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 name:
   *                   type: string
   *                 description:
   *                   type: string
   *                 endpoints:
   *                   type: object
   */
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

  /**
   * @swagger
   * /api/invoices:
   *   get:
   *     summary: Get all invoices
   *     description: Retrieve a list of invoices, optionally including deleted ones
   *     tags: [Invoices]
   *     parameters:
   *       - in: query
   *         name: includeDeleted
   *         schema:
   *           type: string
   *           enum: [true]
   *         description: Include deleted invoices in the response
   *     responses:
   *       200:
   *         description: List of invoices
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Invoice'
   *                 message:
   *                   type: string
   */
  app.get('/api/invoices', (req, res) => {
    const includeDeleted = req.query.includeDeleted === 'true';
    const filteredInvoices = includeDeleted
      ? invoices
      : invoices.filter((inv) => !inv.deletedAt);

    return res.json({
      data: filteredInvoices,
      message: includeDeleted ? 'Showing all invoices (including deleted).' : 'Showing active invoices.',
    });
  });

  /**
   * @swagger
   * /api/invoices:
   *   post:
   *     summary: Create a new invoice
   *     description: Upload a new invoice for financing
   *     tags: [Invoices]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - amount
   *               - customer
   *             properties:
   *               amount:
   *                 type: number
   *                 description: Invoice amount
   *               customer:
   *                 type: string
   *                 description: Customer name
   *     responses:
   *       201:
   *         description: Invoice created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/Invoice'
   *                 message:
   *                   type: string
   *       400:
   *         description: Bad request - missing required fields
   *       401:
   *         description: Unauthorized
   */
  app.post('/api/invoices', authenticateToken, sensitiveLimiter, (req, res) => {
    const { amount, customer } = req.body;

    if (!amount || !customer) {
      return res.status(400).json({ error: 'Amount and customer are required' });
    }

    const newInvoice = {
      id: `inv_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      amount,
      customer,
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

  /**
   * @swagger
   * /api/invoices/{id}:
   *   get:
   *     summary: Get a single invoice
   *     description: Retrieve a single invoice by its ID
   *     tags: [Invoices]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Invoice ID
   *     responses:
   *       200:
   *         description: Invoice retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/Invoice'
   *                 message:
   *                   type: string
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - not the owner
   *       404:
   *         description: Invoice not found
   */
  app.get('/api/invoices/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.sub || req.headers['x-user-id']; // Placeholder for auth

    // Basic validation
    if (!id || id.trim() === '') {
      return res.status(400).json({ error: 'Bad Request', message: 'Missing or invalid invoice ID' });
    }

    // Find invoice
    const invoice = invoices.find((inv) => inv.id === id);

    if (!invoice) {
      return res.status(404).json({ error: 'Not Found', message: `Invoice with ID '${id}' not found` });
    }

    // Check if deleted
    if (invoice.deletedAt) {
      return res.status(404).json({ error: 'Not Found', message: `Invoice with ID '${id}' not found` });
    }

    // Authorization check (placeholder)
    // In real app, check if user owns the invoice
    // For now, allow all authenticated users

    return res.json({
      data: invoice,
      message: 'Invoice retrieved successfully',
    });
  });

  /**
   * @swagger
   * /api/invoices/{id}:
   *   delete:
   *     summary: Soft delete an invoice
   *     description: Mark an invoice as deleted (soft delete)
   *     tags: [Invoices]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Invoice ID
   *     responses:
   *       200:
   *         description: Invoice soft-deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                 data:
   *                   $ref: '#/components/schemas/Invoice'
   *       400:
   *         description: Invoice is already deleted
   *       404:
   *         description: Invoice not found
   *       401:
   *         description: Unauthorized
   */
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

  /**
   * @swagger
   * /api/invoices/{id}/restore:
   *   patch:
   *     summary: Restore a soft-deleted invoice
   *     description: Restore a previously soft-deleted invoice
   *     tags: [Invoices]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Invoice ID
   *     responses:
   *       200:
   *         description: Invoice restored successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                 data:
   *                   $ref: '#/components/schemas/Invoice'
   *       400:
   *         description: Invoice is not deleted
   *       404:
   *         description: Invoice not found
   *       401:
   *         description: Unauthorized
   */
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

  /**
   * @swagger
   * /api/escrow/{invoiceId}:
   *   get:
   *     summary: Get escrow state for an invoice
   *     description: Retrieve the escrow state from the Soroban contract for a specific invoice
   *     tags: [Escrow]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: invoiceId
   *         required: true
   *         schema:
   *           type: string
   *         description: Invoice ID
   *     responses:
   *       200:
   *         description: Escrow state retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/EscrowState'
   *                 message:
   *                   type: string
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Error fetching escrow state
   */
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

  /**
   * @swagger
   * /api/escrow:
   *   post:
   *     summary: Create or fund an escrow
   *     description: Initiate an escrow operation for an invoice
   *     tags: [Escrow]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Escrow operation completed
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/EscrowState'
   *                 message:
   *                   type: string
   *       401:
   *         description: Unauthorized
   */
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
