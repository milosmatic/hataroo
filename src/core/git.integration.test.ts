import { execa } from 'execa'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { pullRepo } from './pull.js'
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

/** Makes a bare remote plus a clone tracking it, both usable as regular repos. */
async function makeRemoteAndClone(): Promise<{ origin: string; clone: string }> {
  const remote = await mkdtemp(join(tmpdir(), 'hataroo-remote-'))
  roots.push(remote)
  await execa('git', ['init', '-q', '--bare', '-b', 'main', remote])

  const origin = await makeRepo()
  await commit(origin, 'init')
  await execa('git', ['remote', 'add', 'origin', remote], { cwd: origin })
  await execa('git', ['push', '-q', '-u', 'origin', 'main'], { cwd: origin })

  const clone = await mkdtemp(join(tmpdir(), 'hataroo-clone-'))
  roots.push(clone)
  await execa('git', ['clone', '-q', remote, clone])
  await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: clone })
  await execa('git', ['config', 'user.name', 'Test'], { cwd: clone })

  return { origin, clone }
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

describe('pullRepo (git integration)', () => {
  it('fast-forwards a clean clone that is behind its remote', async () => {
    const { origin, clone } = await makeRemoteAndClone()
    await commit(origin, 'ahead by one')
    await execa('git', ['push', '-q', 'origin', 'main'], { cwd: origin })

    const outcome = await pullRepo(clone)

    expect(outcome).toEqual({ ok: true, error: null })
    const log = await execa('git', ['log', '-1', '--format=%s'], { cwd: clone })
    expect(log.stdout).toBe('ahead by one')
  })

  it('fails loudly on a non-fast-forward pull, never merging or rebasing', async () => {
    const { origin, clone } = await makeRemoteAndClone()
    await commit(origin, 'remote diverges')
    await execa('git', ['push', '-q', 'origin', 'main'], { cwd: origin })
    await commit(clone, 'local diverges')

    const outcome = await pullRepo(clone)

    expect(outcome.ok).toBe(false)
    expect(outcome.error).toMatch(/fast-forward/i)
    const log = await execa('git', ['log', '-1', '--format=%s'], { cwd: clone })
    expect(log.stdout).toBe('local diverges')
  })

  it('autostashes a dirty tree, fast-forwards, and reapplies the local change', async () => {
    const { origin, clone } = await makeRemoteAndClone()
    await commit(origin, 'ahead by one')
    await execa('git', ['push', '-q', 'origin', 'main'], { cwd: origin })
    await writeFile(join(clone, 'local.txt'), 'local change')

    const outcome = await pullRepo(clone)

    expect(outcome).toEqual({ ok: true, error: null })
    const log = await execa('git', ['log', '-1', '--format=%s'], { cwd: clone })
    expect(log.stdout).toBe('ahead by one')
    expect(await readFile(join(clone, 'local.txt'), 'utf8')).toBe('local change')
  })

  it('fails when the autostash pop conflicts, leaving the stash preserved', async () => {
    const { origin, clone } = await makeRemoteAndClone()
    await writeFile(join(origin, 'shared.txt'), 'line1\n')
    await execa('git', ['add', 'shared.txt'], { cwd: origin })
    await commit(origin, 'add shared.txt')
    await execa('git', ['push', '-q', 'origin', 'main'], { cwd: origin })
    await execa('git', ['pull', '-q'], { cwd: clone })
    await writeFile(join(clone, 'shared.txt'), 'line1-local\n')

    await writeFile(join(origin, 'shared.txt'), 'line1-remote\n')
    await execa('git', ['commit', '-q', '-am', 'diverge shared.txt'], { cwd: origin })
    await execa('git', ['push', '-q', 'origin', 'main'], { cwd: origin })

    const outcome = await pullRepo(clone)

    expect(outcome.ok).toBe(false)
    expect(outcome.error).toMatch(/conflict/i)
    // git's own autostash-pop failure leaves the stash entry behind for the user to resolve.
    const stash = await execa('git', ['stash', 'list'], { cwd: clone })
    expect(stash.stdout).not.toBe('')
  })
})
