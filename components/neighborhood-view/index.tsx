import type { CSSProperties } from 'react'

type Artwork = {
  file: string
  label?: string
  top: number
  left: number
  width: number
  height: number
  foreground?: boolean
}

// Positions follow the Anima frame; complete Figma exports replace its fragments.
const artwork: Artwork[] = [
  { file: 'Cloud.svg', top: 16, left: 836, width: 502, height: 201 },
  { file: 'Cloud-1.svg', top: 65, left: 2000, width: 526, height: 201 },
  { file: 'Cloud-2.svg', top: 9, left: 3656, width: 526, height: 201 },
  { file: 'Office.svg', label: 'Office', top: 359, left: 303, width: 188, height: 364 },
  { file: 'Hospital.svg', label: 'Hospital', top: 296, left: 2464, width: 291, height: 430 },
  { file: 'School.svg', label: 'School', top: 186, left: 1519, width: 650, height: 541 },
  { file: 'Thall.svg', label: 'Town hall', top: 129, left: 3182, width: 525, height: 552 },
  { file: 'House.svg', label: 'Home', top: 443, left: 833, width: 439, height: 242 },
  { file: 'Bank.svg', label: 'Bank', top: 311, left: 4135, width: 578, height: 370 },
  { file: 'Tree.svg', top: 512, left: 148, width: 149, height: 187 },
  { file: 'Tree-1.svg', top: 520, left: 1399, width: 156, height: 196 },
  { file: 'Tree-3.svg', top: 465, left: 535, width: 172, height: 217 },
  { file: 'Tree-2.svg', top: 485, left: 2172, width: 156, height: 196 },
  { file: 'Street Sign.svg', label: 'Youstreet street sign', top: 467, left: 10, width: 181, height: 237 },
  { file: 'Mailbox.svg', label: 'Mailbox', top: 595, left: 745, width: 60, height: 85 },
  { file: 'Lamppost.svg', top: 393, left: 2830, width: 306, height: 294 },
  { file: 'Lamppost-1.svg', top: 393, left: 3766, width: 306, height: 294 },
  { file: 'Lamppost-2.svg', top: 393, left: 4704, width: 306, height: 294 },
  { file: 'Bench.svg', foreground: true, top: 750, left: 1411, width: 246, height: 109 },
  { file: 'Bench-1.svg', foreground: true, top: 790, left: 361, width: 246, height: 109 },
  { file: 'Bench-2.svg', foreground: true, top: 805, left: 3326, width: 246, height: 109 },
  { file: 'Fountain.svg', foreground: true, label: 'Fountain pool', top: 833, left: 1192, width: 687, height: 174 },
  { file: 'Fountaion.svg', foreground: true, top: 720, left: 1312, width: 453, height: 196 },
  { file: 'Asiangirl.svg', foreground: true, label: 'Person beside the fountain', top: 751, left: 1182, width: 90, height: 150 },
  { file: 'Pinkshirtperson.svg', foreground: true, label: 'Person in pink shirt', top: 727, left: 1269, width: 109, height: 144 },
  { file: 'redshirtboy.svg', foreground: true, label: 'Person in red shirt', top: 748, left: 1726, width: 92, height: 144 },
]

const absolute = (top: number, left: number, width: number, height: number): CSSProperties => ({
  position: 'absolute', top: `${top / 1080 * 100}%`, left: `${left / 5042 * 100}%`, width: `${width / 5042 * 100}%`, height: `${height / 1080 * 100}%`,
})

export function NeighborhoodView() {
  return (
    <>
      <div className="youville-scene" style={{ background: '#b3f0ff' }}>
        {/* Road and lawn mask building bases; park objects remain above both. */}
        <div aria-hidden="true" style={{ ...absolute(741, 0, 5042, 339), background: '#00af0f', zIndex: 2 }} />
        <img alt="" src="/youville/Road.svg" style={{ ...absolute(672, 0, 5042, 69), zIndex: 2 }} draggable={false} />
        {artwork.map(({ file, label = '', top, left, width, height, foreground }) => (
          <img key={file} alt={label} src={`/youville/${encodeURIComponent(file)}`} width={width} height={height} style={{ ...absolute(top, left, width, height), zIndex: foreground ? 3 : 1, objectFit: file === 'Mailbox.svg' ? 'fill' : undefined }} draggable={false} />
        ))}
      </div>

    </>
  )
}
