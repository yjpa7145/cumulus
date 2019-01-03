'use strict';

const knexModule = require('knex');
const knexConfig = require('../knexfile');

let knexClient;

module.exports = () => {
  if (!knexClient) {
    knexClient = knexModule(knexConfig);
  }

  return knexClient;
};
