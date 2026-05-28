/**
 * Migration: Create users and tenants tables for multi-tenant architecture
 */

exports.up = function(knex) {
  const isPostgres = knex.client.config.client === 'pg';
  
  return knex.schema
    .createTable('tenants', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw(isPostgres ? 'uuid_generate_v4()' : 'gen_random_uuid()'));
      table.string('name', 255).notNullable();
      table.string('slug', 100).unique().notNullable();
      table.string('domain', 255);
      table.json('settings').defaultTo('{}');
      table.string('status', 50).notNullable().defaultTo('active');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('deleted_at').nullable();
    })
    .createTable('users', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw(isPostgres ? 'uuid_generate_v4()' : 'gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.string('email', 255).unique().notNullable();
      table.string('password_hash', 255).notNullable();
      table.string('first_name', 100);
      table.string('last_name', 100);
      table.string('role', 50).notNullable().defaultTo('user');
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamp('last_login_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('deleted_at').nullable();
    })
    .createTable('api_keys', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw(isPostgres ? 'uuid_generate_v4()' : 'gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.string('key_hash', 255).notNullable().unique();
      table.string('key_prefix', 20).notNullable();
      table.string('name', 255).notNullable();
      table.text('scopes').notNullable();
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamp('expires_at').nullable();
      table.timestamp('last_used_at').nullable();
      table.uuid('created_by').references('id').inTable('users');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    .then(() => {
      if (isPostgres) {
        return knex.raw(`
          DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
          CREATE TRIGGER update_tenants_updated_at 
            BEFORE UPDATE ON tenants 
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column();
          
          DROP TRIGGER IF EXISTS update_users_updated_at ON users;
          CREATE TRIGGER update_users_updated_at 
            BEFORE UPDATE ON users 
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column();
          
          DROP TRIGGER IF EXISTS update_api_keys_updated_at ON api_keys;
          CREATE TRIGGER update_api_keys_updated_at 
            BEFORE UPDATE ON api_keys 
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column();
          
          ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
          ALTER TABLE users ENABLE ROW LEVEL SECURITY;
          ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
        `);
      }
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('api_keys')
    .dropTableIfExists('users')
    .dropTableIfExists('tenants');
};
