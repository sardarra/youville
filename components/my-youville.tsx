import { NeighborhoodView } from '@/components/neighborhood-view'
import type { Inference } from '@/lib/rules'
import type { ScanResponse } from '@/lib/scan'
import './my-youville.css'

export function MyYouville({
  name = 'Your',
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
      <div className="youville-ledger-context" aria-label="Exposure ledger data">
        <p>Based on {scans.length} saved {scans.length === 1 ? 'policy' : 'policies'}:</p>
        <ul>
          {scans.map((scan, index) => (
            <li key={`${scan.source.name}-${index}`}>{scan.source.name} · exposure {scan.exposureScore}/100</li>
          ))}
          {inferences.map((inference) => (
            <li key={inference.ruleId}>{inference.output} could be inferred from verified findings</li>
          ))}
        </ul>
        {!scans.length && <span>Scan a policy to see neighborhood insights here.</span>}
      </div>
      <p className="youville-scroll-hint" id="youville-scroll-hint">Scroll sideways to explore the town preview. The illustration does not represent collected data or actual locations.</p>
      <div className="youville-scroll" tabIndex={0} role="region" aria-label="Youville town preview" aria-describedby="youville-scroll-hint">
        <div className="youville-scene-space"><NeighborhoodView name={name} company={company ?? (scans.length ? 'all saved policies' : 'no policies scanned')} /></div>
      </div>
    </section>
  )
}
