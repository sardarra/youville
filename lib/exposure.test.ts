import { describe, expect, it } from 'vitest'
import { exposureScore, exposureColor } from '@/lib/rules'
import { createSampleScan } from '@/lib/sample-scan'

describe('exposure coverage and demo', () => {
  it('activates every field with verified fictional evidence', () => {
    const sample = createSampleScan()
    expect(sample.fields.every(field => field.status !== 'not_found')).toBe(true)
    expect(sample.stats.removed).toBe(0)
    expect(sample.exposureScore).toBe(100)
    expect(sample.fields.filter(field => field.status === 'inferred')).toHaveLength(3)
  })
  it('ignores duplicate and unverified claims', () => {
    const sample = createSampleScan()
    const first = sample.findings[0]
    expect(exposureScore([])).toBe(0)
    expect(exposureScore([{ ...first, verified: false }])).toBe(0)
    expect(exposureScore([first, first, first])).toBe(exposureScore([first]))
    expect(exposureScore([first])).toBeGreaterThan(0)
    expect(exposureScore(sample.findings)).toBeGreaterThan(exposureScore([first]))
  })
  it.each([[0, '#16a34a'], [39, '#16a34a'], [40, '#ca8a04'], [60, '#ca8a04'], [61, '#ea580c'], [80, '#ea580c'], [81, '#dc2626'], [100, '#dc2626']])('colors score %s correctly', (score, color) => {
    expect(exposureColor(Number(score))).toBe(color)
  })
})
