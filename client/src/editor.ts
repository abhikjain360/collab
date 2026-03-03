import "./style.css"
import { catppuccinMocha } from "@catppuccin/codemirror"
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete"
import { indentWithTab } from "@codemirror/commands"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { cpp } from "@codemirror/lang-cpp"
import { javascript } from "@codemirror/lang-javascript"
import { markdown } from "@codemirror/lang-markdown"
import { python } from "@codemirror/lang-python"
import { rust } from "@codemirror/lang-rust"
import { indentUnit } from "@codemirror/language"
import {
    bracketMatching,
    defaultHighlightStyle,
    foldGutter,
    foldKeymap,
    indentOnInput,
    syntaxHighlighting,
} from "@codemirror/language"
import { languages } from "@codemirror/language-data"
import { lintKeymap } from "@codemirror/lint"
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search"
import { Compartment, EditorState } from "@codemirror/state"
import {
    crosshairCursor,
    drawSelection,
    dropCursor,
    highlightSpecialChars,
    keymap,
    lineNumbers,
    rectangularSelection,
} from "@codemirror/view"
import { vim } from "@replit/codemirror-vim"
import { EditorView } from "codemirror"
import { yCollab } from "y-codemirror.next"
import { WebsocketProvider } from "y-websocket"
import * as Y from "yjs"
import { api } from "./api"
import { escapeHtml, sanitizeColor } from "./utils"

const app = document.getElementById("app")!

const langOptions: Record<string, () => ReturnType<typeof markdown>> = {
    "markdown": () => markdown({ codeLanguages: languages }),
    "typescript": () => javascript({ typescript: true }),
    "javascript": () => javascript(),
    "python": () => python(),
    "c": () => cpp(),
    "c++": () => cpp(),
    "rust": () => rust(),
    "bash": () => languages.find(l => l.name === "Shell")?.support ?? markdown(),
    "dockerfile": () => languages.find(l => l.name === "Dockerfile")?.support ?? markdown(),
}

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
            <div style="color:var(--ctp-red)">${escapeHtml(message)}</div>
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
                <span class="collaborator-dot" style="background:${sanitizeColor(u.color, "#888")}"></span>
                ${escapeHtml(u.name)}
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

    const validated = data as { title: string; language: string }
    const title = validated.title || "Untitled"
    const savedLang = validated.language || "markdown"

    // Get display name
    let displayName = localStorage.getItem("collab-display-name")
    if (!displayName) {
        displayName = await promptForName()
    }

    // Set up editor chrome
    const initialLang = langOptions[savedLang] ? savedLang : "markdown"
    const langSelectOptions = Object.keys(langOptions)
        .map(l => `<option value="${l}"${l === initialLang ? " selected" : ""}>${l}</option>`)
        .join("")

    app.innerHTML = `
        <div class="editor-container">
            <div class="editor-topbar">
                <span class="title">${escapeHtml(title)}</span>
                <div class="controls">
                    <select class="lang-select" id="lang-select">${langSelectOptions}</select>
                    <div class="collaborators"></div>
                </div>
            </div>
            <div id="editor"></div>
        </div>
    `

    // Yjs setup
    const ydoc = new Y.Doc()
    const ytext = ydoc.getText("content")

    const wsUrl = import.meta.env.VITE_WS_URL as string
    const wsProvider = new WebsocketProvider(wsUrl, slug, ydoc, {
        params: { token },
    })

    const userColor = nameToColor(displayName)
    wsProvider.awareness.setLocalStateField("user", {
        name: displayName,
        color: userColor,
        colorLight: userColor.replace(")", ", 0.2)").replace("hsl(", "hsla("),
    })

    // Update collaborator badges on awareness change
    wsProvider.awareness.on("change", () => {
        renderCollaborators(wsProvider.awareness)
    })

    // Language compartment for hot-swapping
    const langCompartment = new Compartment()

    // CodeMirror setup
    const initialLangExt = langOptions[initialLang]()
    const editor = new EditorView({
        parent: document.getElementById("editor")!,
        extensions: [
            vim(),
            lineNumbers(),
            highlightSpecialChars(),
            history(),
            foldGutter(),
            drawSelection(),
            dropCursor(),
            EditorState.allowMultipleSelections.of(true),
            indentOnInput(),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
            bracketMatching(),
            closeBrackets(),
            autocompletion(),
            rectangularSelection(),
            crosshairCursor(),
            highlightSelectionMatches(),
            keymap.of([
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...searchKeymap,
                ...historyKeymap,
                ...foldKeymap,
                ...completionKeymap,
                ...lintKeymap,
                indentWithTab,
            ]),
            EditorState.tabSize.of(4),
            indentUnit.of("    "),
            langCompartment.of(initialLangExt),
            catppuccinMocha,
            yCollab(ytext, wsProvider.awareness),
            EditorView.theme({
                "&": { height: "100%", flex: "1" },
                ".cm-scroller": { overflow: "auto" },
            }),
        ],
    })

    // Language switcher
    document.getElementById("lang-select")!.addEventListener("change", (e) => {
        const lang = (e.target as HTMLSelectElement).value
        const langFn = langOptions[lang]
        if (langFn) {
            editor.dispatch({
                effects: langCompartment.reconfigure(langFn()),
            })
            api.api.docs({ slug }).language.post({ token, language: lang })
        }
    })
}

init()
