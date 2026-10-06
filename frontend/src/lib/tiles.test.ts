import { describe, expect, it } from 'vitest'
import { arrangeByColor, arrangeByNumber, groupsFromSelection, moveTile, packGroups, placeTiles, rackWidth, slotOf } from './rack'
import { meldPoints, sortByColor, sortByNumber } from './tiles'
import type { Tile, TileColor } from './types'

let nextId = 1
const n = (rank: number, color: TileColor): Tile => ({ id: nextId++, rank, color, joker: false })
const j = (): Tile => ({ id: nextId++, joker: true })

describe('meldPoints (mirrors the server)', () => {
  it('scores sets: 2–9 are 5, 10–13 are 10, 1s are 25', () => {
    expect(meldPoints([n(7, 'red'), n(7, 'blue'), n(7, 'black')], 1)).toBe(15)
    expect(meldPoints([n(1, 'red'), n(1, 'blue'), n(1, 'black')], 1)).toBe(75)
    expect(meldPoints([n(12, 'red'), j(), n(12, 'black')], 1)).toBe(30)
  })

  it('rejects invalid sets', () => {
    expect(meldPoints([n(7, 'red'), n(7, 'red'), n(7, 'black')], 1)).toBeNull()
    expect(meldPoints([n(7, 'red'), n(7, 'blue')], 1)).toBeNull()
  })

  it('scores runs; a 1 is 5 before 2 and 10 after 13, no wrap-around', () => {
    expect(meldPoints([n(6, 'red'), n(4, 'red'), n(5, 'red')], 1)).toBe(15)
    expect(meldPoints([n(9, 'red'), n(10, 'red'), n(11, 'red')], 1)).toBe(25)
    expect(meldPoints([n(1, 'black'), n(2, 'black'), n(3, 'black')], 1)).toBe(15)
    expect(meldPoints([n(12, 'black'), n(13, 'black'), n(1, 'black')], 1)).toBe(30)
    expect(meldPoints([n(13, 'black'), n(1, 'black'), n(2, 'black')], 1)).toBeNull()
  })

  it('places jokers in gaps, then high, then low', () => {
    expect(meldPoints([n(4, 'red'), j(), n(6, 'red')], 1)).toBe(15)
    expect(meldPoints([n(8, 'red'), n(9, 'red'), j()], 1)).toBe(20)
    expect(meldPoints([n(13, 'red'), n(1, 'red'), j()], 1)).toBe(30)
  })

  it('respects the joker limit and needs a real tile', () => {
    expect(meldPoints([n(4, 'red'), j(), j()], 1)).toBeNull()
    expect(meldPoints([n(4, 'red'), j(), j()], 2)).toBe(15)
    expect(meldPoints([j(), j(), j()], 3)).toBeNull()
  })
})

describe('sorting', () => {
  it('sorts by color or number with jokers last', () => {
    const tiles = [j(), n(2, 'blue'), n(13, 'black'), n(1, 'black')]
    expect(sortByColor(tiles).map((t) => (t.joker ? 'J' : `${t.rank}${t.color[0]}`))).toEqual(['1b', '13b', '2b', 'J'])
    expect(sortByNumber(tiles).map((t) => (t.joker ? 'J' : t.rank))).toEqual([1, 2, 13, 'J'])
  })
})

describe('rack layout', () => {
  it('fills a new rack in order and keeps saved positions', () => {
    expect(placeTiles([10, 11, 12], {}, 16)).toEqual({ 10: 0, 11: 1, 12: 2 })
    expect(placeTiles([10, 11, 12], { 10: 5, 11: 9 }, 16)).toEqual({ 10: 5, 11: 9, 12: slotOf(1, 15) })
  })

  it('drops invalid or duplicate saved slots', () => {
    expect(placeTiles([1, 2], { 1: 4, 2: 4 }, 16)).toEqual({ 1: 4, 2: slotOf(1, 15) })
    expect(placeTiles([1, 2], { 1: slotOf(2, 0), 2: 3 }, 16)).toEqual({ 1: slotOf(1, 15), 2: 3 })
  })

  it('widens a new rack that is too small', () => {
    const ids = Array.from({ length: 40 }, (_, i) => i)
    const layout = placeTiles(ids, {}, 16)
    expect(layout[19]).toBe(slotOf(0, 19))
    expect(layout[20]).toBe(slotOf(1, 0))
    expect(rackWidth(layout, 16)).toBe(20)
  })

  it('adds columns on the right when a full rack gets more tiles', () => {
    const full = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [i, slotOf(Math.floor(i / 16), i % 16)]))
    const layout = placeTiles([...Object.keys(full).map(Number), 100, 101, 102], full, 16)
    expect([layout[100], layout[101], layout[102]]).toEqual([slotOf(1, 16), slotOf(1, 17), slotOf(0, 16)])
    expect(rackWidth(layout, 16)).toBe(18)
    expect(rackWidth({ 1: 0 }, 16)).toBe(16)
  })

  it('moves to an empty slot or swaps', () => {
    expect(moveTile({ 1: 0, 2: 1 }, 1, 5)).toEqual({ 1: 5, 2: 1 })
    expect(moveTile({ 1: 0, 2: 1 }, 1, 1)).toEqual({ 1: 1, 2: 0 })
  })

  it('groups selected tiles by adjacency within a row', () => {
    const layout = { 1: 0, 2: 1, 3: 2, 4: 4, 5: 5, 6: slotOf(1, 0) - 1, 7: slotOf(1, 0) }
    expect(groupsFromSelection(layout, [3, 1, 2, 4, 5])).toEqual([[1, 2, 3], [4, 5]])
    // consecutive slot numbers, but the end of one row and the start of the next
    expect(groupsFromSelection(layout, [6, 7])).toEqual([[6], [7]])
  })

  it('packs groups with gaps without splitting them across rows', () => {
    expect(packGroups([[1, 2, 3], [4, 5], [6, 7, 8]], 8)).toEqual({
      1: 0, 2: 1, 3: 2, 4: 4, 5: 5, 6: slotOf(1, 0), 7: slotOf(1, 1), 8: slotOf(1, 2),
    })
  })

  it('widens the rack when the tiles do not fit', () => {
    const layout = packGroups(Array.from({ length: 40 }, (_, i) => [i]), 16)
    expect(layout[39]).toBe(slotOf(1, 19))
    expect(rackWidth(layout, 16)).toBe(20)
  })

  it('arranges by color runs and by number', () => {
    const tiles = [n(5, 'red'), n(3, 'red'), n(4, 'red'), n(9, 'blue'), n(9, 'black')]
    const [r5, r3, r4, b9, k9] = tiles.map((t) => t.id)
    expect(arrangeByColor(tiles, 16)).toEqual({ [k9]: 0, [r3]: 2, [r4]: 3, [r5]: 4, [b9]: 6 })
    expect(arrangeByNumber(tiles, 16)).toEqual({ [r3]: 0, [r4]: 2, [r5]: 4, [k9]: 6, [b9]: 7 })
  })
})
