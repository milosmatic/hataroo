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
}

const MAX_DEPTH = 3

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
  repos: Repo[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    const name = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (await isRepo(path)) {
      repos.push({ name, path })
    } else if (levelsLeft > 1) {
      await scanLevel(path, name, levelsLeft - 1, repos)
    }
  }
}

export async function scan(root: string, options: ScanOptions = {}): Promise<Repo[]> {
  if (await isRepo(root)) return [{ name: '.', path: root }]
  const repos: Repo[] = []
  const depth = Math.min(Math.max(options.depth ?? 1, 1), MAX_DEPTH)
  await scanLevel(root, '', depth, repos)
  return repos
}
