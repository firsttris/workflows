<!--
Template for every project's README (firsttris/workflows, templates/README.template.md). To use it, tell
Claude: "Look at the README template in firsttris/workflows and write the README for this
repository." Fill in the <…> parts from the repository, drop sections that do not apply, delete
every comment.

Rules, taken from the best READMEs (quadeck, haul, fernsicht, snapraid-ui, vscode-jest-runner):

- Search first: the H1 and the bold line say what it is in the words people search for
  ("self-hosted download manager", "web UI for Podman Quadlets", "JDownloader alternative").
  Name the platforms (Docker, Synology, Raspberry Pi, Chrome, Kodi) and the tools it replaces.
- Show it: a banner or screenshot right under the badges, from "Update screenshots", never older
  than the UI. Every image has an alt text that describes what is on it, with the keywords.
- Install in under a minute: the shortest working command near the top.
- Or let an agent do it: "Let an AI agent set it up" under Install, a prompt to paste into any
  coding agent. Neutral wording, Claude Code only as one example; the prompt points to the
  installation page of the documentation, so that page has to hold every step.
- Why before what: three or four bullets on the problem it solves, then the features.
- Benefits, not internals: "one binary, no container" rather than the module list. Numbers where
  they exist (latency, size, sites supported).
- FAQ headings are the questions people type into a search engine.
- Links go to the documentation site (GitHub Pages), not to docs/*.md.
- Short: the README sells and gets people started; details belong in the documentation.
- The repository settings belong to it: description (= the bold line), website (the
  documentation), 10 to 20 topics, and docs/social-preview.png as the social preview.
- Language: English, or the language of the users (German for CCU and accounting); a second
  README.<lang>.md only when it is kept up to date.
-->

<div align="center">

<img src="docs/banner.png" alt="<Name>: <what it is, in search words>" width="900">

<!-- Without a banner: logo, then the H1
<img src="docs/logo.svg" alt="<Name> logo" width="96">

<h1><Name>: <what it is, in search words></h1>
-->

**<One sentence: what it is and for whom, with the main keywords.>**<br>
<One sentence: what it does for the user.><br>
<One sentence: what makes it different (one binary, no cloud, free, open source).>

[![CI](https://github.com/firsttris/<repo>/actions/workflows/ci.yml/badge.svg)](https://github.com/firsttris/<repo>/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/firsttris/<repo>?logo=github&label=release)](https://github.com/firsttris/<repo>/releases/latest)
<!-- Pick what tells a user something, at most two rows:
     distribution: Docker pulls, image size, platforms, store version and users, marketplace installs
     trust: license, docs, "no tracking", coverage
     stack: one or two badges for what the project is built on or for (Rust, Podman, Kodi 19+) -->
[![Docs](https://img.shields.io/badge/docs-firsttris.github.io%2F<repo>-4f46e5?logo=materialformkdocs&logoColor=white)](https://firsttris.github.io/<repo>/)
[![License: <license>](https://img.shields.io/badge/license-<license>-blue)](LICENSE)

```bash
<the shortest working install command>
```

[Install](#-install) •
[Features](#-features) •
[Screenshots](#-screenshots) •
[Alternatives](#-<name>-and-the-alternatives) •
[FAQ](#-faq) •
[Documentation](https://firsttris.github.io/<repo>/)

<img src="docs/screenshot.png" alt="<What the screenshot shows, in one sentence with the keywords>" width="900">

</div>

## 💡 Why <Name>?

<Two sentences on the problem: what people use today and where it falls short.>

- **<Benefit>**: <what it means for the user>.
- **<Benefit>**: <…>.
- **<Benefit>**: <…>.

<Where it runs: Linux server, NAS (Synology, Unraid), Raspberry Pi, Chrome and Firefox, …>

## 🚀 Install

<The recommended way, complete and copyable: Docker Compose, Podman Quadlet, store links, install
script. Store projects use the large "Add to Chrome / Firefox / Edge" badges.>

```bash
<commands>
```

<One line on what happens next ("open http://<host>:8080 and set your password").> Everything else
is in the [installation guide](https://firsttris.github.io/<repo>/installation.html).

### 🤖 Let an AI agent set it up

Start an AI coding agent such as [Claude Code](https://code.claude.com/docs), Codex or Gemini CLI
on <the server / the computer> and paste:

```text
Install <Name> on this machine with <Podman Quadlet / Docker Compose / the .deb>, following
https://firsttris.github.io/<repo>/installation.html. <What it finds out itself: a free port,
the data folder, the GPU, the MQTT broker>. Show me each file before you write it and ask me
for <the domain, passwords>.
```

It <checks the requirements, writes the files, starts it and checks that it answers>. <What it
can do afterwards, if anything: the CLI, the MCP server, the config file; link the section that
explains it.>

<!-- Drop this for things an agent cannot install (store extensions, a public website). Where the
     project has more for agents (MCP server, CLI, skill), keep that in its own "## 🤖" section and
     only link it here. -->

<!-- Optional: "### 🐧 Runs on" as a table of distributions, devices or versions with ✅ / ⚠️ -->

## ✨ Features

<!-- Group by what the user does, 3 to 8 groups; bold the key term of every bullet. -->

### <emoji> <Group>

- **<Feature>**: <what it does, in one line>.
- **<Feature>**: <…>.

## 📸 Screenshots

<!-- Two per row, each with an alt text; from "Update screenshots". -->

<table>
  <tr>
    <td><img src="docs/screenshot-<a>.png" alt="<…>"></td>
    <td><img src="docs/screenshot-<b>.png" alt="<…>"></td>
  </tr>
</table>

## 🔀 <Name> and the alternatives

<One sentence on what <Name> is made for.>

| | What it is | Where <Name> differs |
|---|---|---|
| [<Alternative>](<url>) | <fair, one line> | <one line> |

## ❓ FAQ

### <A question people search for, e.g. "Is there a web UI for …?" or "Does it work with Docker?">
<Short answer first ("Yes." / "No, …"), then one or two sentences and a link to the docs.>

## 📚 Documentation

The full documentation, with search, is at **[firsttris.github.io/<repo>](https://firsttris.github.io/<repo>/)**.

| | |
|---|---|
| [Installation](https://firsttris.github.io/<repo>/installation.html) | <what is there> |
| [<Page>](https://firsttris.github.io/<repo>/<page>.html) | <what is there> |
| [Development](https://firsttris.github.io/<repo>/development.html) | building, checks, architecture, releases |

## 🛠️ Development

Requires <runtime and version>.

```bash
git clone https://github.com/firsttris/<repo> && cd <repo>
<install>
<start with demo data>
```

<Stack in one line.> Architecture, tests and releases: [Development](https://firsttris.github.io/<repo>/development.html).

## 🤝 Contributing

Issues and pull requests are welcome. <What a good bug report contains for this project.> Please
run `<checks>` before opening a pull request.

---

<div align="center">

⭐ Like <Name>? A [star on GitHub](https://github.com/firsttris/<repo>) helps others find it.<br>
🐛 [Report a bug](https://github.com/firsttris/<repo>/issues/new) · 💡 [Request a feature](https://github.com/firsttris/<repo>/issues/new)

<sub>License: <a href="LICENSE"><license></a> · © Tristan Teufel and contributors<br>
<!-- Copyleft only: --> Changed versions you pass on or run for others must offer their source code under the AGPL; a commercial license without these obligations is available via <a href="https://teufel-it.de">teufel-it.de</a>.<br>
<Name> is not affiliated with <the third-party names it uses>.</sub>

</div>
