import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { NeighborhoodView } from '@/components/neighborhood-view'
import type { Inference } from '@/lib/rules'
import type { ScanResponse } from '@/lib/scan'
import './my-youville.css'

export function MyYouville({
  name = 'You',
  company,
  scans,
  inferences,
}: {
  name?: string
  company?: string
  scans: ScanResponse[]
  inferences: Inference[]
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ pointerId: number; x: number; scrollLeft: number } | null>(null)

  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <section className="youville-view" aria-label="My Neighborhood">
      <p className="youville-scroll-hint" id="youville-scroll-hint">Click and drag, swipe, or use the bar below to explore the neighborhood. The illustration does not represent collected data or actual locations.</p>
      <div className="youville-viewport">
      <div ref={scrollRef}
        onPointerDown={(event) => {
          // Touch keeps the browser's native swipe and page scrolling.
          if (event.pointerType === 'touch' || event.button !== 0) return
          event.preventDefault()
          event.currentTarget.focus({ preventScroll: true })
          drag.current = { pointerId: event.pointerId, x: event.clientX, scrollLeft: event.currentTarget.scrollLeft }
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
        }}
        onPointerMove={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return
          event.currentTarget.scrollLeft = drag.current.scrollLeft - (event.clientX - drag.current.x)
        }}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onLostPointerCapture={stopDragging} onScroll={(event) => { const el = event.currentTarget; setPosition(el.scrollLeft / Math.max(1, el.scrollWidth - el.clientWidth) * 100) }} className={`youville-scroll${dragging ? ' is-dragging' : ''}`} tabIndex={0} role="region" aria-label="Youville town preview" aria-describedby="youville-scroll-hint">
        <div className="youville-scene-space"><NeighborhoodView /></div>
      </div>
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
