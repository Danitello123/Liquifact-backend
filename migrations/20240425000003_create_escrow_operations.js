/**
 * Migration: Create escrow operations and related tables
 */

exports.up = function(knex) {
  const isPostgres = knex.client.config.client === 'pg';
  
  return knex.schema
    .createTable('escrow_operations', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw(isPostgres ? 'uuid_generate_v4()' : 'gen_random_uuid()'));
      table.uuid('invoice_id').notNullable().references('id').inTable('invoices').onDelete('CASCADE');
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.string('operation_type', 50).notNullable();
      table.string('stellar_transaction_hash', 64);
      table.string('contract_id', 56);
      table.decimal('amount', 15, 2);
      table.string('status', 50).notNullable().defaultTo('pending');
      table.text('error_message');
      table.json('metadata').defaultTo('{}');
      table.uuid('initiated_by').references('id').inTable('users');
      table.timestamp('initiated_at').defaultTo(knex.fn.now());
      table.timestamp('completed_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    .createTable('escrow_summaries', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw(isPostgres ? 'uuid_generate_v4()' : 'gen_random_uuid()'));
      table.uuid('invoice_id').notNullable().references('id').inTable('invoices').onDelete('CASCADE');
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.decimal('total_funded', 15, 2).notNullable().defaultTo(0);
      table.decimal('total_released', 15, 2).notNullable().defaultTo(0);
      table.decimal('available_amount', 15, 2).notNullable().defaultTo(0);
      table.bigInteger('stellar_ledger_sequence');
      table.timestamp('last_updated_at').defaultTo(knex.fn.now());
      table.string('cache_key', 255).unique();
      table.timestamp('expires_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .createTable('audit_logs_escrow', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw(isPostgres ? 'uuid_generate_v4()' : 'gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.uuid('user_id').references('id').inTable('users');
      table.string('action', 100).notNullable();
      table.string('resource_type', 50).notNullable();
      table.uuid('resource_id');
      table.json('old_values');
      table.json('new_values');
      table.string('ip_address');
      table.text('user_agent');
      table.json('metadata').defaultTo('{}');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .then(() => {
      // Create indexes
      return Promise.all([
        knex.schema.table('escrow_operations', (table) => {
          table.index('invoice_id');
          table.index('tenant_id');
          table.index('status');
          table.index('operation_type');
          table.index('stellar_transaction_hash');
          table.index('created_at');
        }),
        knex.schema.table('escrow_summaries', (table) => {
          table.index('invoice_id');
          table.index('tenant_id');
          table.index('cache_key');
          table.index('expires_at');
        }),
        knex.schema.table('audit_logs_escrow', (table) => {
          table.index('tenant_id');
          table.index('user_id');
          table.index('action');
          table.index('resource_type');
        })
      ]);
    })
    .then(() => {
      if (isPostgres) {
        return knex.raw(`
          DROP TRIGGER IF EXISTS update_escrow_operations_updated_at ON escrow_operations;
          CREATE TRIGGER update_escrow_operations_updated_at 
            BEFORE UPDATE ON escrow_operations 
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column();
          
          ALTER TABLE escrow_operations ENABLE ROW LEVEL SECURITY;
          ALTER TABLE escrow_summaries ENABLE ROW LEVEL SECURITY;
          ALTER TABLE audit_logs_escrow ENABLE ROW LEVEL SECURITY;
        `);
      }
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('audit_logs_escrow')
    .dropTableIfExists('escrow_summaries')
    .dropTableIfExists('escrow_operations');
};
