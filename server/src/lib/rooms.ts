import { eq } from "drizzle-orm"
import * as decoding from "lib0/decoding"
import * as encoding from "lib0/encoding"
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness"
import * as syncProtocol from "y-protocols/sync"
import * as Y from "yjs"
import { db } from "../db"
import { documentStates } from "../db/schema"

const MSG_SYNC = 0
const MSG_AWARENESS = 1
const PERSIST_DEBOUNCE_MS = 2_000
const ROOM_UNLOAD_DELAY_MS = 30_000

export interface Room {
    doc: Y.Doc
    awareness: Awareness
    conns: Map<unknown, Set<number>>
}

const rooms = new Map<string, Room>()
const persistTimers = new Map<string, Timer>()

export function getOrCreateRoom(slug: string): Room {
    const existing = rooms.get(slug)
    if (existing) return existing
    return initRoom(slug)
}

function initRoom(slug: string): Room {
    const doc = new Y.Doc()
    const awareness = new Awareness(doc)

    // Load persisted state
    const stored = db
        .select()
        .from(documentStates)
        .where(eq(documentStates.slug, slug))
        .get()
    if (stored) {
        Y.applyUpdate(doc, new Uint8Array(stored.state))
    }

    const room: Room = { doc, awareness, conns: new Map() }
    rooms.set(slug, room)

    // Broadcast doc updates to peers
    doc.on("update", (update: Uint8Array, origin: unknown) => {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, MSG_SYNC)
        syncProtocol.writeUpdate(encoder, update)
        const msg = encoding.toUint8Array(encoder)
        for (const [conn] of room.conns) {
            if (conn !== origin) {
                try {
                    ;(conn as any).send(msg)
                } catch {}
            }
        }
        schedulePersist(slug)
    })

    // Broadcast awareness updates to peers
    awareness.on(
        "update",
        ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
            // Track controlled client IDs per connection
            if (origin !== null && room.conns.has(origin)) {
                const controlled = room.conns.get(origin)!
                for (const id of added) controlled.add(id)
                for (const id of removed) controlled.delete(id)
            }
            // Broadcast
            const changedClients = [...added, ...updated, ...removed]
            const encoder = encoding.createEncoder()
            encoding.writeVarUint(encoder, MSG_AWARENESS)
            encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(awareness, changedClients))
            const msg = encoding.toUint8Array(encoder)
            for (const [conn] of room.conns) {
                if (conn !== origin) {
                    try {
                        ;(conn as any).send(msg)
                    } catch {}
                }
            }
        },
    )

    return room
}

function schedulePersist(slug: string) {
    const existing = persistTimers.get(slug)
    if (existing) clearTimeout(existing)
    persistTimers.set(slug, setTimeout(() => persistRoom(slug), PERSIST_DEBOUNCE_MS))
}

function persistRoom(slug: string) {
    const room = rooms.get(slug)
    if (!room) return
    const state = Buffer.from(Y.encodeStateAsUpdate(room.doc))
    const now = new Date()
    db.insert(documentStates)
        .values({ slug, state, updatedAt: now })
        .onConflictDoUpdate({
            target: documentStates.slug,
            set: { state, updatedAt: now },
        })
        .run()
    persistTimers.delete(slug)
}

export function handleMessage(room: Room, ws: unknown, data: Uint8Array) {
    const decoder = decoding.createDecoder(data)
    const msgType = decoding.readVarUint(decoder)

    switch (msgType) {
        case MSG_SYNC: {
            const encoder = encoding.createEncoder()
            encoding.writeVarUint(encoder, MSG_SYNC)
            syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws)
            const reply = encoding.toUint8Array(encoder)
            if (encoding.length(encoder) > 1) {
                ;(ws as any).send(reply)
            }
            break
        }
        case MSG_AWARENESS: {
            applyAwarenessUpdate(
                room.awareness,
                decoding.readVarUint8Array(decoder),
                ws,
            )
            break
        }
    }
}

export function sendSyncStep1(room: Room, ws: unknown) {
    // Send sync step 1
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_SYNC)
    syncProtocol.writeSyncStep1(encoder, room.doc)
    ;(ws as any).send(encoding.toUint8Array(encoder))

    // Send current awareness states
    const states = room.awareness.getStates()
    if (states.size > 0) {
        const awarenessEncoder = encoding.createEncoder()
        encoding.writeVarUint(awarenessEncoder, MSG_AWARENESS)
        encoding.writeVarUint8Array(
            awarenessEncoder,
            encodeAwarenessUpdate(room.awareness, Array.from(states.keys())),
        )
        ;(ws as any).send(encoding.toUint8Array(awarenessEncoder))
    }
}

export function removeConnection(slug: string, ws: unknown) {
    const room = rooms.get(slug)
    if (!room) return

    const controlled = room.conns.get(ws)
    room.conns.delete(ws)

    if (controlled && controlled.size > 0) {
        removeAwarenessStates(room.awareness, Array.from(controlled), null)
    }

    if (room.conns.size === 0) {
        persistRoom(slug)
        setTimeout(() => {
            const r = rooms.get(slug)
            if (r && r.conns.size === 0) {
                r.doc.destroy()
                rooms.delete(slug)
            }
        }, ROOM_UNLOAD_DELAY_MS)
    }
}

export function getActiveCount(slug: string): number {
    return rooms.get(slug)?.conns.size ?? 0
}

export function bootRoom(slug: string) {
    const room = rooms.get(slug)
    if (!room) return
    for (const [conn] of room.conns) {
        try {
            ;(conn as any).close(1000, "Document deleted")
        } catch {}
    }
    room.doc.destroy()
    rooms.delete(slug)
    const timer = persistTimers.get(slug)
    if (timer) {
        clearTimeout(timer)
        persistTimers.delete(slug)
    }
}
