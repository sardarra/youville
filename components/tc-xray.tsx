'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, Check, CircleHelp, FileText, Fingerprint, MapPin, ScanSearch, ShieldCheck, X } from 'lucide-react'
import { MyYouville } from '@/components/my-youville'
import { runRules, type Inference } from '@/lib/rules'
import { FIELDS } from '@/lib/taxonomy'
import type { ScanResponse } from '@/lib/scan'
import type { VerifiedFinding } from '@/lib/verify'

type View = 'scan' | 'results' | 'ledger'
type PanelTab = 'Findings' | 'Profile' | 'Location'

const groups = ['Data collected', 'What can be inferred', 'Rights you waive', 'Who it’s shared with']

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function combinedFindings(scans: ScanResponse[]): VerifiedFinding[] {
  return scans.flatMap((scan, scanIndex) => scan.findings.map((finding) => ({
    ...finding,
    id: `scan-${scanIndex}-${finding.id}`,
  })))
}

export function TcXray() {
  const [view, setView] = useState<View>('scan')
  const [active, setActive] = useState<ScanResponse | null>(null)
  const [scans, setScans] = useState<ScanResponse[]>([])
  const [text, setText] = useState('')
  const [scanMode, setScanMode] = useState<'paste' | 'url'>('paste')
  const [policyUrl, setPolicyUrl] = useState('')
  const [tab, setTab] = useState<PanelTab>('Findings')
  const [locationIndex, setLocationIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [activeClause, setActiveClause] = useState('1.1')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const combinedInferences = useMemo(() => runRules(combinedFindings(scans)), [scans])

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('tcx.scans')
      if (saved) {
        const parsed: unknown = JSON.parse(saved)
        if (Array.isArray(parsed)) setScans(parsed as ScanResponse[])
        else setError('Saved scans could not be loaded from this browser.')
      }
    } catch {
      setError('Saved scans could not be loaded from this browser.')
    }
  }, [])

  const openSavedScan = (scan: ScanResponse) => {
    setActive(scan)
    setView('results')
    setTab('Findings')
    setSelected(null)
    setLocationIndex(0)
    setActiveClause(scan.clauses[0]?.id ?? '1.1')
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
      const updatedScans = [result, ...scans]
      setScans(updatedScans)
      setActive(result)
      setView('results')
      setTab('Findings')
      setSelected(null)
      setLocationIndex(0)
      setActiveClause(result.clauses[0]?.id ?? '1.1')
      try {
        window.localStorage.setItem('tcx.scans', JSON.stringify(updatedScans))
      } catch {
        setActive((current) => current && ({
          ...current,
          warnings: [...current.warnings, 'Scan completed, but this browser could not save it to local storage.'],
        }))
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
      return ['http:', 'https:'].includes(new URL(policyUrl).protocol)
    } catch {
      return false
    }
  })()

  const jump = (clauseId: string) => {
    setActiveClause(clauseId)
    document.getElementById(`clause-${clauseId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const ledgerRows = scans.map((scan, index) => ({
    id: `${scan.source.url ?? scan.source.name}-${index}`,
    name: scan.source.name,
    initials: initials(scan.source.name),
    fields: scan.fields,
    score: scan.exposureScore,
  }))
  const locationOutputs = new Set(['Home address and street', 'Workplace or office', 'School', 'Daily schedule', 'City only', 'Neighborhood', 'Places visited, tied to face'])
  const locationInferences = active?.inferences.filter((inference) => locationOutputs.has(inference.output)) ?? []

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setView('scan') }}><span className="brand-mark"><ScanSearch size={19}/></span><span>T&amp;C <b>X-ray</b></span></a><nav className="main-nav" aria-label="Main navigation"><button className={view === 'scan' ? 'nav-active' : ''} onClick={() => setView('scan')}>Scan</button><button className={view === 'ledger' ? 'nav-active' : ''} onClick={() => setView('ledger')}>My Neighborhood</button></nav>
    </header>

    {view === 'scan' && <main className="scan-page"><section className="scan-intro"><div><h1>Know what you&apos;re<br/> <em>really</em> agreeing to.</h1><p>See what a company&apos;s terms say it collects, what that could reveal, and who gets a copy.</p><button className="outline-button scan-visual-link" onClick={() => setView('ledger')}>My Neighborhood <ArrowRight size={15}/></button></div></section><section className="scan-box"><div className="scan-mode-tabs" role="tablist" aria-label="Policy source"><button type="button" role="tab" aria-selected={scanMode === 'paste'} className={scanMode === 'paste' ? 'scan-mode-active' : ''} onClick={() => setScanMode('paste')}>Paste policy</button><button type="button" role="tab" aria-selected={scanMode === 'url'} className={scanMode === 'url' ? 'scan-mode-active' : ''} onClick={() => setScanMode('url')}>Enter URL</button></div>{scanMode === 'paste' ? <><label htmlFor="terms-input">Paste terms &amp; privacy policy</label><textarea id="terms-input" value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste the terms you want to understand…"/><div className="scan-box-bottom"><span><FileText size={14}/> Scans are saved in this browser only</span><button className="button-primary" onClick={() => void submitScan({ text })} disabled={!text.trim() || loading}>{loading ? 'Scanning…' : 'Scan terms'} {!loading && <ArrowRight size={16}/>}</button></div></> : <><label htmlFor="policy-url">Privacy policy URL</label><input id="policy-url" className="policy-url-input" type="url" inputMode="url" autoComplete="url" placeholder="https://" value={policyUrl} onChange={(event) => setPolicyUrl(event.target.value)}/><div className="scan-box-bottom"><span><FileText size={14}/> Pages that need JavaScript can be pasted instead</span><button className="button-primary" onClick={() => void submitScan({ url: policyUrl })} disabled={!validPolicyUrl || loading}>{loading ? 'Scanning…' : 'Scan URL'} {!loading && <ArrowRight size={16}/>}</button></div></>}{error && <div className="removed-box" role="alert"><span className="removed-icon"><X size={13}/></span><div><b>Scan could not be completed</b><small>{error}</small></div></div>}</section><div className="sample-heading"><div><span className="section-kicker">SAVED IN THIS BROWSER</span><h2>Recent policy scans</h2></div><span className="sample-note">{scans.length} saved scans</span></div>{scans.length ? <div className="sample-grid">{scans.map((scan, index) => <button className="sample-card" key={`${scan.source.url ?? scan.source.name}-${index}`} onClick={() => openSavedScan(scan)}><div className="sample-icon" style={{ '--app-color': '#6d7562' } as React.CSSProperties}>{initials(scan.source.name)}</div><div className="sample-info"><span>{scan.source.type === 'url' ? 'Policy URL' : 'Pasted policy'}</span><strong>{scan.source.name}</strong><small>{scan.clauses.length} clauses · {scan.stats.verified} verified findings</small></div><ArrowRight className="sample-arrow" size={18}/><span className="sample-index">0{index + 1}</span></button>)}</div> : <div className="method-note"><ShieldCheck size={16}/><span>Your scans will appear here after you scan a policy.</span></div>}<div className="method-note"><ShieldCheck size={16}/><span>Collected facts are solid. Inferences are clearly marked <b>could</b> — never will.</span></div></main>}
    {view === 'results' && active && <main className="results-wrap"><div className="results-heading"><button className="back-link" onClick={() => setView('scan')}><ArrowLeft size={15}/> All scans</button><div className="results-title-row"><div><div className="section-kicker">POLICY SCAN / {active.source.type.toUpperCase()}</div><h1>{active.source.name}</h1><p>{active.clauses.length} clauses analyzed · {active.source.type === 'url' ? active.source.url : 'Pasted source document'}</p></div><button className="outline-button" onClick={() => setView('ledger')}>Open exposure ledger <ArrowRight size={15}/></button></div></div><div className="results-layout"><section className="source-column"><div className="source-header"><div><span className="section-kicker">SOURCE DOCUMENT</span><h2>Terms, numbered</h2></div><span className="source-count">{active.clauses.length} clauses</span></div><div className="clause-list">{active.clauses.map((clause, index) => <article className={`clause ${activeClause === clause.id ? 'clause-active' : ''}`} id={`clause-${clause.id}`} key={`${index}-${clause.id}`} onClick={() => setActiveClause(clause.id)}><span className="clause-number">{clause.id}</span><p>{clause.text}</p></article>)}</div><div className="source-tip"><ArrowDown size={15}/> Select a finding to locate its source</div></section><aside className="insights-panel"><div className="verified-summary"><span className="verified-icon"><ShieldCheck size={17}/></span><span><b>{active.stats.verified} of {active.stats.total} findings verified</b><small>{active.stats.removed} removed after review</small></span><button aria-label="About verification" className="quiet-icon"><CircleHelp size={15}/></button></div><div className="panel-tabs" role="tablist" aria-label="Analysis views">{(['Findings', 'Profile', 'Location'] as PanelTab[]).map((currentTab) => <button key={currentTab} role="tab" aria-selected={tab === currentTab} className={tab === currentTab ? 'tab-active' : ''} onClick={() => setTab(currentTab)}>{currentTab}</button>)}</div>{tab === 'Findings' && <div className="findings-content">{active.warnings.map((warning, index) => <section className="removed-box" key={`${warning}-${index}`}><span className="removed-icon"><CircleHelp size={13}/></span><div><b>Scan warning</b><small>{warning}</small></div></section>)}{groups.map((group) => {
      const list = active.findings.filter((finding) => finding.stage === group && finding.verified)
      return <section className="finding-group" key={group}><div className="group-heading"><h3>{group}</h3><span>{group === 'What can be inferred' ? active.inferences.length : list.length}</span></div>{group === 'What can be inferred' ? active.inferences.length ? active.inferences.map((inference) => <InferenceCard key={inference.ruleId} inference={inference}/>) : <div className="empty-group">No verified findings in this group</div> : list.length ? list.map((finding) => <FindingCard key={finding.id} finding={finding} onJump={() => jump(finding.clauseId)}/>) : <div className="empty-group">No verified findings in this group</div>}</section>
    })}<section className="removed-box"><span className="removed-icon"><X size={13}/></span><div><b>{active.findings.filter((finding) => !finding.verified).length} findings removed</b><small>{active.findings.filter((finding) => !finding.verified).map((finding) => finding.removedReason ?? 'Unverified claims are excluded from your profile.').join(' ') || 'Unverified claims are excluded from your profile.'}</small></div></section></div>}{tab === 'Profile' && <div className="profile-content"><div className="profile-card"><div className="profile-top"><div className="avatar">{initials(active.source.name)}</div><div><span>POLICY PROFILE</span><h3>{active.source.name}</h3><p>Verified findings from this policy</p></div><div className="profile-badge"><ShieldCheck size={14}/> SOURCE</div></div><div className="profile-count"><strong>{active.fields.filter((field) => field.status !== 'not_found').length} <small>of {active.fields.length}</small></strong><span>fields exposed</span><div className="progress-track"><i style={{ width: `${active.fields.length ? active.fields.filter((field) => field.status !== 'not_found').length / active.fields.length * 100 : 0}%` }}/></div></div>{Array.from(new Set(FIELDS.map((field) => field.group))).map((group) => <div key={group}><p>{group}</p><div className="field-grid">{active.fields.filter((field) => field.group === group).map((field) => {
      const isCollected = field.status === 'collected'
      const isInferred = field.status === 'inferred'
      const reason = active.inferences.filter((inference) => field.ruleIds.includes(inference.ruleId)).map((inference) => inference.explanation).join(' ')
      return <button key={field.label} className={`field-tile ${isCollected ? 'field-collected' : 'field-inferred'} ${isCollected || isInferred ? 'field-lit' : ''}`} style={field.status === 'not_found' ? { opacity: 0.55 } : undefined} onClick={() => isInferred && setSelected(selected === field.label ? null : field.label)} aria-label={`${field.label}${isCollected ? ', collected' : isInferred ? ', inferred' : ', not found'}`}><span className="field-state">{isCollected ? <Check size={13}/> : <span className="inferred-label">{isInferred ? 'Inferred' : 'Not found'}</span>}</span><b>{field.label}</b><span className="app-initials"/>{selected === field.label && isInferred && <span className="reason-popover" role="status">{reason}</span>}</button>
    })}</div></div>)}</div><p className="profile-caveat">Dashed fields are possibilities, not facts. Select one to see the reasoning.</p><ul className="sr-only" aria-label="Exposed fields">{active.fields.filter((field) => field.status !== 'not_found').map((field) => <li key={field.label}>{field.label} — exposed in this policy.</li>)}</ul></div>}{tab === 'Location' && <div className="map-content"><div className="map-title"><span className="section-kicker">LOCATION SIGNALS</span><h3>Policy-derived possibilities</h3><p>Only location-related rules supported by verified findings appear here.</p></div>{locationInferences.length ? <><div className="map-stepper">{locationInferences.map((inference, index) => <button key={inference.ruleId} onClick={() => setLocationIndex(index)} aria-current={locationIndex === index ? 'step' : undefined} className={locationIndex === index ? 'step-current' : ''}><i>{index + 1}</i><span>{inference.output}</span></button>)}</div><div className="map-illustration"><div className="map-title"><span className="section-kicker">{locationInferences[locationIndex]?.ruleId}</span><h3>{locationInferences[locationIndex]?.output}</h3><p>{locationInferences[locationIndex]?.explanation}</p></div><div className="map-caption"><MapPin size={14}/>{locationInferences[locationIndex]?.supportingFindingIds.length} verified finding(s) support this rule output.</div></div><div className="map-controls"><button className="quiet-icon" aria-label="Previous inference" onClick={() => setLocationIndex(Math.max(0, locationIndex - 1))}><ArrowLeft size={16}/></button><span>{Math.min(locationIndex + 1, locationInferences.length)} of {locationInferences.length} location inferences</span><button className="quiet-icon" aria-label="Next inference" onClick={() => setLocationIndex(Math.min(locationInferences.length - 1, locationIndex + 1))}><ArrowRight size={16}/></button></div></> : <div className="empty-group">No location-related rule outputs are supported by this policy.</div>}</div>}</aside></div></main>}
    {view === 'ledger' && <main className="ledger-page">
      <MyYouville scans={scans} inferences={combinedInferences}/>
      <div className="ledger-heading"><span className="section-kicker">YOUR PRIVACY, ACROSS POLICIES</span><h1>Exposure ledger</h1><p>One policy sees a slice. Together, they may reveal more.</p></div>
      <div className="ledger-card"><div className="ledger-top"><div><h2>Collected data by policy</h2><p>Solid dots are verified collection. Inferences are shown separately.</p></div><span className="legend-dot"><i/> Verified collection</span></div><div className="table-scroll"><table><thead><tr><th>POLICY</th>{FIELDS.map((field) => <th key={field.label} title={field.label}>{field.label}</th>)}<th>EXPOSURE</th></tr></thead><tbody>{ledgerRows.map((row) => <tr key={row.id}><th><span className="ledger-app-icon" style={{ '--app-color': '#6d7562' } as React.CSSProperties}>{row.initials}</span>{row.name}</th>{FIELDS.map((field) => {
        const status = row.fields.find((item) => item.label === field.label)?.status
        return <td key={field.label}><span className={`matrix-dot ${status === 'collected' ? 'dot-filled' : ''}`} aria-label={status === 'collected' ? 'Verified data collected' : status === 'inferred' ? 'Inferred' : 'Not identified'}>{status === 'collected' ? '●' : status === 'inferred' ? '◌' : '—'}</span></td>
      })}<td><span className="score-pill">{row.score}<small>/100</small></span></td></tr>)}</tbody></table></div></div>
      {!scans.length && <div className="method-note"><ShieldCheck size={16}/><span>Scan a policy to add verified results to your ledger.</span></div>}
      <section className="combined-panel"><div className="combined-icon"><Fingerprint size={21}/></div><div className="combined-body"><h2>Combined inference</h2><p>When signals from all saved policies are considered together, these possibilities could emerge.</p><div className="inference-list">{combinedInferences.map((inference) => <div className="inference-row" key={inference.ruleId}><span className="rule-id">{inference.ruleId}</span><span><b>{inference.output}</b><small>{inference.explanation}</small></span><span className="could-label">Could infer</span></div>)}</div><p className="all-inputs-note"><ShieldCheck size={14}/> Rules only fire when every input is verified in the source documents.</p></div></section>
    </main>}
    <footer className="site-footer"><span>T&amp;C X-ray <span className="footer-dot">·</span> Privacy, in plain sight.</span><b>Reading aid, not legal advice.</b></footer>
  </div>
}

function FindingCard({ finding, onJump }: { finding: VerifiedFinding; onJump: () => void }) {
  return <article className="finding-card"><div className="finding-meta"><span className="category-tag">{finding.category}</span><span className="severity"><i className={`severity-mark severity-${finding.severity}`}>{finding.severity === 1 ? '!' : finding.severity === 2 ? '!!' : '!!!'}</i> Severity {finding.severity}</span></div><h4>{finding.summary}</h4><span className="verified-badge"><Check size={12}/> Verified against source</span><blockquote>“{finding.quote}”</blockquote><button className="jump-link" onClick={onJump}>Jump to clause {finding.clauseId}<ArrowRight size={13}/></button></article>
}

function InferenceCard({ inference }: { inference: Inference }) {
  return <article className="finding-card"><div className="finding-meta"><span className="category-tag">{inference.ruleId}</span><span className="could-label">Could infer</span></div><h4>{inference.output}</h4><p>{inference.explanation}</p><small>Based on {inference.supportingFindingIds.length} verified finding(s)</small></article>
}

