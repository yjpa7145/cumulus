'use strict';

const get = require('lodash.get');
const log = require('@cumulus/common/log');
const pMap = require('p-map');
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

/**
 * processes the incoming cumulus message and pass it through a number
 * of indexers
 *
 * @param  {Object} event - incoming cumulus message
 * @returns {Promise} object with response from the three indexer
 */
async function handlePayload(event) {
  let payload;
  const source = get(event, 'EventSource');

  if (source === 'aws:sns') {
    payload = get(event, 'Sns.Message');
    payload = JSON.parse(payload);
  } else {
    payload = event;
  }

  let executionPromise;
  const e = new Execution();
  if (['failed', 'completed'].includes(payload.meta.status)) {
    executionPromise = e.updateExecutionFromSns(payload);
  } else {
    executionPromise = e.createExecutionFromSns(payload);
  }

  return {
    sf: await executionPromise,
    pdr: await pdr(payload),
    granule: await granule(payload)
  };
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
