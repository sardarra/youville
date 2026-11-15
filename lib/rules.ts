import { FIELDS, FIELD_IMPLIES, type FieldLabel, type Signal } from '@/lib/taxonomy'
import { inferenceRules } from '@/data/rules'
import type { VerifiedFinding } from '@/lib/verify'

export interface Inference {
  ruleId: string
  output: string
  explanation: string
  supportingFindingIds: string[]
}

export interface BuiltField {
  label: FieldLabel
  group: (typeof FIELDS)[number]['group']
  status: 'collected' | 'inferred' | 'not_found'
  findingIds: string[]
  ruleIds: string[]
}

type RuleInput = string

const isVerified = (finding: VerifiedFinding) => finding.verified

export function runRules(findings: VerifiedFinding[]): Inference[] {
  const verified = findings.filter(isVerified)
  const supported = new Map<RuleInput, Set<string>>()
  const addSupport = (input: string, findingId: string) => {
    const ids = supported.get(input) ?? new Set<string>()
    ids.add(findingId)
    supported.set(input, ids)
  }

  for (const finding of verified) {
    if (finding.field) {
      addSupport(finding.field, finding.id)
      for (const signal of FIELD_IMPLIES[finding.field] ?? []) addSupport(signal, finding.id)
    }
    for (const signal of finding.signals) addSupport(signal, finding.id)
  }

  return inferenceRules.flatMap((rule) => {
    if (!rule.inputs.every((input) => supported.has(input))) return []
    return [{
      ruleId: rule.id,
      output: rule.output,
      explanation: rule.explanation,
      supportingFindingIds: [...new Set(rule.inputs.flatMap((input) => [...(supported.get(input) ?? [])]))],
    }]
  })
}

export function buildFields(findings: VerifiedFinding[], inferences: Inference[]): BuiltField[] {
  const verified = findings.filter(isVerified)
  return FIELDS.map(({ label, group }) => {
    const fieldFindings = verified.filter((finding) => finding.field === label)
    const fieldInferences = inferences.filter((inference) => inference.output === label)
    return {
      label,
      group,
      status: fieldFindings.length ? 'collected' : fieldInferences.length ? 'inferred' : 'not_found',
      findingIds: fieldFindings.map((finding) => finding.id),
      ruleIds: fieldInferences.map((inference) => inference.ruleId),
    }
  })
}

export function exposureScore(findings: VerifiedFinding[]): number {
  // Coverage of distinct supported fields, not the number of repeated quotes.
  const fields = buildFields(findings, runRules(findings))
  const maximum = FIELDS.reduce((sum, field) => sum + (field.basis === 'inferred' ? 0.5 : 1), 0)
  const supported = fields.reduce((sum, field) => {
    const inferredOnly = FIELDS.find((entry) => entry.label === field.label)?.basis === 'inferred'
    return sum + (field.status === 'collected' && !inferredOnly ? 1 : field.status !== 'not_found' ? 0.5 : 0)
  }, 0)
  return Math.round(100 * supported / maximum)
}

export function verifiedSignalSet(findings: VerifiedFinding[]): Set<Signal | FieldLabel> {
  const signals = new Set<Signal | FieldLabel>()
  for (const finding of findings.filter(isVerified)) {
    if (finding.field) {
      signals.add(finding.field)
      for (const signal of FIELD_IMPLIES[finding.field] ?? []) signals.add(signal)
    }
    for (const signal of finding.signals) signals.add(signal)
  }
  return signals
}

export function exposureColor(score: number): string {
  return score > 80 ? '#dc2626' : score > 60 ? '#ea580c' : score >= 40 ? '#ca8a04' : '#16a34a'
}
