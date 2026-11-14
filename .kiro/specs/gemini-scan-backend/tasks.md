# Implementation Plan: gemini-scan-backend

## Overview

This plan builds the stateless `POST /api/scan` backend for T&C X-ray: segment policy text, have Gemini extract only data-collection findings (with verbatim quotes), verify every finding against the source, derive inferences with a deterministic rules engine, compute a severity-weighted exposure score, and return a `Scan_Result` that the existing front end renders. The cross-app Exposure Ledger stays client-side in `localStorage`. No submitted document text is ever stored or logged.

The work is split into 8 vertical slices. **Slice 1 builds and tests the deterministic core (segmenter, verifier, rules engine, scoring) behind a swappable `GeminiClient` interface, using a mock client** — so the differentiator (verified, grounded findings) is testable without the network. Slice 2 stands up `/api/scan` with the real Gemini client behind the same interface. Slice 3 wires the front end to real results. Slice 4 adds the demo cache fallback that protects the live demo. Slices 5–6 add URL mode and the client-side ledger. Slice 7 is the eval harness; Slice 8 is stretch (streaming, contradiction caveats).

Implementation language is **TypeScript** (Next.js 16 App Router Route Handlers, Zod, `@google/genai`). Each task builds on the previous ones and ends with wiring things together; there is no orphaned code.

## Priority Key

- **P0** — must ship for the demo to work. Slices 1–4 are P0.
- **P1** — should ship; improves the demo (URL mode, ledger).
- **P2** — stretch (eval harness, streaming, caveats).
- Tasks postfixed with `*` are optional **test** sub-tasks; the implementing agent does not auto-run them, and they can be skipped for a faster MVP. Core implementation tasks are never marked optional.
- Test sub-tasks create their own dedicated test file (one file per property/unit/integration test) so they can run in parallel without edit conflicts. Property tests use a JS/TS PBT library (e.g. `fast-check`), ≥ 100 iterations, each tagged with its design property number.

## Tasks

### Slice 1 — Deterministic core (P0) + mock Gemini client

- [x] 1. Set up scan module types and schemas
  - [x] 1.1 [P0] Create core domain types and Zod schemas in `lib/scan/types.ts` and `lib/scan/schemas.ts`
    - Define `Clause`, `RawFinding`, `Finding` (with `verified`, `stage`, `signals`, `removedReason`, `caveat`), `Inference` (with `supportingFindingIds`), `Stats`, `Warning`, `SourceMeta`, `Scan_Result`, `Severity`, `Stage`; `scanRequestSchema` (`text` ≤ 60,000 optional, `url` optional, refine requires one), `rawFindingSchema`, `extractionResponseSchema`, `scanResultSchema`
    - Depends on: —
    - _Requirements: 1.5, 1.6, 3.1, 3.3, 6.1, 7.1_
  - [ ]* 1.2 [P1] Write unit tests for Zod schemas
    - Valid/invalid request bodies, severity `1|2|3` enum, signals vocabulary enum, missing-text-and-url rejection, 60k cap rejection
    - Depends on: 1.1
    - _Requirements: 1.6, 3.1, 7.1_

- [ ] 2. Implement the Segmenter
  - [ ] 2.1 [P0] Implement `segment(text): Clause[]` in `lib/scan/segmenter.ts`
    - Empty/missing text → `[]` (Req 2.6); length < 3 → single clause `segment-0` (Req 2.5); else cut at sentence boundaries (`.?!` + whitespace) and paragraph boundaries (consecutive line breaks), assigning boundary chars + following whitespace to the preceding clause (Req 2.1); assign zero-based `segment-<index>` ids (Req 2.2); preserve clause text verbatim including internal whitespace (Req 2.4)
    - Depends on: 1.1
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  - [ ]* 2.2 [P1] Write property test — **Property 1: Segmentation determinism and stable IDs**
    - Segmenting any text twice yields identical `segment-0…segment-<n-1>` ids in order and identical clause text
    - Depends on: 2.1
    - _Requirements: 2.2, 2.3_
  - [ ]* 2.3 [P1] Write property test — **Property 2: Verbatim round-trip and boundary correctness**
    - Concatenating clause texts reproduces the original (within boundary whitespace); each clause is a verbatim contiguous substring; every boundary follows the defined rules
    - Depends on: 2.1
    - _Requirements: 2.1, 2.4_
  - [ ]* 2.4 [P1] Write property test — **Property 3: Short and empty input edges**
    - Length < 3 → exactly one clause containing the whole text; empty/missing → zero clauses
    - Depends on: 2.1
    - _Requirements: 2.5, 2.6_
  - [ ]* 2.5 [P1] Write unit tests for the Segmenter
    - CRLF vs LF, no terminators (one long clause), trailing/leading whitespace, text ending mid-sentence, mixed boundaries
    - Depends on: 2.1
    - _Requirements: 2.1, 2.3, 2.5_

- [ ] 3. Implement normalization and fuzzy matching
  - [ ] 3.1 [P0] Implement `normalize()`, `levenshtein()`, `similarity()` in `lib/scan/fuzz.ts`
    - `normalize`: lowercase → map typographic chars (`' ' " " → ' "`, `— – → -`, `… → ...`) → collapse whitespace runs to single space → strip soft punctuation `.,;:!?()[]{}'"` → trim (do not strip internal periods); `similarity(q,c)`: sliding window of `len(normalize(q))` over `normalize(c)`, `1 - levenshtein/window`, take max; if `len(c) < len(q)` compare against whole clause; window step `max(1, floor(len(q)/4))` (Req 4.9, 4.3)
    - Depends on: 1.1
    - _Requirements: 4.3, 4.9_
  - [ ]* 3.2 [P1] Write property test — **Property 6: Normalization idempotence and equivalence**
    - `normalize(normalize(x)) == normalize(x)`; verification outcomes identical under normalization-preserving transforms applied to both quote and clause
    - Depends on: 3.1
    - _Requirements: 4.9_
  - [ ]* 3.3 [P1] Write unit tests for `normalize`
    - Typographic char mapping, whitespace collapse, punctuation strip, idempotence, internal periods preserved
    - Depends on: 3.1
    - _Requirements: 4.9_

- [ ] 4. Implement the Verifier (the differentiator)
  - [ ] 4.1 [P0] Implement `verifyFindings(raw, clauses)` in `lib/scan/verifier.ts`
    - Per finding: empty normalized quote → `removedReason='quote_empty'`; exact substring in claimed clause → verified, keep clauseId (Req 4.1); else exact substring in another clause → verified, correct to earliest matching clause (Req 4.2); else bounded fuzzy match, best clause with tie-break favoring claimed clause then earliest order (Req 4.3); best ≥ 0.85 and claimed → verified keep id (Req 4.4); best ≥ 0.85 and other → verified correct id (Req 4.5); else `removedReason='quote_not_found'` (Req 4.6); invalid `clauseId` → `removedReason='invalid_clause_id'`; attach `removedReason` to removed findings (Req 4.7); pass only `verified=true` to rules engine (Req 4.8); require `len(normalize(quote)) >= 3` for a fuzzy win
    - Depends on: 2.1, 3.1
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_
  - [ ]* 4.2 [P1] Write property test — **Property 4: Exact-match verification and earliest-clause correction**
    - If the normalized quote is an exact substring of one or more clauses, the finding is verified and `clauseId` is the earliest matching clause in document order
    - Depends on: 4.1
    - _Requirements: 4.1, 4.2_
  - [ ]* 4.3 [P1] Write property test — **Property 5: Fuzzy verification and threshold removal**
    - With no exact match, verified iff best fuzzy match ≥ 0.85 (then `clauseId` corrected to best clause), else `verified=false` and `removedReason='quote_not_found'`
    - Depends on: 4.1
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7_
  - [ ]* 4.4 [P1] Write property test — **Property 7: Verified-only rule inputs**
    - Only `verified=true` findings are passed to the Rules Engine
    - Depends on: 4.1
    - _Requirements: 4.8_
  - [ ]* 4.5 [P1] Write unit tests for the Verifier
    - Empty quote, invalid clauseId, wrong-clause quote (corrected), quote longer than any clause (removed), quote spanning two clauses, duplicate text in multiple clauses, very short quote
    - Depends on: 4.1
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 4.7_

- [ ] 5. Implement the Rules Engine
  - [ ] 5.1 [P0] Implement `runInferences(verified, rules)` + atomic vocabulary in `lib/scan/rules-engine.ts`
    - Load R1–R10 from `data/rules.ts` (Req 5.1); for each rule, split each input on ` or ` into alternatives; input present iff ≥ 1 alternative is in the findings' signals; rule fires iff all inputs present (Req 5.2, 5.3); on fire produce `Inference` with rule id, output, explanation (verbatim from config), and `supportingFindingIds` = verified findings whose signals match any input alternative, de-duplicated and sorted (Req 5.4); inferences sorted by rule id; atomic vocabulary = union of all alternatives (Req 5.7); assert no explanation contains standalone `will` (Req 5.5)
    - Depends on: 1.1
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
  - [ ]* 5.2 [P1] Write property test — **Property 8: Rule firing with 'or' alternatives**
    - A rule fires iff every input is present (an 'or'-joined input present iff ≥ 1 alternative present); otherwise skipped
    - Depends on: 5.1
    - _Requirements: 5.2, 5.3_
  - [ ]* 5.3 [P1] Write property test — **Property 9: Inference structure and supporting-finding correctness**
    - Each fired Inference carries rule id, output, explanation from config; `supportingFindingIds` are exactly the verified findings whose signals match that rule's inputs
    - Depends on: 5.1
    - _Requirements: 5.4_
  - [ ]* 5.4 [P1] Write property test — **Property 10: Rules engine determinism**
    - Running twice yields identical inferences (same count, and matching id, output, explanation, supporting ids)
    - Depends on: 5.1
    - _Requirements: 5.6_
  - [ ]* 5.5 [P1] Write property test — **Property 11: Explanation wording invariant**
    - Every rule explanation contains `could` and never the standalone word `will`
    - Depends on: 5.1
    - _Requirements: 5.5_
  - [ ]* 5.6 [P1] Write property test — **Property 12: Signals within fixed vocabulary**
    - Every finding signal belongs to the vocabulary derived from rule input labels
    - Depends on: 5.1
    - _Requirements: 5.7_
  - [ ]* 5.7 [P1] Write property test — **Property 13: Rules config well-formedness**
    - Config has exactly 10 rules, each with a unique id and non-empty inputs, output, explanation
    - Depends on: 5.1
    - _Requirements: 5.1_
  - [ ]* 5.8 [P1] Write unit tests for the Rules Engine
    - Each of R1–R10 firing on full inputs, 'or' alternatives (one alternative sufficient), missing inputs (rule skipped), `Usage activity` vs `Usage` atom distinction
    - Depends on: 5.1
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 6. Implement exposure scoring
  - [ ] 6.1 [P0] Implement `computeExposureScore(verified)` in `lib/scan/scoring.ts`
    - Weights `w(1)=2, w(2)=5, w(3)=8`; reference max `12 × w(3) = 96`; `score = min(100, round(100 × Σ w(severity) / 96))`; integer 0–100; deterministic (Req 6.1, 6.5)
    - Depends on: 1.1
    - _Requirements: 6.1, 6.5_
  - [ ]* 6.2 [P1] Write property test — **Property 14: Score range and determinism**
    - Score is an integer in `[0,100]`; re-scoring the same set yields the identical value
    - Depends on: 6.1
    - _Requirements: 6.1, 6.5_
  - [ ]* 6.3 [P1] Write property test — **Property 15: Severity weighting order**
    - N findings all severity 1 score strictly lower than N findings all severity 3
    - Depends on: 6.1
    - _Requirements: 6.2_
  - [ ]* 6.4 [P1] Write property test — **Property 16: Score bound edges**
    - No verified findings → 0; 12 verified findings all severity 3 → ≤ 100
    - Depends on: 6.1
    - _Requirements: 6.3, 6.4_
  - [ ]* 6.5 [P1] Write unit tests for scoring
    - 0 verified, all-12 at sev3 = 100, sev1 < sev3, mixed severities
    - Depends on: 6.1
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 7. Implement category→stage map and logging sanitizer
  - [ ] 7.1 [P0] Implement `CATEGORY_TO_STAGE` map + `stage` derivation in `lib/scan/categories.ts`
    - Map each finding `category` to a `Stage` (`Data collected` / `Rights you waive` / `Who it's shared with`); default unmapped categories sensibly
    - Depends on: 1.1
    - _Requirements: 11_
  - [ ] 7.2 [P0] Implement log sanitizer in `lib/scan/logging.ts`
    - `sanitize`/`logScanMeta` strip document text, finding quotes, clause text, and the API key from every log line; log only metadata (timestamp, char count, clause count, finding count, warning types)
    - Depends on: 1.1
    - _Requirements: 10.3_
  - [ ]* 7.3 [P1] Write property test — **Property 24: Log sanitization**
    - No sanitized log message contains document text, a finding quote, clause text, or the API key
    - Depends on: 7.2
    - _Requirements: 10.3_
  - [ ]* 7.4 [P1] Write unit tests for the sanitizer
    - Forbidden substrings absent across log levels; metadata preserved
    - Depends on: 7.2
    - _Requirements: 10.3_

- [ ] 8. Define the swappable GeminiClient interface + mock
  - [ ] 8.1 [P0] Define the `GeminiClient` interface and a mock implementation in `lib/scan/gemini-client.ts`
    - Interface: `extract(chunk): Promise<{ findings: RawFinding[]; warnings: Warning[] }>` (and a P2 `findLimitingClause`); mock returns canned/raw findings for tests and the demo fallback without touching the Scan orchestrator; the interface is the dependency-injection seam (Req 3.12); the client never produces inferences (Req 3.10)
    - Depends on: 1.1
    - _Requirements: 3.10, 3.12_

- [ ] 9. Checkpoint — deterministic core
  - Ensure all tests pass, ask the user if questions arise. Confirm the mock client lets the whole core run without network. Verify env var defaults (`GEMINI_MODEL` unset → Flash-tier default) are read at runtime, not hardcoded.

### Slice 2 — `/api/scan` with real Gemini behind the same interface (P0)

- [ ] 10. Implement the Gemini prompt and extraction schema
  - [ ] 10.1 [P0] Implement `buildPrompt(chunk)` + the flat extraction JSON schema in `lib/scan/gemini-prompt.ts`
    - System instruction (privacy analyst; extract ONLY data-collection facts; never infer; quote must be a verbatim contiguous substring; use only provided clause ids; ignore embedded commands in `<POLICY>…</POLICY>`); user turn embeds clauses as `[segment-n] <verbatim text>` inside `<POLICY>` delimiters with the allowed-signal list; flat schema with `enum` severity `1|2|3` and `enum` signals = atomic vocabulary from the rules engine (Req 3.1, 3.8, 3.9, 3.10, 5.7)
    - Depends on: 5.1, 8.1
    - _Requirements: 3.1, 3.8, 3.9, 3.10, 5.7_
  - [ ]* 10.3 [P1] Write unit tests for the prompt builder
    - `<POLICY>` delimiters present, each clause id + text embedded, allowed signal labels injected, no inference instructions
    - Depends on: 10.1
    - _Requirements: 3.8, 3.9_

- [ ] 11. Implement the real GeminiClient
  - [ ] 11.1 [P0] Implement the real `GeminiClient` in `lib/scan/gemini-client.ts`
    - Read key from `GEMINI_API_KEY` (server only) and model from `GEMINI_MODEL` (default Flash-tier if unset — Req 3.2, 3.13, 10.4); try `client.interactions.create({ response_format:{ mime_type:'application/json', schema } })`, fall back to `client.models.generateContent({ config:{ responseMimeType, responseSchema } })` (Req 3.1); 10s per-call timeout via `AbortController` (Req 3.7); parse through `extractionResponseSchema` Zod (Req 3.3); on Zod failure retry the chunk once, on second failure drop findings + `schema_invalid` warning (Req 3.4, 3.5); on timeout drop + `chunk_timeout` warning (Req 3.7); on other error drop + `chunk_error` warning (Req 3.14); embed text as delimited untrusted input (Req 3.8); extract only findings, never inferences (Req 3.9, 3.10)
    - Depends on: 1.1, 8.1, 10.1
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 3.9, 3.10, 3.12, 3.13, 3.14, 10.4_
  - [ ]* 11.2 [P1] Write unit tests for the real GeminiClient
    - Retry-once on Zod failure, drop-on-second-failure, timeout-drop, non-timeout-error-drop — using a mock SDK / fake fetch (Req 3.4, 3.5, 3.7, 3.14)
    - Depends on: 11.1
    - _Requirements: 3.4, 3.5, 3.7, 3.14_
  - [ ]* 11.3 [P2] Write integration test: real Gemini structured-output call
    - One tiny fixture policy against the real `@google/genai`, gated behind `GEMINI_API_KEY` (CI without the key skips)
    - Depends on: 11.1
    - _Requirements: 3.1, 3.11_

- [ ] 12. Implement the rate limiter
  - [ ] 12.1 [P0] Implement `checkRateLimit(ip)` in `lib/scan/rate-limit.ts`
    - In-memory `Map<ip, number[]>`; drop timestamps older than 60s; ≤ 10 in window allow and record `now` (Req 7.4); > 10 reject (Req 7.2); evict idle IPs; best-effort per-instance (Req 7)
    - Depends on: —
    - _Requirements: 7.2, 7.4_
  - [ ]* 12.2 [P1] Write unit tests for the rate limiter
    - Window expiry, boundary at exactly 10 allowed, 11th rejected, using an injected clock
    - Depends on: 12.1
    - _Requirements: 7.2, 7.4_

- [ ] 13. Implement the scan orchestrator
  - [ ] 13.1 [P0] Implement `runScan(input, deps?)` in `lib/scan/scan.ts`
    - Dependency injection: `deps.gemini` defaults to the real client, tests inject the mock, the demo-fallback path injects a cache-backed client (Req 3.12); chunk clauses 8–12 per call, process with concurrency 3 (Req 3.6); on all-chunks-failed return HTTP 503 (cache fallback added in Slice 4); verify findings → run rules over verified only → score → assemble `stats` (total/verified/removed, Req 1.5), `warnings`, `source` meta (name or hostname, charCount, clauseCount, ISO-8601 UTC `scannedAt`, Req 1.3); add `too_short` warning if < 2 clauses (Req 1.8); inferences = rules output over verified findings (Req 1.9); hold text only in request-scoped memory (Req 1.4)
    - Depends on: 2.1, 4.1, 5.1, 6.1, 7.1, 8.1, 11.1, 12.1
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.8, 1.9, 3.6, 3.10, 3.12_
  - [ ]* 13.3 [P1] Write property test — **Property 17: Stats invariants**
    - `stats.total == findings.length`, `stats.verified` == verified count, `stats.removed == total - verified`
    - Depends on: 13.1
    - _Requirements: 1.5_
  - [ ]* 13.4 [P1] Write property test — **Property 18: Short-policy warning**
    - A scan producing fewer than 2 clauses contains ≥ one `too_short` warning
    - Depends on: 13.1
    - _Requirements: 1.8_
  - [ ]* 13.5 [P1] Write property test — **Property 19: Response schema conformance**
    - Every `Scan_Result` parses against `scanResultSchema` and its findings/clauses/inferences conform to the front-end types
    - Depends on: 13.1
    - _Requirements: 1.6_
  - [ ]* 13.6 [P1] Write property test — **Property 20: Inference sourcing**
    - Extraction produces zero inferences; returned inferences are exactly the Rules Engine output over verified findings
    - Depends on: 13.1, 5.1
    - _Requirements: 1.9, 3.10_
  - [ ]* 13.7 [P1] Write unit tests for the orchestrator
    - stats, warnings, source meta, < 2 clause warning, all using the mock Gemini client
    - Depends on: 13.1
    - _Requirements: 1.3, 1.5, 1.8, 1.9_
  - [ ]* 13.8 [P2] Write integration test: end-to-end `/api/scan` paste mode
    - One fixture returns a well-formed `Scan_Result`; gated behind `GEMINI_API_KEY`
    - Depends on: 13.1
    - _Requirements: 1.1, 3.11_

- [ ] 14. Implement the `/api/scan` route handler
  - [ ] 14.1 [P0] Create `app/api/scan/route.ts`: rate-limit → validate → `runScan` → JSON response
    - Parse `scanRequestSchema`; missing/empty/whitespace `text` with no `url` → 400 (Req 1.2); `text` > 60,000 → 413 with limit message (Req 7.1); invalid `url` scheme/host → 400 (Req 7.3); over 10/IP/60s → 429 (Req 7.2); success 200 `Scan_Result` (Req 1.1, 1.6); exposureScore integer 0–100 (Req 1.7 superseded by Req 6 severity-weighted — see Open Questions); stateless, no module-level document state (Req 1.4, 10.1)
    - Depends on: 13.1, 12.1
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 7.1, 7.2, 7.3_
  - [ ]* 14.3 [P1] Write unit tests for route validation
    - Missing text + no url → 400; whitespace-only → 400; > 60k → 413; bad url → 400; 11th request/IP → 429
    - Depends on: 14.1
    - _Requirements: 1.2, 7.1, 7.2, 7.3_
  - [ ]* 14.4 [P2] Write integration test: full route returns well-formed `Scan_Result`
    - Gated behind `GEMINI_API_KEY`
    - Depends on: 14.1
    - _Requirements: 1.1, 1.6_

- [ ] 15. Checkpoint — `/api/scan` paste mode end-to-end
  - Ensure all tests pass; confirm `GEMINI_API_KEY`/`GEMINI_MODEL` load server-side only and never reach the client bundle (Req 10.4). Run the integration test with the key set. Ask the user if questions arise.

### Slice 3 — Front-end wiring for paste mode (P0)

- [ ] 16. Wire the front end to `/api/scan` (paste mode)
  - [ ] 16.1 [P0] Replace the mock `runScan` in `components/tc-xray.tsx` with a `POST /api/scan` `{ text }` call
    - Add loading state; on success hold the `Scan_Result` in component state; on failure or > 30s client timeout show an error and retain the pasted text for retry (Req 11.1, 11.7)
    - Depends on: 14.1
    - _Requirements: 11.1, 11.7_
  - [ ] 16.2 [P0] Render the real `Scan_Result` in `components/tc-xray.tsx`
    - Render clauses by API id (not local `1.x` ids, Req 11.5); render each finding's `quote` verbatim (Req 11.4); render inferences with rule id, output label, explanation (Req 11.6); derive `stage` from the backend (no longer from mock)
    - Depends on: 16.1
    - _Requirements: 11.4, 11.5, 11.6_
  - [ ] 16.3 [P0] Display stats and score from the API in `components/tc-xray.tsx`
    - Compute "X of Y findings verified" from `stats.verified` / `stats.total` (Req 11.2); display `exposureScore` from the API, replacing `verified × 8` (Req 11.3)
    - Depends on: 16.1
    - _Requirements: 11.2, 11.3_
  - [ ]* 16.4 [P1] Write property test — **Property 25: Verified-count display**
    - The displayed "X of Y findings verified" equals `stats.verified` and `stats.total`
    - Depends on: 16.1, 16.3
    - _Requirements: 11.2_
  - [ ]* 16.5 [P1] Write property test — **Property 26: Rendered content contains API fields**
    - Each rendered finding contains its verbatim quote; each rendered inference contains its rule id, output label, and explanation
    - Depends on: 16.2
    - _Requirements: 11.4, 11.6_
  - [ ]* 16.6 [P1] Write unit tests for front-end paste wiring
    - POST on Scan click, render of API fields, error + retain-text on failure
    - Depends on: 16.1, 16.2, 16.3
    - _Requirements: 11.1, 11.4, 11.5, 11.6, 11.7_

- [ ] 17. Checkpoint — front-end paste mode
  - Ensure all tests pass, ask the user if questions arise. Manually verify a pasted policy renders real clauses, findings, inferences, verified count, and exposure score.

### Slice 4 — Demo cache + fallback (P0)

- [ ] 18. Implement the demo cache fallback
  - [ ] 18.1 [P0] Implement `lookupDemoCache(hash)` in `lib/scan/demo-cache.ts`
    - Read `data/demo-cache/<sha256>.json` (read-only; never stores live submissions); return the cached `Scan_Result` or null (Req 8.1, 8.2)
    - Depends on: 1.1
    - _Requirements: 8.1, 8.2_
  - [ ] 18.2 [P0] Integrate the fallback into `lib/scan/scan.ts`
    - When all chunks failed/timed out: compute `sha256(inputText)`; on cache hit return the cached `Scan_Result` unchanged except appending `Warning({ type:'demo_cache_fallback' })` (Req 8.3); on miss return HTTP 503 advising retry/paste (Req 8.4)
    - Depends on: 13.1, 18.1
    - _Requirements: 8.2, 8.3, 8.4_
  - [ ]* 18.3 [P1] Write unit tests for the fallback path
    - Cache hit returns result + `demo_cache_fallback` warning; cache miss → 503; cached result otherwise unchanged
    - Depends on: 18.1, 18.2
    - _Requirements: 8.3, 8.4_
  - [ ]* 18.4 [P1] Write smoke check for the cache
    - `data/demo-cache/` contains 8–10 files with `sha256` keys, each a valid `Scan_Result`
    - Depends on: 18.1
    - _Requirements: 8.1_

- [ ] 19. Seed the demo cache fixtures
  - [ ] 19.1 [P0] Write `scripts/seed-demo-cache.ts` to regenerate cache fixtures
    - For each real policy: scan with the real `GeminiClient`, write `<sha256(input)>.json` `Scan_Result` into `data/demo-cache/` (Req 8.1)
    - Depends on: 11.1, 18.1
    - _Requirements: 8.1_
  - [ ] 19.2 [P0] Scan 8–10 real policies and commit their `Scan_Result` JSON fixtures
    - Run the seed script; commit the resulting `data/demo-cache/*.json` so the demo survives a Gemini outage (Req 8.1)
    - Depends on: 19.1, 11.1
    - _Requirements: 8.1_

- [ ] 20. Checkpoint — demo-proof fallback
  - Ensure all tests pass; verify the live demo still returns a full result when Gemini is unavailable (force all chunks to fail, confirm cache hit). Ask the user if questions arise.

### Slice 5 — URL mode (P1)

- [ ] 21. Implement the SSRF guard
  - [ ] 21.1 [P0/P1] Implement `fetchPolicyText(url)` in `lib/scan/ssrf-guard.ts`
    - Parse URL; scheme must be `http`/`https` with non-empty host (Req 9.2, 7.3); resolve host via `dns.lookup({ all:true })`, fail closed on DNS error; block `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `::1`, link-local `169.254.0.0/16` (Req 9.3); `redirect:'manual'`, re-validate scheme + re-resolve + re-check IP each hop, cap 3 redirects (Req 9.4); 10s timeout (Req 9.5); abort if body > 2 MB (stream + count, Req 9.6); abort if `Content-Type` not HTML (Req 9.9)
    - Depends on: —
    - _Requirements: 7.3, 9.2, 9.3, 9.4, 9.5, 9.6, 9.9_
  - [ ]* 21.2 [P1] Write property test — **Property 21: SSRF IP-range classification (per hop)**
    - Private/loopback ranges are blocked, others pass; the check applies to the initial host and every redirect target
    - Depends on: 21.1
    - _Requirements: 9.3, 9.4_
  - [ ]* 21.3 [P1] Write property test — **Property 22: URL and content-type validation**
    - Non-`http`/`https` schemes and empty hosts are rejected; non-HTML content types are rejected
    - Depends on: 21.1
    - _Requirements: 7.3, 9.2, 9.9_
  - [ ]* 21.4 [P1] Write unit tests for the SSRF guard
    - Private-IP abort, redirect-to-private abort, > 3 redirects abort, non-HTML abort, 10s timeout abort
    - Depends on: 21.1
    - _Requirements: 9.3, 9.4, 9.5, 9.9_

- [ ] 22. Implement HTML-to-text extraction
  - [ ] 22.1 [P0/P1] Implement `stripTags(html)` in `lib/scan/html-to-text.ts`
    - Remove `<script>`, `<style>`, `<noscript>`, strip remaining tags, decode entities, collapse whitespace; preserve visible text without adding content (Req 9.7)
    - Depends on: —
    - _Requirements: 9.7_
  - [ ]* 22.2 [P1] Write property test — **Property 23: Visible-text extraction invariants**
    - Extracted text contains no `<script>`/`<style>` tags or HTML markup, and preserves visible text content without adding content
    - Depends on: 22.1
    - _Requirements: 9.7_
  - [ ]* 22.3 [P1] Write unit tests for `stripTags`
    - Script/style removed, entities decoded, whitespace collapsed, visible text preserved
    - Depends on: 22.1
    - _Requirements: 9.7_

- [ ] 23. Wire URL mode into the API and front end
  - [ ] 23.1 [P0/P1] Add the URL branch to `app/api/scan/route.ts`
    - On valid `url` with no `text`: `fetchPolicyText` → `stripTags` → segment → scan; on fetch fail/abort or empty text return 502 advising the user to paste directly (Req 9.1, 9.8)
    - Depends on: 14.1, 21.1, 22.1
    - _Requirements: 9.1, 9.8_
  - [ ] 23.2 [P0/P1] Wire URL mode into `components/tc-xray.tsx`
    - `POST /api/scan { url }` instead of the mock preview; render the returned `Scan_Result` (Req 11.1)
    - Depends on: 16.1, 14.1
    - _Requirements: 11.1_
  - [ ]* 23.3 [P1] Write integration tests for URL mode
    - URL mode against a public, stable HTML page (1 example); private-IP URL asserts abort (1 example)
    - Depends on: 23.1
    - _Requirements: 9.3, 9.8_

- [ ] 24. Checkpoint — URL mode
  - Ensure all tests pass, ask the user if questions arise. Manually verify a public policy URL scans end-to-end and a private-IP URL is rejected.

### Slice 6 — Client-side Exposure Ledger persistence (P1)

- [ ] 25. Implement the client-side ledger
  - [ ] 25.1 [P0/P1] Implement `lib/ledger.ts`
    - Store each `Scan_Result` in `localStorage` keyed by source name, overwriting same-name entries (Req 12.1); clear removes all stored results (Req 12.3); on `QuotaExceededError` remove the oldest stored result and retry (Req 12.5); never transmit stored results to any server (Req 10.5); merge all stored results into a combined verified-finding set for the ledger table and combined inferences (Req 12.2); when two+ results share a verified field, show all containing source names (Req 12.4)
    - Depends on: 16.1
    - _Requirements: 10.5, 12.1, 12.2, 12.3, 12.4, 12.5_
  - [ ] 25.2 [P0/P1] Wire the ledger into `components/tc-xray.tsx`
    - On a new `Scan_Result`, store it; render the Exposure Ledger table from the merged set with shared-field source grouping and combined inferences; Clear removes all stored results (Req 12.1–12.4)
    - Depends on: 25.1, 16.1
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  - [ ]* 25.3 [P1] Write property test — **Property 27: Ledger merge and shared-field grouping**
    - The merged verified set is the union of each result's verified findings; each shared field displays exactly the source names of results containing that verified field
    - Depends on: 25.1
    - _Requirements: 12.2, 12.4_
  - [ ]* 25.4 [P1] Write unit tests for the ledger
    - Store overwrites by name, clear empties, quota-exceeded removes oldest + retries, shared field lists all source names
    - Depends on: 25.1, 25.2
    - _Requirements: 12.1, 12.3, 12.4, 12.5_

- [ ] 26. Checkpoint — client-side ledger
  - Ensure all tests pass, ask the user if questions arise. Manually verify two scans persist across apps and the ledger shows combined exposure.

### Slice 7 — Evaluation harness (P2)

- [ ] 27. Implement the eval harness
  - [ ] 27.1 [P2] Implement `eval/harness.ts`: `runEval(goldenDocs, scan)` → rows + aggregate
    - Per doc: `verifiedRate = 100 × verified / expectedFindings` (0 if expected is 0), `removedRate = 100 × removed / total` (0 if total is 0), both bounded `[0,100]`; `rulesFired` = inference ids; a failed scan marks the row `failed` and excludes it from aggregate verified/removed rates (Req 13.2, 13.4, 13.5); summary table has one row per doc + one aggregate row (Req 13.3)
    - Depends on: 14.1
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_
  - [ ] 27.2 [P2] Create 5+ golden documents in `eval/golden/`
    - Each provides policy text + expected finding count (hand-labeled) as fixture files (Req 13.1)
    - Depends on: —
    - _Requirements: 13.1_
  - [ ]* 27.3 [P2] Write property test — **Property 28: Eval rate computation and failed-doc exclusion**
    - Rate formulas hold; both rates in `[0,100]`; zero divisor → 0; failed docs excluded from aggregate rates
    - Depends on: 27.1
    - _Requirements: 13.2, 13.4, 13.5_
  - [ ]* 27.4 [P2] Write unit tests for the eval harness
    - Rates, failed-doc exclusion, zero-divisor edges, aggregate row
    - Depends on: 27.1
    - _Requirements: 13.2, 13.3, 13.4, 13.5_

- [ ] 28. Checkpoint — eval harness
  - Ensure all tests pass; run the harness against the golden documents and review the summary table. Ask the user if questions arise.

### Slice 8 — Stretch: streaming + contradiction caveats (P2)

- [ ] 29. Streaming progress
  - [ ] 29.1 [P2] Add `/api/scan?stream=1` in `app/api/scan/route.ts`
    - Return `new Response(ReadableStream)` with `Content-Type: text/event-stream`; emit `start` with `totalChunks` (Req 14.1); `chunk` with `chunkIndex` + finding count after each chunk, failed chunks report `findingCount: 0` and continue (Req 14.2, 14.4); `done` with the final `Scan_Result` then close (Req 14.3)
    - Depends on: 13.1, 14.1
    - _Requirements: 14.1, 14.2, 14.3, 14.4_
  - [ ]* 29.2 [P2] Write property test — **Property 29: Streaming event coverage**
    - Exactly one start event (totalChunks = chunk count), exactly one event per chunk (failed → `findingCount:0`), exactly one done event before close
    - Depends on: 29.1
    - _Requirements: 14.1, 14.2, 14.3, 14.4_
  - [ ]* 29.3 [P2] Write integration test: streaming emits start/per-chunk/done for one fixture
    - Depends on: 29.1
    - _Requirements: 14.1, 14.2, 14.3_

- [ ] 30. Contradiction caveats (second pass)
  - [ ] 30.1 [P2] Implement `findLimitingClause()` + second-pass schema in `lib/scan/gemini-client.ts`
    - Gated behind `SCAN_SECOND_PASS`; for each verified finding request any clause that contradicts/limits it (Req 15.1); attach `caveat = { clauseId, quote }` for the limiting clause with the lowest `clauseId` (Req 15.2); empty caveat when none found (Req 15.3); on timeout/validation failure leave caveat empty and add a `caveat_failed` warning (Req 15.4)
    - Depends on: 11.1
    - _Requirements: 15.1, 15.2, 15.3, 15.4_
  - [ ]* 30.2 [P2] Write property test — **Property 30: Caveat lowest-clauseId selection**
    - The attached caveat is the lowest-`clauseId` limiting clause with its verbatim quote, or empty when none is found
    - Depends on: 30.1
    - _Requirements: 15.2, 15.3_
  - [ ]* 30.3 [P2] Write unit tests for caveat selection
    - Lowest clauseId chosen, none found → empty, failure → empty + `caveat_failed` warning
    - Depends on: 30.1
    - _Requirements: 15.2, 15.3, 15.4_

- [ ] 31. Final checkpoint — all slices
  - Ensure all tests pass across every slice, ask the user if questions arise.

## Open Questions and Risks

1. **Gemini API style (`interactions.create` vs `generateContent`).** The installed `@google/genai` version may expose only one. **Action for the user**: after `pnpm add @google/genai`, confirm the version and which call shape compiles; the `GeminiClient` (task 11.1) tries Interactions and falls back to `generateContent`. **Risk**: if neither is available, extraction can't run — mitigated by the Demo Cache fallback (Slice 4).
2. **Per-call timeout plumbing.** Verify the SDK's abort mechanism (`abortSignal` vs `requestOptions.timeout`). **Decision**: `AbortController` + `setTimeout`, pass the signal where supported, else race the call against a timeout promise. **Risk**: a hung call could exceed budget — mitigated by the demo-cache failover.
3. **Scoring conflict (Req 1.7 vs Req 6).** Req 1.7's `verified × 8` is not severity-weighted and violates Req 6.2. **Decision**: the severity-weighted formula (Req 6) wins; `verified × 8` is treated as the superseded mock behavior. **Action for the user**: confirm so the requirements can be reconciled.
4. **Input cap (Req 1.1/1.2 vs Req 7.1).** The older 100,000-char figure conflicts with the 60,000-char hard cap. **Decision**: enforce 60,000 (HTTP 413). **Action for the user**: confirm the 60k cap.
5. **Signal vocabulary atoms vs joined labels (Req 5.2 vs 5.7).** **Decision**: signals are atomic (alternatives after splitting on ` or `); the vocabulary is the union of atoms; a joined input matches if any atom is present. **Action for the user**: confirm.
6. **`Usage activity` vs `Usage` atoms.** The config uses `Usage activity` (R4) and `Usage` (R6 alt) as distinct atoms, so a finding tagged one does not fire the other's rule. **Risk**: lower recall. **Action for the user**: decide whether to normalize the config labels or tag findings with both.
7. **Finding `stage` derivation.** Gemini returns `category` but not `stage`. **Decision**: the backend derives `stage` from `category` via `CATEGORY_TO_STAGE` (task 7.1); the `What can be inferred` finding-group is typically empty because inferences render separately via the Rules Engine. **Action for the user**: confirm the category→stage mapping.
8. **Inference type shape (Req 1.6 vs 5.4).** **Decision**: return `{id, output, explanation, supportingFindingIds}` (a superset; the front-end ignores `supportingFindingIds`). **Action for the user**: confirm the superset is acceptable.
9. **Rate limiting on Vercel serverless.** In-memory per-IP limiting is per-instance and approximate. **Decision**: acceptable best-effort for a demo. **Risk**: inconsistent limits across instances.
10. **Fuzzy-match cost on large policies.** Windowed Levenshtein is bounded by window step and clause length. **Risk**: slow on pathological inputs — mitigated by the 60k char cap bounding clause count.
11. **Second pass doubles Gemini calls.** Enabling caveats roughly doubles latency/cost. **Decision**: gated behind `SCAN_SECOND_PASS=false` by default; ship as P2 (task 30.1).
12. **Hackathon scope risk.** 36 hours, one beginner. P0 (Slices 1–4 + front-end paste) is the must-ship core; P1/P2 are skippable. The Demo Cache (Slice 4) is P0 specifically to protect the live demo if Gemini is slow or down.

## Notes

- Tasks marked with `*` are optional test sub-tasks; skip them for a faster MVP. Each creates its own dedicated test file so they can run in parallel without edit conflicts. Property tests use a PBT library (e.g. `fast-check`) at ≥ 100 iterations, each tagged with its design property number.
- Core implementation tasks (no `*`) are never optional.
- Every task references specific requirements clauses (X.Y) from `requirements.md` for traceability.
- Checkpoints validate each vertical slice incrementally; do not proceed past a failing checkpoint without resolving it.
- `@google/genai` must be added (`pnpm add @google/genai`) before Slice 2; integration tests are gated behind `GEMINI_API_KEY` so CI without the key skips them.
- Env vars (all server-only): `GEMINI_API_KEY` (required), `GEMINI_MODEL` (Flash-tier default), `SCAN_MAX_CHARS=60000`, `SCAN_RATE_LIMIT=10`, `SCAN_CHUNK_SIZE=10`, `SCAN_CONCURRENCY=3`, `SCAN_CALL_TIMEOUT_MS=10000`, `SCAN_URL_TIMEOUT_MS=10000`, `SCAN_URL_MAX_BYTES=2097152`, `SCAN_DEMO_CACHE_DIR=data/demo-cache`, `SCAN_SECOND_PASS=false`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "5.1", "6.1", "7.1", "7.2", "8.1", "12.1", "18.1", "21.1", "22.1", "27.2"] },
    { "id": 2, "tasks": ["4.1", "10.1"] },
    { "id": 3, "tasks": ["1.2", "2.2", "2.3", "2.4", "2.5", "3.2", "3.3", "4.2", "4.3", "4.4", "4.5", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "6.2", "6.3", "6.4", "6.5", "7.3", "7.4", "10.3", "12.2", "18.4", "21.2", "21.3", "21.4", "22.2", "22.3"] },
    { "id": 4, "tasks": ["11.1"] },
    { "id": 5, "tasks": ["13.1", "19.1", "11.2", "11.3"] },
    { "id": 6, "tasks": ["14.1", "18.2", "19.2"] },
    { "id": 7, "tasks": ["16.1", "13.3", "13.4", "13.5", "13.6", "13.7", "13.8", "14.3", "14.4", "18.3"] },
    { "id": 8, "tasks": ["16.2"] },
    { "id": 9, "tasks": ["16.3", "23.1"] },
    { "id": 10, "tasks": ["16.4", "16.5", "16.6", "23.2", "23.3", "25.1"] },
    { "id": 11, "tasks": ["25.2"] },
    { "id": 12, "tasks": ["25.3", "25.4"] },
    { "id": 13, "tasks": ["27.1"] },
    { "id": 14, "tasks": ["27.3", "27.4"] },
    { "id": 15, "tasks": ["29.1"] },
    { "id": 16, "tasks": ["29.2", "29.3"] },
    { "id": 17, "tasks": ["30.1"] },
    { "id": 18, "tasks": ["30.2", "30.3"] }
  ]
}
```
