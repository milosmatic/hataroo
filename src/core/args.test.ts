import { describe, expect, it } from 'vitest'
import { parseArgs } from './args.js'

describe('parseArgs', () => {
  it('returns undefined dir and depth, and an empty ignore list, for no arguments', () => {
    expect(parseArgs([])).toEqual({ dir: undefined, depth: undefined, ignore: [] })
  })

  it('reads a positional argument as the scan root', () => {
    expect(parseArgs(['~/work'])).toMatchObject({ dir: '~/work' })
  })

  it('reads --depth as a number', () => {
    expect(parseArgs(['--depth', '2'])).toMatchObject({ depth: 2 })
  })

  it('collects repeated --ignore flags in order', () => {
    expect(parseArgs(['--ignore', 'a', '--ignore', 'b'])).toMatchObject({ ignore: ['a', 'b'] })
  })

  it('combines a positional dir with --depth and --ignore in any order', () => {
    expect(parseArgs(['--ignore', 'vendor', '~/work', '--depth', '2'])).toEqual({
      dir: '~/work',
      depth: 2,
      ignore: ['vendor'],
    })
  })

  it('ignores a non-numeric --depth value', () => {
    expect(parseArgs(['--depth', 'nope'])).toMatchObject({ depth: undefined })
  })

  it('rejects a partially-numeric --depth value instead of truncating it', () => {
    expect(parseArgs(['--depth', '2x'])).toMatchObject({ depth: undefined })
  })

  it("does not consume a following flag as --depth's value when --depth has none", () => {
    expect(parseArgs(['--depth', '--ignore', 'vendor'])).toEqual({
      dir: undefined,
      depth: undefined,
      ignore: ['vendor'],
    })
  })

  it("does not consume a following flag as --ignore's value when --ignore has none", () => {
    expect(parseArgs(['--ignore', '--depth', '2'])).toEqual({
      dir: undefined,
      depth: 2,
      ignore: [],
    })
  })
})
