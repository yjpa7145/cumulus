'use strict';

exports.up = async (knex) => {
  await knex.schema.createTable(
    'collections',
    (table) => {
      table.increments('id');

      table.string('data_type');
      table.string('granule_id_extraction_regex').notNullable();
      table.string('granule_id_validation_regex').notNullable();
      table.string('name').notNullable();
      table.string('process');
      table.string('provider_path').defaultTo('/');
      table.string('sample_file_name').notNullable();
      table.string('url_path');
      table.string('version').notNullable();

      table.enu('duplicate_handling', ['error', 'skip', 'replace', 'version']).defaultTo('error');

      table.bigInteger('created_at').notNullable();
      table.bigInteger('updated_at').notNullable();

      table.json('meta');

      table.unique(['name', 'version']);
    }
  );

  await knex.schema.createTable(
    'collection_file_definitions',
    (table) => {
      table.increments('id');

      table.string('bucket');
      table.string('regex');
      table.string('sample_file_name');
      table.string('url_path');

      table.integer('collection_id').unsigned().notNullable();
      table.foreign('collection_id').references('collections.id');
    }
  );

  await knex.schema.createTable(
    'rules',
    (table) => {
      table.increments('id');

      table.json('meta');
      table.string('name').unique().notNullable();
      table.string('rule_arn');
      table.string('rule_log_event_arn');
      table.enu('rule_type', ['onetime', 'scheduled', 'sns', 'kinesis']).notNullable();
      table.string('rule_value');
      table.enu('state', ['ENABLED', 'DISABLED']).notNullable();
      table.string('workflow').notNullable();

      table.bigInteger('created_at').notNullable();
      table.bigInteger('updated_at').notNullable();

      table.integer('collection_id').unsigned().notNullable();
      table.foreign('collection_id').references('collections.id');

      table.string('provider_id');
      table.foreign('provider_id').references('providers.id');
    }
  );

  await knex.schema.createTable(
    'tags',
    (table) => {
      table.increments('id');
      table.string('name').unique();
    }
  );

  await knex.schema.createTable(
    'collection_tags',
    (table) => {
      table.integer('collection_id').unsigned().notNullable();
      table.foreign('collection_id').references('collections.id');

      table.integer('tag_id').unsigned().notNullable();
      table.foreign('tag_id').references('tags.id');
    }
  );

  await knex.schema.createTable(
    'rule_tags',
    (table) => {
      table.integer('rule_id').unsigned().notNullable();
      table.foreign('rule_id').references('rules.id');

      table.integer('tag_id').unsigned().notNullable();
      table.foreign('tag_id').references('tags.id');
    }
  );
};

exports.down = async (knex) => {
  await knex.schema.dropTable('rules');
  await knex.schema.dropTable('collection_tags');
  await knex.schema.dropTable('tags');
  await knex.schema.dropTable('collection_file_definitions');
  await knex.schema.dropTable('collections');
};
