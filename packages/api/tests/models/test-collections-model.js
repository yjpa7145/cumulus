'use strict';

const test = require('ava');
const { recursivelyDeleteS3Bucket, s3 } = require('@cumulus/common/aws');
const { randomString } = require('@cumulus/common/test-utils');

const knex = require('../../db/knex');

const { fakeCollectionFactory, fakeRuleFactoryV2 } = require('../../lib/testUtils');
const { AssociatedRulesError } = require('../../lib/errors');
const { Collection, Rule } = require('../../models');

const suiteContext = {};
test.before(async () => {
  suiteContext.db = knex();

  process.env.stackName = randomString();

  suiteContext.systemBucket = randomString();
  process.env.bucket = suiteContext.systemBucket;
  process.env.internal = suiteContext.systemBucket;
  await s3().createBucket({ Bucket: suiteContext.systemBucket }).promise();
});

test.beforeEach(async (t) => {
  t.context = {
    collectionsModel: new Collection(),
    rulesModel: new Rule(),
    collectionsToDelete: [],
    rulesToDelete: []
  };
});

test.afterEach.always(async (t) => {
  const {
    collectionsToDelete,
    collectionsModel,
    rulesModel,
    rulesToDelete
  } = t.context;

  const deleteRule = (r) => rulesModel.delete(r);
  await Promise.all(rulesToDelete.map(deleteRule));

  const deleteCollection = (c) => collectionsModel.delete(c);
  await Promise.all(collectionsToDelete.map(deleteCollection));
});

test.after.always(async () => {
  await recursivelyDeleteS3Bucket(suiteContext.systemBucket);
});

test('Collection.exists() returns true when a record exists', async (t) => {
  const {
    collectionsModel,
    collectionsToDelete
  } = t.context;

  const collection = fakeCollectionFactory();

  await collectionsModel.create(collection);

  collectionsToDelete.push({
    name: collection.name,
    version: collection.version
  });

  const collectionExists = collectionsModel.exists(
    collection.name,
    collection.version
  );

  t.true(await collectionExists);
});

test('Collection.exists() returns false when a record does not exist', async (t) => {
  const { collectionsModel } = t.context;

  const collectionExists = collectionsModel.exists(randomString(), randomString());

  t.false(await collectionExists);
});

test('Collection.delete() throws an exception if the collection has associated rules', async (t) => {
  const { systemBucket } = suiteContext;

  const {
    collectionsModel,
    collectionsToDelete,
    rulesModel,
    rulesToDelete
  } = t.context;

  const collection = fakeCollectionFactory();

  await collectionsModel.create(collection);

  collectionsToDelete.push({
    name: collection.name,
    version: collection.version
  });

  const rule = fakeRuleFactoryV2({
    collection: {
      name: collection.name,
      version: collection.version
    },
    provider: undefined
  });

  // The workflow message template must exist in S3 before the rule can be created
  await s3().putObject({
    Bucket: systemBucket,
    Key: `${process.env.stackName}/workflows/${rule.workflow}.json`,
    Body: JSON.stringify({})
  }).promise();

  const createdRule = await rulesModel.create(rule);
  rulesToDelete.push(createdRule);

  try {
    await collectionsModel.delete({
      name: collection.name,
      version: collection.version
    });

    t.fail('Expected an exception to be thrown');
  }
  catch (err) {
    t.true(err instanceof AssociatedRulesError);
    t.is(err.message, 'Cannot delete a collection that has associated rules');
    t.deepEqual(err.rules, [rule.name]);
  }
});

test('Collection.delete() deletes a collection', async (t) => {
  const { collectionsModel } = t.context;

  const collection = fakeCollectionFactory();

  await collectionsModel.create(collection);

  t.true(await collectionsModel.exists(collection.name, collection.version));

  await collectionsModel.delete(collection);

  t.false(await collectionsModel.exists(collection.name, collection.version));
});
