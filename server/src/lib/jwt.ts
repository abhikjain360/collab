const te = new TextEncoder()
const td = new TextDecoder()
const keyCache = new Map<string, CryptoKey>()

function base64urlEncode(data: Uint8Array): string {
    return btoa(String.fromCharCode(...data))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "")
}

function base64urlDecode(str: string): Uint8Array<ArrayBuffer> {
    const base64 = str.replace(/-/g, "+").replace(/_/g, "/")
    const binary = atob(base64)
    return new Uint8Array([...binary].map(c => c.charCodeAt(0)))
}

async function getKey(secret: string): Promise<CryptoKey> {
    let key = keyCache.get(secret)
    if (!key) {
        key = await crypto.subtle.importKey(
            "raw",
            te.encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign", "verify"],
        )
        keyCache.set(secret, key)
    }
    return key
}

export async function sign(
    payload: Record<string, unknown>,
    secret: string,
    expiresInSeconds: number,
): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds }
    const header = base64urlEncode(te.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })))
    const body = base64urlEncode(te.encode(JSON.stringify(fullPayload)))
    const key = await getKey(secret)
    const sig = await crypto.subtle.sign("HMAC", key, te.encode(`${header}.${body}`))
    return `${header}.${body}.${base64urlEncode(new Uint8Array(sig))}`
}

export async function verify<T = Record<string, unknown>>(
    token: string,
    secret: string,
): Promise<T | null> {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const [header, body, sig] = parts
    const key = await getKey(secret)
    const valid = await crypto.subtle.verify(
        "HMAC",
        key,
        base64urlDecode(sig),
        te.encode(`${header}.${body}`),
    )
    if (!valid) return null
    try {
        const decoded = JSON.parse(td.decode(base64urlDecode(body)))
        if (decoded.exp && Date.now() / 1000 > decoded.exp) return null
        return decoded as T
    } catch {
        return null
    }
}
