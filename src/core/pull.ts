import { execa, ExecaError } from 'execa'
import { mapWithConcurrency } from './concurrency.js'

export interface PullOutcome {
  ok: boolean
  canceled: boolean
  error: string | null
  output: string
}

// Lower than status.ts's CONCURRENCY: pull hits the network.
const CONCURRENCY = 4

export interface PullRepoOptions {
  signal?: AbortSignal
}

export async function pullRepo(path: string, options: PullRepoOptions = {}): Promise<PullOutcome> {
  try {
    const result = await execa('git', ['pull', '--ff-only', '--autostash'], {
      cwd: path,
      cancelSignal: options.signal,
    })
    const output = combineOutput(result.stdout, result.stderr)
    // git exits 0 here even when the autostash pop conflicts, so a clean pull still needs
    // a status check to catch that case.
    const { stdout } = await execa('git', ['status', '--porcelain=v2'], { cwd: path })
    if (hasUnmergedPaths(stdout)) {
      return {
        ok: false,
        canceled: false,
        error: 'autostash pop conflicted after the pull: resolve manually, the stash is preserved',
        output,
      }
    }
    return { ok: true, canceled: false, error: null, output }
  } catch (cause) {
    if (cause instanceof ExecaError) {
      const stdout = typeof cause.stdout === 'string' ? cause.stdout : ''
      const stderr = typeof cause.stderr === 'string' ? cause.stderr : ''
      return {
        ok: false,
        canceled: cause.isCanceled,
        error: firstErrorLine(stderr, cause.shortMessage),
        output: combineOutput(stdout, stderr),
      }
    }
    return {
      ok: false,
      canceled: false,
      error: cause instanceof Error ? cause.message : String(cause),
      output: '',
    }
  }
}

function combineOutput(stdout: string, stderr: string): string {
  return [stdout, stderr].filter((section) => section.trim() !== '').join('\n')
}

// Porcelain v2 marks an unmerged path with a line starting `u `.
function hasUnmergedPaths(porcelainStatus: string): boolean {
  return porcelainStatus.split('\n').some((line) => line.startsWith('u '))
}

// Prefers a fatal:/error: line over the literal first line, since git's progress and
// hint lines (e.g. `From <remote>`) usually come first on stderr.
function firstErrorLine(stderr: string, fallback: string): string {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
  const fatal = lines.find((line) => /^(fatal|error):/i.test(line))
  if (fatal !== undefined) return fatal
  const last = lines.at(-1)
  if (last !== undefined) return last
  return fallback
}

export interface PullOptions {
  onStart?: (path: string) => void
  onEach?: (path: string, outcome: PullOutcome) => void
  signal?: AbortSignal
}

export async function pullRepos(
  paths: string[],
  options: PullOptions = {},
): Promise<Map<string, PullOutcome>> {
  const outcomes = await mapWithConcurrency(
    paths,
    CONCURRENCY,
    (path) => pullRepo(path, { signal: options.signal }),
    {
      onStart: (path) => options.onStart?.(path),
      onEach: (outcome, path) => options.onEach?.(path, outcome),
      signal: options.signal,
    },
  )
  return new Map(paths.map((path, i) => [path, outcomes[i] as PullOutcome]))
}
