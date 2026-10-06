import { useState, type ReactNode } from 'react';
import { scoreTone, SCORE_TONE_CLASS } from '@/lib/scoreTone';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, FileSearch, Globe, Info, Lightbulb, ListChecks, Loader2, MessageSquareText, ScanSearch, Sparkles, XCircle } from 'lucide-react';
import { Callout, EDGE, Empty, IconTile, SectionHeading, Segmented, SubSection, TONE, ToneChip, type Tone } from '@/components/operator/ui';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { mayForceRecrawl } from '@/lib/prospectCrawl';
import type { HookResult, HookScore } from '@/lib/hookScore';
import { AUDIT_SEVERITY_LABELS, groupFindings, severityCounts, type AuditFinding, type AuditSeverity, type SiteAudit } from '@/lib/siteAudit';
import {
  NO_WEBSITE_ON_FILE_TEXT, NO_WEBSITE_TEXT, NO_WEBSITE_WHY, callPoint, coverageLine, engineSections, hostOf, type WebsiteState,
} from '@/lib/prospectAuditView';
import { cn } from '@/lib/utils';

/* THE DETAILED PROSPECT AUDIT — the presentational half (no fetching, no Supabase), rendered by
   ProspectAuditDialog.tsx and, from plain fixture data, by scripts/prospect-full-crawl-audit.test.ts
   and the visual QA harness. See ProspectAuditDialog.tsx for what it is and the rules it keeps. */

const URL_PAGE = 100;

/** The window: full screen on a phone, a large panel on a desktop. Used by ProspectAuditDialog and the QA harness. */
export const PROSPECT_AUDIT_CONTENT_CLASS = 'flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden p-0 sm:h-[92vh] sm:max-h-[92vh] sm:w-[calc(100vw-3rem)] sm:max-w-5xl';

/** The window's header and its ONE scroll area. Must sit inside a DialogContent. */
export function ProspectAuditFrame({ name, website, children }: { name: string; website: string | null; children: ReactNode }) {
  return (
    <>
      <header className="shrink-0 border-b border-border/60 px-4 py-3 pr-12 sm:px-5 sm:py-4">
        <div className="flex min-w-0 items-start gap-3">
          <IconTile icon={FileSearch} tone="purple" />
          <div className="min-w-0 flex-1">
            <DialogTitle className="break-words text-base sm:text-lg">{name}</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs leading-snug">
              AI visibility and website evidence — stored results only; opening this runs nothing.
              {website && <> · <a href={/^https?:/i.test(website) ? website : `https://${website}`} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">{website}</a></>}
            </DialogDescription>
          </div>
        </div>
        <nav className="mt-3 flex flex-wrap gap-1.5 text-xs" aria-label="Sections">
          {([['call', 'For this call', 'amber'], ['ai', 'AI visibility', 'purple'], ['site', 'Website evidence', 'blue']] as const).map(([id, label, tone]) => (
            <a key={id} href={`#pa-${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`pa-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
              className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1 font-semibold text-muted-foreground ring-1 ring-inset ring-border/50 transition hover:bg-muted hover:text-foreground">
              <span className={cn('h-1.5 w-1.5 rounded-full', TONE[tone].dot)} aria-hidden />{label}
            </a>
          ))}
        </nav>
      </header>
      {/* ⛔ THE ONE SCROLL. Nothing inside sets its own height or overflow. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6" data-testid="prospect-audit-scroll">
        {children}
      </div>
    </>
  );
}
/** Severity → tone: high = red (serious), medium = amber (worth fixing), low = blue (information), verified = green (passed). */
const SEVERITY_TONE: Record<AuditSeverity, Tone> = { high: 'red', medium: 'amber', low: 'blue', good: 'green' };
const SEVERITY_ICON: Record<AuditSeverity, typeof XCircle> = { high: XCircle, medium: AlertTriangle, low: Info, good: CheckCircle2 };
const SEVERITY_ORDER: AuditSeverity[] = ['high', 'medium', 'low', 'good'];
/** A group's tone is its worst finding's. */
const worstTone = (fs: AuditFinding[]): Tone => SEVERITY_TONE[SEVERITY_ORDER.find((s) => fs.some((f) => f.severity === s)) ?? 'low'];
/** A distinct object inside the window (a tile, a state message): a soft wash, no hard border. */
const TILE = 'min-w-0 rounded-2xl bg-muted/30 p-3.5 ring-1 ring-inset ring-border/50';

/* ── the presentational half (rendered by the tests and the QA harness from plain data) ─────────── */

export interface CrawlControls { canCrawl: boolean; role: string | null; starting: boolean; error: string | null; onCrawl: (force: boolean) => void }

export function ProspectAuditView({ score, rivalsWithheld, aiInFlight, site, point, crawl }: {
  score: HookScore | null; rivalsWithheld: boolean; aiInFlight: boolean; site: WebsiteState; point: ReturnType<typeof callPoint>; crawl: CrawlControls;
}) {
  const hasScore = !!score && score.expected > 0;
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* 1 ── FOR THIS CALL */}
      <section id="pa-call" className="scroll-mt-2 space-y-3" data-testid="pa-for-this-call">
        <SectionHeading title="For this call" tone="amber" />
        <div className="grid gap-3 md:grid-cols-3">
          <Card title="Are they showing up in AI?" icon={Sparkles} tone="purple">
            {hasScore && score!.complete ? (
              <>
                <p className={cn('text-2xl font-extrabold tabular-nums tracking-tight', TONE.purple.text)}>{score!.named}<span className="text-base font-medium text-muted-foreground"> / {score!.expected}</span></p>
                <p className="text-xs text-muted-foreground">answers named this business</p>
                <ul className="mt-2 flex flex-wrap gap-1.5 text-sm">{score!.perEngine.map((t) => { const tone = t.valid === t.expected ? scoreTone(t.named, t.expected) : 'none'; return <li key={t.engine}><span data-testid="pa-engine-score" data-tone={tone} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', SCORE_TONE_CLASS[tone].chip, SCORE_TONE_CLASS[tone].text)}>{t.label}: <span className="tabular-nums">{t.named}/{t.expected}</span></span></li>; })}</ul>
              </>
            ) : hasScore && aiInFlight ? <p className="flex items-center gap-1.5 text-sm"><Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />The AI check is still running ({score!.valid + score!.failed}/{score!.expected}).</p>
              : hasScore ? <p className="text-sm">Incomplete check — {score!.valid} of {score!.expected} answers valid. No final score.</p>
              : <p className="text-sm text-muted-foreground">No AI check stored for this lead yet.</p>}
          </Card>
          <Card title="What is wrong with the website?" icon={Globe} tone="blue">
            <SiteGlance site={site} />
          </Card>
          <Card title="Strongest point to raise" icon={Lightbulb} tone="amber" testId="pa-call-point">
            {!point.ai && !point.site ? <p className="text-sm text-muted-foreground">Nothing stored yet to base a point on.</p> : (
              <div className="space-y-2 text-sm">
                {point.ai && <PointBlock icon={<Sparkles className="h-3.5 w-3.5" />} headline={point.ai.headline} evidence={point.ai.evidence} />}
                {point.site && <PointBlock icon={<Globe className="h-3.5 w-3.5" />} headline={point.site.headline} evidence={point.site.evidence} />}
              </div>
            )}
          </Card>
        </div>
        <p className="text-xs text-muted-foreground">Say it as evidence: these may make it harder for search engines or AI to find, read or verify the business — never that they are the reason it was not named.</p>
      </section>

      {/* 2 ── AI VISIBILITY */}
      <section id="pa-ai" className="scroll-mt-2 space-y-3" data-testid="pa-ai">
        <SectionHeading title="AI visibility" tone="purple" />
        {!hasScore ? <Empty icon={Sparkles}>No AI visibility check is stored for this lead. Run one from the Call tab’s AI check.</Empty> : (
          <>
            {!score!.complete && <p className="text-xs text-muted-foreground">{aiInFlight ? 'Still checking — results fill in as they arrive.' : 'Incomplete check: failed answers are not counted as “not named”.'}</p>}
            <div className="grid gap-3 lg:grid-cols-2">
              {engineSections(score).map((e) => (
                <div key={e.engine} className={TILE} data-testid={`pa-engine-${e.engine}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex min-w-0 items-center gap-2 text-sm font-bold tracking-tight"><IconTile icon={MessageSquareText} tone="purple" size="sm" />{e.label}</h3>
                    <span className="text-sm tabular-nums text-muted-foreground">{e.valid === e.expected ? <>named in <b>{e.named}</b> of {e.expected}</> : <>{e.named} named of {e.valid} valid{e.failed ? ` · ${e.failed} failed` : ''}{e.pending ? ` · ${e.pending} pending` : ''}</>}</span>
                  </div>
                  <ol className="mt-3 space-y-3">{e.results.map((r) => <AiResult key={`${r.questionIndex}-${r.engine}`} r={r} rivalsWithheld={rivalsWithheld} />)}</ol>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Being cited (a source the answer used) is not the same as being named in the answer.</p>
          </>
        )}
      </section>

      {/* 3 ── WEBSITE EVIDENCE */}
      <section id="pa-site" className="scroll-mt-2 space-y-3" data-testid="pa-site">
        <SectionHeading title="Website evidence" tone="blue" />
        <WebsiteSection site={site} crawl={crawl} />
      </section>
    </div>
  );
}

function Card({ title, icon, tone, children, testId }: { title: string; icon: typeof Globe; tone: Tone; children: ReactNode; testId?: string }) {
  return (
    <div className={TILE} data-testid={testId}>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-bold tracking-tight text-muted-foreground"><IconTile icon={icon} tone={tone} size="sm" /><span className="min-w-0">{title}</span></h3>
      {children}
    </div>
  );
}

function PointBlock({ icon, headline, evidence }: { icon: ReactNode; headline: string; evidence: string[] }) {
  return (
    <div>
      <p className="flex gap-1.5 font-medium"><span className="mt-0.5 shrink-0">{icon}</span><span className="min-w-0 break-words">{headline}</span></p>
      {evidence.length > 0 && <ul className="ml-5 mt-0.5 list-disc space-y-0.5 text-xs text-muted-foreground">{evidence.map((e, i) => <li key={i} className="break-words [overflow-wrap:anywhere]">{e}</li>)}</ul>}
    </div>
  );
}

function SiteGlance({ site }: { site: WebsiteState }) {
  if (site.kind === 'no_website') return <p className="text-sm">{site.confirmed ? NO_WEBSITE_TEXT : NO_WEBSITE_ON_FILE_TEXT}</p>;
  if (site.kind === 'directory_only') return <p className="text-sm">The website on file is a directory listing, not the business’s own site.</p>;
  if (site.kind === 'not_crawled') return <p className="text-sm text-muted-foreground">Not crawled yet.</p>;
  if (site.kind === 'crawling') return <p className="flex items-center gap-1.5 text-sm"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Crawling now…</p>;
  if (site.kind === 'failed') return <p className="text-sm">{site.reason}</p>;
  const c = severityCounts(site.audit.findings);
  return (
    <div className="space-y-1 text-sm">
      <p className="flex flex-wrap gap-1.5">
        <ToneChip tone="red"><b className="tabular-nums">{c.high}</b> high</ToneChip>
        <ToneChip tone="amber"><b className="tabular-nums">{c.medium}</b> medium</ToneChip>
        <ToneChip tone="blue"><b className="tabular-nums">{c.low}</b> low</ToneChip>
        <ToneChip tone="green"><b className="tabular-nums">{c.good}</b> verified</ToneChip>
      </p>
      <ul className="space-y-1 pt-0.5 text-xs">{site.audit.findings.filter((f) => f.severity === 'high' || f.severity === 'medium').slice(0, 3).map((f) => <li key={f.id} className="flex min-w-0 items-start gap-1.5 break-words"><SeverityBadge s={f.severity} /> <span className="min-w-0">{f.title}</span></li>)}</ul>
      <p className="text-xs text-muted-foreground">{site.audit.basis === 'capped' ? 'Capped crawl — not the whole site.' : site.audit.basis === 'quick' ? 'Quick 12-page check only.' : site.audit.basis === 'full_legacy' ? 'Older full crawl.' : 'Full crawl.'}</p>
    </div>
  );
}

function AiResult({ r, rivalsWithheld }: { r: HookResult; rivalsWithheld: boolean }) {
  const [open, setOpen] = useState(false);
  const pill: Tone = r.status === 'named' ? 'green' : r.status === 'not_named' ? 'red' : 'grey';
  const pillIcon = r.status === 'named' ? CheckCircle2 : r.status === 'not_named' ? XCircle : undefined;
  const word = r.status === 'named' ? 'Named' : r.status === 'not_named' ? 'Not named' : r.status === 'failed' ? 'Failed' : 'Pending';
  const cites = r.citations ?? [];
  return (
    <li className="min-w-0 border-t border-border/50 pt-3 first:border-t-0 first:pt-0" data-testid="pa-ai-result">
      <p className="text-sm"><span className="mr-1.5 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">Q{r.questionIndex + 1}</span><span className="break-words">“{r.question}”</span></p>
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
        <ToneChip tone={pill} icon={pillIcon} dot={!pillIcon}>{word}</ToneChip>
        {r.status === 'not_named' && (rivalsWithheld ? <span className="italic text-muted-foreground">names withheld (competitor list failed cleaning)</span>
          : r.competitors.length ? <span className="break-words">Named instead: <b>{r.competitors.slice(0, 5).join(', ')}</b></span>
          : <span className="italic text-muted-foreground">no competitor names extracted</span>)}
      </p>
      {cites.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-1 text-[11px]" data-testid="pa-citations">
          <span className="text-muted-foreground">Sources cited:</span>
          {cites.slice(0, 8).map((c) => (
            <a key={c.url} href={c.url} target="_blank" rel="noreferrer" title={c.title || c.url} className="inline-flex max-w-full items-center gap-0.5 rounded-full bg-muted/60 px-2 py-0.5 ring-1 ring-inset ring-border/50 hover:bg-muted">
              <span className="truncate">{hostOf(c.url)}</span><ExternalLink className="h-2.5 w-2.5 shrink-0" />
            </a>
          ))}
          {cites.length > 8 && <span className="text-muted-foreground">+{cites.length - 8} more</span>}
        </p>
      )}
      {r.answerExcerpt && (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" aria-expanded={open}>
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} {open ? 'Hide the answer' : 'Read the answer'}
          </button>
          {open && <p className="mt-1.5 whitespace-pre-wrap break-words rounded-xl bg-muted/40 p-2.5 text-xs leading-relaxed">{r.answerExcerpt}</p>}
        </>
      )}
    </li>
  );
}

function SeverityBadge({ s }: { s: AuditSeverity }) {
  return <ToneChip tone={SEVERITY_TONE[s]} icon={SEVERITY_ICON[s]} className="shrink-0 uppercase tracking-wide">{AUDIT_SEVERITY_LABELS[s]}</ToneChip>;
}

function WebsiteSection({ site, crawl }: { site: WebsiteState; crawl: CrawlControls }) {
  const [filter, setFilter] = useState<AuditSeverity | 'all'>('all');
  const crawlButton = (label: string, force: boolean) => crawl.canCrawl ? (
    <Button size="sm" variant="outline" disabled={crawl.starting} onClick={() => crawl.onCrawl(force)} data-testid={force ? 'pa-recrawl' : 'pa-crawl'}>
      {crawl.starting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="mr-1 h-3.5 w-3.5" />} {label}
    </Button>
  ) : null;
  const err = crawl.error ? <Callout tone="red" icon={XCircle}>{crawl.error}</Callout> : null;

  if (site.kind === 'no_website') {
    return (
      <Callout tone="grey" icon={Globe} testId="pa-no-website"
        title={site.confirmed ? NO_WEBSITE_TEXT : undefined}>
        {site.confirmed ? <span className="text-muted-foreground">{NO_WEBSITE_WHY}</span> : NO_WEBSITE_ON_FILE_TEXT}
      </Callout>
    );
  }
  if (site.kind === 'directory_only') return <Callout tone="grey" icon={Globe}>The website on file (<span className="break-all">{site.url}</span>) is a directory or listing page, not the business’s own site, so there is nothing of theirs to crawl.</Callout>;
  if (site.kind === 'not_crawled') return <div className="space-y-2"><Empty icon={ScanSearch}><span className="max-w-md text-sm">This website has not been crawled yet. A crawl reads the public site (up to the prospect page limit) — it costs no AI checks.</span>{crawlButton('Crawl site', false)}</Empty>{err}</div>;
  if (site.kind === 'crawling') return <Callout tone="blue" icon={ScanSearch} testId="pa-crawling"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 shrink-0 animate-spin" /> {site.label || 'Crawling…'} — it runs on the server; you can close this.</span></Callout>;
  if (site.kind === 'failed') {
    return (
      <div className="space-y-2" data-testid="pa-failed">
        <Callout tone="amber" icon={AlertTriangle} title="The website could not be crawled.">
          <p>{site.reason}</p>
          <p className="mt-1 text-xs text-muted-foreground">Nothing below is a finding about the site — we could not read it.{site.checkedAt ? ` Tried ${new Date(site.checkedAt).toLocaleString('en-GB')}.` : ''}</p>
          {crawl.canCrawl && <div className="mt-2">{crawlButton('Try again', true)}</div>}
        </Callout>
        {err}
      </div>
    );
  }

  const audit = site.audit;
  const counts = severityCounts(audit.findings);
  const shown = filter === 'all' ? audit.findings : audit.findings.filter((f) => f.severity === filter);
  const ageMs = site.checkedAt ? Date.now() - Date.parse(site.checkedAt) : Infinity;
  return (
    <div className="space-y-4">
      <div className={cn(TILE, 'space-y-1.5 text-sm')} data-testid="pa-coverage">
        <p className="flex flex-wrap items-center gap-2">
          <ToneChip tone={site.source === 'fresh' ? 'green' : 'grey'} icon={site.source === 'fresh' ? CheckCircle2 : undefined} dot={site.source !== 'fresh'} testId="pa-source">
            {site.source === 'fresh' ? 'Fresh crawl' : 'Saved result'}
          </ToneChip>
          {audit.basis === 'capped' && <ToneChip tone="amber" icon={AlertTriangle}>Capped</ToneChip>}
          {site.checkedAt && <span className="text-xs text-muted-foreground">crawled {new Date(site.checkedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
          <span className="ml-auto">{(audit.basis !== 'full' && audit.basis !== 'capped') ? crawlButton('Run the full crawl', true) : mayForceRecrawl(crawl.role, ageMs) ? crawlButton('Re-crawl now', true) : null}</span>
        </p>
        <p className={cn(audit.basis === 'capped' && 'font-medium')} data-testid="pa-coverage-line">{coverageLine(audit)}</p>
        {audit.coverage && audit.coverage.sitemapUrls > 0 && <p className="text-xs text-muted-foreground">The sitemaps list {audit.coverage.sitemapUrls.toLocaleString('en-GB')} addresses.</p>}
        {err}
      </div>

      <Segmented<AuditSeverity | 'all'> label="Filter by severity" value={filter} onChange={setFilter} wrapOnPhone
        options={[
          { key: 'all', label: 'All', count: audit.findings.length, tone: 'grey' },
          ...SEVERITY_ORDER.map((k) => ({ key: k, label: AUDIT_SEVERITY_LABELS[k], count: counts[k], tone: SEVERITY_TONE[k] })),
        ]} />

      {groupFindings(shown).map((g) => (
        <SubSection key={g.category} title={g.label} tone={worstTone(g.findings)} testId={`pa-cat-${g.category}`}
          hint={`${g.findings.length} ${g.findings.length === 1 ? 'finding' : 'findings'}`}>
          <ul className="space-y-2">{g.findings.map((f) => <FindingRow key={f.id} f={f} audit={audit} />)}</ul>
        </SubSection>
      ))}
      {shown.length === 0 && <Empty icon={ListChecks}>Nothing at this level.</Empty>}

      {audit.notChecked.length > 0 && (
        <SubSection title="Not checked" icon={Info} tone="grey" testId="pa-not-checked">
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">{audit.notChecked.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </SubSection>
      )}
    </div>
  );
}

function FindingRow({ f, audit }: { f: AuditFinding; audit: SiteAudit }) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(URL_PAGE);
  const examples = f.urls.slice(0, 5);
  const more = f.urls.length > examples.length;
  return (
    <li className={cn('min-w-0 rounded-xl border border-border/60 bg-muted/20 p-3', EDGE[SEVERITY_TONE[f.severity]])} data-testid="pa-finding" data-finding={f.id}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge s={f.severity} />
        <span className="min-w-0 break-words text-sm font-semibold">{f.title}</span>
        {f.count > 0 && <ToneChip tone="grey" className="tabular-nums" testId="pa-count">{f.count.toLocaleString('en-GB')} {f.count === 1 ? 'page' : 'pages'} affected</ToneChip>}
      </div>
      <p className="mt-1 break-words text-sm [overflow-wrap:anywhere]">{f.saw}</p>
      {f.meaning && <p className="mt-0.5 text-xs text-muted-foreground">{f.meaning}</p>}
      {f.absence && audit.basis === 'capped' && <p className="mt-0.5 text-xs italic text-muted-foreground">Only true of the pages read — the crawl was capped.</p>}
      {f.evidence && f.evidence.length > 0 && <pre className="mt-1.5 whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-2 font-mono text-[11px] [overflow-wrap:anywhere]">{f.evidence.join('\n')}</pre>}
      {examples.length > 0 && (
        <div className="mt-1.5 text-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{f.count > 1 ? 'Examples:' : 'Page:'}</p>
          <ul className="space-y-0.5">{(open ? f.urls.slice(0, limit) : examples).map((u) => <li key={u} className="break-all"><UrlText u={u} /></li>)}</ul>
          {more && (
            <button type="button" className="mt-1 text-xs font-medium text-primary underline underline-offset-2" onClick={() => { setOpen((v) => !v); setLimit(URL_PAGE); }} data-testid="pa-show-all">
              {open ? 'Show fewer' : `Show all ${f.urls.length.toLocaleString('en-GB')}${f.urlsComplete ? '' : ` of ${f.count.toLocaleString('en-GB')}`}`}
            </button>
          )}
          {open && limit < f.urls.length && <button type="button" className="ml-3 mt-1 text-xs font-medium text-primary underline underline-offset-2" onClick={() => setLimit((n) => n + URL_PAGE)}>Show {Math.min(URL_PAGE, f.urls.length - limit)} more</button>}
          {!f.urlsComplete && <p className="mt-0.5 text-[11px] text-muted-foreground">{f.count.toLocaleString('en-GB')} in total; {f.urls.length.toLocaleString('en-GB')} addresses were kept.</p>}
        </div>
      )}
    </li>
  );
}

/** A URL, linked when it is one ("a → b" redirect pairs and "url (404)" stay text). */
function UrlText({ u }: { u: string }) {
  if (/^https?:\/\/\S+$/.test(u)) return <a href={u} target="_blank" rel="noreferrer" className="hover:underline">{u}</a>;
  return <span>{u}</span>;
}
