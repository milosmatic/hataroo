import { describe, expect, it } from 'vitest'
import { viewportStart } from './viewport.js'

describe('viewportStart', () => {
  it('stays at 0 while every row fits on screen', () => {
    expect(viewportStart({ previousStart: 0, cursor: 2, rowCount: 3, height: 10 })).toBe(0)
  })

  it('keeps the previous window while the cursor stays visible', () => {
    expect(viewportStart({ previousStart: 4, cursor: 6, rowCount: 20, height: 5 })).toBe(4)
  })

  it('scrolls down just enough to reveal a cursor below the window', () => {
    expect(viewportStart({ previousStart: 0, cursor: 5, rowCount: 20, height: 5 })).toBe(1)
  })

  it('scrolls up just enough to reveal a cursor above the window', () => {
    expect(viewportStart({ previousStart: 4, cursor: 3, rowCount: 20, height: 5 })).toBe(3)
  })

  it('clamps the window when the row list shrinks below the previous start', () => {
    expect(viewportStart({ previousStart: 10, cursor: 0, rowCount: 4, height: 5 })).toBe(0)
  })
})
