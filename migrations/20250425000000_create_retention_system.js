/**
 * Migration: Create retention policy and legal hold system
 */

exports.up = function(knex) {
  const isPostgres = knex.client.config.client === 'pg';
  
  return knex.schema
    .createTable('retention_policies', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw(isPostgres ? 'uuid_generate_v4()' : 'gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.string('name', 255).notNullable();
      table.text('description');
      table.integer('retention_days').notNullable();
      table.text('pii_fields').defaultTo('{"customer_name","customer_email","customer_tax_id"}');
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('deleted_at').nullable();
    })
    .createTable('legal_holds', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw(isPostgres ? 'uuid_generate_v4()' : 'gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.uuid('invoice_id').references('id').inTable('invoices').onDelete('CASCADE');
      table.text('hold_reason').notNullable();
      table.string('hold_type', 50).notNullable().defaultTo('litigation');
      table.string('status', 50).notNullable().defaultTo('active');
      table.uuid('placed_by').references('id').inTable('users');
      table.timestamp('placed_at').defaultTo(knex.fn.now());
      table.timestamp('released_at').nullable();
      table.text('release_reason');
      table.timestamp('expires_at').nullable();
      table.json('metadata').defaultTo('{}');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    .createTable('retention_audit_log', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw(isPostgres ? 'uuid_generate_v4()' : 'gen_random_uuid()'));
      table.uuid('tenant_id').notNullable();
      table.uuid('invoice_id').references('id').inTable('invoices').onDelete('SET NULL');
      table.string('operation', 50).notNullable();
      table.text('pii_fields').defaultTo('{}');
      table.json('old_values').defaultTo('{}');
      table.json('new_values').defaultTo('{}');
      table.text('reason');
      table.uuid('performed_by').references('id').inTable('users');
      table.timestamp('performed_at').defaultTo(knex.fn.now());
      table.json('metadata').defaultTo('{}');
    })
    .createTable('retention_job_executions', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw(isPostgres ? 'uuid_generate_v4()' : 'gen_random_uuid()'));
      table.uuid('tenant_id').notNullable();
      table.string('job_type', 50).notNullable().defaultTo('scheduled_purge');
      table.string('status', 50).notNullable().defaultTo('started');
      table.boolean('dry_run').notNullable().defaultTo(false);
      table.integer('invoices_processed').notNullable().defaultTo(0);
      table.integer('invoices_purged').notNullable().defaultTo(0);
      table.text('pii_fields_purged').defaultTo('{}');
      table.json('errors').defaultTo('{}');
      table.timestamp('started_at').defaultTo(knex.fn.now());
      table.timestamp('completed_at').nullable();
      table.uuid('performed_by').references('id').inTable('users');
      table.json('metadata').defaultTo('{}');
    })
    .then(() => {
      // Create indexes
      return Promise.all([
        knex.schema.table('retention_policies', (table) => {
          table.index('tenant_id');
          table.index('is_active');
        }),
        knex.schema.table('legal_holds', (table) => {
          table.index('tenant_id');
          table.index('invoice_id');
          table.index('status');
          table.index('expires_at');
        }),
        knex.schema.table('retention_audit_log', (table) => {
          table.index('tenant_id');
          table.index('invoice_id');
          table.index('operation');
          table.index('performed_at');
        }),
        knex.schema.table('retention_job_executions', (table) => {
          table.index('tenant_id');
          table.index('status');
          table.index('started_at');
        })
      ]);
    })
    .then(() => {
      if (isPostgres) {
        return knex.raw(`
          DROP TRIGGER IF EXISTS update_retention_policies_updated_at ON retention_policies;
          CREATE TRIGGER update_retention_policies_updated_at 
            BEFORE UPDATE ON retention_policies 
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column();
          
          DROP TRIGGER IF EXISTS update_legal_holds_updated_at ON legal_holds;
          CREATE TRIGGER update_legal_holds_updated_at 
            BEFORE UPDATE ON legal_holds 
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column();
          
          ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;
          ALTER TABLE legal_holds ENABLE ROW LEVEL SECURITY;
        `);
      }
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('retention_job_executions')
    .dropTableIfExists('retention_audit_log')
    .dropTableIfExists('legal_holds')
    .dropTableIfExists('retention_policies');
};
