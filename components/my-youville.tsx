import { Frame } from '@/components/neighborhood-view'
import './my-youville.css'

export function MyYouville({ name = 'Your', company }: { name?: string; company?: string }) {
  return (
    <main className="youville-view">
      <p className="youville-scroll-hint" id="youville-scroll-hint">Scroll sideways to explore your town. This illustration is a design preview, not a record of collected data.</p>
      <div className="youville-scroll" tabIndex={0} role="region" aria-label="Youville town preview" aria-describedby="youville-scroll-hint">
        <div className="youville-scene-space"><Frame name={name} company={company} /></div>
      </div>
    </main>
  )
}
