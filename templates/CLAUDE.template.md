# Notes for Claude

<!--
Template for every project (firsttris/workflows, templates/CLAUDE.template.md). To use it, tell Claude:
"Set up the Claude notes from firsttris/workflows for this repository."
1. Copy templates/rules.md verbatim to .claude/rules/firsttris.md (Claude Code loads it with this
   file).
2. Write this file with only what is specific to the project: fill in the <…> parts from the
   repository, drop sections that do not apply, repeat nothing from the rules, delete this comment.
-->

The shared rules are in `.claude/rules/firsttris.md` (from firsttris/workflows); this file adds what
is specific to <project> and wins where it says otherwise.

## Documentation

<https://firsttris.github.io/…/>. Read before a change: <architecture.md for how the pieces fit, …>.

## Reference implementations

<The upstream projects, specifications and man pages this project follows, with the files to look
at.>

## With every change

<Only what the shared rules don't cover: generated files to refresh, where the tests live, …>

## Checks

```sh
<typecheck, lint/format, tests, build>
```

## Pull requests

<Only where the project differs: works on `main` directly, no force-push, German commit messages, …>

## Working rules

<Ports the tests use, the app's interface languages, …>

## Code style

Deviations from `tech-stack.md` and why:

- <…>

## <Project> specifics

<Devices, screen sizes, accounts, test data, anything a new session must know.>
