/**
 * @fileoverview SME Dashboard Metrics endpoint.
 * Provides aggregated invoice counts for the authenticated user.
 */

'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const { mockInvoices } = require('../../services/invoiceService');

/**
 * Categorizes a raw invoice status into dashboard metrics categories.
 * 
 * Mapping follows LiquifactEscrow contract invariants:
 * - Open: Invoices awaiting or having passed verification but not yet funded.
 * - Funded: Invoices with an active on-chain escrow.
 * - Settled: Invoices that have been fully paid or settled.
 * - Defaulted: Invoices that failed to meet payment terms.
 * 
 * @param {string} status - Raw invoice status from the database.
 * @returns {string|null} Dashboard category or null if it should be excluded (e.g., 'withdrawn').
 */
function mapStatusToCategory(status) {
  const OPEN_STATUSES = ['pending_verification', 'verified'];
  const FUNDED_STATUSES = ['funded'];
  const SETTLED_STATUSES = ['settled', 'paid'];
  const DEFAULTED_STATUSES = ['defaulted'];

  if (OPEN_STATUSES.includes(status)) return 'open';
  if (FUNDED_STATUSES.includes(status)) return 'funded';
  if (SETTLED_STATUSES.includes(status)) return 'settled';
  if (DEFAULTED_STATUSES.includes(status)) return 'defaulted';
  
  return null; // Exclude 'withdrawn' and others
}

/**
 * @swagger
 * /api/sme/metrics:
 *   get:
 *     summary: Get SME dashboard metrics
 *     description: Returns aggregated invoice metrics for the authenticated SME user
 *     tags: [SME]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     open:
 *                       type: integer
 *                       description: Number of open invoices
 *                     funded:
 *                       type: integer
 *                       description: Number of funded invoices
 *                     settled:
 *                       type: integer
 *                       description: Number of settled invoices
 *                     defaulted:
 *                       type: integer
 *                       description: Number of defaulted invoices
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 */
router.get('/metrics', authenticateToken, (req, res) => {
  const userId = req.user.id || req.user.sub;
  
  const userInvoices = mockInvoices.filter(inv => inv.ownerId === userId);
  
  const metrics = {
    open: 0,
    funded: 0,
    settled: 0,
    defaulted: 0
  };

  userInvoices.forEach(inv => {
    const category = mapStatusToCategory(inv.status);
    if (category) {
      metrics[category]++;
    }
  });

  return res.json({
    data: metrics,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
