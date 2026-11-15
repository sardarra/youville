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
  building?: boolean
  foreground?: boolean
}

type Disclosure = {
  company: string
  field: FieldLabel
  status: 'collected' | 'inferred'
}

// Two depths let the sky glide more slowly than the street as it scrolls.
const clouds = [
  { file: 'Cloud-2.svg', top: 220, left: 650, width: 240, height: 92, far: true },
  { file: 'Cloud.svg', top: 170, left: 1200, width: 290, height: 116, far: true },
  { file: 'Cloud-1.svg', top: 245, left: 2350, width: 260, height: 99, far: false },
  { file: 'Cloud.svg', top: 240, left: 3550, width: 260, height: 104, far: true },
  { file: 'Cloud-2.svg', top: 200, left: 4540, width: 280, height: 107, far: false },
  { file: 'Cloud.svg', top: 22, left: -280, width: 360, height: 144, far: true },
  { file: 'Cloud-1.svg', top: 118, left: 200, width: 410, height: 157, far: false },
  { file: 'Cloud.svg', top: 16, left: 836, width: 502, height: 201, far: false },
  { file: 'Cloud-2.svg', top: 45, left: 1400, width: 310, height: 118, far: true },
  { file: 'Cloud-1.svg', top: 65, left: 2000, width: 526, height: 201, far: false },
  { file: 'Cloud.svg', top: 12, left: 2640, width: 340, height: 136, far: true },
  { file: 'Cloud-2.svg', top: 135, left: 3020, width: 390, height: 149, far: false },
  { file: 'Cloud-2.svg', top: 9, left: 3656, width: 526, height: 201, far: false },
  { file: 'Cloud-1.svg', top: 88, left: 4250, width: 320, height: 122, far: true },
  { file: 'Cloud.svg', top: 30, left: 4740, width: 410, height: 164, far: false },
]

// Positions follow the Anima frame; complete Figma exports replace its fragments.
const artwork: Artwork[] = [
  {
    file: 'Office.svg',
    building: true,
    label: 'Company',
    fields: ['Workplace or office'],
    top: 359,
    left: 303,
    width: 188,
    height: 364,
  },
  {
    file: 'Hospital.svg',
    building: true,
    label: 'Health Information',
    fields: ['Health data'],
    top: 296,
    left: 2464,
    width: 291,
    height: 430,
  },
  {
    file: 'School.svg',
    building: true,
    label: 'School or College',
    fields: ['School'],
    top: 186,
    left: 1519,
    width: 650,
    height: 541,
  },
  {
    file: 'Thall.svg',
    building: true,
    label: 'Government Information',
    fields: ['Government ID or SSN', 'Citizenship or immigration status'],
    top: 129,
    left: 3182,
    width: 525,
    height: 552,
  },
  {
    file: 'House.svg',
    building: true,
    label: 'Home',
    fields: ['Home address and street'],
    top: 443,
    left: 833,
    width: 439,
    height: 242,
  },
  {
    file: 'Bank.svg',
    building: true,
    label: 'Financial Information',
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
    label: 'Street Address',
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
    top: 595,
    left: 745,
    width: 60,
    height: 85,
  },
  { file: 'Lamppost.svg', top: 393, left: 2830, width: 306, height: 294 },
  { file: 'Lamppost-1.svg', top: 393, left: 3766, width: 306, height: 294 },
  { file: 'Lamppost-2.svg', top: 393, left: 4704, width: 306, height: 294 },
  { file: 'Bench.svg', foreground: true, top: 750, left: 1411, width: 246, height: 109 },
  { file: 'Bench-1.svg', foreground: true, top: 790, left: 361, width: 246, height: 109 },
  { file: 'Bench-2.svg', foreground: true, top: 805, left: 3326, width: 246, height: 109 },
  {
    file: 'Fountain.svg', foreground: true,
    label: 'Fountain pool',
    top: 833,
    left: 1192,
    width: 687,
    height: 174,
  },
  { file: 'Fountaion.svg', foreground: true, top: 720, left: 1312, width: 453, height: 196 },
  {
    file: 'Asiangirl.svg', foreground: true,
    label: 'Family and Friends',
    fields: ['Family and relatives', 'Social circle'],
    top: 751,
    left: 1182,
    width: 90,
    height: 150,
  },
  {
    file: 'Pinkshirtperson.svg', foreground: true,
    label: 'Family and Friends',
    fields: ['Family and relatives', 'Social circle'],
    top: 727,
    left: 1269,
    width: 109,
    height: 144,
  },
  {
    file: 'redshirtboy.svg', foreground: true,
    label: 'Family and Friends',
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
  top: `${top / 1080 * 100}%`,
  left: `${left / 5042 * 100}%`,
  width: `${width / 5042 * 100}%`,
  height: `${height / 1080 * 100}%`,
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
      className={`neighborhood-hotspot${item.building ? ' neighborhood-building' : ''}`}
      style={{ ...absolute(item.top, item.left, item.width, item.height), '--artwork-layer': item.foreground ? 3 : 1 } as CSSProperties}
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
  scans,
}: {
  scans: ScanResponse[]
}) {
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null)

  return (
    <>
      <div className="youville-scene" style={{ background: '#b3f0ff' }}>
        {clouds.map((cloud, index) => (
          <img
            key={`cloud-${index}`}
            className={`neighborhood-cloud${cloud.far ? ' neighborhood-cloud-far' : ''}`}
            alt=""
            aria-hidden="true"
            src={`/youville/${cloud.file}`}
            style={absolute(cloud.top, cloud.left, cloud.width, cloud.height)}
            draggable={false}
          />
        ))}
        <div
          aria-hidden="true"
          style={{
            ...absolute(741, 0, 5042, 339),
            zIndex: 2,
            pointerEvents: 'none',
            background: 'linear-gradient(90deg, #00af0f, #00af0f)',
          }}
        />
        <img
          alt=""
          src="/youville/Road.svg"
          style={{ ...absolute(672, 0, 5042, 69), zIndex: 2, pointerEvents: 'none' }}
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
                style={{ ...absolute(item.top, item.left, item.width, item.height), zIndex: item.foreground ? 3 : 1 }}
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

    </>
  )
}
