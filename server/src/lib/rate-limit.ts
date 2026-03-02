const hits = new Map<string, number[]>()

export function rateLimit(ip: string, max = 10, windowMs = 60_000): boolean {
    const now = Date.now()
    const timestamps = hits.get(ip) ?? []
    const recent = timestamps.filter(t => now - t < windowMs)
    if (recent.length >= max) return false
    recent.push(now)
    hits.set(ip, recent)
    return true
}

// Prune expired entries every 60s
setInterval(() => {
    const now = Date.now()
    for (const [ip, timestamps] of hits) {
        const recent = timestamps.filter(t => now - t < 60_000)
        if (recent.length === 0) hits.delete(ip)
        else hits.set(ip, recent)
    }
}, 60_000)
