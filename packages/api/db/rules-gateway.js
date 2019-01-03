'use strict';

const pick = require('lodash.pick');

const RULES_TABLE = 'rules';

function filterRuleFields(ruleRecord) {
  const fields = [
    'collection_id',
    'created_at',
    'id',
    'meta',
    'name',
    'provider_id',
    'rule_arn',
    'rule_log_event_arn',
    'rule_type',
    'rule_value',
    'state',
    'updated_at',
    'workflow'
  ];

  return pick(ruleRecord, fields);
}

function find(db, params = {}) {
  let query = db(RULES_TABLE);

  if (params.where) query = query.where(params.where);
  if (params.whereNot) query = query.whereNot(params.whereNot);

  return query.select(params.fields);
}

function findByName(db, name) {
  return db(RULES_TABLE).first().where({ name });
}

function findByCollectionId(db, collectionId) {
  return db(RULES_TABLE)
    .where({ collection_id: collectionId })
    .select();
}

function findByProviderId(db, providerId) {
  return db(RULES_TABLE)
    .where({ provider_id: providerId })
    .select();
}

async function insert(db, ruleRecord) {
  const now = Date.now();

  const [ruleId] = await db(RULES_TABLE)
    .insert({
      ...filterRuleFields(ruleRecord),
      created_at: now,
      updated_at: now
    });

  return ruleId;
}

function update(db, ruleId, ruleRecord) {
  return db(RULES_TABLE)
    .where({ id: ruleId })
    .update({
      ...filterRuleFields(ruleRecord),
      id: undefined,
      created_at: undefined,
      updated_at: Date.now()
    });
}

module.exports = {
  find,
  findByName,
  findByCollectionId,
  findByProviderId,
  insert,
  update,
  delete: (db, id) => db(RULES_TABLE).where({ id }).del()
};
