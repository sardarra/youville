// Deterministic inference over verified findings (Req 5).
//
// Gemini never infers. A rule fires only when every input is present in the
// verified findings' signals. An input written as "A or B" is present when
// at least one alternative is present. Explanations are copied from the
// rule config and must not contain the standalone word "will" (Req 5.5).

import { inferenceRules, type InferenceRule } from "../../data/rules"
import type { Inference } from "./types"

export type { InferenceRule }
export { inferenceRules }

/** A verified finding, or any object that carries an id and signals. */
export interface SignalFinding {
  id: string
  signals: string[]
  /** When present and false, the finding is ignored (Req 4.8). */
  verified?: boolean
}

const STANDALONE_WILL = /\bwill\b/i

/**
 * Split a rule input on the token ` or ` (whitespace on both sides).
 * "Contacts or messaging metadata" → ["Contacts", "messaging metadata"].
 */
export function splitAlternatives(input: string): string[] {
  return input
    .split(" or ")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

/**
 * Atomic signal vocabulary: the union of every alternative across every
 * rule input, in first-seen order (Req 5.7). This is the enum Gemini is
 * allowed to emit.
 */
export function atomicVocabulary(rules: readonly InferenceRule[]): string[] {
  const seen = new Set<string>()
  const vocabulary: string[] = []
  for (const rule of rules) {
    for (const input of rule.inputs) {
      for (const alternative of splitAlternatives(input)) {
        if (seen.has(alternative)) continue
        seen.add(alternative)
        vocabulary.push(alternative)
      }
    }
  }
  return vocabulary
}

/**
 * Throw when a rule explanation contains the standalone word "will".
 * "willing" does not match. The engine does not rewrite explanation text (Req 5.5).
 */
export function assertExplanations(rules: readonly InferenceRule[]): void {
  for (const rule of rules) {
    if (STANDALONE_WILL.test(rule.explanation)) {
      throw new Error(`Rule ${rule.id} explanation contains the standalone word "will"`)
    }
  }
}

/**
 * Fire R1–R10 (or any injected rule list) over verified findings.
 *
 * Inferences are sorted by rule id (R1, R2, … R10). `supportingFindingIds`
 * are the verified findings whose signals match any alternative of the
 * rule's inputs, de-duplicated and sorted (Req 5.4, 5.6).
 */
export function runInferences(verifiedFindings: readonly SignalFinding[], rules: readonly InferenceRule[]): Inference[] {
  assertExplanations(rules)

  const findings = verifiedFindings.filter((finding) => finding.verified !== false)
  const present = new Set<string>()
  for (const finding of findings) {
    for (const signal of finding.signals) present.add(signal)
  }

  const inferences: Inference[] = []
  for (const rule of rules) {
    const groups = rule.inputs.map(splitAlternatives)
    const fired = groups.every((alternatives) => alternatives.some((alternative) => present.has(alternative)))
    if (!fired) continue

    const accepted = new Set(groups.flat())
    const supportingFindingIds = uniqueSorted(
      findings.filter((finding) => finding.signals.some((signal) => accepted.has(signal))).map((finding) => finding.id),
    )

    inferences.push({
      id: rule.id,
      output: rule.output,
      explanation: rule.explanation,
      supportingFindingIds,
    })
  }

  inferences.sort((a, b) => compareRuleId(a.id, b.id))
  return inferences
}

/** Lexicographic order, with `R<number>` compared by that number so R2 precedes R10. */
function compareRuleId(a: string, b: string): number {
  const na = /^R(\d+)$/.exec(a)
  const nb = /^R(\d+)$/.exec(b)
  if (na && nb) {
    const diff = Number(na[1]) - Number(nb[1])
    if (diff !== 0) return diff
  }
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function uniqueSorted(ids: string[]): string[] {
  return [...new Set(ids)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}
