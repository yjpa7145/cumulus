'use strict';

const { CollectionConfigStore } = require('@cumulus/common');

const { AssociatedRulesError, RecordDoesNotExist } = require('../lib/errors');
const Model = require('./Model');
const knex = require('../db/knex');

const collectionsGateway = require('../db/collections-gateway');
const rulesGateway = require('../db/rules-gateway');
const tagsGateway = require('../db/tags-gateway');

function collectionModelToRecord(collectionModel) {
  const collectionRecord = {
    data_type: collectionModel.dataType,
    granule_id_extraction_regex: collectionModel.granuleIdExtraction,
    granule_id_validation_regex: collectionModel.granuleId,
    name: collectionModel.name,
    process: collectionModel.process,
    provider_path: collectionModel.provider_path,
    sample_file_name: collectionModel.sampleFileName,
    url_path: collectionModel.url_path,
    version: collectionModel.version,
    duplicate_handling: collectionModel.duplicateHandling,
    created_at: collectionModel.createdAt,
    updated_at: collectionModel.updatedAt
  };

  if (collectionModel.meta) {
    collectionRecord.meta = JSON.stringify(collectionModel.meta);
  }

  return collectionRecord;
}

function buildCollectionModel(collectionRecord, fileDefinitionModels, tags) {
  const collectionModel = {
    tags,
    name: collectionRecord.name,
    version: collectionRecord.version,
    dataType: collectionRecord.data_type,
    process: collectionRecord.process,
    provider_path: collectionRecord.provider_path,
    url_path: collectionRecord.url_path,
    duplicateHandling: collectionRecord.duplciate_handling,
    granuleId: collectionRecord.granule_id_validation_regex,
    granuleIdExtraction: collectionRecord.granule_id_extraction_regex,
    sampleFileName: collectionRecord.sample_file_name,
    files: fileDefinitionModels,
    createdAt: collectionRecord.created_at,
    updatedAt: collectionRecord.updated_at
  };

  if (collectionRecord.meta) {
    collectionModel.meta = JSON.parse(collectionRecord.meta);
  }

  return collectionModel;
}

function fileDefinitionRecordToModel(record) {
  return {
    regex: record.regex,
    sampleFileName: record.sample_file_name,
    bucket: record.bucket,
    url_path: record.url_path
  };
}

function buildFileDefinitionRecords(collectionId, collectionModel) {
  const files = collectionModel.files || [];

  return files.map((file) => ({
    collection_id: collectionId,
    regex: file.regex,
    sample_file_name: file.sampleFileName,
    bucket: file.bucket,
    url_path: file.url_path
  }));
}

function insertCollectionModel(db, collectionModel) {
  return db.transaction(async (trx) => {
    const collectionRecord = collectionModelToRecord(collectionModel);

    const collectionId = await collectionsGateway.insert(trx, collectionRecord);

    const fileDefinitionRecords = buildFileDefinitionRecords(
      collectionId,
      collectionModel
    );

    await collectionsGateway.setFileDefinitions(
      trx,
      collectionId,
      fileDefinitionRecords
    );

    await tagsGateway.setCollectionTags(db, collectionId, collectionModel.tags);

    return collectionId;
  });
}

async function updateCollectionModel(db, collectionModel) {
  const { id: collectionId } = await collectionsGateway.findByNameAndVersion(
    db,
    collectionModel.name,
    collectionModel.version
  );

  return db.transaction(async (trx) => {
    await tagsGateway.setCollectionTags(trx, collectionId, collectionModel.tags);

    const fileRecords = buildFileDefinitionRecords(
      collectionId,
      collectionModel
    );
    await collectionsGateway.setFileDefinitions(trx, collectionId, fileRecords);

    const updates = collectionModelToRecord(collectionModel);
    await collectionsGateway.update(trx, collectionId, updates);
  });
}

function buildCollectionConfigStore() {
  return new CollectionConfigStore(
    process.env.internal,
    process.env.stackName
  );
}

function storeCollectionConfig(collectionModel) {
  const dataType = collectionModel.dataType || collectionModel.name;

  const collectionConfigStore = buildCollectionConfigStore();

  return collectionConfigStore.put(
    dataType,
    collectionModel.version,
    collectionModel
  );
}

const privates = new WeakMap();

class Collection extends Model {
  constructor() {
    super();

    privates.set(this, { db: knex() });
  }

  async get({ name, version }) {
    const { db } = privates.get(this);

    const collectionRecord = await collectionsGateway.findByNameAndVersion(
      db,
      name,
      version
    );

    if (collectionRecord === undefined) throw new RecordDoesNotExist();

    const fileDefinitionRecords = await collectionsGateway.getFileDefinitions(
      db,
      collectionRecord.id
    );
    const fileDefinitionModels = fileDefinitionRecords.map(fileDefinitionRecordToModel);

    const tags = await tagsGateway.getCollectionTags(db, collectionRecord.id);

    return buildCollectionModel(collectionRecord, fileDefinitionModels, tags);
  }

  async exists(name, version) {
    const { db } = privates.get(this);

    const collectionRecord = await collectionsGateway.findByNameAndVersion(
      db,
      name,
      version
    );

    return collectionRecord !== undefined;
  }

  async create(item) {
    const { db } = privates.get(this);

    await storeCollectionConfig(item);

    await insertCollectionModel(db, item);

    return this.get({ name: item.name, version: item.version });
  }

  async update({ name, version }, updates = {}, fieldsToDelete = []) {
    const { db } = privates.get(this);

    const deletions = {};
    fieldsToDelete.forEach((f) => {
      deletions[f] = null;
    });

    const updatedModel = {
      ...updates,
      ...deletions,
      name: name,
      version: version
    };

    await updateCollectionModel(db, updatedModel);

    return this.get({ name, version });
  }

  // TODO This is not deleting the config from the collection config store
  async delete({ name, version }) {
    const { db } = privates.get(this);

    const {
      id: collectionId
    } = await collectionsGateway.findByNameAndVersion(db, name, version);

    const rules = await rulesGateway.findByCollectionId(db, collectionId);

    if (rules.length > 0) {
      throw new AssociatedRulesError(
        'Cannot delete a collection that has associated rules',
        rules.map((r) => r.name)
      );
    }

    return db.transaction(async (trx) => {
      await tagsGateway.deleteCollectionTags(trx, collectionId);
      await collectionsGateway.deleteFileDefinitions(trx, collectionId);
      await collectionsGateway.delete(trx, collectionId);
    });
  }
}
module.exports = Collection;
