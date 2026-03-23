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

3. **Configure environment** (optional for local dev)

   ```bash
   cp .env.example .env
   # Edit .env if you need Stellar/Horizon/DB settings
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

## Project structure

```
liquifact-backend/
├── src/
│   └── index.js    # Express app, routes (health, invoices, escrow)
├── .env.example   # Env template (PORT, Stellar, DB placeholders)
├── eslint.config.js
└── package.json
```

---

## CI/CD

GitHub Actions runs on every push and pull request to `main`:

- **Lint** — `npm run lint`
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
