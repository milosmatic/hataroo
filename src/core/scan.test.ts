import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { clampDepth, scan } from './scan.js'

let roots: string[] = []

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'hataroo-scan-'))
  roots.push(root)
  return root
}

async function makeRepo(root: string, ...segments: string[]): Promise<void> {
  await mkdir(join(root, ...segments, '.git'), { recursive: true })
}

afterEach(async () => {
  await Promise.all(roots.map((r) => rm(r, { recursive: true, force: true })))
  roots = []
})

describe('clampDepth', () => {
  it('defaults to 1 when depth is unset', () => {
    expect(clampDepth(undefined)).toBe(1)
  })

  it('caps depth above 3 down to 3', () => {
    expect(clampDepth(99)).toBe(3)
  })

  it('raises depth below 1 up to 1', () => {
    expect(clampDepth(0)).toBe(1)
  })

  it('passes through an in-range depth unchanged', () => {
    expect(clampDepth(2)).toBe(2)
  })
})

describe('scan', () => {
  it("lists a scan root that is itself a repo as a single row named '.' without descending", async () => {
    const root = await makeRoot()
    await makeRepo(root)
    await makeRepo(root, 'vendored')

    const repos = await scan(root)

    expect(repos.map((r) => r.name)).toEqual(['.'])
    expect(repos[0]?.path).toBe(root)
  })

  it('finds repos nested one level down when depth is 2, named by relative path', async () => {
    const root = await makeRoot()
    await makeRepo(root, 'top')
    await makeRepo(root, 'group', 'nested')

    const repos = await scan(root, { depth: 2 })

    expect(repos.map((r) => r.name).toSorted()).toEqual(['group/nested', 'top'])
  })

  it('does not find nested repos at the default depth of 1', async () => {
    const root = await makeRoot()
    await makeRepo(root, 'top')
    await makeRepo(root, 'group', 'nested')

    const repos = await scan(root)

    expect(repos.map((r) => r.name)).toEqual(['top'])
  })

  it('caps depth at 3', async () => {
    const root = await makeRoot()
    await makeRepo(root, 'a', 'b', 'c')
    await makeRepo(root, 'a', 'b', 'c2', 'd')

    const repos = await scan(root, { depth: 99 })

    expect(repos.map((r) => r.name)).toEqual(['a/b/c'])
  })

  it('never descends into a directory already identified as a repo', async () => {
    const root = await makeRoot()
    await makeRepo(root, 'outer')
    await makeRepo(root, 'outer', 'submodule')

    const repos = await scan(root, { depth: 2 })

    expect(repos.map((r) => r.name)).toEqual(['outer'])
  })

  it('skips node_modules and hidden directories', async () => {
    const root = await makeRoot()
    await makeRepo(root, 'visible')
    await makeRepo(root, 'node_modules')
    await makeRepo(root, '.hidden')

    const repos = await scan(root)

    expect(repos.map((r) => r.name)).toEqual(['visible'])
  })

  it('finds each repo directly under the scan root as one repo', async () => {
    const root = await makeRoot()
    await makeRepo(root, 'alpha')
    await makeRepo(root, 'beta')
    await mkdir(join(root, 'not-a-repo'))

    const repos = await scan(root)

    expect(repos.map((r) => r.name).toSorted()).toEqual(['alpha', 'beta'])
  })

  it('excludes a directory matching an exact ignore glob', async () => {
    const root = await makeRoot()
    await makeRepo(root, 'alpha')
    await makeRepo(root, 'beta')

    const repos = await scan(root, { ignore: ['beta'] })

    expect(repos.map((r) => r.name)).toEqual(['alpha'])
  })

  it('excludes directories matching a wildcard ignore glob', async () => {
    const root = await makeRoot()
    await makeRepo(root, 'client-a')
    await makeRepo(root, 'client-b')
    await makeRepo(root, 'internal')

    const repos = await scan(root, { ignore: ['client-*'] })

    expect(repos.map((r) => r.name)).toEqual(['internal'])
  })

  it('matches ignore globs against paths relative to the scan root, including nested repos', async () => {
    const root = await makeRoot()
    await makeRepo(root, 'group', 'nested')
    await makeRepo(root, 'group', 'kept')

    const repos = await scan(root, { depth: 2, ignore: ['group/nested'] })

    expect(repos.map((r) => r.name)).toEqual(['group/kept'])
  })

  it('supports ** in an ignore glob to match across path segments', async () => {
    const root = await makeRoot()
    await makeRepo(root, 'a', 'vendor')
    await makeRepo(root, 'b', 'vendor')
    await makeRepo(root, 'a', 'kept')

    const repos = await scan(root, { depth: 2, ignore: ['**/vendor'] })

    expect(repos.map((r) => r.name).toSorted()).toEqual(['a/kept'])
  })

  it('applies multiple repeated ignore globs', async () => {
    const root = await makeRoot()
    await makeRepo(root, 'alpha')
    await makeRepo(root, 'beta')
    await makeRepo(root, 'gamma')

    const repos = await scan(root, { ignore: ['alpha', 'beta'] })

    expect(repos.map((r) => r.name)).toEqual(['gamma'])
  })

  it('excludes a matched non-repo directory so its nested repos are never reached', async () => {
    const root = await makeRoot()
    await makeRepo(root, 'group', 'inner')

    const repos = await scan(root, { depth: 2, ignore: ['group'] })

    expect(repos).toEqual([])
  })
})
