import { treaty } from "@elysiajs/eden"
import type { App } from "../../server/src"

const API_URL = import.meta.env.VITE_API_URL || "collabapi.abhikja.in"

export const api = treaty<App>(API_URL, {
    fetch: { credentials: "include" },
})
