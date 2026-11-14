'use client'

import { Check, CircleHelp, Fingerprint, School } from 'lucide-react'
import { inferenceRules } from '@/data/rules'
import type { Inference } from '@/lib/rules'

export function ExposureGuide({ onBack, inferences }: { onBack: () => void; inferences: Inference[] }) {
  return (
    <main className="visual-guide-page">
      <section className="visual-guide-heading">
        <div>
          <h1>What could be inferred</h1>
          <p>Only combinations supported by verified policy findings appear here.</p>
        </div>
      </section>
      <section className="neighborhood-card" aria-labelledby="signals-title">
        <div className="neighborhood-header">
          <div><h2 id="signals-title">Verified signal combinations</h2></div>
          <span className="not-real-label"><CircleHelp size={14} /> Rule-based possibilities, not confirmed facts</span>
        </div>
        <div className="neighborhood-map">
          <SignalDiagram inferences={inferences} />
        </div>
        <div className="neighborhood-legend">
          <span><i className="legend-pin" /> Verified signals</span>
          <span><i className="legend-street" /> Rule output</span>
          <span className="map-disclaimer">No address or location is shown</span>
        </div>
      </section>
      <section className="guide-evidence-grid" aria-label="Inference evidence">
        {inferences.length ? inferences.map((inference) => {
          const rule = inferenceRules.find((candidate) => candidate.id === inference.ruleId)
          return <EvidenceCard
            key={inference.ruleId}
            title={inference.output}
            enabled
            inputs={rule?.inputs.join(' + ') ?? 'Verified policy signals'}
            explanation={inference.explanation}
            findingCount={inference.supportingFindingIds.length}
          />
        }) : <EvidenceCard
          title="No inferences found"
          enabled={false}
          inputs="Every rule requires all inputs to be verified"
          explanation="No rule conditions are currently met by the saved policy scans."
          findingCount={0}
        />}
      </section>
      <p className="guide-note"><Check size={14} /> These possibilities come from verified policy findings. The diagram does not represent actual locations.</p>
    </main>
  )
}

function SignalDiagram({ inferences }: { inferences: Inference[] }) {
  const centerX = 460
  const centerY = 235
  const radius = 175

  return <svg viewBox="0 0 920 470" role="img" aria-label="Diagram of verified signals and rule outputs">
    <rect width="920" height="470" fill="#f3f1e9" />
    <g stroke="#cfd6c9" strokeWidth="2" strokeDasharray="7 8">
      {inferences.map((inference, index) => {
        const angle = (2 * Math.PI * index) / Math.max(inferences.length, 1) - Math.PI / 2
        const x = centerX + Math.cos(angle) * radius
        const y = centerY + Math.sin(angle) * radius
        return <line key={inference.ruleId} x1={centerX} y1={centerY} x2={x} y2={y} />
      })}
    </g>
    <circle cx={centerX} cy={centerY} r="66" fill="#fff" stroke="#9eb0a0" strokeWidth="3" />
    <Fingerprint x={centerX - 18} y={centerY - 25} width="36" height="36" color="#66785f" />
    <text x={centerX} y={centerY + 27} textAnchor="middle" fill="#53624f" fontSize="13" fontFamily="Arial, sans-serif" fontWeight="700">Verified signals</text>
    {inferences.map((inference, index) => {
      const angle = (2 * Math.PI * index) / Math.max(inferences.length, 1) - Math.PI / 2
      const x = centerX + Math.cos(angle) * radius
      const y = centerY + Math.sin(angle) * radius
      return <g key={inference.ruleId}>
        <circle cx={x} cy={y} r="27" fill="#fff" stroke="#66785f" strokeWidth="2" />
        <text x={x} y={y + 4} textAnchor="middle" fill="#53624f" fontSize="11" fontFamily="Arial, sans-serif" fontWeight="700">{inference.ruleId}</text>
      </g>
    })}
    {!inferences.length && <text x={centerX} y={centerY + 100} textAnchor="middle" fill="#73796f" fontSize="13" fontFamily="Arial, sans-serif">No verified rule outputs</text>}
  </svg>
}

function EvidenceCard({ title, enabled, inputs, explanation, findingCount }: { title: string; enabled: boolean; inputs: string; explanation: string; findingCount: number }) {
  return <article className={`evidence-card ${enabled ? 'evidence-enabled' : ''}`}>
    <div className="evidence-icon">{title === 'School' ? <School size={17} /> : <CircleHelp size={17} />}</div>
    <div className="evidence-copy"><div className="evidence-title-row"><h3>{title}</h3><span className={enabled ? 'could-status' : 'not-shown-status'}>{enabled ? 'Could be inferred' : 'Not shown'}</span></div>
      <p>{explanation}</p>
      <small>Required: {inputs} · {findingCount} supporting verified finding(s)</small>
    </div>
  </article>
}
