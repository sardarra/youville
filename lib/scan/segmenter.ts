// Policy text segmentation (Req 2).
//
// `segment` is a pure function: the same text always yields the same clause
// ids and the same verbatim clause text (Req 2.2, 2.3). Clause text is a
// contiguous slice of the input, and concatenating the clauses reproduces
// the input exactly — boundary characters and the whitespace that follows
// them stay on the preceding clause (Req 2.1, 2.4).

import type { Clause } from "./types"

/** Space, tab, vertical tab, form feed, and the line-break characters. */
function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v"
}

/** Paragraph boundaries are runs of `\n`, `\r\n`, or `\r` (Req 2.1). */
function isLineBreak(ch: string): boolean {
  return ch === "\n" || ch === "\r"
}

function isSentencePunct(ch: string): boolean {
  return ch === "." || ch === "?" || ch === "!"
}

function hasNonWhitespace(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (!isWhitespace(text[i]!)) return true
  }
  return false
}

/**
 * Split policy text into numbered clauses.
 *
 * - Empty or missing text yields no clauses (Req 2.6).
 * - Text shorter than 3 characters is a single `segment-0` containing the
 *   whole input (Req 2.5).
 * - Otherwise, cut after a sentence boundary (`.`, `?`, or `!` followed by
 *   whitespace) or a paragraph boundary (one or more line breaks). The
 *   boundary characters and every whitespace character immediately after
 *   them belong to the preceding clause. The next clause starts at the
 *   first non-whitespace character (Req 2.1).
 * - A terminator at the end of the string is kept on the final clause; it
 *   does not create an empty trailing clause.
 * - Leading whitespace stays on the first clause so the split is a verbatim
 *   partition of the input (Req 2.4). A whitespace-only slice is never
 *   emitted as its own clause.
 */
export function segment(text: string | null | undefined): Clause[] {
  if (text == null || text.length === 0) return []
  if (text.length < 3) return [{ id: "segment-0", text }]

  const parts: string[] = []
  let start = 0
  let i = 0

  while (i < text.length) {
    const ch = text[i]!
    const sentenceBoundary = isSentencePunct(ch) && i + 1 < text.length && isWhitespace(text[i + 1]!)
    const paragraphBoundary = isLineBreak(ch)

    if (sentenceBoundary || paragraphBoundary) {
      // Consume the boundary marker and any whitespace that follows it.
      let end = sentenceBoundary ? i + 1 : i
      while (end < text.length && isWhitespace(text[end]!)) end++

      const clauseText = text.slice(start, end)
      const closesAClause = hasNonWhitespace(clauseText) && end < text.length
      if (closesAClause) {
        parts.push(clauseText)
        start = end
        i = end
        continue
      }

      // The boundary runs through the end of the string. Keep it on the
      // current clause instead of emitting an empty tail.
      if (end >= text.length) break
    }

    i++
  }

  if (start < text.length) parts.push(text.slice(start))
  if (parts.length === 0) parts.push(text)

  return parts.map((clauseText, index) => ({
    id: `segment-${index}`,
    text: clauseText,
  }))
}
