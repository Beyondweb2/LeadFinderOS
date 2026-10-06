import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle, Check, CheckCircle2, ChevronDown, CircleDashed, ClipboardList, Globe, Loader2, MapPin, Pencil, RefreshCw, Search, Send, ShieldAlert, Sparkles, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { CONTENT_REUSE_WORDS, TIER_WORDS, type ContentReuse, type IntakeStatus, type IntakeStep, type IntakeSummary, type ProfileField } from '@/lib/clientIntake';
import { SERVICE_ROUTE_NAME } from '@/lib/findableOffer';
import { EDGE, SURFACE, SubSection, ToneChip, type Tone } from '@/components/operator/ui';
import { cn } from '@/lib/utils';
import { ClientOnboardingPanel } from '@/components/ClientOnboardingPanel';

/* ══ CLIENT INTAKE — the top of a Paid Client (2026-10-06, src/lib/clientIntake.ts has every rule) ════════
   What LeadFinderOS gathered AUTOMATICALLY when they paid, in the order Paul asks: who are they, what did they
   buy, what did Sales tell us, what did the client tell us, what did we find, what do we still need.
   The profile is derived by the server on every read (paid-client-hub get / intake_view); this card only
   draws it and sends Paul's decisions (intake_fact) and re-runs (intake_run). It never locks the page: while
   research runs the client is usable and the card polls ONLY the intake (never the whole page).
   ⛔ Nothing here contacts the client. The fallback controls (Find again, Ask salesperson, Contact client)
      stay in the Missing information box below — this card only points at it. */

export interface IntakeViewData {
  status: IntakeStatus | null; status_line: string; trigger_source: string | null;
  queued_at: string | null; finished_at: string | null; last_run_at: string | null; error: string | null;
  steps: IntakeStep[]; summary: IntakeSummary; profile: ProfileField[]; route: 'build' | 'optimise' | null;
  sales: { handoff_lines: string[]; sent: { at: string; by: string | null; paid_when_sent: boolean } | null; quick_close: { key: string; label: string; answer: string }[]; call_lines?: { key: string; label: string; answer: string }[]; website_control: string | null; domain_control: string | null };
  client: { onboarding_status: string | null; source: string | null; answers: { label: string; value: string }[]; agreement: { version: string | null; signed_at: string | null; signer: string | null; role: string | null } | null;
    whatsapp_review?: { field: string; label: string; confirmed: string; whatsapp: string }[] };
  found: {
    crawl: null | { url: string | null; created_at: string | null; mode: string | null; completeness: string | null; fetch_failed: boolean; pages_ok: number | null; urls_discovered: number | null; capped: boolean;
      platform: string | null; built_by: string | null; families: { family: string; count: number }[]; findings: { id: string; severity: string; title: string; count: number }[];
      logo: string | null; og_image: string | null; reviews_on_site: { value: string; url: string }[]; prices_seen: number };
    crawl_job: { id: string; status: string; started_at: string | null; completed_at: string | null } | null;
    hook: null | { audit_id: string; short_code: string | null; created_at: string | null; complete: boolean; named: number; expected: number;
      per_engine: { engine: string; label: string; named: number; valid: number; expected: number }[];
      questions: { question: string; results: { engine: string; label: string; status: string; competitors: string[] }[] }[]; rivals_withheld: boolean };
    content_reuse: ContentReuse; website_manager: string | null; website_platform: string | null;
  };
}

const call = (body: Record<string, unknown>) => invokeEdge<{ ok: boolean; intake?: IntakeViewData | null }>('paid-client-hub', body);
const RUNNING: ReadonlySet<string> = new Set(['queued', 'running', 'crawling']);
const POLL_MS = 15_000;
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : '');
const STATUS_CHIP: Record<IntakeStatus, { tone: Tone; text: string }> = {
  queued: { tone: 'blue', text: 'Gathering information' }, running: { tone: 'blue', text: 'Merging findings' }, crawling: { tone: 'blue', text: 'Crawling website' },
  ready: { tone: 'green', text: 'Ready for Paul' }, needs_attention: { tone: 'amber', text: 'Needs attention' },
};
const STEP_ICON: Record<IntakeStep['status'], ReactNode> = {
  done: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />, reused: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  running: <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />, not_needed: <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />,
  not_found: <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />, failed: <AlertTriangle className="h-3.5 w-3.5 text-red-500" />,
};
const TIER_TONE: Record<string, Tone> = { confirmed: 'green', client: 'green', sales: 'blue', record: 'grey', website: 'amber', places: 'amber', inferred: 'grey' };

export function ClientIntakeCard({ leadId, initial, placeId }: { leadId: string; initial: IntakeViewData | null | undefined; placeId?: string | null }) {
  const { toast } = useToast();
  const [view, setView] = useState<IntakeViewData | null>(initial ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { setView(initial ?? null); }, [initial]);
  const running = !!view?.status && RUNNING.has(view.status);
  /* Poll the intake alone while research runs; stop the moment it settles. */
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => { void call({ action: 'intake_view', lead_id: leadId }).then((r) => { if (r.intake) setView(r.intake); }).catch(() => undefined); }, POLL_MS);
    return () => window.clearInterval(id);
  }, [running, leadId]);
  const act = useCallback(async (label: string, body: Record<string, unknown>, done?: string) => {
    setBusy(label);
    try {
      const r = await call({ lead_id: leadId, ...body });
      if (r.intake) setView(r.intake);
      if (done) toast({ title: done });
      return true;
    } catch (e) { toast({ title: 'Not done', description: edgeErrorMessage(e), variant: 'destructive' }); return false; }
    finally { setBusy(null); }
  }, [leadId, toast]);
  const refreshPlaces = async () => {
    if (!placeId) return;
    setBusy('places');
    try {
      await invokeEdge('google-place-details', { placeId, forceRefresh: true, triggerSource: 'client_intake' });
      await act('places', { action: 'intake_run' }, 'Google business data refreshed');
    } catch (e) { toast({ title: 'Not refreshed', description: edgeErrorMessage(e), variant: 'destructive' }); setBusy(null); }
  };
  const fact = (field: string, fact_action: string, extra: Record<string, unknown> = {}) => act(`f:${field}`, { action: 'intake_fact', field, fact_action, ...extra });

  const chip = view?.status ? STATUS_CHIP[view.status] : null;
  const who = view?.profile.filter((f) => f.group === 'who') ?? [];
  const work = view?.profile.filter((f) => f.group === 'work') ?? [];
  const found = view?.profile.filter((f) => f.group === 'found' && f.status !== 'missing') ?? [];
  const s = view?.summary;
  return (
    <section id="hub-intake" className={cn(SURFACE, 'min-w-0 p-4 sm:p-5', EDGE.blue)} data-testid="client-intake">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Client intake</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-base font-bold">
            {chip ? <ToneChip tone={chip.tone} dot className={view?.status === 'ready' ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300' : undefined}>{chip.text}</ToneChip> : <ToneChip tone="grey">Not run</ToneChip>}
            <span className="text-sm font-medium text-muted-foreground" data-testid="intake-status-line">{view?.status_line ?? 'Not run yet'}</span>
            {running && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
          </p>
          {view?.finished_at && !running && <p className="mt-0.5 text-[11px] text-muted-foreground">Gathered automatically {day(view.finished_at)}{view.trigger_source === 'rerun' ? ' (re-run)' : ''}. Nothing was sent to the client.</p>}
          {running && <p className="mt-0.5 text-[11px] text-muted-foreground">You can work on this client while it runs.</p>}
          {view?.error && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{view.error}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void act('run', { action: 'intake_run' }, view?.status ? 'Research refreshed' : 'Intake run')} disabled={!!busy || running} data-testid="intake-run">
            {busy === 'run' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}{view?.status ? 'Refresh research' : 'Run automatic intake'}
          </Button>
          {placeId && <Button size="sm" variant="ghost" onClick={() => void refreshPlaces()} disabled={!!busy || running} title="One Google lookup (a small charge) — only if their Google details look wrong">
            {busy === 'places' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MapPin className="mr-1 h-4 w-4" />}Refresh Google data
          </Button>}
        </div>
      </header>

      {view && (
        <>
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Sources checked">
            {view.steps.map((st) => (
              <li key={st.key} title={st.detail ?? undefined} className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5 text-[11px] ring-1 ring-inset ring-border/50">{STEP_ICON[st.status]}{st.label}</li>
            ))}
          </ul>

          {/* WHAT DO WE STILL NEED — first, because it is the work. */}
          {s && (s.still_needed.length > 0 || s.conflicts.length > 0) && (
            <div className={cn('mt-3 rounded-xl border border-border/60 bg-muted/20 p-3 text-sm', EDGE.amber)} data-testid="intake-needed">
              {s.still_needed.length > 0 && <p><span className="font-semibold">Still needed:</span> {s.still_needed.join(' · ')}</p>}
              {s.conflicts.length > 0 && <p className="mt-0.5"><span className="font-semibold">Needs review — conflicting evidence:</span> {s.conflicts.join(' · ')}</p>}
              <a href="#hub-setup" className="mt-1 inline-block text-xs font-medium text-primary hover:underline">Missing information — find again, ask the salesperson or contact the client ↓</a>
            </div>
          )}
          {/* GET MISSING INFO (2026-10-07): the onboarding form that asks only the gaps above; answers flow back here. */}
          <ClientOnboardingPanel leadId={leadId} onIntake={(i) => setView(i as IntakeViewData)} />
          {(view.client.whatsapp_review?.length ?? 0) > 0 && (
            <div className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs ring-1 ring-inset ring-amber-500/30" data-testid="intake-whatsapp-review">
              <p className="font-semibold text-amber-800 dark:text-amber-200">On WhatsApp the client said something different from what you confirmed — your value still stands</p>
              <ul className="mt-1 space-y-0.5">{view.client.whatsapp_review!.map((r) => <li key={r.field}><span className="font-medium">{r.label}:</span> you confirmed “{r.confirmed}” · WhatsApp “{r.whatsapp}”</li>)}</ul>
            </div>
          )}

          <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <SubSection title="Who are they" icon={ClipboardList} tone="blue">
              <dl className="space-y-1.5">{who.map((f) => <FactRow key={f.key} f={f} busy={busy === `f:${f.key}`} onFact={fact} />)}</dl>
            </SubSection>
            <div className="space-y-4">
              <SubSection title="What did they buy" icon={Sparkles} tone="blue">
                <p className="text-sm">{view.route ? SERVICE_ROUTE_NAME[view.route] : 'Route not recorded yet'} <span className="text-muted-foreground">— the plan, payments and dates are at the top of the page.</span></p>
              </SubSection>
              <SubSection title="What did Sales tell us" icon={Send} tone="blue">
                {view.sales.sent
                  ? <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Sent to Paul by {view.sales.sent.by ?? 'the salesperson'} · {day(view.sales.sent.at)}{view.sales.sent.paid_when_sent ? '' : ' (before payment)'}</p>
                  : <p className="text-xs text-muted-foreground">Not sent to Paul yet.</p>}
                {view.sales.handoff_lines.length > 0
                  ? <ul className="mt-1 space-y-0.5 text-sm">{view.sales.handoff_lines.map((l) => <li key={l}>{l}</li>)}</ul>
                  : <p className="mt-1 text-sm text-muted-foreground">No handoff answers.</p>}
                {(view.sales.call_lines?.length ?? 0) > 0 && (
                  <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm" data-testid="intake-call-lines">{view.sales.call_lines!.map((p) => <FragmentPair key={p.key} k={p.label} v={p.answer} />)}</dl>
                )}
                {view.sales.quick_close.length > 0 && (
                  <details className="mt-1.5 text-xs"><summary className="cursor-pointer text-muted-foreground">On the sales call ({view.sales.quick_close.length} answers)</summary>
                    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">{view.sales.quick_close.map((p) => <FragmentPair key={p.key} k={p.label} v={p.answer} />)}</dl>
                  </details>
                )}
              </SubSection>
              <SubSection title="What did the client tell us" icon={CheckCircle2} tone="blue">
                <p className="text-xs text-muted-foreground">{view.client.onboarding_status ? `Onboarding: ${view.client.onboarding_status === 'paid' ? 'submitted with payment' : view.client.onboarding_status}${view.client.source === 'manual' ? ' (entered by Paul)' : ''}` : 'The client has not filled in onboarding yet.'}
                  {view.client.agreement && ` · Agreement ${view.client.agreement.version ?? ''} signed by ${view.client.agreement.signer ?? 'the client'}${view.client.agreement.role ? ` (${view.client.agreement.role})` : ''}`}</p>
                {view.client.answers.length > 0 && <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">{view.client.answers.map((a) => <FragmentPair key={a.label} k={a.label} v={a.value} />)}</dl>}
              </SubSection>
            </div>
          </div>

          <SubSection title="What they do" icon={ClipboardList} tone="blue" className="mt-4">
            <dl className="space-y-1.5">{work.map((f) => <FactRow key={f.key} f={f} busy={busy === `f:${f.key}`} onFact={fact} />)}</dl>
          </SubSection>

          <SubSection title="What did we find" icon={Search} tone="purple" className="mt-4">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <CrawlBlock c={view.found.crawl} job={view.found.crawl_job} />
              <HookBlock h={view.found.hook} />
            </div>
            {found.length > 0 && <dl className="mt-3 space-y-1.5">{found.map((f) => <FactRow key={f.key} f={f} busy={busy === `f:${f.key}`} onFact={fact} />)}</dl>}
          </SubSection>

          {view.route === 'build' && <BuildPrep v={view} />}
          {view.route === 'optimise' && <OptimisePrep v={view} />}
        </>
      )}
      {!view && <p className="mt-2 text-sm text-muted-foreground">The automatic intake has not run for this client (it starts by itself when a client pays). Press Run automatic intake to gather everything we already know.</p>}
    </section>
  );
}

function FragmentPair({ k, v }: { k: string; v: string }) {
  return <><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words font-medium">{v}</dd></>;
}

/** One fact: the value, where it came from, a conflict flag, the sources behind it, and Paul's controls. */
function FactRow({ f, busy, onFact }: { f: ProfileField; busy: boolean; onFact: (field: string, action: string, extra?: Record<string, unknown>) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const shown = f.kind === 'list' ? f.values.join(' · ') : f.value ?? '';
  const startEdit = () => { setDraft(f.kind === 'list' ? f.values.join(', ') : f.value ?? ''); setEditing(true); };
  const save = async () => { if (await onFact(f.key, 'edit', { value: draft })) setEditing(false); };
  return (
    <div className="min-w-0 border-b border-border/40 pb-1.5 last:border-0" data-testid={`fact-${f.key}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <dt className="text-xs text-muted-foreground">{f.label}{f.required && f.status === 'missing' && <span className="text-amber-600 dark:text-amber-400"> · needed</span>}</dt>
        <div className="flex flex-wrap items-center gap-1">
          {f.conflict && <ToneChip tone="amber" icon={ShieldAlert}>Needs review — conflicting evidence</ToneChip>}
          {!f.conflict && f.tier && <ToneChip tone={TIER_TONE[f.tier] ?? 'grey'} className={f.tier === 'confirmed' || f.tier === 'client' ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300' : undefined}>{f.sourceLabel}</ToneChip>}
        </div>
      </div>
      {!editing ? (
        <dd className={cn('mt-0.5 min-w-0 break-words text-sm', !shown && 'text-muted-foreground/70')}>{shown || 'Not found'}</dd>
      ) : (
        <div className="mt-1 flex gap-1.5">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="h-9 text-sm" aria-label={`${f.label} (Paul's value)`} placeholder={f.kind === 'list' ? 'Comma-separated' : undefined} />
          <Button size="sm" className="h-9" onClick={() => void save()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
          <Button size="sm" variant="ghost" className="h-9" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
        </div>
      )}
      {!editing && f.editable && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
          {shown && f.status !== 'confirmed' && <button type="button" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline disabled:opacity-50" disabled={busy} onClick={() => void onFact(f.key, 'confirm')}><Check className="h-3 w-3" />Confirm</button>}
          <button type="button" className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground" onClick={startEdit}><Pencil className="h-3 w-3" />Edit</button>
          {f.status === 'confirmed' && <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-50" disabled={busy} onClick={() => void onFact(f.key, 'clear')}>Back to automatic</button>}
          {f.tier && f.tier !== 'confirmed' && f.tier !== 'client' && <span className="text-muted-foreground">{TIER_WORDS[f.tier]}</span>}
        </div>
      )}
      {f.sources.length > 0 && (
        <details className="mt-0.5 text-[11px]">
          <summary className="inline-flex cursor-pointer select-none items-center gap-0.5 text-muted-foreground hover:text-foreground"><ChevronDown className="h-3 w-3" />Sources ({f.sources.length})</summary>
          <ul className="mt-1 space-y-1 pl-1">
            {f.sources.map((src, i) => (
              <li key={`${src.source}-${i}`} className={cn('min-w-0', src.rejected && 'line-through opacity-60')}>
                <span className="font-semibold">{src.label}:</span> <span className="break-words">{src.value ?? src.values?.join(' · ')}</span>
                {src.urls?.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="ml-1 text-primary hover:underline">{shortPath(u)}</a>)}
                {f.editable && !src.rejected && src.source !== 'manual' && <button type="button" className="ml-2 text-muted-foreground hover:text-red-600 disabled:opacity-50" disabled={busy} onClick={() => void onFact(f.key, 'reject', { source_index: i })}>Wrong — reject</button>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function shortPath(u: string): string {
  try { const x = new URL(u); return x.pathname === '/' ? x.hostname.replace(/^www\./, '') : x.pathname.slice(0, 40); } catch { return u.slice(0, 40); }
}

function CrawlBlock({ c, job }: { c: IntakeViewData['found']['crawl']; job: IntakeViewData['found']['crawl_job'] }) {
  const runningJob = job?.status === 'running';
  return (
    <div className="min-w-0 text-sm" data-testid="intake-crawl">
      <p className="flex items-center gap-1.5 font-semibold"><Globe className="h-4 w-4 text-muted-foreground" />Their website</p>
      {runningJob && <p className="mt-0.5 flex items-center gap-1 text-xs text-blue-700 dark:text-blue-300"><Loader2 className="h-3 w-3 animate-spin" />Crawling now (started {day(job?.started_at)})</p>}
      {!c && !runningJob && <p className="mt-0.5 text-xs text-muted-foreground">No crawl of their site on file.</p>}
      {c && (
        <>
          <p className="mt-0.5 text-xs text-muted-foreground">{c.mode === 'full' ? (c.capped ? 'Capped crawl' : 'Full crawl') : 'Quick check'} · {day(c.created_at)}{c.pages_ok != null ? ` · ${c.pages_ok} pages read` : ''}{c.urls_discovered != null ? ` of ${c.urls_discovered} found` : ''}{c.completeness === 'failed' || c.fetch_failed ? ' · could not be read' : ''}</p>
          {(c.platform || c.built_by) && <p className="text-xs">Platform: {[c.platform, c.built_by && `built by ${c.built_by}`].filter(Boolean).join(' · ')}</p>}
          {c.findings.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs">{c.findings.map((f) => <li key={f.id} className="flex gap-1.5"><span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', f.severity === 'high' ? 'bg-red-500' : f.severity === 'medium' ? 'bg-amber-500' : 'bg-muted-foreground/50')} />{f.title}{f.count > 1 ? ` (${f.count})` : ''}</li>)}</ul>
          )}
        </>
      )}
    </div>
  );
}

function HookBlock({ h }: { h: IntakeViewData['found']['hook'] }) {
  if (!h) return <div className="text-sm"><p className="font-semibold">Quick AI check</p><p className="mt-0.5 text-xs text-muted-foreground">No hook audit on file. The paid 20-question baseline is separate and comes later.</p></div>;
  return (
    <div className="min-w-0 text-sm" data-testid="intake-hook">
      <p className="font-semibold">Quick AI check (before they bought)</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{h.complete ? `Named in ${h.named} of ${h.expected} answers` : 'Not complete'}{h.per_engine.length ? ' · ' + h.per_engine.map((p) => `${p.label} ${p.named}/${p.expected}`).join(' · ') : ''} · {day(h.created_at)}</p>
      <ul className="mt-1 space-y-1 text-xs">
        {h.questions.map((q) => (
          <li key={q.question} className="min-w-0">
            <span className="font-medium">“{q.question}”</span>
            <span className="block text-muted-foreground">{q.results.map((r) => `${r.label}: ${r.status === 'named' ? 'named them' : r.status === 'not_named' ? `not named${r.competitors.length ? ` (named ${r.competitors.join(', ')})` : ''}` : r.status}`).join(' · ')}</span>
          </li>
        ))}
      </ul>
      {h.rivals_withheld && <p className="mt-1 text-[11px] text-muted-foreground">Competitor names withheld (the run's names could not be cleaned).</p>}
      <p className="mt-1 text-[11px] text-muted-foreground">This is the prospect check, not the guarantee. The paid baseline (20 questions × 3 runs) runs later.</p>
    </div>
  );
}

function ReuseLine({ r }: { r: ContentReuse }) {
  return <p className={cn('rounded-lg px-2.5 py-1.5 text-xs font-semibold', r === 'permitted' ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'bg-red-500/10 text-red-700 dark:text-red-300')} data-testid="intake-reuse">{CONTENT_REUSE_WORDS[r]}</p>;
}

function BuildPrep({ v }: { v: IntakeViewData }) {
  const c = v.found.crawl;
  return (
    <SubSection title="For the new website (Build)" icon={Sparkles} tone="blue" className="mt-4" testId="intake-build">
      <ReuseLine r={v.found.content_reuse} />
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <FragmentPair k="Existing pages" v={c?.urls_discovered != null ? `${c.urls_discovered} addresses found${c.families.length ? ` (${c.families.slice(0, 4).map((f) => `${f.family} ${f.count}`).join(', ')})` : ''}` : 'No crawl yet'} />
        <FragmentPair k="Logo" v={c?.logo ? 'Found on their site' : 'Not found'} />
        <FragmentPair k="Photos / share image" v={c?.og_image ? 'Found on their site' : 'Not found'} />
        <FragmentPair k="Reviews shown on their site" v={c?.reviews_on_site.length ? `${c.reviews_on_site.length} seen` : 'None seen'} />
        <FragmentPair k="Prices on their site" v={c?.prices_seen ? `${c.prices_seen} seen — prices stay Paul's to verify` : 'None seen'} />
      </dl>
      {v.found.content_reuse !== 'permitted' && <p className="mt-1 text-[11px] text-muted-foreground">Public is not permission: their content, logo and photos are for reference only until they confirm they own them.</p>}
    </SubSection>
  );
}

function OptimisePrep({ v }: { v: IntakeViewData }) {
  const c = v.found.crawl;
  return (
    <SubSection title="For optimising their website (Optimise)" icon={Sparkles} tone="blue" className="mt-4" testId="intake-optimise">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <FragmentPair k="Site size" v={c?.urls_discovered != null ? `${c.pages_ok ?? 0} pages read of ${c.urls_discovered} found` : 'No crawl yet'} />
        <FragmentPair k="Page types" v={c?.families.length ? c.families.map((f) => `${f.family} ${f.count}`).join(', ') : '—'} />
        <FragmentPair k="Platform" v={[v.found.website_platform, c?.platform].filter(Boolean).join(' · ') || 'Not detected'} />
        <FragmentPair k="Who controls it" v={v.sales.website_control?.replace(/_/g, ' ') || v.found.website_manager || 'Not recorded'} />
        <FragmentPair k="Technical issues" v={c?.findings.length ? `${c.findings.length} to look at (see Their website above)` : 'None recorded'} />
      </dl>
      <p className="mt-1 text-[11px] text-muted-foreground">Nothing is changed on their site until access is in place.</p>
    </SubSection>
  );
}
