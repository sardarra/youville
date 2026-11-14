import { describe, expect, it } from 'vitest'
import { segment } from '@/lib/segment'

describe('segment', () => {
  it('starts numbered sections and numbers their paragraphs', () => {
    const clauses = segment([
      '1. Information we collect',
      'We collect your name, email address, and phone number.',
      'Your device identifiers are also collected.',
      '2. Sharing',
      'We share information with our service providers.',
    ].join('\n'))

    expect(clauses.map(({ id }) => id)).toEqual(['1.1', '1.2', '2.1'])
  })

  it('groups paragraphs into sets of three when there are no headings', () => {
    const paragraphs = Array.from({ length: 7 }, (_, index) => `Paragraph ${index + 1} contains enough text to remain a separate clause in this test.`)
    const clauses = segment(paragraphs.join('\n'))

    expect(clauses.map(({ id }) => id)).toEqual(['1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '3.1'])
  })

  it('splits long paragraphs at sentence boundaries with stable clause ids', () => {
    const sentence = (word: string) => `${Array.from({ length: 90 }, () => word).join(' ')}.`
    const clauses = segment([sentence('alpha'), sentence('bravo'), sentence('charlie')].join(' '))

    expect(clauses.length).toBeGreaterThan(1)
    expect(clauses.map(({ id }) => id)).toEqual(clauses.map((_, index) => `1.${index + 1}`))
    expect(clauses.every(({ text }) => text.length <= 700)).toBe(true)
  })
})
