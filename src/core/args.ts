export interface ParsedArgs {
  /** Scan root, undefined when no positional argument was given. */
  dir: string | undefined
  /** Value passed to --depth, undefined when the flag was absent. */
  depth: number | undefined
  /** Values passed to repeated --ignore flags. */
  ignore: string[]
}

const INTEGER = /^-?\d+$/

/** A flag's value token: any argument that isn't itself another flag. */
function takeValue(argv: string[], index: number): string | undefined {
  const value = argv[index]
  return value !== undefined && !value.startsWith('-') ? value : undefined
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
      const value = takeValue(argv, i + 1)
      if (value !== undefined) {
        i++
        if (INTEGER.test(value)) depth = Number.parseInt(value, 10)
      }
    } else if (arg === '--ignore') {
      const value = takeValue(argv, i + 1)
      if (value !== undefined) {
        i++
        ignore.push(value)
      }
    } else if (dir === undefined && arg !== undefined && !arg.startsWith('-')) {
      dir = arg
    }
  }

  return { dir, depth, ignore }
}
