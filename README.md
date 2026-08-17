# hataroo

![hataroo](assets/hataroo.png)

A terminal UI for managing a folder of git repositories at once: bulk status, fast-forward-only pull, and dependency install.

> Status: in development. Scanning and the repo list work today; status rows, pull, and install are being built.

## Usage

```sh
npx hataroo [dir]
```

Scans the given directory (default: current directory) and lists every git repository found, one row per repo. Requires Node.js 22+ and git.

- Repos are discovered at depth 1 by default; `node_modules` and hidden directories are skipped.
- Nested repos (submodules, vendored checkouts) are never listed: every row is an independent repository.
- If the scan root is itself a git repo, it appears as a single row named `.`.

## Keys

| Key   | Action                    |
| ----- | ------------------------- |
| ↑ ↓   | navigate                  |
| space | select                    |
| a     | toggle select all         |
| enter | inspect cursor row        |
| p     | pull selected (ff-only)   |
| i     | install selected          |
| r     | rescan                    |
| esc   | close overlay / cancel op |
| q     | quit                      |

Keys other than `q` are landing as v1 comes together.

## What it will do (v1)

- **Status rows**: each repo shows branch, ahead/behind counts, a dirty flag, and its detected package manager.
- **Pull**: `git pull --ff-only --autostash` over the selected repos. Diverged branches and conflicts fail loudly and are left to a real git client; hataroo never merges or rebases.
- **Install**: dependency install per repo with the right package manager (npm, pnpm, yarn, bun), using the strict lockfile-enforcing variant when a lockfile exists.
- **Results overlay**: every bulk operation ends in a per-repo ok/skipped/failed summary, with full output in an inspect view.

## Flags

- `--depth <n>`: scan deeper than one level (capped at 3). Coming with the flags ticket.
- `--ignore <glob>`: exclude directories, repeatable. Coming with the flags ticket.

No config file, by design. When a repo needs special handling, hataroo is not the tool for that repo.

## Development

```sh
npm install
npm test        # vitest
npm run build   # tsup single-file bundle to dist/hataroo-cli.js
node dist/hataroo-cli.js <dir>
```

## License

MIT
