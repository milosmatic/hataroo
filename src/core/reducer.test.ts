import { describe, expect, it } from 'vitest'
import { type CoreState, initialState, reduce } from './reducer.js'

const loaded = (paths: string[]): CoreState => reduce(initialState, { type: 'repos-loaded', paths })

describe('reduce', () => {
  describe('repos-loaded', () => {
    it('starts with the cursor on the first row and nothing selected', () => {
      const state = loaded(['/a', '/b', '/c'])
      expect(state.cursor).toBe(0)
      expect(state.selected.size).toBe(0)
    })
  })

  describe('cursor movement', () => {
    it('moves the cursor down and up', () => {
      let state = loaded(['/a', '/b', '/c'])
      state = reduce(state, { type: 'cursor-down' })
      state = reduce(state, { type: 'cursor-down' })
      expect(state.cursor).toBe(2)
      state = reduce(state, { type: 'cursor-up' })
      expect(state.cursor).toBe(1)
    })

    it('stops at the first row instead of wrapping past the top', () => {
      const state = reduce(loaded(['/a', '/b']), { type: 'cursor-up' })
      expect(state.cursor).toBe(0)
    })

    it('keeps the cursor at 0 on an empty list', () => {
      const state = reduce(loaded([]), { type: 'cursor-down' })
      expect(state.cursor).toBe(0)
    })

    it('stops at the last row instead of wrapping past the bottom', () => {
      let state = loaded(['/a', '/b'])
      state = reduce(state, { type: 'cursor-down' })
      state = reduce(state, { type: 'cursor-down' })
      expect(state.cursor).toBe(1)
    })
  })

  describe('toggle-select', () => {
    it('selects the cursor row, and deselects it when toggled again', () => {
      let state = reduce(loaded(['/a', '/b']), { type: 'cursor-down' })
      state = reduce(state, { type: 'toggle-select' })
      expect([...state.selected]).toEqual(['/b'])
      state = reduce(state, { type: 'toggle-select' })
      expect(state.selected.size).toBe(0)
    })

    it('does nothing when there are no rows', () => {
      const state = reduce(loaded([]), { type: 'toggle-select' })
      expect(state.selected.size).toBe(0)
    })
  })

  describe('toggle-select-all', () => {
    it('selects every row when the selection is empty', () => {
      const state = reduce(loaded(['/a', '/b', '/c']), { type: 'toggle-select-all' })
      expect([...state.selected]).toEqual(['/a', '/b', '/c'])
    })

    it('selects every row when the selection is partial', () => {
      let state = reduce(loaded(['/a', '/b']), { type: 'toggle-select' })
      state = reduce(state, { type: 'toggle-select-all' })
      expect(state.selected.size).toBe(2)
    })

    it('clears the selection when every row is already selected', () => {
      let state = reduce(loaded(['/a', '/b']), { type: 'toggle-select-all' })
      state = reduce(state, { type: 'toggle-select-all' })
      expect(state.selected.size).toBe(0)
    })

    it('does nothing when there are no rows', () => {
      const state = reduce(loaded([]), { type: 'toggle-select-all' })
      expect(state.selected.size).toBe(0)
    })
  })

  describe('rescan', () => {
    it('keeps selected repos that still exist and resets the cursor', () => {
      let state = reduce(loaded(['/a', '/b']), { type: 'cursor-down' })
      state = reduce(state, { type: 'toggle-select' })
      state = reduce(state, { type: 'repos-loaded', paths: ['/a', '/b', '/c'] })
      expect(state.cursor).toBe(0)
      expect([...state.selected]).toEqual(['/b'])
    })

    it('drops selected repos that disappeared from the scan', () => {
      let state = reduce(loaded(['/a', '/b']), { type: 'toggle-select-all' })
      state = reduce(state, { type: 'repos-loaded', paths: ['/a'] })
      expect([...state.selected]).toEqual(['/a'])
    })

    it('still selects all after a rescan removed a previously selected repo', () => {
      let state = reduce(loaded(['/a', '/b', '/c']), { type: 'toggle-select-all' })
      state = reduce(state, { type: 'repos-loaded', paths: ['/a', '/b'] })
      state = reduce(state, { type: 'toggle-select' })
      state = reduce(state, { type: 'toggle-select-all' })
      expect([...state.selected]).toEqual(['/a', '/b'])
    })
  })

  describe('action keys with empty selection', () => {
    it('leaves pull inert and explains why in the statusline', () => {
      const before = loaded(['/a', '/b'])
      const state = reduce(before, { type: 'action-key', operation: 'pull' })
      expect(state.statusMessage).toBe('nothing selected: press space or a to select repos first')
      expect(state.selected).toEqual(before.selected)
      expect(state.cursor).toBe(before.cursor)
    })

    it('leaves install inert with the same statusline reason', () => {
      const state = reduce(loaded(['/a']), { type: 'action-key', operation: 'install' })
      expect(state.statusMessage).toBe('nothing selected: press space or a to select repos first')
    })

    it('clears the statusline once a repo is selected', () => {
      let state = reduce(loaded(['/a']), { type: 'action-key', operation: 'pull' })
      state = reduce(state, { type: 'toggle-select' })
      expect(state.statusMessage).toBeNull()
    })

    it('sets no statusline message when the selection is not empty', () => {
      let state = reduce(loaded(['/a']), { type: 'toggle-select' })
      state = reduce(state, { type: 'action-key', operation: 'pull' })
      expect(state.statusMessage).toBeNull()
    })
  })

  it('returns the state unchanged for an unknown action', () => {
    const state = loaded(['/a'])
    expect(reduce(state, { type: 'bogus' } as unknown as Parameters<typeof reduce>[1])).toBe(state)
  })

  describe('bulk operation lifecycle', () => {
    function selected(paths: string[], picks: string[]): CoreState {
      let state = loaded(paths)
      for (const pick of picks) {
        state = reduce({ ...state, cursor: paths.indexOf(pick) }, { type: 'toggle-select' })
      }
      return state
    }

    it('starts a run over the selection, queued in row order, all pending', () => {
      const state = reduce(selected(['/a', '/b', '/c'], ['/c', '/a']), {
        type: 'action-key',
        operation: 'pull',
      })
      expect(state.run?.operation).toBe('pull')
      expect(state.run?.paths).toEqual(['/a', '/c'])
      expect(state.run?.outcomes.get('/a')).toEqual({ status: 'pending', error: null })
      expect(state.run?.outcomes.get('/c')).toEqual({ status: 'pending', error: null })
      expect(state.run?.showResults).toBe(false)
      expect(state.statusMessage).toBeNull()
    })

    it('leaves other action keys inert with a statusline reason while a run is active', () => {
      const running = reduce(selected(['/a', '/b'], ['/a']), {
        type: 'action-key',
        operation: 'pull',
      })
      const state = reduce(running, { type: 'action-key', operation: 'install' })
      expect(state.run).toBe(running.run)
      expect(state.statusMessage).toBe('a bulk operation is already running')
    })

    it('does not start a run for install yet, since no runner is wired to it', () => {
      const state = reduce(selected(['/a'], ['/a']), { type: 'action-key', operation: 'install' })
      expect(state.run).toBeNull()
      expect(state.statusMessage).toBeNull()
    })

    it('marks a repo running when its work starts', () => {
      let state = reduce(selected(['/a', '/b'], ['/a', '/b']), {
        type: 'action-key',
        operation: 'pull',
      })
      state = reduce(state, { type: 'repo-run-started', path: '/b' })
      expect(state.run?.outcomes.get('/b')?.status).toBe('running')
      expect(state.run?.outcomes.get('/a')?.status).toBe('pending')
    })

    it('records a successful outcome and does not show results until every repo settles', () => {
      let state = reduce(selected(['/a', '/b'], ['/a', '/b']), {
        type: 'action-key',
        operation: 'pull',
      })
      state = reduce(state, { type: 'repo-run-finished', path: '/a', status: 'ok' })
      expect(state.run?.outcomes.get('/a')).toEqual({ status: 'ok', error: null })
      expect(state.run?.showResults).toBe(false)
    })

    it('records a failed outcome with its error line', () => {
      let state = reduce(selected(['/a'], ['/a']), { type: 'action-key', operation: 'pull' })
      state = reduce(state, {
        type: 'repo-run-finished',
        path: '/a',
        status: 'failed',
        error: 'fatal: Not possible to fast-forward, aborting.',
      })
      expect(state.run?.outcomes.get('/a')).toEqual({
        status: 'failed',
        error: 'fatal: Not possible to fast-forward, aborting.',
      })
    })

    it('shows the results overlay once every repo in the run has settled', () => {
      let state = reduce(selected(['/a', '/b'], ['/a', '/b']), {
        type: 'action-key',
        operation: 'pull',
      })
      state = reduce(state, { type: 'repo-run-finished', path: '/a', status: 'ok' })
      expect(state.run?.showResults).toBe(false)
      state = reduce(state, {
        type: 'repo-run-finished',
        path: '/b',
        status: 'failed',
        error: 'boom',
      })
      expect(state.run?.showResults).toBe(true)
    })

    it('tells the user to dismiss the results overlay before starting another run', () => {
      let state = reduce(selected(['/a'], ['/a']), { type: 'action-key', operation: 'pull' })
      state = reduce(state, { type: 'repo-run-finished', path: '/a', status: 'ok' })
      const finished = state
      state = reduce(state, { type: 'action-key', operation: 'pull' })
      expect(state.run).toBe(finished.run)
      expect(state.statusMessage).toBe('dismiss the results overlay first: press esc')
    })

    it('dismisses the results overlay, clearing the run', () => {
      let state = reduce(selected(['/a'], ['/a']), { type: 'action-key', operation: 'pull' })
      state = reduce(state, { type: 'repo-run-finished', path: '/a', status: 'ok' })
      state = reduce(state, { type: 'dismiss-results' })
      expect(state.run).toBeNull()
      expect(state.statusMessage).toBeNull()
    })

    it('does nothing on dismiss-results while a run is still active', () => {
      const running = reduce(selected(['/a'], ['/a']), { type: 'action-key', operation: 'pull' })
      const state = reduce(running, { type: 'dismiss-results' })
      expect(state).toBe(running)
    })

    it('does nothing on dismiss-results when there is no run', () => {
      const idle = loaded(['/a'])
      expect(reduce(idle, { type: 'dismiss-results' })).toBe(idle)
    })

    it('ignores repo-run-started/finished for a path outside the active run', () => {
      const state = reduce(selected(['/a', '/b'], ['/a']), {
        type: 'action-key',
        operation: 'pull',
      })
      const started = reduce(state, { type: 'repo-run-started', path: '/b' })
      expect(started).toBe(state)
      const finished = reduce(state, { type: 'repo-run-finished', path: '/b', status: 'ok' })
      expect(finished).toBe(state)
    })

    it('ignores repo-run-started/finished when there is no active run', () => {
      const idle = loaded(['/a'])
      expect(reduce(idle, { type: 'repo-run-started', path: '/a' })).toBe(idle)
      expect(reduce(idle, { type: 'repo-run-finished', path: '/a', status: 'ok' })).toBe(idle)
    })
  })
})
