import { execa, ExecaError } from 'execa'
import { mapWithConcurrency } from './concurrency.js'

export interface PullOutcome {
  ok: boolean
  error: string | null
}

// Lower than status.ts's CONCURRENCY: pull hits the network.
const CONCURRENCY = 4

export async function pullRepo(path: string): Promise<PullOutcome> {
  try {
    await execa('git', ['pull', '--ff-only', '--autostash'], { cwd: path })
  } catch (cause) {
    return { ok: false, error: firstErrorLine(cause) }
  }
  // git exits 0 here even when the autostash pop conflicts, so a clean pull still needs
  // a status check to catch that case.
  const { stdout } = await execa('git', ['status', '--porcelain=v2'], { cwd: path })
  if (hasUnmergedPaths(stdout)) {
    return {
      ok: false,
      error: 'autostash pop conflicted after the pull: resolve manually, the stash is preserved',
    }
  }
  return { ok: true, error: null }
}

// Porcelain v2 marks an unmerged path with a line starting `u `.
function hasUnmergedPaths(porcelainStatus: string): boolean {
  return porcelainStatus.split('\n').some((line) => line.startsWith('u '))
}

// Prefers a fatal:/error: line over the literal first line, since git's progress and
// hint lines (e.g. `From <remote>`) usually come first on stderr.
function firstErrorLine(cause: unknown): string {
  if (cause instanceof ExecaError) {
    const lines = (cause.stderr ?? '')
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line !== '')
    const fatal = lines.find((line: string) => /^(fatal|error):/i.test(line))
    if (fatal !== undefined) return fatal
    const last = lines.at(-1)
    if (last !== undefined) return last
    return cause.shortMessage
  }
  return cause instanceof Error ? cause.message : String(cause)
}

export interface PullOptions {
  onStart?: (path: string) => void
  onEach?: (path: string, outcome: PullOutcome) => void
}

export async function pullRepos(
  paths: string[],
  options: PullOptions = {},
): Promise<Map<string, PullOutcome>> {
  const outcomes = await mapWithConcurrency(paths, CONCURRENCY, pullRepo, {
    onStart: (path) => options.onStart?.(path),
    onEach: (outcome, path) => options.onEach?.(path, outcome),
  })
  return new Map(paths.map((path, i) => [path, outcomes[i] as PullOutcome]))
}
