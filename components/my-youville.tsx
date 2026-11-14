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
  return (
    <section className="youville-view" aria-label="My Neighborhood">
      <p className="youville-scroll-hint" id="youville-scroll-hint">Scroll sideways to explore the town preview. The illustration does not represent collected data or actual locations.</p>
      <div className="youville-scroll" tabIndex={0} role="region" aria-label="Youville town preview" aria-describedby="youville-scroll-hint">
        <div className="youville-scene-space"><NeighborhoodView name={name} company={company ?? (scans.length ? 'all saved policies' : 'no policies scanned')} /></div>
      </div>
    </section>
  )
}
