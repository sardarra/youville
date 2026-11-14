export interface Clause {
  id: string
  text: string
}

const isHeading = (line: string) => {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (/^\d+(?:\.\d+)*\.?(?:\s+.+)?$/.test(trimmed)) return true
  if (trimmed.length <= 70 && /^[A-Z0-9][A-Z0-9\s&'’(),/-]*$/.test(trimmed) && /[A-Z]/.test(trimmed)) return true
  if (trimmed.length <= 70 && trimmed.endsWith(':')) return true
  return trimmed.length <= 70 && !/[.!?]$/.test(trimmed) && /^[A-Z][\p{L}\p{N}\s&'’(),/-]+$/u.test(trimmed)
}

const splitLongParagraph = (text: string): string[] => {
  const sentences = text.match(/[^.!?]+(?:[.!?]+["'”’)]*)?/g)?.map((part) => part.trim()).filter(Boolean) ?? [text]
  const chunks: string[] = []
  let chunk = ''

  for (const sentence of sentences) {
    if (chunk && chunk.length + sentence.length + 1 > 700) {
      chunks.push(chunk)
      chunk = ''
    }

    if (sentence.length > 700) {
      const words = sentence.split(/\s+/)
      for (const word of words) {
        if (chunk && chunk.length + word.length + 1 > 700) {
          chunks.push(chunk)
          chunk = ''
        }
        chunk = chunk ? `${chunk} ${word}` : word
      }
    } else {
      chunk = chunk ? `${chunk} ${sentence}` : sentence
    }
  }

  if (chunk) chunks.push(chunk)
  return chunks
}

export function segment(text: string): Clause[] {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ')
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean)
  const hasHeadings = lines.some(isHeading)
  const sections: string[][] = []
  let current: string[] = []

  for (const line of lines) {
    if (hasHeadings && isHeading(line)) {
      if (current.length) sections.push(current)
      current = []
      continue
    }
    current.push(line)
  }
  if (current.length) sections.push(current)

  const groupedSections = hasHeadings
    ? sections
    : Array.from({ length: Math.ceil(lines.length / 3) }, (_, index) => lines.slice(index * 3, index * 3 + 3))

  return groupedSections.flatMap((paragraphs, sectionIndex) => {
    const merged: string[] = []
    for (const paragraph of paragraphs) {
      const previous = merged.at(-1)
      if (paragraph.length < 40 && previous) merged[merged.length - 1] = `${previous} ${paragraph}`
      else merged.push(paragraph)
    }

    return merged.flatMap((paragraph) => splitLongParagraph(paragraph)).map((clause, paragraphIndex) => ({
      id: `${sectionIndex + 1}.${paragraphIndex + 1}`,
      text: clause,
    }))
  })
}
