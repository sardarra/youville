import { beforeEach, describe, expect, it, vi } from 'vitest'

const { create } = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    interactions = { create }
  },
}))

import { GeminiExtractor } from '@/lib/extract'

describe('GeminiExtractor', () => {
  beforeEach(() => {
    create.mockReset()
    vi.stubEnv('GEMINI_API_KEY', 'test-key')
    vi.stubEnv('GEMINI_MODEL', 'test-model')
  })

  it('retries temporary provider failures once', async () => {
    create
      .mockRejectedValueOnce(Object.assign(new Error('Unavailable'), { status: 503 }))
      .mockResolvedValueOnce({ output_text: '{"findings":[]}' })

    const extractor = new GeminiExtractor()
    const findings = await extractor.extract([{ id: '1.1', text: 'We collect email.' }])

    expect(findings).toEqual([])
    expect(create).toHaveBeenCalledTimes(2)
    expect(extractor.warnings).toEqual([])
  })

  it('reports the provider status when a chunk still fails', async () => {
    create
      .mockRejectedValueOnce(Object.assign(new Error('Unavailable'), { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error('Unavailable'), { status: 503 }))

    const extractor = new GeminiExtractor()
    await extractor.extract([{ id: '1.1', text: 'We collect email.' }])

    expect(extractor.warnings).toEqual([
      'Skipped clause chunk 1: Gemini is temporarily unavailable (HTTP 503).',
    ])
  })
})
