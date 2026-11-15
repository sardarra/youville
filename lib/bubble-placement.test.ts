import { expect, it } from 'vitest'
import { placeBubble, overlaps, type MapRect } from './bubble-placement'

it('keeps all simultaneously pinned bubbles clear of buildings and each other', () => {
  for (const scale of [0.44, 0.7, 1]) {
    const buildings = [
      [303, 359, 188, 364], [833, 443, 439, 242], [1519, 186, 650, 541],
      [2464, 296, 291, 430], [3182, 129, 525, 552], [4135, 311, 578, 370],
    ].map(([left, top, width, height]) => ({ left: left * scale, top: top * .4, width: width * scale, height: height * .4 }))
    const obstacles: MapRect[] = [...buildings]
    for (const building of buildings) {
      const bubble = placeBubble(building, 360, 340, 5042 * scale, obstacles)
      expect(obstacles.some(rect => overlaps(bubble, rect))).toBe(false)
      expect(bubble.left).toBeGreaterThanOrEqual(12)
      expect(bubble.left + bubble.width).toBeLessThanOrEqual(5042 * scale - 12)
      obstacles.push(bubble)
    }
  }
})
it('tucks the school bubble diagonally beside its lower corner when free', () => {
  const school = { left: 660, top: 75, width: 285, height: 216 }
  const bubble = placeBubble(school, 360, 300, 2200, [school])
  expect(bubble.left).toBe(905)
  expect(bubble.top).toBe(309)
  expect(overlaps(bubble, school)).toBe(false)
})
