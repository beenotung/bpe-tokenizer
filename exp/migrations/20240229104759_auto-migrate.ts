import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('corpus'))) {
    await knex.schema.createTable('corpus', table => {
      table.increments('id')
      table.text('content_code').notNullable()
      table.timestamps(false, true)
    })
  }

  if (!(await knex.schema.hasTable('token'))) {
    await knex.schema.createTable('token', table => {
      table.increments('id')
      table.text('chars').notNullable()
      table.integer('weight').notNullable()
      table.integer('original_weight').notNullable()
      table.text('code').notNullable()
      table.timestamps(false, true)
    })
  }

  if (!(await knex.schema.hasTable('merge'))) {
    await knex.schema.createTable('merge', table => {
      table.increments('id')
      table.integer('a_id').unsigned().notNullable().references('token.id')
      table.integer('b_id').unsigned().notNullable().references('token.id')
      table.timestamps(false, true)
    })
  }
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('merge')
  await knex.schema.dropTableIfExists('token')
  await knex.schema.dropTableIfExists('corpus')
}
