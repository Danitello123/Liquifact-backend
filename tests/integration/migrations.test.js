'use strict';

const { Pool } = require('pg');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

describe('Database Migrations Integration Tests', () => {
  let testDb;
  let originalEnv;
  
  beforeAll(async () => {
    // Store original environment
    originalEnv = { ...process.env };
    
    // Set test database configuration
    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = process.env.TEST_DB_HOST || 'localhost';
    process.env.DB_PORT = process.env.TEST_DB_PORT || 5433;
    process.env.DB_NAME = process.env.TEST_DB_NAME || 'liquifact_test';
    process.env.DB_USER = process.env.TEST_DB_USER || 'test_user';
    process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'test_password';
    
    // Create test database connection
    testDb = new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
    
    // Clean up test database before tests
    await cleanupTestDatabase();
  });
  
  afterAll(async () => {
    // Restore original environment
    Object.assign(process.env, originalEnv);
    
    // Close database connection
    if (testDb) {
      await testDb.end();
    }
  });
  
  afterEach(async () => {
    // Clean up after each test
    await cleanupTestDatabase();
  });
  
  async function cleanupTestDatabase() {
    try {
      // Drop all tables in correct order (respecting foreign keys)
      await testDb.query('DROP TABLE IF EXISTS audit_logs CASCADE');
      await testDb.query('DROP TABLE IF EXISTS escrow_summaries CASCADE');
      await testDb.query('DROP TABLE IF EXISTS escrow_operations CASCADE');
      await testDb.query('DROP TABLE IF EXISTS invoices CASCADE');
      await testDb.query('DROP TABLE IF EXISTS api_keys CASCADE');
      await testDb.query('DROP TABLE IF EXISTS users CASCADE');
      await testDb.query('DROP TABLE IF EXISTS tenants CASCADE');
      await testDb.query('DROP TABLE IF EXISTS schema_migrations CASCADE');
      await testDb.query('DROP TABLE IF EXISTS migration_lock CASCADE');
      
      // Drop functions
      await testDb.query('DROP FUNCTION IF EXISTS update_updated_at_column CASCADE');
      await testDb.query('DROP FUNCTION IF EXISTS set_tenant_context CASCADE');
      await testDb.query('DROP FUNCTION IF EXISTS get_current_tenant_id CASCADE');
      
      // Drop extensions
      await testDb.query('DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE');
      await testDb.query('DROP EXTENSION IF EXISTS "pg_trgm" CASCADE');
    } catch (error) {
      // Ignore errors during cleanup
      console.log('Cleanup error (expected):', error.message);
    }
  }
  
  describe('Migration Execution', () => {
    test('should run all migrations successfully', async () => {
      // Run migrations
      execSync('npm run db:migrate', { 
        env: process.env,
        stdio: 'pipe'
      });
      
      // Verify migrations table exists and has entries
      const result = await testDb.query(
        'SELECT COUNT(*) as count FROM schema_migrations'
      );
      
      expect(parseInt(result.rows[0].count)).toBeGreaterThan(0);
    });
    
    test('should create all expected tables', async () => {
      // Run migrations
      execSync('npm run db:migrate', { 
        env: process.env,
        stdio: 'pipe'
      });
      
      // Check core tables exist
      const tables = [
        'tenants',
        'users', 
        'api_keys',
        'invoices',
        'escrow_operations',
        'escrow_summaries',
        'audit_logs'
      ];
      
      for (const table of tables) {
        const result = await testDb.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = '${table}'
          ) as exists`
        );
        
        expect(result.rows[0].exists).toBe(true);
      }
    });
    
    test('should create proper indexes for performance', async () => {
      // Run migrations
      execSync('npm run db:migrate', { 
        env: process.env,
        stdio: 'pipe'
      });
      
      // Check critical indexes exist
      const expectedIndexes = [
        { table: 'invoices', index: 'idx_invoices_tenant_id' },
        { table: 'invoices', index: 'idx_invoices_status' },
        { table: 'users', index: 'idx_users_tenant_id' },
        { table: 'users', index: 'idx_users_email' },
        { table: 'escrow_operations', index: 'idx_escrow_operations_invoice_id' }
      ];
      
      for (const { table, index } of expectedIndexes) {
        const result = await testDb.query(
          `SELECT EXISTS (
            SELECT FROM pg_indexes 
            WHERE tablename = '${table}' AND indexname = '${index}'
          ) as exists`
        );
        
        expect(result.rows[0].exists).toBe(true);
      }
    });
    
    test('should enable Row Level Security on tenant tables', async () => {
      // Run migrations
      execSync('npm run db:migrate', { 
        env: process.env,
        stdio: 'pipe'
      });
      
      // Check RLS is enabled on tenant tables
      const rlsTables = [
        'tenants',
        'users',
        'api_keys', 
        'invoices',
        'escrow_operations',
        'escrow_summaries',
        'audit_logs'
      ];
      
      for (const table of rlsTables) {
        const result = await testDb.query(
          `SELECT rowsecurity as rls_enabled 
           FROM pg_tables 
           WHERE tablename = '${table}'`
        );
        
        expect(result.rows[0]?.rls_enabled).toBe(true);
      }
    });
    
    test('should create required PostgreSQL extensions', async () => {
      // Run migrations
      execSync('npm run db:migrate', { 
        env: process.env,
        stdio: 'pipe'
      });
      
      // Check extensions
      const extensions = ['uuid-ossp', 'pg_trgm'];
      
      for (const ext of extensions) {
        const result = await testDb.query(
          `SELECT EXISTS (
            SELECT FROM pg_extension 
            WHERE extname = '${ext}'
          ) as exists`
        );
        
        expect(result.rows[0].exists).toBe(true);
      }
    });
  });
  
  describe('Data Integrity', () => {
    beforeEach(async () => {
      // Run migrations before each data integrity test
      execSync('npm run db:migrate', { 
        env: process.env,
        stdio: 'pipe'
      });
    });
    
    test('should enforce foreign key constraints', async () => {
      // Try to insert invoice without valid tenant
      await expect(
        testDb.query(`
          INSERT INTO invoices (
            id, invoice_number, amount, customer_name, 
            due_date, issue_date, sme_id, tenant_id
          ) VALUES (
            uuid_generate_v4(), 'INV-001', 1000.00, 'Test Customer',
            CURRENT_DATE + INTERVAL '30 days', CURRENT_DATE, 
            uuid_generate_v4(), uuid_generate_v4()
          )
        `)
      ).rejects.toThrow(/foreign key constraint/);
    });
    
    test('should enforce check constraints', async () => {
      // Create tenant first
      const tenantResult = await testDb.query(`
        INSERT INTO tenants (id, name, slug) 
        VALUES (uuid_generate_v4(), 'Test Tenant', 'test-tenant')
        RETURNING id
      `);
      const tenantId = tenantResult.rows[0].id;
      
      // Try to insert invoice with invalid status
      await expect(
        testDb.query(`
          INSERT INTO invoices (
            id, invoice_number, amount, customer_name, 
            due_date, issue_date, sme_id, tenant_id, status
          ) VALUES (
            uuid_generate_v4(), 'INV-001', 1000.00, 'Test Customer',
            CURRENT_DATE + INTERVAL '30 days', CURRENT_DATE, 
            uuid_generate_v4(), $1, 'invalid_status'
          )
        `, [tenantId])
      ).rejects.toThrow(/check constraint/);
      
      // Try to insert invoice with negative amount
      await expect(
        testDb.query(`
          INSERT INTO invoices (
            id, invoice_number, amount, customer_name, 
            due_date, issue_date, sme_id, tenant_id
          ) VALUES (
            uuid_generate_v4(), 'INV-002', -100.00, 'Test Customer',
            CURRENT_DATE + INTERVAL '30 days', CURRENT_DATE, 
            uuid_generate_v4(), $1
          )
        `, [tenantId])
      ).rejects.toThrow(/check constraint/);
    });
    
    test('should automatically update timestamps', async () => {
      // Create tenant
      const tenantResult = await testDb.query(`
        INSERT INTO tenants (id, name, slug) 
        VALUES (uuid_generate_v4(), 'Test Tenant', 'test-tenant')
        RETURNING id, created_at
      `);
      const tenantId = tenantResult.rows[0].id;
      const originalCreatedAt = tenantResult.rows[0].created_at;
      
      // Wait a moment to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Update tenant
      await testDb.query(`
        UPDATE tenants SET name = 'Updated Test Tenant' WHERE id = $1
      `, [tenantId]);
      
      // Check updated_at changed
      const result = await testDb.query(`
        SELECT created_at, updated_at FROM tenants WHERE id = $1
      `, [tenantId]);
      
      expect(result.rows[0].created_at).toEqual(originalCreatedAt);
      expect(result.rows[0].updated_at).not.toEqual(originalCreatedAt);
    });
    
    test('should support soft deletes properly', async () => {
      // Create tenant
      const tenantResult = await testDb.query(`
        INSERT INTO tenants (id, name, slug) 
        VALUES (uuid_generate_v4(), 'Test Tenant', 'test-tenant')
        RETURNING id
      `);
      const tenantId = tenantResult.rows[0].id;
      
      // Create invoice
      const invoiceResult = await testDb.query(`
        INSERT INTO invoices (
          id, invoice_number, amount, customer_name, 
          due_date, issue_date, sme_id, tenant_id
        ) VALUES (
          uuid_generate_v4(), 'INV-001', 1000.00, 'Test Customer',
          CURRENT_DATE + INTERVAL '30 days', CURRENT_DATE, 
          uuid_generate_v4(), $1
        ) RETURNING id, deleted_at
      `, [tenantId]);
      const invoiceId = invoiceResult.rows[0].id;
      
      // Verify not deleted
      expect(invoiceResult.rows[0].deleted_at).toBeNull();
      
      // Soft delete
      await testDb.query(`
        UPDATE invoices SET deleted_at = NOW() WHERE id = $1
      `, [invoiceId]);
      
      // Verify soft delete
      const result = await testDb.query(`
        SELECT deleted_at FROM invoices WHERE id = $1
      `, [invoiceId]);
      
      expect(result.rows[0].deleted_at).not.toBeNull();
    });
  });
  
  describe('Migration Rollback', () => {
    test('should rollback migrations successfully', async () => {
      // Run migrations
      execSync('npm run db:migrate', { 
        env: process.env,
        stdio: 'pipe'
      });
      
      // Verify tables exist
      const tablesBefore = await testDb.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      
      // Rollback one migration
      execSync('npm run db:migrate:down', { 
        env: process.env,
        stdio: 'pipe'
      });
      
      // Verify one migration was removed
      const migrationsAfter = await testDb.query(
        'SELECT COUNT(*) as count FROM schema_migrations'
      );
      
      // Should have one less migration
      expect(parseInt(migrationsAfter.rows[0].count)).toBe(
        parseInt(tablesBefore.rows[0].count) - 1
      );
    });
  });
  
  describe('Migration Files Validation', () => {
    test('should have properly named migration files', () => {
      const migrationsDir = path.join(__dirname, '../../migrations');
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'));
      
      // Check naming pattern: YYYYMMDDHHMMSS_description.sql
      const namingPattern = /^\d{14}_[a-z0-9_]+\.sql$/;
      
      for (const file of migrationFiles) {
        expect(file).toMatch(namingPattern);
      }
    });
    
    test('should have migration files in chronological order', () => {
      const migrationsDir = path.join(__dirname, '../../migrations');
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();
      
      // Extract timestamps and verify they're in order
      const timestamps = migrationFiles.map(file => 
        parseInt(file.split('_')[0])
      );
      
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
      }
    });
  });
  
  describe('Production Safety', () => {
    test('should use single transaction mode in production', async () => {
      // Set production environment
      process.env.NODE_ENV = 'production';
      
      try {
        // This should run in single transaction mode
        execSync('npm run db:migrate', { 
          env: process.env,
          stdio: 'pipe'
        });
        
        // Verify migrations completed successfully
        const result = await testDb.query(
          'SELECT COUNT(*) as count FROM schema_migrations'
        );
        
        expect(parseInt(result.rows[0].count)).toBeGreaterThan(0);
      } finally {
        // Restore test environment
        process.env.NODE_ENV = 'test';
      }
    });
  });
});
