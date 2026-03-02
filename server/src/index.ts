import { Elysia } from "elysia"
import { authRoutes } from "./routes/auth"
import { docRoutes } from "./routes/docs"
import { wsHandler } from "./routes/ws"

const CORS_ORIGIN = process.env.CORS_ORIGIN || "https://collab.abhikja.in"
const PORT = parseInt(process.env.PORT || "3000")

const app = new Elysia()
    .onBeforeHandle(({ request, set }) => {
        set.headers["Access-Control-Allow-Origin"] = CORS_ORIGIN
        set.headers["Access-Control-Allow-Credentials"] = "true"
        set.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
        set.headers["Access-Control-Allow-Headers"] = "Content-Type"

        if (request.method === "OPTIONS") {
            set.status = 204
            return ""
        }
    })
    .use(authRoutes)
    .use(docRoutes)
    .use(wsHandler)
    .listen(PORT)

console.log(`collab server running on :${PORT}`)

export type App = typeof app
