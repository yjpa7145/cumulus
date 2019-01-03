'use strict';

exports.up = async (knex) => {
  await knex.schema.createTable(
    'executions',
    (table) => {
      table.string('arn').unique().notNullable();
      table.json('error');
      table.string('execution');
      table.json('final_payload');
      table.string('name').unique().notNullable();
      table.json('original_payload');
      table.enu('status', ['running', 'completed', 'failed', 'unknown']).notNullable();
      table.bigInteger('timestamp');
      table.string('type');

      table.bigInteger('created_at').notNullable();
      table.bigInteger('updated_at').notNullable();
    }
  );
};

exports.down = async (knex) => {
  await knex.schema.dropTable('executions');
};
