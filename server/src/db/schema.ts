import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const documents = sqliteTable("documents", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").unique().notNull(),
    token: text("token").notNull(),
    title: text("title").notNull().default("Untitled"),
    language: text("language").notNull().default("markdown"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const documentStates = sqliteTable("document_states", {
    slug: text("slug").primaryKey().notNull(),
    state: blob("state", { mode: "buffer" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const refreshTokens = sqliteTable("refresh_tokens", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tokenHash: text("token_hash").unique().notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
})
