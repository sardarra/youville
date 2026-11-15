'use client'

import { useState, type CSSProperties } from 'react'
import type { ScanResponse } from '@/lib/scan'
import type { FieldLabel } from '@/lib/taxonomy'

type Artwork = {
  file: string
  label?: string
  fields?: readonly FieldLabel[]
  top: number
  left: number
  width: number
  height: number
}

type Disclosure = {
  company: string
  field: FieldLabel
  status: 'collected' | 'inferred'
}

// Positions follow the Anima frame; complete Figma exports replace its fragments.
const artwork: Artwork[] = [
  { file: 'Cloud.svg', top: 16, left: 836, width: 502, height: 201 },
  { file: 'Cloud-1.svg', top: 65, left: 2000, width: 526, height: 201 },
  { file: 'Cloud-2.svg', top: 9, left: 3656, width: 526, height: 201 },
  {
    file: 'Office.svg',
    label: 'Office',
    fields: ['Workplace or office'],
    top: 359,
    left: 303,
    width: 188,
    height: 364,
  },
  {
    file: 'Hospital.svg',
    label: 'Hospital',
    fields: ['Health data'],
    top: 296,
    left: 2464,
    width: 291,
    height: 430,
  },
  {
    file: 'School.svg',
    label: 'School',
    fields: ['School'],
    top: 186,
    left: 1519,
    width: 650,
    height: 541,
  },
  {
    file: 'Thall.svg',
    label: 'Town hall',
    fields: ['Government ID or SSN', 'Citizenship or immigration status'],
    top: 129,
    left: 3182,
    width: 525,
    height: 552,
  },
  {
    file: 'House.svg',
    label: 'Home',
    fields: ['Home address and street'],
    top: 443,
    left: 833,
    width: 439,
    height: 242,
  },
  {
    file: 'Bank.svg',
    label: 'Bank',
    fields: ['Payment and bank details'],
    top: 311,
    left: 4135,
    width: 578,
    height: 370,
  },
  { file: 'Tree.svg', top: 512, left: 148, width: 149, height: 187 },
  { file: 'Tree-1.svg', top: 520, left: 1399, width: 156, height: 196 },
  { file: 'Tree-3.svg', top: 465, left: 535, width: 172, height: 217 },
  { file: 'Tree-2.svg', top: 485, left: 2172, width: 156, height: 196 },
  {
    file: 'Street Sign.svg',
    label: 'Youstreet street sign',
    fields: ['Home address and street'],
    top: 467,
    left: 10,
    width: 181,
    height: 237,
  },
  {
    file: 'Mailbox.svg',
    label: 'Mailbox',
    fields: ['Email and phone'],
    top: 587,
    left: 745,
    width: 60,
    height: 85,
  },
  { file: 'Lamppost.svg', top: 393, left: 2830, width: 306, height: 294 },
  { file: 'Lamppost-1.svg', top: 393, left: 3766, width: 306, height: 294 },
  { file: 'Lamppost-2.svg', top: 393, left: 4704, width: 306, height: 294 },
  { file: 'Bench.svg', top: 750, left: 1411, width: 246, height: 109 },
  { file: 'Bench-1.svg', top: 790, left: 361, width: 246, height: 109 },
  { file: 'Bench-2.svg', top: 805, left: 3326, width: 246, height: 109 },
  {
    file: 'Fountain.svg',
    label: 'Fountain pool',
    top: 833,
    left: 1192,
    width: 687,
    height: 174,
  },
  { file: 'Fountaion.svg', top: 720, left: 1312, width: 453, height: 196 },
  {
    file: 'Asiangirl.svg',
    label: 'Person beside the fountain',
    fields: ['Family and relatives', 'Social circle'],
    top: 751,
    left: 1182,
    width: 90,
    height: 150,
  },
  {
    file: 'Pinkshirtperson.svg',
    label: 'Person in pink shirt',
    fields: ['Family and relatives', 'Social circle'],
    top: 727,
    left: 1269,
    width: 109,
    height: 144,
  },
  {
    file: 'redshirtboy.svg',
    label: 'Person in red shirt',
    fields: ['Family and relatives', 'Social circle'],
    top: 748,
    left: 1726,
    width: 92,
    height: 144,
  },
]

const absolute = (
  top: number,
  left: number,
  width: number,
  height: number,
): CSSProperties => ({
  position: 'absolute',
  top,
  left,
  width,
  height,
})

function getDisclosures(fields: readonly FieldLabel[], scans: ScanResponse[]) {
  return scans.flatMap((scan) =>
    scan.fields.flatMap((field): Disclosure[] => {
      if (!fields.includes(field.label) || field.status === 'not_found') {
        return []
      }

      return [{
        company: scan.source.name,
        field: field.label,
        status: field.status,
      }]
    }),
  )
}

function MapHotspot({
  item,
  disclosures,
  expanded,
  onClick,
  onEscape,
}: {
  item: Artwork
  disclosures: Disclosure[]
  expanded: boolean
  onClick: () => void
  onEscape: () => void
}) {
  const label = item.label ?? 'Map location'
  const tooltipId = `neighborhood-tooltip-${item.file.replace(
    /[^a-zA-Z0-9_-]/g,
    '-',
  )}`
  const edge =
    item.left < 240
      ? 'start'
      : item.left + item.width > 4800
        ? 'end'
        : 'center'

  return (
    <button
      type="button"
      className="neighborhood-hotspot"
      style={absolute(item.top, item.left, item.width, item.height)}
      aria-label={`${label} data exposure details`}
      aria-describedby={tooltipId}
      aria-controls={tooltipId}
      aria-expanded={expanded}
      data-tooltip-edge={edge}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onEscape()
      }}
    >
      <img
        className="neighborhood-artwork"
        alt=""
        src={`/youville/${encodeURIComponent(item.file)}`}
        draggable={false}
      />
      <span className="neighborhood-tooltip" id={tooltipId} role="tooltip">
        <strong>{label}</strong>
        <span className="neighborhood-tooltip-note">
          From saved policy scans; this does not confirm actual data sharing.
        </span>
        <span className="neighborhood-disclosures">
          {disclosures.map((disclosure, index) => (
            <span
              className="neighborhood-disclosure"
              key={`${disclosure.company}-${disclosure.field}-${index}`}
            >
              <strong>{disclosure.company}</strong>
              <span>{disclosure.field}</span>
              <small>
                {disclosure.status === 'collected'
                  ? 'Verified policy claim: collects this'
                  : 'Could be inferred from policy data'}
              </small>
            </span>
          ))}
        </span>
      </span>
    </button>
  )
}

export function NeighborhoodView({
  name = 'Your',
  scans,
}: {
  name?: string
  scans: ScanResponse[]
}) {
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null)

  return (
    <>
      <div className="youville-scene" style={{ background: '#b3f0ff' }}>
        <div
          aria-hidden="true"
          style={{
            ...absolute(672, 0, 5042, 408),
            background: 'linear-gradient(90deg, #00af0f, #00af0f)',
          }}
        />
        <img
          alt=""
          src="/youville/Road.svg"
          style={absolute(727, 0, 5042, 69)}
          draggable={false}
        />
        {artwork.map((item) => {
          if (!item.fields) {
            return (
              <img
                key={item.file}
                alt=""
                src={`/youville/${encodeURIComponent(item.file)}`}
                width={item.width}
                height={item.height}
                style={absolute(item.top, item.left, item.width, item.height)}
                draggable={false}
              />
            )
          }

          const disclosures = getDisclosures(item.fields, scans)
          if (!disclosures.length) return null

          return (
            <MapHotspot
              key={item.file}
              item={item}
              disclosures={disclosures}
              expanded={activeHotspot === item.file}
              onClick={() =>
                setActiveHotspot((active) =>
                  active === item.file ? null : item.file,
                )
              }
              onEscape={() => setActiveHotspot(null)}
            />
          )
        })}
      </div>
      <div className="youville-title-overlay">
        <h1>Welcome to {name}ville</h1>
        <p>Scroll sideways to explore</p>
      </div>
    </>
  )
}
