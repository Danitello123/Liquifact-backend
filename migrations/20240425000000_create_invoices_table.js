/**
 * Migration: Create invoices table with full schema
 * Replaces initial schema with complete invoice structure
 */

exports.up = function(knex) {
  const isPostgres = knex.client.config.client === 'pg';
  
  // Drop existing invoices table if it exists
  return knex.schema.dropTableIfExists('invoices')
    .then(() => {
      return knex.schema.createTable('invoices', function(table) {
        table.uuid('id').primary();
        table.string('invoice_number', 50).unique().notNullable();
        table.decimal('amount', 15, 2).notNullable();
        table.string('currency', 3).notNullable().defaultTo('USD');
        table.string('customer_name', 255).notNullable();
        table.string('customer_email', 255);
        table.string('customer_tax_id', 50);
        table.date('due_date').notNullable();
        table.date('issue_date').notNullable().defaultTo(knex.fn.now());
        table.string('status', 50).notNullable().defaultTo('pending_verification');
        table.uuid('sme_id').notNullable();
        table.uuid('buyer_id');
        table.text('description');
        table.json('metadata').defaultTo('{}');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        table.timestamp('deleted_at').nullable();
        table.integer('version').notNullable().defaultTo(1);
      });
    })
    .then(() => {
      if (isPostgres) {
        // Create updated_at trigger function
        return knex.raw(`
          CREATE OR REPLACE FUNCTION update_updated_at_column()
          RETURNS TRIGGER AS $$
          BEGIN
            NEW.updated_at = NOW();
            NEW.version = OLD.version + 1;
            RETURN NEW;
          END;
          $$ language 'plpgsql';
        `);
      }
    })
    .then(() => {
      if (isPostgres) {
        // Create trigger on invoices
        return knex.raw(`
          DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
          CREATE TRIGGER update_invoices_updated_at 
            BEFORE UPDATE ON invoices 
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column();
        `);
      }
    })
    .then(() => {
      // Create indexes
      return Promise.all([
        knex.schema.table('invoices', (table) => {
          table.index('sme_id');
          table.index('buyer_id');
          table.index('status');
          table.index('due_date');
          table.index('created_at');
        })
      ]);
    });
};

exports.down = function(knex) {
  const isPostgres = knex.client.config.client === 'pg';
  
  return knex.schema.dropTableIfExists('invoices')
    .then(() => {
      if (isPostgres) {
        return knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');
      }
    });
};
