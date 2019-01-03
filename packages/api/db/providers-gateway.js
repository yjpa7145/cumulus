'use strict';

const pick = require('lodash.pick');

const PROVIDERS_TABLE = 'providers';

function filterProviderFields(providerRecord) {
  const fields = [
    'created_at',
    'encrypted',
    'global_connection_limit',
    'host',
    'id',
    'meta',
    'password',
    'port',
    'protocol',
    'updated_at',
    'username'
  ];

  return pick(providerRecord, fields);
}

function findById(db, id) {
  return db(PROVIDERS_TABLE).first().where({ id });
}

async function insert(db, providerRecord) {
  const now = Date.now();

  const [providerId] = await db(PROVIDERS_TABLE)
    .insert({
      ...filterProviderFields(providerRecord),
      created_at: now,
      updated_at: now
    });

  return providerId;
}

async function update(db, providerId, providerRecord) {
  return db(PROVIDERS_TABLE)
    .where({ id: providerId })
    .update({
      ...filterProviderFields(providerRecord),
      id: undefined,
      created_at: undefined,
      updated_at: Date.now()
    });
}

module.exports = {
  findById,
  insert,
  update,
  delete: (db, id) => db(PROVIDERS_TABLE).where({ id }).del()
};
