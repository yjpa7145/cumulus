'use strict';

const parseConnection = require('knex/lib/util/parse-connection');

// See https://github.com/mysqljs/mysql
// and https://github.com/mysqljs/mysql/issues/1267 for more on this
function typeCastMysql(field, next) {
  if (field.type === 'TINY' && field.length === 1) {
    return (field.string() === '1');
  }
  if (field.type === 'JSON') {
    return (JSON.parse(field.string()));
  }
  return next();
}

const awsDatabaseUrl = `mysql://${process.env.RdsUser}:${process.env.RdsPassword}@${process.env.Endpoint}/${process.env.RdsDatabaseName}`;
let config = parseConnection(awsDatabaseUrl);

if (process.env.DATABASE_URL) {
  config = parseConnection(process.env.DATABASE_URL);
}
else if (process.env.testLocalMigration) {
  config = {
    debug: true,
    client: 'mysql',
    connection: {
      host: '127.0.0.1',
      database: 'cumulus',
      user: 'cumulus',
      password: 'password'
    }
  };
  config.migrations = {
    directory: './db/migrations'
  };
}

// This addresses mysql not having a native Bool type.
if (config.client === 'mysql') {
  config.connection.typeCast = typeCastMysql;
}

module.exports = config;
