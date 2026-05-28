/**
 * Migration: Add marketplace fields to invoices table for search and sorting
 */

exports.up = function(knex) {
  return knex.schema.table('invoices', function(table) {
    table.integer('yield_bps').nullable();
    table.decimal('funded_ratio', 5, 2).defaultTo(0);
    table.date('maturity_date').nullable();
  })
  .then(() => {
    return knex('invoices').update({
      maturity_date: knex.raw('due_date')
    }).whereNull('maturity_date');
  })
  .then(() => {
    return knex.schema.table('invoices', function(table) {
      table.index('yield_bps');
      table.index('funded_ratio');
      table.index('maturity_date');
    });
  });
};

exports.down = function(knex) {
  return knex.schema.table('invoices', function(table) {
    table.dropIndex('yield_bps');
    table.dropIndex('funded_ratio');
    table.dropIndex('maturity_date');
    table.dropColumn('yield_bps');
    table.dropColumn('funded_ratio');
    table.dropColumn('maturity_date');
  });
};
