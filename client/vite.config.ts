import { resolve } from "path"
import type { Plugin } from "vite"
import { defineConfig } from "vite"

function rewriteRoutes(): Plugin {
    return {
        name: "rewrite-routes",
        configureServer(server) {
            server.middlewares.use((req, _res, next) => {
                if (req.url?.match(/^\/d\/.+/)) {
                    req.url = "/d/index.html"
                }
                next()
            })
        },
    }
}

export default defineConfig({
    plugins: [rewriteRoutes()],
    build: {
        outDir: "../dist/client",
        rollupOptions: {
            input: {
                main: resolve(__dirname, "index.html"),
                editor: resolve(__dirname, "d/index.html"),
            },
        },
    },
})
