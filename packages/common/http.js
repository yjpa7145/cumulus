/**
 * A collection of functions to make working with http easier
 * @module
 */

'use strict';

const fs = require('fs');
const got = require('got');

/**
 * Download a file to disk
 *
 * @param {string} uri - the URI to request
 * @param {string} destination - Where to store file locally
 * @param {Object} options - additional download options
 * @param {Object} options.headers - headers to include in the request
 * @param {string} options.username - username for basic authentication
 * @param {string} options.password - password for basic authentication
 * @returns {Promise} - resolves when the download is complete
 */
exports.download = (uri, destination, options = {}) => {
  const requestOptions = {
    headers: options.headers
  };

  if (options.username && options.password) {
    requestOptions.auth = `${options.username}:${options.password}`;
  }

  const file = fs.createWriteStream(destination);

  return new Promise((resolve, reject) => {
    got.stream(uri, requestOptions)
      .on('error', reject)
      .pipe(file);

    file
      .on('finish', resolve)
      .on('error', reject);
  });
};
