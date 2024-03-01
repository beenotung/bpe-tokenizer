import { toSafeMode, newDB, DBInstance } from 'better-sqlite3-schema'
import { join } from 'path'

export const dbFile = join(__dirname, 'db.sqlite3')

export const db: DBInstance = newDB({
  path: dbFile,
  migrate: false,
})

toSafeMode(db)
