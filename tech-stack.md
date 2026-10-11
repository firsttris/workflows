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
| Charts | **uPlot** (22 KB gzip, fast with many points, any framework) with one small wrapper per framework that reads the colours from the theme's CSS variables | own SVG for sparklines and charts with a few dozen points | no big chart libraries (Recharts 3 adds about 104 KB gzip, Chart.js about 55 KB); existing own charts (ccu-addon-mui, quadeck) stay while they are enough |
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

## Desktop apps

| | Preferred | Notes |
|---|---|---|
| Framework | **Tauri 2**: a Rust core with the web UI of the frontend stack above (React, TanStack, Tailwind) in the system's web view | a few MB instead of Electron's ~100 MB; on Linux it needs WebKitGTK. A tool without a window (like `haul-cnl`) is a plain Rust binary |
| Structure | the desktop crate outside the main Cargo workspace, built and tested by its own CI job | keeps WebKitGTK out of the other builds (fernsicht) |
| Commands | small `#[tauri::command]` functions at the edge, the logic in pure Rust functions with unit tests | typed TypeScript bindings with **tauri-specta** once it is stable (2.x is still a release candidate) |
| Security | capabilities with only the permissions each window needs, a strict CSP in `tauri.conf.json` | no remote content in the app window |
| Plugins | the official ones as needed: `updater`, `single-instance`, `window-state`, `store`, `dialog`, `notification`, `autostart`, `deep-link`, `log` | |
| Helper programs | sidecars (`bundle.externalBin`) | fernsicht ships its client and host agent this way |
| Packages | Linux: **AppImage**, plus `.deb`/`.rpm` or Flatpak where users expect them; Windows: NSIS installer; macOS: `.dmg` | macOS needs an Apple Developer account and notarization, Windows a code signing certificate; without them the systems warn on first start |
| Updates | `tauri-plugin-updater` with its own signing key (required), `latest.json` in the GitHub release | |
| Release | **tauri-action** builds every platform and uploads the bundles and `latest.json` to the release | one version in `Cargo.toml`, `tauri.conf.json` and `package.json`, raised together by the bump workflow |
| Tests | Rust unit and integration tests; the UI with Vitest and with Playwright in a browser, IPC mocked through `@tauri-apps/api/mocks`; the real app end to end with WebdriverIO's Tauri service | the official `tauri-driver` covers Linux and Windows only |

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
- Charts: Chart.js in snapraid-ui → uPlot when the project is touched anyway.
- Desktop releases: fernsicht builds only the AppImage with its own script; a reusable Tauri release
  workflow (tauri-action, all platforms, updater) does not exist here yet.
- Package manager: npm in snapraid-ui, ccu-addon-mui, reactive-volcano-app, the browser
  extensions and gaiser-lager → pnpm.
