import DB from '@beenotung/better-sqlite3-helper'

export const dbFile = 'db.sqlite3'

export const db = DB({
  path: dbFile,
  migrate: false,
})
