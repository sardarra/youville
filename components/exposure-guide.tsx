'use client'

import { Check, CircleHelp, Home, School } from 'lucide-react'
import { inferenceRules } from '@/data/rules'
import { samples } from '@/data/mock-data'

export function ExposureGuide({ onBack }: { onBack: () => void }) {
  const verified = samples.flatMap((app) => app.findings.filter((finding) => finding.verified))
  const fields = new Set(verified.map((finding) => finding.field.toLowerCase()))
  const hasLocation = fields.has('precise location')
  const hasTimestamps = fields.has('timestamps') || verified.some((finding) => /timestamp/i.test(finding.summary))
  const hasEduEmail = fields.has('email ending in .edu')
  const homeCouldBeInferred = hasLocation && hasTimestamps
  const schoolCouldBeInferred = hasLocation && hasEduEmail
  const homeRule = inferenceRules.find((rule) => rule.id === 'R1')
  const schoolRule = inferenceRules.find((rule) => rule.id === 'R3')

  return (
    <main className="visual-guide-page">
      <section className="visual-guide-heading">
        <div>
          <h1>Your Neighborhood</h1>
          <p>A visual representation of what you have shared.</p>
        </div>
      </section>
      <section className="neighborhood-card" aria-labelledby="neighborhood-title">
        <div className="neighborhood-header">
          <div><h2 id="neighborhood-title">Sardarville</h2></div>
          <span className="not-real-label"><CircleHelp size={14} /> Fictional map · not a real address</span>
        </div>
        <div className="neighborhood-map">
          <svg viewBox="0 0 920 470" preserveAspectRatio="none" role="img" aria-labelledby="map-title map-desc">
            <title id="map-title">Fictional map of Sardarville</title>
            <desc id="map-desc">A conceptual town illustration. Verified ledger evidence determines whether possible home and school locations are highlighted.</desc>
            <rect width="920" height="470" fill="#f3f1e9" />
            <path d="M0 185H920M0 338H920M115 0V470M350 0V470M585 0V470M815 0V470" stroke="#fff" strokeWidth="38" />
            <path d="M0 185H920M0 338H920M115 0V470M350 0V470M585 0V470M815 0V470" stroke="#d6d6cc" strokeWidth="2" strokeDasharray="8 9" />
            <g fill="#dfe7da" stroke="#cbd5c5" strokeWidth="2">
              <rect x="155" y="52" width="145" height="105" rx="9" /><rect x="390" y="52" width="152" height="105" rx="9" />
              <rect x="625" y="52" width="157" height="105" rx="9" /><rect x="155" y="226" width="145" height="92" rx="9" />
              <rect x="390" y="226" width="152" height="92" rx="9" /><rect x="625" y="226" width="157" height="92" rx="9" />
              <rect x="155" y="377" width="145" height="75" rx="9" /><rect x="390" y="377" width="152" height="75" rx="9" />
              <rect x="625" y="377" width="157" height="75" rx="9" />
            </g>
            <g fill="#73806d" fontFamily="Arial, sans-serif" fontSize="12" fontWeight="700" letterSpacing="2">
              <text x="201" y="104">APARTMENTS</text><text x="438" y="104">COMMUNITY</text><text x="685" y="104">PARK</text>
              <text x="202" y="270">CAFÉ</text><text x="442" y="270">LIBRARY</text><text x="671" y="270">NEIGHBORS</text>
              <text x="192" y="418">GARDEN</text><text x="430" y="418">MARKET</text><text x="666" y="418">PLAYGROUND</text>
            </g>
            <path d="M0 261H920" stroke="#9eb0a0" strokeWidth="3" />
            <text x="34" y="250" fill="#67745f" fontFamily="Arial, sans-serif" fontSize="11" fontWeight="700" letterSpacing="2">MAPLE STREET</text>
            {schoolCouldBeInferred && <g className="guide-marker guide-marker-school"><path d="M473 29l13-16 13 16v15h-26z" fill="#fff" stroke="#66785f" strokeWidth="2"/><rect x="469" y="44" width="34" height="15" rx="7" fill="#66785f"/><text x="472" y="55" fill="#fff" fontFamily="Arial, sans-serif" fontSize="7" fontWeight="700">SCHOOL</text><path d="M486 60v60" stroke="#66785f" strokeWidth="2" strokeDasharray="4 5"/><circle cx="486" cy="120" r="7" fill="#66785f" stroke="#fff" strokeWidth="3"/></g>}
            {homeCouldBeInferred && <g className="guide-marker guide-marker-home"><path d="M690 202l28-25 28 25v35h-56z" fill="#fff" stroke="#66785f" strokeWidth="2"/><path d="M683 203l35-31 35 31" fill="none" stroke="#66785f" strokeWidth="4"/><rect x="711" y="215" width="14" height="22" fill="#dce5d7"/><rect x="696" y="207" width="10" height="10" fill="#dce5d7"/><rect x="732" y="207" width="10" height="10" fill="#dce5d7"/><path d="M718 242v37" stroke="#66785f" strokeWidth="2" strokeDasharray="4 5"/><circle cx="718" cy="282" r="7" fill="#66785f" stroke="#fff" strokeWidth="3"/></g>}
          </svg>
          {schoolCouldBeInferred && <div className="place-callout school-callout"><School size={15} /><span><b>Could be school</b><small>Location + .edu email</small></span></div>}
          {homeCouldBeInferred && <div className="place-callout home-callout"><Home size={15} /><span><b>Could be home</b><small>Location + timestamps</small></span></div>}
        </div>
        <div className="neighborhood-legend"><span><i className="legend-pin" /> Potential place inferred</span><span><i className="legend-street" /> Street label is illustrative</span><span className="map-disclaimer">No real addresses or map data</span></div>
      </section>
      <section className="guide-evidence-grid" aria-label="Inference evidence">
        <EvidenceCard title="Home and street" enabled={homeCouldBeInferred} inputs="Precise location + timestamps" explanation={homeRule?.explanation ?? 'Location and timestamps could suggest a home area.'} />
        <EvidenceCard title="School" enabled={schoolCouldBeInferred} inputs="Precise location + .edu email" explanation={schoolRule?.explanation ?? 'Location and a school-domain email could point to a school.'} />
      </section>
      <p className="guide-note"><Check size={14} /> These are possibilities, not confirmed places. The map is an illustration generated from the ledger&apos;s verified signals.</p>
    </main>
  )
}

function EvidenceCard({ title, enabled, inputs, explanation }: { title: string; enabled: boolean; inputs: string; explanation: string }) {
  return <article className={`evidence-card ${enabled ? 'evidence-enabled' : ''}`}>
    <div className="evidence-icon">{title === 'School' ? <School size={17} /> : <Home size={17} />}</div>
    <div className="evidence-copy"><div className="evidence-title-row"><h3>{title}</h3><span className={enabled ? 'could-status' : 'not-shown-status'}>{enabled ? 'Could be inferred' : 'Not shown'}</span></div>
      <p>{enabled ? explanation : `Not shown: the ledger does not currently contain verified ${inputs.toLowerCase()} together.`}</p>
      <small>Required: {inputs}</small>
    </div>
  </article>
}
