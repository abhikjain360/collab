import { eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { z } from "zod"
import { db } from "../db"
import { refreshTokens } from "../db/schema"
import { env } from "../env"
import { hashToken, randomToken, safeEqual } from "../lib/crypto"
import * as jwt from "../lib/jwt"
import { rateLimit } from "../lib/rate-limit"

const SESSION_EXPIRY = 60 * 60 // 1 hour
const REFRESH_EXPIRY = 7 * 24 * 60 * 60 // 7 days

const loginBody = z.object({ passphrase: z.string() })

async function setAuthCookies(
    cookie: Record<string, any>,
): Promise<{ sessionToken: string }> {
    const sessionToken = await jwt.sign({ role: "admin" }, env.JWT_SECRET, SESSION_EXPIRY)
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

        if (!safeEqual(parsed.data.passphrase, env.ADMIN_PASSPHRASE)) {
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

        const refreshHash = await hashToken(refreshValue as string)
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
            const refreshHash = await hashToken(refreshValue as string)
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

        const payload = await jwt.verify(session as string, env.JWT_SECRET)
        if (!payload) {
            set.status = 401
            return { error: "Unauthorized" }
        }

        return { ok: true }
    })
