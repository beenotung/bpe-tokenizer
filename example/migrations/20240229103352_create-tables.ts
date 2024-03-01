import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('source_group'))) {
    await knex.schema.createTable('source_group', table => {
      table.increments('id')
      table.text('slug').notNullable().unique()
      table.integer('member_count').notNullable()
      table.timestamps(false, true)
    })
  }

  if (!(await knex.schema.hasTable('source_user'))) {
    await knex.schema.createTable('source_user', table => {
      table.increments('id')
      table.text('name').notNullable()
      table.text('icon').notNullable()
      table.integer('ban_time').nullable()
      table.boolean('is_tutor').nullable()
      table.boolean('is_student').nullable()
      table.boolean('is_center').nullable()
      table.boolean('is_sport').nullable()
      table.boolean('is_music').nullable()
      table.boolean('is_dance').nullable()
      table.boolean('is_ads').nullable()
      table.boolean('is_sell').nullable()
      table.timestamps(false, true)
    })
  }

  if (!(await knex.schema.hasTable('source_post'))) {
    await knex.schema.createTable('source_post', table => {
      table.increments('id')
      table.integer('source_group_id').unsigned().notNullable().references('source_group.id')
      table.text('post_at').notNullable()
      table.integer('post_time').nullable()
      table.integer('source_user_id').unsigned().notNullable().references('source_user.id')
      table.text('content').notNullable()
      table.integer('update_time').notNullable()
      table.timestamps(false, true)
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('source_post')
  await knex.schema.dropTableIfExists('source_user')
  await knex.schema.dropTableIfExists('source_group')
}
