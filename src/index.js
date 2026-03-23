/**
 * LiquiFact API Gateway
 * Express server for invoice financing, auth, and Stellar integration.
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

/**
 * Health check endpoint.
 * Returns the current status and version of the service.
 * 
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {void}
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'liquifact-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

/**
 * API information endpoint.
 * Lists available endpoints and service description.
 * 
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {void}
 */
app.get('/api', (req, res) => {
  res.json({
    name: 'LiquiFact API',
    description: 'Global Invoice Liquidity Network on Stellar',
    endpoints: {
      health: 'GET /health',
      invoices: 'GET/POST /api/invoices',
      escrow: 'GET/POST /api/escrow',
    },
  });
});

/**
 * Lists tokenized invoices.
 * Placeholder for future database integration.
 * 
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {void}
 */
app.get('/api/invoices', (req, res) => {
  res.json({
    data: [],
    message: 'Invoice service will list tokenized invoices here.',
  });
});

/**
 * Uploads and tokenizes a new invoice.
 * Placeholder for future verification and Stellar integration.
 * 
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {void}
 */
app.post('/api/invoices', (req, res) => {
  res.status(201).json({
    data: { id: 'placeholder', status: 'pending_verification' },
    message: 'Invoice upload will be implemented with verification and tokenization.',
  });
});

/**
 * Retrieves escrow state for a specific invoice.
 * Placeholder for future Soroban contract integration.
 * 
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {void}
 */
app.get('/api/escrow/:invoiceId', (req, res) => {
  const { invoiceId } = req.params;
  res.json({
    data: { invoiceId, status: 'not_found', fundedAmount: 0 },
    message: 'Escrow state will be read from Soroban contract.',
  });
});

/**
 * 404 handler for unknown routes.
 * 
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {void}
 */
app.use((req, res, next) => {
  if (req.path === '/error-test-trigger') {
    return next(new Error('Test error'));
  }
  res.status(404).json({ error: 'Not found', path: req.path });
});

/**
 * Global error handler.
 * Logs the error and returns a 500 status.
 * 
 * @param {Error} err - The error object.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} _next - The next middleware function.
 * @returns {void}
 */
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

/**
 * Starts the Express server.
 * 
 * @returns {import('http').Server} The started server.
 */
const startServer = () => {
  const server = app.listen(PORT, () => {
    console.log(`LiquiFact API running at http://localhost:${PORT}`);
  });
  return server;
};

// Export app for testing
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = { app, startServer };
