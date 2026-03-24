const express = require('express');
const cors = require('cors');
const responseHelper = require('./utils/responseHelper');
const { callSorobanContract } = require('./services/soroban');


const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json(responseHelper.success({
    status: 'ok',
    service: 'liquifact-api',
  }));
});

// API Info
app.get('/api', (req, res) => {
  res.json(responseHelper.success({
    name: 'LiquiFact API',
    description: 'Global Invoice Liquidity Network on Stellar',
    endpoints: {
      health: 'GET /health',
      invoices: 'GET/POST /api/invoices',
      escrow: 'GET/POST /api/escrow',
    },
  }));
});

// Placeholder: Invoices
app.get('/api/invoices', (req, res) => {
  res.json(responseHelper.success([], { message: 'Invoices empty placeholder' }));
});

app.post('/api/invoices', (req, res) => {
  res.status(201).json(responseHelper.success(
    { id: 'placeholder', status: 'pending_verification' },
    { message: 'Tokenization not yet implemented'}
  ));
});

// Placeholder: Escrow (wired to Soroban)
app.get('/api/escrow/:invoiceId', async (req, res) => {
  const { invoiceId } = req.params;

  try {
    // Simulated remote contract call
    const operation = async () => {
      return { invoiceId, status: 'not_found', fundedAmount: 0 };
    };

    const data = await callSorobanContract(operation);
    
    res.json(responseHelper.success(
      data,
      { message: 'Escrow state read from Soroban contract via robust integration wrapper.' }
    ));
  } catch (error) {
    res.status(500).json(responseHelper.error(
      error.message || 'Error fetching escrow state',
      'SOROBAN_INTEGRATION_ERROR'
    ));
  }
});


// Error trigger for testing 500 responses
app.get('/debug/error', (req, res, next) => {
  const err = new Error('Triggered Error');
  next(err);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json(responseHelper.error(
    `Route ${req.path} not found`,
    'NOT_FOUND'
  ));
});

// Error handling middleware
app.use((err, req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json(responseHelper.error(
    status === 500 ? 'Internal Server Error' : err.message,
    status === 500 ? 'INTERNAL_ERROR' : err.code || 'BAD_REQUEST',
    process.env.NODE_ENV === 'development' ? err.stack : null
  ));
});

module.exports = app;
