'use strict';

const test = require('ava');
const request = require('supertest');
const { randomString } = require('@cumulus/common/test-utils');
const {
  s3,
  promiseS3Upload,
  recursivelyDeleteS3Bucket
} = require('@cumulus/common/aws');

const workflowList = require('../data/workflow_list.json');
const models = require('../../models');
const {
  createFakeJwtAuthToken
} = require('../../lib/testUtils');
const assertions = require('../../lib/assertions');

process.env.TOKEN_SECRET = randomString();
process.env.AccessTokensTable = randomString();
process.env.UsersTable = randomString();
process.env.stackName = randomString();
process.env.system_bucket = randomString();

// import the express app after setting env variables
const { app } = require('../../app');

let accessTokenModel;
let userModel;
let testBucketName;
let jwtAuthToken;

test.before(async ()=> {
  testBucketName = process.env.system_bucket;

  await s3().createBucket({ Bucket: testBucketName }).promise();
  const workflowListKey = `${process.env.stackName}/workflows/list.json`;
  await promiseS3Upload({
    Bucket: testBucketName,
    Key: workflowsListKey,
    Body: JSON.stringify(workflowList)
  });

  userModel = new models.User();
  await userModel.createTable();

  accessTokenModel = new models.AccessToken();
  await accessTokenModel.createTable();

  jwtAuthToken = await createFakeJwtAuthToken({ accessTokenModel, userModel });

  await s3().createBucket({ Bucket: testBucketName }).promise();
});

test('PUT without an Authorization header returns an Authorization Missing response', async (t) => {
  const response = await request(app)
    .put('/restore')
    .expect(401);
  assertions.isAuthorizationMissingResponse(t, response);
});

test('PUT with an invalid Authorization header returns an Authorization Missing response', async (t) => {
  const response = await request(app)
    .put('/restore')
    .set('Authorization', 'Bearer ThisIsAnInvalidAuthorizationToken')
    .expect(401);
  assertions.isAuthorizationMissingResponse(t, response);
});

test('PUT on a collection without restore configuration causes "recovery not configured" error', async (t) => {
  const response = await request(app)
    .put('/restore/NotExistingGranuleId')
    .set('Authorization', `Bearer ${jwtAuthToken}`)
    .expect(400);
  console.log(response);
});