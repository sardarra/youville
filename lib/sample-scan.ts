import { FIELDS, SIGNALS } from '@/lib/taxonomy'
import { buildFields, exposureScore, runRules } from '@/lib/rules'
import { verify } from '@/lib/verify'
import type { ScanResponse } from '@/lib/scan'

export function createSampleScan(): ScanResponse {
  const collected = FIELDS.filter((field) => field.basis !== 'inferred')
  const clauses = collected.map((field, index) => ({
    id: `demo-${index + 1}`,
    text: `In this fictional demonstration, Cloudberry collects ${field.label.toLowerCase()}.`,
  }))
  const signalsClause = { id: 'demo-signals', text: `In this fictional demonstration, Cloudberry uses these data practices: ${SIGNALS.join(', ')}.` }
  clauses.push(signalsClause)
  const { findings, stats } = verify([
    ...collected.map((field, index) => ({
      clauseId: clauses[index].id, field: field.label, stage: 'Data collected' as const,
      category: field.group, summary: `Demo collection of ${field.label.toLowerCase()}.`,
      severity: 2 as const, signals: [], quote: clauses[index].text,
    })),
    { clauseId: signalsClause.id, field: null, stage: 'Who it’s shared with' as const,
      category: 'Demo sharing', summary: 'Fictional data signals and partner sharing.',
      severity: 3 as const, signals: [...SIGNALS], quote: signalsClause.text },
  ], clauses)
  const inferences = runRules(findings)
  return { source: { name: 'Cloudberry (fictional demo)', type: 'text' }, clauses,
    findings, stats, inferences, fields: buildFields(findings, inferences),
    exposureScore: exposureScore(findings),
    warnings: ['Fictional sample: all findings illustrate made-up policy claims, not a real company or your data.'] }
}
