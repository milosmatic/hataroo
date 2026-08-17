# Contributing

Thanks for considering a contribution to hataroo.

## Getting started

```sh
npm install
npm test        # vitest
npm run build   # tsup single-file bundle to dist/hataroo-cli.js
node dist/hataroo-cli.js <dir>
```

## Before opening a PR

Run the full check suite locally — CI runs the same commands and will fail the
build otherwise:

```sh
npm run format:check   # oxfmt; fix with `npm run format`
npm run lint            # oxlint
npm run typecheck       # tsc --noEmit
npm test                # vitest run
```

Formatting and linting are enforced by tooling, not code review — code review
skips anything `oxfmt`/`oxlint` already catch. See `.oxfmtrc.json` and
`.oxlintrc.json` for the exact rules.

## Commit conventions

Commit subjects follow `type: description`, e.g. `fix: handle empty scan
root`, `feat: add --depth flag`. Common types: `feat`, `fix`, `docs`, `test`,
`refactor`, `chore`.

## Pull requests

- Keep PRs scoped to one change; unrelated cleanups belong in a separate PR.
- Include or update tests for behavior changes.
- Fill in the PR template checklist.
- `main` requires CI to pass before merge.

## Design context

`CONTEXT.md` at the repo root defines the project's domain vocabulary (what a
"repo", "row", "selection", "dirty" mean here) — read it before naming new
concepts. Larger architectural decisions are recorded under `docs/adr/`.

## Agent-assisted contributions

If you're working with an AI coding agent, see `CLAUDE.md` and `docs/agents/`
for the conventions this repo expects agents to follow (issue format, triage
labels, domain docs). Human contributors aren't required to follow that
workflow, but PRs are held to the same standards either way.
