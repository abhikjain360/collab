import { Elysia } from "elysia"
import { env } from "./env"
import { persistAllRooms } from "./lib/rooms"
import { authRoutes } from "./routes/auth"
import { docRoutes } from "./routes/docs"
import { wsHandler } from "./routes/ws"

const app = new Elysia()
    .onRequest(({ request, set }) => {
        set.headers["Access-Control-Allow-Origin"] = env.CORS_ORIGIN
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
        env.TLS_CERT_PATH && env.TLS_KEY_PATH
            ? {
                port: env.PORT,
                tls: {
                    cert: Bun.file(env.TLS_CERT_PATH),
                    key: Bun.file(env.TLS_KEY_PATH),
                },
            }
            : env.PORT,
    )

console.log(`collab server running on :${env.PORT}${env.TLS_CERT_PATH ? " (tls)" : ""}`)

function shutdown() {
    console.log("shutting down, persisting rooms...")
    persistAllRooms()
    process.exit(0)
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)

export type App = typeof app
