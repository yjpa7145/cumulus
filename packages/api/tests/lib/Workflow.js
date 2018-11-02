'use strict';

const test = require('ava');
const { recursivelyDeleteS3Bucket, s3 } = require('@cumulus/common/aws');
const { randomString } = require('@cumulus/common/test-utils');

const Workflow = require('../../lib/Workflow');

let bucket;
test.before(async () => {
  bucket = randomString();
  await s3().createBucket({ Bucket: bucket }).promise();
});

test.beforeEach(async (t) => {
  t.context.name = randomString();
  t.context.stackName = randomString();

  t.context.workflow = new Workflow({
    bucket,
    name: t.context.name,
    stackName: t.context.stackName,
    s3: s3()
  });
});

test.after.always(async () => {
  await recursivelyDeleteS3Bucket(bucket);
});

const requiredParams = ['bucket', 'name', 's3', 'stackName'];

requiredParams.forEach((requiredParam) => {
  test(`The Workflow constructor requires that ${requiredParam} be set`, async (t) => {
    const { name, stackName } = t.context;

    const params = {
      bucket,
      name,
      s3: s3(),
      stackName
    };
    delete params[requiredParam];

    try {
      new Workflow(params);
      t.fail('Expected an error to be thrown');
    }
    catch (err) {
      t.true(err instanceof TypeError);
      t.is(err.message, `${requiredParam} is required`);
    }
  });
});

test('Workflow.messageTemplateUrl returns the correct s3:// URL', (t) => {
  const { name, stackName, workflow } = t.context;

  t.is(workflow.messageTemplateUrl, `s3://${bucket}/${stackName}/workflows/${name}.json`);
});

test('Workflow.saveMessageTemplate() writes the template to S3', async (t) => {
  const { name, stackName, workflow } = t.context;

  await workflow.saveMessageTemplate('my-template');

  const { Body } = await s3().getObject({
    Bucket: bucket,
    Key: `${stackName}/workflows/${name}.json`
  }).promise();

  t.is(Body.toString(), 'my-template');
});

test('Workflow.exists() returns true if the workflow message template exists in S3', async (t) => {
  const { workflow } = t.context;

  await workflow.saveMessageTemplate('my-message-template');

  t.true(await workflow.exists());
});

test('Workflow.exists() returns false if the workflow message template does not exist in S3', async (t) => {
  const { workflow } = t.context;

  t.false(await workflow.exists());
});
