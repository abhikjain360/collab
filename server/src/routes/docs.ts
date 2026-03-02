import { eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { z } from "zod"
import { db } from "../db"
import { documents, documentStates } from "../db/schema"
import * as jwt from "../lib/jwt"
import { bootRoom, getActiveCount } from "../lib/rooms"

const JWT_SECRET = process.env.JWT_SECRET!

function randomSlug(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
    const bytes = crypto.getRandomValues(new Uint8Array(8))
    return Array.from(bytes, b => chars[b % chars.length]).join("")
}

function randomToken(): string {
    return Array.from(
        crypto.getRandomValues(new Uint8Array(32)),
        b => b.toString(16).padStart(2, "0"),
    ).join("")
}

async function requireAdmin(cookie: Record<string, any>, set: any): Promise<boolean> {
    const session = cookie.session?.value
    if (!session) {
        set.status = 401
        return false
    }
    const payload = await jwt.verify(session, JWT_SECRET)
    if (!payload) {
        set.status = 401
        return false
    }
    return true
}

const createDocBody = z.object({ title: z.string().optional() })
const renameDocBody = z.object({ title: z.string() })
const validateTokenBody = z.object({ token: z.string() })

export const docRoutes = new Elysia({ prefix: "/api" })
    // Public
    .post("/docs/:slug/validate", ({ params, body, set }) => {
        const parsed = validateTokenBody.safeParse(body)
        if (!parsed.success) {
            set.status = 400
            return { error: "Invalid request" }
        }

        const doc = db
            .select()
            .from(documents)
            .where(eq(documents.slug, params.slug))
            .get()

        if (!doc || doc.token !== parsed.data.token) {
            set.status = 403
            return { error: "Invalid token" }
        }

        return { ok: true, title: doc.title }
    })
    // Admin
    .get("/docs", async ({ cookie, set }) => {
        if (!await requireAdmin(cookie, set)) {
            return { error: "Unauthorized" }
        }

        const docs = db.select().from(documents).all()
        return docs.map(doc =>
            Object.assign(doc, {
                activeCount: getActiveCount(doc.slug),
            })
        )
    })
    .post("/docs", async ({ body, cookie, set }) => {
        if (!await requireAdmin(cookie, set)) {
            return { error: "Unauthorized" }
        }

        const parsed = createDocBody.safeParse(body)
        const title = parsed.success ? (parsed.data.title || "Untitled") : "Untitled"
        const slug = randomSlug()
        const token = randomToken()
        const now = new Date()

        const doc = db
            .insert(documents)
            .values({ slug, token, title, createdAt: now, updatedAt: now })
            .returning()
            .get()

        return doc
    })
    .patch("/docs/:slug", async ({ params, body, cookie, set }) => {
        if (!await requireAdmin(cookie, set)) {
            return { error: "Unauthorized" }
        }

        const parsed = renameDocBody.safeParse(body)
        if (!parsed.success) {
            set.status = 400
            return { error: "Invalid request" }
        }

        const updated = db
            .update(documents)
            .set({ title: parsed.data.title, updatedAt: new Date() })
            .where(eq(documents.slug, params.slug))
            .returning()
            .get()

        if (!updated) {
            set.status = 404
            return { error: "Not found" }
        }

        return updated
    })
    .delete("/docs/:slug", async ({ params, cookie, set }) => {
        if (!await requireAdmin(cookie, set)) {
            return { error: "Unauthorized" }
        }

        // Boot active connections
        bootRoom(params.slug)

        // Delete doc state and metadata
        db.delete(documentStates)
            .where(eq(documentStates.slug, params.slug))
            .run()
        db.delete(documents)
            .where(eq(documents.slug, params.slug))
            .run()

        return { ok: true }
    })
    .post("/docs/:slug/rotate-token", async ({ params, cookie, set }) => {
        if (!await requireAdmin(cookie, set)) {
            return { error: "Unauthorized" }
        }

        const token = randomToken()
        const updated = db
            .update(documents)
            .set({ token, updatedAt: new Date() })
            .where(eq(documents.slug, params.slug))
            .returning()
            .get()

        if (!updated) {
            set.status = 404
            return { error: "Not found" }
        }

        return { token: updated.token }
    })
