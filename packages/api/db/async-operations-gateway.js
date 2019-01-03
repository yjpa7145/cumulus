'use strict';

const pick = require('lodash.pick');

const ASYNC_OPERATIONS_TABLE = 'async_operations';

function filterAsyncOperationFields(asyncOperationRecord) {
  const fields = [
    'created_at',
    'id',
    'output',
    'status',
    'task_arn',
    'updated_at'
  ];

  return pick(asyncOperationRecord, fields);
}

function findById(db, id) {
  return db(ASYNC_OPERATIONS_TABLE).first().where({ id });
}

async function insert(db, asyncOperationRecord) {
  const now = Date.now();

  const [asyncOperationId] = await db(ASYNC_OPERATIONS_TABLE)
    .insert({
      ...filterAsyncOperationFields(asyncOperationRecord),
      created_at: now,
      updated_at: now
    });

  return asyncOperationId;
}

function update(db, id, asyncOperationRecord) {
  return db(ASYNC_OPERATIONS_TABLE)
    .where({ id })
    .update({
      ...filterAsyncOperationFields(asyncOperationRecord),
      id: undefined,
      created_at: undefined,
      updated_at: Date.now()
    });
}

module.exports = {
  findById,
  insert,
  update
};
