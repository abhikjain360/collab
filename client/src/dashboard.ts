import "./style.css"
import { api } from "./api"

const app = document.getElementById("app")!

async function checkAuth(): Promise<boolean> {
    const { error } = await api.api.me.get()
    return !error
}

function renderLogin() {
    app.innerHTML = `
        <div class="login-container">
            <h1>collab</h1>
            <input type="password" id="passphrase" placeholder="passphrase" autofocus />
            <div class="error" id="login-error"></div>
        </div>
    `

    const input = document.getElementById("passphrase") as HTMLInputElement
    const errorEl = document.getElementById("login-error")!

    input.addEventListener("keydown", async (e) => {
        if (e.key !== "Enter") return
        errorEl.textContent = ""

        const { error } = await api.api.auth.post({
            passphrase: input.value,
        })

        if (error) {
            errorEl.textContent = "invalid passphrase"
            input.value = ""
            return
        }

        renderDashboard()
    })
}

interface Doc {
    id: number
    slug: string
    token: string
    title: string
    createdAt: Date
    updatedAt: Date
    activeCount: number
}

async function renderDashboard() {
    app.innerHTML = `
        <div class="dashboard">
            <div class="dashboard-header">
                <h1>collab</h1>
                <div style="display:flex;gap:0.5rem">
                    <button id="new-doc-btn">new document</button>
                    <button id="logout-btn">logout</button>
                </div>
            </div>
            <div class="doc-list" id="doc-list">loading...</div>
        </div>
    `

    document.getElementById("new-doc-btn")!.addEventListener("click", async () => {
        await api.api.docs.post({})
        await loadDocs()
    })

    document.getElementById("logout-btn")!.addEventListener("click", async () => {
        await api.api.auth.logout.post()
        renderLogin()
    })

    await loadDocs()
}

async function loadDocs() {
    const docList = document.getElementById("doc-list")!
    const { data, error } = await api.api.docs.get()

    if (error) {
        docList.textContent = "failed to load documents"
        return
    }

    const docs = data as unknown as Doc[]
    if (docs.length === 0) {
        docList.innerHTML = '<div style="color:#666">no documents yet</div>'
        return
    }

    docList.innerHTML = docs
        .map(doc => `
            <div class="doc-row" data-slug="${doc.slug}">
                <span class="doc-title" data-action="open" data-slug="${doc.slug}" data-token="${doc.token}">
                    ${escapeHtml(doc.title)}
                </span>
                ${doc.activeCount > 0 ? `<span class="active-count">${doc.activeCount} active</span>` : ""}
                <span class="doc-meta">${doc.slug}</span>
                <div class="doc-actions">
                    <button data-action="copy" data-slug="${doc.slug}" data-token="${doc.token}">copy link</button>
                    <button data-action="rename" data-slug="${doc.slug}">rename</button>
                    <button data-action="rotate" data-slug="${doc.slug}">rotate token</button>
                    <button data-action="delete" data-slug="${doc.slug}">delete</button>
                </div>
            </div>
        `)
        .join("")

    docList.removeEventListener("click", handleDocAction)
    docList.addEventListener("click", handleDocAction)
}

async function handleDocAction(e: Event) {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-action]")
    if (!target) return
    const action = target.dataset.action
    const slug = target.dataset.slug
    if (!action || !slug) return

    switch (action) {
        case "open": {
            const token = target.dataset.token
            window.location.href = `/d/${slug}?token=${token}`
            break
        }
        case "copy": {
            const token = target.dataset.token
            const origin = window.location.origin
            await navigator.clipboard.writeText(`${origin}/d/${slug}?token=${token}`)
            target.textContent = "copied!"
            setTimeout(() => {
                target.textContent = "copy link"
            }, 1500)
            break
        }
        case "rename": {
            const row = document.querySelector(`.doc-row[data-slug="${slug}"]`)
            const titleSpan = row?.querySelector(".doc-title") as HTMLElement | null
            if (!titleSpan) return
            startInlineRename(slug, titleSpan)
            break
        }
        case "rotate": {
            if (!confirm("Rotate access token? Existing share links will stop working.")) return
            await api.api.docs({ slug })["rotate-token"].post()
            await loadDocs()
            break
        }
        case "delete": {
            if (!confirm(`Delete "${slug}"? This cannot be undone.`)) return
            await api.api.docs({ slug }).delete()
            await loadDocs()
            break
        }
    }
}

function startInlineRename(slug: string, titleSpan: HTMLElement) {
    const currentTitle = titleSpan.textContent?.trim() || ""
    const input = document.createElement("input")
    input.type = "text"
    input.value = currentTitle
    input.className = "rename-input"
    titleSpan.replaceWith(input)
    input.focus()
    input.select()

    let saved = false
    async function save() {
        if (saved) return
        saved = true
        const newTitle = input.value.trim()
        if (newTitle && newTitle !== currentTitle) {
            await api.api.docs({ slug }).patch({ title: newTitle })
        }
        await loadDocs()
    }

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") save()
        if (e.key === "Escape") loadDocs()
    })
    input.addEventListener("blur", save)
}

function escapeHtml(str: string): string {
    const div = document.createElement("div")
    div.textContent = str
    return div.innerHTML
}

// Init
async function init() {
    if (await checkAuth()) {
        renderDashboard()
    } else {
        renderLogin()
    }
}

init()
