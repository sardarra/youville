import { describe, expect, it } from 'vitest'
import { htmlToText, isBlockedAddress } from '@/lib/fetch-url'

describe('SSRF address guard', () => {
  it.each(['127.0.0.1', '10.10.1.2', '169.254.169.254', '::1', 'fc00::1', 'fe80::1'])(
    'blocks private or local address %s',
    (address) => expect(isBlockedAddress(address)).toBe(true),
  )

  it('allows public addresses', () => {
    expect(isBlockedAddress('8.8.8.8')).toBe(false)
    expect(isBlockedAddress('2001:4860:4860::8888')).toBe(false)
  })

  it('extracts policy headings and paragraphs while dropping navigation and scripts', () => {
    const text = htmlToText(`
      <html><body>
        <nav>Navigation text</nav>
        <h1>Privacy policy</h1>
        <p>We may collect your email address.</p>
        <script>Ignore this content</script>
        <footer>Footer text</footer>
      </body></html>
    `)

    expect(text).toBe('Privacy policy\nWe may collect your email address.')
  })
})
