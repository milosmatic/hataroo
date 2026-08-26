import { Box, Text, useApp, useInput, useStdin, useStdout } from 'ink'
import { useEffect, useReducer, useRef, useState } from 'react'
import type { GitStatus } from '@/core/git-status.js'
import { type Installable, resolveInstallables } from '@/core/package-manager.js'
import { type PullOutcome, pullRepos } from '@/core/pull.js'
import {
  type BulkRun,
  initialState,
  type OutcomeStatus,
  reduce,
  type RepoOutcome,
} from '@/core/reducer.js'
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

// A canceled pull is grouped with skipped, never failed: hataroo killed it on purpose,
// the git operation itself didn't fail.
function toOutcomeStatus(outcome: PullOutcome): 'ok' | 'failed' | 'skipped' {
  if (outcome.ok) return 'ok'
  return outcome.canceled ? 'skipped' : 'failed'
}

export function App({ root, depth, ignore }: Props) {
  const { exit } = useApp()
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [statuses, setStatuses] = useState<Map<string, GitStatus>>(new Map())
  const [installables, setInstallables] = useState<Map<string, Installable>>(new Map())
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
        setInstallables(new Map())
        const paths = found.map((repo) => repo.path)
        dispatch({ type: 'repos-loaded', paths })
        return Promise.all([
          resolveStatuses(paths, (path, status) => {
            if (cancelled) return
            setStatuses((prev) => new Map(prev).set(path, status))
          }),
          resolveInstallables(paths, (path, installable) => {
            if (cancelled) return
            setInstallables((prev) => new Map(prev).set(path, installable))
          }),
        ])
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
  const runController = useRef<AbortController | null>(null)
  useEffect(() => {
    const run = state.run
    if (run === null || run.operation !== 'pull' || startedRun.current === run.paths) return
    startedRun.current = run.paths
    const controller = new AbortController()
    runController.current = controller
    pullRepos(run.paths, {
      signal: controller.signal,
      onStart: (path) => dispatch({ type: 'repo-run-started', path }),
      onEach: (path, outcome) =>
        dispatch({
          type: 'repo-run-finished',
          path,
          status: toOutcomeStatus(outcome),
          error: outcome.error ?? undefined,
          output: outcome.output,
        }),
    }).catch(() => {
      // pullRepo reports failures via the outcome; it shouldn't reject.
    })
  }, [state.run])

  function cancelRun(): void {
    runController.current?.abort()
    dispatch({ type: 'cancel-run' })
  }

  const { isRawModeSupported } = useStdin()
  useInput(
    (input, key) => {
      const runActive = state.run !== null && !state.run.showResults
      if (input === 'q') {
        if (runActive) cancelRun()
        exit()
        return
      }
      if (key.escape) {
        if (state.inspecting !== null) dispatch({ type: 'close-inspect' })
        else if (runActive) cancelRun()
        else dispatch({ type: 'dismiss-results' })
        return
      }
      if (input === 'r') setScanCount((count) => count + 1)
      if (key.upArrow) dispatch({ type: 'cursor-up' })
      if (key.downArrow) dispatch({ type: 'cursor-down' })
      if (input === ' ') dispatch({ type: 'toggle-select' })
      if (input === 'a') dispatch({ type: 'toggle-select-all' })
      if (input === 'p') dispatch({ type: 'action-key', operation: 'pull' })
      if (input === 'i') dispatch({ type: 'action-key', operation: 'install' })
      if (key.return && state.inspecting === null) {
        const path = state.repoPaths[state.cursor]
        if (path !== undefined) dispatch({ type: 'open-inspect', path })
      }
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

  if (state.inspecting !== null) {
    const repo = repos.find((r) => r.path === state.inspecting)
    const outcome = state.lastOperation.get(state.inspecting)
    if (outcome !== undefined) {
      return <InspectView name={repo?.name ?? state.inspecting} outcome={outcome} />
    }
  }

  if (state.run !== null && state.run.showResults) {
    return (
      <ResultsOverlay run={state.run} repos={repos} cursorPath={state.repoPaths[state.cursor]} />
    )
  }

  const visible = repos.slice(start, start + height)

  return (
    <Box flexDirection="column">
      {visible.map((repo, i) => (
        <RepoRow
          key={repo.path}
          repo={repo}
          status={statuses.get(repo.path)}
          installable={installables.get(repo.path)}
          isCursor={start + i === state.cursor}
          isSelected={state.selected.has(repo.path)}
        />
      ))}
      <Box marginTop={1} flexDirection="column">
        {state.run !== null && !state.run.showResults && (
          <Text color="cyan">{state.run.operation} running… esc to cancel</Text>
        )}
        {state.statusMessage !== null && <Text color="yellow">{state.statusMessage}</Text>}
        <Text dimColor>
          ↑↓ move · space select · a all · enter inspect · p pull · i install · r rescan · q quit
        </Text>
      </Box>
    </Box>
  )
}

interface ResultsOverlayProps {
  run: BulkRun
  repos: Repo[]
  cursorPath: string | undefined
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

function ResultsOverlay({ run, repos, cursorPath }: ResultsOverlayProps) {
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
          <Text key={path} color={color} inverse={path === cursorPath}>
            {icon} {nameFor(path)}
            {status === 'failed' && outcome?.error !== null ? `: ${outcome?.error}` : ''}
          </Text>
        )
      })}
      <Box marginTop={1}>
        <Text dimColor>↑↓ move · enter inspect · esc dismiss</Text>
      </Box>
    </Box>
  )
}

interface InspectViewProps {
  name: string
  outcome: RepoOutcome
}

function InspectView({ name, outcome }: InspectViewProps) {
  return (
    <Box flexDirection="column">
      <Text bold>
        {name}: {outcome.status}
      </Text>
      <Text>{outcome.output === '' ? '(no output)' : outcome.output}</Text>
      <Box marginTop={1}>
        <Text dimColor>esc close</Text>
      </Box>
    </Box>
  )
}

interface RepoRowProps {
  repo: Repo
  status: GitStatus | undefined
  installable: Installable | undefined
  isCursor: boolean
  isSelected: boolean
}

function PackageManagerHint({ installable }: { installable: Installable | undefined }) {
  if (installable === undefined) return null
  if (!installable.installable) return <Text dimColor> · no install</Text>
  return <Text> · {installable.packageManager}</Text>
}

function RepoRow({ repo, status, installable, isCursor, isSelected }: RepoRowProps) {
  const prefix = `${isCursor ? '›' : ' '}${isSelected ? '◉' : '○'} `

  if (status === undefined) {
    return (
      <Text color={isSelected ? 'cyan' : undefined} inverse={isCursor}>
        {prefix}
        <Spinner /> {repo.name}
        <PackageManagerHint installable={installable} />
      </Text>
    )
  }

  return (
    <Text color={isSelected ? 'cyan' : undefined} inverse={isCursor}>
      {prefix}
      {repo.name} · {status.branch} · ↑{status.ahead}↓{status.behind}{' '}
      {status.dirty ? <Text color="yellow">● dirty</Text> : <Text dimColor>clean</Text>}
      <PackageManagerHint installable={installable} />
    </Text>
  )
}
