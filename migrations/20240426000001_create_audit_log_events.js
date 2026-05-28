/**
 * Migration: Create audit_log_events append-only table
 */

exports.up = function(knex) {
  const isPostgres = knex.client.config.client === 'pg';
  
  return knex.schema.createTable('audit_log_events', function(table) {
    if (isPostgres) {
      table.bigIncrements('id').primary();
    } else {
      table.increments('id').primary();
    }
    table.string('event_type', 64).notNullable();
    table.string('action', 128).notNullable();
    table.string('actor_type', 64).notNullable();
    table.string('actor_id', 255).notNullable();
    table.string('target_type', 128);
    table.string('target_id', 255);
    table.string('request_id', 128);
    table.text('route');
    table.string('method', 16);
    table.integer('status_code');
    table.string('ip_address', 64);
    table.text('user_agent');
    table.json('metadata').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  })
  .then(() => {
    // Create indexes
    return knex.schema.table('audit_log_events', (table) => {
      table.index(['event_type', 'created_at']);
      table.index(['actor_type', 'actor_id']);
    });
  })
  .then(() => {
    if (isPostgres) {
      return knex.raw(`
        CREATE OR REPLACE FUNCTION prevent_audit_log_update_or_delete()
        RETURNS TRIGGER AS $$
        BEGIN
          RAISE EXCEPTION 'audit_log_events is append-only';
        END;
        $$ LANGUAGE plpgsql;
        
        DROP TRIGGER IF EXISTS trg_audit_log_no_update ON audit_log_events;
        DROP TRIGGER IF EXISTS trg_audit_log_no_delete ON audit_log_events;
        
        CREATE TRIGGER trg_audit_log_no_update
        BEFORE UPDATE ON audit_log_events
        FOR EACH ROW
        EXECUTE FUNCTION prevent_audit_log_update_or_delete();
        
        CREATE TRIGGER trg_audit_log_no_delete
        BEFORE DELETE ON audit_log_events
        FOR EACH ROW
        EXECUTE FUNCTION prevent_audit_log_update_or_delete();
      `);
    }
  });
};

exports.down = function(knex) {
  const isPostgres = knex.client.config.client === 'pg';
  
  return knex.schema.dropTableIfExists('audit_log_events')
    .then(() => {
      if (isPostgres) {
        return knex.raw(`
          DROP FUNCTION IF EXISTS prevent_audit_log_update_or_delete();
        `);
      }
    });
};
