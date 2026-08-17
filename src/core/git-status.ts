export interface GitStatus {
  branch: string
  ahead: number
  behind: number
  /** Staged, unstaged, or untracked changes present — a single flag, never a count. */
  dirty: boolean
}

const AB_HEADER = /^# branch\.ab \+(\d+) -(\d+)$/
const HEAD_HEADER = /^# branch\.head (.+)$/

/** Parses `git status --porcelain=v2 --branch` output into a {@link GitStatus}. */
export function parsePorcelainStatus(output: string): GitStatus {
  let branch = ''
  let ahead = 0
  let behind = 0
  let dirty = false

  for (const line of output.split('\n')) {
    if (line === '') continue
    if (line.startsWith('# branch.head ')) {
      branch = HEAD_HEADER.exec(line)?.[1] ?? ''
      continue
    }
    if (line.startsWith('# branch.ab ')) {
      const match = AB_HEADER.exec(line)
      if (match?.[1] !== undefined && match[2] !== undefined) {
        ahead = Number(match[1])
        behind = Number(match[2])
      }
      continue
    }
    if (line.startsWith('#')) continue
    dirty = true
  }

  return { branch, ahead, behind, dirty }
}
