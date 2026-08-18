export interface CoreState {
  repoPaths: string[]
  cursor: number
  selected: ReadonlySet<string>
  statusMessage: string | null
}

export const EMPTY_SELECTION_MESSAGE = 'nothing selected: press space or a to select repos first'

export type CoreAction =
  | { type: 'repos-loaded'; paths: string[] }
  | { type: 'cursor-up' }
  | { type: 'cursor-down' }
  | { type: 'toggle-select' }
  | { type: 'toggle-select-all' }
  | { type: 'action-key'; operation: 'pull' | 'install' }

export const initialState: CoreState = {
  repoPaths: [],
  cursor: 0,
  selected: new Set(),
  statusMessage: null,
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
      return { ...state, statusMessage: null }
    }
  }
}
