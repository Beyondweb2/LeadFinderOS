import { useEffect, useState, type ReactNode } from 'react';
import { logFeatureUse } from '@/lib/featureUsage';
import { AlertTriangle, Building2, Check, ChevronDown, Copy, Globe, HelpCircle, Loader2, MessageSquareQuote, PhoneCall, ScrollText, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import { GOOGLE_STILL_MATTERS_SHORT, WHY_IT_MATTERS_STATS } from '@/lib/salesExplainer';
import { VoiceNoteScriptBody } from '@/components/VoiceNoteScriptButton';
import { QuickCloseButton } from '@/components/QuickCloseDialog';
import { HookVisibilityCard } from '@/components/HookVisibilityCard';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useColdCallPlaybook } from '@/hooks/useColdCallPlaybook';
import { type ColdCallPlaybook } from '@/lib/coldCallPlaybook';
import { afterFirstQuestion, type WebsiteManager } from '@/lib/callScript';
import type { ServiceRoute } from '@/lib/findableOffer';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   COLD CALL PLAYBOOK — the one shared call screen, opened from BOTH Inbox and Outreach (2026-09-23).

   🔴 REBUILT FOR USE ON A LIVE CALL (sales-team-today, Paul, 2026-10-06): SCAN → SAY → ASK → LOG → CLOSE.
      SAY        — Paul's tested opener (src/lib/callScript.ts), the REAL website reasons, the bridge.
      ASK        — the first question, ALWAYS "Do you manage the website yourself, or does an agency do
                   it?", with two answer buttons; the agency branch (contract, cost, an honest price angle)
                   opens only after "Agency"; then 2–3 discovery questions.
      OFFER      — Optimise | Build, ONE plan open at a time, preselected from the lead's website; the
                   guarantee once; the close line.
      OBJECTIONS — closed; one answer open at a time.
      Sticky bar: LOG THIS CALL + QUICK CLOSE — the only Quick Close on this screen.
   ⛔ REMOVED (Paul, 2026-10-06) and pinned absent by scripts/call-script.test.ts: the LinkedIn and Email
      scripts, the gatekeeper and voicemail lines, "if they'd rather see it first", "the longer version is
      in …", the research source links, the "where does most of your work come from" question, and the
      second copy of the AI result (the ONE AI summary is the top of the Call tab — LeadHookPanel 'call').
   ⛔ Read-only. It has no send, no audit and no crawl control. The one write is a feature-usage row
      (src/lib/featureUsage.ts: the call script shown for a lead, at most one a day).
   ⛔ Operator-only, behind the app's authenticated routes. Nothing here is ever written into a public URL.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const COLD_CALL_PLAYBOOK_LABEL = 'Cold Call Playbook';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button type="button" size="sm" variant="outline" className="h-7 gap-1 rounded-full px-2.5 text-xs"
      onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

/** A section of the call: a coloured marker and a short heading — never a box inside a box. */
const BAR: Record<'blue' | 'purple' | 'amber' | 'green' | 'grey', string> = {
  blue: 'bg-blue-500', purple: 'bg-violet-500', amber: 'bg-amber-500', green: 'bg-teal-500', grey: 'bg-border',
};
function Step({ title, tone = 'grey', hint, children, testId, action }: { title: string; tone?: keyof typeof BAR; hint?: ReactNode; children: ReactNode; testId?: string; action?: ReactNode }) {
  return (
    <section className="min-w-0 space-y-2" data-testid={testId}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cn('h-4 w-1 shrink-0 rounded-full', BAR[tone])} aria-hidden />
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground/80">{title}</h3>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
        {action && <span className="ml-auto">{action}</span>}
      </header>
      {children}
    </section>
  );
}

/** The script as plain text for the Copy button — the same sections, in the same order, as the screen. */
export function callFlowText(p: ColdCallPlaybook): string {
  const s = p.script;
  const plan = s.plans.routes.find((r) => r.route === s.plans.preselected) ?? s.plans.routes[0];
  return [
    'SAY\n' + s.opener.join('\n'),
    ...(s.found.lines.length ? ['REASONS\n' + s.found.lines.map((l) => '- ' + l).join('\n')] : []),
    s.bridge.join('\n'),
    'FIRST QUESTION\n' + s.firstQuestion.question,
    'IF AN AGENCY\n- ' + s.ifAgency.questions.join('\n- '),
    'THEN ASK\n' + s.discovery.map((q) => '- ' + q).join('\n'),
    'WHAT WE DO\n' + s.whatWeDo,
    ...(plan ? ['PLAN: ' + plan.name + ' (' + plan.summary + ')\n' + plan.spoken.join(' ')] : []),
    'GUARANTEE\n' + s.guarantee.spoken,
    s.closeLine,
  ].join('\n\n');
}

/* ── SAY ──────────────────────────────────────────────────────────────────────────────────────── */
function Say({ p }: { p: ColdCallPlaybook }) {
  const s = p.script;
  return (
    <Step title="Say" tone="blue" testId="call-step-open" action={<CopyButton text={callFlowText(p)} label="Copy" />}>
      <div className="space-y-2 text-[15px] leading-relaxed" data-testid="playbook-call-script">{s.opener.map((line) => <p key={line}>{line}</p>)}</div>
      {s.found.lines.length > 0 && (
        <ul className="space-y-1.5" data-testid="call-step-found">
          {s.found.lines.map((l) => (
            <li key={l} className="flex gap-2 rounded-xl bg-amber-500/[0.07] px-3 py-2 text-[15px] leading-snug ring-1 ring-inset ring-amber-500/25">
              <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" /><span className="min-w-0">{l}</span>
            </li>
          ))}
        </ul>
      )}
      {s.found.note && <p className="text-[11px] text-muted-foreground" data-testid="call-found-note">{s.found.note}</p>}
      <div className="space-y-1.5 text-[15px] leading-relaxed" data-testid="call-step-bridge">{s.bridge.map((l) => <p key={l}>{l}</p>)}</div>
      {s.openerNote && <p className="text-[11px] text-muted-foreground" data-testid="call-opener-note">{s.openerNote}</p>}
    </Step>
  );
}

/* ── ASK: the first question (always), the agency branch, then discovery ─────────────────────── */
function Ask({ p }: { p: ColdCallPlaybook }) {
  const s = p.script;
  const [manager, setManager] = useState<WebsiteManager | null>(null);
  const [agencyGbp, setAgencyGbp] = useState('');
  const after = manager ? afterFirstQuestion(manager, agencyGbp.trim() === '' ? null : Number(agencyGbp)) : null;
  const choice = (on: boolean) => cn('h-9 flex-1 rounded-full px-3 text-sm font-semibold ring-1 ring-inset transition sm:flex-none',
    on ? 'bg-violet-600 text-white ring-violet-600' : 'bg-background text-foreground ring-border hover:bg-muted');
  return (
    <>
      <Step title="Ask first" tone="purple" testId="call-step-first">
        <div className="space-y-2.5 rounded-2xl bg-violet-500/[0.07] p-3 ring-1 ring-inset ring-violet-500/30">
          <p className="text-base font-semibold leading-snug" data-testid="call-first-question">{s.firstQuestion.question}</p>
          {s.firstQuestion.hint && <p className="text-xs text-muted-foreground">{s.firstQuestion.hint}</p>}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Their answer">
            <button type="button" aria-pressed={manager === 'self'} className={choice(manager === 'self')} onClick={() => setManager('self')} data-testid="answer-self">I manage it</button>
            <button type="button" aria-pressed={manager === 'agency'} className={choice(manager === 'agency')} onClick={() => setManager('agency')} data-testid="answer-agency">Agency / someone else</button>
          </div>
          {manager === 'agency' && after && (
            <div className="space-y-2 border-t border-violet-500/20 pt-2.5" data-testid="call-step-agency">
              <ol className="list-decimal space-y-1 pl-5 text-[15px] leading-relaxed">{after.ask.map((q) => <li key={q}>{q}</li>)}</ol>
              <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                Roughly a month (£)
                <input type="number" inputMode="decimal" min={0} value={agencyGbp} onChange={(e) => setAgencyGbp(e.target.value)}
                  className="h-8 w-24 rounded-lg border bg-background px-2 text-sm text-foreground" aria-label="What they pay their agency a month" data-testid="agency-monthly" />
              </label>
              {after.priceAngle && (
                <p className="rounded-xl bg-teal-500/10 px-3 py-2 text-sm leading-snug ring-1 ring-inset ring-teal-500/30" data-testid="call-price-angle">“{after.priceAngle}”</p>
              )}
              <p className="text-[11px] text-muted-foreground">{s.ifAgency.coaching[0]}</p>
            </div>
          )}
        </div>
      </Step>
      <Step title="Then ask" tone="purple" hint="pick what fits" testId="call-step-ask">
        <ul className="space-y-1 text-[15px] leading-snug">{s.discovery.map((q) => <li key={q} className="flex gap-2"><HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />{q}</li>)}</ul>
      </Step>
    </>
  );
}

/* ── WHAT WE DO: one sentence, two figures, one line ───────────────────────────────────────────── */
function WhyAndWhat({ p }: { p: ColdCallPlaybook }) {
  return (
    <Step title="What we do" tone="blue" testId="call-step-explain">
      <p className="text-[15px] leading-relaxed">{p.script.whatWeDo}</p>
      <div className="grid grid-cols-2 gap-2" data-testid="why-it-matters">
        {WHY_IT_MATTERS_STATS.map((s) => (
          <div key={s.figure} className="rounded-xl bg-blue-500/[0.07] px-3 py-2 ring-1 ring-inset ring-blue-500/20">
            <p className="text-xl font-bold leading-none text-blue-700 dark:text-blue-300">{s.figure}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{GOOGLE_STILL_MATTERS_SHORT}</p>
    </Step>
  );
}

/* ── THE OFFER: one plan open at a time, the guarantee once ───────────────────────────────────── */
function Offer({ p }: { p: ColdCallPlaybook }) {
  const s = p.script;
  const [route, setRoute] = useState<ServiceRoute>(s.plans.preselected);
  const plan = s.plans.routes.find((r) => r.route === route) ?? s.plans.routes[0];
  if (!plan) return null;
  return (
    <Step title="Offer" tone="green" testId="call-step-close">
      {s.plans.routes.length > 1 ? (
        <div className="inline-flex rounded-full bg-muted p-0.5" role="tablist" aria-label="Plan" data-testid="call-plan-switch">
          {s.plans.routes.map((r) => (
            <button key={r.route} type="button" role="tab" aria-selected={r.route === plan.route} data-testid={'call-plan-' + r.route}
              onClick={() => setRoute(r.route)}
              className={cn('rounded-full px-3.5 py-1 text-xs font-semibold transition', r.route === plan.route ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {r.route === 'optimise' ? 'Optimise' : 'Build'}
            </button>
          ))}
        </div>
      ) : s.plans.note && <p className="text-[11px] text-muted-foreground">{s.plans.note}</p>}
      <div className="space-y-1.5 rounded-2xl bg-teal-500/[0.06] p-3 ring-1 ring-inset ring-teal-500/30" data-testid={'call-route-' + plan.route}>
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold">{plan.name}<span className="text-xs font-semibold text-teal-700 dark:text-teal-300">{plan.summary}</span></p>
        <div className="space-y-1 text-sm leading-relaxed">{plan.spoken.map((x) => <p key={x}>{x}</p>)}</div>
      </div>
      <div className="flex gap-2 px-1 text-sm" data-testid="call-guarantee">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">Money-back guarantee</p>
          <p className="leading-snug">{s.guarantee.spoken}</p>
          <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">{s.guarantee.caution}</p>
        </div>
      </div>
      <p className="text-[15px] font-medium">“{s.closeLine}”</p>
    </Step>
  );
}

/* ── OBJECTIONS: closed, one answer open at a time ─────────────────────────────────────────────── */
function Objections({ p }: { p: ColdCallPlaybook }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Step title="Objections" tone="amber" testId="call-step-objections">
      <div className="flex flex-wrap gap-1.5" data-testid="playbook-questions">
        {p.script.objections.map((o, i) => (
          <button key={o.objection} type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}
            className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition',
              open === i ? 'bg-amber-500 text-white ring-amber-500' : 'bg-background ring-border hover:bg-muted')}>
            {o.objection}<ChevronDown className={cn('h-3 w-3 transition-transform', open === i && 'rotate-180')} />
          </button>
        ))}
      </div>
      {open !== null && p.script.objections[open] && (
        <p className="rounded-xl bg-amber-500/[0.08] px-3 py-2 text-[15px] leading-snug ring-1 ring-inset ring-amber-500/30" data-testid="objection-answer">
          {p.script.objections[open].answer}
        </p>
      )}
    </Step>
  );
}

function CallFlow({ p }: { p: ColdCallPlaybook }) {
  return (
    <div className="space-y-5" data-testid="playbook-call-flow">
      <Say p={p} />
      <Ask p={p} />
      <WhyAndWhat p={p} />
      <Offer p={p} />
      <Objections p={p} />
    </div>
  );
}

type ScriptTab = 'call' | 'voice';

function Scripts({ p, leadId, initial = 'call' }: { p: ColdCallPlaybook; leadId: string; initial?: ScriptTab }) {
  const [tab, setTab] = useState<ScriptTab>(initial);
  // The call script counts as used when it is on screen for this lead (the database keeps one a day).
  useEffect(() => { if (tab === 'call') logFeatureUse('call_script', leadId); }, [tab, leadId]);
  const tabs: Array<[ScriptTab, string]> = [['call', 'Call script'], ['voice', 'Voice note']];
  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:p-4" data-testid="playbook-scripts">
      <div className="inline-flex rounded-full bg-muted p-0.5" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={cn('rounded-full px-3.5 py-1 text-xs font-semibold transition', tab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{label}</button>
        ))}
      </div>
      {tab === 'call' && <CallFlow p={p} />}
      {tab === 'voice' && <VoiceNoteScriptBody leadId={leadId} currentAuditId={p.auditId} />}
    </section>
  );
}

function Warnings({ p }: { p: ColdCallPlaybook }) {
  if (!p.warnings.length) return null;
  return (
    <div className="space-y-1 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-500/30 dark:text-amber-200" data-testid="playbook-warnings">
      {p.warnings.map((w) => <p key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</p>)}
    </div>
  );
}

/** Who they are, in one line — only on the side sheet (the lead popup's header already says it). */
function Prospect({ p }: { p: ColdCallPlaybook }) {
  const c = p.context;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" data-testid="playbook-prospect">
      {c.phone ? <a href={'tel:' + c.phone} className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline dark:text-emerald-300"><PhoneCall className="h-3.5 w-3.5" />{c.phone}</a> : <span className="text-muted-foreground">No phone</span>}
      <span className="inline-flex min-w-0 items-center gap-1"><Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{c.website ? <span className="truncate">{c.website.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')}</span> : <span className="text-muted-foreground">No website</span>}</span>
      {(c.trade || c.town) && <span className="inline-flex items-center gap-1 text-muted-foreground"><Building2 className="h-3.5 w-3.5" />{[c.trade, c.town].filter(Boolean).join(', ')}</span>}
      {c.auditDate && <span className="text-muted-foreground">AI checked {c.auditDate}</span>}
    </div>
  );
}

/** The call's outcome and next action go through the ONE Log window (LeadCallFlow); Quick Close opens its
 *  dialog. These two are the ONLY primary actions on the call screen. */
function LogCallBar({ onLogCall, leadId }: { onLogCall: () => void; leadId: string }) {
  return (
    <div className="sticky bottom-0 z-10 mt-3 flex items-center gap-2 border-t border-border bg-background/95 py-2 backdrop-blur" data-testid="call-actions">
      <Button type="button" className="h-11 min-w-0 flex-1 rounded-full text-sm font-bold" onClick={onLogCall} data-testid="log-this-call">
        <PhoneCall className="mr-1.5 h-4 w-4 shrink-0" /><span className="truncate">Log this call</span>
      </Button>
      <QuickCloseButton leadId={leadId} className="h-11 rounded-full px-4 text-sm" />
    </div>
  );
}

/** The playbook inline — the lead popup's Call tab (Inbox and Outreach alike). The AI result sits ABOVE it
 *  (LeadDetailDialog → LeadHookPanel 'call'), so this body never repeats it. */
export function ColdCallPlaybookInline({ leadId, initialScript, onLogCall }: { leadId: string; initialScript?: 'call' | 'voice'; onLogCall?: () => void }) {
  const q = useColdCallPlaybook(leadId, true);
  if (q.isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading the script…</p>;
  if (q.isError) return <p className="text-sm text-destructive">Couldn't load the script: {(q.error as { message?: string })?.message ?? 'unknown error'}</p>;
  if (!q.data) return <p className="text-sm text-muted-foreground">Lead not found.</p>;
  return (
    <div className="space-y-3 pb-2" data-testid="cold-call-playbook">
      <Warnings p={q.data} />
      <Scripts p={q.data} leadId={leadId} initial={initialScript} />
      {onLogCall && <LogCallBar onLogCall={onLogCall} leadId={leadId} />}
    </div>
  );
}

export function ColdCallPlaybookSheet({ leadId, open, onOpenChange, onLogCall }: { leadId: string | null; open: boolean; onOpenChange: (open: boolean) => void; onLogCall?: () => void }) {
  const q = useColdCallPlaybook(leadId, open);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="mb-3">
          <SheetTitle className="flex items-center gap-2"><ScrollText className="h-5 w-5" />{COLD_CALL_PLAYBOOK_LABEL}</SheetTitle>
          <SheetDescription>{q.data?.context.business ?? 'Built from the evidence already stored for this lead. Nothing is re-run.'}</SheetDescription>
        </SheetHeader>
        {q.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading stored evidence…</p>}
        {q.isError && <p className="text-sm text-destructive">Couldn't load the playbook: {(q.error as { message?: string })?.message ?? 'unknown error'}</p>}
        {q.isSuccess && !q.data && <p className="text-sm text-muted-foreground">Lead not found.</p>}
        {q.data && leadId && (
          <div className="space-y-3 pb-4" data-testid="cold-call-playbook">
            <Prospect p={q.data} />
            {/* The ONE AI summary (read-only here: the run / re-run controls live in the lead popup). */}
            <section className="space-y-2 rounded-2xl border border-violet-500/30 bg-violet-500/[0.04] p-3" data-testid="playbook-ai-summary">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300"><Sparkles className="h-4 w-4" />AI result</h3>
              <HookVisibilityCard leadId={leadId} variant="call" />
              {q.data.audit.state !== 'ready' && <p className="text-xs text-muted-foreground">{q.data.audit.headline}</p>}
            </section>
            <Warnings p={q.data} />
            <Scripts p={q.data} leadId={leadId} />
          </div>
        )}
        <div className="sticky bottom-0 -mx-6 flex gap-2 border-t border-border bg-background px-6 py-2">
          {onLogCall && leadId && <Button type="button" className="flex-1 rounded-full" onClick={onLogCall} data-testid="log-this-call"><PhoneCall className="mr-1.5 h-4 w-4" />Log this call</Button>}
          <Button type="button" variant="outline" className="flex-1 rounded-full" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The labelled button + its panel. The ONE entry point Inbox and Outreach both render. */
export function ColdCallPlaybookButton({ leadId, className, compact, iconOnly }: { leadId: string; className?: string; compact?: boolean; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  /* Icon-only sits in the Inbox header row and the Outreach row's contact icons (Paul, 2026-09-23):
     the caller passes that row's own button class so it matches its siblings. */
  if (iconOnly) {
    return (
      <>
        <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }} title={COLD_CALL_PLAYBOOK_LABEL} aria-label={COLD_CALL_PLAYBOOK_LABEL} className={className}>
          <ScrollText className="h-4 w-4" />
        </button>
        {open && <ColdCallPlaybookSheet leadId={leadId} open={open} onOpenChange={setOpen} />}
      </>
    );
  }
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }} title={COLD_CALL_PLAYBOOK_LABEL} aria-label={COLD_CALL_PLAYBOOK_LABEL}
        className={cn('inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 font-semibold text-sky-700 transition-colors hover:bg-sky-500/20 dark:text-sky-300',
          compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs', className)}>
        <MessageSquareQuote className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        {COLD_CALL_PLAYBOOK_LABEL}
      </button>
      {open && <ColdCallPlaybookSheet leadId={leadId} open={open} onOpenChange={setOpen} />}
    </>
  );
}
