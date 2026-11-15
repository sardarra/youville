import { expect, it } from 'vitest'
import { fitBubble, placeBubble, overlaps, type MapRect } from './bubble-placement'

it('keeps all simultaneously pinned bubbles clear of buildings and each other', () => {
  for (const scale of [0.44, 0.7, 1]) {
    const buildings = [
      [303, 359, 188, 364], [833, 443, 439, 242], [1519, 186, 650, 541],
      [2464, 296, 291, 430], [3182, 129, 525, 552], [4135, 311, 578, 370],
    ].map(([left, top, width, height]) => ({ left: left * scale, top: top * .4, width: width * scale, height: height * .4 }))
    const obstacles: MapRect[] = [...buildings]
    for (const building of buildings) {
      const bubble = placeBubble(building, 360, 340, 5042 * scale, obstacles)!
      expect(obstacles.some(rect => overlaps(bubble, rect))).toBe(false)
      expect(bubble.left).toBeGreaterThanOrEqual(12)
      expect(bubble.left + bubble.width).toBeLessThanOrEqual(5042 * scale - 12)
      obstacles.push(bubble)
    }
  }
})
it('tucks the school bubble diagonally beside its upper corner when free', () => {
  const school = { left: 660, top: 400, width: 285, height: 216 }
  const bubble = placeBubble(school, 360, 300, 2200, [school], 900)!
  expect(bubble.left).toBe(905)
  expect(bubble.top).toBe(82)
  expect(overlaps(bubble, school)).toBe(false)
})

it('returns no placement rather than growing a full scene', () => {
  const target = { left: 20, top: 20, width: 400, height: 400 }
  expect(placeBubble(target, 360, 300, 440, [target], 440)).toBeNull()
})

it('fits Park and Town Hall even when their two-field reports are initially overestimated', () => {
  const scale = 2200 / 5042
  const rect = (left: number, top: number, width: number, height: number) => ({left: left * scale, top: 200 + top / 1080 * 400, width: width * scale, height: height / 1080 * 400})
  const buildings = [rect(303,359,188,364),rect(2464,296,291,430),rect(1519,186,650,541),rect(3182,129,525,552),rect(833,443,439,242),rect(4135,311,578,370)]
  for (const target of [buildings[3], rect(1182,720,697,287)]) {
    const bubble = fitBubble(target, 360, 400, 2200, [...buildings, target], 600, true)
    expect(bubble).not.toBeNull()
    expect(buildings.some(building => overlaps(bubble!, building))).toBe(false)
    expect(bubble!.top + bubble!.height).toBeLessThanOrEqual(584)
  }
})
