'use strict';

const pick = require('lodash.pick');

const COLLECTIONS_TABLE = 'collections';
const COLLECTION_FILE_DEFINITIONS_TABLE = 'collection_file_definitions';

function filterCollectionFields(collectionRecord) {
  const fields = [
    'created_at',
    'data_type',
    'duplicate_handling',
    'granule_id_extraction_regex',
    'granule_id_validation_regex',
    'id',
    'meta',
    'name',
    'process',
    'provider_path',
    'sample_file_name',
    'updated_at',
    'url_path',
    'version'
  ];

  return pick(collectionRecord, fields);
}

function filterCollectionFileDefinitionFields(fileDefinitionRecord) {
  const fields = [
    'bucket',
    'collection_id',
    'id',
    'regex',
    'sample_file_name',
    'url_path'
  ];

  return pick(fileDefinitionRecord, fields);
}

function findById(db, id) {
  return db(COLLECTIONS_TABLE).first().where({ id });
}

function findByNameAndVersion(db, name, version) {
  return db(COLLECTIONS_TABLE).first().where({ name, version });
}

async function insert(db, collectionRecord) {
  const now = Date.now();

  const [collectionId] = await db(COLLECTIONS_TABLE)
    .insert({
      ...filterCollectionFields(collectionRecord),
      created_at: now,
      updated_at: now
    });

  return collectionId;
}

function update(db, collectionId, collectionRecord) {
  return db(COLLECTIONS_TABLE)
    .where({ id: collectionId })
    .update({
      ...filterCollectionFields(collectionRecord),
      id: undefined,
      created_at: undefined,
      updated_at: Date.now()
    });
}

function insertCollectionFileDefinitions(db, records) {
  return db(COLLECTION_FILE_DEFINITIONS_TABLE)
    .insert(records.map(filterCollectionFileDefinitionFields));
}

function deleteFileDefinitions(db, collectionId) {
  return db(COLLECTION_FILE_DEFINITIONS_TABLE)
    .where({ collection_id: collectionId })
    .del();
}

function getFileDefinitions(db, collectionId) {
  return db(COLLECTION_FILE_DEFINITIONS_TABLE)
    .where({ collection_id: collectionId });
}

function setFileDefinitions(db, collectionId, fileDefinitions) {
  return db.transaction(async (trx) => {
    await deleteFileDefinitions(trx, collectionId);
    await insertCollectionFileDefinitions(trx, fileDefinitions);
  });
}

module.exports = {
  findById,
  findByNameAndVersion,
  insert,
  update,
  delete: (db, id) => db(COLLECTIONS_TABLE).where({ id }).del(),
  getFileDefinitions,
  setFileDefinitions,
  deleteFileDefinitions
};
