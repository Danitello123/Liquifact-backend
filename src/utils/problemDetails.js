/**
 * RFC 7807 (Problem Details for HTTP APIs) Formatter.
 * Takes error data and formats it into a standard JSON object.
 *
 * @param {Object} params - Formatting inputs.
 * @param {string} [params.type='about:blank'] - Problem type URI.
 * @param {string} [params.title='An unexpected error occurred'] - Short problem summary.
 * @param {number} [params.status=500] - HTTP status code.
 * @param {string} [params.detail] - Human-readable occurrence detail.
 * @param {string} [params.instance] - URI identifying this specific problem instance.
 * @param {string} [params.stack] - Error stack trace for non-production responses.
 * @param {boolean} [params.isProduction] - Whether to omit stack traces.
 * @returns {Object} RFC7807-compliant problem payload.
 */
function formatProblemDetails({
  type = 'about:blank',
  title = 'An unexpected error occurred',
  status = 500,
  detail,
  instance,
  stack,
  isProduction = process.env.NODE_ENV === 'production',
}) {
  const problem = {
    type,
    title,
    status,
    detail,
    instance,
  };

  // Only include stack trace if NOT in production for security reasons
  if (!isProduction && stack) {
    problem.stack = stack;
  }

  return problem;
}

module.exports = formatProblemDetails;
