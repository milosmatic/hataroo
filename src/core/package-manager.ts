import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mapWithConcurrency } from './concurrency.js'

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export type Installable =
  | { installable: true; packageManager: PackageManager; strict: boolean }
  | { installable: false }

export interface RepoFiles {
  hasPackageJson: boolean
  /** Raw `packageManager` field from package.json, e.g. "pnpm@8.15.1". */
  packageManagerField: string | undefined
  /** Lockfile filenames present in the repo root. */
  lockfiles: ReadonlySet<string>
}

// Precedence order for lockfile-based detection: bun's two lockfile names share a tier,
// then pnpm, yarn, npm.
const LOCKFILES: ReadonlyArray<[file: string, packageManager: PackageManager]> = [
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
]

const PACKAGE_MANAGERS: ReadonlySet<string> = new Set(['npm', 'pnpm', 'yarn', 'bun'])

function parsePackageManagerField(field: string | undefined): PackageManager | undefined {
  const name = field?.split('@')[0]
  return name !== undefined && PACKAGE_MANAGERS.has(name) ? (name as PackageManager) : undefined
}

/**
 * Given a repo's relevant files, returns its package manager and whether it's
 * installable. `packageManager` wins over any lockfile; failing that, lockfile
 * order decides; a bare package.json falls back to npm. No package.json means
 * not installable. Strict (lockfile-enforcing) is chosen whenever a lockfile exists.
 */
export function detectPackageManager(files: RepoFiles): Installable {
  if (!files.hasPackageJson) return { installable: false }

  const strict = files.lockfiles.size > 0
  const fromField = parsePackageManagerField(files.packageManagerField)
  if (fromField !== undefined) return { installable: true, packageManager: fromField, strict }

  for (const [file, packageManager] of LOCKFILES) {
    if (files.lockfiles.has(file)) return { installable: true, packageManager, strict: true }
  }
  return { installable: true, packageManager: 'npm', strict: false }
}

const LOCKFILE_NAMES: ReadonlySet<string> = new Set(LOCKFILES.map(([file]) => file))

/**
 * Reads `path`'s directory listing and package.json (if any) and detects its package
 * manager. This is the disk-touching seam other ecosystems (cargo, pip, go) would
 * implement with the same `(path: string) => Promise<Installable>` shape later.
 */
export async function resolveInstallable(path: string): Promise<Installable> {
  const entries = await readdir(path)
  const hasPackageJson = entries.includes('package.json')
  const lockfiles = new Set(entries.filter((entry) => LOCKFILE_NAMES.has(entry)))
  const packageManagerField = hasPackageJson
    ? await readPackageManagerField(join(path, 'package.json'))
    : undefined
  return detectPackageManager({ hasPackageJson, packageManagerField, lockfiles })
}

async function readPackageManagerField(packageJsonPath: string): Promise<string | undefined> {
  try {
    const contents = JSON.parse(await readFile(packageJsonPath, 'utf8')) as unknown
    if (typeof contents !== 'object' || contents === null) return undefined
    const field = (contents as Record<string, unknown>).packageManager
    return typeof field === 'string' ? field : undefined
  } catch {
    return undefined
  }
}

const CONCURRENCY = 16

/**
 * Resolves installability for every repo path, bounded to {@link CONCURRENCY} in flight.
 * `onEach` fires per repo as it resolves, before the whole batch finishes.
 */
export async function resolveInstallables(
  paths: string[],
  onEach?: (path: string, installable: Installable) => void,
): Promise<Map<string, Installable>> {
  const results = await mapWithConcurrency(paths, CONCURRENCY, resolveInstallable, {
    onEach: (installable, path) => onEach?.(path, installable),
  })
  return new Map(paths.map((path, i) => [path, results[i] as Installable]))
}
