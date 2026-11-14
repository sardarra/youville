// Core domain types for the gemini-scan-backend feature.
//
// These types are the single source of truth for the shape of every object
// that flows through the scan pipeline (segmenter -> verifier -> rules engine
// -> scoring -> orchestrator -> /api/scan response). They are designed to be
// structurally compatible with the existing front-end TypeScript types in
// `data/mock-data.ts` (Req 1.6), so the API response renders without changes
// once the front end is wired to `/api/scan` (Slice 3).
//
// Note: the existing front end and mock data use the curly apostrophe ’
// (U+2019) inside the stage label "Who it’s shared with". The Stage union
// below uses that exact character so backend-produced findings match the
// front-end group filters.

/** A finding's severity. 1 = low, 2 = medium, 3 = high (Req 3.1, 6.1). */
export type Severity = 1 | 2 | 3

/**
 * The analysis "lane" a finding belongs to. The backend derives this from a
 * finding's `category` via a category->stage map (task 7.1). Inference is now
 * produced by the Rules Engine rather than as findings, so the old mock-only
 * "What can be inferred" lane is not part of the backend Stage vocabulary.
 */
export type Stage = "Data collected" | "Rights you waive" | "Who it’s shared with"

/** A numbered, verbatim segment of policy text produced by the Segmenter (Req 2). */
export interface Clause {
  /** Stable id in the format `segment-<index>` (zero-based). */
  id: string
  /** The verbatim clause text, including internal whitespace (Req 2.4). */
  text: string
}

/**
 * A data-collection fact extracted by the Gemini_Client from a chunk of
 * clauses, before verification. This is the raw shape Gemini returns and that
 * `rawFindingSchema` (schemas.ts) validates (Req 3.3).
 */
export interface RawFinding {
  /** Short category, e.g. "Location", "Device", "Contacts". */
  category: string
  /** Short data-field label, e.g. "Precise location". */
  field: string
  /** One-line plain-language summary. */
  summary: string
  /** A verbatim contiguous substring copied from the cited clause. */
  quote: string
  severity: Severity
  /** The `segment-<index>` id of the source clause, as given to Gemini. */
  clauseId: string
  /** Labels drawn from the fixed vocabulary derived from the rules (Req 5.7). */
  signals: string[]
}

/** Why a finding was excluded (not verified) by the Verifier (Req 4.6, 4.7). */
export type RemovedReason = "quote_not_found" | "quote_empty" | "invalid_clause_id"

/** A limiting/contradicting clause attached to a verified finding (P2, Req 15). */
export interface Caveat {
  clauseId: string
  quote: string
}

/**
 * A finding after verification. Extends RawFinding with the id, verification
 * verdict, derived stage, and optional removal/caveat metadata. This is the
 * shape returned in `Scan_Result.findings` and matches the front-end Finding
 * type (plus the extra `signals`/`removedReason`/`caveat` fields) (Req 1.6).
 */
export interface Finding extends RawFinding {
  /** Assigned by the pipeline as `f-<index>`. */
  id: string
  /** Whether the finding's quote was grounded in a clause (Req 4). */
  verified: boolean
  /** Derived from `category` by the backend (task 7.1). */
  stage: Stage
  /** Present only when `verified` is false (Req 4.7). */
  removedReason?: RemovedReason
  /** A limiting clause, if one was found in the second pass (Req 15). */
  caveat?: Caveat | null
}

/**
 * A higher-order conclusion produced by the Rules Engine (R1–R10) over
 * verified findings only (Req 1.9, 5). Inference is never produced by the
 * Gemini_Client (Req 3.10).
 */
export interface Inference {
  /** The rule id, e.g. "R1". */
  id: string
  /** The inferred field label, from the rule config. */
  output: string
  /** The explanation from the rule config; uses "could", never "will" (Req 5.5). */
  explanation: string
  /** Ids of the verified findings whose signals matched the rule's inputs (Req 5.4). */
  supportingFindingIds: string[]
}

/** Aggregate finding counts for a scan (Req 1.5). */
export interface Stats {
  /** Total number of findings (verified + removed). */
  total: number
  /** Number of findings marked verified. */
  verified: number
  /** Number of findings not marked verified (total - verified). */
  removed: number
}

/** A non-fatal message about a degraded scan (Req 1.8, 3.5, 3.7, 3.14, 8.3). */
export interface Warning {
  /** e.g. "chunk_timeout", "schema_invalid", "too_short", "demo_cache_fallback", "chunk_error". */
  type: string
  /** Index of the chunk the warning applies to, when relevant. */
  chunkIndex?: number
  /** Optional human-readable detail. Must not contain document text (Req 10.3). */
  message?: string
}

/** Source metadata for a scan result (Req 1.3). */
export interface SourceMeta {
  /** Source name, or the hostname in URL mode. */
  name: string
  /** Total character count of the submitted text. */
  charCount: number
  /** Number of clauses produced by the Segmenter. */
  clauseCount: number
  /** Scan timestamp as an ISO 8601 UTC string. */
  scannedAt: string
}

/**
 * The full response object returned by `POST /api/scan` (Req 1.1, 1.6).
 * The backend stores no submitted documents (Req 1.4); this object is built
 * in request-scoped memory and released after the response is sent.
 */
export interface Scan_Result {
  source: SourceMeta
  clauses: Clause[]
  findings: Finding[]
  inferences: Inference[]
  stats: Stats
  /** Severity-weighted privacy risk score, integer 0–100 (Req 6.1). */
  exposureScore: number
  warnings: Warning[]
}

/** Request body accepted by `POST /api/scan` (Req 1.2, 7.1, 7.3). */
export interface ScanRequest {
  /** Pasted policy text, ≤ 60,000 characters. */
  text?: string
  /** A policy URL to fetch (http/https only). */
  url?: string
}
