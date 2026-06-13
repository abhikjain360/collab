import { treaty } from "@elysiajs/eden"
import type { App } from "../../server/src"

const API_URL = import.meta.env.VITE_API_URL as string

// Single-flight refresh so concurrent 401s don't race the rotating refresh token
// (the server deletes the old refresh token when it issues a new one).
let refreshInFlight: Promise<boolean> | null = null

function refreshSession(): Promise<boolean> {
    refreshInFlight ??= fetch(`${API_URL}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
    })
        .then(res => res.ok)
        .catch(() => false)
        .finally(() => {
            refreshInFlight = null
        })
    return refreshInFlight
}

function urlOf(input: RequestInfo | URL): string {
    if (typeof input === "string") return input
    if (input instanceof URL) return input.href
    return input.url
}

// Transparently renew an expired session from the refresh token and retry once,
// so an open dashboard keeps working past the session lifetime without a re-login.
async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const res = await fetch(input, init)
    if (res.status !== 401) return res

    // Never refresh-loop on the auth endpoints themselves (login/refresh/logout).
    if (urlOf(input).includes("/api/auth")) return res

    if (!await refreshSession()) return res
    return fetch(input, init)
}

export const api = treaty<App>(API_URL, {
    // eden only invokes the fetcher; cast past the `preconnect` static on `typeof fetch`.
    fetcher: authFetch as typeof fetch,
    fetch: { credentials: "include" },
})
