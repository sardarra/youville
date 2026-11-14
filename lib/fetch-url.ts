import { lookup } from 'node:dns/promises'
import type { LookupAddress } from 'node:dns'
import { isIP } from 'node:net'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { IncomingMessage, RequestOptions } from 'node:http'
import * as cheerio from 'cheerio'

const MAX_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 3
const TIMEOUT_MS = 10_000
const PASTE_ERROR = 'This policy page could not be fetched (it may require JavaScript). Please paste the policy text instead.'

export class PolicyFetchError extends Error {
  constructor(message = PASTE_ERROR) {
    super(message)
    this.name = 'PolicyFetchError'
  }
}

function ipv6ToSegments(address: string): number[] | null {
  let value = address.toLowerCase().split('%')[0]
  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':')
    const ipv4 = value.slice(lastColon + 1).split('.').map(Number)
    if (ipv4.length !== 4 || ipv4.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null
    value = `${value.slice(0, lastColon)}:${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`
  }

  const halves = value.split('::')
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null
  const segments = [...left, ...Array(missing).fill('0'), ...right]
  if (segments.length !== 8 || segments.some((segment) => !/^[0-9a-f]{1,4}$/.test(segment))) return null
  return segments.map((segment) => Number.parseInt(segment, 16))
}

export function isBlockedAddress(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, '').split('%')[0]
  const family = isIP(normalized)
  if (family === 4) {
    const octets = normalized.split('.').map(Number)
    const [a, b, c] = octets
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
  }

  if (family !== 6) return true
  const segments = ipv6ToSegments(normalized)
  if (!segments) return true
  const isZero = segments.every((segment) => segment === 0)
  const isLoopback = segments.slice(0, 7).every((segment) => segment === 0) && segments[7] === 1
  const isMappedIpv4 = segments.slice(0, 5).every((segment) => segment === 0) && segments[5] === 0xffff
  if (isMappedIpv4) {
    const ipv4 = [segments[6] >> 8, segments[6] & 255, segments[7] >> 8, segments[7] & 255].join('.')
    return isBlockedAddress(ipv4)
  }
  const first = segments[0]
  const second = segments[1]
  return isZero || isLoopback ||
    (first >= 0xfc00 && first <= 0xfdff) ||
    (first >= 0xfe80 && first <= 0xfebf) ||
    (first >= 0xff00) ||
    (first === 0x2001 && second === 0x0db8) ||
    first < 0x2000 || first > 0x3fff
}

async function resolvePublicAddresses(hostname: string, timeoutMs: number): Promise<LookupAddress[]> {
  const bareHostname = hostname.replace(/^\[|\]$/g, '')
  const family = isIP(bareHostname)
  const addresses = family
    ? [{ address: bareHostname, family: family as 4 | 6 }]
    : await new Promise<LookupAddress[]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new PolicyFetchError()), timeoutMs)
      lookup(bareHostname, { all: true, verbatim: true }).then(
        (result) => {
          clearTimeout(timer)
          resolve(result)
        },
        () => {
          clearTimeout(timer)
          reject(new PolicyFetchError())
        },
      )
    })
  if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) throw new PolicyFetchError()
  return addresses
}

function readResponse(url: URL, addresses: LookupAddress[], timeoutMs: number): Promise<{ response: IncomingMessage; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? httpsRequest : httpRequest
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    const finishError = (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error instanceof PolicyFetchError ? error : new PolicyFetchError())
    }

    const pinnedLookup: NonNullable<RequestOptions['lookup']> = (_hostname, options, callback) => {
      const selected = addresses[0]
      if (typeof options === 'object' && options.all) {
        callback(null, addresses)
      } else {
        callback(null, selected.address, selected.family)
      }
    }

    const request = transport(url, { lookup: pinnedLookup, headers: { 'user-agent': 'TandC-Xray/1.0', 'accept-encoding': 'identity' } }, (response) => {
      const chunks: Buffer[] = []
      let total = 0
      response.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        total += buffer.length
        if (total > MAX_BYTES) {
          request.destroy()
          finishError(new PolicyFetchError())
          return
        }
        chunks.push(buffer)
      })
      response.on('end', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ response, body: Buffer.concat(chunks) })
      })
      response.on('error', finishError)
    })

    timer = setTimeout(() => request.destroy(new Error('Request timed out')), timeoutMs)
    request.on('error', finishError)
    request.end()
  })
}

export function htmlToText(html: string): string {
  const $ = cheerio.load(html)
  $('script, style, nav, footer, header, noscript, svg, iframe').remove()
  const blocks = $('h1, h2, h3, h4, h5, h6, p, li')
    .map((_, element) => $(element).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter(Boolean)
  return (blocks.length ? blocks.join('\n') : $('body').text()).replace(/\n{2,}/g, '\n').trim()
}

export async function fetchPolicyUrl(input: string): Promise<{ text: string; url: string; name: string }> {
  let currentUrl: URL
  try {
    currentUrl = new URL(input)
  } catch {
    throw new PolicyFetchError()
  }

  const deadline = Date.now() + TIMEOUT_MS
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    if (!['http:', 'https:'].includes(currentUrl.protocol) || currentUrl.username || currentUrl.password) throw new PolicyFetchError()
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new PolicyFetchError()
    const addresses = await resolvePublicAddresses(currentUrl.hostname, remaining)
    const afterDns = deadline - Date.now()
    if (afterDns <= 0) throw new PolicyFetchError()

    const { response, body } = await readResponse(currentUrl, addresses, afterDns)
    if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
      const location = response.headers.location
      if (!location || redirect === MAX_REDIRECTS) throw new PolicyFetchError()
      try {
        currentUrl = new URL(location, currentUrl)
      } catch {
        throw new PolicyFetchError()
      }
      continue
    }
    if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) throw new PolicyFetchError()

    const contentType = response.headers['content-type']?.toLowerCase() ?? ''
    const raw = body.toString('utf8')
    const text = contentType.includes('text/html') || /<html[\s>]/i.test(raw) ? htmlToText(raw) : raw.trim()
    if (!text || /enable javascript|requires javascript|javascript is required/i.test(text.slice(0, 1000))) throw new PolicyFetchError()
    return { text, url: currentUrl.toString(), name: currentUrl.hostname }
  }

  throw new PolicyFetchError()
}
