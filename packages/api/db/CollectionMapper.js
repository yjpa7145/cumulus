'use strict';

const camelCase = require('lodash.camelcase');
const mapKeys = require('lodash.mapkeys');
const snakeCase = require('lodash.snakecase');

const TagsGateway = require('../db/TagsGateway');
const Registry = require('../lib/Registry');

function camelizeKeys(obj) {
  return mapKeys(obj, (_, key) => camelCase(key));
}

function snakeCaseKeys(obj) {
  return mapKeys(obj, (_, key) => snakeCase(key));
}

async function getCollectionFiles(knex, collectionId) {
  const collectionFileRecords = await knex('collection_file_definitions')
    .select()
    .where({ collection_id: collectionId });

  const collectionFiles = collectionFileRecords.map((collectionFileRecord) => {
    const collectionFile = camelizeKeys(collectionFileRecord);

    delete collectionFile.id;
    delete collectionFile.collectionId;

    return collectionFile;
  });

  return collectionFiles;
}

async function getCollectionTags(knex, collectionId) {
  const tags = await knex('tags')
    .innerJoin('collection_tags', 'tags.id', 'collection_tags.tag_id')
    .select('tags.name')
    .where('collection_tags.collection_id', '=', collectionId);

  return tags.map((r) => r.name);
}

async function collectionRecordToCollectionObject(knex, collectionRecord) {
  const promisedFiles = getCollectionFiles(knex, collectionRecord.id);
  const promisedTags = getCollectionTags(knex, collectionRecord.id);

  return Object.assign(
    camelizeKeys(collectionRecord),
    {
      files: await promisedFiles,
      meta: JSON.parse(collectionRecord.meta),
      tags: await promisedTags
    }
  );
}

function collectionObjectToCollectionRecord(collectionObject) {
  const collectionRecord = snakeCaseKeys(collectionObject);

  collectionRecord.meta = JSON.stringify(collectionObject.meta);

  delete collectionRecord.files;
  delete collectionRecord.tags;

  return collectionRecord;
}

async function insertCollectionFiles(knex, collectionId, files = []) {
  const fileRecords = files.map((file) =>
    Object.assign(
      snakeCaseKeys(file),
      { collection_id: collectionId }
    ));

  await knex('collection_file_definitions').insert(fileRecords);
}

async function deleteCollectionFiles(knex, collectionId) {
  await knex('collection_file_definitions')
    .where({ collection_id: collectionId })
    .del();
}

async function addTags(tagsGateway, collectionId, tagNames = []) {
  await Promise.all(
    tagNames.map(
      (tagName) => tagsGateway.addCollectionTag(collectionId, tagName)
    )
  );
}

const privates = new WeakMap();

class CollectionMapper {
  constructor() {
    privates.set(
      this,
      {
        knex: Registry.knex(),
        tagsGateway: new TagsGateway()
      }
    );
  }

  async findById(id) {
    const { knex } = privates.get(this);

    const collectionRecord = await knex('collections')
      .first()
      .where({ id });

    return collectionRecord
      ? collectionRecordToCollectionObject(knex, collectionRecord)
      : undefined;
  }

  async findByNameAndVersion(name, version) {
    const { knex } = privates.get(this);

    const collectionRecord = await knex('collections')
      .first()
      .where({ name, version });

    return collectionRecord
      ? collectionRecordToCollectionObject(knex, collectionRecord)
      : undefined;
  }

  async insert(collection) {
    const { knex, tagsGateway } = privates.get(this);

    const collectionRecord = collectionObjectToCollectionRecord(collection);

    // if (collection.createdAt) {
    //   collectionRecord.created_at = timestampToMySqlDateTime(collection.createdAt);
    // }

    // if (collection.updatedAt) {
    //   collectionRecord.updated_at = timestampToMySqlDateTime(collection.updatedAt);
    // }

    const [collectionId] = await knex('collections').insert(collectionRecord);

    await insertCollectionFiles(knex, collectionId, collection.files);

    await addTags(tagsGateway, collectionId, collection.tags);

    return collectionId;
  }

  async update(collection) {}

  async delete(collection) {
    const { knex, tagsGateway } = privates.get(this);

    const getCollectionIdResponse = await knex('collections')
      .first('id')
      .where({ name: collection.name, version: collection.version });

    if (!getCollectionIdResponse) return;

    const collectionId = getCollectionIdResponse.id;

    await Promise.all([
      tagsGateway.deleteTagsForCollection(collectionId),
      deleteCollectionFiles(knex, collectionId)
    ]);

    await knex('collections')
      .where({ name: collection.name, version: collection.version })
      .del();
  }
}
module.exports = CollectionMapper;
