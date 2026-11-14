import { describe, expect, it } from 'vitest'
import { runRules } from '@/lib/rules'
import type { VerifiedFinding } from '@/lib/verify'

function finding(id: string, field: VerifiedFinding['field'], verified = true, signals: VerifiedFinding['signals'] = []): VerifiedFinding {
  return {
    id,
    clauseId: '1.1',
    field,
    stage: 'Data collected',
    category: 'Test',
    summary: 'A source-supported fact.',
    severity: 2,
    signals,
    quote: 'A verbatim quote from the source.',
    verified,
  }
}

describe('inference rules', () => {
  it('fires only when every required input is verified', () => {
    const result = runRules([
      finding('health', 'Health data'),
      finding('sharing', null, false, ['Third-party sharing']),
    ])

    expect(result.some((inference) => inference.ruleId === 'R14')).toBe(false)
  })

  it('uses FIELD_IMPLIES signals when evaluating rules', () => {
    const result = runRules([
      finding('device', 'Device and IP'),
      finding('sharing', null, true, ['Third-party sharing']),
    ])

    expect(result.some((inference) => inference.ruleId === 'R10')).toBe(true)
  })

  it('requires all three R11 identity inputs', () => {
    const incomplete = runRules([finding('name', 'Name'), finding('birth', 'Date of birth')])
    const completeFindings = [
      finding('name', 'Name'),
      finding('birth', 'Date of birth'),
      finding('id-number', 'Government ID or SSN'),
    ]
    const complete = runRules(completeFindings)

    expect(incomplete.some((inference) => inference.ruleId === 'R11')).toBe(false)
    expect(complete.find((inference) => inference.ruleId === 'R11')?.supportingFindingIds).toHaveLength(3)
  })
})
