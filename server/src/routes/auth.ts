import { eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { z } from "zod"
import { db } from "../db"
import { refreshTokens } from "../db/schema"
import * as jwt from "../lib/jwt"
import { rateLimit } from "../lib/rate-limit"

const JWT_SECRET = process.env.JWT_SECRET!
const ADMIN_PASSPHRASE = process.env.ADMIN_PASSPHRASE!
const SESSION_EXPIRY = 60 * 60 // 1 hour
const REFRESH_EXPIRY = 7 * 24 * 60 * 60 // 7 days

const loginBody = z.object({ passphrase: z.string() })

async function hashToken(token: string): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("")
}

function randomToken(): string {
    return Array.from(
        crypto.getRandomValues(new Uint8Array(32)),
        b => b.toString(16).padStart(2, "0"),
    ).join("")
}

async function setAuthCookies(
    cookie: Record<string, any>,
): Promise<{ sessionToken: string }> {
    const sessionToken = await jwt.sign({ role: "admin" }, JWT_SECRET, SESSION_EXPIRY)
    const refresh = randomToken()
    const refreshHash = await hashToken(refresh)
    const expiresAt = new Date(Date.now() + REFRESH_EXPIRY * 1000)

    db.insert(refreshTokens)
        .values({ tokenHash: refreshHash, expiresAt })
        .run()

    cookie.session.set({
        value: sessionToken,
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: SESSION_EXPIRY,
        path: "/",
    })
    cookie.refresh.set({
        value: refresh,
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: REFRESH_EXPIRY,
        path: "/api/auth",
    })

    return { sessionToken }
}

export const authRoutes = new Elysia({ prefix: "/api" })
    .post("/auth", async ({ body, cookie, set, request }) => {
        const ip = request.headers.get("cf-connecting-ip") || "unknown"
        if (!rateLimit(ip)) {
            set.status = 429
            return { error: "Too many requests" }
        }

        const parsed = loginBody.safeParse(body)
        if (!parsed.success) {
            set.status = 400
            return { error: "Invalid request" }
        }

        if (parsed.data.passphrase !== ADMIN_PASSPHRASE) {
            set.status = 401
            return { error: "Invalid passphrase" }
        }

        await setAuthCookies(cookie)
        return { ok: true }
    })
    .post("/auth/refresh", async ({ cookie, set }) => {
        const refreshValue = cookie.refresh?.value
        if (!refreshValue) {
            set.status = 401
            return { error: "No refresh token" }
        }

        const refreshHash = await hashToken(refreshValue)
        const stored = db
            .select()
            .from(refreshTokens)
            .where(eq(refreshTokens.tokenHash, refreshHash))
            .get()

        if (!stored || stored.expiresAt < new Date()) {
            set.status = 401
            return { error: "Invalid refresh token" }
        }

        // Rotate: delete old, issue new
        db.delete(refreshTokens)
            .where(eq(refreshTokens.tokenHash, refreshHash))
            .run()

        await setAuthCookies(cookie)
        return { ok: true }
    })
    .post("/auth/logout", async ({ cookie }) => {
        const refreshValue = cookie.refresh?.value
        if (refreshValue) {
            const refreshHash = await hashToken(refreshValue)
            db.delete(refreshTokens)
                .where(eq(refreshTokens.tokenHash, refreshHash))
                .run()
        }

        cookie.session.remove()
        cookie.refresh.remove()
        return { ok: true }
    })
    .get("/me", async ({ cookie, set }) => {
        const session = cookie.session?.value
        if (!session) {
            set.status = 401
            return { error: "Unauthorized" }
        }

        const payload = await jwt.verify(session, JWT_SECRET)
        if (!payload) {
            set.status = 401
            return { error: "Unauthorized" }
        }

        return { ok: true }
    })
