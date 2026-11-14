// Quote normalization and bounded fuzzy matching (Req 4.3, 4.9).
//
// Both the finding quote and the clause text pass through `normalize` before
// an exact or fuzzy comparison. `similarity` is the score the Verifier
// compares against the 0.85 threshold.

/**
 * Map curly quotes, dashes, and the ellipsis to ASCII equivalents.
 * Applied after lowercasing and before punctuation stripping.
 */
function mapTypographic(text: string): string {
  let out = ""
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    switch (ch) {
      case "\u2018": // ‘
      case "\u2019": // ’
        out += "'"
        break
      case "\u201C": // “
      case "\u201D": // ”
        out += '"'
        break
      case "\u2013": // –
      case "\u2014": // —
        out += "-"
        break
      case "\u2026": // …
        out += "..."
        break
      default:
        out += ch
    }
  }
  return out
}

/**
 * Normalize a quote or clause for comparison (Req 4.9).
 *
 * Order: lowercase, map typographic characters (`‘ ’` → `'`, `“ ”` → `"`,
 * `— –` → `-`, `…` → `...`), collapse whitespace runs to a single space,
 * strip soft punctuation `,;:!?()[]{}'"`, collapse whitespace again, trim.
 *
 * Periods are kept. Stripping them would merge distinct sentences, and the
 * ellipsis mapping has to survive as `...` (task 3.1). A second whitespace
 * collapse runs after punctuation stripping so a removed comma cannot leave
 * a double space; that keeps `normalize` idempotent (Property 6).
 */
export function normalize(text: string): string {
  const lowered = mapTypographic(text.toLowerCase())
  const collapsed = lowered.replace(/\s+/g, " ")
  const stripped = collapsed.replace(/[,;:!?()[\]{}'"]/g, "")
  return stripped.replace(/\s+/g, " ").trim()
}

/**
 * Levenshtein edit distance between two strings.
 * Insertions, deletions, and substitutions each cost 1.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  // Keep `b` as the inner axis so the rows stay the shorter length.
  if (a.length < b.length) return levenshtein(b, a)

  let previous = new Array<number>(b.length + 1)
  let current = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) previous[j] = j

  for (let i = 1; i <= a.length; i++) {
    current[0] = i
    const ca = a.charCodeAt(i - 1)
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1
      const deletion = previous[j]! + 1
      const insertion = current[j - 1]! + 1
      const substitution = previous[j - 1]! + cost
      current[j] = Math.min(deletion, insertion, substitution)
    }
    const swap = previous
    previous = current
    current = swap
  }

  return previous[b.length]!
}

/**
 * Bounded fuzzy similarity of a quote against a clause, in `[0, 1]`.
 *
 * Both strings are normalized first. A window of `len(quote)` slides across
 * the clause with step `max(1, floor(len(quote) / 4))`; each window scores
 * `1 - levenshtein(quote, window) / len(quote)`, and the maximum wins.
 * When the clause is shorter than the quote, the quote is compared against
 * the whole clause (Req 4.3).
 *
 * An empty normalized quote scores `0`. The Verifier treats that case as
 * `quote_empty` before it asks for a fuzzy score.
 */
export function similarity(quote: string, clause: string): number {
  const q = normalize(quote)
  const c = normalize(clause)
  const qLen = q.length
  if (qLen === 0) return 0

  if (c.length < qLen) {
    return 1 - levenshtein(q, c) / qLen
  }

  const step = Math.max(1, Math.floor(qLen / 4))
  let best = 0
  for (let i = 0; i + qLen <= c.length; i += step) {
    const window = c.slice(i, i + qLen)
    const score = 1 - levenshtein(q, window) / qLen
    if (score > best) best = score
    if (best === 1) break
  }
  return best
}
