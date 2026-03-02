import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { mkdirSync } from "fs"
import { dirname } from "path"
import * as schema from "./schema"

const DB_PATH = process.env.DATABASE_PATH || "./data/collab.db"

mkdirSync(dirname(DB_PATH), { recursive: true })

const sqlite = new Database(DB_PATH)
sqlite.run("PRAGMA journal_mode = WAL")
sqlite.run("PRAGMA foreign_keys = ON")

export const db = drizzle(sqlite, { schema })

// Apply pending migrations on startup (uses bun:sqlite, no external driver)
migrate(db, { migrationsFolder: "./drizzle" })
