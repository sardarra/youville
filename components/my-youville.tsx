import { useRef, useState } from 'react'
import { NeighborhoodView } from '@/components/neighborhood-view'
import type { ScanResponse } from '@/lib/scan'
import './my-youville.css'

export function MyYouville({
  name = 'You',
  company,
  scans,
}: {
  name?: string
  company?: string
  scans: ScanResponse[]
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState(0)

  return (
    <section className="youville-view" aria-label="My Neighborhood">
      <p className="youville-scroll-hint" id="youville-scroll-hint">Swipe or use the bar below to explore the neighborhood. The illustration does not represent collected data or actual locations.</p>
      <div className="youville-viewport">
      <div ref={scrollRef} onScroll={(event) => { const el = event.currentTarget; el.style.setProperty('--cloud-near-offset', `${el.scrollLeft * 0.16}px`); el.style.setProperty('--cloud-far-offset', `${el.scrollLeft * 0.3}px`); setPosition(el.scrollLeft / Math.max(1, el.scrollWidth - el.clientWidth) * 100) }} className="youville-scroll" tabIndex={0} role="region" aria-label="Youville town preview" aria-describedby="youville-scroll-hint">
        <div className="youville-scene-space"><NeighborhoodView scans={scans} /></div>
      </div>
      <a className="button-primary neighborhood-summary-link" href="#privacy-summary">View privacy summary <span aria-hidden="true">↓</span></a>
      <div className="youville-title-overlay">
        <h1>Welcome to {name}ville</h1>
        <p>Viewing policy for: {company ?? (scans.length ? 'all saved policies' : 'no policies scanned')}</p>
      </div>
      </div>
      <div className="youville-scrollbar">
        <span aria-hidden="true">←</span>
        <input type="range" min="0" max="100" step="0.1" value={position} aria-label="Explore neighborhood horizontally" aria-valuetext={`${Math.round(position)}% across the neighborhood`} onChange={(event) => {
          const value = Number(event.target.value)
          setPosition(value)
          const el = scrollRef.current
          if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) * value / 100
        }} />
        <span aria-hidden="true">→</span>
      </div>
    </section>
  )
}
