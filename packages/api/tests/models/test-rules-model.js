'use strict';

const test = require('ava');
const aws = require('@cumulus/common/aws');
const { randomString } = require('@cumulus/common/test-utils');
const models = require('../../models');

const {
  fakeCollectionFactory,
  fakeProviderFactory
} = require('../../lib/testUtils');
const { Provider } = require('../../models');

process.env.RulesTable = `RulesTable_${randomString()}`;
process.env.stackName = 'my-stackName';
process.env.bucket = randomString();
process.env.internal = process.env.bucket;

const workflow = 'my-workflow';
const workflowfile = `${process.env.stackName}/workflows/${workflow}.json`;

async function getKinesisEventMappings() {
  const eventLambdas = [process.env.messageConsumer, process.env.KinesisInboundEventLogger];

  const mappingPromises = eventLambdas.map((lambda) => {
    const mappingParams = { FunctionName: lambda };
    return aws.lambda().listEventSourceMappings(mappingParams).promise();
  });
  return Promise.all(mappingPromises);
}

const suiteContext = {};

test.before(async () => {
  // create Rules table
  suiteContext.rulesModel = new models.Rule();
  await suiteContext.rulesModel.createTable();

  await aws.createS3Bucket({ Bucket: process.env.bucket });

  await aws.putS3Object({
    Bucket: process.env.bucket,
    Key: workflowfile,
    Body: 'test data'
  });

  suiteContext.provider = fakeProviderFactory();
  suiteContext.providersModel = new Provider();
  await suiteContext.providersModel.create(suiteContext.provider);

  suiteContext.collectionsModel = new models.Collection();

  suiteContext.collection = fakeCollectionFactory();
  await suiteContext.collectionsModel.create(suiteContext.collection);
});

test.beforeEach(async (t) => {
  const { collection, provider } = suiteContext;

  process.env.messageConsumer = randomString();
  process.env.KinesisInboundEventLogger = randomString();

  t.context.kinesisRule = {
    name: randomString(),
    workflow: 'my-workflow',
    provider: provider.id,
    collection: {
      name: collection.name,
      version: collection.version
    },
    rule: {
      type: 'kinesis',
      value: 'my-kinesis-arn'
    },
    state: 'DISABLED'
  };

  t.context.onetimeRule = {
    name: randomString(),
    workflow: 'my-workflow',
    provider: provider.id,
    collection: {
      name: collection.name,
      version: collection.version
    },
    rule: {
      type: 'onetime'
    },
    state: 'ENABLED'
  };
});

test.after.always(async () => {
  const { rulesModel } = suiteContext;

  // cleanup table
  await rulesModel.deleteTable();
  await aws.recursivelyDeleteS3Bucket(process.env.bucket);
});

test.serial('create and delete a onetime rule', async (t) => {
  const { rulesModel } = suiteContext;
  const { onetimeRule } = t.context;

  // create rule
  return rulesModel.create(onetimeRule)
    .then((rule) => {
      t.is(rule.name, onetimeRule.name);
      // delete rule
      rulesModel.delete(rule);
    })
    .then(() => undefined);
});

test.serial('create a kinesis type rule adds event mappings, creates rule', async (t) => {
  const { kinesisRule } = t.context;

  // create rule
  const rules = new models.Rule();
  const createdRule = await rules.create(kinesisRule);

  const kinesisEventMappings = await getKinesisEventMappings();
  const consumerEventMappings = kinesisEventMappings[0].EventSourceMappings;
  const logEventMappings = kinesisEventMappings[1].EventSourceMappings;

  t.is(consumerEventMappings.length, 1);
  t.is(logEventMappings.length, 1);
  t.is(consumerEventMappings[0].UUID, createdRule.rule.arn);
  t.is(logEventMappings[0].UUID, createdRule.rule.logEventArn);

  t.is(createdRule.name, kinesisRule.name);
  t.is(createdRule.rule.value, kinesisRule.rule.value);
  t.false(createdRule.rule.arn === undefined);
  t.false(createdRule.rule.logEventArn === undefined);

  // clean up
  await rules.delete(createdRule);
});

test.serial('deleting a kinesis style rule removes event mappings', async (t) => {
  const { kinesisRule } = t.context;

  // create and delete rule
  const rules = new models.Rule();

  const createdRule = await rules.create(kinesisRule);
  await rules.delete(createdRule);

  const kinesisEventMappings = await getKinesisEventMappings();

  const consumerEventMappings = kinesisEventMappings[0].EventSourceMappings;
  const logEventMappings = kinesisEventMappings[1].EventSourceMappings;

  t.is(consumerEventMappings.length, 0);
  t.is(logEventMappings.length, 0);
});

test.serial('update a kinesis type rule state, arn does not change', async (t) => {
  const { kinesisRule } = t.context;

  // create rule
  const rules = new models.Rule();
  await rules.create(kinesisRule);
  const rule = await rules.get({ name: kinesisRule.name });
  // update rule state
  const updated = { name: rule.name, state: 'ENABLED' };
  // deep copy rule
  const newRule = Object.assign({}, rule);
  newRule.rule = Object.assign({}, rule.rule);
  await rules.update(newRule, updated);
  t.true(newRule.state === 'ENABLED');
  //arn doesn't change
  t.is(newRule.rule.arn, rule.rule.arn);
  t.is(newRule.rule.logEventArn, rule.rule.logEventArn);

  // clean up
  await rules.delete(rule);
});

test.serial('update a kinesis type rule value, resulting in new arn', async (t) => {
  const { kinesisRule } = t.context;

  // create rule
  const rules = new models.Rule();
  await rules.create(kinesisRule);
  const rule = await rules.get({ name: kinesisRule.name });

  // update rule value
  const updated = {
    name: rule.name,
    rule: { type: rule.rule.type, value: 'my-new-kinesis-arn' }
  };
  // deep copy rule
  const newRule = Object.assign({}, rule);
  newRule.rule = Object.assign({}, rule.rule);
  await rules.update(newRule, updated);

  t.is(newRule.name, rule.name);
  t.not(newRule.rule.value, rule.rule.value);
  t.not(newRule.rule.arn, rule.rule.arn);
  t.not(newRule.rule.logEventArn, rule.rule.logEventArn);

  await rules.delete(rule);
});

test.serial('create a kinesis type rule, using the existing event source mappings', async (t) => {
  const { kinesisRule } = t.context;

  // create two rules with same value
  const rules = new models.Rule();
  const newKinesisRule = Object.assign({}, kinesisRule);
  newKinesisRule.rule = Object.assign({}, kinesisRule.rule);
  newKinesisRule.name = `${kinesisRule.name}_new`;

  await rules.create(kinesisRule);
  const rule = await rules.get({ name: kinesisRule.name });

  await rules.create(newKinesisRule);
  const newRule = await rules.get({ name: newKinesisRule.name });

  t.not(newRule.name, rule.name);
  t.is(newRule.rule.value, rule.rule.value);
  t.false(newRule.rule.arn === undefined);
  t.false(newRule.rule.logEventArn === undefined);
  // same event source mapping
  t.is(newRule.rule.arn, rule.rule.arn);
  t.is(newRule.rule.logEventArn, rule.rule.logEventArn);

  await rules.delete(rule);
  await rules.delete(newRule);
});

test.serial('it does not delete event source mappings if they exist for other rules', async (t) => {
  const { kinesisRule } = t.context;

  // we have three rules to create
  const kinesisRuleTwo = Object.assign({}, kinesisRule);
  kinesisRuleTwo.rule = Object.assign({}, kinesisRule.rule);
  kinesisRuleTwo.name = `${kinesisRule.name}_two`;
  const kinesisRuleThree = Object.assign({}, kinesisRule);
  kinesisRuleThree.rule = Object.assign({}, kinesisRule.rule);
  kinesisRuleThree.name = `${kinesisRule.name}_three`;

  const rules = new models.Rule();
  // create two rules with same value
  await rules.create(kinesisRule);
  const rule = await rules.get({ name: kinesisRule.name });
  await rules.create(kinesisRuleTwo);
  const ruleTwo = await rules.get({ name: kinesisRuleTwo.name });

  // same event source mapping
  t.is(ruleTwo.rule.arn, rule.rule.arn);
  t.is(ruleTwo.rule.logEventArn, rule.rule.logEventArn);

  // delete the second rule, it should not delete the event source mapping
  await rules.delete(ruleTwo);

  // create third rule, it should use the existing event source mapping
  await rules.create(kinesisRuleThree);
  const ruleThree = await rules.get({ name: kinesisRuleThree.name });
  t.is(ruleThree.rule.arn, rule.rule.arn);
  t.is(ruleThree.rule.logEventArn, rule.rule.logEventArn);

  // Cleanup -- this is required for repeated local testing, else localstack retains rules
  await rules.delete(rule);
  await rules.delete(ruleThree);
});
