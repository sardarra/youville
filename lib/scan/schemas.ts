// Zod validation schemas for the gemini-scan-backend feature.
//
// These schemas validate (1) the incoming `/api/scan` request body, (2) the
// structured output returned by the Gemini API, and (3) the full Scan_Result
// the API returns to the front end. They mirror the hand-written domain types
// in `./types` (Req 1.6); the front end consumes the same shapes.
//
// App-side validation philosophy (per the Gemini docs' "always validate in
// your application" guidance): Gemini's constrained decoding enforces `enum`
// on severity/signals, but does NOT enforce length/count bounds. We enforce
// non-emptiness and length caps here in Zod (Req 3.1, 3.3, 7.1).

import { z } from "zod"

/* ------------------------------------------------------------------ *
 * Severity (Req 3.1, 6.1)
 * ------------------------------------------------------------------ */

/** Severity restricted to 1 | 2 | 3, matching the Gemini schema enum. */
export const severitySchema = z.union([z.literal(1), z.literal(2), z.literal(3)])

/* ------------------------------------------------------------------ *
 * Stage (derived by the backend from a finding's category, task 7.1)
 * ------------------------------------------------------------------ */

/** The three backend analysis lanes. Uses the curly apostrophe to match the
 *  front-end group filters (see types.ts). */
export const stageSchema = z.enum(["Data collected", "Rights you waive", "Who it’s shared with"])

/* ------------------------------------------------------------------ *
 * Raw finding — the shape Gemini returns and we parse through Zod (Req 3.3)
 * ------------------------------------------------------------------ */

/**
 * Validates a single data-collection finding extracted by Gemini.
 *
 * Notes:
 * - `quote` is accepted as any string (including empty); the Verifier is
 *   responsible for the empty-quote removal (`removedReason='quote_empty'`),
 *   so we don't reject it at the Zod layer (per task 1.1 guidance).
 * - `clauseId` is accepted as any string; the Verifier cross-checks it against
 *   the provided chunk ids and marks mismatches `invalid_clause_id`.
 * - `signals` are validated as non-empty strings here. The fixed vocabulary
 *   `enum` is enforced in the Gemini JSON schema (task 10.1) and the atomic
 *   vocabulary is derived from the rules config at load time (task 5.1), so we
 *   keep this schema decoupled from the rules module.
 */
export const rawFindingSchema = z.object({
  category: z.string().min(1),
  field: z.string().min(1),
  summary: z.string().min(1),
  quote: z.string(),
  severity: severitySchema,
  clauseId: z.string(),
  signals: z.array(z.string().min(1)).min(1),
})

/**
 * The top-level shape Gemini returns: `{ "findings": [...] }`. Validated
 * after `JSON.parse` of the model's output text (Req 3.3).
 */
export const extractionResponseSchema = z.object({
  findings: z.array(rawFindingSchema),
})

/* ------------------------------------------------------------------ *
 * Scan request (Req 1.2, 7.1, 7.3)
 * ------------------------------------------------------------------ */

/**
 * Validates the `POST /api/scan` request body.
 *
 * - `text`: optional, capped at 60,000 characters (Req 7.1). The route handler
 *   maps a "too_big" failure on this field to HTTP 413 (task 14.1).
 * - `url`: optional; when present must be an http/https URL with a non-empty
 *   host (Req 7.3). `z.string().url()` accepts any scheme, so we use a custom
 *   refine to restrict to http/https.
 * - `superRefine`: at least one of non-whitespace `text` or `url` is required
 *   (Req 1.2). Whitespace-only `text` with no `url` is rejected here.
 */
const httpUrlSchema = z
  .string()
  .refine(
    (val) => {
      try {
        const u = new URL(val)
        return (u.protocol === "http:" || u.protocol === "https:") && u.host.length > 0
      } catch {
        return false
      }
    },
    { message: "url must be a valid http or https URL" },
  )

export const scanRequestSchema = z
  .object({
    text: z.string().max(60_000).optional(),
    url: httpUrlSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const hasText = Boolean(data.text && data.text.trim().length > 0)
    const hasUrl = Boolean(data.url)
    if (!hasText && !hasUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide non-empty text or a valid url.",
        path: ["text"],
      })
    }
  })

/* ------------------------------------------------------------------ *
 * Scan result — validates the full API response (Req 1.6, 6.1)
 * ------------------------------------------------------------------ */

export const clauseSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
})

export const caveatSchema = z.object({
  clauseId: z.string().min(1),
  quote: z.string(),
})

export const removedReasonSchema = z.enum([
  "quote_not_found",
  "quote_empty",
  "invalid_clause_id",
])

/** A finding as it appears in the API response (after verification). */
export const findingSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  field: z.string().min(1),
  summary: z.string().min(1),
  quote: z.string(),
  severity: severitySchema,
  clauseId: z.string(),
  signals: z.array(z.string().min(1)),
  verified: z.boolean(),
  stage: stageSchema,
  removedReason: removedReasonSchema.optional(),
  caveat: caveatSchema.nullable().optional(),
})

export const inferenceSchema = z.object({
  id: z.string().min(1),
  output: z.string().min(1),
  explanation: z.string().min(1),
  supportingFindingIds: z.array(z.string().min(1)),
})

export const statsSchema = z.object({
  total: z.number().int().min(0),
  verified: z.number().int().min(0),
  removed: z.number().int().min(0),
})

export const warningSchema = z.object({
  type: z.string().min(1),
  chunkIndex: z.number().int().optional(),
  message: z.string().optional(),
})

export const sourceMetaSchema = z.object({
  name: z.string().min(1),
  charCount: z.number().int().min(0),
  clauseCount: z.number().int().min(0),
  scannedAt: z.string().min(1),
})

/**
 * Validates a complete `Scan_Result` returned by `/api/scan` (Req 1.6). The
 * `exposureScore` is an integer constrained to 0–100 (Req 6.1).
 */
export const scanResultSchema = z.object({
  source: sourceMetaSchema,
  clauses: z.array(clauseSchema),
  findings: z.array(findingSchema),
  inferences: z.array(inferenceSchema),
  stats: statsSchema,
  exposureScore: z.number().int().min(0).max(100),
  warnings: z.array(warningSchema),
})
