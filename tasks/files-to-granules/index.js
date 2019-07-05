'use strict';

const flatten = require('lodash.flatten');
const get = require('lodash.get');
const keyBy = require('lodash.keyby');
const path = require('path');

// const cumulusMessageAdapter = require('@cumulus/cumulus-message-adapter-js');

const { getGranuleId, parseS3Uri } = require('./utils');

/**
 * Helper to turn an s3URI into a fileobject
 *
 * @param {string} s3URI - s3://mybucket/myprefix/myobject.
 * @returns {Object} file object
 */
function fileObjectFromS3URI(s3URI) {
  const uriParsed = parseS3Uri(s3URI);
  return {
    name: path.basename(s3URI),
    bucket: uriParsed.Bucket,
    filename: s3URI,
    fileStagingDir: path.dirname(uriParsed.Key)
  };
}

/**
 * Takes the files from input and granules and merges them into an object where
 * each file is associated with its granuleId.
 *
 * @param {Array<string>} inputFiles - list of s3 files to add to the inputgranules
 * @param {Array<Object>} inputGranules - an array of the granules
 * @param {string} regex - regex needed to extract granuleId from filenames
 * @returns {Object} inputGranules with updated file lists
 */
function mergeInputFilesWithInputGranules(inputFiles, inputGranules, regex) {
  // create hash list of the granules
  // and a list of files
  const granulesHash = keyBy(inputGranules, 'granuleId');
  const filesFromInputGranules = flatten(inputGranules.map((g) => g.files.map((f) => f.filename)));

  // add input files to corresponding granules
  // the process involve getting granuleId of each file
  // match it against the granuleObj and adding the new files to the
  // file list
  inputFiles
    .filter((f) => !filesFromInputGranules.includes(f))
    .forEach((f) => {
      if (f) {
        const fileGranuleId = getGranuleId(f, regex);
        try {
          granulesHash[fileGranuleId].files.push(fileObjectFromS3URI(f));
        } catch (e) {
          throw new Error(`Failed adding ${f} to ${fileGranuleId}'s files`);
        }
      }
    });

  return {
    granules: Object.keys(granulesHash).map((k) => granulesHash[k])
  };
}

/**
 * Files-To-Granules task to change array-of-files input to granules object output
 *
 * @param {Object} event - Lambda function payload
 * @param {Object} event.config - Cumulus config object
 * @param {string} event.config.granuleIdExtraction - regex needed to extract granuleId
 *                                                    from filenames
 * @param {Array<Object>} event.config.inputGranules - an array of granules
 * @param {Array<string>} event.input - an array of s3 uris
 *
 * @returns {Object} Granules object
 */
function filesToGranules(event) {
  const granuleIdExtractionRegex = get(event.config, 'granuleIdExtraction', '(.*)');
  // const inputGranules = event.config.inputGranules;
  const inputGranules = event.granules;
  const inputFileList = event.files;

  return mergeInputFilesWithInputGranules(
    inputFileList, inputGranules, granuleIdExtractionRegex
  );
}
exports.filesToGranules = filesToGranules;

// function handler(event, context, callback) {
//   cumulusMessageAdapter.runCumulusTask(
//     filesToGranules, event, context, callback
//   );
// }

exports.handler = filesToGranules;
