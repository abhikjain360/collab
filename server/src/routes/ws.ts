import { eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { db } from "../db"
import { documents } from "../db/schema"
import { safeEqual } from "../lib/crypto"
import { rateLimit } from "../lib/rate-limit"
import { getOrCreateRoom, handleMessage, removeConnection, sendSyncStep1, type WSConn } from "../lib/rooms"

const MAX_CONNS_PER_ROOM = 50

type WsData = { params: { slug: string }; query: Record<string, string> }

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

            if (!doc || !safeEqual(doc.token, token)) {
                set.status = 403
                return "Invalid token"
            }
        },
        open(ws) {
            const slug = (ws.data as WsData).params.slug
            const room = getOrCreateRoom(slug)

            if (room.conns.size >= MAX_CONNS_PER_ROOM) {
                ws.close(1008, "Room is full")
                return
            }

            room.conns.set(ws.raw as WSConn, new Set())
            sendSyncStep1(room, ws.raw as WSConn)
        },
        message(ws, message) {
            const slug = (ws.data as WsData).params.slug
            const room = getOrCreateRoom(slug)
            const data = message instanceof Uint8Array
                ? message
                : new Uint8Array(message as ArrayBuffer)
            handleMessage(room, ws.raw as WSConn, data)
        },
        close(ws) {
            const slug = (ws.data as WsData).params.slug
            removeConnection(slug, ws.raw as WSConn)
        },
    })
