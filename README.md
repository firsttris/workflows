# workflows

Shared GitHub Actions workflows for my projects.

## Docker release

[`.github/workflows/docker-release.yml`](.github/workflows/docker-release.yml) builds a multi-arch
image, pushes it to Docker Hub (and optionally GHCR), updates the Docker Hub description from the
README and creates the GitHub release. Each project keeps its own CI and calls this after it.

Each platform builds in its own job: `amd64` on a normal runner, `arm64` on GitHub's native ARM
runner (free for public repositories, far faster than emulation, which matters for Rust). A merge job
joins them into one multi-arch tag, so `docker pull` picks the right one on a PC, a NAS or a
Raspberry Pi.

| Run | Image tags | GitHub release |
|---|---|---|
| tag `vX.Y.Z` pushed | `x.y.z`, `x.y`, `latest` | yes, with generated notes, after the image is out |
| tag `vX.Y.Z-rc.N` pushed (any version with a `-`) | `x.y.z-rc.N`, `next` | yes, as a pre-release; the Docker Hub description stays |
| run by hand on a branch | `edge` | no |

On a tag, the tag must match the version in `package.json` (or `Cargo.toml`), otherwise nothing is
published.

### Usage

`.github/workflows/release.yml` in a project:

```yaml
name: Release

on:
  push:
    tags: ["v*"]
  workflow_dispatch:

jobs:
  checks:
    uses: ./.github/workflows/ci.yml   # the project's CI, with `workflow_call:` as a trigger

  docker:
    needs: checks
    uses: firsttris/workflows/.github/workflows/docker-release.yml@v1
    with:
      image: tristanteu/namarr
      description: FileBot-style media matching and ReNamer-style rule renaming in one self-hosted web UI
      ghcr: true
    secrets: inherit
    permissions:
      contents: write
      packages: write
```

A new version is then the button from [Bump version](#bump-version), or on a checkout
`npm version minor && git push --follow-tags` (or `bun run release:minor` with the scripts below in
`package.json`):

```json
"release:patch": "npm version patch",
"release:minor": "npm version minor",
"release:major": "npm version major",
"postversion": "git push --follow-tags"
```

### Inputs

| Input | Default | |
|---|---|---|
| `image` | – | Docker Hub image, e.g. `tristanteu/namarr` (required) |
| `description` | `""` | Docker Hub short description (max. 100 characters); empty keeps the current one |
| `dockerfile` | `docker/Dockerfile` | |
| `context` | `.` | |
| `platforms` | `linux/amd64,linux/arm64` | comma-separated; anything but amd64 and arm64 (e.g. `linux/arm/v7`) builds under QEMU |
| `native-runners` | `true` | build `arm64` on the ARM runner; `false` builds it under QEMU (private repositories without ARM runners) |
| `ghcr` | `false` | also push `ghcr.io/<owner>/<repo>` (or `ghcr-image`) |
| `ghcr-image` | `""` | GHCR image without `ghcr.io/` for a second image of the repository, e.g. `firsttris/haben-backup`; also names its build cache |
| `cache` | `true` | keep the build cache in `ghcr.io/<ghcr image>-buildcache` (the job needs `packages: write`) |
| `version-file` | `package.json` | `package.json` or `Cargo.toml` that must match the tag; `""` skips the check |
| `readme` | `README.md` | README for Docker Hub, relative links and images made absolute; `""` skips it |
| `github-release` | `true` | create the GitHub release on a version tag; `false` for a second image, so only one call creates it |
| `release-artifact` | `""` | name of an artifact uploaded earlier in the same run; its files are attached to the release |
| `dockerhub-user` | `tristanteu` | |

Secret: `DOCKER_PAT`, a Docker Hub access token (`secrets: inherit` passes it on).

**Build cache.** Each platform keeps its cache in the registry,
`ghcr.io/<owner>/<repo>-buildcache:linux-amd64` and `:linux-arm64`, not in the Actions cache. An
Actions cache written on tag `v1.2.3` can't be read on `v1.2.4` (only the same ref and the default
branch are), so before, every release compiled everything again, and arm64, which nothing on `main`
ever wrote, always did. The CI's image check shares the amd64 cache through
[`actions/docker-build`](#docker-build-for-the-ci).
Outputs: `version`, the published `x.y.z` or `x.y.z-rc.N` (empty for `edge`), and `prerelease`
(`'true'` for a version with a `-`).

### Examples

**Rust project** (haul): the version comes from `Cargo.toml`, the browser extension is attached
to the release, `arm64` compiles on the native ARM runner.

```yaml
jobs:
  checks:
    uses: ./.github/workflows/ci.yml
  extension:
    uses: ./.github/workflows/extension.yml   # uploads the artifact "haul-extension"
  docker:
    needs: [checks, extension]
    uses: firsttris/workflows/.github/workflows/docker-release.yml@v1
    with:
      image: tristanteu/haul
      description: Self-hosted download manager for file hosters, with web UI, plugins and auto-extract
      version-file: Cargo.toml
      release-artifact: haul-extension
    secrets: inherit
    permissions:
      contents: write
      packages: write
```

**Without a version file** (the tag alone is the version): `version-file: ""`.

## Tested on main

[`.github/workflows/tested-on-main.yml`](.github/workflows/tested-on-main.yml) tells a release
whether `main`'s CI already tested the code, so it doesn't run the whole CI again before building.
A release commit from *Bump version* changes only version numbers (and starts no CI), so the green
push runs of the commit before it count, also over several release commits in a row without CI runs
of their own (`1.3.0-rc.1`, then `1.3.0`); any other commit needs green push runs of its own, even
one that only bumps a dependency's version.

```yaml
jobs:
  tested:
    uses: firsttris/workflows/.github/workflows/tested-on-main.yml@v1
    # with:
    #   workflows: build.yml, playwright-e2e.yml   # default ci.yml
    permissions:
      actions: read
      contents: read

  checks:
    needs: tested
    if: needs.tested.outputs.tested != 'true'
    uses: ./.github/workflows/ci.yml

  docker:
    needs: [tested, checks]
    # The checks either passed or were not needed
    if: ${{ !cancelled() && needs.tested.result == 'success' && needs.checks.result != 'failure' }}
    uses: firsttris/workflows/.github/workflows/docker-release.yml@v1
    # ...
```

## Docker build for the CI

[`actions/docker-build`](actions/docker-build/action.yml) builds the image in the CI's image check
and loads it into the local Docker, with the same registry cache as the release's amd64 build:

```yaml
  docker:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write   # keeps the cache
    steps:
      - uses: actions/checkout@v4
      - uses: firsttris/workflows/actions/docker-build@v1
        with:
          dockerfile: docker/Dockerfile
          tags: namarr:ci
      - run: docker run --rm namarr:ci --version
```

## apt install

[`actions/apt-install`](actions/apt-install/action.yml) installs Ubuntu packages with the downloaded
packages and the package lists in the Actions cache, and without the man-db trigger. The mirror the
runners use is sometimes very slow (100 MB at 130 kB/s, 13 minutes for the FFmpeg headers); with
the cache only a new runner image or a changed package list downloads again.

```yaml
      - uses: firsttris/workflows/actions/apt-install@v1
        with:
          packages: libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev
          # recommends: false   # --no-install-recommends
```

## Releases in every project

The same scheme everywhere, whatever is published:

- The version lives in the project's version file (`package.json`, `Cargo.toml`, a Kodi
  `addon.xml`); the tag is `v` + that version.
- Only a tag starts a release. `release.yml` runs on `push: tags: ["v*"]` (and `workflow_dispatch`),
  first the project's CI (`ci.yml` with `workflow_call:`) unless [main already tested
  it](#tested-on-main), then the build and the publishing, last the GitHub release.
- The tag comes either from a checkout (`npm run release:minor`) or, without one, from the
  *Bump version* button in the Actions tab.

## CI in every project

The checks themselves differ per project (Bun, Node, Go, Rust, ESPHome, Python), so each project
keeps its own `ci.yml`. A reusable workflow cannot set its caller's triggers or concurrency, so the
part that keeps runs few is the same header, copied into every `ci.yml`:

```yaml
on:
  push:
    branches: [main]            # not every branch, pull requests build through pull_request
    paths-ignore: ["**.md", "docs/**", "LICENSE"]
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
    paths-ignore: ["**.md", "docs/**", "LICENSE"]
  workflow_call:                # release.yml runs the same checks before publishing
  workflow_dispatch:

permissions:
  contents: read

# A new push to a pull request cancels its outdated run; runs on main and tags finish
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  check:
    # Draft pull requests do not build; "Ready for review" starts the run
    if: ${{ !github.event.pull_request.draft }}
    runs-on: ubuntu-latest
    timeout-minutes: 20
```

- **Draft while work is in progress.** An agent (or you) pushes as often as it likes to a draft pull
  request without a single run; marking it ready builds once, later pushes build again.
- Every job in the file gets the same `if:`, and jobs with `needs:` inherit the skip.
- Under `workflow_call` (from `release.yml`) there is no pull request, so the `if:` lets the jobs run.
- Several CI files in one project: give each its own group (`e2e-${{ github.ref }}`, ...), otherwise
  a release that calls them all cancels one of them.
- `paths-ignore` skips the whole workflow, so a required status check would wait forever on a
  docs-only pull request; leave it out where checks are required. The draft `if:` has no such
  problem, a skipped job counts as passed.
- Slow extras (Windows/macOS matrix, firmware compiles, E2E) can run only when the pull request is
  ready or only on `main`, not on every push.

## README footer in every project

Every README ends the same way: first an invitation to star the project and to report bugs or ideas,
then the small print with the license, the copyright, the other language version and the trademarks
the project is not affiliated with.

```html
---

<div align="center">

⭐ Like namarr? A [star on GitHub](https://github.com/firsttris/namarr) helps others find it.<br>
🐛 [Report a bug](https://github.com/firsttris/namarr/issues/new) · 💡 [Request a feature](https://github.com/firsttris/namarr/issues/new)

<sub>License: <a href="LICENSE">AGPL-3.0</a> · © Tristan Teufel and contributors · <a href="README.de.md">Deutsche Version</a><br>
Changed versions you pass on or run for others must offer their source code under the AGPL; a commercial license without these obligations is available via <a href="https://teufel-it.de">teufel-it.de</a>.<br>
namarr is not affiliated with TMDB, TheTVDB, TVmaze or AniDB.</sub>

</div>
```

In German:

```html
⭐ Gefällt dir MUI? Ein [Stern auf GitHub](https://github.com/firsttris/ccu-addon-mui) hilft anderen, es zu finden.<br>
🐛 [Fehler melden](https://github.com/firsttris/ccu-addon-mui/issues/new) · 💡 [Idee vorschlagen](https://github.com/firsttris/ccu-addon-mui/issues/new)

<sub>Lizenz: <a href="LICENSE">AGPL-3.0</a> · © Tristan Teufel und Mitwirkende · <a href="README.en.md">English version</a><br>
Wer eine veränderte Version weitergibt oder für andere betreibt, muss ihren Quellcode unter der AGPL anbieten; eine kommerzielle Lizenz ohne diese Pflichten gibt es über <a href="https://teufel-it.de">teufel-it.de</a>.<br>
Homematic und Homematic IP sind Marken der eQ-3 AG. Dieses Projekt steht in keiner Verbindung zu eQ-3 oder OpenCCU.</sub>
```

- Every project has a `LICENSE` file, and the footer links it; there is no separate `## License`
  section.
- A copyleft license (GPL, AGPL) gets half a sentence on what it means for the reader and the link
  to a commercial license (teufel-it.de), as above. Only the current license is named, not earlier
  ones.
- Personal sites (CV, website): MIT covers the code only; one line says the texts and photos are
  "© Tristan Teufel, all rights reserved".
- Customer projects are private and get no open-source license and no footer.
- The language link only where a second README exists.
- One "not affiliated with" line for the third-party names the project uses (Kodi, Homematic,
  Steam, ...), plus any disclaimer the project needs ("not tax advice").
- With issue templates the links open them directly (`issues/new?template=bug_report.md`).
- The empty lines inside the `<div>` matter: without them GitHub does not render the Markdown links.

## Renovate in every project

Every project's `.github/renovate.json5` (the Renovate GitHub App) starts from the shared settings in
[`renovate/default.json5`](renovate/default.json5):

```json5
{
  $schema: "https://docs.renovatebot.com/renovate-schema.json",
  extends: ["github>firsttris/workflows//renovate/default.json5"],
  packageRules: [ /* what the project builds on */ ],
}
```

| What | When | Merged |
|---|---|---|
| Ordinary packages (npm/Bun, Cargo, pip, Go, Deno, actions, images), minor and patch | on the 1st of the month, one pull request per project | by Renovate, once CI is green |
| Lock file maintenance (the indirect dependencies) | on the 1st of the month | by Renovate, once CI is green |
| 0.x minor updates (may break) | on the 1st of the month, one pull request | by a person |
| Major updates: one pull request for the packages, one for the workflows (actions, runner images) | when ticked in the project's Dependency Dashboard issue | by a person |
| Security fixes | after one day (pnpm refuses younger packages) | by a person |
| What the project builds on (its own rules) | at once, one pull request per upstream with a checklist | by a person |

A release is taken only after three days, a security fix after one day. At most five Renovate pull requests are open per project and two new ones come an hour, and a branch is rebased only when it conflicts, so the CI is not flooded. A project's own rules (an engine, SnapRAID, ESPHome, Bun,
Tauri, ...) come after the shared ones and win; each sets its own `groupName`,
`schedule: ["at any time"]`, `automerge: false` and `dependencyDashboardApproval: false`, so that
upstream keeps its own pull request, majors included. A project whose pull requests run no CI also
sets `automerge: false` and `lockFileMaintenance: { automerge: false }`.

Everything open across the projects: the pull requests with the label `dependencies`
(`is:pr is:open label:dependencies user:firsttris`). A change here applies to every project with
Renovate's next run; no tag needs to move.

## Tech stack

[`tech-stack.md`](tech-stack.md) lists the technologies the projects use and which one is
preferred: React with TanStack, shadcn/ui-style components with Tailwind, Paraglide for
translations, Biome, TypeScript on both ends unless performance calls for Rust or Go, and so on.
A new project or a new part starts from it; the CLAUDE.md template points there.

## Templates: CLAUDE.md and README

Two templates for every project, in `templates/`. Each project keeps one filled-in file; nothing
is loaded from here at run time.

- [`CLAUDE.template.md`](templates/CLAUDE.template.md): the notes Claude reads in every session:
  documentation, reference implementations, what goes with every change, checks, pull requests,
  working rules and code style. Tell Claude: *"Look at the CLAUDE.md template in
  firsttris/workflows and create a CLAUDE.md for this repository."*
- [`README.template.md`](templates/README.template.md): the README, taken from the best ones
  (quadeck, haul, fernsicht, snapraid-ui, vscode-jest-runner): a title and tagline in the words
  people search for, badges, the install command and a screenshot at the top, then Why,
  Install, Features, Screenshots, Alternatives, FAQ, Documentation, Development, Contributing
  and the [footer](#readme-footer-in-every-project). The comment at its top lists the rules,
  including the repository settings (description, website, topics, social preview). Tell
  Claude: *"Look at the README template in firsttris/workflows and write the README for this
  repository."*

## Licenses

Which license a project gets:

| License | For | Projects |
|---|---|---|
| AGPL-3.0-only | web apps people host themselves: nobody may sell or host a changed version without publishing its source; a closed one needs a commercial license | ccu-addon-mui, namarr, quadeck, snapraid-ui, haul, haben, reactive-volcano-app |
| GPL-3.0-only | programs installed on a machine (no network use to cover) | prefixr, oneclickhistorycleaner |
| MIT | small tools and configurations, where reach matters more than protection, and projects with many outside contributors | vscode-jest-runner, the SendToKodi projects, the VS Code helpers, the ESP32/ESPHome configurations, gong-second-hand-dashboard |
| MIT for the code, content reserved | personal sites | astro-cv, teufel-it-astro |
| none | customer projects, private | gaiser-lager |

A GPL or AGPL project has, next to `LICENSE` (the unchanged license text, so GitHub recognises it),
a `NOTICE` with the copyright, an additional term under section 7(b) (modified versions keep "<name>
by Tristan Teufel" with the link to the repository in the legal notices they show), the commercial
license (teufel-it.de). The license lives in `LICENSE`, `NOTICE`,
the README footer, the license field of `package.json`/`Cargo.toml` and the docs site's copyright
line; the apps themselves stay untouched.

## Bump version

[`.github/workflows/bump-version.yml`](.github/workflows/bump-version.yml) raises the version
(patch, minor or major) in the version file, commits it as `Release vX.Y.Z`, tags it and pushes
both. Then it starts the project's `release.yml` on the new tag, which runs exactly as for a tag
pushed from a checkout.

The detour over `workflow_dispatch` is needed because a tag pushed with the `GITHUB_TOKEN` starts no
`on: push` workflow; starting a workflow by hand is the one thing the token may trigger. So no
personal access token is needed, but `release.yml` must have `workflow_dispatch:` as a trigger.

`.github/workflows/bump.yml` in a project:

```yaml
name: Bump version

on:
  workflow_dispatch:
    inputs:
      bump:
        type: choice
        options: [patch, minor, major]   # add prepatch, preminor, premajor, prerelease for pre-releases
        default: patch

jobs:
  bump:
    uses: firsttris/workflows/.github/workflows/bump-version.yml@v1
    with:
      bump: ${{ inputs.bump }}
    permissions:
      contents: write
      actions: write
```

| Input | Default | |
|---|---|---|
| `bump` | `patch` | `patch`, `minor` or `major`; on a pre-release like `npm version` (`1.3.0-rc.1`: `patch` and `minor` give `1.3.0`). Pre-releases (need a version file): `prepatch`, `preminor`, `premajor` (`1.2.0` → `1.3.0-rc.1`), `prerelease` (`1.3.0-rc.1` → `1.3.0-rc.2`) |
| `preid` | `rc` | identifier of a pre-release, e.g. `beta` |
| `version-file` | `package.json` | `package.json`, `Cargo.toml` (also `[workspace.package]`) or a Kodi `addon.xml`; `""`: the tag alone is the version (see below) |
| `extra-files` | `""` | further files with the same version, one per line, e.g. `src-tauri/tauri.conf.json` |
| `tag-prefix` | `v` | |
| `release-workflow` | `release.yml` | started on the new tag; `""` starts nothing |

A `package-lock.json` next to a `package.json` and a `Cargo.lock` next to a `Cargo.toml` (the
workspace's own crates) are updated along with it. Outputs: `version`, `tag`.

**Release candidates** on the default branch, no extra branch: `preminor` tags `v1.3.0-rc.1` and
the [Docker release](#docker-release) pushes `:next`, while `:latest` stays on `1.2.x`; fixes go
out as `prerelease` (`v1.3.0-rc.2`), and `patch` finally releases `v1.3.0`. The numbering starts
at `.1`; `npm version preminor --preid rc` on a checkout would start at `.0`.

**Without a version file** (`version-file: ""`, e.g. snapraid-ui, or the Kodi add-on whose
`addon.xml` gets the version at build time) the highest `vX.Y.Z` tag is raised and the current
commit tagged; nothing is committed. Without any such tag the first one is `v0.0.1` (patch).

The commit is pushed to the branch the workflow runs on, so that branch must accept pushes from
GitHub Actions (no rule that requires a pull request for every change).

## GitHub release

[`.github/workflows/github-release.yml`](.github/workflows/github-release.yml) creates the GitHub
release for the tag it runs on, for projects that publish no Docker image (the Docker release does
this itself). It checks the tag against the version file, attaches the files of an artifact from
the same run and generates the notes from the pull requests since the previous release. A version
with a `-` (`1.2.0-rc.1`) becomes a pre-release.

```yaml
jobs:
  checks:
    uses: ./.github/workflows/ci.yml   # uploads the artifact "dist"

  release:
    needs: checks
    if: startsWith(github.ref, 'refs/tags/v')   # run by hand on a branch: only the checks
    uses: firsttris/workflows/.github/workflows/github-release.yml@v1
    with:
      release-artifact: dist
    permissions:
      contents: write
```

| Input | Default | |
|---|---|---|
| `version-file` | `package.json` | `package.json`, `Cargo.toml` or a Kodi `addon.xml` that must match the tag; `""` skips the check |
| `tag-prefix` | `v` | |
| `release-artifact` | `""` | name of an artifact uploaded earlier in the same run; its files are attached |
| `notes` | `""` | text above the generated notes |

Output: `version`, the released `x.y.z`.

## Browser extension stores

[`.github/workflows/browser-extension-stores.yml`](.github/workflows/browser-extension-stores.yml)
publishes a browser extension from an artifact of the same run: uploaded to the Chrome Web Store
(published by hand there), published to Mozilla Add-ons with a source ZIP (`git archive`) for the
review and to Microsoft Edge Add-ons with the Chrome build. The artifact (default `extension`) holds
`<name>-chrome-<version>.zip` and `<name>-firefox-<version>.zip`; the version comes from the tag.

```yaml
on:
  push:
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      chrome: { type: boolean, default: true }
      firefox: { type: boolean, default: true }
      edge: { type: boolean, default: true }

jobs:
  checks:
    uses: ./.github/workflows/check_build.yml   # uploads the artifact "extension"

  release:
    needs: checks
    if: startsWith(github.ref, 'refs/tags/v')
    uses: firsttris/workflows/.github/workflows/github-release.yml@v1
    with:
      release-artifact: extension
    permissions:
      contents: write

  stores:
    needs: release
    uses: firsttris/workflows/.github/workflows/browser-extension-stores.yml@v1
    with:
      name: sendToKodi
      firefox-addon-guid: sendtokodi@firsttris.github.io
      # A tag push has no inputs: then every store
      chrome: ${{ github.event_name == 'push' || inputs.chrome }}
      firefox: ${{ github.event_name == 'push' || inputs.firefox }}
      edge: ${{ github.event_name == 'push' || inputs.edge }}
    secrets: inherit
```

Started by hand on an existing tag, the same workflow publishes that version again (e.g. to one
store only); the GitHub release then only gets its files replaced.

Secrets: `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`,
`AMO_JWT_ISSUER`, `AMO_JWT_SECRET`, `EDGE_PRODUCT_ID`, `EDGE_API_KEY`, `EDGE_CLIENT_ID`.

## VS Code extension publish

[`.github/workflows/vscode-extension-publish.yml`](.github/workflows/vscode-extension-publish.yml)
publishes the `.vsix` from an artifact of the same run (default `vsix`, from `vsce package`) to the
Visual Studio Marketplace and to Open VSX. A version that is already there is skipped.

```yaml
jobs:
  checks:
    uses: ./.github/workflows/ci.yml   # runs `vsce package` and uploads the artifact "vsix"

  release:
    needs: checks
    if: startsWith(github.ref, 'refs/tags/v')
    uses: firsttris/workflows/.github/workflows/github-release.yml@v1
    with:
      release-artifact: vsix
    permissions:
      contents: write

  publish:
    needs: release
    uses: firsttris/workflows/.github/workflows/vscode-extension-publish.yml@v1
    secrets: inherit
```

Inputs `marketplace` and `open-vsx` (both `true`). Secrets: `VSCE_PAT`, `OVSX_PAT`.

## Actions: Playwright image and commit changes

Two building blocks for jobs a reusable workflow can't cover, because they need their own tools
(Go, Deno, Rust, a cache, packages): the job stays in the project, these two steps come from here.
*Screenshots* below uses them too.

[`actions/playwright-image`](actions/playwright-image/action.yml) gives the official Playwright
image of the `@playwright/test` version in the lockfile (`package-lock.json`, `bun.lock`,
`pnpm-lock.yaml`, also in a subfolder). A job in that container needs no `playwright install`, and
screenshots and visual baselines come out the same on every run. Outputs `image` and `version`.

[`actions/commit-changes`](actions/commit-changes/action.yml) commits what changed under `paths`
(one path or glob per line) with `message` as `github-actions[bot]` and pushes it to the branch the
workflow runs on; nothing changed, nothing is committed. Output `changed`.

```yaml
jobs:
  image:
    runs-on: ubuntu-latest
    outputs:
      image: ${{ steps.playwright.outputs.image }}
    steps:
      - id: playwright
        uses: firsttris/workflows/actions/playwright-image@v1
        with:
          lockfile: e2e/package-lock.json

  screenshots:
    needs: image
    runs-on: ubuntu-latest
    container:
      image: ${{ needs.image.outputs.image }}
      options: --ipc=host
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2      # whatever the project needs
      - run: npm ci && npm run screenshots
      - uses: firsttris/workflows/actions/commit-changes@v1
        with:
          paths: docs/screenshots
```

## Screenshots

[`.github/workflows/screenshots.yml`](.github/workflows/screenshots.yml) takes a project's
screenshots (README, documentation, social preview) and commits the ones that changed to the branch
it runs on. It runs in the official Playwright image of the `@playwright/test` version from the
lockfile, so browser and fonts are the same on every run: an unchanged page gives an unchanged
picture, and only real changes end up in the commit. It is the two actions above with
installing and running in between; a project that needs more than Bun or a Postgres database
writes that job itself with the actions. Start it by hand after a change to the look;
the commit, pushed with the `GITHUB_TOKEN`, runs no checks.

`.github/workflows/screenshots.yml` in a project:

```yaml
name: Update screenshots

on:
  workflow_dispatch:

jobs:
  screenshots:
    uses: firsttris/workflows/.github/workflows/screenshots.yml@v1
    with:
      command: npm run screenshots
      paths: |
        docs/*.png
        public/screenshots
    permissions:
      contents: write
```

| Input | Default | |
|---|---|---|
| `command` | – | takes the screenshots, e.g. `npm run screenshots` (required) |
| `install` | `npm ci` | e.g. `bun install --frozen-lockfile` or `corepack enable && pnpm install --frozen-lockfile` |
| `bun` | `false` | install Bun first |
| `bun-version` | `latest` | e.g. `1.4.x` |
| `lockfile` | `package-lock.json` | `package-lock.json`, `bun.lock` or `pnpm-lock.yaml` with the `@playwright/test` version |
| `paths` | `docs` | what is committed, one path or glob per line |
| `commit-message` | `Update screenshots` | |
| `postgres` | `""` | Postgres image, e.g. `postgres:16`, for a database next to the job; its URL is in `$POSTGRES_URL` |
| `postgres-db` | `screenshots` | name of that database |

The command starts whatever the pictures need (a dev server, a production build with demo data, a
mock) and stops it again. Like *Bump version*, the branch must accept pushes from GitHub Actions.

## Versions

Callers pin `@v1`. After a compatible change, run *Move major tag* (Actions → Run workflow on
`main`), which points `v1` at the current `main`. A breaking change (renamed inputs, other defaults)
gets a new major tag, `v2`, instead.
