'use strict';

const get = require('lodash.get');
const sinon = require('sinon');
const test = require('ava');

const { randomString } = require('@cumulus/common/test-utils');
const { SQS } = require('@cumulus/ingest/aws');
const { s3, recursivelyDeleteS3Bucket, sns } = require('@cumulus/common/aws');
const { getRules, handler } = require('../../lambdas/message-consumer');
const Collection = require('../../models/collections');
const Rule = require('../../models/rules');
const Provider = require('../../models/providers');
const {
  fakeCollectionFactory,
  fakeProviderFactory,
  fakeRuleFactoryV2
} = require('../../lib/testUtils');
const testCollectionName = 'test-collection';
const snsClient = sns();

const eventData = JSON.stringify({
  collection: testCollectionName
});

const validRecord = {
  kinesis: {
    data: Buffer.from(eventData).toString('base64')
  }
};

const event = {
  Records: [validRecord, validRecord]
};

let sfSchedulerSpy;
const stubQueueUrl = 'stubQueueUrl';

/**
 * translates a kinesis event object into an object that an SNS event will
 * redeliver to the fallback handler.
 *
 * @param {Object} record - kinesis record object.
 * @returns {Object} - object representing an SNS event.
 */
function wrapKinesisRecord(record) {
  return {
    Records: [{
      EventSource: 'aws:sns',
      Sns: {
        Message: JSON.stringify(record)
      }
    }]
  };
}

/**
 * Callback used for testing
 *
 * @param {*} err - error
 * @param {Object} object - object
 * @returns {Object} object, if no error is thrown
 */
function testCallback(err, object) {
  if (err) throw err;
  return object;
}

const suiteContext = {};
test.before(async () => {
  process.env.CollectionsTable = randomString();
  process.env.ProvidersTable = randomString();
  process.env.messageConsumer = 'my-messageConsumer';
  process.env.KinesisInboundEventLogger = 'my-ruleInput';

  process.env.RulesTable = randomString();
  suiteContext.ruleModel = new Rule();
  await suiteContext.ruleModel.createTable();

  suiteContext.collectionModel = new Collection();
  suiteContext.providerModel = new Provider();
});

test.beforeEach(async (t) => {
  const {
    collectionModel,
    providerModel,
    ruleModel
  } = suiteContext;

  t.context.collection = fakeCollectionFactory();
  process.env.internal = randomString();
  await s3().createBucket({ Bucket: process.env.internal }).promise();
  await collectionModel.create(t.context.collection);

  t.context.provider = fakeProviderFactory();
  await providerModel.create(t.context.provider);

  sfSchedulerSpy = sinon.stub(SQS, 'sendMessage').returns(true);
  t.context.publishResponse = {
    ResponseMetadata: { RequestId: randomString() },
    MessageId: randomString()
  };

  t.context.publishStub = sinon.stub(snsClient, 'publish')
    .returns({
      promise: () => Promise.resolve(t.context.publishResponse)
    });

  t.context.templateBucket = randomString();
  t.context.stateMachineArn = randomString();
  const messageTemplateKey = `${randomString()}/template.json`;

  t.context.messageTemplateKey = messageTemplateKey;
  t.context.messageTemplate = {
    cumulus_meta: {
      state_machine: t.context.stateMachineArn
    },
    meta: { queues: { startSF: stubQueueUrl } }
  };

  await s3().createBucket({ Bucket: t.context.templateBucket }).promise();
  await s3().putObject({
    Bucket: t.context.templateBucket,
    Key: messageTemplateKey,
    Body: JSON.stringify(t.context.messageTemplate)
  }).promise();

  sinon.stub(Rule, 'buildPayload').callsFake((item) => Promise.resolve({
    template: `s3://${t.context.templateBucket}/${messageTemplateKey}`,
    provider: item.provider,
    collection: item.collection,
    meta: get(item, 'meta', {}),
    payload: get(item, 'payload', {})
  }));
  sinon.stub(Provider.prototype, 'get').returns(t.context.provider);
  sinon.stub(Collection.prototype, 'get').returns(t.context.collection);

  t.context.tableName = process.env.RulesTable;
  process.env.stackName = randomString();
  process.env.bucket = randomString();
  process.env.messageConsumer = randomString();

  const rulesToCreate = [];

  const commonRuleParams = {
    collection: t.context.collection,
    provider: t.context.provider.id
  };

  const kinesisRuleParams = {
    rule: {
      type: 'kinesis',
      value: 'test-kinesisarn'
    }
  };

  const allRuleTypesParams = [kinesisRuleParams];

  const rule1Params = fakeRuleFactoryV2({
    ...commonRuleParams,
    workflow: 'test-workflow-1',
    state: 'ENABLED'
  });

  // if the state is not provided, it will be set to default value 'ENABLED'
  const rule2Params = fakeRuleFactoryV2({
    ...commonRuleParams,
    workflow: 'test-workflow-2'
  });

  const disabledRuleParams = fakeRuleFactoryV2({
    ...commonRuleParams,
    workflow: 'test-workflow-1',
    state: 'DISABLED'
  });

  const allOtherRulesParams = [rule1Params, rule2Params, disabledRuleParams];

  allRuleTypesParams.forEach((ruleTypeParams) => {
    allOtherRulesParams.forEach((otherRulesParams) => {
      const ruleParams = Object.assign({}, commonRuleParams, ruleTypeParams, otherRulesParams);
      rulesToCreate.push(ruleParams);
    });
  });

  await Promise.all(rulesToCreate.map((rule) => ruleModel.create(rule)));
});

test.afterEach.always(async (t) => {
  await recursivelyDeleteS3Bucket(t.context.templateBucket);
  sfSchedulerSpy.restore();
  t.context.publishStub.restore();
  Rule.buildPayload.restore();
  Provider.prototype.get.restore();
  Collection.prototype.get.restore();
});

test.after.always(async () => {
  const { ruleModel } = suiteContext;

  await ruleModel.deleteTable();
});

// getKinesisRule tests
test.serial.skip('it should look up kinesis-type rules which are associated with the collection, but not those that are disabled', async (t) => {
  await getRules(testCollectionName, 'kinesis')
    .then((result) => {
      t.is(result.length, 2);
    });
});

// handler tests
test.serial.skip('it should enqueue a message for each associated workflow', async (t) => {
  const { collection, provider } = t.context;

  await handler(event, {}, testCallback);
  const actualQueueUrl = sfSchedulerSpy.getCall(0).args[0];
  t.is(actualQueueUrl, stubQueueUrl);
  const actualMessage = sfSchedulerSpy.getCall(0).args[1];
  const expectedMessage = {
    cumulus_meta: {
      state_machine: t.context.stateMachineArn
    },
    meta: {
      queues: { startSF: stubQueueUrl },
      provider,
      collection
    },
    payload: {
      collection: testCollectionName
    }
  };
  t.is(actualMessage.cumulus_meta.state_machine, expectedMessage.cumulus_meta.state_machine);
  t.deepEqual(actualMessage.meta, expectedMessage.meta);
  t.deepEqual(actualMessage.payload, expectedMessage.payload);
});

test.serial('A kinesis message, should publish the invalid record to fallbackSNS if message does not include a collection', async (t) => {
  const { publishStub } = t.context;

  const invalidMessage = JSON.stringify({ noCollection: 'in here' });
  const invalidRecord = { kinesis: { data: Buffer.from(invalidMessage).toString('base64') } };
  const kinesisEvent = {
    Records: [validRecord, invalidRecord]
  };
  await handler(kinesisEvent, {}, testCallback);
  const callArgs = publishStub.getCall(0).args;
  t.deepEqual(invalidRecord, JSON.parse(callArgs[0].Message));
  t.true(publishStub.calledOnce);
});

test.serial('An SNS fallback retry, should throw an error if message does not include a collection', async (t) => {
  const invalidMessage = JSON.stringify({});
  const kinesisEvent = {
    Records: [{ kinesis: { data: Buffer.from(invalidMessage).toString('base64') } }]
  };
  const snsEvent = wrapKinesisRecord(kinesisEvent.Records[0]);
  try {
    await handler(snsEvent, {}, testCallback);
    t.fail('testCallback should have thrown an error');
  }
  catch (error) {
    console.log(error);
    t.pass('Callback called with error');
    t.is(error.message, 'validation failed');
    t.is(error.errors[0].message, 'should have required property \'collection\'');
  }
});

test.serial('A kinesis message, should publish the invalid records to fallbackSNS if the message collection has wrong data type', async (t) => {
  const { publishStub } = t.context;

  const invalidMessage = JSON.stringify({ collection: {} });
  const invalidRecord = { kinesis: { data: Buffer.from(invalidMessage).toString('base64') } };
  const kinesisEvent = { Records: [invalidRecord] };

  await handler(kinesisEvent, {}, testCallback);

  const callArgs = publishStub.getCall(0).args;
  t.deepEqual(invalidRecord, JSON.parse(callArgs[0].Message));
  t.true(publishStub.calledOnce);
});

test.serial('An SNS Fallback retry, should throw an error if message collection has wrong data type', async (t) => {
  const invalidMessage = JSON.stringify({ collection: {} });
  const kinesisEvent = {
    Records: [{ kinesis: { data: Buffer.from(invalidMessage).toString('base64') } }]
  };
  const snsEvent = wrapKinesisRecord(kinesisEvent.Records[0]);
  try {
    await handler(snsEvent, {}, testCallback);
    t.fail('testCallback should have thrown an error');
  }
  catch (error) {
    t.is(error.message, 'validation failed');
    t.is(error.errors[0].dataPath, '.collection');
    t.is(error.errors[0].message, 'should be string');
  }
});

test.serial.skip('A kinesis message, should publish the invalid record to fallbackSNS if message is invalid json', async (t) => {
  const { publishStub } = t.context;

  const invalidMessage = '{';
  const invalidRecord = { kinesis: { data: Buffer.from(invalidMessage).toString('base64') } };
  const kinesisEvent = { Records: [invalidRecord] };

  await handler(kinesisEvent, {}, testCallback);

  t.true(publishStub.calledOnce);

  const callArgs = publishStub.getCall(0).args;
  t.deepEqual(invalidRecord, JSON.parse(callArgs[0].Message));
});

test.serial('An SNS Fallback retry, should throw an error if message is invalid json', async (t) => {
  const invalidMessage = '{';
  const kinesisEvent = {
    Records: [{ kinesis: { data: Buffer.from(invalidMessage).toString('base64') } }]
  };
  const snsEvent = wrapKinesisRecord(kinesisEvent.Records[0]);
  try {
    await handler(snsEvent, {}, testCallback);
  }
  catch (error) {
    t.is(error.message, 'Unexpected end of JSON input');
  }
});

test.serial.skip('A kinesis message should not publish record to fallbackSNS if it processes.', (t) => {
  const { publishStub } = t.context;

  const validMessage = JSON.stringify({ collection: 'confection-collection' });
  const kinesisEvent = {
    Records: [{ kinesis: { data: Buffer.from(validMessage).toString('base64') } }]
  };
  t.true(publishStub.notCalled);
  return handler(kinesisEvent, {}, testCallback).then((r) => t.deepEqual(r, [[]]));
});

test.serial.skip('An SNS Fallback message should not throw if message is valid.', (t) => {
  const validMessage = JSON.stringify({ collection: 'confection-collection' });
  const kinesisEvent = {
    Records: [{ kinesis: { data: Buffer.from(validMessage).toString('base64') } }]
  };
  const snsEvent = wrapKinesisRecord(kinesisEvent.Records[0]);
  return handler(snsEvent, {}, testCallback).then((r) => t.deepEqual(r, [[]]));
});
