import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { GeminiExtractor } from '@/lib/extract'
import { normalizedTextHash, writeCachedScan } from '@/lib/cache'
import { scanText } from '@/lib/scan'

async function main() {
  const file = process.argv[2]
  if (!file) throw new Error('Usage: pnpm prescan <file.txt>')

  const text = await readFile(file, 'utf8')
  const extractor = new GeminiExtractor()
  const result = await scanText(text, { name: basename(file), type: 'text' }, extractor)
  result.warnings.push(...extractor.warnings)
  await writeCachedScan(normalizedTextHash(text), result)
  console.log(`Saved scan result to data/cache/${normalizedTextHash(text)}.json`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Prescan failed')
  process.exitCode = 1
})
