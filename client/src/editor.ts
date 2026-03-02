import "./style.css"
import { markdown } from "@codemirror/lang-markdown"
import { languages } from "@codemirror/language-data"
import { oneDark } from "@codemirror/theme-one-dark"
import { vim } from "@replit/codemirror-vim"
import { basicSetup, EditorView } from "codemirror"
import { yCollab } from "y-codemirror.next"
import { WebsocketProvider } from "y-websocket"
import * as Y from "yjs"
import { api } from "./api"

const app = document.getElementById("app")!

function nameToColor(name: string): string {
    let hash = 0
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    const hue = ((hash % 360) + 360) % 360
    return `hsl(${hue}, 70%, 60%)`
}

function getSlugAndToken(): { slug: string; token: string } | null {
    const pathParts = window.location.pathname.split("/d/")
    const slug = pathParts[1]
    const token = new URLSearchParams(window.location.search).get("token")
    if (!slug || !token) return null
    return { slug, token }
}

function showError(message: string) {
    app.innerHTML = `
        <div class="login-container">
            <h1>collab</h1>
            <div style="color:#f44747">${message}</div>
        </div>
    `
}

function promptForName(): Promise<string> {
    return new Promise(resolve => {
        const overlay = document.createElement("div")
        overlay.className = "modal-overlay"
        overlay.innerHTML = `
            <div class="modal">
                <h2>enter your display name</h2>
                <input type="text" id="name-input" placeholder="your name" autofocus />
                <button id="join-btn">join</button>
            </div>
        `
        document.body.appendChild(overlay)

        const input = overlay.querySelector("#name-input") as HTMLInputElement
        const btn = overlay.querySelector("#join-btn") as HTMLButtonElement

        function submit() {
            const name = input.value.trim()
            if (!name) return
            localStorage.setItem("collab-display-name", name)
            overlay.remove()
            resolve(name)
        }

        btn.addEventListener("click", submit)
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") submit()
        })
    })
}

function renderCollaborators(awareness: WebsocketProvider["awareness"]) {
    const container = document.querySelector(".collaborators")
    if (!container) return

    const states = awareness.getStates()
    const users: { name: string; color: string }[] = []

    states.forEach((state, clientId) => {
        if (clientId === awareness.clientID) return
        if (state.user) users.push(state.user)
    })

    container.innerHTML = users
        .map(u => `
            <span class="collaborator-badge">
                <span class="collaborator-dot" style="background:${u.color}"></span>
                ${u.name}
            </span>
        `)
        .join("")
}

async function init() {
    const params = getSlugAndToken()
    if (!params) {
        showError("invalid link — missing slug or token")
        return
    }

    const { slug, token } = params

    // Validate token
    const { data, error } = await api.api.docs({ slug }).validate.post({ token })
    if (error) {
        showError("invalid or expired link")
        return
    }

    const title = (data as any).title || "Untitled"

    // Get display name
    let displayName = localStorage.getItem("collab-display-name")
    if (!displayName) {
        displayName = await promptForName()
    }

    // Set up editor chrome
    app.innerHTML = `
        <div class="editor-container">
            <div class="editor-topbar">
                <span class="title">${title}</span>
                <div class="collaborators"></div>
            </div>
            <div id="editor"></div>
        </div>
    `

    // Yjs setup
    const ydoc = new Y.Doc()
    const ytext = ydoc.getText("content")

    const wsUrl = import.meta.env.VITE_WS_URL || "wss://api.collab.abhikja.in/ws"
    const wsProvider = new WebsocketProvider(wsUrl, slug, ydoc, {
        params: { token },
    })

    wsProvider.awareness.setLocalStateField("user", {
        name: displayName,
        color: nameToColor(displayName),
    })

    // Update collaborator badges on awareness change
    wsProvider.awareness.on("change", () => {
        renderCollaborators(wsProvider.awareness)
    })

    // CodeMirror setup
    const _editor = new EditorView({
        parent: document.getElementById("editor")!,
        extensions: [
            vim(),
            basicSetup,
            markdown({ codeLanguages: languages }),
            oneDark,
            yCollab(ytext, wsProvider.awareness),
            EditorView.theme({
                "&": { height: "100%", flex: "1" },
                ".cm-scroller": { overflow: "auto" },
            }),
        ],
    })
}

init()
