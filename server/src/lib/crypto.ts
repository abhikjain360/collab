import { timingSafeEqual } from "crypto"

export function randomToken(): string {
    return Array.from(
        crypto.getRandomValues(new Uint8Array(32)),
        b => b.toString(16).padStart(2, "0"),
    ).join("")
}

export async function hashToken(token: string): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("")
}

export function safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a)
    const bufB = Buffer.from(b)
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
}
