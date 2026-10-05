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
| `ghcr` | `false` | also push `ghcr.io/<owner>/<repo>` |
| `version-file` | `package.json` | `package.json` or `Cargo.toml` that must match the tag; `""` skips the check |
| `readme` | `README.md` | README for Docker Hub, relative links and images made absolute; `""` skips it |
| `release-artifact` | `""` | name of an artifact uploaded earlier in the same run; its files are attached to the release |
| `dockerhub-user` | `tristanteu` | |

Secret: `DOCKER_PAT`, a Docker Hub access token (`secrets: inherit` passes it on).
Output: `version`, the published `x.y.z` (empty for `edge`).

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

## Releases in every project

The same scheme everywhere, whatever is published:

- The version lives in the project's version file (`package.json`, `Cargo.toml`, a Kodi
  `addon.xml`); the tag is `v` + that version.
- Only a tag starts a release. `release.yml` runs on `push: tags: ["v*"]` (and `workflow_dispatch`),
  first the project's CI (`ci.yml` with `workflow_call:`), then the build and the publishing, last
  the GitHub release.
- The tag comes either from a checkout (`npm run release:minor`) or, without one, from the
  *Bump version* button in the Actions tab.

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
        options: [patch, minor, major]
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
| `bump` | `patch` | `patch`, `minor` or `major`; `patch` on `1.2.0-rc.1` gives `1.2.0` |
| `version-file` | `package.json` | `package.json`, `Cargo.toml` (also `[workspace.package]`) or a Kodi `addon.xml` |
| `extra-files` | `""` | further files with the same version, one per line, e.g. `src-tauri/tauri.conf.json` |
| `tag-prefix` | `v` | |
| `release-workflow` | `release.yml` | started on the new tag; `""` starts nothing |

A `package-lock.json` next to a `package.json` and a `Cargo.lock` next to a `Cargo.toml` (the
workspace's own crates) are updated along with it. Outputs: `version`, `tag`.

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

## Versions

Callers pin `@v1`. After a compatible change, run *Move major tag* (Actions → Run workflow on
`main`), which points `v1` at the current `main`. A breaking change (renamed inputs, other defaults)
gets a new major tag, `v2`, instead.
