'use strict';

// Root-level manual mock for the 'knex' npm package.
// Applied automatically via moduleNameMapper in jest config.
// Makes the query builder thenable so `await query` resolves to [].

const makeQueryBuilder = () => {
  const qb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    first: jest.fn().mockReturnThis(),
    then(resolve, reject) {
      return Promise.resolve([]).then(resolve, reject);
    },
    catch(handler) {
      return Promise.resolve([]).catch(handler);
    },
    finally(handler) {
      return Promise.resolve([]).finally(handler);
    },
  };
  return qb;
};

// db is the knex instance — it's callable (db('tableName') returns a query builder)
const db = jest.fn(() => makeQueryBuilder());
db.raw = jest.fn().mockResolvedValue([]);

// knex factory — called with config, returns the db instance
const knex = jest.fn(() => db);

module.exports = knex;
