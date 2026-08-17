import { describe, expect, it } from "vitest"
import { parsePorcelainStatus } from "./git-status.js"

describe("parsePorcelainStatus", () => {
  it("parses a clean branch with no upstream as not dirty, zero ahead/behind", () => {
    const status = parsePorcelainStatus(
      "# branch.oid a43114d59c5ab711b36443df21ca72d287108c80\n# branch.head main\n",
    )

    expect(status).toEqual({ branch: "main", ahead: 0, behind: 0, dirty: false })
  })

  it("marks dirty when an untracked file is present", () => {
    const status = parsePorcelainStatus(
      "# branch.oid a43114d59c5ab711b36443df21ca72d287108c80\n# branch.head main\n? a.txt\n",
    )

    expect(status.dirty).toBe(true)
  })

  it("marks dirty when a staged change is present", () => {
    const status = parsePorcelainStatus(
      [
        "# branch.oid a43114d59c5ab711b36443df21ca72d287108c80",
        "# branch.head main",
        "1 A. N... 000000 100644 100644 0000000000000000000000000000000000000000 587be6b4c3f93f93c489c0111bba5596147a26cb a.txt",
        "",
      ].join("\n"),
    )

    expect(status.dirty).toBe(true)
  })

  it("marks dirty when an unstaged modification is present", () => {
    const status = parsePorcelainStatus(
      [
        "# branch.oid f0a55981ebd92f1861d1a49a0d4761679a40ba39",
        "# branch.head main",
        "1 .M N... 100644 100644 100644 587be6b4c3f93f93c489c0111bba5596147a26cb 587be6b4c3f93f93c489c0111bba5596147a26cb a.txt",
        "",
      ].join("\n"),
    )

    expect(status.dirty).toBe(true)
  })

  it("reads ahead/behind counts from the branch.ab header", () => {
    const status = parsePorcelainStatus(
      [
        "# branch.oid 8d2f679ef5e60599e801aa85b2b52b604c7e6b8f",
        "# branch.head main",
        "# branch.upstream origin/main",
        "# branch.ab +2 -3",
        "",
      ].join("\n"),
    )

    expect(status.ahead).toBe(2)
    expect(status.behind).toBe(3)
  })

  it("defaults ahead/behind to zero when there is no upstream", () => {
    const status = parsePorcelainStatus(
      "# branch.oid a43114d59c5ab711b36443df21ca72d287108c80\n# branch.head main\n",
    )

    expect(status.ahead).toBe(0)
    expect(status.behind).toBe(0)
  })

  it("reports an unborn branch's oid placeholder as clean with the branch name", () => {
    const status = parsePorcelainStatus("# branch.oid (initial)\n# branch.head main\n")

    expect(status).toEqual({ branch: "main", ahead: 0, behind: 0, dirty: false })
  })

  it("is dirty=false only when there are no entry lines at all", () => {
    const status = parsePorcelainStatus(
      "# branch.oid a43114d59c5ab711b36443df21ca72d287108c80\n# branch.head main\n",
    )

    expect(status.dirty).toBe(false)
  })
})
