'use strict';

const TAGS_TABLE = 'tags';
const COLLECTION_TAGS_TABLE = 'collection_tags';
const RULE_TAGS_TABLE = 'rule_tags';

function getCollectionTags(db, collectionId) {
  return db(TAGS_TABLE)
    .innerJoin(
      COLLECTION_TAGS_TABLE,
      `${TAGS_TABLE}.id`,
      `${COLLECTION_TAGS_TABLE}.tag_id`
    )
    .select(`${TAGS_TABLE}.name`)
    .where(`${COLLECTION_TAGS_TABLE}.collection_id`, '=', collectionId)
    .then((tagRecords) => tagRecords.map((r) => r.name));
}

function getRuleTags(db, ruleId) {
  return db(TAGS_TABLE)
    .innerJoin(
      RULE_TAGS_TABLE,
      `${TAGS_TABLE}.id`,
      `${RULE_TAGS_TABLE}.tag_id`
    )
    .select(`${TAGS_TABLE}.name`)
    .where(`${RULE_TAGS_TABLE}.rule_id`, '=', ruleId)
    .then((tagRecords) => tagRecords.map((r) => r.name));
}

async function getTagId(db, name) {
  let tagId;

  try {
    [tagId] = await db(TAGS_TABLE)
      .returning('id')
      .insert({ name });
  }
  catch (err) {
    const selectResponse = await db(TAGS_TABLE)
      .where({ name })
      .select('id');

    tagId = selectResponse.id;
  }

  return tagId;
}

function insertCollectionTag(db, collectionId, tagId) {
  return db(COLLECTION_TAGS_TABLE)
    .insert({
      collection_id: collectionId,
      tag_id: tagId
    });
}

function insertCollectionTags(db, collectionId, tags) {
  return Promise.all(
    tags.map(async (tag) => {
      const tagId = await getTagId(db, tag);
      return insertCollectionTag(db, collectionId, tagId);
    })
  );
}

function insertRuleTag(db, ruleId, tagId) {
  return db(RULE_TAGS_TABLE)
    .insert({
      rule_id: ruleId,
      tag_id: tagId
    });
}

function insertRuleTags(db, ruleId, tags) {
  return Promise.all(
    tags.map(async (tag) => {
      const tagId = await getTagId(db, tag);
      return insertRuleTag(db, ruleId, tagId);
    })
  );
}

function deleteCollectionTags(db, collectionId) {
  return db(COLLECTION_TAGS_TABLE)
    .where({ collection_id: collectionId })
    .del();
}

function deleteRuleTags(db, ruleId) {
  return db(RULE_TAGS_TABLE)
    .where({ rule_id: ruleId })
    .del();
}

async function setCollectionTags(db, collectionId, tags) {
  const uniqueTags = Array.from(new Set(tags));

  return db.transaction(async (trx) => {
    await deleteCollectionTags(trx, collectionId);
    await insertCollectionTags(trx, collectionId, uniqueTags);
  });
}

async function setRuleTags(db, ruleId, tags) {
  const uniqueTags = Array.from(new Set(tags));

  return db.transaction(async (trx) => {
    await deleteRuleTags(trx, ruleId);
    await insertRuleTags(trx, ruleId, uniqueTags);
  });
}

module.exports = {
  deleteCollectionTags,
  deleteRuleTags,
  getCollectionTags,
  getRuleTags,
  setCollectionTags,
  setRuleTags
};
