const request = require('supertest');
const errorHandler = require('../../src/middleware/errorHandler');
const AppError = require('../../src/errors/AppError');
const createTestApp = require('../helpers/createTestApp');
const logger = require('../../src/logger');

describe('errorHandler Middleware Unit Tests', () => {
  let mockRequest;
  let mockResponse;
  let nextFunction;

  beforeEach(() => {
    mockRequest = {
      originalUrl: '/api/v1/test',
      id: 'cid-test',
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    nextFunction = jest.fn();
    jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logger.error.mockRestore();
  });

  test('should handle AppError and send standardized envelope', () => {
    const err = new AppError({
      type: 'https://liquifact.com/probs/bad-request',
      title: 'Bad Request',
      status: 400,
      detail: 'Invalid data',
    });

    errorHandler(err, mockRequest, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: {
        code: 'BAD_REQUEST',
        message: 'Invalid data',
        correlation_id: 'cid-test',
        retryable: false,
        retry_hint: '',
      },
    });
  });

  test('should handle generic Error and fallback to 500', () => {
    const err = new Error('Something exploded');

    errorHandler(err, mockRequest, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An internal server error occurred.',
        correlation_id: 'cid-test',
        retryable: false,
        retry_hint: 'Do not retry until the issue is resolved or support is contacted.',
      },
    });
  });
});

describe('errorHandler middleware (integration)', () => {
  it('should return 500 by default', async () => {
    const app = createTestApp((a) => {
      a.get('/error', () => {
        throw new Error('Boom');
      });
    });

    const res = await request(app).get('/error');

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.message).toBeDefined();
  });

  it('should return 500 for generic errors regardless of statusCode property', async () => {
    const app = createTestApp((a) => {
      a.get('/custom', () => {
        const err = new Error('Bad Request');
        err.statusCode = 400;
        throw err;
      });
    });

    const res = await request(app).get('/custom');

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBeDefined();
  });

  it('should use generic client message in production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const app = createTestApp((a) => {
      a.get('/prod-error', () => {
        throw new Error('Sensitive');
      });
    });

    const res = await request(app).get('/prod-error');

    expect(res.statusCode).toBe(500);
    expect(res.body.error.message).toBe('An internal server error occurred.');

    process.env.NODE_ENV = previous;
  });
});
