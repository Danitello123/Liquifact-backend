/**
 * Migration: Add tenant_id to invoices table for proper multi-tenant isolation
 */

exports.up = function(knex) {
  const isPostgres = knex.client.config.client === 'pg';
  
  return knex.schema.table('invoices', function(table) {
    table.uuid('tenant_id').notNullable().defaultTo(knex.raw("'00000000-0000-0000-0000-000000000000'"));
  })
  .then(() => {
    if (isPostgres) {
      return knex.raw(`
        ALTER TABLE invoices ADD CONSTRAINT fk_invoices_tenant_id 
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
      `);
    }
  })
  .then(() => {
    return knex.schema.table('invoices', function(table) {
      table.index('tenant_id');
    });
  })
  .then(() => {
    if (isPostgres) {
      return knex.raw(`
        CREATE OR REPLACE FUNCTION set_tenant_context(tenant_uuid UUID)
        RETURNS VOID AS $$
        BEGIN
          PERFORM set_config('app.current_tenant_id', tenant_uuid::text, true);
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
        
        CREATE OR REPLACE FUNCTION get_current_tenant_id()
        RETURNS UUID AS $$
        BEGIN
          RETURN current_setting('app.current_tenant_id', true)::uuid;
        EXCEPTION WHEN OTHERS THEN
          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
      `);
    }
  });
};

exports.down = function(knex) {
  const isPostgres = knex.client.config.client === 'pg';
  
  return knex.schema.table('invoices', function(table) {
    table.dropIndex('tenant_id');
  })
  .then(() => {
    if (isPostgres) {
      return knex.raw(`ALTER TABLE invoices DROP CONSTRAINT IF EXISTS fk_invoices_tenant_id`);
    }
  })
  .then(() => {
    return knex.schema.table('invoices', function(table) {
      table.dropColumn('tenant_id');
    });
  })
  .then(() => {
    if (isPostgres) {
      return knex.raw(`
        DROP FUNCTION IF EXISTS set_tenant_context(UUID);
        DROP FUNCTION IF EXISTS get_current_tenant_id();
      `);
    }
  });
};
