import { execa } from 'execa'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveStatus, resolveStatuses } from './status.js'

let roots: string[] = []

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'hataroo-git-'))
  roots.push(root)
  await execa('git', ['init', '-q', '-b', 'main'], { cwd: root })
  await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: root })
  await execa('git', ['config', 'user.name', 'Test'], { cwd: root })
  return root
}

async function commit(root: string, message: string): Promise<void> {
  await execa('git', ['commit', '-q', '--allow-empty', '-m', message], { cwd: root })
}

afterEach(async () => {
  await Promise.all(roots.map((r) => rm(r, { recursive: true, force: true })))
  roots = []
})

describe('resolveStatus (git integration)', () => {
  it('reports a freshly initialized repo as clean with its branch name', async () => {
    const root = await makeRepo()
    await commit(root, 'init')

    const status = await resolveStatus(root)

    expect(status).toEqual({ branch: 'main', ahead: 0, behind: 0, dirty: false })
  })

  it('reports dirty when there is an untracked file', async () => {
    const root = await makeRepo()
    await commit(root, 'init')
    await writeFile(join(root, 'a.txt'), 'x')

    const status = await resolveStatus(root)

    expect(status.dirty).toBe(true)
  })

  it('reports dirty when there is a staged change', async () => {
    const root = await makeRepo()
    await commit(root, 'init')
    await writeFile(join(root, 'a.txt'), 'x')
    await execa('git', ['add', 'a.txt'], { cwd: root })

    const status = await resolveStatus(root)

    expect(status.dirty).toBe(true)
  })

  it('reports ahead count relative to upstream', async () => {
    const remote = await mkdtemp(join(tmpdir(), 'hataroo-remote-'))
    roots.push(remote)
    await execa('git', ['init', '-q', '--bare', '-b', 'main', remote])

    const root = await makeRepo()
    await commit(root, 'init')
    await execa('git', ['remote', 'add', 'origin', remote], { cwd: root })
    await execa('git', ['push', '-q', '-u', 'origin', 'main'], { cwd: root })
    await commit(root, 'ahead by one')

    const status = await resolveStatus(root)

    expect(status.ahead).toBe(1)
    expect(status.behind).toBe(0)
  })
})

describe('resolveStatuses (git integration)', () => {
  it('resolves status for every repo, keyed by path', async () => {
    const a = await makeRepo()
    await commit(a, 'init')
    const b = await makeRepo()
    await commit(b, 'init')
    await writeFile(join(b, 'dirty.txt'), 'x')

    const results = await resolveStatuses([a, b])

    expect(results.get(a)?.dirty).toBe(false)
    expect(results.get(b)?.dirty).toBe(true)
  })

  it('calls onEach per repo as its status resolves', async () => {
    const a = await makeRepo()
    await commit(a, 'init')
    const b = await makeRepo()
    await commit(b, 'init')
    const seen = new Map<string, boolean>()

    await resolveStatuses([a, b], (path, status) => seen.set(path, status.dirty))

    expect(seen.get(a)).toBe(false)
    expect(seen.get(b)).toBe(false)
  })
})
