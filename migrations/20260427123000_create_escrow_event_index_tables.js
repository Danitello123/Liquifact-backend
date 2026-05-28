/**
 * Migration: Create durable escrow event index tables for off-chain projection
 */

exports.up = function(knex) {
  return knex.schema
    .createTable('escrow_events', function(table) {
      table.string('event_id').primary();
      table.string('invoice_id').notNullable();
      table.string('event_type').notNullable();
      table.bigInteger('ledger_sequence').notNullable();
      table.string('paging_token');
      table.string('contract_id');
      table.string('tx_hash');
      table.text('event_body').notNullable();
      table.timestamp('observed_at').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .createTable('escrow_event_projection', function(table) {
      table.string('invoice_id').primary();
      table.string('latest_event_id').notNullable();
      table.string('latest_event_type').notNullable();
      table.bigInteger('latest_ledger_sequence').notNullable();
      table.string('latest_paging_token');
      table.text('latest_event_body').notNullable();
      table.timestamp('latest_observed_at').notNullable();
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    .createTable('escrow_indexer_state', function(table) {
      table.string('key').primary();
      table.text('value').notNullable();
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    .then(() => {
      // Create indexes
      return knex.schema.table('escrow_events', (table) => {
        table.index('invoice_id');
        table.index('ledger_sequence');
      });
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('escrow_indexer_state')
    .dropTableIfExists('escrow_event_projection')
    .dropTableIfExists('escrow_events');
};
