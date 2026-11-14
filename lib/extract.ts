import { randomUUID } from 'node:crypto'
import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { FIELDS, SIGNALS, type FieldLabel, type Signal } from '@/lib/taxonomy'
import type { Clause } from '@/lib/segment'
import { EXTRACTION_SYSTEM_PROMPT } from '@/lib/prompts'

export type FindingStage = 'Data collected' | 'Rights you waive' | 'Who it’s shared with'

export interface RawFinding {
  clauseId: string
  field: FieldLabel | null
  stage: FindingStage
  category: string
  summary: string
  severity: 1 | 2 | 3
  signals: Signal[]
  quote: string
}

export interface Extractor {
  extract(clauses: Clause[]): Promise<RawFinding[]>
}

const findingSchema = z.object({
  clauseId: z.string(),
  field: z.enum(FIELDS.map((field) => field.label) as [FieldLabel, ...FieldLabel[]]).nullable(),
  stage: z.enum(['Data collected', 'Rights you waive', 'Who it’s shared with']),
  category: z.string().min(1),
  summary: z.string().min(1).refine((value) => value.trim().split(/\s+/).length < 25, 'Summary must be under 25 words'),
  severity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  signals: z.array(z.enum([...SIGNALS] as [Signal, ...Signal[]])),
  quote: z.string().min(1).max(299),
}).superRefine((finding, context) => {
  if (finding.stage !== 'Data collected' && finding.field !== null) {
    context.addIssue({ code: 'custom', message: 'Sharing and rights findings must use a null field.' })
  }
})

const responseSchema = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          clauseId: { type: 'string' },
          field: { anyOf: [{ type: 'string', enum: FIELDS.map((field) => field.label) }, { type: 'null' }] },
          stage: { type: 'string', enum: ['Data collected', 'Rights you waive', 'Who it’s shared with'] },
          category: { type: 'string' },
          summary: { type: 'string' },
          severity: { type: 'integer', enum: [1, 2, 3] },
          signals: { type: 'array', items: { type: 'string', enum: [...SIGNALS] } },
          quote: { type: 'string' },
        },
        required: ['clauseId', 'field', 'stage', 'category', 'summary', 'severity', 'signals', 'quote'],
      },
    },
  },
  required: ['findings'],
}

const responseValidator = z.object({ findings: z.array(findingSchema) })

export class GeminiExtractor implements Extractor {
  readonly warnings: string[] = []
  private readonly client: GoogleGenAI
  private readonly model: string

  constructor(apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL) {
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')
    if (!model) throw new Error('GEMINI_MODEL is not configured')
    this.client = new GoogleGenAI({ apiKey })
    this.model = model
  }

  async extract(clauses: Clause[]): Promise<RawFinding[]> {
    this.warnings.length = 0
    const chunks = Array.from({ length: Math.ceil(clauses.length / 10) }, (_, index) => clauses.slice(index * 10, index * 10 + 10))
    const findings: RawFinding[] = []
    let nextChunk = 0

    const worker = async () => {
      while (nextChunk < chunks.length) {
        const chunkIndex = nextChunk++
        const result = await this.extractChunk(chunks[chunkIndex])
        if (result) findings.push(...result)
        else this.warnings.push(`Skipped clause chunk ${chunkIndex + 1} after extraction failed.`)
      }
    }

    await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, worker))
    return findings
  }

  private async extractChunk(clauses: Clause[]): Promise<RawFinding[] | null> {
    const clauseText = clauses.map((clause) => `[CLAUSE ${clause.id}]\n${clause.text}`).join('\n\n')
    const delimiter = `POLICY_DOCUMENT_${randomUUID()}`
    const input = `Extract findings from only the document text between the delimiters ${delimiter}_BEGIN and ${delimiter}_END. Return an empty findings array if none apply.\n\n${delimiter}_BEGIN\n${clauseText}\n${delimiter}_END`

    for (let attempt = 0; attempt < 2; attempt++) {
      let response
      try {
        response = await this.client.interactions.create({
          model: this.model,
          system_instruction: EXTRACTION_SYSTEM_PROMPT,
          input,
          response_format: { type: 'text', mime_type: 'application/json', schema: responseSchema },
        }, { timeout_ms: 20_000, retries: { strategy: 'none' } })
      } catch {
        return null
      }

      try {
        const parsed = responseValidator.parse(JSON.parse(response.output_text ?? ''))
        return parsed.findings
      } catch {
        if (attempt === 1) return null
      }
    }
    return null
  }
}

export class MockExtractor implements Extractor {
  constructor(private readonly canned: RawFinding[] = []) {}

  async extract(): Promise<RawFinding[]> {
    return this.canned
  }
}
