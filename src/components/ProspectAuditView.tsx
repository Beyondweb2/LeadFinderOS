import { useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, Globe, Loader2, ScanSearch, Sparkles } from 'lucide-react';
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
      <header className="shrink-0 border-b border-border px-4 py-3 pr-12">
        <DialogTitle className="break-words text-base sm:text-lg">{name}</DialogTitle>
        <DialogDescription className="mt-0.5 text-xs">
          AI visibility and website evidence — stored results only; opening this runs nothing.
          {website && <> · <a href={/^https?:/i.test(website) ? website : `https://${website}`} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">{website}</a></>}
        </DialogDescription>
        <nav className="mt-2 flex flex-wrap gap-1.5 text-xs" aria-label="Sections">
          {[['call', 'For this call'], ['ai', 'AI visibility'], ['site', 'Website evidence']].map(([id, label]) => (
            <a key={id} href={`#pa-${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`pa-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
              className="rounded-full border border-border px-2.5 py-0.5 hover:bg-muted">{label}</a>
          ))}
        </nav>
      </header>
      {/* ⛔ THE ONE SCROLL. Nothing inside sets its own height or overflow. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4" data-testid="prospect-audit-scroll">
        {children}
      </div>
    </>
  );
}
const SEVERITY_STYLE: Record<AuditSeverity, string> = {
  high: 'bg-red-600 text-white',
  medium: 'bg-amber-500 text-black',
  low: 'bg-muted text-foreground',
  good: 'bg-teal-600 text-white',
};
const EYEBROW = 'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';

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
        <h2 className={EYEBROW}>For this call</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Card title="Are they showing up in AI?">
            {hasScore && score!.complete ? (
              <>
                <p className="text-2xl font-bold tabular-nums">{score!.named}<span className="text-base font-medium text-muted-foreground"> / {score!.expected}</span></p>
                <p className="text-xs text-muted-foreground">answers named this business</p>
                <ul className="mt-1 space-y-0.5 text-sm">{score!.perEngine.map((t) => <li key={t.engine}>{t.label}: <span className="font-semibold tabular-nums">{t.named}/{t.expected}</span></li>)}</ul>
              </>
            ) : hasScore && aiInFlight ? <p className="text-sm">The AI check is still running ({score!.valid + score!.failed}/{score!.expected}).</p>
              : hasScore ? <p className="text-sm">Incomplete check — {score!.valid} of {score!.expected} answers valid. No final score.</p>
              : <p className="text-sm text-muted-foreground">No AI check stored for this lead yet.</p>}
          </Card>
          <Card title="What is wrong with the website?">
            <SiteGlance site={site} />
          </Card>
          <Card title="Strongest point to raise" testId="pa-call-point">
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
        <h2 className={EYEBROW}>AI visibility</h2>
        {!hasScore ? <p className="text-sm text-muted-foreground">No AI visibility check is stored for this lead. Run one from the Call tab’s AI check.</p> : (
          <>
            {!score!.complete && <p className="text-xs text-muted-foreground">{aiInFlight ? 'Still checking — results fill in as they arrive.' : 'Incomplete check: failed answers are not counted as “not named”.'}</p>}
            <div className="grid gap-3 lg:grid-cols-2">
              {engineSections(score).map((e) => (
                <div key={e.engine} className="min-w-0 rounded-lg border border-border p-3" data-testid={`pa-engine-${e.engine}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">{e.label}</h3>
                    <span className="text-sm tabular-nums">{e.valid === e.expected ? <>named in <b>{e.named}</b> of {e.expected}</> : <>{e.named} named of {e.valid} valid{e.failed ? ` · ${e.failed} failed` : ''}{e.pending ? ` · ${e.pending} pending` : ''}</>}</span>
                  </div>
                  <ol className="mt-2 space-y-3">{e.results.map((r) => <AiResult key={`${r.questionIndex}-${r.engine}`} r={r} rivalsWithheld={rivalsWithheld} />)}</ol>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Being cited (a source the answer used) is not the same as being named in the answer.</p>
          </>
        )}
      </section>

      {/* 3 ── WEBSITE EVIDENCE */}
      <section id="pa-site" className="scroll-mt-2 space-y-3" data-testid="pa-site">
        <h2 className={EYEBROW}>Website evidence</h2>
        <WebsiteSection site={site} crawl={crawl} />
      </section>
    </div>
  );
}

function Card({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-muted/20 p-3" data-testid={testId}>
      <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">{title}</h3>
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
      <p><b className="tabular-nums">{c.high}</b> high · <b className="tabular-nums">{c.medium}</b> medium · <b className="tabular-nums">{c.low}</b> low · <b className="tabular-nums">{c.good}</b> verified</p>
      <ul className="space-y-0.5 text-xs">{site.audit.findings.filter((f) => f.severity === 'high' || f.severity === 'medium').slice(0, 3).map((f) => <li key={f.id} className="break-words"><SeverityBadge s={f.severity} /> {f.title}</li>)}</ul>
      <p className="text-xs text-muted-foreground">{site.audit.basis === 'capped' ? 'Capped crawl — not the whole site.' : site.audit.basis === 'quick' ? 'Quick 12-page check only.' : site.audit.basis === 'full_legacy' ? 'Older full crawl.' : 'Full crawl.'}</p>
    </div>
  );
}

function AiResult({ r, rivalsWithheld }: { r: HookResult; rivalsWithheld: boolean }) {
  const [open, setOpen] = useState(false);
  const pill = r.status === 'named' ? 'bg-teal-600 text-white' : r.status === 'not_named' ? 'bg-red-600 text-white' : 'bg-muted text-foreground';
  const word = r.status === 'named' ? 'Named' : r.status === 'not_named' ? 'Not named' : r.status === 'failed' ? 'Failed' : 'Pending';
  const cites = r.citations ?? [];
  return (
    <li className="min-w-0 border-t border-border pt-2 first:border-t-0 first:pt-0" data-testid="pa-ai-result">
      <p className="text-sm"><span className="mr-1 text-[11px] font-semibold text-muted-foreground">Q{r.questionIndex + 1}</span><span className="break-words">“{r.question}”</span></p>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
        <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide', pill)}>{word}</span>
        {r.status === 'not_named' && (rivalsWithheld ? <span className="italic text-muted-foreground">names withheld (competitor list failed cleaning)</span>
          : r.competitors.length ? <span className="break-words">Named instead: <b>{r.competitors.slice(0, 5).join(', ')}</b></span>
          : <span className="italic text-muted-foreground">no competitor names extracted</span>)}
      </p>
      {cites.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-1 text-[11px]" data-testid="pa-citations">
          <span className="text-muted-foreground">Sources cited:</span>
          {cites.slice(0, 8).map((c) => (
            <a key={c.url} href={c.url} target="_blank" rel="noreferrer" title={c.title || c.url} className="inline-flex max-w-full items-center gap-0.5 rounded border border-border px-1 hover:bg-muted">
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
          {open && <p className="mt-1 whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-xs">{r.answerExcerpt}</p>}
        </>
      )}
    </li>
  );
}

function SeverityBadge({ s }: { s: AuditSeverity }) {
  return <span className={cn('inline-block rounded px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide', SEVERITY_STYLE[s])}>{AUDIT_SEVERITY_LABELS[s]}</span>;
}

function WebsiteSection({ site, crawl }: { site: WebsiteState; crawl: CrawlControls }) {
  const [filter, setFilter] = useState<AuditSeverity | 'all'>('all');
  const crawlButton = (label: string, force: boolean) => crawl.canCrawl ? (
    <Button size="sm" variant="outline" disabled={crawl.starting} onClick={() => crawl.onCrawl(force)} data-testid={force ? 'pa-recrawl' : 'pa-crawl'}>
      {crawl.starting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="mr-1 h-3.5 w-3.5" />} {label}
    </Button>
  ) : null;
  const err = crawl.error ? <p className="text-sm text-destructive">{crawl.error}</p> : null;

  if (site.kind === 'no_website') {
    return (
      <div className="rounded-lg border border-border p-3 text-sm" data-testid="pa-no-website">
        {site.confirmed ? <><p className="font-medium">{NO_WEBSITE_TEXT}</p><p className="mt-1 text-muted-foreground">{NO_WEBSITE_WHY}</p></> : <p>{NO_WEBSITE_ON_FILE_TEXT}</p>}
      </div>
    );
  }
  if (site.kind === 'directory_only') return <p className="rounded-lg border border-border p-3 text-sm">The website on file (<span className="break-all">{site.url}</span>) is a directory or listing page, not the business’s own site, so there is nothing of theirs to crawl.</p>;
  if (site.kind === 'not_crawled') return <div className="space-y-2 rounded-lg border border-border p-3 text-sm"><p>This website has not been crawled yet. A crawl reads the public site (up to the prospect page limit) — it costs no AI checks.</p>{crawlButton('Crawl site', false)}{err}</div>;
  if (site.kind === 'crawling') return <p className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm" data-testid="pa-crawling"><Loader2 className="h-4 w-4 animate-spin" /> {site.label || 'Crawling…'} — it runs on the server; you can close this.</p>;
  if (site.kind === 'failed') {
    return (
      <div className="space-y-2 rounded-lg border border-border p-3 text-sm" data-testid="pa-failed">
        <p className="flex gap-1.5 font-medium"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> The website could not be crawled.</p>
        <p>{site.reason}</p>
        <p className="text-xs text-muted-foreground">Nothing below is a finding about the site — we could not read it.{site.checkedAt ? ` Tried ${new Date(site.checkedAt).toLocaleString('en-GB')}.` : ''}</p>
        {crawlButton('Try again', true)}{err}
      </div>
    );
  }

  const audit = site.audit;
  const counts = severityCounts(audit.findings);
  const shown = filter === 'all' ? audit.findings : audit.findings.filter((f) => f.severity === filter);
  const ageMs = site.checkedAt ? Date.now() - Date.parse(site.checkedAt) : Infinity;
  return (
    <div className="space-y-4">
      <div className="space-y-1 rounded-lg border border-border p-3 text-sm" data-testid="pa-coverage">
        <p className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', site.source === 'fresh' ? 'bg-teal-600 text-white' : 'bg-muted')} data-testid="pa-source">
            {site.source === 'fresh' ? 'Fresh crawl' : 'Saved result'}
          </span>
          {site.checkedAt && <span className="text-xs text-muted-foreground">crawled {new Date(site.checkedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
          <span className="ml-auto">{(audit.basis !== 'full' && audit.basis !== 'capped') ? crawlButton('Run the full crawl', true) : mayForceRecrawl(crawl.role, ageMs) ? crawlButton('Re-crawl now', true) : null}</span>
        </p>
        <p className={cn(audit.basis === 'capped' && 'font-medium')} data-testid="pa-coverage-line">{coverageLine(audit)}</p>
        {audit.coverage && audit.coverage.sitemapUrls > 0 && <p className="text-xs text-muted-foreground">The sitemaps list {audit.coverage.sitemapUrls.toLocaleString('en-GB')} addresses.</p>}
        {err}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by severity">
        {(['all', 'high', 'medium', 'low', 'good'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
            className={cn('rounded-full border px-2.5 py-0.5 text-xs', filter === k ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-muted')}>
            {k === 'all' ? `All ${audit.findings.length}` : `${AUDIT_SEVERITY_LABELS[k]} ${counts[k]}`}
          </button>
        ))}
      </div>

      {groupFindings(shown).map((g) => (
        <div key={g.category} className="space-y-2" data-testid={`pa-cat-${g.category}`}>
          <h3 className="text-sm font-semibold">{g.label}</h3>
          <ul className="space-y-2">{g.findings.map((f) => <FindingRow key={f.id} f={f} audit={audit} />)}</ul>
        </div>
      ))}
      {shown.length === 0 && <p className="text-sm text-muted-foreground">Nothing at this level.</p>}

      {audit.notChecked.length > 0 && (
        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground" data-testid="pa-not-checked">
          <p className="font-semibold">Not checked</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{audit.notChecked.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
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
    <li className="min-w-0 rounded-lg border border-border p-3" data-testid="pa-finding" data-finding={f.id}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge s={f.severity} />
        <span className="min-w-0 break-words text-sm font-medium">{f.title}</span>
        {f.count > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums" data-testid="pa-count">{f.count.toLocaleString('en-GB')} {f.count === 1 ? 'page' : 'pages'} affected</span>}
      </div>
      <p className="mt-1 break-words text-sm [overflow-wrap:anywhere]">{f.saw}</p>
      {f.meaning && <p className="mt-0.5 text-xs text-muted-foreground">{f.meaning}</p>}
      {f.absence && audit.basis === 'capped' && <p className="mt-0.5 text-xs italic text-muted-foreground">Only true of the pages read — the crawl was capped.</p>}
      {f.evidence && f.evidence.length > 0 && <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-muted/40 p-1.5 font-mono text-[11px] [overflow-wrap:anywhere]">{f.evidence.join('\n')}</pre>}
      {examples.length > 0 && (
        <div className="mt-1.5 text-xs">
          <p className="text-muted-foreground">{f.count > 1 ? 'Examples:' : 'Page:'}</p>
          <ul className="space-y-0.5">{(open ? f.urls.slice(0, limit) : examples).map((u) => <li key={u} className="break-all"><UrlText u={u} /></li>)}</ul>
          {more && (
            <button type="button" className="mt-1 text-xs underline underline-offset-2" onClick={() => { setOpen((v) => !v); setLimit(URL_PAGE); }} data-testid="pa-show-all">
              {open ? 'Show fewer' : `Show all ${f.urls.length.toLocaleString('en-GB')}${f.urlsComplete ? '' : ` of ${f.count.toLocaleString('en-GB')}`}`}
            </button>
          )}
          {open && limit < f.urls.length && <button type="button" className="ml-3 mt-1 text-xs underline underline-offset-2" onClick={() => setLimit((n) => n + URL_PAGE)}>Show {Math.min(URL_PAGE, f.urls.length - limit)} more</button>}
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
