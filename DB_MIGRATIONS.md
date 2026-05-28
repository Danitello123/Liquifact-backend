# Database Migrations

## Overview

This project uses **Knex.js** for database migrations. Knex is a flexible query builder and migration tool that supports multiple database engines (SQLite, PostgreSQL, MySQL, etc.), providing a unified interface for managing schema changes.

### Why Knex?

- **Multi-database support**: Works with SQLite (development/test) and PostgreSQL (production) seamlessly
- **Programmatic control**: Migrations are written in JavaScript for better maintainability and error handling
- **Idempotent migrations**: Each migration can be safely run multiple times
- **Rollback support**: Full rollback capability for tested deployments
- **Transaction safety**: Migrations run in transactions where supported

## Quick Start

```bash
# Start database container
docker-compose -f docker-compose.dev.yml up -d

# Run all pending migrations
npm run db:migrate

# (Optional) Seed the database
npm run db:seed
```

## Migration Commands

All migration commands use Knex as the standard runner:

| Command | Description |
|---------|-------------|
| `npm run db:migrate` | Run all pending migrations to latest (Knex: `migrate:latest`) |
| `npm run db:migrate:down` | Rollback the last migration batch |
| `npm run db:migrate:reset` | Rollback all migrations and restart from beginning |
| `npm run db:migrate:create <name>` | Create a new migration file (Knex: `migrate:make`) |
| `npm run db:setup` | Alias for `db:migrate` (useful for initial setup) |
| `npm run db:seed` | Run all seeder files |

## Migration Files

Migrations are located in the `migrations/` directory with the following naming convention:

```
<timestamp>_<description>.js
```

Example: `20240425000001_create_users_and_tenants.js`

### Migration Structure

Each migration file exports `up` and `down` functions:

```javascript
exports.up = function(knex) {
  // Create tables, indexes, triggers
  return knex.schema.createTable('table_name', (table) => {
    // table definitions
  });
};

exports.down = function(knex) {
  // Reverse the up migration
  return knex.schema.dropTable('table_name');
};
```

### Database-Specific Code

For PostgreSQL-specific features (triggers, custom functions, RLS), use `knex.raw()`:

```javascript
exports.up = function(knex) {
  const isPostgres = knex.client.config.client === 'pg';
  
  return knex.schema.createTable('table', (table) => {
    // schema
  })
  .then(() => {
    if (isPostgres) {
      return knex.raw('CREATE TRIGGER ...');
    }
  });
};
```

## Database Schema

### Core Tables

- **invoices** - Invoice records with multi-tenant support
  - `id` (UUID, primary key)
  - `invoice_number` (string, unique)
  - `amount`, `currency`, `status`
  - `sme_id`, `buyer_id` (foreign keys)
  - `tenant_id` (for multi-tenant isolation)
  - `metadata` (JSON for flexible storage)
  - Timestamps: `created_at`, `updated_at`, `deleted_at` (soft delete)

- **tenants** - Multi-tenant support
  - `id`, `name`, `slug`, `domain`, `status`, `settings` (JSON)

- **users** - User accounts
  - `id`, `tenant_id`, `email`, `password_hash`, `role`, `is_active`

- **api_keys** - API authentication
  - `id`, `tenant_id`, `key_hash`, `scopes`, `is_active`, `expires_at`

- **escrow_operations** - Escrow transaction tracking
  - `id`, `invoice_id`, `tenant_id`, `operation_type`, `status`
  - `stellar_transaction_hash`, `contract_id`, `amount`
  - Audit fields: `initiated_by`, `initiated_at`, `completed_at`

- **audit_log_events** - Append-only audit trail
  - Immutable event ledger for compliance and troubleshooting
  - Enforced at DB layer with triggers (PostgreSQL)

- **legal_holds** & **retention_policies** - Compliance & data retention
  - Legal hold management and retention scheduling
  - Audit logging for all retention operations

- **escrow_events** - Off-chain event projection
  - Stellar blockchain event indexing and caching

## Environment Configuration

Migrations use the `knexfile.js` configuration:

```javascript
// knexfile.js
module.exports = {
  development: {
    client: 'sqlite3',
    connection: { filename: './db.sqlite3' },
    useNullAsDefault: true,
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
  }
}
```

**Environment variable**: `NODE_ENV=production` uses PostgreSQL via `DATABASE_URL`

## Running Migrations

### Development

```bash
NODE_ENV=development npm run db:migrate
```

SQLite database created at `./db.sqlite3`

### Production

```bash
NODE_ENV=production npm run db:migrate
```

Requires `DATABASE_URL` environment variable in format:
```
postgresql://user:password@host:port/database_name
```

## Testing Migrations

To test migrations against a clean database:

```bash
NODE_ENV=test npm run db:migrate
npm test -- tests/integration/migrations.test.js
```

The test environment uses an in-memory SQLite database for speed.

## Rollback & Recovery

### Rollback Last Migration Batch

```bash
npm run db:migrate:down
```

### Rollback All Migrations

```bash
npm run db:migrate:reset
```

⚠️ **WARNING**: Never run `db:migrate:reset` in production.

### Force-Migrate Specific File

To run a specific migration without affecting migration history:

```bash
NODE_ENV=production knex migrate:up --specific 20240425000001_create_users_and_tenants.js
```

## Production Deployment

1. **Verify DATABASE_URL**: Ensure the connection string is correct
   ```bash
   echo $DATABASE_URL
   ```

2. **Backup database** (recommended):
   ```bash
   pg_dump $DATABASE_URL > backup.sql
   ```

3. **Run migrations**:
   ```bash
   NODE_ENV=production npm run db:migrate
   ```

4. **Validate schema**:
   ```bash
   npm test -- tests/integration/migrations.test.js
   ```

5. **Start application**:
   ```bash
   npm start
   ```

### Key Points

- Migrations are transactional — a failed migration rolls back automatically (PostgreSQL)
- All pending migrations run atomically
- Never run rollback commands in production
- Test all migrations in a staging environment first
- Keep `DATABASE_URL` secrets in environment variables (never in code)

## Troubleshooting

### Migration Fails with "Duplicate Migration"

Each migration file must have a unique timestamp. Check that no two files have the same timestamp prefix.

```bash
# Find duplicate timestamps
ls -1 migrations/ | sed 's/_.*//g' | sort | uniq -d
```

### "Database is locked" Error (SQLite)

SQLite doesn't support concurrent connections well. For development:

1. Close any other processes accessing `db.sqlite3`
2. Remove the database and restart: `rm db.sqlite3 && npm run db:migrate`

### Migration Hangs or Times Out

Check database connectivity:

```bash
# Test PostgreSQL connection
psql $DATABASE_URL -c "SELECT NOW()"

# Test SQLite
sqlite3 db.sqlite3 ".tables"
```

### Rollback Failed in Production

If a rollback fails:

1. Restore from backup
2. Investigate the migration code
3. Fix and deploy a new migration to resolve the issue

### Migration State Out of Sync

If migrations are stuck or state is corrupted:

```sql
-- PostgreSQL: Check migration state
SELECT * FROM knex_migrations ORDER BY id DESC LIMIT 5;

-- Reset migration state (DANGEROUS - do this only in dev!)
DELETE FROM knex_migrations WHERE name = '20240425000001_create_users_and_tenants.js';
```

## Deprecated Tools

**Note**: Previous migration tools have been deprecated in favor of Knex:

- ❌ `node-pg-migrate` - No longer used
- ❌ `migrator-config.js` - Can be removed
- ✅ `knexfile.js` - Standard configuration

If you see references to these, they should be removed or replaced with Knex commands.
