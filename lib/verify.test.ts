import { describe, expect, it } from 'vitest'
import { MockExtractor } from '@/lib/extract'
import { scanText } from '@/lib/scan'
import { verify } from '@/lib/verify'

const baseFinding = {
  clauseId: '1.1',
  field: 'Name' as const,
  stage: 'Data collected' as const,
  category: 'Identity',
  summary: 'The company collects a name.',
  severity: 1 as const,
  signals: [],
  quote: 'We collect your name and email address.',
}

describe('verify', () => {
  it('accepts an exact quote using the MockExtractor pipeline', async () => {
    const result = await scanText(
      'We collect your name and email address.',
      { name: 'Test policy', type: 'text' },
      new MockExtractor([baseFinding]),
    )

    expect(result.findings[0].verified).toBe(true)
    expect(result.fields.find((field) => field.label === 'Name')?.status).toBe('collected')
  })

  it('accepts a fuzzy token match and corrects a finding assigned to the wrong clause', () => {
    const finding = { ...baseFinding, clauseId: '1.1', quote: 'We collect your name email address.' }
    const result = verify([finding], [
      { id: '1.1', text: 'We collect your name.' },
      { id: '1.2', text: 'We collect your name and email address.' },
    ])

    expect(result.findings[0]).toMatchObject({ verified: true, clauseId: '1.2' })
  })

  it('removes a fabricated quote with a reason', () => {
    const result = verify([{ ...baseFinding, quote: 'We collect your social security number.' }], [
      { id: '1.1', text: 'We collect your name and email address.' },
    ])

    expect(result.findings[0]).toMatchObject({ verified: false, removedReason: expect.any(String) })
    expect(result.stats).toEqual({ total: 1, verified: 0, removed: 1 })
  })
})
