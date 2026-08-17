import { Box, Text, useApp, useInput, useStdin } from 'ink'
import { useEffect, useState } from 'react'
import { scan, type Repo } from '@/core/scan.js'
import type { GitStatus } from '@/core/git-status.js'
import { resolveStatuses } from '@/core/status.js'
import { Spinner } from './Spinner.js'

interface Props {
  root: string
}

export function App({ root }: Props) {
  const { exit } = useApp()
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [statuses, setStatuses] = useState<Map<string, GitStatus>>(new Map())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    scan(root)
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
  }, [root])

  const { isRawModeSupported } = useStdin()
  useInput(
    (input) => {
      if (input === 'q') exit()
    },
    { isActive: isRawModeSupported === true },
  )

  if (error !== null) {
    return (
      <Box flexDirection="column">
        <Text color="red">scan failed: {error}</Text>
        <Text dimColor>q quit</Text>
      </Box>
    )
  }

  if (repos === null) {
    return <Text dimColor>scanning {root}…</Text>
  }

  return (
    <Box flexDirection="column">
      {repos.map((repo) => (
        <RepoRow key={repo.path} repo={repo} status={statuses.get(repo.path)} />
      ))}
      <Box marginTop={1}>
        <Text dimColor>q quit</Text>
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
