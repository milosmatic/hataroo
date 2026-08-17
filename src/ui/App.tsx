import { Box, Text, useApp, useInput, useStdin } from 'ink'
import { useEffect, useState } from 'react'
import { clampDepth, scan, type Repo } from '@/core/scan.js'
import type { GitStatus } from '@/core/git-status.js'
import { resolveStatuses } from '@/core/status.js'
import { Spinner } from './Spinner.js'

interface Props {
  root: string
  depth?: number
  ignore?: string[]
}

export function App({ root, depth, ignore }: Props) {
  const { exit } = useApp()
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [statuses, setStatuses] = useState<Map<string, GitStatus>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [scanCount, setScanCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setRepos(null)
    setError(null)
    scan(root, { depth, ignore })
      .then((found) => {
        if (cancelled) return
        setRepos(found)
        setStatuses(new Map())
        return resolveStatuses(
          found.map((repo) => repo.path),
          (path, status) => {
            if (cancelled) return
            setStatuses((prev) => new Map(prev).set(path, status))
          },
        )
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      cancelled = true
    }
  }, [root, depth, ignore, scanCount])

  const { isRawModeSupported } = useStdin()
  useInput(
    (input) => {
      if (input === 'q') exit()
      if (input === 'r') setScanCount((count) => count + 1)
    },
    { isActive: isRawModeSupported === true },
  )

  if (error !== null) {
    return (
      <Box flexDirection="column">
        <Text color="red">scan failed: {error}</Text>
        <Text dimColor>r rescan · q quit</Text>
      </Box>
    )
  }

  if (repos === null) {
    return <Text dimColor>scanning {root}…</Text>
  }

  if (repos.length === 0) {
    const depthUsed = clampDepth(depth)
    return (
      <Box flexDirection="column">
        <Text>No repos found under {root}</Text>
        <Text dimColor>depth used: {depthUsed}</Text>
        {depthUsed < 2 && <Text dimColor>hint: try --depth 2</Text>}
        {ignore !== undefined && ignore.length > 0 && (
          <Text dimColor>
            hint: {ignore.length} --ignore pattern(s) active, one may be excluding everything
          </Text>
        )}
        <Box marginTop={1}>
          <Text dimColor>r rescan · q quit</Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {repos.map((repo) => (
        <RepoRow key={repo.path} repo={repo} status={statuses.get(repo.path)} />
      ))}
      <Box marginTop={1}>
        <Text dimColor>r rescan · q quit</Text>
      </Box>
    </Box>
  )
}

function RepoRow({ repo, status }: { repo: Repo; status: GitStatus | undefined }) {
  if (status === undefined) {
    return (
      <Text>
        <Spinner /> {repo.name}
      </Text>
    )
  }

  return (
    <Text>
      {repo.name} · {status.branch} · ↑{status.ahead}↓{status.behind}{' '}
      {status.dirty ? <Text color="yellow">● dirty</Text> : <Text dimColor>clean</Text>}
    </Text>
  )
}
