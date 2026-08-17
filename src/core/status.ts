import { execa } from 'execa'
import { mapWithConcurrency } from './concurrency.js'
import { type GitStatus, parsePorcelainStatus } from './git-status.js'

const CONCURRENCY = 8

/** Resolves the {@link GitStatus} of the repo at `path` by shelling out to git. */
export async function resolveStatus(path: string): Promise<GitStatus> {
  const { stdout } = await execa('git', ['status', '--porcelain=v2', '--branch'], {
    cwd: path,
  })
  return parsePorcelainStatus(stdout)
}

/**
 * Resolves status for every repo path, bounded to {@link CONCURRENCY} in flight at once.
 * `onEach` fires per repo as its status resolves, before the whole batch finishes.
 */
export async function resolveStatuses(
  paths: string[],
  onEach?: (path: string, status: GitStatus) => void,
): Promise<Map<string, GitStatus>> {
  const statuses = await mapWithConcurrency(paths, CONCURRENCY, resolveStatus, {
    onEach: (status, path) => onEach?.(path, status),
  })
  return new Map(paths.map((path, i) => [path, statuses[i] as GitStatus]))
}
