'use strict';

const Ajv = require('ajv');

class Model {
  static recordIsValid(item, schema = null, removeAdditional = false) {
    if (schema) {
      const ajv = new Ajv({
        useDefaults: true,
        v5: true,
        removeAdditional: removeAdditional
      });
      const validate = ajv.compile(schema);
      const valid = validate(item);
      if (!valid) {
        const err = new Error('The record has validation errors');
        err.name = 'SchemaValidationError';
        err.detail = validate.errors;
        throw err;
      }
    }
  }

  // Void function to prevent upstream tests from failing when they attempt to
  // clean up
  static createTable() {}

  // Void function to prevent upstream tests from failing when they attempt to
  // clean up
  static deleteTable() {}

  // Void function to prevent upstream tests from failing when they attempt to
  // clean up
  async createTable() {} // eslint-disable-line no-empty-function

  async deleteTable() {} // eslint-disable-line no-empty-function

  enableStream() {
    throw new Error('Deprecated');
  }

  batchGet() {
    throw new Error('Deprecated');
  }

  batchWrite() {
    throw new Error('Deprecated');
  }

  scan() {
    throw new Error('Deprecated');
  }

  updateStatus() {
    throw new Error('Deprecated');
  }

  hasFailed() {
    throw new Error('Deprecated');
  }
}
module.exports = Model;
