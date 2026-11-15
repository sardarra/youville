export type MapRect = { left: number; top: number; width: number; height: number }

export function overlaps(a: MapRect, b: MapRect, gap = 14): boolean {
  return a.left < b.left + b.width + gap && a.left + a.width + gap > b.left &&
    a.top < b.top + b.height + gap && a.top + a.height + gap > b.top
}

// Search obstacle edges rather than pushing a bubble arbitrarily far down a column.
export function placeBubble(target: MapRect, width: number, height: number, stageWidth: number, obstacles: MapRect[]): MapRect {
  const gap = 18
  const right = target.left + target.width
  const bottom = target.top + target.height
  const ideals = [
    { left: right - 40, top: bottom + gap },
    { left: target.left - width + 40, top: bottom + gap },
    { left: right - 40, top: target.top - height - gap },
    { left: target.left - width + 40, top: target.top - height - gap },
  ]
  const clampX = (x: number) => Math.max(12, Math.min(stageWidth - width - 12, x))
  const xs = new Set([12, stageWidth - width - 12, ...ideals.map(p => clampX(p.left)),
    ...obstacles.flatMap(r => [clampX(r.left - width - gap), clampX(r.left + r.width + gap)])])
  const ys = new Set([12, ...ideals.map(p => Math.max(12, p.top)),
    ...obstacles.flatMap(r => [Math.max(12, r.top - height - gap), r.top + r.height + gap])])
  let best: MapRect | undefined
  let bestCost = Infinity
  for (const left of xs) for (const top of ys) {
    const candidate = { left, top, width, height }
    if (obstacles.some(obstacle => overlaps(candidate, obstacle))) continue
    const cost = Math.min(...ideals.map(p => Math.hypot(left - clampX(p.left), top - Math.max(12, p.top))))
    if (cost < bestCost) { best = candidate; bestCost = cost }
  }
  // Below all obstacles is always available, even with many pinned bubbles.
  return best ?? { left: clampX(right - 40), top: Math.max(12, ...obstacles.map(r => r.top + r.height + gap)), width, height }
}
