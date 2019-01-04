'use strict';

const aws = require('@cumulus/ingest/aws');
const get = require('lodash.get');
const pLimit = require('p-limit');

const { constructCollectionId } = require('@cumulus/common');

const knex = require('../db/knex');
const Model = require('./Model');
const executionsGateway = require('../db/executions-gateway');

const { RecordDoesNotExist } = require('../lib/errors');
const { parseException } = require('../lib/utils');

function buildExecutionModel(executionRecord) {
  const executionModel = {
    arn: executionRecord.arn,
    createdAt: executionRecord.created_at,
    collectionId: executionRecord.collection_id,
    duration: executionRecord.duration / 1000,
    updatedAt: executionRecord.updated_at,
    parentArn: executionRecord.parent_arn,
    timestamp: executionRecord.timestamp,
    execution: executionRecord.execution,
    name: executionRecord.name,
    status: executionRecord.status,
    type: executionRecord.type,
    error: executionRecord.error,
  };

  if (executionRecord.original_payload) {
    executionModel.originalPayload = executionRecord.original_payload;
  }
  if (executionRecord.final_payload) {
    executionModel.finalPayload = executionRecord.final_payload;
  }

  return executionModel;
}

function executionModelToRecord(executionModel) {
  const executionRecord = {
    arn: executionModel.arn,
    created_at: executionModel.createdAt,
    collection_id: executionModel.collectionId,
    duration: Math.round(executionModel.duration * 1000),
    parent_arn: executionModel.parentArn,
    timestamp: executionModel.timestamp,
    updated_at: executionModel.updatedAt,
    execution: executionModel.execution,
    name: executionModel.name,
    status: executionModel.status,
    type: executionModel.type,
  };

  if (executionModel.error) {
    executionRecord.error = JSON.stringify(executionModel.error);
  }

  if (executionModel.finalPayload) {
    executionRecord.final_payload = JSON.stringify(executionModel.finalPayload);
  }

  if (executionModel.originalPayload) {
    executionRecord.original_payload = JSON.stringify(executionModel.originalPayload);
  }

  return executionRecord;
}

const privates = new WeakMap();

class Execution extends Model {
  constructor() {
    super();

    privates.set(this, { db: knex() });
  }

  async exists({ arn }) {
    const { db } = privates.get(this);
    const executionRecord = await executionsGateway.findByArn(db, arn);
    return executionRecord !== undefined;
  }

  async get({ arn }) {
    const { db } = privates.get(this);

    const executionRecord = await executionsGateway.findByArn(db, arn);

    if (executionRecord === undefined) throw new RecordDoesNotExist();

    return buildExecutionModel(executionRecord);
  }

  async getAll() {
    const { db } = privates.get(this);

    const executionRecords = await executionsGateway.find(db);

    return executionRecords.map(buildExecutionModel);
  }

  async create(item) {
    const { db } = privates.get(this);

    const executionRecord = executionModelToRecord(item);

    await executionsGateway.insert(db, executionRecord);

    return this.get({ arn: item.arn });
  }

  async update({ arn }, item, keysToDelete = []) {
    const { db } = privates.get(this);

    const deletions = {};
    keysToDelete.forEach((f) => {
      deletions[f] = null;
    });

    const updatedModel = {
      ...item,
      ...deletions,
      id: undefined
    };

    const updates = executionModelToRecord(updatedModel);

    await executionsGateway.update(db, arn, updates);

    return this.get({ arn });
  }

  async delete({ arn }) {
    const { db } = privates.get(this);

    await executionsGateway.delete(db, arn);
  }

  generateDocFromPayload(payload) {
    const name = get(payload, 'cumulus_meta.execution_name');
    const arn = aws.getExecutionArn(
      get(payload, 'cumulus_meta.state_machine'),
      name
    );
    if (!arn) {
      throw new Error('State Machine Arn is missing. Must be included in the cumulus_meta');
    }

    const execution = aws.getExecutionUrl(arn);
    const collectionId = constructCollectionId(
      get(payload, 'meta.collection.name'), get(payload, 'meta.collection.version')
    );

    const doc = {
      name,
      arn,
      parentArn: get(payload, 'cumulus_meta.parentExecutionArn'),
      execution,
      tasks: get(payload, 'meta.workflow_tasks'),
      error: parseException(payload.exception),
      type: get(payload, 'meta.workflow_name'),
      collectionId: collectionId,
      status: get(payload, 'meta.status', 'unknown'),
      createdAt: get(payload, 'cumulus_meta.workflow_start_time'),
      timestamp: Date.now()
    };
    return doc;
  }

  /**
   * Scan the Executions table and remove originalPayload/finalPayload records from the table
   *
   * @param {integer} completeMaxDays - Maximum number of days a completed
   *   record may have payload entries
   * @param {integer} notCompleteMaxDays - Maximum number of days a non-completed
   *   record may have payload entries
   * @param {boolean} disableComplete - Disable removal of completed execution
   *   payloads
   * @param {boolean} disableNotComplete - Disable removal of execution payloads for
   *   statuses other than 'completed'
   * @returns {Promise<undefined>}
   */
  async removeOldPayloadRecords(completeMaxDays, notCompleteMaxDays,
    disableComplete, disableNotComplete) {
    // TODO: Sort args
    const msPerDay = 1000 * 3600 * 24;
    const { db } = privates.get(this);

    if (!disableComplete) {
      const completeMaxMs = Date.now() - (msPerDay * completeMaxDays);
      await executionsGateway.deletePayloadsCompletedBefore(db, completeMaxMs);
    }
    if (!disableNotComplete) {
      const notCompleteMaxMs = Date.now() - (msPerDay * notCompleteMaxDays);
      await executionsGateway.deletePayloadsNotCompletedBefore(db, notCompleteMaxMs);
    }
  }

  /**
   * Update an existing execution record, replacing all fields except originalPayload
   * adding the existing payload to the finalPayload database field
   *
   * @param {Object} payload sns message containing the output of a Cumulus Step Function
   * @returns {Promise<Object>} An execution record
   */
  async updateExecutionFromSns(payload) {
    const doc = this.generateDocFromPayload(payload);

    const existingRecord = await this.get({ arn: doc.arn });

    doc.finalPayload = get(payload, 'payload');
    doc.originalPayload = existingRecord.originalPayload;
    doc.duration = doc.timestamp - doc.createdAt;

    return this.update({ arn: doc.arn }, doc);
  }

  /**
   * Create a new execution record from incoming sns messages
   *
   * @param {Object} payload - SNS message containing the output of a Cumulus Step Function
  * @returns {Promise<Object>} An execution record
   */
  async createExecutionFromSns(payload) {
    const doc = this.generateDocFromPayload(payload);
    doc.originalPayload = get(payload, 'payload');
    doc.duration = doc.timestamp - doc.createdAt;

    return this.create(doc);
  }
}

module.exports = Execution;
