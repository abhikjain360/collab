import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { mkdirSync } from "fs"
import { dirname } from "path"
import { env } from "../env"
import * as schema from "./schema"

mkdirSync(dirname(env.DATABASE_PATH), { recursive: true })

const sqlite = new Database(env.DATABASE_PATH)
sqlite.run("PRAGMA journal_mode = WAL")
sqlite.run("PRAGMA foreign_keys = ON")

export const db = drizzle(sqlite, { schema })

// Apply pending migrations on startup (uses bun:sqlite, no external driver)
migrate(db, { migrationsFolder: "./drizzle" })
