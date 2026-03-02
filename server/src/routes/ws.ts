import { eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { db } from "../db"
import { documents } from "../db/schema"
import { rateLimit } from "../lib/rate-limit"
import { getOrCreateRoom, handleMessage, removeConnection, sendSyncStep1 } from "../lib/rooms"

const MAX_CONNS_PER_ROOM = 50

export const wsHandler = new Elysia()
    .ws("/ws/:slug", {
        async beforeHandle({ params, query, request, set }) {
            const ip = request.headers.get("cf-connecting-ip") || "unknown"
            if (!rateLimit(ip)) {
                set.status = 429
                return "Too many requests"
            }

            const token = (query as Record<string, string>).token
            if (!token) {
                set.status = 403
                return "Missing token"
            }

            const doc = db
                .select()
                .from(documents)
                .where(eq(documents.slug, params.slug))
                .get()

            if (!doc || doc.token !== token) {
                set.status = 403
                return "Invalid token"
            }
        },
        open(ws) {
            const slug = (ws.data as any).params.slug
            const room = getOrCreateRoom(slug)

            if (room.conns.size >= MAX_CONNS_PER_ROOM) {
                ws.close(1008, "Room is full")
                return
            }

            room.conns.set(ws, new Set())
            sendSyncStep1(room, ws)
        },
        message(ws, message) {
            const slug = (ws.data as any).params.slug
            const room = getOrCreateRoom(slug)
            const data = message instanceof ArrayBuffer
                ? new Uint8Array(message)
                : new Uint8Array(message as any)
            handleMessage(room, ws, data)
        },
        close(ws) {
            const slug = (ws.data as any).params.slug
            removeConnection(slug, ws)
        },
    })
