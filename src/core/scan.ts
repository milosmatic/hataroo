import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

export interface Repo {
  /** Row name: path relative to the scan root, or "." for the root itself. */
  name: string
  /** Absolute path to the repo directory. */
  path: string
}

export interface ScanOptions {
  /** How many directory levels below the scan root to search. Clamped to [1, 3]. */
  depth?: number
  /** Globs matched against paths relative to the scan root; matches are excluded. */
  ignore?: string[]
}

const MAX_DEPTH = 3

/** Clamps a requested depth to [1, 3], defaulting to 1 when unset. */
export function clampDepth(depth: number | undefined): number {
  return Math.min(Math.max(depth ?? 1, 1), MAX_DEPTH)
}

/**
 * Converts a glob to a RegExp: `**` matches across path separators, `*`
 * matches within a single path segment. Everything else is matched literally.
 */
function globToRegExp(glob: string): RegExp {
  const pattern = glob
    .split('**')
    .map((segment) => segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*'))
    .join('.*')
  return new RegExp(`^${pattern}$`)
}

function isIgnored(name: string, matchers: RegExp[]): boolean {
  return matchers.some((matcher) => matcher.test(name))
}

async function isRepo(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir)
    return entries.includes('.git')
  } catch {
    return false
  }
}

async function scanLevel(
  dir: string,
  prefix: string,
  levelsLeft: number,
  ignore: RegExp[],
  repos: Repo[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    const name = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (isIgnored(name, ignore)) continue
    if (await isRepo(path)) {
      repos.push({ name, path })
    } else if (levelsLeft > 1) {
      await scanLevel(path, name, levelsLeft - 1, ignore, repos)
    }
  }
}

export async function scan(root: string, options: ScanOptions = {}): Promise<Repo[]> {
  if (await isRepo(root)) return [{ name: '.', path: root }]
  const repos: Repo[] = []
  const depth = clampDepth(options.depth)
  const ignore = (options.ignore ?? []).map(globToRegExp)
  await scanLevel(root, '', depth, ignore, repos)
  return repos
}
