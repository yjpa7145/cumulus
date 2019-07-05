'use strict';

// const cumulusMessageAdapter = require('@cumulus/cumulus-message-adapter-js');
const { generateCmrFilesForGranules } = require('@cumulus/integration-tests');
const { promiseS3Upload } = require('@cumulus/common/aws');
const cloneDeep = require('lodash.clonedeep');
const path = require('path');
const fs = require('fs');
const img = require('./data/testBrowse.jpg');


async function uploadFakeBrowse(granules) {
  const uploadPromises = [];
  granules.forEach((granule) => {
    granule.files.forEach((file) => {
      if (file.type === 'data') {
        const browseFile = cloneDeep(file);
        const browseName = browseFile.filename;
        browseFile.filename = browseName.replace(path.extname(browseName), '.jpg');
        browseFile.name = browseFile.name.replace(path.extname(browseFile.name), '.jpg');
        browseFile.type = 'browse';
        const browseStream = fs.createReadStream(img);
        uploadPromises.push(promiseS3Upload({
          Bucket: browseFile.bucket,
          Key: (`${browseFile.fileStagingDir}/${browseFile.name}`),
          Body: browseStream
        }));
        granule.files.push(browseFile);
      }
    });
  });
  await Promise.all(uploadPromises);
  return granules;
}


/**
 * For each granule, create a CMR XML file and store to S3
 *
 * @param {Object} event - an ingest object
 * @returns {Array<string>} - the list of s3 locations for granule files
 */

async function fakeProcessing(event) {
  // const input = event.input;
  const collection = event.collection;
  const granules = event.granules;

  if (collection.name.includes('_test')) {
    const idx = collection.name.indexOf('_test');
    collection.name = collection.name.substring(0, idx);
  }

  let outputGranules = granules;
  if (event.generateFakeBrowse) {
    outputGranules = await uploadFakeBrowse(granules);
  }

  const outputFiles = await generateCmrFilesForGranules(
    outputGranules,
    collection,
    event.bucket,
    event.cmrMetadataFormat,
    event.additionalUrls
  );
  return { files: outputFiles, granules: outputGranules };
}

/**
 * Lambda handler that returns the expected input for the Post to CMR task
 *
 * @param {Object} event - a description of the ingestgranules
 * @param {Object} context - an AWS Lambda context
 * @param {Function} callback - an AWS Lambda handler
 * @returns {undefined} - does not return a value
 */
// function handler(event, context, callback) {
//   cumulusMessageAdapter.runCumulusTask(fakeProcessing, event, context, callback);
// }

exports.handler = fakeProcessing;
