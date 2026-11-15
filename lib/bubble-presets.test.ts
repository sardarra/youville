import { expect, it } from 'vitest'
import { bubblePreset } from './bubble-presets'
import { overlaps } from './bubble-placement'
it('keeps all preset bubbles separate and inside the fixed scene', () => {
  const files = ['Office.svg', 'House.svg', 'School.svg', 'Hospital.svg', 'Thall.svg', 'Bank.svg', 'Street Sign.svg', 'Mailbox.svg', 'park']
  for (const width of [2200, 2800, 3600]) for (const height of [600, 740]) {
    const boxes = files.map(file => bubblePreset(file, width, height))
    boxes.forEach((box, index) => {
      expect(box.left + box.width).toBeLessThanOrEqual(width)
      expect(box.top + box.height).toBeLessThanOrEqual(height)
      expect(boxes.slice(index + 1).some(other => overlaps(box, other, 0))).toBe(false)
    })
  }
})
