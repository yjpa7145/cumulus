'use strict';

const aws = require('@cumulus/common/aws');
const fs = require('fs');
const path = require('path');
const sinon = require('sinon');
const test = require('ava');
const cmrjs = require('@cumulus/cmrjs');
const clone = require('lodash.clonedeep');
const { promisify } = require('util');
const { constructCollectionId } = require('@cumulus/common');
const { removeNilProperties } = require('@cumulus/common/util');
const { randomString } = require('@cumulus/common/test-utils');

const models = require('../../models');
const { deconstructCollectionId } = require('../../lib/utils');
const { granule, handler, pdr } = require('../../lambdas/executionToDynamo');
const { filterDatabaseProperties } = require('../../lib/FileUtils');

const granuleSuccess = require('../data/granule_success.json');
const granuleFailure = require('../data/granule_failed.json');

const pdrFailure = require('../data/pdr_failure.json');
const pdrSuccess = require('../data/pdr_success.json');

const loadJSONEventFile = (filename) =>
  promisify(fs.readFile)(path.join(__dirname, '..', 'data', filename), 'utf8')
    .then((txt) => txt.toString())
    .then(JSON.parse)
    .then(JSON.parse);

const granuleFileToRecord = (granuleFile) => {
  const granuleRecord = {
    size: 12345,
    ...granuleFile,
    key: aws.parseS3Uri(granuleFile.filename).Key,
    fileName: granuleFile.name,
    checksum: granuleFile.checksum
  };

  if (granuleFile.path) {
    granuleRecord.source = `https://07f1bfba.ngrok.io/granules/${granuleFile.name}`;
  }

  return removeNilProperties(filterDatabaseProperties(granuleRecord));
};

const fakeMetadata = {
  beginningDateTime: '2017-10-24T00:00:00.000Z',
  endingDateTime: '2018-10-24T00:00:00.000Z',
  lastUpdateDateTime: '2018-04-20T21:45:45.524Z',
  productionDateTime: '2018-04-25T21:45:45.524Z'
};

const executionTable = randomString();
const granuleTable = randomString();
const pdrTable = randomString();

let executionModel;
let granuleModel;
let pdrModel;

test.before(async () => {
  process.env.ExecutionsTable = executionTable;
  executionModel = new models.Execution();
  await executionModel.createTable();

  process.env.GranulesTable = granuleTable;
  granuleModel = new models.Granule();
  await granuleModel.createTable();

  process.env.PdrsTable = pdrTable;
  pdrModel = new models.Pdr();
  await pdrModel.createTable();

  sinon.stub(cmrjs, 'getGranuleTemporalInfo').callsFake(() => fakeMetadata);
});

test.after.always(async () => {
  await executionModel.deleteTable();
  await granuleModel.deleteTable();
  await pdrModel.deleteTable();

  cmrjs.getGranuleTemporalInfo.restore();
});

test('creating a successful granule record', async (t) => {
  const mockedFileSize = 12345;

  // Stub out headobject S3 call used in api/models/granules.js,
  // so we don't have to create artifacts
  sinon.stub(aws, 'headObject').resolves({ ContentLength: mockedFileSize });

  const testGranule = granuleSuccess.payload.granules[0];
  const collection = granuleSuccess.meta.collection;
  const records = await granule(granuleSuccess);

  const collectionId = constructCollectionId(collection.name, collection.version);

  // check the record exists
  const record = records[0];

  t.deepEqual(
    record.files,
    testGranule.files.map(granuleFileToRecord)
  );
  t.is(record.status, 'completed');
  t.is(record.collectionId, collectionId);
  t.is(record.granuleId, testGranule.granuleId);
  t.is(record.cmrLink, testGranule.cmrLink);
  t.is(record.published, testGranule.published);
  t.is(record.productVolume, 17934423);
  t.is(record.beginningDateTime, '2017-10-24T00:00:00.000Z');
  t.is(record.endingDateTime, '2018-10-24T00:00:00.000Z');
  t.is(record.productionDateTime, '2018-04-25T21:45:45.524Z');
  t.is(record.lastUpdateDateTime, '2018-04-20T21:45:45.524Z');
  t.is(record.timeToArchive, 100 / 1000);
  t.is(record.timeToPreprocess, 120 / 1000);
  t.is(record.processingStartDateTime, '2018-05-03T14:23:12.010Z');
  t.is(record.processingEndDateTime, '2018-05-03T17:11:33.007Z');

  const { name: deconstructed } = deconstructCollectionId(record.collectionId);
  t.is(deconstructed, collection.name);
});

test('creating multiple successful granule records', async (t) => {
  const newPayload = clone(granuleSuccess);
  const testGranule = newPayload.payload.granules[0];
  testGranule.granuleId = randomString();
  const granule2 = clone(testGranule);
  granule2.granuleId = randomString();
  newPayload.payload.granules.push(granule2);
  const collection = newPayload.meta.collection;
  const records = await granule(newPayload);

  const collectionId = constructCollectionId(collection.name, collection.version);

  t.is(records.length, 2);

  records.forEach((record) => {
    t.is(record.status, 'completed');
    t.is(record.collectionId, collectionId);
    t.is(record.cmrLink, testGranule.cmrLink);
    t.is(record.published, testGranule.published);
  });
});

test('creating a failed granule record', async (t) => {
  const testGranule = granuleFailure.payload.granules[0];
  const records = await granule(granuleFailure);

  const record = records[0];
  t.deepEqual(
    record.files,
    testGranule.files.map(granuleFileToRecord)
  );
  t.is(record.status, 'failed');
  t.is(record.granuleId, testGranule.granuleId);
  t.is(record.published, false);
  t.is(record.error.Error, granuleFailure.exception.Error);
  t.is(record.error.Cause, granuleFailure.exception.Cause);
});

test('creating a granule record without state_machine info', async (t) => {
  const newPayload = clone(granuleSuccess);
  delete newPayload.cumulus_meta.state_machine;

  const r = await granule(newPayload);
  t.is(r, undefined);
});

test('creating a granule record without a granule', async (t) => {
  const newPayload = clone(granuleSuccess);
  delete newPayload.payload;
  delete newPayload.meta;

  const r = await granule(newPayload);
  t.is(r, undefined);
});

test('creating a granule record in meta section', async (t) => {
  const newPayload = clone(granuleSuccess);
  delete newPayload.payload;
  newPayload.meta.status = 'running';
  const collection = newPayload.meta.collection;
  const testGranule = newPayload.meta.input_granules[0];
  testGranule.granuleId = randomString();

  const records = await granule(newPayload);
  const collectionId = constructCollectionId(collection.name, collection.version);

  const record = records[0];
  t.deepEqual(
    record.files,
    testGranule.files.map(granuleFileToRecord)
  );
  t.is(record.status, 'running');
  t.is(record.collectionId, collectionId);
  t.is(record.granuleId, testGranule.granuleId);
  t.is(record.published, false);
});

test('creating a failed pdr record', async (t) => {
  const payload = pdrFailure.payload;
  payload.pdr.name = randomString();
  const collection = pdrFailure.meta.collection;
  const record = await pdr(pdrFailure);

  const collectionId = constructCollectionId(collection.name, collection.version);

  t.is(record.status, 'failed');
  t.is(record.collectionId, collectionId);
  t.is(record.pdrName, payload.pdr.name);

  // check stats
  const stats = record.stats;
  t.is(stats.total, 1);
  t.is(stats.failed, 1);
  t.is(stats.processing, 0);
  t.is(stats.completed, 0);
  t.is(record.progress, 100);
});

test('creating a successful pdr record', async (t) => {
  pdrSuccess.meta.pdr.name = randomString();
  const testPdr = pdrSuccess.meta.pdr;
  const collection = pdrSuccess.meta.collection;
  const record = await pdr(pdrSuccess);

  const collectionId = constructCollectionId(collection.name, collection.version);

  t.is(record.status, 'completed');
  t.is(record.collectionId, collectionId);
  t.is(record.pdrName, testPdr.name);

  // check stats
  const stats = record.stats;
  t.is(stats.total, 3);
  t.is(stats.failed, 1);
  t.is(stats.processing, 0);
  t.is(stats.completed, 2);
  t.is(record.progress, 100);
});

test('creating a running pdr record', async (t) => {
  const newPayload = clone(pdrSuccess);
  newPayload.meta.pdr.name = randomString();
  newPayload.meta.status = 'running';
  newPayload.payload.running.push('arn');
  const record = await pdr(newPayload);

  t.is(record.status, 'running');

  // check stats
  const stats = record.stats;
  t.is(stats.total, 4);
  t.is(stats.failed, 1);
  t.is(stats.processing, 1);
  t.is(stats.completed, 2);
  t.is(record.progress, 75);
});

test('indexing a running pdr when pdr is missing', async (t) => {
  delete pdrSuccess.meta.pdr;
  const r = await pdr(pdrSuccess);

  // make sure record is created
  t.is(r, undefined);
});

test('pass a sns message to main handler with parse info', async (t) => {
  const event = await loadJSONEventFile('sns_message_parse_pdr.txt');

  const resp = await handler(event);

  t.is(resp.length, 1);
  t.truthy(resp[0].sf);
  t.falsy(resp[0].granule);
  t.truthy(resp[0].pdr);
});

test('pass a sns message to main handler', async (t) => {
  const event = await loadJSONEventFile('sns_message_granule.txt');

  const resp = await handler(event);

  t.is(resp.length, 1);
  t.truthy(resp[0].sf);
  t.truthy(resp[0].granule);
  t.falsy(resp[0].pdr);
});

test('pass a sns message to main handler with discoverpdr info', async (t) => {
  const event = await loadJSONEventFile('sns_message_discover_pdr.txt');

  const resp = await handler(event);

  t.is(resp.length, 1);
  t.truthy(resp[0].sf);
  t.falsy(resp[0].granule);
  t.falsy(resp[0].pdr);
});
