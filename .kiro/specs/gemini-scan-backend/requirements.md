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

1. WHEN a POST request with a JSON body containing a `text` field whose trimmed length is between 1 and 100,000 characters is received, THE Scan_API SHALL return a Scan_Result containing clauses, findings, inferences, stats, exposureScore, and warnings, where clauses, findings, inferences, and warnings are arrays that may be empty.
2. IF a POST request provides a `text` field that is missing, empty, or whitespace-only with no `url` field, or a `text` field exceeding 100,000 characters, THEN THE Scan_API SHALL return an HTTP 400 status with an error message indicating the rejected input, without performing a scan.
3. WHEN a scan completes successfully, THE Scan_API SHALL return source metadata containing the source name (or hostname for URL mode), the total character count of the submitted text, the clause count, and a scan timestamp formatted as an ISO 8601 UTC string.
4. THE Scan_API SHALL process each scan request in memory only, releasing all document text after the response is returned.
5. WHEN a scan completes successfully, THE Scan_API SHALL return stats containing total, verified, and removed finding counts, where total equals the number of findings, verified equals the number of findings marked as verified, and removed equals the number of findings not marked as verified.
6. THE Scan_API SHALL return findings, clauses, and inferences in a JSON structure matching the existing Front_End TypeScript types, where findings match the Finding type, clauses match the Clause type, and inferences match the existing InferenceRule type.
7. WHEN a scan completes successfully, THE Scan_API SHALL return an exposureScore that is an integer from 0 to 100 equal to the number of verified findings multiplied by 8, capped at 100.
8. IF a scan produces fewer than 2 clauses, THEN THE Scan_API SHALL include at least one warning in the warnings array indicating that the policy may be too short to analyze.
9. WHEN a scan completes successfully, THE Scan_API SHALL return inferences consisting of each inference rule whose inputs are all present among the fields of the verified findings.

### Requirement 2: Policy Text Segmentation

**User Story:** As a developer, I want policy text split into stable numbered clauses, so that findings can reference specific source locations deterministically.

#### Acceptance Criteria

1. WHEN raw policy text is provided to the Segmenter, THE Segmenter SHALL split the text into Clauses only at deterministic sentence and paragraph boundaries, where a sentence boundary is a period, question mark, or exclamation mark followed by whitespace, a paragraph boundary is one or more consecutive line-break characters, and the boundary characters and any following whitespace are assigned to the preceding Clause.
2. THE Segmenter SHALL assign each Clause a stable ID in the format `segment-<index>` where index is a zero-based sequential integer.
3. WHEN the same policy text is segmented twice, THE Segmenter SHALL produce identical Clause IDs and identical Clause text for both runs.
4. THE Segmenter SHALL preserve the original text of each Clause verbatim, including internal whitespace, so that the Verifier can match quotes exactly.
5. IF policy text contains fewer than 3 characters, THEN the Segmenter SHALL produce a single Clause containing the entire text.
6. IF no policy text is provided, THEN the Segmenter SHALL produce zero Clauses and indicate that no policy text was provided.

### Requirement 3: Gemini Extraction

**User Story:** As a developer, I want Gemini to extract data-collection findings from policy clauses, so that the analysis reflects the actual policy text rather than mock data.

#### Acceptance Criteria

1. WHEN a chunk of Clauses is sent to the Gemini_Client, THE Gemini_Client SHALL call the Gemini API using the `@google/genai` SDK with structured output configured via a JSON schema and MIME type `application/json`.
2. THE Gemini_Client SHALL use the model identifier from the `GEMINI_MODEL` environment variable for Gemini API calls.
3. WHEN Gemini_Client returns a response, THE Gemini_Client SHALL validate the response against a Zod schema and return parsed Findings.
4. IF the Zod validation fails on the first attempt, THE Gemini_Client SHALL retry the call once with the same chunk.
5. IF the Zod validation fails on the retry, THE Gemini_Client SHALL drop that chunk's findings and add a Warning to the Scan_Result.
6. THE Gemini_Client SHALL split Clauses into chunks of 8–12 clauses per call and process chunks with a concurrency limit of 3.
7. WHEN a Gemini API call exceeds the per-call timeout of 10 seconds, THE Gemini_Client SHALL abort the call, drop that chunk's findings, and add a Warning.
8. THE Gemini_Client SHALL send policy text as delimited untrusted input with explicit instructions to ignore any commands embedded in the text.
9. THE Gemini_Client SHALL extract only data-collection findings, returning category, field, summary, severity, signals, clauseId, and verbatim quote for each Finding.
10. Inference SHALL be performed exclusively by the Rules_Engine; THE Gemini_Client SHALL extract only data-collection findings and SHALL produce zero Inferences.
11. WHEN a policy of 3,000–8,000 characters is processed, IF the Gemini API responds within 5 seconds per call, THEN THE Scan_API SHALL complete within 15 seconds.
12. THE Gemini_Client SHALL expose a swappable interface so that unit tests and the Demo_Cache fallback can substitute an alternative implementation without changing the Scan_API code.
13. IF the `GEMINI_MODEL` environment variable is unset, THEN THE Gemini_Client SHALL use a default Flash-tier model identifier.
14. IF a Gemini API call fails with a non-timeout error, THEN THE Gemini_Client SHALL drop that chunk's findings and add a Warning to the Scan_Result.

### Requirement 4: Finding Verification

**User Story:** As a user, I want every finding verified against the source text, so that I can trust the analysis is grounded in what the policy actually says.

#### Acceptance Criteria

1. WHEN a Finding's quote is an exact substring of the Finding's claimed Clause text after normalization, THE Verifier SHALL mark the Finding as verified.
2. WHEN a Finding's quote does not match the claimed Clause by exact substring but matches one or more other Clauses by exact substring, THE Verifier SHALL correct the Finding's clauseId to the matching Clause appearing earliest in document order and mark the Finding as verified.
3. WHEN a Finding's quote matches no Clause by exact substring, THE Verifier SHALL attempt a bounded fuzzy match with a similarity threshold of 0.85 against each Clause and identify the best-matching Clause as the Clause with the highest similarity score, breaking ties in favor of the claimed Clause and then by earliest document order.
4. IF the best-matching Clause identified by the fuzzy match is the claimed Clause and has a similarity score at or above 0.85, THEN THE Verifier SHALL mark the Finding as verified.
5. IF the best-matching Clause identified by the fuzzy match is a Clause other than the claimed Clause and has a similarity score at or above 0.85, THEN THE Verifier SHALL correct the clauseId to the best-matching Clause and mark the Finding as verified.
6. IF the fuzzy match yields no Clause with a similarity score at or above 0.85, THEN THE Verifier SHALL mark the Finding as not verified with a removed reason of `quote_not_found`.
7. WHEN a Finding is marked as not verified, THE Verifier SHALL attach a removed reason describing why the Finding was excluded.
8. THE Verifier SHALL exclude non-verified Findings from the set of inputs available to the Rules_Engine.
9. THE Verifier SHALL normalize whitespace, case, and punctuation before comparing the quote to the Clause text.

### Requirement 5: Inference Rules Engine

**User Story:** As a user, I want the system to derive possible inferences from verified findings, so that I can see what collected data could reveal about me.

#### Acceptance Criteria

1. THE Rules_Engine SHALL load the 10 inference rules (R1–R10) defined in the rules configuration, each with inputs, an output label, and an explanation.
2. WHEN every input label of a rule is present in the set of verified Findings' signals, THE Rules_Engine SHALL fire that rule and produce an Inference. For this purpose, an input label that lists alternatives joined by 'or' counts as present if at least one of those alternatives is present among the verified Findings' signals.
3. WHEN one or more input labels of a rule are missing from the verified Findings, THE Rules_Engine SHALL skip that rule.
4. THE Rules_Engine SHALL produce each Inference with the rule id, the output label, the supporting finding ids, and the explanation from the rule definition. The supporting finding ids are the ids of the verified Findings whose signals match that rule's input labels.
5. THE Rules_Engine SHALL phrase every Inference explanation using the word `could` and SHALL omit the word `will` from all explanation text.
6. WHEN the same set of verified Findings is processed twice, THE Rules_Engine SHALL produce identical Inferences. Identical means the same number of Inferences, each with matching rule id, output label, supporting finding ids, and explanation.
7. THE Gemini_Client SHALL tag every Finding with signals drawn only from the fixed vocabulary consisting of all input labels used by the loaded inference rules.

### Requirement 6: Exposure Scoring

**User Story:** As a user, I want a severity-weighted exposure score, so that I can compare privacy risk across apps.

#### Acceptance Criteria

1. THE Scan_API SHALL compute an Exposure_Score as an integer in the range 0–100 from the verified Findings using a deterministic severity-weighted formula, where each Finding's severity is an integer from 1 (lowest) to 3 (highest).
2. WHEN one or more verified Findings all have severity 1, THE Exposure_Score SHALL be lower than when the same number of verified Findings all have severity 3.
3. WHEN no Findings are verified, THE Exposure_Score SHALL be 0.
4. WHEN all 12 profile fields are verified at severity 3, THE Exposure_Score SHALL not exceed 100.
5. WHEN the same set of verified Findings is scored twice, THE Scan_API SHALL produce identical Exposure_Scores.

### Requirement 7: Input Validation and Rate Limiting

**User Story:** As a developer, I want input size limits and per-IP rate limiting, so that the API is protected from abuse.

#### Acceptance Criteria

1. WHEN the `text` field exceeds 60,000 characters, THE Scan_API SHALL reject the request with HTTP 413 and a message indicating the character limit.
2. WHEN more than 10 scan requests are received from the same IP address within any 60-second window, THE Scan_API SHALL reject subsequent requests from that IP address with HTTP 429.
3. WHEN a `url` field is present but does not parse as a valid `http` or `https` URL with a non-empty host, THE Scan_API SHALL reject the request with HTTP 400.
4. WHILE the number of scan requests received from an IP address within the preceding 60 seconds is 10 or fewer, THE Scan_API SHALL accept scan requests from that IP address.

### Requirement 8: Demo Cache Fallback

**User Story:** As a presenter, I want pre-scanned results served when Gemini is unavailable, so that the live demo does not fail.

#### Acceptance Criteria

1. THE Demo_Cache SHALL contain 8–10 pre-scanned real policy results stored as JSON files, each a valid Scan_Result keyed by a SHA-256 hash of the original input text used to produce it.
2. WHEN the Gemini_Client fails or times out for all chunks, THE Scan_API SHALL compute a SHA-256 hash of the input text and look up that hash as a key in the Demo_Cache.
3. IF the computed hash matches a Demo_Cache key, THE Scan_API SHALL return the cached Scan_Result unchanged except for a Warning indicating the cached fallback was used.
4. IF the computed hash matches no Demo_Cache key and all chunks have failed or timed out, THE Scan_API SHALL return an HTTP 503 with a message advising the user to try again or paste text directly.

### Requirement 9: URL Mode

**User Story:** As a user, I want to enter a policy URL instead of pasting text, so that I can scan policies without copy-pasting.

#### Acceptance Criteria

1. WHEN a POST request with a valid `url` field and no `text` field is received, THE Scan_API SHALL fetch the URL content server-side using the SSRF_Guard.
2. IF the URL scheme is other than `http` or `https`, THEN THE SSRF_Guard SHALL abort the fetch.
3. IF the resolved IP address of the URL falls in a private range (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) or a loopback address (127.0.0.0/8, ::1), THEN THE SSRF_Guard SHALL abort the fetch.
4. IF the number of HTTP redirects exceeds 3, or an HTTP redirect target's scheme is other than `http` or `https`, or a redirect target's resolved IP address falls in a private range (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) or a loopback address (127.0.0.0/8, ::1), THEN THE SSRF_Guard SHALL abort the fetch.
5. WHEN the URL fetch exceeds 10 seconds, THE SSRF_Guard SHALL abort the fetch.
6. WHEN the fetched content exceeds 2 megabytes, THE SSRF_Guard SHALL abort the fetch.
7. WHEN the SSRF_Guard successfully fetches HTML content, THE Scan_API SHALL extract visible text from the HTML by removing script tags, style tags, and HTML markup.
8. IF the URL fetch fails or is aborted for any reason, or the extracted text is empty, THEN THE Scan_API SHALL return an HTTP 502 with a message advising the user to paste the policy text directly.
9. IF the fetched content type is not HTML, THEN THE SSRF_Guard SHALL abort the fetch.

### Requirement 10: Security and Logging

**User Story:** As a developer, I want the backend to be stateless and logs to exclude document text, so that user privacy is protected.

#### Acceptance Criteria

1. THE Scan_API SHALL process each scan request entirely in memory and SHALL persist no submitted document text, Clause text, or intermediate Finding data to disk, a database, a cache, or a session store.
2. WHEN the response for a scan request has been returned, THE Scan_API SHALL retain no document text, Clause text, or intermediate data from that request beyond the request's lifetime, such that none of it is accessible to a subsequent request.
3. THE Scan_API SHALL log only scan metadata, consisting of timestamp, input character count, clause count, finding count, and warnings, and SHALL omit submitted document text, Finding quotes, Clause text, and the Gemini API key from all log messages at every log level.
4. THE Gemini_Client SHALL read its API key from the `GEMINI_API_KEY` environment variable and SHALL never transmit the key to the Front_End or include it in any client-rendered data.
5. THE Front_End SHALL keep stored Scan_Results and the Ledger in the browser only, SHALL persist the Ledger in localStorage, and SHALL not transmit stored Scan_Results or Ledger data to any server.

### Requirement 11: Front-End Integration

**User Story:** As a user, I want the front end to use real scan results, so that the analysis reflects actual policies instead of mock data.

#### Acceptance Criteria

1. WHEN the user clicks "Scan terms" with non-empty pasted text, THE Front_End SHALL send a POST request to `/api/scan` with the `text` field and render the clauses, findings, inferences, exposureScore, and stats returned in the Scan_Result.
2. WHEN the Scan_Result is received, THE Front_End SHALL compute the "X of Y findings verified" display from `stats.verified` and `stats.total`.
3. WHEN the Scan_Result is received, THE Front_End SHALL display the `exposureScore` returned by the Scan_API instead of a hardcoded value.
4. WHEN the Front_End renders Findings from a Scan_Result, THE Front_End SHALL render each Finding's quote as the verbatim text returned by the Scan_API.
5. WHEN the Front_End renders Clauses from a Scan_Result, THE Front_End SHALL display each Clause using the ID returned by the Scan_API rather than a locally generated ID.
6. WHEN the Front_End renders Inferences from a Scan_Result, THE Front_End SHALL display each Inference with its rule id, output label, and explanation from the Scan_API response.
7. IF the POST request to `/api/scan` fails or does not return a response within 30 seconds, THEN THE Front_End SHALL display an error message indicating the scan could not be completed and SHALL retain the user's pasted text for retry.

### Requirement 12: Client-Side Exposure Ledger

**User Story:** As a user, I want my scan results stored locally across apps, so that I can see combined exposure without a database.

#### Acceptance Criteria

1. WHEN a Scan_Result is received, THE Front_End SHALL store the result in localStorage keyed by the source name, overwriting any previously stored Scan_Result with the same source name.
2. WHEN the user opens the Exposure Ledger, THE Front_End SHALL merge all stored Scan_Results into a combined set of verified Findings to display the Exposure Ledger table and the inferences derived from that combined set.
3. WHEN the user clears the Exposure Ledger, THE Front_End SHALL remove all stored Scan_Results from localStorage.
4. WHEN two or more stored Scan_Results each contain a verified Finding with the same field value, THE Front_End SHALL display the source names of all Scan_Results containing that verified field in the Exposure Ledger table.
5. IF storing a Scan_Result in localStorage fails because the storage quota is exceeded, THE Front_End SHALL remove the oldest stored Scan_Result and retry the store operation.

### Requirement 13: Evaluation Harness

**User Story:** As a developer, I want an eval harness with golden documents, so that I can measure extraction quality over time.

#### Acceptance Criteria

1. THE Eval_Harness SHALL accept 5 or more Golden_Documents, each providing its policy text and expected findings, and SHALL run the Scan_API against each Golden_Document's policy text.
2. WHEN the Eval_Harness completes processing all Golden_Documents, THE Eval_Harness SHALL report, for each successfully processed Golden_Document, the verified rate as a percentage in the range 0–100 equal to the Scan_Result's verified count divided by the Golden_Document's expected finding count, the removed rate as a percentage in the range 0–100 equal to the Scan_Result's removed count divided by the Scan_Result's total count, and the set of rule ids of the Inferences produced for that Golden_Document.
3. THE Eval_Harness SHALL output a summary table containing one row per Golden_Document and one aggregate row summarizing the successfully processed documents, where each per-document row shows the verified rate, the removed rate, and the rules fired for that Golden_Document.
4. IF a Scan_API call for a Golden_Document returns an error or fails to produce a Scan_Result, THEN THE Eval_Harness SHALL mark that Golden_Document as failed in the summary table and SHALL exclude it from the verified rate and removed rate calculations.
5. IF the expected finding count or the Scan_Result's total count for a Golden_Document is zero, THEN THE Eval_Harness SHALL report the corresponding rate as 0.

### Requirement 14: Streaming Progress

**User Story:** As a user, I want to see scan progress in real time, so that I know the scan is working during long policies.

#### Acceptance Criteria

1. WHERE the Front_End supports streaming, WHEN a scan is initiated, THE Scan_API SHALL open a streaming response and emit an initial event containing the total number of chunks to be processed.
2. WHEN a chunk completes processing, THE Scan_API SHALL emit an event containing the chunk index and the number of findings extracted from that chunk.
3. WHEN all chunks have finished processing, THE Scan_API SHALL emit a final event indicating the scan is complete and close the streaming response.
4. IF a chunk fails to process during a streaming response, THEN THE Scan_API SHALL emit an event containing the chunk index with a finding count of 0 and continue processing the remaining chunks.

### Requirement 15: Contradiction Caveats

**User Story:** As a user, I want caveats attached to findings when limiting clauses exist, so that I get a balanced view of the policy.

#### Acceptance Criteria

1. WHERE the second pass is enabled, THE Gemini_Client SHALL request, for each verified Finding produced during a scan, any Clause that contradicts or limits that Finding.
2. WHEN one or more limiting Clauses are found for a Finding, THE Gemini_Client SHALL attach a caveat to the Finding containing the clauseId and verbatim quote of the limiting Clause with the lowest clauseId.
3. WHEN no limiting Clause is found for a Finding, THE Gemini_Client SHALL leave that Finding's caveat field empty.
4. IF the second pass request for a Finding fails due to timeout or response validation failure, THEN THE Gemini_Client SHALL leave that Finding's caveat field empty and add a Warning to the Scan_Result.
