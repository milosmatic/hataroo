import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { scan } from "./scan.js"

let roots: string[] = []

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "hataroo-scan-"))
  roots.push(root)
  return root
}

async function makeRepo(root: string, ...segments: string[]): Promise<void> {
  await mkdir(join(root, ...segments, ".git"), { recursive: true })
}

afterEach(async () => {
  await Promise.all(roots.map((r) => rm(r, { recursive: true, force: true })))
  roots = []
})

describe("scan", () => {
  it("lists a scan root that is itself a repo as a single row named '.' without descending", async () => {
    const root = await makeRoot()
    await makeRepo(root)
    await makeRepo(root, "vendored")

    const repos = await scan(root)

    expect(repos.map((r) => r.name)).toEqual(["."])
    expect(repos[0]?.path).toBe(root)
  })

  it("finds repos nested one level down when depth is 2, named by relative path", async () => {
    const root = await makeRoot()
    await makeRepo(root, "top")
    await makeRepo(root, "group", "nested")

    const repos = await scan(root, { depth: 2 })

    expect(repos.map((r) => r.name).toSorted()).toEqual(["group/nested", "top"])
  })

  it("does not find nested repos at the default depth of 1", async () => {
    const root = await makeRoot()
    await makeRepo(root, "top")
    await makeRepo(root, "group", "nested")

    const repos = await scan(root)

    expect(repos.map((r) => r.name)).toEqual(["top"])
  })

  it("caps depth at 3", async () => {
    const root = await makeRoot()
    await makeRepo(root, "a", "b", "c")
    await makeRepo(root, "a", "b", "c2", "d")

    const repos = await scan(root, { depth: 99 })

    expect(repos.map((r) => r.name)).toEqual(["a/b/c"])
  })

  it("never descends into a directory already identified as a repo", async () => {
    const root = await makeRoot()
    await makeRepo(root, "outer")
    await makeRepo(root, "outer", "submodule")

    const repos = await scan(root, { depth: 2 })

    expect(repos.map((r) => r.name)).toEqual(["outer"])
  })

  it("skips node_modules and hidden directories", async () => {
    const root = await makeRoot()
    await makeRepo(root, "visible")
    await makeRepo(root, "node_modules")
    await makeRepo(root, ".hidden")

    const repos = await scan(root)

    expect(repos.map((r) => r.name)).toEqual(["visible"])
  })

  it("finds each repo directly under the scan root as one repo", async () => {
    const root = await makeRoot()
    await makeRepo(root, "alpha")
    await makeRepo(root, "beta")
    await mkdir(join(root, "not-a-repo"))

    const repos = await scan(root)

    expect(repos.map((r) => r.name).toSorted()).toEqual(["alpha", "beta"])
  })
})
