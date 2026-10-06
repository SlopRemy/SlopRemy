// Layout of tiles on a player's rack: two rows of slots where tiles can sit anywhere,
// with gaps. A layout maps tile id → slot index. The rack is normally a fixed number of
// columns wide but grows to the right when the tiles don't fit (e.g. after taking several
// tiles from the discard pile), so a slot encodes row and column with a fixed stride.

import { sortByColor, sortByNumber } from './tiles'
import type { Tile } from './types'

export type Layout = Record<number, number>

export const RACK_ROWS = 2

/** More columns than a rack can ever need (106 tiles over two rows). */
const STRIDE = 64

export const slotOf = (row: number, col: number) => row * STRIDE + col
export const rowOf = (slot: number) => Math.floor(slot / STRIDE)
export const colOf = (slot: number) => slot % STRIDE

/** Columns needed to show `layout`: at least `cols`, more when tiles sit further right. */
export function rackWidth(layout: Layout, cols: number): number {
  return Math.max(cols, ...Object.values(layout).map((slot) => colOf(slot) + 1))
}

/**
 * Gives every tile in `ids` a slot on a rack `cols` wide. Saved positions are kept when
 * valid; tiles without one fill the rack in order when the whole rack is new, otherwise they
 * take the free slots from the end of the bottom row (so a drawn tile doesn't land inside the
 * player's groups). When no slot is free the rack gets new columns on the right.
 */
export function placeTiles(ids: number[], saved: Layout, cols: number): Layout {
  const layout: Layout = {}
  const taken = new Set<number>()

  for (const id of ids) {
    const slot = saved[id]
    if (Number.isInteger(slot) && slot >= 0 && rowOf(slot) < RACK_ROWS && !taken.has(slot)) {
      layout[id] = slot
      taken.add(slot)
    }
  }

  if (taken.size === 0) {
    const width = Math.max(cols, Math.ceil(ids.length / RACK_ROWS))
    ids.forEach((id, i) => (layout[id] = slotOf(Math.floor(i / width), i % width)))
    return layout
  }

  const width = rackWidth(layout, cols)
  const free: number[] = []
  for (let row = RACK_ROWS - 1; row >= 0; row--)
    for (let col = width - 1; col >= 0; col--) if (!taken.has(slotOf(row, col))) free.push(slotOf(row, col))

  const missing = ids.filter((id) => layout[id] === undefined)
  // What doesn't fit goes to new columns: along the bottom row first, then the row above.
  const extra = Math.ceil(Math.max(0, missing.length - free.length) / RACK_ROWS)
  missing.forEach((id, i) => {
    const j = i - free.length
    layout[id] = j < 0 ? free[i] : slotOf(RACK_ROWS - 1 - Math.floor(j / extra), width + (j % extra))
  })
  return layout
}

/** Moves a tile to `slot`, swapping with the tile already there. */
export function moveTile(layout: Layout, id: number, slot: number): Layout {
  const from = layout[id]
  const next = { ...layout }
  const other = Object.keys(layout).find((k) => layout[Number(k)] === slot)
  if (other !== undefined) next[Number(other)] = from
  next[id] = slot
  return next
}

/**
 * Splits the selected tiles into melds by how they sit on the rack: selected tiles that are
 * next to each other in the same row form one group.
 */
export function groupsFromSelection(layout: Layout, selected: number[]): number[][] {
  const bySlot = selected
    .filter((id) => layout[id] !== undefined)
    .map((id) => ({ id, slot: layout[id] }))
    .sort((a, b) => a.slot - b.slot)

  const groups: number[][] = []
  let prev = -2
  for (const { id, slot } of bySlot) {
    const sameRow = rowOf(slot) === rowOf(prev)
    if (slot === prev + 1 && sameRow) groups[groups.length - 1].push(id)
    else groups.push([id])
    prev = slot
  }
  return groups
}

/**
 * Lays groups out row by row with a gap between them, never splitting a group across rows.
 * Too many groups for gaps: packs them tightly, then splits them; then widens the rack.
 */
export function packGroups(groups: number[][], cols: number, rows = RACK_ROWS): Layout {
  for (let width = cols; ; width++) {
    const layout = pack(groups, width, rows, 1) ?? pack(groups, width, rows, 0) ?? pack([groups.flat()], width, rows, 0, true)
    if (layout) return layout
  }
}

function pack(groups: number[][], cols: number, rows: number, gap: number, split = false): Layout | null {
  const layout: Layout = {}
  let row = 0
  let col = 0
  for (const group of groups) {
    if (!split && group.length > cols) return null
    if (!split && col > 0 && col + group.length > cols) {
      row++
      col = 0
    }
    for (const id of group) {
      if (split && col >= cols) {
        row++
        col = 0
      }
      if (row >= rows) return null
      layout[id] = slotOf(row, col++)
    }
    col += gap
  }
  return layout
}

/** Groups by color, split into runs of consecutive numbers; jokers go last. */
export function arrangeByColor(tiles: Tile[], cols: number): Layout {
  const groups: number[][] = []
  let prev: Tile | null = null
  for (const t of sortByColor(tiles)) {
    const continues =
      prev && !prev.joker && !t.joker && prev.color === t.color && t.rank === prev.rank + 1
    const jokers = prev?.joker && t.joker
    if (continues || jokers) groups[groups.length - 1].push(t.id)
    else groups.push([t.id])
    prev = t
  }
  return packGroups(groups, cols)
}

/** Groups equal numbers together (possible sets); jokers go last. */
export function arrangeByNumber(tiles: Tile[], cols: number): Layout {
  const groups: number[][] = []
  let prev: Tile | null = null
  for (const t of sortByNumber(tiles)) {
    const same = prev && (prev.joker ? t.joker : !t.joker && prev.rank === t.rank)
    if (same) groups[groups.length - 1].push(t.id)
    else groups.push([t.id])
    prev = t
  }
  return packGroups(groups, cols)
}
