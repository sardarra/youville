import type { RawFinding } from '@/lib/extract'
import type { Clause } from '@/lib/segment'

export interface VerifiedFinding extends RawFinding {
  id: string
  verified: boolean
  removedReason?: string
}

export interface VerificationStats {
  total: number
  verified: number
  removed: number
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[“”‘’]/g, '"')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()

const tokenOverlap = (left: string, right: string) => {
  const leftTokens = new Set(left.split(/\s+/).filter(Boolean))
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean))
  if (!leftTokens.size) return 0
  let overlap = 0
  for (const token of leftTokens) if (rightTokens.has(token)) overlap++
  return overlap / leftTokens.size
}

const quoteMatches = (quote: string, text: string) => {
  const normalizedQuote = normalize(quote)
  const normalizedText = normalize(text)
  if (normalizedQuote && normalizedText.includes(normalizedQuote)) return true
  if (normalizedQuote.split(/\s+/).length < 5) return false
  return tokenOverlap(normalizedQuote, normalizedText) >= 0.9
}

export function verify(findings: RawFinding[], clauses: Clause[]) {
  const verifiedFindings = findings.map((finding, index): VerifiedFinding => {
    const claimedClause = clauses.find((clause) => clause.id === finding.clauseId)
    if (claimedClause && quoteMatches(finding.quote, claimedClause.text)) {
      return { ...finding, id: `finding-${index + 1}`, verified: true }
    }

    const matchingClause = clauses.find((clause) => quoteMatches(finding.quote, clause.text))
    if (matchingClause) {
      return { ...finding, clauseId: matchingClause.id, id: `finding-${index + 1}`, verified: true }
    }

    return {
      ...finding,
      id: `finding-${index + 1}`,
      verified: false,
      removedReason: claimedClause ? 'Quote could not be verified in the claimed clause.' : 'Claimed clause was not found and the quote could not be verified.',
    }
  })

  const stats = {
    total: verifiedFindings.length,
    verified: verifiedFindings.filter((finding) => finding.verified).length,
    removed: verifiedFindings.filter((finding) => !finding.verified).length,
  } satisfies VerificationStats

  return { findings: verifiedFindings, stats }
}
