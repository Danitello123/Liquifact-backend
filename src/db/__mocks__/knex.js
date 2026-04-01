'use strict';

// Mock Knex instance for tests — avoids the need for the actual knex package.
const mockQuery = {
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  select: jest.fn().mockResolvedValue([]),
  insert: jest.fn().mockResolvedValue([1]),
  update: jest.fn().mockResolvedValue(1),
  delete: jest.fn().mockResolvedValue(1),
  first: jest.fn().mockResolvedValue(null),
};

const db = jest.fn(() => mockQuery);
db.raw = jest.fn();

module.exports = db;
