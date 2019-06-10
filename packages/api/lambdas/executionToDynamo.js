'use strict';

const isObject = require('lodash.isobject');
const pMap = require('p-map');
const { getJSONObjectFromS3 } = require('@cumulus/common/aws');
const { Granule, Pdr, Execution } = require('../models');

/**
 * Extracts granule info from a stepFunction message and save it to DynamoDB
 *
 * @param  {Object} payload  - Cumulus Step Function message
 * @returns {Promise<Array>} list of created records
 */
function granule(payload) {
  const g = new Granule();
  return g.createGranulesFromSns(payload);
}

/**
 * Extracts PDR info from a StepFunction message and save it to DynamoDB
 *
 * @param  {Object} payload  - Cumulus Step Function message
 * @returns {Promise<Object>} Elasticsearch response
 */
function pdr(payload) {
  const p = new Pdr();
  return p.createPdrFromSns(payload);
}

const fetchRemoteCumulusMessage = async (cumulusMessage) => {
  if (!cumulusMessage.replace) return cumulusMessage;

  return getJSONObjectFromS3(
    cumulusMessage.replace.Bucket,
    cumulusMessage.replace.Key
  );
};

/**
 * processes the incoming cumulus message and pass it through a number
 * of indexers
 *
 * @param  {Object} event - incoming cumulus message
 * @returns {Promise<undefined>} object with response from the three indexer
 */
async function handlePayload(event) {
  if (event.source !== 'aws.states') return;

  let payload;

  if (event.detail.status === 'RUNNING') {
    payload = await fetchRemoteCumulusMessage(JSON.parse(event.detail.input));
    payload.meta.status = 'running';
  } else {
    payload = await fetchRemoteCumulusMessage(JSON.parse(event.detail.output));
    if (isObject(payload.exception) && Object.keys(payload.exception).length > 0) payload.meta.status = 'failed';
    else if (payload.Error) payload.meta.status = 'failed';
    else if (payload.error) payload.meta.status = 'failed';
    else payload.meta.status = 'completed';
  }

  let executionPromise;
  const e = new Execution();
  if (['failed', 'completed'].includes(payload.meta.status)) {
    executionPromise = e.updateExecutionFromSns(payload);
  } else {
    executionPromise = e.createExecutionFromSns(payload);
  }

  await Promise.all([
    executionPromise,
    pdr(payload),
    granule(payload)
  ]);
}

/**
 * Lambda function handler for sns2dynamo
 *
 * @param  {Object} event - incoming message sns
 * @returns {Array<Promise>}
 */
const handler = async (event) =>
  pMap(event.Records ? event.Records : [event], handlePayload);

module.exports = {
  granule,
  handlePayload,
  handler,
  pdr
};
