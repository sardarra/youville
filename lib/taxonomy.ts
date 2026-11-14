export const FIELDS = [
  { label: 'Name', group: 'Identity', basis: 'stated' },
  { label: 'Date of birth', group: 'Identity', basis: 'stated' },
  { label: 'Government ID or SSN', group: 'Identity', basis: 'stated' },
  { label: 'Citizenship or immigration status', group: 'Identity', basis: 'stated' },
  { label: 'Photos and face data', group: 'Identity', basis: 'stated' },
  { label: 'Email and phone', group: 'Contact', basis: 'stated' },
  { label: 'Home address and street', group: 'Contact', basis: 'either' },
  { label: 'School', group: 'Life', basis: 'either' },
  { label: 'Workplace or office', group: 'Life', basis: 'either' },
  { label: 'Family and relatives', group: 'Life', basis: 'stated' },
  { label: 'Contacts', group: 'Life', basis: 'stated' },
  { label: 'Payment and bank details', group: 'Money', basis: 'stated' },
  { label: 'Purchase history', group: 'Money', basis: 'stated' },
  { label: 'Health data', group: 'Sensitive', basis: 'stated' },
  { label: 'Device and IP', group: 'Device and place', basis: 'stated' },
  { label: 'Precise location', group: 'Device and place', basis: 'stated' },
  { label: 'Daily schedule', group: 'Behavior (inferred only)', basis: 'inferred' },
  { label: 'Social circle', group: 'Behavior (inferred only)', basis: 'inferred' },
  { label: 'Interests and purchases', group: 'Behavior (inferred only)', basis: 'inferred' },
] as const

export type FieldLabel = (typeof FIELDS)[number]['label']
export type FieldGroup = (typeof FIELDS)[number]['group']
export type FieldBasis = (typeof FIELDS)[number]['basis']

export const SIGNALS = [
  'Timestamps',
  'Usage activity',
  'Email ending in .edu',
  'Ad-partner sharing',
  'Third-party sharing',
  'Wi-Fi or Bluetooth scanning',
  'Location metadata',
  'Usage or purchase data',
  'Contacts or messaging metadata',
  'IP address',
  'Device ID',
  'Photos',
] as const

export type Signal = (typeof SIGNALS)[number]

export const FIELD_IMPLIES: Partial<Record<FieldLabel, readonly Signal[]>> = {
  'Device and IP': ['IP address', 'Device ID'],
  Contacts: ['Contacts or messaging metadata'],
  'Photos and face data': ['Photos'],
  'Purchase history': ['Usage or purchase data'],
}
