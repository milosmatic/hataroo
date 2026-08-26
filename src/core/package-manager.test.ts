import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { detectPackageManager, resolveInstallable, resolveInstallables } from './package-manager.js'

function files(overrides: {
  hasPackageJson?: boolean
  packageManagerField?: string
  lockfiles?: string[]
}) {
  return {
    hasPackageJson: overrides.hasPackageJson ?? true,
    packageManagerField: overrides.packageManagerField,
    lockfiles: new Set(overrides.lockfiles ?? []),
  }
}

describe('detectPackageManager', () => {
  it('is not installable when there is no package.json', () => {
    expect(detectPackageManager(files({ hasPackageJson: false }))).toEqual({ installable: false })
  })

  it('is not installable even when a lockfile is present without package.json', () => {
    const result = detectPackageManager(
      files({ hasPackageJson: false, lockfiles: ['package-lock.json'] }),
    )
    expect(result).toEqual({ installable: false })
  })

  describe('packageManager field precedence', () => {
    it('wins over a conflicting lockfile', () => {
      const result = detectPackageManager(
        files({ packageManagerField: 'pnpm@8.15.1', lockfiles: ['package-lock.json'] }),
      )
      expect(result).toEqual({ installable: true, packageManager: 'pnpm', strict: true })
    })

    it('is strict false when the field is set but no lockfile exists', () => {
      const result = detectPackageManager(files({ packageManagerField: 'yarn@4.0.0' }))
      expect(result).toEqual({ installable: true, packageManager: 'yarn', strict: false })
    })

    it('falls back to lockfile order when the field value is unrecognized', () => {
      const result = detectPackageManager(
        files({ packageManagerField: 'not-a-real-pm@1.0.0', lockfiles: ['yarn.lock'] }),
      )
      expect(result).toEqual({ installable: true, packageManager: 'yarn', strict: true })
    })
  })

  describe('lockfile order', () => {
    it('detects bun from bun.lock', () => {
      const result = detectPackageManager(files({ lockfiles: ['bun.lock'] }))
      expect(result).toEqual({ installable: true, packageManager: 'bun', strict: true })
    })

    it('detects bun from bun.lockb', () => {
      const result = detectPackageManager(files({ lockfiles: ['bun.lockb'] }))
      expect(result).toEqual({ installable: true, packageManager: 'bun', strict: true })
    })

    it('detects pnpm from pnpm-lock.yaml', () => {
      const result = detectPackageManager(files({ lockfiles: ['pnpm-lock.yaml'] }))
      expect(result).toEqual({ installable: true, packageManager: 'pnpm', strict: true })
    })

    it('detects yarn from yarn.lock', () => {
      const result = detectPackageManager(files({ lockfiles: ['yarn.lock'] }))
      expect(result).toEqual({ installable: true, packageManager: 'yarn', strict: true })
    })

    it('detects npm from package-lock.json', () => {
      const result = detectPackageManager(files({ lockfiles: ['package-lock.json'] }))
      expect(result).toEqual({ installable: true, packageManager: 'npm', strict: true })
    })

    it('prefers bun over pnpm, yarn, and npm when multiple lockfiles are present', () => {
      const result = detectPackageManager(
        files({ lockfiles: ['bun.lock', 'pnpm-lock.yaml', 'yarn.lock', 'package-lock.json'] }),
      )
      expect(result.installable && result.packageManager).toBe('bun')
    })

    it('prefers pnpm over yarn and npm', () => {
      const result = detectPackageManager(
        files({ lockfiles: ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json'] }),
      )
      expect(result.installable && result.packageManager).toBe('pnpm')
    })

    it('prefers yarn over npm', () => {
      const result = detectPackageManager(files({ lockfiles: ['yarn.lock', 'package-lock.json'] }))
      expect(result.installable && result.packageManager).toBe('yarn')
    })
  })

  it('falls back to npm, non-strict, for a bare package.json with no lockfile', () => {
    const result = detectPackageManager(files({}))
    expect(result).toEqual({ installable: true, packageManager: 'npm', strict: false })
  })
})

describe('resolveInstallable', () => {
  let roots: string[] = []

  async function makeRepo(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'hataroo-pm-'))
    roots.push(root)
    return root
  }

  afterEach(async () => {
    await Promise.all(roots.map((r) => rm(r, { recursive: true, force: true })))
    roots = []
  })

  it('is not installable when there is no package.json on disk', async () => {
    const root = await makeRepo()
    expect(await resolveInstallable(root)).toEqual({ installable: false })
  })

  it('reads the packageManager field from a real package.json', async () => {
    const root = await makeRepo()
    await writeFile(join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@8.15.1' }))

    expect(await resolveInstallable(root)).toEqual({
      installable: true,
      packageManager: 'pnpm',
      strict: false,
    })
  })

  it('detects a lockfile sitting next to a bare package.json', async () => {
    const root = await makeRepo()
    await writeFile(join(root, 'package.json'), '{}')
    await writeFile(join(root, 'pnpm-lock.yaml'), '')

    expect(await resolveInstallable(root)).toEqual({
      installable: true,
      packageManager: 'pnpm',
      strict: true,
    })
  })

  it('falls back to npm for a package.json with no field and no lockfile', async () => {
    const root = await makeRepo()
    await writeFile(join(root, 'package.json'), '{}')

    expect(await resolveInstallable(root)).toEqual({
      installable: true,
      packageManager: 'npm',
      strict: false,
    })
  })

  it('treats an unparseable package.json as having no field, not a crash', async () => {
    const root = await makeRepo()
    await writeFile(join(root, 'package.json'), '{ not valid json')
    await writeFile(join(root, 'yarn.lock'), '')

    expect(await resolveInstallable(root)).toEqual({
      installable: true,
      packageManager: 'yarn',
      strict: true,
    })
  })
})

describe('resolveInstallables', () => {
  let roots: string[] = []

  afterEach(async () => {
    await Promise.all(roots.map((r) => rm(r, { recursive: true, force: true })))
    roots = []
  })

  it('resolves installability for every path, keyed by path', async () => {
    const a = await mkdtemp(join(tmpdir(), 'hataroo-pm-'))
    const b = await mkdtemp(join(tmpdir(), 'hataroo-pm-'))
    roots.push(a, b)
    await writeFile(join(a, 'package.json'), '{}')

    const results = await resolveInstallables([a, b])

    expect(results.get(a)).toEqual({ installable: true, packageManager: 'npm', strict: false })
    expect(results.get(b)).toEqual({ installable: false })
  })

  it('calls onEach per repo as it resolves', async () => {
    const a = await mkdtemp(join(tmpdir(), 'hataroo-pm-'))
    roots.push(a)
    await writeFile(join(a, 'package.json'), '{}')
    const seen = new Map<string, boolean>()

    await resolveInstallables([a], (path, installable) => seen.set(path, installable.installable))

    expect(seen.get(a)).toBe(true)
  })
})
