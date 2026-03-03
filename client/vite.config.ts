import { defineConfig } from "vite"

export default defineConfig(({ command }) => {
    if (command === "build") {
        const required = ["VITE_API_URL", "VITE_WS_URL"]
        for (const key of required) {
            if (!process.env[key]) {
                throw new Error(`Missing required env var: ${key}`)
            }
        }
    }
    return {
        build: {
            outDir: "../dist/client",
        },
    }
})
