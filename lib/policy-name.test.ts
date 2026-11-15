import { describe, expect, it } from 'vitest'
import {
  inferNameFromPolicyTitle,
  inferPolicyName,
  inferWebsiteNameFromTitle,
} from '@/lib/policy-name'

describe('policy name inference', () => {
  it('gets a company name from common policy headings', () => {
    expect(inferPolicyName('# Privacy Policy for Acme, Inc.\nWe collect data.')).toBe(
      'Acme, Inc.',
    )
    expect(inferPolicyName('Northstar Privacy Policy\nWe collect data.')).toBe(
      'Northstar',
    )
  })

  it('gets a company name from an explicit policy declaration', () => {
    expect(
      inferPolicyName(
        'This Privacy Policy is provided by Acme Labs ("we", "us", or "our").',
      ),
    ).toBe('Acme Labs')
  })

  it('does not treat a generic policy heading as a company name', () => {
    expect(inferPolicyName('Privacy Policy\nWe collect data.')).toBeNull()
  })

  it('extracts a site name from a policy page title', () => {
    expect(inferNameFromPolicyTitle('Privacy Policy | Northstar')).toBe(
      'Northstar',
    )
    expect(inferNameFromPolicyTitle('Privacy Policy')).toBeNull()
    expect(inferWebsiteNameFromTitle('Northstar')).toBe('Northstar')
  })
})
