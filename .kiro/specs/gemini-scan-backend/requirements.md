# Requirements Document

## Introduction

T&C X-ray is a privacy-reading aid that helps users understand what personal data an app's terms and privacy policy collect, what that data could let someone infer, and which findings are verified against the source text. The front end already exists as a Next.js 16 app running on mock data. This feature, **gemini-scan-backend**, adds a real backend: a stateless Next.js Route Handler that calls the Gemini API to extract data-collection findings from pasted or URL-fetched policy text, verifies each finding against the source, derives inferences with a deterministic rules engine, computes a severity-weighted exposure score, and returns the result to the front end. The backend stores no submitted documents. The cross-app Exposure Ledger persists client-side in localStorage.

The system is built for a 36-hour hackathon with a two-person team, so the design prioritizes the simplest implementation that demos reliably.

## Glossary

- **Scan_API**: the `POST /api/scan` Next.js Route Handler that accepts policy text or a URL and returns a Scan_Result.
- **Scan_Result**: the full JSON response object returned by the Scan_API, containing source metadata, clauses, findings, inferences, stats, exposureScore, and warnings.
- **Gemini_Client**: the server-side wrapper around the `@google/genai` SDK that sends chunked policy text to the Gemini API and receives structured findings.
- **Segmenter**: the module that splits raw policy text into numbered Clauses with stable IDs.
- **Clause**: a numbered segment of policy text produced by the Segmenter, containing an id and the verbatim text.
- **Finding**: a data-collection fact extracted from policy text, containing a category, field, summary, verbatim quote, clauseId, severity (1–3), signals, and a verified flag.
- **Signal**: a normalized label from a fixed vocabulary matching the Rules_Engine input labels, used to tag a Finding for rule matching.
- **Verifier**: the module that confirms each Finding's quote exists in the claimed Clause using whitespace/case/punctuation normalization and bounded fuzzy matching.
- **Rules_Engine**: the deterministic module that fires inference rules (R1–R10) over verified Findings to produce Inferences.
- **Inference**: a possible higher-order conclusion produced by the Rules_Engine, containing a rule id, output label, supporting finding ids, and an explanation.
- **Exposure_Score**: a deterministic severity-weighted privacy risk score in the range 0–100.
- **Demo_Cache**: a set of 8–10 pre-scanned real policy results stored as JSON files, keyed by a hash of the input text, used as a fallback when Gemini_Client fails.
- **SSRF_Guard**: the URL fetch safety module that validates and fetches policy URLs with SSRF protection.
- **Front_End**: the existing React/Next.js client application that renders scan results, the exposure ledger, and the visual guide.
- **Ledger**: the client-side (localStorage) store of Scan_Results across multiple apps, used to display combined exposure.
- **Warning**: a non-fatal message included in Scan_Result.warnings when a chunk fails, a limit is hit, or a fallback is used.
- **Golden_Document**: a hand-labeled policy with expected findings, used by the Eval_Harness to measure extraction quality.
- **Eval_Harness**: the test harness that runs the Scan_API against Golden_Documents and reports verified rate, removed rate, and which rules fired.

## Requirements

### Requirement 1: Scan API Endpoint

**User Story:** As a user, I want to submit privacy policy text and receive a structured analysis, so that I can understand what data the policy collects and what it could reveal.

#### Acceptance Criteria

1. WHEN a POST request with a JSON body containing a non-empty `text` field is received, THE Scan_API SHALL return a Scan_Result containing clauses, findings, inferences, stats, exposureScore, and warnings.
2. WHEN a POST request with an empty or missing `text` field and no `url` field is received, THE Scan_API SHALL return an HTTP 400 status with a descriptive error message.
3. THE Scan_API SHALL return source metadata containing the source name (or hostname for URL mode), the total character count, the clause count, and the scan timestamp.
4. THE Scan_API SHALL process each scan request in memory only, releasing all document text after the response is returned.
5. WHEN the Scan_API completes processing, THE Scan_API SHALL return stats containing total, verified, and removed finding counts computed from the actual findings array.
6. THE Scan_API SHALL return Findings, Clauses, and Inferences in a JSON structure compatible with the existing Front_End TypeScript types (Finding, Clause, and extended types for Inferences and Scan_Result).

### Requirement 2: Policy Text Segmentation

**User Story:** As a developer, I want policy text split into stable numbered clauses, so that findings can reference specific source locations deterministically.

#### Acceptance Criteria

1. WHEN raw policy text is provided to the Segmenter, THE Segmenter SHALL split the text into Clauses using deterministic sentence and paragraph boundaries.
2. THE Segmenter SHALL assign each Clause a stable ID in the format `segment-<index>` where index is a zero-based sequential integer.
3. WHEN the same policy text is segmented twice, THE Segmenter SHALL produce identical Clause IDs and identical Clause text for both runs.
4. THE Segmenter SHALL preserve the original text of each Clause verbatim, including internal whitespace, so that the Verifier can match quotes exactly.
5. WHEN policy text contains fewer than 3 characters, THE Segmenter SHALL produce a single Clause containing the entire text.

### Requirement 3: Gemini Extraction

**User Story:** As a developer, I want Gemini to extract data-collection findings from policy clauses, so that the analysis reflects the actual policy text rather than mock data.

#### Acceptance Criteria

1. WHEN a chunk of Clauses is sent to the Gemini_Client, THE Gemini_Client SHALL call the Gemini API using the `@google/genai` SDK with structured output configured via a JSON schema and MIME type `application/json`.
2. THE Gemini_Client SHALL use the model identifier from the `GEMINI_MODEL` environment variable, defaulting to a Flash-tier model when the variable is unset.
3. WHEN Gemini_Client returns a response, THE Gemini_Client SHALL validate the response against a Zod schema and return parsed Findings.
4. IF the Zod validation fails on the first attempt, THE Gemini_Client SHALL retry the call once with the same chunk.
5. IF the Zod validation fails on the retry, THE Gemini_Client SHALL drop that chunk's findings and add a Warning to the Scan_Result.
6. THE Gemini_Client SHALL split Clauses into chunks of 8–12 clauses per call and process chunks with a concurrency limit of 3.
7. WHEN a Gemini API call exceeds the per-call timeout of 10 seconds, THE Gemini_Client SHALL abort the call, drop that chunk's findings, and add a Warning.
8. THE Gemini_Client SHALL send policy text as delimited untrusted input with explicit instructions to ignore any commands embedded in the text.
9. THE Gemini_Client SHALL extract only data-collection findings, returning category, field, summary, severity, signals, clauseId, and verbatim quote for each Finding.
10. Inference SHALL be performed exclusively by the Rules_Engine; THE Gemini_Client SHALL extract only data-collection findings and SHALL produce zero Inferences.
11. WHEN a typical policy of 3,000–8,000 characters is processed, THE Scan_API SHALL complete within 15 seconds under normal Gemini API latency.
12. THE Gemini_Client SHALL expose a swappable interface so that unit tests and the Demo_Cache fallback can substitute an alternative implementation without changing the Scan_API code.

### Requirement 4: Finding Verification

**User Story:** As a user, I want every finding verified against the source text, so that I can trust the analysis is grounded in what the policy actually says.

#### Acceptance Criteria

1. WHEN a Finding's quote is an exact substring of the Finding's claimed Clause text after whitespace normalization, THE Verifier SHALL mark the Finding as verified.
2. WHEN a Finding's quote does not match the claimed Clause by exact substring but matches another Clause by exact substring, THE Verifier SHALL correct the Finding's clauseId to the matching Clause and mark the Finding as verified.
3. WHEN a Finding's quote matches no Clause by exact substring, THE Verifier SHALL attempt a bounded fuzzy match with a similarity threshold of 0.85 against each Clause.
4. IF the fuzzy match succeeds against a Clause other than the claimed Clause, THE Verifier SHALL correct the clauseId and mark the Finding as verified.
5. IF the fuzzy match fails against all Clauses, THE Verifier SHALL mark the Finding as not verified with a removed reason of `quote_not_found`.
6. WHEN a Finding is marked as not verified, THE Verifier SHALL attach a removed reason describing why the Finding was excluded.
7. THE Verifier SHALL exclude non-verified Findings from the set of inputs available to the Rules_Engine.
8. THE Verifier SHALL normalize whitespace, case, and punctuation before comparing the quote to the Clause text.

### Requirement 5: Inference Rules Engine

**User Story:** As a user, I want the system to derive possible inferences from verified findings, so that I can see what collected data could reveal about me.

#### Acceptance Criteria

1. THE Rules_Engine SHALL load the 10 inference rules (R1–R10) defined in the rules configuration, each with inputs, an output label, and an explanation.
2. WHEN every input label of a rule is present in the set of verified Findings' signals, THE Rules_Engine SHALL fire that rule and produce an Inference.
3. WHEN one or more input labels of a rule are missing from the verified Findings, THE Rules_Engine SHALL skip that rule.
4. THE Rules_Engine SHALL produce each Inference with the rule id, the output label, the supporting finding ids, and the explanation from the rule definition.
5. THE Rules_Engine SHALL phrase every Inference explanation using the word `could` and SHALL omit the word `will` from all explanation text.
6. WHEN the same set of verified Findings is processed twice, THE Rules_Engine SHALL produce identical Inferences.
7. THE Gemini_Client SHALL tag every Finding with signals drawn from the same fixed vocabulary that the Rules_Engine uses as input labels.

### Requirement 6: Exposure Scoring

**User Story:** As a user, I want a severity-weighted exposure score, so that I can compare privacy risk across apps.

#### Acceptance Criteria

1. THE Scan_API SHALL compute an Exposure_Score in the range 0–100 from the verified Findings using a deterministic severity-weighted formula.
2. WHEN all verified Findings have severity 1, THE Exposure_Score SHALL be lower than when the same number of verified Findings all have severity 3.
3. WHEN no Findings are verified, THE Exposure_Score SHALL be 0.
4. WHEN all 12 profile fields are verified at severity 3, THE Exposure_Score SHALL not exceed 100.
5. WHEN the same set of verified Findings is scored twice, THE Scan_API SHALL produce identical Exposure_Scores.

### Requirement 7: Input Validation and Rate Limiting

**User Story:** As a developer, I want input size limits and per-IP rate limiting, so that the API is protected from abuse.

#### Acceptance Criteria

1. WHEN the `text` field exceeds 60,000 characters, THE Scan_API SHALL reject the request with HTTP 413 and a message indicating the character limit.
2. WHEN more than 10 scan requests are received from the same IP address within 60 seconds, THE Scan_API SHALL reject subsequent requests with HTTP 429.
3. WHEN a `url` field is present but does not parse as a valid `http` or `https` URL, THE Scan_API SHALL reject the request with HTTP 400.

### Requirement 8: Demo Cache Fallback

**User Story:** As a presenter, I want pre-scanned results served when Gemini is unavailable, so that the live demo does not fail.

#### Acceptance Criteria

1. THE Demo_Cache SHALL contain 8–10 pre-scanned real policy results stored as JSON files, each keyed by a SHA-256 hash of the original input text.
2. WHEN the Gemini_Client fails or times out for all chunks, THE Scan_API SHALL compute a SHA-256 hash of the input text and check the Demo_Cache for a match.
3. IF the input hash matches a Demo_Cache entry, THE Scan_API SHALL return the cached Scan_Result with a Warning indicating the cached fallback was used.
4. IF the input hash does not match any Demo_Cache entry and Gemini_Client has failed, THE Scan_API SHALL return an HTTP 503 with a message advising the user to try again or paste text directly.

### Requirement 9: URL Mode

**User Story:** As a user, I want to enter a policy URL instead of pasting text, so that I can scan policies without copy-pasting.

#### Acceptance Criteria

1. WHEN a POST request with a valid `url` field and no `text` field is received, THE Scan_API SHALL fetch the URL content server-side using the SSRF_Guard.
2. THE SSRF_Guard SHALL reject URLs whose scheme is other than `http` or `https`.
3. THE SSRF_Guard SHALL reject URLs whose resolved IP address falls in a private range (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) or a loopback address (127.0.0.0/8, ::1).
4. THE SSRF_Guard SHALL follow at most 3 HTTP redirects and SHALL reject any redirect to a disallowed origin.
5. WHEN the URL fetch exceeds 10 seconds, THE SSRF_Guard SHALL abort the fetch.
6. WHEN the fetched content exceeds 2 megabytes, THE SSRF_Guard SHALL abort the fetch.
7. WHEN the SSRF_Guard successfully fetches HTML content, THE Scan_API SHALL extract visible text from the HTML by removing script tags, style tags, and HTML markup.
8. IF the URL fetch fails for any reason, THE Scan_API SHALL return an HTTP 502 with a message advising the user to paste the policy text directly.

### Requirement 10: Security and Logging

**User Story:** As a developer, I want the backend to be stateless and logs to exclude document text, so that user privacy is protected.

#### Acceptance Criteria

1. THE Scan_API SHALL process each scan request in memory only, releasing all document text after the response is returned.
2. THE Scan_API SHALL log only scan metadata — timestamp, input character count, clause count, finding count, and warnings — and SHALL omit document text, finding quotes, and clause text from all log messages.
3. THE Gemini_Client SHALL read its API key from the `GEMINI_API_KEY` environment variable and SHALL keep the key server-side only.
4. THE Front_End SHALL keep stored Scan_Results in the browser only and SHALL keep the Exposure Ledger in localStorage without transmitting it to any server.

### Requirement 11: Front-End Integration

**User Story:** As a user, I want the front end to use real scan results, so that the analysis reflects actual policies instead of mock data.

#### Acceptance Criteria

1. WHEN the user clicks "Scan terms" with pasted text, THE Front_End SHALL send a POST request to `/api/scan` with the `text` field and render the returned Scan_Result.
2. WHEN the Scan_Result is received, THE Front_End SHALL compute the "X of Y findings verified" display from `stats.verified` and `stats.total`.
3. WHEN the Scan_Result is received, THE Front_End SHALL display the `exposureScore` returned by the Scan_API instead of a hardcoded value.
4. THE Front_End SHALL render each Finding's quote as the verbatim span returned by the Scan_API.
5. THE Front_End SHALL render Clauses using the IDs returned by the Scan_API.
6. THE Front_End SHALL render Inferences with their rule id, output label, and explanation from the Scan_API response.

### Requirement 12: Client-Side Exposure Ledger

**User Story:** As a user, I want my scan results stored locally across apps, so that I can see combined exposure without a database.

#### Acceptance Criteria

1. WHEN a Scan_Result is received, THE Front_End SHALL store the result in localStorage keyed by the source name.
2. THE Front_End SHALL merge all stored Scan_Results to display the Exposure Ledger table and combined inferences.
3. WHEN the user clears browser storage, THE Front_End SHALL remove all stored Scan_Results.
4. WHEN multiple Scan_Results share a verified field, THE Front_End SHALL display the combined set of apps that expose that field.

### Requirement 13: Evaluation Harness

**User Story:** As a developer, I want an eval harness with golden documents, so that I can measure extraction quality over time.

#### Acceptance Criteria

1. THE Eval_Harness SHALL accept 5 or more Golden_Documents, each with expected findings, and run the Scan_API against each.
2. WHEN the Eval_Harness completes, THE Eval_Harness SHALL report the verified rate (verified findings divided by total expected findings), the removed rate (removed findings divided by total extracted findings), and which rules fired for each Golden_Document.
3. THE Eval_Harness SHALL output a summary table suitable for manual review.

### Requirement 14: Streaming Progress

**User Story:** As a user, I want to see scan progress in real time, so that I know the scan is working during long policies.

#### Acceptance Criteria

1. WHERE the Front_End supports streaming, THE Scan_API SHALL emit chunk-completion events as chunks finish processing.
2. WHEN a chunk completes, THE Scan_API SHALL emit an event containing the chunk index and the number of findings extracted from that chunk.

### Requirement 15: Contradiction Caveats

**User Story:** As a user, I want caveats attached to findings when limiting clauses exist, so that I get a balanced view of the policy.

#### Acceptance Criteria

1. WHEN a second pass is enabled, THE Gemini_Client SHALL request, for each verified Finding, any clause that contradicts or limits the Finding.
2. WHEN a limiting clause is found, THE Gemini_Client SHALL attach it as a caveat to the Finding with the clauseId and quote.
3. WHEN no limiting clause is found, THE Gemini_Client SHALL leave the Finding's caveat field empty.
