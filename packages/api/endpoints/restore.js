'use strict';

const router = require('express-promise-router')();
const models = require('../models');
const { deconstructCollectionId } = require('../lib/utils');

/**
 * Kick off a granule restoration workflow.
 * 
 * @param {Object} req - express request object
 * @param {Object} res - express response object
 * @returns {Promise<Object>} the promise of epxress response object
 */
async function put(req, res) {
  const granuleId = req.params.granuleName;

  const granuleModelClient = new models.Granule();
  const granule =  await granuleModelClient.get({ granuleId });

  const { name, version } = deconstructCollectionId(granule.collectionId);
  const collectionModelClient = new models.Collection();
  const { recoveryWorkflow } = await collectionModelClient.get({ name, version });

  if (!recoveryWorklfow) {
    return res.boom.notFound('Recovery workflow not configured for this granule');
  }

  await granuleModelClient.applyWorkflow(granule, collection.recoveryWorkflow);

  return res.send(Object.assign({
    granuleId: granule.granuleId,
    action: `applyWorkflow ${recoveryWorkflow}`,
    status: 'SUCCESS'
  },));
}

router.put('/:granuleName', put);

module.exports = router;