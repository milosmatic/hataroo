export interface ParsedArgs {
  /** Scan root, undefined when no positional argument was given. */
  dir: string | undefined
  /** Value passed to --depth, undefined when the flag was absent. */
  depth: number | undefined
  /** Values passed to repeated --ignore flags. */
  ignore: string[]
}

/**
 * Parses CLI flags: `--depth <n>`, repeatable `--ignore <glob>`, and a single
 * positional scan-root argument. Flags-only, no config file (ADR 0001 §7).
 */
export function parseArgs(argv: string[]): ParsedArgs {
  let dir: string | undefined
  let depth: number | undefined
  const ignore: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--depth') {
      const value = argv[++i]
      const parsed = value === undefined ? Number.NaN : Number.parseInt(value, 10)
      if (!Number.isNaN(parsed)) depth = parsed
    } else if (arg === '--ignore') {
      const value = argv[++i]
      if (value !== undefined) ignore.push(value)
    } else if (dir === undefined && arg !== undefined && !arg.startsWith('-')) {
      dir = arg
    }
  }

  return { dir, depth, ignore }
}
