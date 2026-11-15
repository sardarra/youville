'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  FileText,
  Fingerprint,
  MapPin,
  ScanSearch,
  ShieldCheck,
  X,
} from 'lucide-react'
import { MyYouville } from '@/components/my-youville'
import { runRules, type Inference } from '@/lib/rules'
import { FIELDS } from '@/lib/taxonomy'
import { inferPolicyName } from '@/lib/policy-name'
import type { ScanResponse } from '@/lib/scan'
import type { VerifiedFinding } from '@/lib/verify'

type View = 'scan' | 'results' | 'ledger'
type PanelTab = 'Findings' | 'Profile' | 'Location'
type ScanInput = { text?: string; url?: string }
type LedgerRow = {
  id: string
  name: string
  initials: string
  fields: ScanResponse['fields']
  score: number
}

const findingGroups = [
  'Data collected',
  'What can be inferred',
  'Rights you waive',
  'Who it’s shared with',
]

const analysisTabs: PanelTab[] = ['Findings', 'Profile', 'Location']

const locationOutputs = new Set([
  'Home address and street',
  'Workplace or office',
  'School',
  'Daily schedule',
  'City only',
  'Neighborhood',
  'Places visited, tied to face',
])

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function combinedFindings(scans: ScanResponse[]): VerifiedFinding[] {
  return scans.flatMap((scan, scanIndex) =>
    scan.findings.map((finding) => ({
      ...finding,
      id: `scan-${scanIndex}-${finding.id}`,
    })),
  )
}

function isValidPolicyUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
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
  const [selectedField, setSelectedField] = useState<string | null>(null)
  const [activeClause, setActiveClause] = useState('1.1')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const combinedInferences = useMemo(
    () => runRules(combinedFindings(scans)),
    [scans],
  )

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('tcx.scans')
      if (!saved) return

      const parsed: unknown = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        const restoredScans = (parsed as ScanResponse[]).map((scan) => {
          if (scan.source.type !== 'text' || scan.source.name !== 'Pasted policy') {
            return scan
          }

          const inferredName = inferPolicyName(
            scan.clauses.map((clause) => clause.text).join('\n'),
          )
          return inferredName
            ? { ...scan, source: { ...scan.source, name: inferredName } }
            : scan
        })

        setScans(restoredScans)
      } else {
        setError('Saved scans could not be loaded from this browser.')
      }
    } catch {
      setError('Saved scans could not be loaded from this browser.')
    }
  }, [])

  const resetResultsState = (scan: ScanResponse) => {
    setTab('Findings')
    setSelectedField(null)
    setLocationIndex(0)
    setActiveClause(scan.clauses[0]?.id ?? '1.1')
  }

  const openSavedScan = (scan: ScanResponse) => {
    setActive(scan)
    setView('results')
    resetResultsState(scan)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submitScan = async (body: ScanInput) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = (await response.json()) as
        | { error?: { message?: string } }
        | ScanResponse

      if (!response.ok) {
        const message =
          'error' in payload
            ? payload.error?.message ?? 'The scan could not be completed.'
            : 'The scan could not be completed.'
        throw new Error(message)
      }

      const result = payload as ScanResponse
      const updatedScans = [result, ...scans]

      setScans(updatedScans)
      setActive(result)
      setView('results')
      resetResultsState(result)

      try {
        window.localStorage.setItem('tcx.scans', JSON.stringify(updatedScans))
      } catch {
        setActive((current) =>
          current && {
            ...current,
            warnings: [
              ...current.warnings,
              'Scan completed, but this browser could not save it to local storage.',
            ],
          },
        )
      }

      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The scan could not be completed.',
      )
    } finally {
      setLoading(false)
    }
  }

  const jumpToClause = (clauseId: string) => {
    setActiveClause(clauseId)
    document
      .getElementById(`clause-${clauseId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const ledgerRows: LedgerRow[] = scans.map((scan, index) => ({
    id: `${scan.source.url ?? scan.source.name}-${index}`,
    name: scan.source.name,
    initials: initials(scan.source.name),
    fields: scan.fields,
    score: scan.exposureScore,
  }))

  const locationInferences =
    active?.inferences.filter((inference) =>
      locationOutputs.has(inference.output),
    ) ?? []

  return (
    <div
      className={`app-shell ${
        view === 'ledger' ? 'app-shell-neighborhood' : ''
      }`}
    >
      <SiteHeader view={view} onChangeView={setView} />

      {view === 'scan' && (
        <ScanPage
          scans={scans}
          text={text}
          scanMode={scanMode}
          policyUrl={policyUrl}
          loading={loading}
          error={error}
          isPolicyUrlValid={isValidPolicyUrl(policyUrl)}
          onTextChange={setText}
          onScanModeChange={setScanMode}
          onPolicyUrlChange={setPolicyUrl}
          onSubmit={submitScan}
          onOpenSavedScan={openSavedScan}
          onOpenNeighborhood={() => setView('ledger')}
        />
      )}

      {view === 'results' && active && (
        <ResultsPage
          scan={active}
          tab={tab}
          locationIndex={locationIndex}
          selectedField={selectedField}
          activeClause={activeClause}
          locationInferences={locationInferences}
          onBack={() => setView('scan')}
          onOpenNeighborhood={() => setView('ledger')}
          onTabChange={setTab}
          onLocationIndexChange={setLocationIndex}
          onFieldSelect={(field) =>
            setSelectedField(selectedField === field ? null : field)
          }
          onClauseSelect={setActiveClause}
          onJumpToClause={jumpToClause}
        />
      )}

      {view === 'ledger' && (
        <LedgerPage scans={scans} rows={ledgerRows} inferences={combinedInferences} />
      )}

      <SiteFooter />
    </div>
  )
}

function SiteHeader({
  view,
  onChangeView,
}: {
  view: View
  onChangeView: (view: View) => void
}) {
  return (
    <header className="topbar">
      <a
        className="brand"
        href="#"
        onClick={(event) => {
          event.preventDefault()
          onChangeView('scan')
        }}
      >
        <span className="brand-mark">
          <ScanSearch size={19} />
        </span>
        <span>
          <b>You</b>ville
        </span>
      </a>
      <nav className="main-nav" aria-label="Main navigation">
        <button
          className={view === 'scan' ? 'nav-active' : ''}
          onClick={() => onChangeView('scan')}
        >
          Scan
        </button>
        <button
          className={view === 'ledger' ? 'nav-active' : ''}
          onClick={() => onChangeView('ledger')}
        >
          My Neighborhood
        </button>
      </nav>
    </header>
  )
}

function ScanPage({
  scans,
  text,
  scanMode,
  policyUrl,
  loading,
  error,
  isPolicyUrlValid,
  onTextChange,
  onScanModeChange,
  onPolicyUrlChange,
  onSubmit,
  onOpenSavedScan,
  onOpenNeighborhood,
}: {
  scans: ScanResponse[]
  text: string
  scanMode: 'paste' | 'url'
  policyUrl: string
  loading: boolean
  error: string | null
  isPolicyUrlValid: boolean
  onTextChange: (value: string) => void
  onScanModeChange: (mode: 'paste' | 'url') => void
  onPolicyUrlChange: (value: string) => void
  onSubmit: (body: ScanInput) => Promise<void>
  onOpenSavedScan: (scan: ScanResponse) => void
  onOpenNeighborhood: () => void
}) {
  return (
    <main className="scan-page">
      <ScanIntroduction onOpenNeighborhood={onOpenNeighborhood} />
      <PolicyForm
        text={text}
        scanMode={scanMode}
        policyUrl={policyUrl}
        loading={loading}
        error={error}
        isPolicyUrlValid={isPolicyUrlValid}
        onTextChange={onTextChange}
        onScanModeChange={onScanModeChange}
        onPolicyUrlChange={onPolicyUrlChange}
        onSubmit={onSubmit}
      />
      <RecentScans scans={scans} onOpenSavedScan={onOpenSavedScan} />
      <MethodNote>
        Collected facts are solid. Inferences are clearly marked <b>could</b> —
        never will.
      </MethodNote>
    </main>
  )
}

function ScanIntroduction({
  onOpenNeighborhood,
}: {
  onOpenNeighborhood: () => void
}) {
  return (
    <section className="scan-intro">
      <div>
        <h1>
          A neighborhood of you
          <br />
          <em>based on what companies collect</em>
        </h1>
        <p>
          See what a company&apos;s terms say it collects, what that could
          reveal, and who gets a copy.
        </p>
        <button
          className="outline-button scan-visual-link"
          onClick={onOpenNeighborhood}
        >
          My Neighborhood <ArrowRight size={15} />
        </button>
      </div>
    </section>
  )
}

function PolicyForm({
  text,
  scanMode,
  policyUrl,
  loading,
  error,
  isPolicyUrlValid,
  onTextChange,
  onScanModeChange,
  onPolicyUrlChange,
  onSubmit,
}: {
  text: string
  scanMode: 'paste' | 'url'
  policyUrl: string
  loading: boolean
  error: string | null
  isPolicyUrlValid: boolean
  onTextChange: (value: string) => void
  onScanModeChange: (mode: 'paste' | 'url') => void
  onPolicyUrlChange: (value: string) => void
  onSubmit: (body: ScanInput) => Promise<void>
}) {
  return (
    <section className="scan-box">
      <div
        className="scan-mode-tabs"
        role="tablist"
        aria-label="Policy source"
      >
        <button
          type="button"
          role="tab"
          aria-selected={scanMode === 'paste'}
          className={scanMode === 'paste' ? 'scan-mode-active' : ''}
          onClick={() => onScanModeChange('paste')}
        >
          Paste policy
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scanMode === 'url'}
          className={scanMode === 'url' ? 'scan-mode-active' : ''}
          onClick={() => onScanModeChange('url')}
        >
          Enter URL
        </button>
      </div>

      {scanMode === 'paste' ? (
        <PastePolicyForm
          text={text}
          loading={loading}
          onTextChange={onTextChange}
          onSubmit={() => onSubmit({ text })}
        />
      ) : (
        <UrlPolicyForm
          policyUrl={policyUrl}
          loading={loading}
          isPolicyUrlValid={isPolicyUrlValid}
          onPolicyUrlChange={onPolicyUrlChange}
          onSubmit={() => onSubmit({ url: policyUrl })}
        />
      )}

      {error && <ScanError message={error} />}
    </section>
  )
}

function PastePolicyForm({
  text,
  loading,
  onTextChange,
  onSubmit,
}: {
  text: string
  loading: boolean
  onTextChange: (value: string) => void
  onSubmit: () => Promise<void>
}) {
  return (
    <>
      <label htmlFor="terms-input">Paste terms &amp; privacy policy</label>
      <textarea
        id="terms-input"
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder="Paste the terms you want to understand…"
      />
      <div className="scan-box-bottom">
        <span>
          <FileText size={14} /> Scans are saved in this browser only
        </span>
        <button
          className="button-primary"
          onClick={() => void onSubmit()}
          disabled={!text.trim() || loading}
        >
          {loading ? 'Scanning…' : 'Scan terms'}
          {!loading && <ArrowRight size={16} />}
        </button>
      </div>
    </>
  )
}

function UrlPolicyForm({
  policyUrl,
  loading,
  isPolicyUrlValid,
  onPolicyUrlChange,
  onSubmit,
}: {
  policyUrl: string
  loading: boolean
  isPolicyUrlValid: boolean
  onPolicyUrlChange: (value: string) => void
  onSubmit: () => Promise<void>
}) {
  return (
    <>
      <label htmlFor="policy-url">Privacy policy URL</label>
      <input
        id="policy-url"
        className="policy-url-input"
        type="url"
        inputMode="url"
        autoComplete="url"
        placeholder="https://"
        value={policyUrl}
        onChange={(event) => onPolicyUrlChange(event.target.value)}
      />
      <div className="scan-box-bottom">
        <span>
          <FileText size={14} /> Pages that need JavaScript can be pasted
          instead
        </span>
        <button
          className="button-primary"
          onClick={() => void onSubmit()}
          disabled={!isPolicyUrlValid || loading}
        >
          {loading ? 'Scanning…' : 'Scan URL'}
          {!loading && <ArrowRight size={16} />}
        </button>
      </div>
    </>
  )
}

function ScanError({ message }: { message: string }) {
  return (
    <div className="removed-box" role="alert">
      <span className="removed-icon">
        <X size={13} />
      </span>
      <div>
        <b>Scan could not be completed</b>
        <small>{message}</small>
      </div>
    </div>
  )
}

function RecentScans({
  scans,
  onOpenSavedScan,
}: {
  scans: ScanResponse[]
  onOpenSavedScan: (scan: ScanResponse) => void
}) {
  return (
    <>
      <div className="sample-heading">
        <div>
          <span className="section-kicker">SAVED IN THIS BROWSER</span>
          <h2>Recent policy scans</h2>
        </div>
        <span className="sample-note">{scans.length} saved scans</span>
      </div>

      {scans.length ? (
        <div className="sample-grid">
          {scans.map((scan, index) => (
            <button
              className="sample-card"
              key={`${scan.source.url ?? scan.source.name}-${index}`}
              onClick={() => onOpenSavedScan(scan)}
            >
              <span
                className="sample-icon"
                style={{ '--app-color': '#6d7562' } as CSSProperties}
              >
                {initials(scan.source.name)}
              </span>
              <span className="sample-info">
                <span>
                  {scan.source.type === 'url' ? 'Policy URL' : 'Pasted policy'}
                </span>
                <strong>{scan.source.name}</strong>
                <small>
                  {scan.clauses.length} clauses · {scan.stats.verified} verified
                  findings
                </small>
              </span>
              <ArrowRight className="sample-arrow" size={18} />
              <span className="sample-index">0{index + 1}</span>
            </button>
          ))}
        </div>
      ) : (
        <MethodNote>
          Your scans will appear here after you scan a policy.
        </MethodNote>
      )}
    </>
  )
}

function MethodNote({ children }: { children: ReactNode }) {
  return (
    <div className="method-note">
      <ShieldCheck size={16} />
      <span>{children}</span>
    </div>
  )
}

function ResultsPage({
  scan,
  tab,
  locationIndex,
  selectedField,
  activeClause,
  locationInferences,
  onBack,
  onOpenNeighborhood,
  onTabChange,
  onLocationIndexChange,
  onFieldSelect,
  onClauseSelect,
  onJumpToClause,
}: {
  scan: ScanResponse
  tab: PanelTab
  locationIndex: number
  selectedField: string | null
  activeClause: string
  locationInferences: Inference[]
  onBack: () => void
  onOpenNeighborhood: () => void
  onTabChange: (tab: PanelTab) => void
  onLocationIndexChange: (index: number) => void
  onFieldSelect: (field: string) => void
  onClauseSelect: (clauseId: string) => void
  onJumpToClause: (clauseId: string) => void
}) {
  return (
    <main className="results-wrap">
      <ResultsHeading
        scan={scan}
        onBack={onBack}
        onOpenNeighborhood={onOpenNeighborhood}
      />

      <div className="results-layout">
        <SourceDocument
          scan={scan}
          activeClause={activeClause}
          onClauseSelect={onClauseSelect}
        />
        <aside className="insights-panel">
          <VerifiedSummary scan={scan} />
          <AnalysisTabs activeTab={tab} onTabChange={onTabChange} />

          {tab === 'Findings' && (
            <FindingsPanel scan={scan} onJumpToClause={onJumpToClause} />
          )}
          {tab === 'Profile' && (
            <ProfilePanel
              scan={scan}
              selectedField={selectedField}
              onFieldSelect={onFieldSelect}
            />
          )}
          {tab === 'Location' && (
            <LocationPanel
              inferences={locationInferences}
              activeIndex={locationIndex}
              onIndexChange={onLocationIndexChange}
            />
          )}
        </aside>
      </div>
    </main>
  )
}

function ResultsHeading({
  scan,
  onBack,
  onOpenNeighborhood,
}: {
  scan: ScanResponse
  onBack: () => void
  onOpenNeighborhood: () => void
}) {
  return (
    <div className="results-heading">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={15} /> All scans
      </button>
      <div className="results-title-row">
        <div>
          <div className="section-kicker">
            POLICY SCAN / {scan.source.type.toUpperCase()}
          </div>
          <h1>{scan.source.name}</h1>
          <p>
            {scan.clauses.length} clauses analyzed ·{' '}
            {scan.source.type === 'url'
              ? scan.source.url
              : 'Pasted source document'}
          </p>
        </div>
        <button className="outline-button" onClick={onOpenNeighborhood}>
          Open exposure ledger <ArrowRight size={15} />
        </button>
      </div>
    </div>
  )
}

function SourceDocument({
  scan,
  activeClause,
  onClauseSelect,
}: {
  scan: ScanResponse
  activeClause: string
  onClauseSelect: (clauseId: string) => void
}) {
  return (
    <section className="source-column">
      <div className="source-header">
        <div>
          <span className="section-kicker">SOURCE DOCUMENT</span>
          <h2>Terms, numbered</h2>
        </div>
        <span className="source-count">{scan.clauses.length} clauses</span>
      </div>
      <div className="clause-list">
        {scan.clauses.map((clause, index) => (
          <article
            className={`clause ${
              activeClause === clause.id ? 'clause-active' : ''
            }`}
            id={`clause-${clause.id}`}
            key={`${index}-${clause.id}`}
            onClick={() => onClauseSelect(clause.id)}
          >
            <span className="clause-number">{clause.id}</span>
            <p>{clause.text}</p>
          </article>
        ))}
      </div>
      <div className="source-tip">
        <ArrowDown size={15} /> Select a finding to locate its source
      </div>
    </section>
  )
}

function VerifiedSummary({ scan }: { scan: ScanResponse }) {
  return (
    <div className="verified-summary">
      <span className="verified-icon">
        <ShieldCheck size={17} />
      </span>
      <span>
        <b>
          {scan.stats.verified} of {scan.stats.total} findings verified
        </b>
        <small>{scan.stats.removed} removed after review</small>
      </span>
      <button
        aria-label="About verification"
        className="quiet-icon"
        type="button"
      >
        <CircleHelp size={15} />
      </button>
    </div>
  )
}

function AnalysisTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: PanelTab
  onTabChange: (tab: PanelTab) => void
}) {
  return (
    <div
      className="panel-tabs"
      role="tablist"
      aria-label="Analysis views"
    >
      {analysisTabs.map((tab) => (
        <button
          key={tab}
          role="tab"
          aria-selected={activeTab === tab}
          className={activeTab === tab ? 'tab-active' : ''}
          onClick={() => onTabChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

function FindingsPanel({
  scan,
  onJumpToClause,
}: {
  scan: ScanResponse
  onJumpToClause: (clauseId: string) => void
}) {
  const unverifiedFindings = scan.findings.filter(
    (finding) => !finding.verified,
  )

  return (
    <div className="findings-content">
      {scan.warnings.map((warning, index) => (
        <div className="removed-box" key={`${warning}-${index}`}>
          <span className="removed-icon">
            <CircleHelp size={13} />
          </span>
          <div>
            <b>Scan warning</b>
            <small>{warning}</small>
          </div>
        </div>
      ))}

      {findingGroups.map((group) => {
        const findings = scan.findings.filter(
          (finding) => finding.stage === group && finding.verified,
        )
        const count =
          group === 'What can be inferred'
            ? scan.inferences.length
            : findings.length

        return (
          <section className="finding-group" key={group}>
            <div className="group-heading">
              <h3>{group}</h3>
              <span>{count}</span>
            </div>

            {group === 'What can be inferred' ? (
              scan.inferences.length ? (
                scan.inferences.map((inference) => (
                  <InferenceCard
                    key={inference.ruleId}
                    inference={inference}
                  />
                ))
              ) : (
                <div className="empty-group">
                  No verified findings in this group
                </div>
              )
            ) : findings.length ? (
              findings.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  onJump={() => onJumpToClause(finding.clauseId)}
                />
              ))
            ) : (
              <div className="empty-group">
                No verified findings in this group
              </div>
            )}
          </section>
        )
      })}

      <RemovedFindings findings={unverifiedFindings} />
    </div>
  )
}

function RemovedFindings({ findings }: { findings: VerifiedFinding[] }) {
  const explanation =
    findings
      .map(
        (finding) =>
          finding.removedReason ??
          'Unverified claims are excluded from your profile.',
      )
      .join(' ') || 'Unverified claims are excluded from your profile.'

  return (
    <div className="removed-box">
      <span className="removed-icon">
        <X size={13} />
      </span>
      <div>
        <b>{findings.length} findings removed</b>
        <small>{explanation}</small>
      </div>
    </div>
  )
}

function ProfilePanel({
  scan,
  selectedField,
  onFieldSelect,
}: {
  scan: ScanResponse
  selectedField: string | null
  onFieldSelect: (field: string) => void
}) {
  const exposedFieldCount = scan.fields.filter(
    (field) => field.status !== 'not_found',
  ).length
  const exposedFieldPercent = scan.fields.length
    ? (exposedFieldCount / scan.fields.length) * 100
    : 0
  const fieldGroups = Array.from(new Set(FIELDS.map((field) => field.group)))

  return (
    <div className="profile-content">
      <div className="profile-card">
        <div className="profile-top">
          <div className="avatar">{initials(scan.source.name)}</div>
          <div>
            <span>POLICY PROFILE</span>
            <h3>{scan.source.name}</h3>
            <p>Verified findings from this policy</p>
          </div>
          <div className="profile-badge">
            <ShieldCheck size={14} /> SOURCE
          </div>
        </div>

        <div className="profile-count">
          <strong>
            {exposedFieldCount} <small>of {scan.fields.length}</small>
          </strong>
          <span>fields exposed</span>
          <div className="progress-track">
            <i style={{ width: `${exposedFieldPercent}%` }} />
          </div>
        </div>

        {fieldGroups.map((group) => (
          <div key={group}>
            <p>{group}</p>
            <div className="field-grid">
              {scan.fields
                .filter((field) => field.group === group)
                .map((field) => (
                  <ProfileField
                    key={field.label}
                    scan={scan}
                    field={field}
                    selected={selectedField === field.label}
                    onSelect={() => onFieldSelect(field.label)}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>

      <p className="profile-caveat">
        Dashed fields are possibilities, not facts. Select one to see the
        reasoning.
      </p>
      <ul className="sr-only" aria-label="Exposed fields">
        {scan.fields
          .filter((field) => field.status !== 'not_found')
          .map((field) => (
            <li key={field.label}>{field.label} — exposed in this policy.</li>
          ))}
      </ul>
    </div>
  )
}

function ProfileField({
  scan,
  field,
  selected,
  onSelect,
}: {
  scan: ScanResponse
  field: ScanResponse['fields'][number]
  selected: boolean
  onSelect: () => void
}) {
  const isCollected = field.status === 'collected'
  const isInferred = field.status === 'inferred'
  const reason = scan.inferences
    .filter((inference) => field.ruleIds.includes(inference.ruleId))
    .map((inference) => inference.explanation)
    .join(' ')

  return (
    <button
      className={`field-tile ${isCollected ? 'field-collected' : 'field-inferred'} ${
        isCollected || isInferred ? 'field-lit' : ''
      }`}
      style={field.status === 'not_found' ? { opacity: 0.55 } : undefined}
      onClick={() => isInferred && onSelect()}
      aria-label={`${field.label}${
        isCollected ? ', collected' : isInferred ? ', inferred' : ', not found'
      }`}
    >
      <span className="field-state">
        {isCollected ? (
          <Check size={13} />
        ) : (
          <span className="inferred-label">
            {isInferred ? 'Inferred' : 'Not found'}
          </span>
        )}
      </span>
      <b>{field.label}</b>
      <span className="app-initials" />
      {selected && isInferred && (
        <span className="reason-popover" role="status">
          {reason}
        </span>
      )}
    </button>
  )
}

function LocationPanel({
  inferences,
  activeIndex,
  onIndexChange,
}: {
  inferences: Inference[]
  activeIndex: number
  onIndexChange: (index: number) => void
}) {
  const activeInference = inferences[activeIndex]

  return (
    <div className="map-content">
      <div className="map-title">
        <span className="section-kicker">LOCATION SIGNALS</span>
        <h3>Policy-derived possibilities</h3>
        <p>
          Only location-related rules supported by verified findings appear
          here.
        </p>
      </div>

      {activeInference ? (
        <>
          <div className="map-stepper">
            {inferences.map((inference, index) => (
              <button
                key={inference.ruleId}
                onClick={() => onIndexChange(index)}
                aria-current={activeIndex === index ? 'step' : undefined}
                className={activeIndex === index ? 'step-current' : ''}
              >
                <i>{index + 1}</i>
                <span>{inference.output}</span>
              </button>
            ))}
          </div>

          <div className="map-illustration">
            <div className="map-title">
              <span className="section-kicker">
                {activeInference.ruleId}
              </span>
              <h3>{activeInference.output}</h3>
              <p>{activeInference.explanation}</p>
            </div>
            <div className="map-caption">
              <MapPin size={14} />
              {activeInference.supportingFindingIds.length} verified
              finding(s) support this rule output.
            </div>
          </div>

          <div className="map-controls">
            <button
              className="quiet-icon"
              aria-label="Previous inference"
              onClick={() => onIndexChange(Math.max(0, activeIndex - 1))}
            >
              <ArrowLeft size={16} />
            </button>
            <span>
              {activeIndex + 1} of {inferences.length} location inferences
            </span>
            <button
              className="quiet-icon"
              aria-label="Next inference"
              onClick={() =>
                onIndexChange(Math.min(inferences.length - 1, activeIndex + 1))
              }
            >
              <ArrowRight size={16} />
            </button>
          </div>
        </>
      ) : (
        <div className="empty-group">
          No location-related rule outputs are supported by this policy.
        </div>
      )}
    </div>
  )
}

function LedgerPage({
  scans,
  rows,
  inferences,
}: {
  scans: ScanResponse[]
  rows: LedgerRow[]
  inferences: Inference[]
}) {
  return (
    <main className="ledger-page">
      <MyYouville scans={scans} inferences={inferences} />
      <div className="ledger-heading">
        <span className="section-kicker">YOUR PRIVACY, ACROSS POLICIES</span>
        <h1>Exposure ledger</h1>
        <p>One policy sees a slice. Together, they may reveal more.</p>
      </div>

      <ExposureTable rows={rows} />

      {!scans.length && (
        <MethodNote>
          Scan a policy to add verified results to your ledger.
        </MethodNote>
      )}

      <CombinedInferencePanel inferences={inferences} />
    </main>
  )
}

function ExposureTable({
  rows,
}: { rows: LedgerRow[] }) {
  return (
    <div className="ledger-card">
      <div className="ledger-top">
        <div>
          <h2>Collected data by policy</h2>
          <p>Solid dots are verified collection. Inferences are shown separately.</p>
        </div>
        <span className="legend-dot">
          <i /> Verified collection
        </span>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>POLICY</th>
              {FIELDS.map((field) => (
                <th key={field.label} title={field.label}>
                  {field.label}
                </th>
              ))}
              <th>EXPOSURE</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th>
                  <span
                    className="ledger-app-icon"
                    style={{ '--app-color': '#6d7562' } as CSSProperties}
                  >
                    {row.initials}
                  </span>
                  {row.name}
                </th>
                {FIELDS.map((field) => (
                  <ExposureCell
                    key={field.label}
                    status={
                      row.fields.find((item) => item.label === field.label)
                        ?.status
                    }
                  />
                ))}
                <td>
                  <span className="score-pill">
                    {row.score}
                    <small>/100</small>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ExposureCell({
  status,
}: {
  status: ScanResponse['fields'][number]['status'] | undefined
}) {
  const label =
    status === 'collected'
      ? 'Verified data collected'
      : status === 'inferred'
        ? 'Inferred'
        : 'Not identified'
  const value =
    status === 'collected' ? '●' : status === 'inferred' ? '◌' : '—'

  return (
    <td>
      <span
        className={`matrix-dot ${status === 'collected' ? 'dot-filled' : ''}`}
        aria-label={label}
      >
        {value}
      </span>
    </td>
  )
}

function CombinedInferencePanel({
  inferences,
}: {
  inferences: Inference[]
}) {
  return (
    <section className="combined-panel">
      <div className="combined-icon">
        <Fingerprint size={21} />
      </div>
      <div className="combined-body">
        <h2>Combined inference</h2>
        <p>
          When signals from all saved policies are considered together, these
          possibilities could emerge.
        </p>
        <div className="inference-list">
          {inferences.map((inference) => (
            <div className="inference-row" key={inference.ruleId}>
              <span className="rule-id">{inference.ruleId}</span>
              <span>
                <b>{inference.output}</b>
                <small>{inference.explanation}</small>
              </span>
              <span className="could-label">Could infer</span>
            </div>
          ))}
        </div>
        <p className="all-inputs-note">
          <ShieldCheck size={14} /> Rules only fire when every input is verified
          in the source documents.
        </p>
      </div>
    </section>
  )
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>
        T&amp;C X-ray <span className="footer-dot">·</span> Privacy, in plain
        sight.
      </span>
      <b>Reading aid, not legal advice.</b>
    </footer>
  )
}

function FindingCard({
  finding,
  onJump,
}: {
  finding: VerifiedFinding
  onJump: () => void
}) {
  return (
    <article className="finding-card">
      <div className="finding-meta">
        <span className="category-tag">{finding.category}</span>
        <span className="severity">
          <i className={`severity-mark severity-${finding.severity}`}>
            {finding.severity === 1 ? '!' : finding.severity === 2 ? '!!' : '!!!'}
          </i>
          Severity {finding.severity}
        </span>
      </div>
      <h4>{finding.summary}</h4>
      <span className="verified-badge">
        <Check size={12} /> Verified against source
      </span>
      <blockquote>“{finding.quote}”</blockquote>
      <button className="jump-link" onClick={onJump}>
        Jump to clause {finding.clauseId} <ArrowRight size={13} />
      </button>
    </article>
  )
}

function InferenceCard({ inference }: { inference: Inference }) {
  return (
    <article className="finding-card">
      <div className="finding-meta">
        <span className="category-tag">{inference.ruleId}</span>
        <span className="could-label">Could infer</span>
      </div>
      <h4>{inference.output}</h4>
      <p>{inference.explanation}</p>
      <small>
        Based on {inference.supportingFindingIds.length} verified finding(s)
      </small>
    </article>
  )
}
