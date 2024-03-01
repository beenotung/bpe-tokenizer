import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  await knex.raw('alter table `corpus` add column `external_id` text not null')
  await knex.schema.alterTable('char_token', table => {
    table.foreign('id').references('token.id')
  })
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('char_token', table => {
    table.dropForeign('id')
  })
  await knex.raw('alter table `corpus` drop column `external_id`')
}
