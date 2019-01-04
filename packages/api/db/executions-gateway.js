'use strict';

const pick = require('lodash.pick');

const EXECUTIONS_TABLE = 'executions';

function filterExecutionFields(executionRecord) {
  const fields = [
    'arn',
    'collection_id',
    'created_at',
    'duration',
    'error',
    'execution',
    'final_payload',
    'name',
    'parent_arn',
    'original_payload',
    'status',
    'timestamp',
    'type',
    'updated_at'
  ];

  return pick(executionRecord, fields);
}

function deletePayloadsCompletedBefore(db, ms) {
  return db(EXECUTIONS_TABLE)
    .where('updated_at', '<=', ms)
    .where('status', 'completed')
    .update({
      original_payload: null,
      final_payload: null
    });
}

function deletePayloadsNotCompletedBefore(db, ms) {
  return db(EXECUTIONS_TABLE)
    .where('updated_at', '<=', ms)
    .whereNot('status', 'completed')
    .update({
      original_payload: null,
      final_payload: null
    });
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
      created_at: now,
      ...filterExecutionFields(executionRecord),
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
  deletePayloadsCompletedBefore,
  deletePayloadsNotCompletedBefore,
  find,
  findByArn,
  insert,
  update,
  delete: (db, arn) => db(EXECUTIONS_TABLE).where({ arn }).del()
};
