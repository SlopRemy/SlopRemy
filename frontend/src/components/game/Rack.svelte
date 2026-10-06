<script lang="ts">
  import { colOf, RACK_ROWS, rowOf, slotOf, type Layout } from '../../lib/rack'
  import { receive, send } from '../../lib/transitions'
  import type { Tile as TileT } from '../../lib/types'
  import Tile from '../Tile.svelte'

  interface Props {
    tiles: TileT[]
    layout: Layout
    cols: number
    tileHeight: number
    selected: number[]
    highlighted: (number | null)[]
    ontoggle: (id: number) => void
    onmove: (id: number, slot: number) => void
  }

  let { tiles, layout, cols, tileHeight, selected, highlighted, ontoggle, onmove }: Props = $props()

  const tileWidth = $derived(tileHeight * 0.72)
  const gap = 3
  const pad = 6
  const ledge = $derived(Math.round(tileHeight * 0.16))
  const rowHeight = $derived(tileHeight + ledge)
  const slotX = (col: number) => pad + col * (tileWidth + gap)
  const slotY = (row: number) => pad + row * (rowHeight + 4)

  let rack: HTMLElement | undefined = $state()
  let scroller: HTMLElement | undefined = $state()
  let scrollerWidth = $state(0)
  const rackWidth = $derived(pad * 2 + cols * tileWidth + (cols - 1) * gap)
  // Only clip (and scroll) when needed: clipping would cut off lifted and dragged tiles.
  const overflowing = $derived(rackWidth > scrollerWidth + 1)

  // When the rack grows (e.g. tiles taken from the discard pile), show the new columns.
  let shownCols = 0
  $effect(() => {
    if (scroller && cols > shownCols && shownCols > 0) scroller.scrollTo({ left: scroller.scrollWidth, behavior: 'smooth' })
    shownCols = cols
  })

  // Tap toggles selection; dragging moves the tile to another slot (swapping if taken).
  let drag = $state<{
    id: number
    pointerId: number
    startX: number
    startY: number
    dx: number
    dy: number
    active: boolean
  } | null>(null)

  function pointerdown(e: PointerEvent, id: number) {
    if (e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag = { id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, active: false }
  }

  function pointermove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return
    drag.dx = e.clientX - drag.startX
    drag.dy = e.clientY - drag.startY
    if (Math.hypot(drag.dx, drag.dy) > 8) drag.active = true
  }

  function pointerup(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return
    const { id, active } = drag
    drag = null
    if (!active) return ontoggle(id)

    const target = slotAt(e.clientX, e.clientY)
    if (target !== null && target !== layout[id]) onmove(id, target)
  }

  /** The slot under a screen point, or null when outside the rack. */
  function slotAt(x: number, y: number): number | null {
    if (!rack) return null
    const box = rack.getBoundingClientRect()
    const col = Math.floor((x - box.left - pad + gap / 2) / (tileWidth + gap))
    const row = Math.floor((y - box.top - pad) / (rowHeight + 4))
    if (y < box.top - tileHeight || y > box.bottom + tileHeight) return null
    const c = Math.max(0, Math.min(cols - 1, col))
    const r = Math.max(0, Math.min(RACK_ROWS - 1, row))
    return slotOf(r, c)
  }

  function keydown(e: KeyboardEvent, id: number) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      ontoggle(id)
    }
  }
</script>

<!-- The rack scrolls sideways when it has grown wider than the screen. -->
<div class="scroller" class:overflowing bind:this={scroller} bind:clientWidth={scrollerWidth}>
  <div
    class="rack"
    bind:this={rack}
    style:--tile-h="{tileHeight}px"
    style:width="{rackWidth}px"
    style:height="{pad * 2 + RACK_ROWS * rowHeight + 4}px"
  >
    {#each Array(RACK_ROWS) as _, row (row)}
      <div class="ledge" style:top="{slotY(row) + tileHeight}px" style:height="{ledge}px"></div>
    {/each}

    {#each tiles as tile (tile.id)}
      {@const slot = layout[tile.id] ?? 0}
      {@const dragging = drag?.active && drag.id === tile.id}
      <div
        class="slot"
        class:dragging
        role="button"
        tabindex="0"
        aria-pressed={selected.includes(tile.id)}
        style:left="{slotX(colOf(slot))}px"
        style:top="{slotY(rowOf(slot))}px"
        style:transform={dragging ? `translate(${drag!.dx}px, ${drag!.dy}px)` : undefined}
        onpointerdown={(e) => pointerdown(e, tile.id)}
        onpointermove={pointermove}
        onpointerup={pointerup}
        onpointercancel={() => (drag = null)}
        onkeydown={(e) => keydown(e, tile.id)}
        in:receive={{ key: tile.id }}
        out:send={{ key: tile.id }}
      >
        <Tile {tile} selected={selected.includes(tile.id)} highlight={highlighted.includes(tile.id)} />
      </div>
    {/each}
  </div>
</div>

<style>
  .scroller {
    max-width: 100%;
  }

  /* Room above for lifted (selected) tiles and below for the shadow, which scrolling clips. */
  .scroller.overflowing {
    overflow-x: auto;
    overscroll-behavior-x: contain;
    padding: 14px 0 8px;
    margin: -14px 0 -8px;
  }

  .rack {
    position: relative;
    margin: 0 auto;
    border-radius: 10px;
    background:
      repeating-linear-gradient(90deg, rgb(255 255 255 / 0.04) 0 2px, transparent 2px 9px),
      linear-gradient(180deg, #d9b17a 0%, #c4955a 55%, #a87943 100%);
    box-shadow:
      inset 0 2px 0 rgb(255 255 255 / 0.35),
      inset 0 -3px 0 rgb(0 0 0 / 0.18),
      0 6px 16px rgb(0 0 0 / 0.45);
    /* Swiping the rack itself scrolls it; tiles are dragged. */
    touch-action: pan-x;
  }

  .ledge {
    position: absolute;
    left: 4px;
    right: 4px;
    border-radius: 3px;
    background: linear-gradient(180deg, #8a5f30, #b48450);
    box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.35);
  }

  .slot {
    position: absolute;
    touch-action: none;
    cursor: grab;
    outline: none;
    transition:
      left 0.18s ease,
      top 0.18s ease;
    z-index: 1;
  }

  .slot:focus-visible :global(.tile) {
    box-shadow: 0 0 0 3px #7fc4ff;
  }

  .dragging {
    cursor: grabbing;
    transition: none;
    z-index: 10;
    filter: drop-shadow(0 10px 12px rgb(0 0 0 / 0.45));
  }
</style>
