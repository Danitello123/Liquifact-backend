'use strict';

module.exports = {
  getInvoices: jest.fn().mockResolvedValue([]),
  getInvoiceById: jest.fn(),
  createInvoice: jest.fn(),
  updateInvoice: jest.fn(),
  deleteInvoice: jest.fn(),
};
