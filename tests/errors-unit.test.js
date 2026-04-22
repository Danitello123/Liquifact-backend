const AppError = require('../src/errors/AppError');
const { mapError, isBodyParserSyntaxError } = require('../src/errors/mapError');
const { logError } = require('../src/middleware/errorHandler');
const logger = require('../src/logger');

describe('mapError', () => {
  it('preserves AppError metadata', () => {
    const mapped = mapError(
      new AppError({
        type: 'https://liquifact.com/probs/conflict',
        title: 'Conflict',
        status: 409,
        detail: 'Conflict happened.',
        instance: '/api/invoices/1',
        code: 'CONFLICT',
        retryable: false,
        retryHint: 'Resolve the conflict and try again.',
      }),
    );

    expect(mapped).toEqual({
      status: 409,
      code: 'CONFLICT',
      message: 'Conflict happened.',
      retryable: false,
      retryHint: 'Resolve the conflict and try again.',
    });
  });

  it('recognizes body parser syntax errors', () => {
    const mapped = mapError({
      type: 'entity.parse.failed',
      status: 400,
    });

    expect(mapped.code).toBe('VALIDATION_ERROR');
    expect(isBodyParserSyntaxError({ type: 'entity.parse.failed', status: 400 })).toBe(true);
    expect(isBodyParserSyntaxError({})).toBe(false);
  });

  it('recognizes upstream connection failures', () => {
    const error = new Error('upstream refused');
    error.code = 'ECONNREFUSED';
    const mapped = mapError(error);

    expect(mapped.code).toBe('UPSTREAM_ERROR');
    expect(mapped.retryable).toBe(true);
  });

  it('sanitizes unknown errors', () => {
    const mapped = mapError(new Error('secret detail'));

    expect(mapped).toEqual({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An internal server error occurred.',
      retryable: false,
      retryHint: 'Do not retry until the issue is resolved or support is contacted.',
    });
  });
});

describe('logError', () => {
  it('handles non-error values safely', () => {
    jest.spyOn(logger, 'error').mockImplementation(() => {});

    try {
      logError('boom', 'req_test123');
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'req_test123' }),
        'Non-error value thrown'
      );
    } finally {
      logger.error.mockRestore();
    }
  });
});
