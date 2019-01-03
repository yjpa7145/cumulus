'use strict';

const pick = require('lodash.pick');

const EXECUTIONS_TABLE = 'executions';

function filterExecutionFields(executionRecord) {
  const fields = [
    'arn',
    'created_at',
    'error',
    'execution',
    'final_payload',
    'name',
    'original_payload',
    'status',
    'timestamp',
    'type',
    'updated_at'
  ];

  return pick(executionRecord, fields);
}

function find(db, params = {}) {
  let query = db(EXECUTIONS_TABLE);

  if (params.where) query = query.where(params.where);
  if (params.whereNot) query = query.whereNot(params.whereNot);

  return query.select(params.fields);
}

function findByArn(db, arn) {
  return db(EXECUTIONS_TABLE).first().where({ arn });
}

async function insert(db, executionRecord) {
  const now = Date.now();

  await db(EXECUTIONS_TABLE)
    .insert({
      ...filterExecutionFields(executionRecord),
      created_at: now,
      updated_at: now
    });

  return executionRecord.arn;
}

async function update(db, arn, executionRecord) {
  return db(EXECUTIONS_TABLE)
    .where({ arn })
    .update({
      ...filterExecutionFields(executionRecord),
      arn: undefined,
      created_at: undefined,
      updated_at: Date.now()
    });
}

module.exports = {
  find,
  findByArn,
  insert,
  update,
  delete: (db, arn) => db(EXECUTIONS_TABLE).where({ arn }).del()
};
