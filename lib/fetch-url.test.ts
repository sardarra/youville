import { describe, expect, it } from 'vitest'
import { isBlockedAddress } from '@/lib/fetch-url'

describe('SSRF address guard', () => {
  it.each(['127.0.0.1', '10.10.1.2', '169.254.169.254', '::1', 'fc00::1', 'fe80::1'])(
    'blocks private or local address %s',
    (address) => expect(isBlockedAddress(address)).toBe(true),
  )

  it('allows public addresses', () => {
    expect(isBlockedAddress('8.8.8.8')).toBe(false)
    expect(isBlockedAddress('2001:4860:4860::8888')).toBe(false)
  })
})
