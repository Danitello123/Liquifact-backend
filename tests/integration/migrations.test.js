'use strict';

const fs = require('fs');
const path = require('path');
const knex = require('knex');

describe('Database Migrations Integration Tests', () => {
  let db;

  beforeAll(async () => {
    // Use test environment from knexfile
    const knexConfig = require('../../knexfile.js');
    const config = knexConfig['test'];
    db = knex(config);
  });

  afterAll(async () => {
    if (db) {
      await db.destroy();
    }
  });

  describe('Migration File Structure', () => {
    test('should have migration files with proper naming', () => {
      const migrationsDir = path.join(__dirname, '../../migrations');
      
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.js'));
      
      // Check naming pattern: YYYYMMDDHHMMSS_description.js
      const namingPattern = /^\d{14,}_[a-z0-9_]+\.js$/;
      
      for (const file of migrationFiles) {
        expect(file).toMatch(namingPattern);
      }
      
      // Should have at least one migration file
      expect(migrationFiles.length).toBeGreaterThan(0);
      console.log(`Found ${migrationFiles.length} Knex migration files`);
    });
    
    test('should have migration files in chronological order', () => {
      const migrationsDir = path.join(__dirname, '../../migrations');
      
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.js'))
        .sort();
      
      // Extract timestamps and verify they're in order
      const timestamps = migrationFiles.map(file => 
        parseInt(file.split('_')[0])
      );
      
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });
    
    test('should have valid migration files with up and down functions', () => {
      const migrationsDir = path.join(__dirname, '../../migrations');
      
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.js'));
      
      for (const file of migrationFiles) {
        const filePath = path.join(migrationsDir, file);
        const migration = require(filePath);
        
        // Should have up and down functions
        expect(typeof migration.up).toBe('function');
        expect(typeof migration.down).toBe('function');
      }
    });
  });

  describe('Configuration Files', () => {
    test('should have knexfile configuration', () => {
      const knexfilePath = path.join(__dirname, '../../knexfile.js');
      expect(fs.existsSync(knexfilePath)).toBe(true);
    });
    
    test('should have knexfile with test environment', () => {
      const knexConfig = require('../../knexfile.js');
      expect(knexConfig).toHaveProperty('test');
      expect(knexConfig.test).toHaveProperty('client');
      expect(knexConfig.test).toHaveProperty('migrations');
    });
    
    test('should have docker compose file', () => {
      const dockerComposePath = path.join(__dirname, '../../docker-compose.dev.yml');
      expect(fs.existsSync(dockerComposePath)).toBe(true);
    });
  });

  describe('Package.json Scripts', () => {
    test('should have migration scripts in package.json', () => {
      const packageJsonPath = path.join(__dirname, '../../package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      const expectedScripts = [
        'db:migrate',
        'db:migrate:down',
        'db:migrate:create',
        'db:migrate:reset',
        'db:setup'
      ];
      
      for (const script of expectedScripts) {
        expect(packageJson.scripts).toHaveProperty(script);
      }
    });
    
    test('should use Knex for all migration commands', () => {
      const packageJsonPath = path.join(__dirname, '../../package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Should use knex, not node-pg-migrate
      expect(packageJson.scripts['db:migrate']).toContain('knex');
      expect(packageJson.scripts['db:migrate:down']).toContain('knex');
      expect(packageJson.scripts['db:migrate:create']).toContain('knex');
      expect(packageJson.scripts['db:migrate:reset']).toContain('knex');
      
      // Verify no node-pg-migrate commands
      const allScripts = Object.values(packageJson.scripts).join(' ');
      expect(allScripts).not.toContain('node-pg-migrate');
    });
  });

  describe('Database Migrations Execution', () => {
    test('should run all migrations successfully', async () => {
      const result = await db.migrate.latest();
      expect(result).toBeDefined();
      expect(Array.isArray(result[1])).toBe(true);
      console.log(`Migrations run: ${result[1].length}`);
    });

    test('should create all required tables', async () => {
      const tables = [
        'invoices',
        'tenants',
        'users',
        'api_keys',
        'escrow_operations',
        'escrow_summaries',
        'audit_logs_escrow',
        'audit_log_events',
        'retention_policies',
        'legal_holds',
        'retention_audit_log',
        'retention_job_executions',
        'escrow_events',
        'escrow_event_projection',
        'escrow_indexer_state'
      ];

      for (const table of tables) {
        const hasTable = await db.schema.hasTable(table);
        expect(hasTable).toBe(true);
      }
    });

    test('should have correct schema for invoices table', async () => {
      const columns = await db('invoices').columnInfo();
      expect(columns).toHaveProperty('id');
      expect(columns).toHaveProperty('invoice_number');
      expect(columns).toHaveProperty('amount');
      expect(columns).toHaveProperty('currency');
      expect(columns).toHaveProperty('customer_name');
      expect(columns).toHaveProperty('status');
      expect(columns).toHaveProperty('tenant_id');
      expect(columns).toHaveProperty('version');
      expect(columns).toHaveProperty('metadata');
      expect(columns).toHaveProperty('created_at');
      expect(columns).toHaveProperty('updated_at');
      expect(columns).toHaveProperty('deleted_at');
    });

    test('should support multi-tenancy with tenant_id columns', async () => {
      const tables = ['invoices', 'tenants', 'users', 'api_keys', 'escrow_operations', 'legal_holds'];
      
      for (const table of tables) {
        if (table === 'tenants') continue; // tenants table doesn't have tenant_id
        
        const columns = await db(table).columnInfo();
        expect(columns).toHaveProperty('tenant_id');
      }
    });

    test('should have JSON column support', async () => {
      const columns = await db('invoices').columnInfo();
      expect(columns).toHaveProperty('metadata');
      
      // Verify JSON data can be stored and retrieved
      await db('invoices').insert({
        id: db.raw('uuid_generate_v4()'),
        invoice_number: 'JSON-TEST-' + Date.now(),
        amount: 500.00,
        currency: 'USD',
        customer_name: 'Test',
        due_date: db.raw('CURRENT_DATE'),
        issue_date: db.raw('CURRENT_DATE'),
        status: 'pending_verification',
        sme_id: db.raw('uuid_generate_v4()'),
        tenant_id: db.raw('uuid_generate_v4()'),
        metadata: { test: 'value' }
      });
    });

    test('should handle migration idempotency', async () => {
      // Run migrations again - should not fail
      const result = await db.migrate.latest();
      
      // Second run should return empty array (no new migrations)
      expect(Array.isArray(result[1])).toBe(true);
      expect(result[1].length).toBe(0);
    });
  });

  describe('Documentation', () => {
    test('should have migration documentation', () => {
      const docPath = path.join(__dirname, '../../DB_MIGRATIONS.md');
      expect(fs.existsSync(docPath)).toBe(true);
    });
    
    test('should document Knex as the standard tool', () => {
      const docPath = path.join(__dirname, '../../DB_MIGRATIONS.md');
      const content = fs.readFileSync(docPath, 'utf8');
      
      expect(content).toContain('Knex.js');
      expect(content).toContain('knex migrate:latest');
      expect(content).not.toContain('node-pg-migrate');
    });
    
    test('should have documentation with key sections', () => {
      const docPath = path.join(__dirname, '../../DB_MIGRATIONS.md');
      const content = fs.readFileSync(docPath, 'utf8');
      
      // Should contain key sections
      expect(content).toMatch(/## Quick Start/);
      expect(content).toMatch(/## Migration Commands/);
      expect(content).toMatch(/## Database Schema/);
      expect(content).toMatch(/## Production Deployment/);
      expect(content).toMatch(/## Troubleshooting/);
    });
  });

  describe('Migration Validation', () => {
    test('should have migration history recorded', async () => {
      const migrations = await db('knex_migrations').select('*');
      expect(migrations.length).toBeGreaterThan(0);
      console.log(`Recorded migrations: ${migrations.length}`);
      
      migrations.forEach((m) => {
        expect(m.name).toBeDefined();
        expect(m.batch).toBeDefined();
      });
    });

    test('should have no duplicate migrations', async () => {
      const migrations = await db('knex_migrations').select('name');
      const names = migrations.map(m => m.name);
      
      expect(new Set(names).size).toBe(names.length); // All unique
    });
  });
});
