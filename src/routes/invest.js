'use strict';

/**
 * @fileoverview Investment opportunity routes for the Investor portal.
 * @module routes/invest
 */

const express = require('express');
const router = express.Router();
const investService = require('../services/investService');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../logger');

/**
 * @swagger
 * /api/invest/opportunities:
 *   get:
 *     summary: Get investment opportunities
 *     description: Retrieve a paginated list of investable opportunities
 *     tags: [Invest]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Investment opportunities retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Investment opportunity object
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/opportunities', authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const result = await investService.getOpportunities({ page, limit });

    logger.info({ 
      requestId: req.id, 
      count: result.data.length,
      total: result.meta.total 
    }, 'Retrieved investment opportunities');

    return res.json({
      ...result,
      message: 'Investment opportunities retrieved successfully.',
    });
  } catch (error) {
    // Standard error handling middleware will catch and format this
    next(error);
  }
});

module.exports = router;
