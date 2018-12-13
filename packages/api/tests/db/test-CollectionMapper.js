'use strict';

const test = require('ava');
const { randomString } = require('@cumulus/common/test-utils');

const { fakeCollectionFactory } = require('../../lib/testUtils');
const CollectionMapper = require('../../db/CollectionMapper');
const Registry = require('../../lib/Registry');
const TagsGateway = require('../../db/TagsGateway');

const suiteContext = {};
test.before(async () => {
  suiteContext.knex = Registry.knex();
  suiteContext.tagsGateway = new TagsGateway();
});

test.beforeEach(async (t) => {
  t.context.collectionMapper = new CollectionMapper();

  t.context.collection = {
    name: randomString(),
    version: randomString(),
    dataType: randomString(),
    process: randomString(),
    providerPath: randomString(),
    urlPath: randomString(),
    duplicateHandling: 'skip',
    granuleIdValidationRegex: randomString(),
    granuleIdExtractionRegex: randomString(),
    sampleFileName: randomString(),
    files: [
      {
        regex: randomString(),
        sampleFileName: randomString(),
        bucket: randomString(),
        urlPath: randomString()
      }
    ],
    meta: {
      foo: 'bar'
    },
    tags: [
      randomString(),
      randomString()
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
});

test('findByNameAndVersion() returns a Collection object if the collection exists', async (t) => {
  const { collection, collectionMapper } = t.context;

  collection.id = await collectionMapper.insert(collection);

  const actualCollection = await collectionMapper.findByNameAndVersion(collection.name, collection.version);

  const expectedTags = collection.tags.sort();
  const actualTags = actualCollection.tags.sort();

  delete collection.tags;
  delete actualCollection.tags;

  t.deepEqual(actualTags, expectedTags);

  t.deepEqual(actualCollection, collection);
});

test('findByNameAndVersion() returns undefined if the collection does not exist', async (t) => {
  const { collection, collectionMapper } = t.context;

  await collectionMapper.insert(collection);

  await collectionMapper.delete(collection);

  const fetchedCollection = await collectionMapper.findByNameAndVersion(collection.name, collection.version);

  t.is(fetchedCollection, undefined);
});

test('findById() returns a Collection object if the collection exists', async (t) => {
  const { collection, collectionMapper } = t.context;

  const collectionId = await collectionMapper.insert(collection);

  collection.id = collectionId;

  const actualCollection = await collectionMapper.findById(collectionId);

  const expectedTags = collection.tags.sort();
  const actualTags = actualCollection.tags.sort();

  delete collection.tags;
  delete actualCollection.tags;

  t.deepEqual(actualTags, expectedTags);

  t.deepEqual(actualCollection, collection);
});

test('findById() returns undefined if the collection does not exist', async (t) => {
  const { collection, collectionMapper } = t.context;

  const collectionId = await collectionMapper.insert(collection);

  await collectionMapper.delete(collection);

  const fetchedCollection = await collectionMapper.findById(collectionId);

  t.is(fetchedCollection, undefined);
});

test('insert() stores the collection to the database', async (t) => {
  const { knex } = suiteContext;
  const { collection, collectionMapper } = t.context;

  const collectionId = await collectionMapper.insert(collection);

  const collectionRecord = await knex('collections')
    .first()
    .where({ id: collectionId });

  t.truthy(collectionRecord);

  t.is(collectionRecord.created_at, collection.createdAt);
  t.is(collectionRecord.data_type, collection.dataType);
  t.is(collectionRecord.duplicate_handling, collection.duplicateHandling);
  t.is(collectionRecord.granule_id_extraction_regex, collection.granuleIdExtractionRegex);
  t.is(collectionRecord.granule_id_validation_regex, collection.granuleIdValidationRegex);
  t.deepEqual(JSON.parse(collectionRecord.meta), collection.meta);
  t.is(collectionRecord.name, collection.name);
  t.is(collectionRecord.process, collection.process);
  t.is(collectionRecord.provider_path, collection.providerPath);
  t.is(collectionRecord.sample_file_name, collection.sampleFileName);
  t.is(collectionRecord.updated_at, collection.updatedAt);
  t.is(collectionRecord.url_path, collection.urlPath);
  t.is(collectionRecord.version, collection.version);
});

test('insert() stores the collection_file_definitions to the database', async (t) => {
  const { knex } = suiteContext;
  const { collection, collectionMapper } = t.context;

  const collectionId = await collectionMapper.insert(collection);

  const fileRecord = await knex('collection_file_definitions')
    .first()
    .where({ collection_id: collectionId });

  t.truthy(fileRecord);
  t.is(fileRecord.regex, collection.files[0].regex);
});

test('insert() stores the tags to the database', async (t) => {
  const { tagsGateway } = suiteContext;
  const { collection, collectionMapper } = t.context;

  const collectionId = await collectionMapper.insert(collection);

  const actualTagNames = await tagsGateway.getTagsForCollection(collectionId);

  t.deepEqual(actualTagNames.sort(), collection.tags.sort());
});

test('delete() removes a collection from the database', async (t) => {
  const { knex } = suiteContext;
  const { collection, collectionMapper } = t.context;

  const collectionId = await collectionMapper.insert(collection);

  const [{ count: countBefore }] = await knex('collections')
    .count({ count: 'id' })
    .where({ id: collectionId });

  t.is(countBefore, 1);

  await collectionMapper.delete(collection);

  const [{ count: countAfter }] = await knex('collections')
    .count({ count: 'id' })
    .where({ id: collectionId });

  t.is(countAfter, 0);
});
