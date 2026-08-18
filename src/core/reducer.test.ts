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
})
