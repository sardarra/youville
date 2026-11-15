const genericNames = /^(?:privacy(?: policy| notice)?|terms(?: of service| and conditions)?|legal|policy|website|document)$/i

function cleanCandidate(value: string): string | null {
  const candidate = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/^["'“”‘’#\s]+|["'“”‘’\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (
    candidate.length < 2 ||
    candidate.length > 80 ||
    genericNames.test(candidate)
  ) {
    return null
  }

  return candidate
}

export function normalizeWebsiteName(value: string): string | null {
  return cleanCandidate(value)
}

export function inferNameFromPolicyTitle(title: string): string | null {
  const normalized = title.replace(/\s+/g, ' ').trim()
  const candidates = [
    normalized.match(
      /^(.+?)\s*[|—–-]\s*(?:privacy\s+(?:policy|notice)|terms(?:\s+of\s+service)?)$/i,
    )?.[1],
    normalized.match(
      /^(?:privacy\s+(?:policy|notice)|terms(?:\s+of\s+service)?)\s*[|—–-]\s*(.+)$/i,
    )?.[1],
    normalized.match(
      /^(.+?)\s+(?:privacy\s+(?:policy|notice)|terms(?:\s+of\s+service)?)$/i,
    )?.[1],
    normalized.match(
      /^(?:privacy\s+(?:policy|notice)|terms(?:\s+of\s+service)?)\s+(?:for|of|by)\s+(.+)$/i,
    )?.[1],
  ]

  for (const candidate of candidates) {
    if (candidate) {
      const name = cleanCandidate(candidate)
      if (name) return name
    }
  }

  return null
}

export function inferWebsiteNameFromTitle(title: string): string | null {
  const policyName = inferNameFromPolicyTitle(title)
  if (policyName) return policyName

  const candidate = cleanCandidate(title)
  if (!candidate || /^(?:privacy|terms|cookie|data|legal|policy)\b/i.test(candidate)) {
    return null
  }

  return candidate
}

export function inferPolicyName(text: string): string | null {
  const lines = text
    .slice(0, 8_000)
    .split(/\r\n?|\n/)
    .map((line) => line.replace(/^\s*#+\s*/, '').trim())
    .filter(Boolean)

  for (const line of lines.slice(0, 25)) {
    const name = inferNameFromPolicyTitle(line)
    if (name) return name
  }

  const introduction = lines.join('\n')
  const declarationPatterns = [
    /(?:this )?(?:privacy policy|privacy notice)\s+(?:is\s+)?(?:provided|issued|maintained|published|operated)\s+by\s+([^.;(\n]{2,80})/i,
    /(?:company|organization|business|website|service)\s+name\s*[:\-]\s*([^;\n]{2,80})/i,
    /(?:^|\n)\s*([A-Z][\p{L}\d&.'’ -]{1,60})\s+\((?:["“]?we["”]?)/mu,
  ]

  for (const pattern of declarationPatterns) {
    const candidate = introduction.match(pattern)?.[1]
    if (candidate) {
      const name = cleanCandidate(candidate)
      if (name) return name
    }
  }

  return null
}
