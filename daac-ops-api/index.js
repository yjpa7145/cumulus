'use strict';

const collections = require('./endpoints/collections');
const granules = require('./endpoints/granules');
const logs = require('./endpoints/logs');
const pdrs = require('./endpoints/pdrs');
const providers = require('./endpoints/providers');
const rules = require('./endpoints/rules');
const workflows = require('./endpoints/workflows');
const executions = require('./endpoints/executions');
const jobs = require('./endpoints/jobs');
const schemas = require('./endpoints/schemas');
const stats = require('./endpoints/stats');
const distribution = require('./endpoints/distribution');
const bootstrap = require('./lib/bootstrap');
const indexer = require('./es/indexer');

module.exports = {
  collections,
  granules,
  logs,
  pdrs,
  providers,
  rules,
  workflows,
  executions,
  jobs,
  schemas,
  stats,
  distribution,
  bootstrap,
  indexer: indexer.handler,
  logHandler: indexer.logHandler
};
