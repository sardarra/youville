import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { ScanResponse } from '@/lib/scan'

export function normalizedTextHash(text: string): string {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim()
  return createHash('sha256').update(normalized).digest('hex')
}

function cachePath(hash: string): string {
  return join(process.cwd(), 'data', 'cache', `${hash}.json`)
}

export async function readCachedScan(hash: string): Promise<ScanResponse | null> {
  try {
    return JSON.parse(await readFile(cachePath(hash), 'utf8')) as ScanResponse
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

export async function writeCachedScan(hash: string, result: ScanResponse): Promise<void> {
  const directory = join(process.cwd(), 'data', 'cache')
  await mkdir(directory, { recursive: true })
  await writeFile(cachePath(hash), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
}
