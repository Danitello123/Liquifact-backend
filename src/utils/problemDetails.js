/**
 * RFC 7807 (Problem Details for HTTP APIs) Formatter.
 * Takes error data and formats it into a standard JSON object.
 *
 * @param {object} params - Problem details input.
 * @param {string} [params.type='about:blank'] - A URI reference that identifies the problem type.
 * @param {string} [params.title='An unexpected error occurred'] - Short, human-readable summary.
 * @param {number} [params.status=500] - HTTP status code.
 * @param {string} [params.detail] - Human-readable explanation specific to this occurrence.
 * @param {string} [params.instance] - A URI reference that identifies the specific occurrence.
 * @param {string} [params.stack] - Optional stack trace (only included when not production).
 * @param {boolean} [params.isProduction=process.env.NODE_ENV === 'production'] - Whether to omit stack traces.
 * @returns {object} RFC7807 problem details object.
 */
function formatProblemDetails(params) {
  const {
  type = 'about:blank',
  title = 'An unexpected error occurred',
  status = 500,
  detail,
  instance,
  stack,
  isProduction = process.env.NODE_ENV === 'production',
  } = params;

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
