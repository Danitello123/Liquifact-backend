# TypeScript migration plan (incremental, no big-bang)

Goal: allow adding `.ts` files inside `src/` gradually, without forcing an immediate rewrite of existing `.js`.

This repo stays **CommonJS** (`"type": "commonjs"`), so the plan avoids ESM-only approaches.

## What’s in place

- `tsconfig.json`: strict TypeScript settings, but **no** JS checking by default (`checkJs: false`).
- `tsconfig.build.json`: build config that emits compiled JS into `dist/`.
- `tsconfig.checkjs.json`: optional JSDoc/JS checking mode (expect follow-up work to resolve warnings).
- `src/ts-entry.ts`: a TypeScript entrypoint that bootstraps the existing `src/index.js`.

## How to use it

### Development (default JS runtime)

Keep using:

```bash
npm run dev
```

### Development with TypeScript runtime (optional)

Run the TypeScript entrypoint via `ts-node`:

```bash
npm run dev:ts
```

This is the recommended path for introducing new `.ts` modules incrementally:
- Start with leaf modules (utils/services) in `.ts`.
- Import them from `.ts` code paths first.
- Keep existing `.js` untouched until you’re ready.

### Type checking (safe default)

```bash
npm run typecheck
```

### JSDoc strict-mode first (optional, follow-up work expected)

```bash
npm run typecheck:jsdoc
```

This enables `checkJs` for `src/**/*.js`. It will likely surface issues that should be addressed module-by-module.

### Build to `dist/` (for production-style execution)

```bash
npm run build
npm run start:dist
```

## Suggested migration phases

1. **Phase 0 (now):** keep runtime on JS; add TypeScript toolchain + docs; begin adding isolated `.ts` modules.
2. **Phase 1:** convert new/changed modules to `.ts` first; keep boundaries stable; keep tests green.
3. **Phase 2:** switch default `start`/`dev` to `dist/` (or TS runtime) once most of `src/` is TypeScript.
4. **Phase 3:** (optional) add `@typescript-eslint/*` and lint `.ts` files once TS usage is established.

