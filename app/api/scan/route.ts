import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { GeminiExtractor } from '@/lib/extract'
import { readCachedScan, normalizedTextHash } from '@/lib/cache'
import { fetchPolicyUrl, PolicyFetchError } from '@/lib/fetch-url'
import { scanText, type ScanResponse } from '@/lib/scan'

export const runtime = 'nodejs'

const requestSchema = z.object({
  text: z.string().optional(),
  url: z.string().url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)).optional(),
}).strict().refine((value) => Number(Boolean(value.text?.trim())) + Number(Boolean(value.url)) === 1, {
  message: 'Provide exactly one of text or url.',
})

const requestsByIp = new Map<string, number[]>()
const REQUEST_LIMIT = 10
const WINDOW_MS = 60_000
const MAX_BODY_BYTES = 256 * 1024

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

async function readBoundedJson(request: NextRequest): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (declaredLength > MAX_BODY_BYTES) throw new RangeError('Body is too large')
  if (!request.body) throw new SyntaxError('Request body is missing')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      await reader.cancel()
      throw new RangeError('Body is too large') 
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (requestsByIp.get(ip) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS)
  if (recent.length >= REQUEST_LIMIT) {
    requestsByIp.set(ip, recent)
    return true
  }
  recent.push(now)
  requestsByIp.set(ip, recent)
  if (requestsByIp.size > 5000) {
    for (const [key, timestamps] of requestsByIp) {
      if (!timestamps.some((timestamp) => now - timestamp < WINDOW_MS)) requestsByIp.delete(key)
    }
    while (requestsByIp.size > 5000) {
      const oldest = requestsByIp.keys().next().value
      if (oldest === undefined) break
      requestsByIp.delete(oldest)
    }
  }
  return false
}

function requestIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
}

async function fallbackResult(hash: string, source: ScanResponse['source']): Promise<ScanResponse | null> {
  const cached = await readCachedScan(hash)
  return cached ? { ...cached, source, warnings: [...(cached.warnings ?? []), 'Showing a saved result'] } : null
}

export async function POST(request: NextRequest) {
  if (isRateLimited(requestIp(request))) return errorResponse(429, 'RATE_LIMITED', 'Too many scans. Please try again in a minute.')

  let body: unknown
  try {
    body = await readBoundedJson(request)
  } catch (error) {
    if (error instanceof RangeError) return errorResponse(413, 'BODY_TOO_LARGE', 'Request body is too large.')
    return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON.')
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) return errorResponse(400, 'INVALID_REQUEST', 'Provide exactly one of text or a valid policy URL.')
  if (parsed.data.text !== undefined && parsed.data.text.length > 60_000) {
    return errorResponse(413, 'TEXT_TOO_LARGE', 'Policy text must be 60,000 characters or fewer.')
  }

  let text: string
  let source: ScanResponse['source']
  try {
    if (parsed.data.url) {
      const fetched = await fetchPolicyUrl(parsed.data.url)
      text = fetched.text
      source = { name: fetched.name, type: 'url', url: fetched.url }
    } else {
      text = parsed.data.text!.trim()
      if (!text) return errorResponse(400, 'EMPTY_TEXT', 'Paste policy text to scan.')
      source = { name: 'Pasted policy', type: 'text' }
    }
  } catch (error) {
    if (error instanceof PolicyFetchError) return errorResponse(502, 'FETCH_FAILED', error.message)
    return errorResponse(502, 'FETCH_FAILED', 'The policy could not be fetched. Please paste the policy text instead.')
  }
  if (text.length > 60_000) return errorResponse(413, 'TEXT_TOO_LARGE', 'Policy text must be 60,000 characters or fewer.')

  const hash = normalizedTextHash(text)
  let extractor: GeminiExtractor
  try {
    extractor = new GeminiExtractor()
  } catch {
    try {
      const cached = await fallbackResult(hash, source)
      if (cached) return NextResponse.json(cached)
    } catch {
      return errorResponse(500, 'CACHE_READ_FAILED', 'The saved scan result could not be read.')
    }
    return errorResponse(503, 'EXTRACTOR_UNAVAILABLE', 'Scanning is temporarily unavailable. Please try again later.')
  }

  try {
    const result = await scanText(text, source, extractor)
    result.warnings.push(...extractor.warnings)
    if (extractor.warnings.length) {
      const cached = await fallbackResult(hash, source)
      if (cached) return NextResponse.json(cached)
    }
    const totalChunks = Math.ceil(result.clauses.length / 10)
    if (totalChunks > 0 && extractor.warnings.length >= totalChunks) {
      return errorResponse(502, 'EXTRACTION_UNAVAILABLE', `The policy could not be analyzed. ${extractor.warnings[0]}`)
    }
    return NextResponse.json(result)
  } catch {
    try {
      const cached = await fallbackResult(hash, source)
      if (cached) return NextResponse.json(cached)
    } catch {
      return errorResponse(500, 'CACHE_READ_FAILED', 'The saved scan result could not be read.')
    }
    return errorResponse(502, 'SCAN_FAILED', 'The policy could not be analyzed. Please try again or paste the text.')
  }
}
