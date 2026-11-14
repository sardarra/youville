import { exposureScore, buildFields, runRules } from '@/lib/rules'
import type { Extractor } from '@/lib/extract'
import { segment, type Clause } from '@/lib/segment'
import { verify, type VerificationStats, type VerifiedFinding } from '@/lib/verify'
import type { BuiltField, Inference } from '@/lib/rules'

export interface ScanSource {
  name: string
  type: 'text' | 'url'
  url?: string
}

export interface ScanResponse {
  source: ScanSource
  clauses: Clause[]
  findings: VerifiedFinding[]
  inferences: Inference[]
  fields: BuiltField[]
  stats: VerificationStats
  exposureScore: number
  warnings: string[]
}

export async function scanText(text: string, source: ScanSource, extractor: Extractor, warnings: string[] = []): Promise<ScanResponse> {
  const clauses = segment(text)
  const rawFindings = await extractor.extract(clauses)
  const { findings, stats } = verify(rawFindings, clauses)
  const inferences = runRules(findings)
  return {
    source,
    clauses,
    findings,
    inferences,
    fields: buildFields(findings, inferences),
    stats,
    exposureScore: exposureScore(findings),
    warnings,
  }
}
