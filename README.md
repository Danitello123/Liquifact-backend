# LiquiFact Backend

API gateway and server for **LiquiFact** — the global invoice liquidity network on Stellar. This repo provides the Express-based REST API for invoice uploads, escrow state, and (future) Stellar/Horizon integration.

Part of the LiquiFact stack: **frontend** (Next.js) | **backend** (this repo) | **contracts** (Soroban).

---

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** 9+

---

## Setup

1. **Clone the repo**

   ```bash
   git clone <this-repo-url>
   cd liquifact-backend
   ```

2. **Install dependencies**

   ```bash
   npm ci
   ```

3. **Configure environment**

   ```bash
   cp .env.example .env
   # Edit .env for CORS, Stellar/Horizon, or future DB settings
   ```

---

## Development

| Command               | Description                             |
|-----------------------|-----------------------------------------|
| `npm run dev`         | Start API with watch mode               |
| `npm run start`       | Start API (production-style)           |
| `npm run lint`        | Run ESLint on `src/`                   |
| `npm run lint:fix`    | Auto-fix linting issues                |
| `npm test`            | Run unit tests (Vitest)                |
| `npm run test:coverage`| Run tests with coverage report         |

Default port: **3001**. After starting:

- Health: [http://localhost:3001/health](http://localhost:3001/health)
- API info: [http://localhost:3001/api](http://localhost:3001/api)
- Invoices: [http://localhost:3001/api/invoices](http://localhost:3001/api/invoices)
  - `GET /api/invoices` - List active invoices
  - `GET /api/invoices?includeDeleted=true` - List all invoices
  - `POST /api/invoices` - Create invoice
  - `DELETE /api/invoices/:id` - Soft delete invoice
  - `PATCH /api/invoices/:id/restore` - Restore deleted invoice

---

## Code Quality & Testing

### ESLint Rule Hardening
We enforce strict linting rules using `eslint:recommended` and `eslint-plugin-security`. All code must include JSDoc comments for better maintainability.

- **Local Workflow**: Before committing, run `npm run lint:fix` to automatically address style issues.
- **CI Enforcement**: The CI pipeline will fail if linting errors are present or if test coverage falls below **95%**.

### Testing
We use **Vitest** and **Supertest** for testing.
- Run tests: `npm test`
- Check coverage: `npm run test:coverage`

Current coverage targets: **>95% Lines and Statements**.

---

## Authentication

Protected endpoints (such as invoice mutations and escrow operations) require a JSON Web Token (JWT) in the `Authorization` header:

```http
Authorization: Bearer <jwt_token_here>
```

The middleware authenticates the token against the `JWT_SECRET` environment variable (defaults to `test-secret` for local development). Unauthenticated requests will be rejected with a `401 Unauthorized` status.

---

## Audit Logging

The LiquiFact API maintains **immutable audit logs** for all invoice mutations (CREATE, UPDATE, DELETE operations). This provides complete traceability of who changed what, when, and to what state.

### Overview

The audit logging system consists of three key components:

1. **Audit Service** (`src/services/auditLog.js`) — Manages immutable audit records
2. **Audit Middleware** (`src/middleware/audit.js`) — Automatically captures mutations
3. **Audit Storage** — In-memory store (swappable with database in production)

### Features

- **Immutable Records**: Once created, audit entries cannot be modified (Object.freeze)
- **Actor Tracking**: Records the user ID (from JWT) or IP address of the requester
- **Change Tracking**: Captures before/after states and highlights only changed fields
- **Sensitive Data Protection**: Automatically redacts passwords, tokens, API keys
- **Comprehensive Metadata**: Captures timestamp, HTTP method, status code, user agent, IP address
- **Query & Export**: Filter audit logs by resource, actor, action, or date; export as JSON or CSV

### Automatic Mutation Tracking

The audit middleware automatically tracks all successful mutations to `/api/*` endpoints:

| Method | Action | Condition |
|--------|--------|-----------|
| `POST` | CREATE | Status 2xx |
| `PUT` | UPDATE | Status 2xx |
| `PATCH` | UPDATE | Status 2xx |
| `DELETE` | DELETE | Status 2xx |
| `GET` / `HEAD` / `OPTIONS` | (not audited) | Read-only operations |

**Note**: Only successful operations (HTTP 2xx) are recorded. Failed operations (4xx, 5xx) are not logged to prevent noise from client errors or transient failures.

### Querying Audit Logs

The audit service provides methods to query and export logs:

```javascript
const { 
  getAuditLogs, 
  getInvoiceAuditTrail, 
  exportAuditLogs 
} = require('./services/auditLog');

// Get all audit logs for an invoice
const trail = getInvoiceAuditTrail('inv-12345');

// Filter logs by multiple criteria
const logs = getAuditLogs({
  resourceId: 'inv-12345',
  actor: 'user-123',
  action: 'UPDATE',
  limit: 50
});

// Export logs as JSON or CSV
const json = exportAuditLogs({ format: 'json', limit: 1000 });
const csv = exportAuditLogs({ format: 'csv' });
```

### Audit Log Entry Structure

Each audit log entry contains:

```json
{
  "id": "AUDIT-1706234567890-abc123def",
  "timestamp": "2024-01-26T12:34:27.890Z",
  "actor": "user-123",
  "action": "UPDATE",
  "resourceType": "invoice",
  "resourceId": "inv-12345",
  "statusCode": 200,
  "ipAddress": "203.0.113.42",
  "userAgent": "Mozilla/5.0",
  "changes": {
    "before": { "status": "draft", "amount": 5000 },
    "after": { "status": "submitted", "amount": 5000 }
  },
  "metadata": {
    "method": "PATCH",
    "path": "/api/invoices/inv-12345"
  }
}
```

### Security Considerations

1. **Sensitive Data Redaction**: Fields containing `password`, `token`, `secret`, `key`, or `apiKey` are automatically masked as `***REDACTED***` in audit logs.

2. **Immutability**: Audit entries are frozen using `Object.freeze()` to prevent tampering. Attempting to modify an audit entry will throw an error.

3. **Actor Attribution**: Authenticated users are tracked by their JWT subject/ID. Unauthenticated requests fall back to IP address tracking.

4. **Production Safety**: The `clearAuditLogs()` function is blocked in production to prevent accidental deletion of audit trails.

### Testing

Audit logging is comprehensively tested with >95% coverage:

- **Unit Tests** (`src/services/auditLog.test.js`): 100+ test cases covering all service functions
- **Integration Tests** (`src/middleware/audit.test.js`): 50+ test cases for middleware behavior
- **Edge Cases**: Large payloads, concurrent requests, special characters, error handling

Run tests with:
```bash
npm test -- auditLog.test.js
npm test -- audit.test.js
npm run test:coverage
```

### Example: Invoice Mutation Trail

When a user creates and then updates an invoice, the audit trail captures:

```javascript
// 1. POST /api/invoices - CREATE action
{
  actor: 'user-123',
  action: 'CREATE',
  statusCode: 201,
  changes: {
    before: { amount: 5000, status: 'draft' },
    after: { id: 'inv-12345', amount: 5000, status: 'submitted' }
  }
}

// 2. PATCH /api/invoices/inv-12345 - UPDATE action
{
  actor: 'user-123',
  action: 'UPDATE',
  statusCode: 200,
  changes: {
    before: { status: 'submitted', approver: null },
    after: { status: 'approved', approver: 'approver-456' }
  }
}

// 3. Query the complete trail
const trail = getInvoiceAuditTrail('inv-12345');
// Returns array with both entries in reverse chronological order
```

---

## Rate Limiting

The API implements request throttling to prevent abuse:

- **Global Limit**: 100 requests per 15 minutes per IP or User ID.
- **Sensitive Operations**: (Invoice uploads, Escrow writes) 10 requests per hour per IP.

Clients exceeding these limits will receive a `429 Too Many Requests` response. Check the standard `RateLimit-*` headers for your current quota and reset time.

---

## Configuration

### CORS Allowlist

The API enforces an environment-driven CORS allowlist for browser-originated requests.

- `CORS_ALLOWED_ORIGINS`: Comma-separated list of trusted frontend origins.
- Example:
  `CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com`

Behavior:
- Requests without an `Origin` header are allowed, as it can be curl, postman, etc. 
- Requests from allowed origins receive normal CORS headers.
- Requests from disallowed origins are rejected with `403 Forbidden`.
- Origin matching is exact only. Wildcards and regex patterns are not supported.

Development default:
- If `NODE_ENV=development` and `CORS_ALLOWED_ORIGINS` is not set, common local development origins are allowed by default.

Production default:
- If `CORS_ALLOWED_ORIGINS` is not set outside development, browser origins are denied by default.

---

## Project structure

```
liquifact-backend/
├── src/
│   ├── config/
│   │   └── cors.js          # CORS allowlist parsing and policy
│   ├── middleware/
│   │   ├── auth.js          # JWT authentication middleware
│   │   ├── audit.js         # Immutable audit logging for mutations
│   │   ├── deprecation.js   # API deprecation notices
│   │   ├── errorHandler.js  # Centralized error handling
│   │   └── rateLimit.js     # Rate limiting enforcement
│   ├── services/
│   │   ├── soroban.js       # Contract interaction wrappers
│   │   └── auditLog.js      # Audit log storage and queries
│   ├── utils/
│   │   ├── asyncHandler.js  # Express async error wrapper
│   │   └── retry.js         # Exponential backoff utility
│   ├── app.js               # Express app, middleware, routes
│   └── index.js             # Runtime bootstrap
├── tests/
│   ├── setup.js             # Test configuration
│   ├── helpers/
│   │   └── createTestApp.js # Test app factory
│   ├── unit/
│   │   ├── asyncHandler.test.js
│   │   └── errorHandler.test.js
│   └── app.test.js
├── .env.example             # Env template
├── eslint.config.js
└── package.json
```

---

## Resiliency & Retries

To ensure reliable communication with Soroban contract provider APIs, this backend implements a robust **Retry and Backoff** mechanism (`src/utils/retry.js`). 

### Key Features
- **Exponential Backoff (`withRetry`)**: Automatically retries transient errors (e.g., HTTP 429, 502, 503, 504, network timeouts).
- **Jitter**: Adds ±20% randomness to the delay to prevent thundering herd problems.
- **Security Caps**:
  - `maxRetries` is hard-capped at 10 to prevent unbounded retry loops.
  - `maxDelay` is hard-capped to 60,000ms (1 minute).
  - `baseDelay` is hard-capped to 10,000ms.
- **Contract Integration**: `src/services/soroban.js` wraps raw API calls securely with this utility, ensuring all escrow and invoice state interactions are fault-tolerant.

---

## CI/CD

GitHub Actions runs on every push and pull request to `main`:

- **Lint** — `npm run lint`
- **Tests** — `npm test`
- **Build check** — `node --check src/index.js` (syntax)

Ensure your branch passes these before opening a PR.

---

## Contributing

1. **Fork** the repo and clone your fork.
2. **Create a branch** from `main`: `git checkout -b feature/your-feature` or `fix/your-fix`.
3. **Setup locally**: `npm ci`, optionally `cp .env.example .env`.
4. **Make changes**. Keep the style consistent:
   - Run `npm run lint` and fix any issues.
   - Use the existing Express/route patterns in `src/index.js`.
5. **Commit** with clear messages (e.g. `feat: add X`, `fix: Y`).
6. **Push** to your fork and open a **Pull Request** to `main`.
7. Wait for CI to pass and address any review feedback.

We welcome docs improvements, bug fixes, and new API endpoints aligned with the LiquiFact product (invoices, escrow, Stellar integration).

---

## License

MIT (see root LiquiFact project for full license).
