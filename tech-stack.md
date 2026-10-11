# Tech stack

What the projects use, so a new project or a new part starts with the same choices. Pick from the
"Preferred" column; take something else only for a reason, and write the reason into the
project's CLAUDE.md.

## Frontend

| | Preferred | Also | Notes |
|---|---|---|---|
| Framework | **React** | Solid (small apps, browser extensions), Svelte | React because of the TanStack libraries |
| Full-stack / SSR | **TanStack Start** | | server functions instead of a separate API where the app owns its backend |
| Routing | **TanStack Router** | `@solidjs/router` | file-based routes, typed links |
| Server state | **TanStack Query** | | caching, refetch, optimistic updates |
| Tables, long lists | **TanStack Table**, **TanStack Virtual** | | |
| Forms | plain controlled inputs; **TanStack Form** when a form grows | | validation with Zod |
| Components | **shadcn/ui** style: own components in the repo, built on **Radix** (React) or **Kobalte** (Solid), variants with `class-variance-authority` | | no component library as a dependency |
| CSS | **Tailwind CSS 4** | | design tokens as CSS variables, light and dark |
| Icons | **lucide** | | |
| Charts | **Chart.js** | | one library across projects |
| Localization | **Paraglide JS** (inlang) | | messages in `messages/{locale}.json`, compiled, typed |
| PWA | when the app is used on a phone or tablet | | installable, offline shell |
| Browser extensions | **Vite** with `@crxjs/vite-plugin`, Solid, Manifest V3 | | Chrome, Firefox and Edge from one code base |

## Backend

| | Preferred | Also | Notes |
|---|---|---|---|
| Language | **TypeScript** when performance is no concern: one language front and back, shared types | **Rust** for performance, low latency, system and binary work; **Go** for small static binaries on devices (CCU) | |
| Runtime (TypeScript) | **Bun** (one binary with `bun build --compile`) | Node; Deno where it is already in use (snapraid-ui) | |
| HTTP (TypeScript) | TanStack Start server routes and functions | **Hono** for a standalone API | |
| HTTP (Rust) | **axum** on **tokio** | | `tracing` for logs, `thiserror` in libraries, `anyhow` in binaries, `serde`, `reqwest` |
| Validation | **Zod** | | at every boundary: requests, config, files |
| Database | **SQLite** for a single server; **PostgreSQL** when several users or services share it | Supabase for hosted customer projects | |
| ORM / SQL | **Drizzle** (TypeScript), **sqlx** (Rust) | | migrations checked in and embedded in the binary |
| Auth | own small login for one admin (argon2id, session cookie, CSRF), passkeys with **SimpleWebAuthn**; **Better Auth** for multi-user apps | | |

## Tooling

| | Preferred | Notes |
|---|---|---|
| Format and lint (TS/JS) | **Biome** | replaces ESLint and Prettier |
| Format and lint (Rust) | `cargo fmt`, `cargo clippy -D warnings` | |
| Format and lint (Go) | `gofmt`, `go vet` | |
| Type checking | TypeScript **strict** | `tsc --noEmit` in CI |
| Package manager | **pnpm** (workspaces); **bun** where Bun is the runtime | lockfile checked in, `--frozen-lockfile` in CI |
| Build | **Vite** | `esbuild` for small scripts and plugins |
| Unit tests | **Vitest**; `cargo test`; `go test` | |
| E2E and screenshots | **Playwright** in the official Playwright image | screenshots via the "Update screenshots" workflow |

## Delivery

| | Preferred | Notes |
|---|---|---|
| CI and releases | the reusable workflows of this repository | [README](README.md) |
| Server apps | **Docker image** (Docker Hub `tristanteu/…`, amd64 and arm64), run with **Podman Quadlets** or Docker Compose | or one binary with systemd units, when the app manages the host |
| Documentation | **MkDocs Material** on GitHub Pages | the README links there |
| Repository texts | README from [templates/README.template.md](templates/README.template.md), CLAUDE.md from [templates/CLAUDE.template.md](templates/CLAUDE.template.md) | |

## Where the projects differ today

To align when a project is touched anyway:

- Formatter: ESLint in haben, ESLint and Prettier in prefixr, Prettier in fernsicht, none in
  quadeck, haul, ccu-addon-mui and gaiser-lager → Biome.
- Package manager: npm in snapraid-ui, ccu-addon-mui, reactive-volcano-app, the browser
  extensions and gaiser-lager → pnpm.
