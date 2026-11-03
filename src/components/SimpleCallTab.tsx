/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CALL TAB, DEAD SIMPLE (Paul, 2026-11-03): facts, script, offer, close button. No explaining text.

     1 WHAT WE FOUND — who AI named instead (the best missed search) with the ChatGPT / Gemini / Google AI scores;
       the top website issues, de-duplicated, "Show all" for the rest; one small reminder line.
     2 THE SCRIPT — the WEBSITE or the NO WEBSITE version (src/lib/simpleCallScript.ts), Voice note beside it.
     3 WHAT WE OFFER — Findable Complete, one list.
     4 OBJECTIONS — closed.
     5 Sticky bottom: Log this call + Quick Close (the only Quick Close on this screen).

   ⛔ The script is chosen ONCE, when the tab first has the lead: adding the website mid-call (the NO WEBSITE script's
      "what's the address?") must not swap the page under the rep. A new lead remounts the tab.
   ⛔ No send, no audit control of its own: the AI check's run / re-run / full audit stay in LeadHookPanel, folded below
      the facts (open when there is no result yet). The ONE website watch is useWebsiteCrawl (WebsiteCrawlSection.tsx).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, Loader2, RefreshCw, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AiOverviewChip } from '@/components/AiOverviewChip';
import { LeadHookPanel, useAddWebsite } from '@/components/LeadCrmPanel';
import { LogCallBar, Objections, ScriptLocked } from '@/components/ColdCallPlaybook';
import { VoiceNoteScriptBody } from '@/components/VoiceNoteScriptButton';
import { useWebsiteCrawl } from '@/components/WebsiteCrawlSection';
import { useColdCallPlaybook } from '@/hooks/useColdCallPlaybook';
import { useHookVisibility } from '@/hooks/useHookVisibility';
import { checkNewWebsite } from '@/hooks/useCheckNewWebsite';
import { logFeatureUse } from '@/lib/featureUsage';
import { callScriptGate } from '@/lib/callScriptGate';
import { overviewTally } from '@/lib/aiOverview';
import { scoreTone, SCORE_TONE_CLASS } from '@/lib/scoreTone';
import { plainIssueTitle, issueWhere, type WebsiteIssue } from '@/lib/websiteCheck';
import { CHECKING_WEBSITE_LINE, COULD_NOT_CHECK_LINE } from '@/lib/websiteCrawlShown';
import { CALL_SCRIPT_CHECK_OLD_DAYS, CALL_SCRIPT_CHECK_OLD_NOTE } from '@/lib/callScript';
import { classifyLeadWebsite } from '@/lib/leadWebsiteKind';
import type { ColdCallPlaybook } from '@/lib/coldCallPlaybook';
import {
  OFFER_UNDER_LINE, SAY_IT_LINE, buildSimpleScript, contactFirstNameOf, foundIssues, offerLines,
  type ScriptKind, type ScriptLine,
} from '@/lib/simpleCallScript';

const GREY = 'text-[11px] leading-snug text-muted-foreground';

/** A section: a small heading, then its content. */
function Block({ title, children, testId, action }: { title: string; children: ReactNode; testId?: string; action?: ReactNode }) {
  return (
    <section className="space-y-2" data-testid={testId}>
      <div className="flex items-center gap-2">
        <span className="h-4 w-1 shrink-0 rounded-full bg-blue-500" aria-hidden />
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground/80">{title}</h3>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {children}
    </section>
  );
}

/* ── 1 · WHAT WE FOUND ─────────────────────────────────────────────────────────────────────────── */

function IssueRow({ issue }: { issue: WebsiteIssue }) {
  const [open, setOpen] = useState(false);
  const where = issueWhere(issue);
  return (
    <li className="rounded-xl bg-amber-500/[0.07] px-3 py-2 ring-1 ring-inset ring-amber-500/25" data-testid="found-issue">
      <button type="button" className="flex w-full items-start gap-2 text-left text-sm font-medium leading-snug" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <span className="min-w-0 flex-1">{plainIssueTitle(issue)}</span>
        <ChevronDown className={cn('mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 text-[12px] leading-snug text-muted-foreground">
          <p>{issue.saw}</p>
          {issue.pages.map((u) => <p key={u} className="break-all">{u}</p>)}
          {!issue.pages.length && where && <p>{where}</p>}
        </div>
      )}
    </li>
  );
}

function Scores({ leadId }: { leadId: string }) {
  const q = useHookVisibility(leadId);
  const card = q.data?.card ?? null;
  if (!card || card.score.expected === 0) {
    return <p className="text-sm text-muted-foreground" data-testid="found-no-ai">{q.data?.inFlight ? 'AI check running…' : 'No AI check yet.'}</p>;
  }
  const { score, rivalsWithheld } = card;
  const inFlight = !!q.data?.inFlight;
  const names = score.hook?.competitors ?? [];
  return (
    <div className="space-y-1.5" data-testid="found-ai">
      {score.hook && (
        <p className="break-words text-sm" data-testid="found-named-instead">
          <span className="text-muted-foreground">AI named instead: </span>
          {rivalsWithheld ? <span className="italic text-muted-foreground">names withheld</span>
            : names.length ? <span className="font-semibold">{names.slice(0, 3).join(', ')}</span>
            : <span className="italic text-muted-foreground">no names on file</span>}
          <span className="block text-[11px] text-muted-foreground">for “{score.hook.question}”</span>
        </p>
      )}
      {score.complete && score.allNamed && <p className="text-sm font-medium">Named in all {score.expected} results — no missed search to use.</p>}
      <div className="flex flex-wrap gap-2 text-sm" data-testid="found-scores">
        {score.perEngine.map((t) => {
          const done = t.valid === t.expected && !(inFlight && !score.complete);
          const tone = done ? scoreTone(t.named, t.expected) : 'none';
          return (
            <span key={t.engine} data-testid="found-engine-score" data-engine={t.engine} className={cn('whitespace-nowrap rounded-full px-2.5 py-1 ring-1 ring-inset', SCORE_TONE_CLASS[tone].chip)}>
              <span className="font-medium">{t.label}</span>{' '}
              {done ? <span className={cn('font-bold tabular-nums', SCORE_TONE_CLASS[tone].text)}>{t.named}/{t.expected}</span>
                : <span className="tabular-nums">{t.valid + t.failed}/{t.expected} checked</span>}
            </span>
          );
        })}
        <AiOverviewChip tally={overviewTally(score.overviews)} label="Google AI" inScore={score.scored.googleAi.inScore} className="px-2.5 py-1 text-sm" testId="found-google-ai" />
      </div>
    </div>
  );
}

function Issues({ p, leadId }: { p: ColdCallPlaybook; leadId: string }) {
  const { check, shown, runAgain, error } = useWebsiteCrawl(p, leadId);
  const [all, setAll] = useState(false);
  if (shown === 'no_website') return <p className="text-sm text-muted-foreground" data-testid="found-no-website">No website on file.</p>;
  if (shown === 'checking') return <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="found-checking"><Loader2 className="h-4 w-4 animate-spin" />{CHECKING_WEBSITE_LINE}</p>;
  if (shown === 'could_not_check') {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground" data-testid="found-failed">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />{COULD_NOT_CHECK_LINE}
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 rounded-full px-2.5 text-xs" onClick={() => void runAgain()}><RefreshCw className="h-3.5 w-3.5" />Try again</Button>
        {error && <span className="text-[11px] text-destructive">{error}</span>}
      </p>
    );
  }
  const { shown: top, all: every, hidden } = foundIssues(check.serious);
  const old = check.ageDays != null && check.ageDays > CALL_SCRIPT_CHECK_OLD_DAYS;
  if (!every.length) return <p className="text-sm text-muted-foreground" data-testid="found-clean">No issues found on the site.</p>;
  return (
    <div className="space-y-1.5" data-testid="found-issues">
      <ul className="space-y-1.5">{(all ? every : top).map((i) => <IssueRow key={i.id} issue={i} />)}</ul>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {hidden > 0 && <button type="button" className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400" onClick={() => setAll(!all)} data-testid="found-show-all">{all ? 'Show fewer' : `Show all (${every.length})`}</button>}
        {old && <button type="button" className="text-[11px] font-semibold text-amber-700 hover:underline dark:text-amber-400" onClick={() => void runAgain()} data-testid="found-run-again">{CALL_SCRIPT_CHECK_OLD_NOTE}</button>}
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function WhatWeFound({ p, leadId }: { p: ColdCallPlaybook; leadId: string }) {
  const noResult = p.audit.state !== 'ready';
  return (
    <Block title="What we found" testId="what-we-found">
      <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-3">
        <Scores leadId={leadId} />
        <Issues p={p} leadId={leadId} />
        <p className={GREY} data-testid="found-say-it">{SAY_IT_LINE}</p>
      </div>
      {/* The AI check's own controls (run / re-run, full audit, report) — folded; open when there is no result to show yet. */}
      <details className="rounded-xl border border-border/60 px-3 py-2" open={noResult} data-testid="found-ai-tools">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Full audit and re-run</summary>
        <div className="mt-2"><LeadHookPanel leadId={leadId} variant="call" /></div>
      </details>
    </Block>
  );
}

/* ── 2 · THE SCRIPT ────────────────────────────────────────────────────────────────────────────── */

function AddWebsite({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const { add, busy, ready } = useAddWebsite(leadId);
  const [text, setText] = useState('');
  const [added, setAdded] = useState(false);
  const submit = async () => {
    const w = text.trim();
    if (!w) return;
    if (await add(w)) {
      setAdded(true); setText('');
      await qc.invalidateQueries({ queryKey: ['cold-call-playbook', leadId] });
      void checkNewWebsite(qc, leadId, w);   // the app's existing website check, started at once
    }
  };
  if (added) return <p className={GREY} data-testid="add-website-done">Added. Checking the website now.</p>;
  return (
    <div className="flex items-center gap-2" data-testid="add-website">
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} placeholder="their website address" aria-label="Their website address"
        className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60" />
      <Button type="button" size="sm" className="h-9" disabled={busy || !ready || !text.trim()} onClick={() => void submit()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}</Button>
    </div>
  );
}

function ScriptLines({ lines, leadId }: { lines: ScriptLine[]; leadId: string }) {
  return (
    <div className="space-y-2.5" data-testid="simple-script-lines">
      {lines.map((l, idx) => {
        switch (l.kind) {
          case 'say': return <p key={idx} className="text-[15px] leading-relaxed" data-testid="script-say">{l.text}</p>;
          case 'prompt': return <p key={idx} className={GREY} data-testid="script-prompt">{l.text}</p>;
          case 'pick': return (
            <div key={idx} className="space-y-1" data-testid="script-pick">
              <p className={GREY}>Pick one</p>
              <ul className="list-disc space-y-1 pl-5 text-[15px] leading-snug">{l.options.map((o) => <li key={o}>{o}</li>)}</ul>
            </div>
          );
          case 'branch': return (
            <div key={idx} className="space-y-1.5" data-testid="script-branch">
              <p className="text-[15px] leading-relaxed"><span className={cn(GREY, 'mr-1.5')}>{l.label}</span>{l.text}</p>
              {l.note && <p className={GREY}>{l.note}</p>}
              {l.addWebsite && <AddWebsite leadId={leadId} />}
            </div>
          );
          case 'stat': return (
            <div key={idx} className="space-y-0.5" data-testid="script-stat">
              <p className="text-[15px] leading-relaxed">{l.text}</p>
              <p className={GREY}>{l.source}</p>
            </div>
          );
        }
      })}
    </div>
  );
}

function Script({ p, leadId, kind, contactName }: { p: ColdCallPlaybook; leadId: string; kind: ScriptKind; contactName: string | null | undefined }) {
  const [tab, setTab] = useState<'call' | 'voice'>('call');
  useEffect(() => { if (tab === 'call') logFeatureUse('call_script', leadId); }, [tab, leadId]);
  const gate = callScriptGate(leadId, p);
  const lines = buildSimpleScript({
    hasWebsite: kind === 'website', contactFirstName: contactFirstNameOf(contactName), businessName: p.context.business,
    searchFor: p.context.searchFor, competitors: p.evidence.competitors,
  });
  const pill = (key: 'call' | 'voice', label: string) => (
    <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
      className={cn('rounded-full px-3.5 py-1 text-xs font-semibold transition', tab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{label}</button>
  );
  return (
    <Block title="Call script" testId="simple-script">
      <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:p-4" data-testid="playbook-scripts" data-script={kind}>
        <div className="inline-flex rounded-full bg-muted p-0.5" role="tablist">{pill('call', 'Call script')}{pill('voice', 'Voice note')}</div>
        {tab === 'voice' ? <VoiceNoteScriptBody leadId={leadId} playbook={p} />
          : gate.show ? <ScriptLines lines={lines} leadId={leadId} />
            : <ScriptLocked gate={gate} />}
      </section>
    </Block>
  );
}

/* ── 3 · WHAT WE OFFER ─────────────────────────────────────────────────────────────────────────── */

function Offer() {
  return (
    <Block title="What we offer" testId="simple-offer">
      <div className="space-y-2 rounded-2xl border border-border/70 border-l-[3px] border-l-blue-500 bg-card p-3 text-sm shadow-sm">
        <ul className="list-disc space-y-1 pl-5 leading-snug" data-testid="offer-list">{offerLines().map((l) => <li key={l}>{l}</li>)}</ul>
        <p className={GREY} data-testid="offer-under">{OFFER_UNDER_LINE}</p>
      </div>
    </Block>
  );
}

/* ── THE TAB ───────────────────────────────────────────────────────────────────────────────────── */

export function SimpleCallTab({ leadId, contactName, onLogCall }: { leadId: string; contactName?: string | null; onLogCall: () => void }) {
  const q = useColdCallPlaybook(leadId, true);
  /* The script is picked once, from the first read of the lead (see the header). */
  const kind = useRef<ScriptKind | null>(null);
  if (kind.current === null && q.data) kind.current = classifyLeadWebsite(q.data.context.website).source === 'own_site' ? 'website' : 'no_website';
  if (q.isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading the call…</p>;
  if (q.isError) return <p className="text-sm text-destructive">Couldn't load the call: {(q.error as { message?: string })?.message ?? 'unknown error'}</p>;
  if (!q.data || !kind.current) return <p className="text-sm text-muted-foreground">Lead not found.</p>;
  return (
    <div className="space-y-5 pb-2" data-testid="cold-call-playbook">
      <WhatWeFound p={q.data} leadId={leadId} />
      <Script p={q.data} leadId={leadId} kind={kind.current} contactName={contactName} />
      <Offer />
      <Objections p={q.data} startOpen={false} />
      <LogCallBar onLogCall={onLogCall} leadId={leadId} />
    </div>
  );
}

/** "You've been in touch before" — a small tag by the lead's name (never script text). */
export function TouchedBeforeTag({ leadId }: { leadId: string }) {
  const q = useColdCallPlaybook(leadId, true);
  if (q.data?.mode !== 'follow_up') return null;
  return <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground" data-testid="touched-before-tag" title="You've been in touch with them before">In touch before</span>;
}
