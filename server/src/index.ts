import { Elysia } from "elysia"
import { persistAllRooms } from "./lib/rooms"
import { authRoutes } from "./routes/auth"
import { docRoutes } from "./routes/docs"
import { wsHandler } from "./routes/ws"

const CORS_ORIGIN = process.env.CORS_ORIGIN || "https://collab.abhikja.in"
const PORT = parseInt(process.env.PORT || "3000")
const TLS_CERT_PATH = process.env.TLS_CERT_PATH
const TLS_KEY_PATH = process.env.TLS_KEY_PATH

const app = new Elysia()
    .onRequest(({ request, set }) => {
        set.headers["Access-Control-Allow-Origin"] = CORS_ORIGIN
        set.headers["Access-Control-Allow-Credentials"] = "true"
        set.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
        set.headers["Access-Control-Allow-Headers"] = "Content-Type"

        if (request.method === "OPTIONS") {
            set.status = 204
            return new Response(null, { status: 204 })
        }
    })
    .use(authRoutes)
    .use(docRoutes)
    .use(wsHandler)
    .listen(
        TLS_CERT_PATH && TLS_KEY_PATH
            ? {
                  port: PORT,
                  tls: {
                      cert: Bun.file(TLS_CERT_PATH),
                      key: Bun.file(TLS_KEY_PATH),
                  },
              }
            : PORT,
    )

console.log(`collab server running on :${PORT}${TLS_CERT_PATH ? " (tls)" : ""}`)

function shutdown() {
    console.log("shutting down, persisting rooms...")
    persistAllRooms()
    process.exit(0)
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)

export type App = typeof app
