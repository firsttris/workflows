# workflows

Shared GitHub Actions workflows for my projects.

## Docker release

[`.github/workflows/docker-release.yml`](.github/workflows/docker-release.yml) builds a multi-arch
image, pushes it to Docker Hub (and optionally GHCR), updates the Docker Hub description from the
README and creates the GitHub release. Each project keeps its own CI and calls this after it.

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

A new version is then `npm version minor && git push --follow-tags` (or `bun run release:minor`
with the scripts below in `package.json`):

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
| `platforms` | `linux/amd64,linux/arm64` | |
| `ghcr` | `false` | also push `ghcr.io/<owner>/<repo>` |
| `version-file` | `package.json` | `package.json` or `Cargo.toml` that must match the tag; `""` skips the check |
| `readme` | `README.md` | README for Docker Hub, relative links and images made absolute; `""` skips it |
| `release-artifact` | `""` | name of an artifact uploaded earlier in the same run; its files are attached to the release |
| `dockerhub-user` | `tristanteu` | |

Secret: `DOCKER_PAT`, a Docker Hub access token (`secrets: inherit` passes it on).
Output: `version`, the published `x.y.z` (empty for `edge`).

### Examples

**Rust project** (haul): the version comes from `Cargo.toml`, the browser extension is attached
to the release.

```yaml
jobs:
  extension:
    uses: ./.github/workflows/extension.yml   # uploads the artifact "haul-extension"
  docker:
    needs: extension
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

## Versions

Callers pin `@v1`. Compatible changes move the `v1` tag; a breaking change (renamed inputs, other
defaults) becomes `v2`.
