export function escapeHtml(str: string): string {
    const div = document.createElement("div")
    div.textContent = str
    return div.innerHTML
}

const CSS_COLOR_RE = /^(#[\da-fA-F]{3,8}|hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*(,\s*[\d.]+\s*)?\))$/

export function sanitizeColor(color: string, fallback: string): string {
    return CSS_COLOR_RE.test(color) ? color : fallback
}
