'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, Check, CircleHelp, FileText, Fingerprint, MapPin, ScanSearch, ShieldCheck, X } from 'lucide-react'
import { samples, type Finding, type Sample } from '@/data/mock-data'
import { ExposureGuide } from '@/components/exposure-guide'
import { buildFields, exposureScore, runRules, type BuiltField, type Inference } from '@/lib/rules'
import { FIELDS, SIGNALS, type Signal } from '@/lib/taxonomy'
import type { Clause } from '@/lib/segment'
import type { FindingStage } from '@/lib/extract'
import type { ScanResponse } from '@/lib/scan'
import type { VerificationStats, VerifiedFinding } from '@/lib/verify'

type View = 'scan' | 'results' | 'ledger' | 'visual'
type PanelTab = 'Findings' | 'Profile' | 'Map'
type UIFinding = Omit<Finding, 'field'> & { field: string }

type ActiveRecord = {
  id: string
  name: string
  type: string
  color: string
  initials: string
  source: ScanResponse['source']
  clauses: Clause[]
  findings: UIFinding[]
  inferences: Inference[]
  fields: BuiltField[]
  stats: VerificationStats
  exposureScore: number
  warnings: string[]
  isSample: boolean
}

const groups = ['Data collected', 'What can be inferred', 'Rights you waive', 'Who it’s shared with']
const signalAliases: Record<string, Signal> = { 'Wi-Fi or Bluetooth': 'Wi-Fi or Bluetooth scanning' }

function sampleFacts(sample: Sample): VerifiedFinding[] {
  return sample.findings.flatMap((finding, index) => {
    if (!finding.verified || finding.stage === 'What can be inferred') return []
    const stage: FindingStage = finding.stage === 'Rights you waive'
      ? 'Rights you waive'
      : finding.stage === 'Who it’s shared with'
        ? 'Who it’s shared with'
        : 'Data collected'
    const field = stage === 'Data collected'
      ? FIELDS.find((candidate) => candidate.label === finding.field)?.label ?? null
      : null
    const signal = SIGNALS.find((candidate) => candidate === finding.field) ?? signalAliases[finding.field]
    const signals = (finding.signals ?? []).filter((candidate): candidate is Signal => SIGNALS.includes(candidate as Signal))
    return [{
      id: `seed-${sample.id}-${finding.id}-${index}`,
      clauseId: finding.clauseId,
      field,
      stage,
      category: finding.category,
      summary: finding.summary,
      severity: finding.severity,
      signals: [...signals, ...(signal ? [signal] : [])],
      quote: finding.quote,
      verified: true,
    }]
  })
}

function sampleRecord(sample: Sample): ActiveRecord {
  const facts = sampleFacts(sample)
  const inferences = runRules(facts)
  const inferenceStageFindings = sample.findings.map((finding) => ({ ...finding }))
  const findings: UIFinding[] = inferenceStageFindings.map((finding) => ({
    ...finding,
    signals: finding.signals ?? [],
  }))
  const factCount = sample.findings.filter((finding) => finding.stage !== 'What can be inferred').length
  return {
    id: sample.id,
    name: sample.name,
    type: sample.type,
    color: sample.color,
    initials: sample.initials,
    source: { name: sample.name, type: 'text' },
    clauses: sample.clauses,
    findings,
    inferences,
    fields: buildFields(facts, inferences),
    stats: { total: factCount, verified: facts.length, removed: Math.max(0, factCount - facts.length) },
    exposureScore: exposureScore(facts),
    warnings: [],
    isSample: true,
  }
}

function realRecord(result: ScanResponse): ActiveRecord {
  const initials = result.source.name.slice(0, 2).toUpperCase()
  return {
    ...result,
    id: `scan-${Date.now()}`,
    name: result.source.name,
    type: result.source.type === 'url' ? 'Privacy policy URL' : 'Pasted policy',
    color: '#6d7562',
    initials,
    findings: result.findings.map((finding) => ({ ...finding, field: finding.field ?? finding.category })),
    isSample: false,
  }
}

function verifiedSeedFindings(samplesList: Sample[], scans: ScanResponse[]): VerifiedFinding[] {
  return [
    ...samplesList.flatMap(sampleFacts),
    ...scans.flatMap((scan, scanIndex) => scan.findings.map((finding) => ({
      ...finding,
      id: `scan-${scanIndex}-${finding.id}`,
    }))),
  ]
}

export function TcXray() {
  const [view, setView] = useState<View>('scan')
  const [active, setActive] = useState<ActiveRecord>(() => sampleRecord(samples[0]))
  const [scans, setScans] = useState<ScanResponse[]>([])
  const [text, setText] = useState('')
  const [scanMode, setScanMode] = useState<'paste' | 'url'>('paste')
  const [policyUrl, setPolicyUrl] = useState('')
  const [tab, setTab] = useState<PanelTab>('Findings')
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [activeClause, setActiveClause] = useState('1.1')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const combinedInferences = useMemo(
    () => runRules(verifiedSeedFindings(samples, scans)),
    [scans],
  )

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('tcx.scans')
      if (saved) {
        const parsed: unknown = JSON.parse(saved)
        if (Array.isArray(parsed)) setScans(parsed as ScanResponse[])
      }
    } catch {
      setError('Saved scans could not be loaded from this browser.')
    }
  }, [])

  const runSample = (sample: Sample) => {
    const record = sampleRecord(sample)
    setActive(record)
    setText(sample.clauses.map((clause) => `${clause.id} ${clause.text}`).join('\n'))
    setView('results')
    setTab('Findings')
    setSelected(null)
    setActiveClause(sample.clauses[0]?.id ?? '1.1')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submitScan = async (body: { text?: string; url?: string }) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json() as { error?: { message?: string } } | ScanResponse
      if (!response.ok) {
        throw new Error('error' in payload ? payload.error?.message ?? 'The scan could not be completed.' : 'The scan could not be completed.')
      }
      const result = payload as ScanResponse
      const record = realRecord(result)
      setActive(record)
      setView('results')
      setTab('Findings')
      setSelected(null)
      setActiveClause(result.clauses[0]?.id ?? '1.1')
      const updatedScans = [result, ...scans]
      setScans(updatedScans)
      try {
        window.localStorage.setItem('tcx.scans', JSON.stringify(updatedScans))
      } catch {
        setError('Scan completed, but this browser could not save it to local storage.')
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The scan could not be completed.')
    } finally {
      setLoading(false)
    }
  }

  const validPolicyUrl = (() => {
    try {
      const parsed = new URL(policyUrl)
      return ['http:', 'https:'].includes(parsed.protocol)
    } catch {
      return false
    }
  })()

  const jump = (clauseId: string) => {
    setActiveClause(clauseId)
    document.getElementById(`clause-${clauseId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const appNames = Object.fromEntries(samples.map((sample) => [sample.initials, sample.name]))
  const ledgerRows = [
    ...samples.map((sample) => {
      const record = sampleRecord(sample)
      return { id: sample.id, name: record.name, color: record.color, initials: record.initials, fields: record.fields, score: record.exposureScore }
    }),
    ...scans.map((scan, index) => ({
      id: `scan-${index}`,
      name: scan.source.name,
      color: '#6d7562',
      initials: scan.source.name.slice(0, 2).toUpperCase(),
      fields: scan.fields,
      score: scan.exposureScore,
    })),
  ]

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#" onClick={(event) => { event.preventDefault(); setView('scan') }}><span className="brand-mark"><ScanSearch size={19}/></span><span>T&amp;C <b>X-ray</b></span></a><nav className="main-nav" aria-label="Main navigation"><button className={view === 'scan' ? 'nav-active' : ''} onClick={() => setView('scan')}>Scan</button><button className={view === 'ledger' ? 'nav-active' : ''} onClick={() => setView('ledger')}>Exposure ledger</button><button className={view === 'visual' ? 'nav-active' : ''} onClick={() => setView('visual')}>Visual guide</button></nav></header>
    {view === 'scan' && <main className="scan-page"><section className="scan-intro"><div><h1>Know what you&apos;re<br/> <em>really</em> agreeing to.</h1><p>See what an app&apos;s terms say it collects, what that could reveal, and who gets a copy.</p><button className="outline-button scan-visual-link" onClick={() => setView('visual')}>View <ArrowRight size={15}/></button></div></section><section className="scan-box"><div className="scan-mode-tabs" role="tablist" aria-label="Policy source"><button type="button" role="tab" aria-selected={scanMode === 'paste'} className={scanMode === 'paste' ? 'scan-mode-active' : ''} onClick={() => setScanMode('paste')}>Paste policy</button><button type="button" role="tab" aria-selected={scanMode === 'url'} className={scanMode === 'url' ? 'scan-mode-active' : ''} onClick={() => setScanMode('url')}>Enter URL</button></div>{scanMode === 'paste' ? <><label htmlFor="terms-input">Paste terms &amp; privacy policy</label><textarea id="terms-input" value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste the terms you want to understand…"/><div className="scan-box-bottom"><span><FileText size={14}/> Scans are saved in this browser only</span><button className="button-primary" onClick={() => void submitScan({ text })} disabled={!text.trim() || loading}>{loading ? 'Scanning…' : 'Scan terms'} {!loading && <ArrowRight size={16}/>}</button></div></> : <><label htmlFor="policy-url">Privacy policy URL</label><input id="policy-url" className="policy-url-input" type="url" inputMode="url" autoComplete="url" placeholder="https://example.com/privacy" value={policyUrl} onChange={(event) => setPolicyUrl(event.target.value)}/><div className="scan-box-bottom"><span><FileText size={14}/> Pages that need JavaScript can be pasted instead</span><button className="button-primary" onClick={() => void submitScan({ url: policyUrl })} disabled={!validPolicyUrl || loading}>{loading ? 'Scanning…' : 'Scan URL'} {!loading && <ArrowRight size={16}/>}</button></div></>}{error && <div className="removed-box" role="alert"><span className="removed-icon"><X size={13}/></span><div><b>Scan could not be completed</b><small>{error}</small></div></div>}</section><div className="sample-heading"><div><span className="section-kicker">NOT SURE WHERE TO START?</span><h2>Try a sample policy</h2></div><span className="sample-note">Mock results load instantly</span></div><div className="sample-grid">{samples.map((sample, index) => <button className="sample-card" key={sample.id} onClick={() => runSample(sample)}><div className="sample-icon" style={{ '--app-color': sample.color } as React.CSSProperties}>{sample.initials}</div><div className="sample-info"><span>{sample.type}</span><strong>{sample.name}</strong><small>{sample.clauses.length} clauses · {sample.findings.length} findings</small></div><ArrowRight className="sample-arrow" size={18}/><span className="sample-index">0{index + 1}</span></button>)}</div><div className="method-note"><ShieldCheck size={16}/><span>Collected facts are solid. Inferences are clearly marked <b>could</b> — never will.</span></div></main>}
    {view === 'results' && <main className="results-wrap"><div className="results-heading"><button className="back-link" onClick={() => setView('scan')}><ArrowLeft size={15}/> All scans</button><div className="results-title-row"><div><div className="section-kicker">POLICY SCAN / {active.type.toUpperCase()}</div><h1>{active.name}</h1><p>{active.clauses.length} clauses analyzed · {active.isSample ? 'Mock source document' : active.source.type === 'url' ? active.source.url : 'Pasted source document'}</p></div><button className="outline-button" onClick={() => setView('ledger')}>Open exposure ledger <ArrowRight size={15}/></button></div></div><div className="results-layout"><section className="source-column"><div className="source-header"><div><span className="section-kicker">SOURCE DOCUMENT</span><h2>Terms, numbered</h2></div><span className="source-count">{active.clauses.length} clauses</span></div><div className="clause-list">{active.clauses.map((clause, index) => <article className={`clause ${activeClause === clause.id ? 'clause-active' : ''}`} id={`clause-${clause.id}`} key={`${index}-${clause.id}`} onClick={() => setActiveClause(clause.id)}><span className="clause-number">{clause.id}</span><p>{clause.text}</p></article>)}</div><div className="source-tip"><ArrowDown size={15}/> Select a finding to locate its source</div></section><aside className="insights-panel"><div className="verified-summary"><span className="verified-icon"><ShieldCheck size={17}/></span><span><b>{active.stats.verified} of {active.stats.total} findings verified</b><small>{active.stats.removed} removed after review</small></span><button aria-label="About verification" className="quiet-icon"><CircleHelp size={15}/></button></div><div className="panel-tabs" role="tablist" aria-label="Analysis views">{(['Findings', 'Profile', 'Map'] as PanelTab[]).map((currentTab) => <button key={currentTab} role="tab" aria-selected={tab === currentTab} className={tab === currentTab ? 'tab-active' : ''} onClick={() => setTab(currentTab)}>{currentTab}</button>)}</div>{tab === 'Findings' && <div className="findings-content">{active.warnings.map((warning, index) => <section className="removed-box" key={`${warning}-${index}`}><span className="removed-icon"><CircleHelp size={13}/></span><div><b>Scan warning</b><small>{warning}</small></div></section>)}{groups.map((group) => {
      const list = active.findings.filter((finding) => finding.stage === group && finding.verified)
      return <section className="finding-group" key={group}><div className="group-heading"><h3>{group}</h3><span>{group === 'What can be inferred' ? active.inferences.length : list.length}</span></div>{group === 'What can be inferred' ? active.inferences.length ? active.inferences.map((inference) => <InferenceCard key={inference.ruleId} inference={inference}/>) : <div className="empty-group">No verified findings in this group</div> : list.length ? list.map((finding) => <FindingCard key={finding.id} finding={finding} onJump={() => jump(finding.clauseId)}/>) : <div className="empty-group">No verified findings in this group</div>}</section>
    })}<section className="removed-box"><span className="removed-icon"><X size={13}/></span><div><b>{active.findings.filter((finding) => !finding.verified).length} findings removed</b><small>{active.findings.filter((finding) => !finding.verified).map((finding) => finding.removedReason ?? 'Unverified claims are excluded from your profile.').join(' ') || 'Unverified claims are excluded from your profile.'}</small></div></section></div>}{tab === 'Profile' && <div className="profile-content"><div className="profile-card"><div className="profile-top"><div className="avatar">AR</div><div><span>EXAMPLE PERSONA</span><h3>Alex Rivera</h3><p>Fictional profile · not a real person</p></div><div className="profile-badge"><ShieldCheck size={14}/> {active.isSample ? 'DEMO' : 'POLICY'}</div></div><div className="profile-count"><strong>{active.fields.filter((field) => field.status !== 'not_found').length} <small>of {active.fields.length}</small></strong><span>fields exposed</span><div className="progress-track"><i style={{ width: `${active.fields.length ? active.fields.filter((field) => field.status !== 'not_found').length / active.fields.length * 100 : 0}%` }}/></div></div>{Array.from(new Set(FIELDS.map((field) => field.group))).map((group) => <div key={group}><p>{group}</p><div className="field-grid">{active.fields.filter((field) => field.group === group).map((field) => {
      const isCollected = field.status === 'collected'
      const isInferred = field.status === 'inferred'
      const reason = active.inferences.filter((inference) => field.ruleIds.includes(inference.ruleId)).map((inference) => inference.explanation).join(' ')
      return <button key={field.label} className={`field-tile ${isCollected ? 'field-collected' : 'field-inferred'} ${isCollected || isInferred ? 'field-lit' : ''}`} style={field.status === 'not_found' ? { opacity: 0.55 } : undefined} onClick={() => isInferred && setSelected(selected === field.label ? null : field.label)} aria-label={`${field.label}${isCollected ? ', collected' : isInferred ? ', inferred' : ', not found'}`}><span className="field-state">{isCollected ? <Check size={13}/> : <span className="inferred-label">{isInferred ? 'Inferred' : 'Not found'}</span>}</span><b>{field.label}</b><span className="app-initials">{active.isSample ? active.initials.split('').length && <i title={appNames[active.initials]}>{active.initials}</i> : null}</span>{selected === field.label && isInferred && <span className="reason-popover" role="status">{reason}</span>}</button>
    })}</div></div>)}</div><p className="profile-caveat">Dashed fields are possibilities, not facts. Select one to see the reasoning.</p><ul className="sr-only" aria-label="Exposed fields">{active.fields.filter((field) => field.status !== 'not_found').map((field) => <li key={field.label}>{field.label} — exposed in this policy.</li>)}</ul></div>}{tab === 'Map' && <div className="map-content"><div className="map-title"><span className="section-kicker">LOCATION PRECISION</span><h3>One person, closer in.</h3><p>Each permission adds another layer of detail.</p></div><div className="map-stepper">{['City', 'Neighborhood', 'Street & building', 'Two pins'].map((label, index) => <button key={label} onClick={() => setStep(index)} aria-current={step === index ? 'step' : undefined} className={step === index ? 'step-current' : ''}><i>{index + 1}</i><span>{label}</span></button>)}</div><div className="map-illustration"><NeighborhoodMap step={step}/><div className="map-caption"><MapPin size={14}/>{['IP address could suggest a city', 'Wi-Fi or Bluetooth could narrow the area', 'Precise location could reveal a street', 'Patterns could suggest home and office'][step]}</div></div><div className="map-controls"><button className="quiet-icon" aria-label="Previous stage" onClick={() => setStep(Math.max(0, step - 1))}><ArrowLeft size={16}/></button><span>Stage {step + 1} of 4</span><button className="quiet-icon" aria-label="Next stage" onClick={() => setStep(Math.min(3, step + 1))}><ArrowRight size={16}/></button></div></div>}</aside></div></main>}
    {view === 'visual' && <ExposureGuide onBack={() => setView('ledger')} inferences={combinedInferences}/>}
    {view === 'ledger' && <main className="ledger-page"><div className="ledger-heading"><span className="section-kicker">YOUR PRIVACY, ACROSS APPS</span><h1>Exposure ledger</h1><p>One app sees a slice. Together, they may reveal a lot more.</p><button className="outline-button visual-guide-link" onClick={() => setView('visual')}>See the visual guide <ArrowRight size={15}/></button></div><div className="ledger-card"><div className="ledger-top"><div><h2>Collected data by app</h2><p>Solid dots are verified collection. Inferences are shown separately.</p></div><span className="legend-dot"><i/> Verified collection</span></div><div className="table-scroll"><table><thead><tr><th>APP</th>{FIELDS.map((field) => <th key={field.label} title={field.label}>{field.label}</th>)}<th>EXPOSURE</th></tr></thead><tbody>{ledgerRows.map((row) => <tr key={row.id}><th><span className="ledger-app-icon" style={{ '--app-color': row.color } as React.CSSProperties}>{row.initials}</span>{row.name}</th>{FIELDS.map((field) => {
      const status = row.fields.find((item) => item.label === field.label)?.status
      return <td key={field.label}><span className={`matrix-dot ${status === 'collected' ? 'dot-filled' : ''}`} aria-label={status === 'collected' ? 'Verified data collected' : status === 'inferred' ? 'Inferred' : 'Not identified'}>{status === 'collected' ? '●' : status === 'inferred' ? '◌' : '—'}</span></td>
    })}<td><span className="score-pill">{row.score}<small>/100</small></span></td></tr>)}</tbody></table></div></div><section className="combined-panel"><div className="combined-icon"><Fingerprint size={21}/></div><div className="combined-body"><h2>Combined inference</h2><p>When signals from all scanned apps are considered together, these possibilities could emerge.</p><div className="inference-list">{combinedInferences.map((inference) => <div className="inference-row" key={inference.ruleId}><span className="rule-id">{inference.ruleId}</span><span><b>{inference.output}</b><small>{inference.explanation}</small></span><span className="could-label">Could infer</span></div>)}</div><p className="all-inputs-note"><ShieldCheck size={14}/> Rules only fire when every input is verified in the source documents.</p></div></section></main>}
    <footer className="site-footer"><span>T&amp;C X-ray <span className="footer-dot">·</span> Privacy, in plain sight.</span><b>Reading aid, not legal advice.</b></footer>
  </div>
}

function FindingCard({ finding, onJump }: { finding: UIFinding; onJump: () => void }) {
  return <article className="finding-card"><div className="finding-meta"><span className="category-tag">{finding.category}</span><span className="severity"><i className={`severity-mark severity-${finding.severity}`}>{finding.severity === 1 ? '!' : finding.severity === 2 ? '!!' : '!!!'}</i> Severity {finding.severity}</span></div><h4>{finding.summary}</h4><span className="verified-badge"><Check size={12}/> Verified against source</span><blockquote>“{finding.quote}”</blockquote><button className="jump-link" onClick={onJump}>Jump to clause {finding.clauseId}<ArrowRight size={13}/></button></article>
}

function InferenceCard({ inference }: { inference: Inference }) {
  return <article className="finding-card"><div className="finding-meta"><span className="category-tag">{inference.ruleId}</span><span className="could-label">Could infer</span></div><h4>{inference.output}</h4><p>{inference.explanation}</p><small>Based on {inference.supportingFindingIds.length} verified finding(s)</small></article>
}

function NeighborhoodMap({ step }: { step: number }) {
  return <svg viewBox="0 0 420 260" role="img" aria-label={`Illustrated neighborhood map, stage ${step + 1}`}><rect width="420" height="260" fill="#f3f1e9"/><path d="M0 42H420M0 126H420M0 210H420M58 0V260M171 0V260M288 0V260M370 0V260" stroke="#fff" strokeWidth="19"/><path d="M0 42H420M0 126H420M0 210H420M58 0V260M171 0V260M288 0V260M370 0V260" stroke="#d8d7cb" strokeWidth="1" strokeDasharray="5 5"/><g fill="#dfe8dc"><rect x="75" y="58" width="80" height="54" rx="7"/><rect x="188" y="142" width="82" height="55" rx="7"/><rect x="303" y="58" width="53" height="54" rx="7"/><rect x="75" y="226" width="80" height="24" rx="5"/></g><g fill="#8a987f" fontSize="9" fontFamily="sans-serif"><text x="90" y="88">PARK</text><text x="204" y="173">MARKET</text><text x="304" y="89">LIBRARY</text></g>{step > 0 && <circle cx="210" cy="126" r={step === 1 ? 24 : step === 2 ? 42 : 55} fill="#71816b" opacity=".12" stroke="#71816b" strokeWidth="2" strokeDasharray="5 4"/>}{step === 0 && <g><circle cx="210" cy="126" r="6" fill="#71816b"/><circle cx="210" cy="126" r="17" fill="none" stroke="#71816b" strokeWidth="2" opacity=".5"/></g>}{step >= 2 && <g><path d="M207 125L323 127" stroke="#71816b" strokeWidth="2" strokeDasharray="4 4"/><circle cx="210" cy="126" r="6" fill="#71816b"/><circle cx="323" cy="127" r="6" fill="#71816b"/></g>}{step === 3 && <g fontSize="10" fontFamily="sans-serif" fontWeight="700" fill="#53624f"><rect x="169" y="92" width="82" height="20" rx="10" fill="#fff"/><text x="178" y="106">could be home</text><rect x="281" y="94" width="89" height="20" rx="10" fill="#fff"/><text x="289" y="108">could be office</text></g>}</svg>
}
