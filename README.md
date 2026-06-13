# collab

A simple single-user live collaboration over docs thing. Allows sharing an edit link to allow working with other people without signing in.

The owner signs in with a passphrase and creates documents. Each document gets a secret share link (`/d/<slug>?token=<token>`) that anyone can open to edit collaboratively in real time — no account needed.

## Stack

- **Client** — Vite + TypeScript, [CodeMirror 6](https://codemirror.net/) editor, [Yjs](https://yjs.dev/) CRDT over a WebSocket provider.
- **Server** — [Bun](https://bun.sh/) + [Elysia](https://elysiajs.com/), Yjs document rooms over WebSockets, [Drizzle ORM](https://orm.drizzle.team/) on SQLite for document metadata and persisted state.

## Development

Requires [Bun](https://bun.sh/). A Nix flake (`flake.nix`) provides a dev shell with `bun`, `dprint`, and `oxlint`.

```sh
bun install

# copy and edit the example env files
cp server/.env.example server/.env.development
cp client/.env.example client/.env.development

bun run dev:server   # API + WebSocket on :3000
bun run dev:client   # Vite dev server on :5173
```

Useful scripts (run from the repo root):

| Command                             | Description                                  |
| ----------------------------------- | -------------------------------------------- |
| `bun run check`                     | Type-check both workspaces (`tsgo --noEmit`) |
| `bun run lint`                      | Lint with oxlint                             |
| `bun run fmt` / `bun run fmt:check` | Format / check formatting with dprint        |
| `bun run build`                     | Build client and server                      |

## Environment

**Server** (`server/.env.*`):

| Var                             | Description                                                                 |
| ------------------------------- | --------------------------------------------------------------------------- |
| `PORT`                          | Port to listen on                                                           |
| `CORS_ORIGIN`                   | Allowed origin for the client (credentials are sent, so this must be exact) |
| `ADMIN_PASSPHRASE`              | Passphrase for the owner login                                              |
| `JWT_SECRET`                    | Secret used to sign session tokens                                          |
| `DATABASE_PATH`                 | Path to the SQLite database file                                            |
| `TLS_CERT_PATH`, `TLS_KEY_PATH` | Optional — enable TLS when both are set                                     |

**Client** (`client/.env.*`):

| Var            | Description                         |
| -------------- | ----------------------------------- |
| `VITE_API_URL` | Base URL of the server API          |
| `VITE_WS_URL`  | WebSocket URL (`/ws`) of the server |

Database migrations live in `server/drizzle/` and are applied automatically on server startup.

## Deployment

`bun run build` compiles a standalone server binary to `dist/server/server` and the static client to `dist/client/`. `setup-service.sh` installs the server as a systemd unit (reads `server/.env.production`, grants `cap_net_bind_service` for low ports).
