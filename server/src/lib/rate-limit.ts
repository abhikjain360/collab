const WINDOW_MS = 60_000
const MAX_HITS = 10

const hits = new Map<string, number[]>()

export function rateLimit(ip: string): boolean {
    const now = Date.now()
    const timestamps = hits.get(ip) ?? []
    const recent = timestamps.filter(t => now - t < WINDOW_MS)
    if (recent.length >= MAX_HITS) return false
    recent.push(now)
    hits.set(ip, recent)
    return true
}

// Prune expired entries periodically
setInterval(() => {
    const now = Date.now()
    for (const [ip, timestamps] of hits) {
        const recent = timestamps.filter(t => now - t < WINDOW_MS)
        if (recent.length === 0) hits.delete(ip)
        else hits.set(ip, recent)
    }
}, WINDOW_MS)
