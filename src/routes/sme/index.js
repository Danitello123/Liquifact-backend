/**
 * SME Routes Index
 */

'use strict';

const express = require('express');
const router = express.Router();
const metricsRoutes = require('./metrics');

router.use('/', metricsRoutes);

module.exports = router;
