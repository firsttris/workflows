# Notes for Claude

<!--
Template for every project (firsttris/workflows, templates/CLAUDE.template.md). To use it, tell Claude:
"Look at the CLAUDE.md template in firsttris/workflows and create a CLAUDE.md for this repository."
Fill in the <…> parts from the repository, drop what does not apply, delete this comment.
Keep it short: the file is loaded into every session.
-->

## Documentation

The documentation is in `docs/` (<https://firsttris.github.io/…/>). Read the pages that touch the
change before starting: <architecture.md for how the pieces fit, …>. Links in the README and the
docs point to the GitHub Pages site, not to `docs/*.md`.

## Reference implementations

Base details on the sources, not on memory: <the upstream project, specification or library whose
behaviour this project follows, with the files to look at>. Clone them shallowly
(`git clone --depth 1`) into the scratchpad and name the source file in comments and commit
messages where it settles a detail.

## With every change

Update what the change affects, in the same pull request, and only that:

- the tests for what changed (<unit, E2E, …>);
- the docs in `docs/` that describe it;
- the README when a feature a user sees is added, changed or removed;
- the screenshots after a change to the look: **Actions → Update screenshots → Run workflow**, then
  look at the new pictures.

## Checks

Green before every push, then check CI:

```sh
<typecheck, lint/format, tests, build>
mkdocs build --strict    # when docs/ or mkdocs.yml changed
```

## Pull requests

- One feature per pull request; it carries only its own commits.
- Before every push check whether the branch's pull request is still open. If it is merged, start
  again from the current `origin/main` and open a **new** pull request.
- <Merge method: squash. Force-push: allowed with `--force-with-lease` on the own branch after a
  merge / never.>

## Working rules

- Commands as root (`sudo`, `pkexec`) are run by the user; don't work around that.
- The user's running processes are not stopped; use other ports for tests.
- <Language: code, comments, docs, commits and pull requests in English; the app's interface in
  German / English.>

## Code style

Technology choices follow `tech-stack.md` in firsttris/workflows; <deviations of this project and
why>.

Functional, not object-oriented: pure functions that take data and return data, side effects at
the edges; function components and hooks, no classes; errors as values. A file does one thing:
split it past ~400 lines, a function past ~80. A refactor changes no behaviour.

## <Project specifics>

<Devices, screen sizes, accounts, test data, anything a new session must know.>
