/**
 * Invoice Schema with KYC Status
 * 
 * Defines the invoice data model including KYC compliance fields
 * 
 * @module schemas/invoice
 */

/**
 * @typedef {Object} Invoice
 * @property {string} id - Unique invoice identifier (e.g., inv_1234567890)
 * @property {string} status - Invoice lifecycle status
 *   - pending_verification: Awaiting document validation
 *   - verified: Documents validated, ready for funding
 *   - funded: Capital deployed to escrow
 *   - settled: Loan repaid
 *   - defaulted: Loan defaulted
 * @property {number} amount - Invoice amount in local currency
 * @property {string} customer - Customer/debtor name
 * @property {string} ownerId - User who owns/created the invoice
 * @property {string} smeId - The SME (supplier) ID associated with invoice
 * @property {string} kycStatus - KYC verification status of SME
 *   - pending: KYC not yet initiated
 *   - verified: SME passed KYC verification
 *   - rejected: SME failed KYC verification
 *   - exempted: SME exempted from KYC requirements
 * @property {string} kycRecordId - Reference to KYC verification record
 * @property {string} kycStatusUpdatedAt - Last update timestamp for KYC status
 * @property {string} createdAt - Invoice creation timestamp
 * @property {string|null} deletedAt - Soft deletion timestamp
 */

const invoiceSchema = {
  id: {
    type: 'string',
    required: true,
    pattern: '^inv_[a-zA-Z0-9_-]+$',
    description: 'Unique invoice identifier',
  },
  status: {
    type: 'string',
    enum: ['pending_verification', 'verified', 'funded', 'settled', 'defaulted'],
    required: true,
    description: 'Invoice lifecycle status',
  },
  amount: {
    type: 'number',
    required: true,
    minimum: 0.01,
    description: 'Invoice amount',
  },
  customer: {
    type: 'string',
    required: true,
    minLength: 1,
    maxLength: 255,
    description: 'Customer/debtor name',
  },
  ownerId: {
    type: 'string',
    required: true,
    minLength: 1,
    maxLength: 128,
    description: 'User ID who owns the invoice',
  },
  smeId: {
    type: 'string',
    required: false,
    minLength: 1,
    maxLength: 128,
    description: 'SME identifier for KYC linkage',
  },
  kycStatus: {
    type: 'string',
    enum: ['pending', 'verified', 'rejected', 'exempted'],
    required: true,
    default: 'pending',
    description: 'KYC verification status of SME',
  },
  kycRecordId: {
    type: 'string',
    required: false,
    maxLength: 128,
    description: 'Reference to KYC record for audit trail',
  },
  kycStatusUpdatedAt: {
    type: 'string',
    format: 'date-time',
    required: false,
    description: 'Timestamp of last KYC status update',
  },
  createdAt: {
    type: 'string',
    format: 'date-time',
    required: true,
    description: 'Creation timestamp',
  },
  deletedAt: {
    type: 'string',
    format: 'date-time',
    required: false,
    nullable: true,
    description: 'Soft deletion timestamp',
  },
};

/**
 * Response DTO for invoice with full KYC context
 * @typedef {Object} InvoiceResponse
 */
const invoiceResponseSchema = {
  data: {
    type: 'object',
    properties: invoiceSchema,
    required: Object.keys(invoiceSchema).filter(k => invoiceSchema[k].required),
  },
  meta: {
    type: 'object',
    properties: {
      timestamp: { type: 'string', format: 'date-time' },
      version: { type: 'string' },
    },
  },
  error: {
    type: 'object',
    nullable: true,
  },
};

/**
 * Validates invoice data for creation
 * Ensures KYC fields are properly initialized
 * 
 * @param {Object} data - Invoice data to validate
 * @returns {Object} Validation result with errors if any
 */
function validateInvoiceCreation(data) {
  const errors = [];

  // Required fields
  if (!data.id) errors.push('id is required');
  if (!data.status) errors.push('status is required');
  if (data.amount === undefined || data.amount === null) {
    errors.push('amount is required');
  } else if (typeof data.amount !== 'number' || data.amount < 0.01) {
    errors.push('amount must be a positive number');
  }
  if (!data.customer) errors.push('customer is required');
  if (!data.ownerId) errors.push('ownerId is required');

  // Enum validation
  const validStatuses = ['pending_verification', 'verified', 'funded', 'settled', 'defaulted'];
  if (data.status && !validStatuses.includes(data.status)) {
    errors.push(`status must be one of: ${validStatuses.join(', ')}`);
  }

  // KYC fields validation (optional at creation, defaults to pending)
  const validKycStatuses = ['pending', 'verified', 'rejected', 'exempted'];
  if (data.kycStatus && !validKycStatuses.includes(data.kycStatus)) {
    errors.push(`kycStatus must be one of: ${validKycStatuses.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates invoice data for KYC status update
 * 
 * @param {Object} data - Update data
 * @returns {Object} Validation result
 */
function validateKycStatusUpdate(data) {
  const errors = [];

  if (!data.kycStatus) {
    errors.push('kycStatus is required');
  }

  const validKycStatuses = ['pending', 'verified', 'rejected', 'exempted'];
  if (data.kycStatus && !validKycStatuses.includes(data.kycStatus)) {
    errors.push(`kycStatus must be one of: ${validKycStatuses.join(', ')}`);
  }

  if (data.kycRecordId && typeof data.kycRecordId !== 'string') {
    errors.push('kycRecordId must be a string');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  invoiceSchema,
  invoiceResponseSchema,
  validateInvoiceCreation,
  validateKycStatusUpdate,
};
