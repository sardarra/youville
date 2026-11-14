// Finding verification (Req 4). The differentiator: a finding is kept only
// when its quote is grounded in a clause. Exact normalized substring wins
// first; fuzzy matching is the fallback. Only `verified: true` findings are
// returned in `verified` for the Rules Engine (Req 4.8).

import { normalize, similarity } from "./fuzz"
import type { Clause, RawFinding, RemovedReason } from "./types"

/** Fuzzy matches below this score are removed as `quote_not_found` (Req 4.4–4.6). */
export const FUZZY_THRESHOLD = 0.85

/**
 * A normalized quote shorter than this cannot win on fuzzy similarity.
 * Exact substring matches are still accepted. This blocks trivial short
 * quotes from landing on an unrelated clause (Req 4.3).
 */
export const MIN_FUZZY_LENGTH = 3

/**
 * A raw finding after the verifier has assigned an id and a verdict.
 * `stage` is filled in later from the category map (task 7.1).
 */
export interface VerifiedFinding extends RawFinding {
  /** `f-<index>` in input order, shared by kept and removed findings. */
  id: string
  verified: boolean
  /** Present only when `verified` is false (Req 4.7). */
  removedReason?: RemovedReason
}

export interface VerifyResult {
  /** Findings the Rules Engine is allowed to see (Req 4.8). */
  verified: VerifiedFinding[]
  /** Findings kept for stats, excluded from inference. */
  removed: VerifiedFinding[]
}

interface NormalizedClause {
  clause: Clause
  text: string
}

function clauseIndex(clauses: Clause[]): Map<string, Clause> {
  const byId = new Map<string, Clause>()
  for (const clause of clauses) {
    if (!byId.has(clause.id)) byId.set(clause.id, clause)
  }
  return byId
}

/**
 * Confirm each finding's quote against the clause list.
 *
 * Per finding, in order:
 * 1. Empty normalized quote → `quote_empty`.
 * 2. `clauseId` not in the clause list → `invalid_clause_id`.
 * 3. Exact normalized substring of the claimed clause → verified, id kept (Req 4.1).
 * 4. Exact substring of some other clause → verified, id corrected to the
 *    earliest match in document order (Req 4.2).
 * 5. Otherwise a bounded fuzzy match. The best clause is the highest
 *    similarity, ties broken in favor of the claimed clause, then earliest
 *    document order (Req 4.3). A win requires similarity ≥ 0.85 and a
 *    normalized quote of at least 3 characters (Req 4.4, 4.5).
 * 6. Otherwise `quote_not_found` (Req 4.6).
 */
export function verifyFindings(findings: RawFinding[], clauses: Clause[]): VerifyResult {
  const byId = clauseIndex(clauses)
  const normalized: NormalizedClause[] = clauses.map((clause) => ({
    clause,
    text: normalize(clause.text),
  }))

  const verified: VerifiedFinding[] = []
  const removed: VerifiedFinding[] = []

  findings.forEach((finding, index) => {
    const result = verifyOne(finding, index, byId, normalized)
    if (result.verified) verified.push(result)
    else removed.push(result)
  })

  return { verified, removed }
}

function verifyOne(
  finding: RawFinding,
  index: number,
  byId: Map<string, Clause>,
  clauses: NormalizedClause[],
): VerifiedFinding {
  const quote = normalize(finding.quote)
  const id = `f-${index}`

  if (quote.length === 0) {
    return removed(finding, id, "quote_empty")
  }

  const claimed = byId.get(finding.clauseId)
  if (!claimed) {
    return removed(finding, id, "invalid_clause_id")
  }

  const claimedNorm = normalize(claimed.text)
  if (claimedNorm.includes(quote)) {
    return kept(finding, id, finding.clauseId)
  }

  const exactElsewhere = clauses.find((clause) => clause.text.includes(quote))
  if (exactElsewhere) {
    return kept(finding, id, exactElsewhere.clause.id)
  }

  if (quote.length < MIN_FUZZY_LENGTH) {
    return removed(finding, id, "quote_not_found")
  }

  const best = bestFuzzyClause(finding.quote, finding.clauseId, clauses)
  if (best && best.score >= FUZZY_THRESHOLD) {
    return kept(finding, id, best.clause.id)
  }

  return removed(finding, id, "quote_not_found")
}

function bestFuzzyClause(
  quote: string,
  claimedId: string,
  clauses: NormalizedClause[],
): { clause: Clause; score: number } | null {
  let best: { clause: Clause; score: number } | null = null

  for (const { clause } of clauses) {
    const score = similarity(quote, clause.text)
    if (!best) {
      best = { clause, score }
      continue
    }
    if (score > best.score) {
      best = { clause, score }
      continue
    }
    // Tie: the claimed clause beats any other; otherwise the earlier clause stays.
    if (score === best.score && clause.id === claimedId && best.clause.id !== claimedId) {
      best = { clause, score }
    }
  }

  return best
}

function kept(finding: RawFinding, id: string, clauseId: string): VerifiedFinding {
  return { ...finding, id, clauseId, verified: true }
}

function removed(finding: RawFinding, id: string, removedReason: RemovedReason): VerifiedFinding {
  return { ...finding, id, verified: false, removedReason }
}
