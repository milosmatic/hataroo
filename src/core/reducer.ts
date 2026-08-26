export type OutcomeStatus = 'pending' | 'running' | 'ok' | 'failed' | 'skipped'

export interface RepoOutcome {
  status: OutcomeStatus
  error: string | null
  output: string
}

export interface BulkRun {
  operation: 'pull' | 'install'
  paths: string[]
  outcomes: ReadonlyMap<string, RepoOutcome>
  showResults: boolean
}

export interface CoreState {
  repoPaths: string[]
  cursor: number
  selected: ReadonlySet<string>
  statusMessage: string | null
  run: BulkRun | null
  lastOperation: ReadonlyMap<string, RepoOutcome>
  inspecting: string | null
}

export const EMPTY_SELECTION_MESSAGE = 'nothing selected: press space or a to select repos first'
export const RUN_ACTIVE_MESSAGE = 'a bulk operation is already running'
export const RESULTS_PENDING_MESSAGE = 'dismiss the results overlay first: press esc'

export type CoreAction =
  | { type: 'repos-loaded'; paths: string[] }
  | { type: 'cursor-up' }
  | { type: 'cursor-down' }
  | { type: 'toggle-select' }
  | { type: 'toggle-select-all' }
  | { type: 'action-key'; operation: 'pull' | 'install' }
  | { type: 'repo-run-started'; path: string }
  | {
      type: 'repo-run-finished'
      path: string
      status: 'ok' | 'failed' | 'skipped'
      error?: string
      output?: string
    }
  | { type: 'dismiss-results' }
  | { type: 'cancel-run' }
  | { type: 'open-inspect'; path: string }
  | { type: 'close-inspect' }

export const initialState: CoreState = {
  repoPaths: [],
  cursor: 0,
  selected: new Set(),
  statusMessage: null,
  run: null,
  lastOperation: new Map(),
  inspecting: null,
}

const SETTLED: ReadonlySet<OutcomeStatus> = new Set(['ok', 'failed', 'skipped'])

function isRunSettled(outcomes: ReadonlyMap<string, RepoOutcome>): boolean {
  for (const outcome of outcomes.values()) {
    if (!SETTLED.has(outcome.status)) return false
  }
  return true
}

function withOutcome(run: BulkRun, path: string, outcome: RepoOutcome): BulkRun | null {
  const current = run.outcomes.get(path)
  if (current === undefined || SETTLED.has(current.status)) return null
  const outcomes = new Map(run.outcomes)
  outcomes.set(path, outcome)
  return { ...run, outcomes, showResults: run.showResults || isRunSettled(outcomes) }
}

export function reduce(state: CoreState, action: CoreAction): CoreState {
  switch (action.type) {
    case 'repos-loaded':
      return {
        ...state,
        repoPaths: action.paths,
        cursor: 0,
        selected: new Set(action.paths.filter((path) => state.selected.has(path))),
        statusMessage: null,
      }
    case 'cursor-up':
      return { ...state, cursor: Math.max(0, state.cursor - 1) }
    case 'cursor-down':
      return {
        ...state,
        cursor: Math.max(0, Math.min(state.repoPaths.length - 1, state.cursor + 1)),
      }
    case 'toggle-select': {
      const path = state.repoPaths[state.cursor]
      if (path === undefined) return state
      const selected = new Set(state.selected)
      if (!selected.delete(path)) selected.add(path)
      return { ...state, selected, statusMessage: null }
    }
    case 'toggle-select-all': {
      if (state.repoPaths.length === 0) return state
      const allSelected = state.repoPaths.every((path) => state.selected.has(path))
      return {
        ...state,
        selected: allSelected ? new Set() : new Set(state.repoPaths),
        statusMessage: null,
      }
    }
    case 'action-key': {
      if (state.selected.size === 0) return { ...state, statusMessage: EMPTY_SELECTION_MESSAGE }
      if (state.run !== null) {
        const message = state.run.showResults ? RESULTS_PENDING_MESSAGE : RUN_ACTIVE_MESSAGE
        return { ...state, statusMessage: message }
      }
      // Install has no runner yet (ticket 08); starting a run for it would hang forever.
      if (action.operation !== 'pull') return { ...state, statusMessage: null }
      const paths = state.repoPaths.filter((path) => state.selected.has(path))
      const outcomes = new Map(
        paths.map((path) => [path, { status: 'pending', error: null, output: '' } as RepoOutcome]),
      )
      return {
        ...state,
        statusMessage: null,
        run: { operation: action.operation, paths, outcomes, showResults: false },
      }
    }
    case 'repo-run-started': {
      if (state.run === null) return state
      const run = withOutcome(state.run, action.path, {
        status: 'running',
        error: null,
        output: '',
      })
      if (run === null) return state
      return { ...state, run }
    }
    case 'repo-run-finished': {
      if (state.run === null) return state
      const outcome: RepoOutcome = {
        status: action.status,
        error: action.status === 'failed' ? (action.error ?? null) : null,
        output: action.output ?? '',
      }
      const run = withOutcome(state.run, action.path, outcome)
      if (run === null) return state
      const lastOperation = new Map(state.lastOperation)
      lastOperation.set(action.path, outcome)
      return { ...state, run, lastOperation }
    }
    case 'dismiss-results': {
      if (state.run === null || !state.run.showResults) return state
      return { ...state, run: null, statusMessage: null }
    }
    case 'cancel-run': {
      if (state.run === null || state.run.showResults) return state
      const outcomes = new Map(state.run.outcomes)
      for (const [path, outcome] of outcomes) {
        if (outcome.status === 'pending') outcomes.set(path, { ...outcome, status: 'skipped' })
      }
      return { ...state, run: { ...state.run, outcomes, showResults: true }, statusMessage: null }
    }
    case 'open-inspect': {
      if (!state.lastOperation.has(action.path)) return state
      return { ...state, inspecting: action.path }
    }
    case 'close-inspect': {
      if (state.inspecting === null) return state
      return { ...state, inspecting: null }
    }
    default: {
      action satisfies never
      return state
    }
  }
}
