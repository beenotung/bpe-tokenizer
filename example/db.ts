import { connectDB } from '../core-db'

export const dbFile = 'db.sqlite3'

export const db = connectDB(dbFile)
