'use strict';

const test = require('ava');
const {
  createS3Bucket,
  putS3Object,
  recursivelyDeleteS3Bucket
} = require('@cumulus/common/aws');
const { randomString } = require('@cumulus/common/test-utils');
const sinon = require('sinon');
const { fakeCollectionFactory, fakeProviderFactory } = require('../../lib/testUtils.js');
const { fakeRuleFactoryV2 } = require('../../lib/testUtils');
const { Collection, Provider, Rule } = require('../../models');
const { AssociatedRulesError } = require('../../lib/errors');
const { RecordDoesNotExist } = require('../../lib/errors');
const providersGateway = require('../../db/providers-gateway');
const knex = require('../../db/knex');

const suiteContext = {};

test.before(async () => {
  suiteContext.db = knex();

  suiteContext.collectionsModel = new Collection();
  suiteContext.rulesModel = new Rule();

  process.env.bucket = randomString();
  process.env.internal = process.env.bucket;
  await createS3Bucket({ Bucket: process.env.bucket });

  process.env.stackName = randomString();
});

test.beforeEach(async (t) => {
  t.context.providersModel = new Provider();
  t.context.provider = fakeProviderFactory();
});

test.after.always(async () => {
  await suiteContext.rulesModel.deleteTable();
  await recursivelyDeleteS3Bucket(process.env.bucket);
});

test('get() returns a translated row', async (t) => {
  const { provider, providersModel } = t.context;

  await providersModel.create({
    ...provider,
    globalConnectionLimit: 10
  });

  const actual = (await providersModel.get({ id: provider.id }));

  t.is(actual.id, provider.id);
  t.is(actual.globalConnectionLimit, 10);
});

test('get() throws an exception if no record is found', async (t) => {
  const { providersModel } = t.context;

  const id = t.context.provider.id;
  let actual;
  try {
    await providersModel.get({ id });
  }
  catch (error) {
    actual = error;
  }
  t.truthy(actual instanceof RecordDoesNotExist);
});

test('exists() returns true when a record exists', async (t) => {
  const { providersModel } = t.context;

  await providersModel.create(t.context.provider);

  t.true(await providersModel.exists(t.context.provider.id));
});

test('exists() returns false when a record does not exist', async (t) => {
  const { providersModel } = t.context;

  t.false(await providersModel.exists(randomString()));
});

test('delete() throws an exception if the provider has associated rules', async (t) => {
  const {
    collectionsModel,
    rulesModel
  } = suiteContext;

  const { provider, providersModel } = t.context;

  const collection = fakeCollectionFactory();
  await collectionsModel.create(collection);

  await providersModel.create(provider);

  const rule = fakeRuleFactoryV2({
    collection: {
      name: collection.name,
      version: collection.version
    },
    provider: provider.id,
    rule: {
      type: 'onetime'
    }
  });

  // The workflow message template must exist in S3 before the rule can be created
  await putS3Object({
    Bucket: process.env.bucket,
    Key: `${process.env.stackName}/workflows/${rule.workflow}.json`,
    Body: JSON.stringify({})
  });

  await rulesModel.create(rule);

  try {
    await providersModel.delete({ id: provider.id });
    t.fail('Expected an exception to be thrown');
  }
  catch (err) {
    t.true(err instanceof AssociatedRulesError);
    t.is(err.message, 'Cannot delete a provider that has associated rules');
    t.deepEqual(err.rules, [rule.name]);
  }
});

test('delete() deletes a provider', async (t) => {
  const { providersModel } = t.context;

  const id = t.context.provider.id;

  await providersModel.create(t.context.provider);

  await providersModel.delete({ id });

  t.false(await providersModel.exists({ id }));
});

test('create() inserts a translated provider', async (t) => {
  const { db } = suiteContext;
  const { provider, providersModel } = t.context;

  const encryptStub = sinon.stub(providersModel, 'encrypt');
  encryptStub.returns(Promise.resolve('encryptedValue'));

  const updateValues = {
    globalConnectionLimit: 10,
    username: 'foo',
    password: 'bar'
  };
  Object.assign(provider, updateValues);

  await providersModel.create(provider);

  const actual = { ...(await providersGateway.findById(db, provider.id)) };

  const expected = {
    id: provider.id,
    global_connection_limit: 10,
    protocol: provider.protocol,
    host: provider.host,
    created_at: actual.created_at,
    updated_at: actual.updated_at,
    meta: null,
    password: 'encryptedValue',
    port: provider.port,
    username: 'encryptedValue',
    encrypted: true
  };

  t.deepEqual(actual, expected);
});

test('update() updates a record', async (t) => {
  const { providersModel } = t.context;

  const id = t.context.provider.id;

  const updateRecord = { host: 'test_host' };

  await providersModel.create(t.context.provider);
  await providersModel.update({ id }, updateRecord);

  const actual = (await providersModel.get({ id }));
  t.is('test_host', actual.host);
});
