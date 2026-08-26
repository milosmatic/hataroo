import { Box, Text, useApp, useInput, useStdin, useStdout } from 'ink'
import { useEffect, useReducer, useRef, useState } from 'react'
import type { GitStatus } from '@/core/git-status.js'
import { pullRepos } from '@/core/pull.js'
import { type BulkRun, initialState, type OutcomeStatus, reduce } from '@/core/reducer.js'
import { clampDepth, scan, type Repo } from '@/core/scan.js'
import { resolveStatuses } from '@/core/status.js'
import { viewportStart } from '@/core/viewport.js'
import { Spinner } from './Spinner.js'

interface Props {
  root: string
  depth?: number
  ignore?: string[]
}

const CHROME_LINES = 3

export function App({ root, depth, ignore }: Props) {
  const { exit } = useApp()
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [statuses, setStatuses] = useState<Map<string, GitStatus>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [scanCount, setScanCount] = useState(0)
  const [state, dispatch] = useReducer(reduce, initialState)

  useEffect(() => {
    let cancelled = false
    setRepos(null)
    setError(null)
    scan(root, { depth, ignore })
      .then((found) => {
        if (cancelled) return
        setRepos(found)
        setStatuses(new Map())
        dispatch({ type: 'repos-loaded', paths: found.map((repo) => repo.path) })
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

  // `run.paths` is a stable reference for the run's lifetime, so it's a safe key for
  // "have we already started this run" even though `state.run` itself changes each outcome.
  const startedRun = useRef<string[] | null>(null)
  useEffect(() => {
    const run = state.run
    if (run === null || run.operation !== 'pull' || startedRun.current === run.paths) return
    startedRun.current = run.paths
    pullRepos(run.paths, {
      onStart: (path) => dispatch({ type: 'repo-run-started', path }),
      onEach: (path, outcome) =>
        dispatch({
          type: 'repo-run-finished',
          path,
          status: outcome.ok ? 'ok' : 'failed',
          error: outcome.error ?? undefined,
        }),
    }).catch(() => {
      // pullRepo reports failures via the outcome; it shouldn't reject.
    })
  }, [state.run])

  const { isRawModeSupported } = useStdin()
  useInput(
    (input, key) => {
      if (input === 'q') exit()
      if (input === 'r') setScanCount((count) => count + 1)
      if (key.escape) dispatch({ type: 'dismiss-results' })
      if (key.upArrow) dispatch({ type: 'cursor-up' })
      if (key.downArrow) dispatch({ type: 'cursor-down' })
      if (input === ' ') dispatch({ type: 'toggle-select' })
      if (input === 'a') dispatch({ type: 'toggle-select-all' })
      if (input === 'p') dispatch({ type: 'action-key', operation: 'pull' })
      if (input === 'i') dispatch({ type: 'action-key', operation: 'install' })
    },
    { isActive: isRawModeSupported === true },
  )

  const { stdout } = useStdout()
  const height = Math.max(1, (stdout.rows || 24) - CHROME_LINES)
  const previousStart = useRef(0)
  const start = viewportStart({
    previousStart: previousStart.current,
    cursor: state.cursor,
    rowCount: state.repoPaths.length,
    height,
  })
  useEffect(() => {
    previousStart.current = start
  }, [start])

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

  if (state.run !== null && state.run.showResults) {
    return <ResultsOverlay run={state.run} repos={repos} />
  }

  const visible = repos.slice(start, start + height)

  return (
    <Box flexDirection="column">
      {visible.map((repo, i) => (
        <RepoRow
          key={repo.path}
          repo={repo}
          status={statuses.get(repo.path)}
          isCursor={start + i === state.cursor}
          isSelected={state.selected.has(repo.path)}
        />
      ))}
      <Box marginTop={1} flexDirection="column">
        {state.statusMessage !== null && <Text color="yellow">{state.statusMessage}</Text>}
        <Text dimColor>
          ↑↓ move · space select · a all · p pull · i install · r rescan · q quit
        </Text>
      </Box>
    </Box>
  )
}

interface ResultsOverlayProps {
  run: BulkRun
  repos: Repo[]
}

interface OutcomePresentation {
  icon: string
  color?: string
}

const OUTCOME_PRESENTATION: Record<OutcomeStatus, OutcomePresentation> = {
  pending: { icon: '…' },
  running: { icon: '…' },
  ok: { icon: '✓', color: 'green' },
  failed: { icon: '✗', color: 'red' },
  skipped: { icon: '–' },
}

function countByStatus(run: BulkRun, status: OutcomeStatus): number {
  return run.paths.filter((path) => run.outcomes.get(path)?.status === status).length
}

function ResultsOverlay({ run, repos }: ResultsOverlayProps) {
  const nameFor = (path: string) => repos.find((repo) => repo.path === path)?.name ?? path
  const ok = countByStatus(run, 'ok')
  const failed = countByStatus(run, 'failed')
  const skipped = countByStatus(run, 'skipped')

  return (
    <Box flexDirection="column">
      <Text bold>
        {run.operation} results: {ok} ok · {failed} failed · {skipped} skipped
      </Text>
      {run.paths.map((path) => {
        const outcome = run.outcomes.get(path)
        const status = outcome?.status ?? 'pending'
        const { icon, color } = OUTCOME_PRESENTATION[status]
        return (
          <Text key={path} color={color}>
            {icon} {nameFor(path)}
            {status === 'failed' && outcome?.error !== null ? `: ${outcome?.error}` : ''}
          </Text>
        )
      })}
      <Box marginTop={1}>
        <Text dimColor>esc dismiss</Text>
      </Box>
    </Box>
  )
}

interface RepoRowProps {
  repo: Repo
  status: GitStatus | undefined
  isCursor: boolean
  isSelected: boolean
}

function RepoRow({ repo, status, isCursor, isSelected }: RepoRowProps) {
  const prefix = `${isCursor ? '›' : ' '}${isSelected ? '◉' : '○'} `

  if (status === undefined) {
    return (
      <Text color={isSelected ? 'cyan' : undefined} inverse={isCursor}>
        {prefix}
        <Spinner /> {repo.name}
      </Text>
    )
  }

  return (
    <Text color={isSelected ? 'cyan' : undefined} inverse={isCursor}>
      {prefix}
      {repo.name} · {status.branch} · ↑{status.ahead}↓{status.behind}{' '}
      {status.dirty ? <Text color="yellow">● dirty</Text> : <Text dimColor>clean</Text>}
    </Text>
  )
}
