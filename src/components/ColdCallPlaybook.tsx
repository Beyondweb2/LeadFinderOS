import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { logFeatureUse } from '@/lib/featureUsage';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { notifyLeadChanged } from '@/lib/leadSync';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import { offerFit, thirdPartyManaged, type QcAgencyContract, type QuickCloseAnswers } from '@/lib/quickClose';
import { AlertTriangle, ArrowUp, Building2, Lock, Check, ChevronDown, Copy, Globe, HelpCircle, Loader2, MessageSquareQuote, PhoneCall, ScrollText, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import { GOOGLE_STILL_MATTERS_SHORT, WHY_IT_MATTERS_STATS } from '@/lib/salesExplainer';
import { VoiceNoteScriptBody } from '@/components/VoiceNoteScriptButton';
import { QuickCloseButton, quickCloseKey, useQuickClose } from '@/components/QuickCloseDialog';
import { HookVisibilityCard } from '@/components/HookVisibilityCard';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { IconTile } from '@/components/operator/ui';
import { cn } from '@/lib/utils';
import { useColdCallPlaybook } from '@/hooks/useColdCallPlaybook';
import { type ColdCallPlaybook } from '@/lib/coldCallPlaybook';
import { afterFirstQuestion, type WebsiteManager } from '@/lib/callScript';
import { callScriptGate, type CallScriptGate } from '@/lib/callScriptGate';
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
   🔴 THE ANSWERS ARE KEPT (Paul, 2026-10-07): who runs the site, the agency contract and spend, the jobs, the
      areas and the decision maker are SAVED as they are given — on the lead's Quick Close record (fn
      quick-close `save` / `save_call`) — so Quick Close, the handoff and the paid client never ask again. The
      Offer follows the AGENCY-CONTRACT RULE (quickClose.offerFit): still in contract → Optimise only.
   ⛔ No send, no audit and no crawl control. Writes: those answers, and a feature-usage row
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

/* ── THE CALL'S ANSWERS, SAVED AS THEY ARE GIVEN (2026-10-07) ─────────────────────────────────────
   One hook for Ask and Offer: the lead's Quick Close record (the same query the Close tab reads), plus the
   two saves. Enumerated answers go through `save` (who runs the site, the contract, the decision maker);
   free text through `save_call` (jobs, areas, agency spend). A rep who cannot save (not ready to sell, or the
   lead has paid) keeps the answers on screen only and is told so — never a pretend "saved". */
function useCallAnswers(leadId: string) {
  const q = useQuickClose(leadId);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const v = q.data;
  const answers: QuickCloseAnswers = v?.answers ?? {};
  const canSave = !!v?.canEdit;
  const post = async (label: string, body: Record<string, unknown>) => {
    if (!canSave) return false;
    setBusy(label);
    try {
      const r = await invokeEdge('quick-close', { lead_id: leadId, ...body });
      qc.setQueryData(quickCloseKey(leadId), r);
      notifyLeadChanged(leadId);
      return true;
    } catch (e) {
      toast({ title: 'Not saved', description: edgeErrorMessage(e), variant: 'destructive' });
      return false;
    } finally { setBusy(null); }
  };
  const saveAnswer = (key: keyof QuickCloseAnswers, value: string) => post(`a:${key}`, { mode: 'save', answers: { [key]: value }, expect_route: answers.route ?? null });
  const saveCall = (patch: Record<string, string>) => post(`c:${Object.keys(patch).join(',')}`, { mode: 'save_call', call: patch });
  return { v, answers, canSave, busy, loading: q.isLoading, saveAnswer, saveCall };
}

/** A text answer that saves when the rep moves on (blur / Enter) — only when it changed. */
function SavedText({ value, onSave, placeholder, testId, label, inputMode }: { value: string; onSave: (v: string) => void; placeholder: string; testId: string; label: string; inputMode?: 'text' | 'decimal' }) {
  const [text, setText] = useState(value);
  const last = useRef(value);
  useEffect(() => { setText(value); last.current = value; }, [value]);
  const commit = () => { const t = text.trim(); if (t !== last.current.trim()) { last.current = t; onSave(t); } };
  return (
    <input value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      placeholder={placeholder} aria-label={label} inputMode={inputMode} data-testid={testId}
      className="h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60" />
  );
}

const MANAGER_OF: Record<WebsiteManager, string> = { self: 'owner', agency: 'agency' };
const CONTRACT_OPTIONS: { value: QcAgencyContract; label: string }[] = [
  { value: 'in_contract', label: 'Still in contract' },
  { value: 'free', label: 'Ended / free to move' },
  { value: 'not_sure', label: 'Not sure' },
];

/* ── ASK: the first question (always), the agency branch, then discovery ─────────────────────── */
function Ask({ p, ans }: { p: ColdCallPlaybook; ans: ReturnType<typeof useCallAnswers> }) {
  const s = p.script;
  const { answers: a, v } = ans;
  const saved: WebsiteManager | null = a.manager === 'owner' || a.manager === 'employee' ? 'self' : thirdPartyManaged(a) ? 'agency' : null;
  const [local, setLocal] = useState<WebsiteManager | null>(null);
  const manager = saved ?? local;
  const call = v?.call ?? {};
  const spend = call.agency_monthly_gbp ?? null;
  const after = manager ? afterFirstQuestion(manager, spend) : null;
  const choice = (on: boolean) => cn('h-9 flex-1 rounded-full px-3 text-sm font-semibold ring-1 ring-inset transition disabled:opacity-60 sm:flex-none',
    on ? 'bg-violet-600 text-white ring-violet-600' : 'bg-background text-foreground ring-border hover:bg-muted');
  const pickManager = (m: WebsiteManager) => { setLocal(m); void ans.saveAnswer('manager', MANAGER_OF[m]); };
  return (
    <>
      <Step title="Ask first" tone="purple" testId="call-step-first">
        <div className="space-y-2.5 rounded-2xl bg-violet-500/[0.07] p-3 ring-1 ring-inset ring-violet-500/30">
          <p className="text-base font-semibold leading-snug" data-testid="call-first-question">{s.firstQuestion.question}</p>
          {s.firstQuestion.hint && <p className="text-xs text-muted-foreground">{s.firstQuestion.hint}</p>}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Their answer">
            <button type="button" aria-pressed={manager === 'self'} disabled={!!ans.busy} className={choice(manager === 'self')} onClick={() => pickManager('self')} data-testid="answer-self">I manage it</button>
            <button type="button" aria-pressed={manager === 'agency'} disabled={!!ans.busy} className={choice(manager === 'agency')} onClick={() => pickManager('agency')} data-testid="answer-agency">Agency / someone else</button>
          </div>
          {manager === 'agency' && after && (
            <div className="space-y-2.5 border-t border-violet-500/20 pt-2.5" data-testid="call-step-agency">
              <p className="text-[15px] leading-relaxed">{after.ask[0]}</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Agency contract" data-testid="agency-contract">
                {CONTRACT_OPTIONS.map((o) => (
                  <button key={o.value} type="button" aria-pressed={a.agency_contract === o.value} disabled={!!ans.busy || !ans.canSave} className={choice(a.agency_contract === o.value)}
                    onClick={() => void ans.saveAnswer('agency_contract', o.value)} data-testid={'agency-contract-' + o.value}>{o.label}</button>
                ))}
              </div>
              <p className="text-[15px] leading-relaxed">{after.ask[1]}</p>
              <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                Roughly a month (£)
                <span className="w-28"><SavedText value={spend !== null && spend !== undefined ? String(spend) : ''} onSave={(t) => void ans.saveCall({ agency_monthly_gbp: t })} placeholder="e.g. 150" label="What they pay their agency a month" testId="agency-monthly" inputMode="decimal" /></span>
              </label>
              {after.priceAngle && (
                <p className="rounded-xl bg-blue-500/[0.08] px-3 py-2 text-sm leading-snug ring-1 ring-inset ring-blue-500/30" data-testid="call-price-angle">“{after.priceAngle}”</p>
              )}
              <p className="text-[11px] text-muted-foreground">{s.ifAgency.coaching[0]}</p>
            </div>
          )}
        </div>
      </Step>
      <Step title="Then ask" tone="purple" hint={ans.canSave ? 'saved as you go — Quick Close won’t ask again' : 'pick what fits'} testId="call-step-ask">
        <div className="space-y-3 text-[15px] leading-snug">
          <label className="block space-y-1.5"><span className="flex gap-2"><HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />{s.discovery[0]}</span>
            <SavedText value={call.jobs ?? ''} onSave={(t) => void ans.saveCall({ jobs: t })} placeholder="e.g. kitchen fitting, extensions" label={s.discovery[0]} testId="call-jobs" /></label>
          <label className="block space-y-1.5"><span className="flex gap-2"><HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />{s.discovery[1]}</span>
            <SavedText value={call.areas ?? ''} onSave={(t) => void ans.saveCall({ areas: t })} placeholder="e.g. Maidenhead, Windsor, Slough" label={s.discovery[1]} testId="call-areas" /></label>
          <div className="space-y-1.5"><p className="flex gap-2"><HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />{s.discovery[2]}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Decision maker" data-testid="call-decision-maker">
              {(['yes', 'no'] as const).map((d) => (
                <button key={d} type="button" aria-pressed={a.decision_maker === d} disabled={!!ans.busy || !ans.canSave} className={choice(a.decision_maker === d)}
                  onClick={() => void ans.saveAnswer('decision_maker', d)} data-testid={'call-dm-' + d}>{d === 'yes' ? 'Yes, they decide' : 'No — someone else'}</button>
              ))}
            </div>
          </div>
          {!ans.loading && !ans.canSave && <p className="text-[11px] text-muted-foreground" data-testid="call-answers-not-saved">These answers can’t be saved for this lead{v?.closed ? ' (it has already paid)' : ''} — note anything important when you log the call.</p>}
        </div>
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
function Offer({ p, ans }: { p: ColdCallPlaybook; ans: ReturnType<typeof useCallAnswers> }) {
  const s = p.script;
  const { role } = useSubscription();
  /* THE AGENCY-CONTRACT RULE (offerFit): the call's answers decide which plans a salesperson offers. Paul (admin)
     still sees both — a Build on those answers stops for his release in Quick Close. */
  const fit = ans.v ? offerFit(ans.answers, ans.v.has_website ?? (p.context.website ? true : false)) : null;
  const routes = s.plans.routes.filter((r) => !fit || fit.offered[r.route] || role === 'admin');
  const preferred = fit?.recommended ?? s.plans.preselected;
  const [picked, setPicked] = useState<ServiceRoute | null>(null);
  const route = picked && routes.some((r) => r.route === picked) ? picked : routes.some((r) => r.route === preferred) ? preferred : routes[0]?.route;
  const plan = routes.find((r) => r.route === route) ?? routes[0];
  if (!plan) return null;
  return (
    <Step title="Offer" tone="green" testId="call-step-close">
      {fit?.reason && <p className={cn('rounded-xl px-3 py-2 text-xs leading-snug ring-1 ring-inset', fit.offered.build ? 'bg-muted/40 text-muted-foreground ring-border' : 'bg-amber-500/[0.08] text-amber-800 ring-amber-500/30 dark:text-amber-200')} data-testid="call-offer-fit">{fit.reason}{!fit.offered.build && role === 'admin' && fit.offered.optimise ? ' (You can still choose Build — it will need your release.)' : ''}</p>}
      {fit?.warning && <p className="rounded-xl bg-amber-500/[0.08] px-3 py-2 text-xs font-semibold leading-snug text-amber-800 ring-1 ring-inset ring-amber-500/30 dark:text-amber-200" data-testid="call-offer-warning">{fit.warning}</p>}
      {routes.length > 1 ? (
        <div className="inline-flex rounded-full bg-muted p-0.5" role="tablist" aria-label="Plan" data-testid="call-plan-switch">
          {routes.map((r) => (
            <button key={r.route} type="button" role="tab" aria-selected={r.route === plan.route} data-testid={'call-plan-' + r.route}
              onClick={() => setPicked(r.route)}
              className={cn('rounded-full px-3.5 py-1 text-xs font-semibold transition', r.route === plan.route ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {r.route === 'optimise' ? 'Optimise' : 'Build'}
            </button>
          ))}
        </div>
      ) : s.plans.note && <p className="text-[11px] text-muted-foreground">{s.plans.note}</p>}
      <div className="space-y-1.5 rounded-2xl border border-border/70 border-l-[3px] border-l-blue-500 bg-card p-3 shadow-sm" data-testid={'call-route-' + plan.route}>
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold">{plan.name}<span className="text-xs font-semibold text-blue-700 dark:text-blue-300">{plan.summary}</span></p>
        <div className="space-y-1 text-sm leading-relaxed">{plan.spoken.map((x) => <p key={x}>{x}</p>)}</div>
      </div>
      <div className="flex gap-2 px-1 text-sm" data-testid="call-guarantee">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-yellow-600 dark:text-yellow-400">Money-back guarantee</p>
          <p className="leading-snug">{s.guarantee.spoken}</p>
          <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">{s.guarantee.caution}</p>
        </div>
      </div>
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

function CallFlow({ p, leadId }: { p: ColdCallPlaybook; leadId: string }) {
  const ans = useCallAnswers(leadId);
  return (
    <div className="space-y-5" data-testid="playbook-call-flow">
      <Say p={p} />
      <Ask p={p} ans={ans} />
      <WhyAndWhat p={p} />
      <Offer p={p} ans={ans} />
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
      {tab === 'call' && <CallFlow p={p} leadId={leadId} />}
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
      {/* The number as text, never a tel: link (2026-10-07: on a laptop tel: opens WhatsApp Desktop). */}
      {c.phone ? <span className="inline-flex select-all items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300"><PhoneCall className="h-3.5 w-3.5" />{c.phone}</span> : <span className="text-muted-foreground">No phone</span>}
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

/** NO VALID COMPLETED AUDIT → NO SCRIPT (Paul, 2026-10-07; the rule is src/lib/callScriptGate.ts). What the Call tab
 *  and the sheet show instead of the script: the one line, why, and the way to the check's own controls. */
function ScriptLocked({ gate, onShowCheck }: { gate: CallScriptGate; onShowCheck?: () => void }) {
  const waiting = gate.reason === 'queued' || gate.reason === 'running';
  return (
    <section className="space-y-2 rounded-2xl border border-dashed border-border bg-muted/30 p-3.5 sm:p-4" data-testid="call-script-locked" data-reason={gate.reason}>
      <h3 className="flex items-start gap-2 text-sm font-bold leading-snug">
        {waiting ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-violet-500" /> : <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
        <span>{gate.title}</span>
      </h3>
      <p className="text-xs leading-relaxed text-muted-foreground">{gate.detail}</p>
      {onShowCheck && !waiting && (
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1 rounded-full text-xs" onClick={onShowCheck} data-testid="call-script-go-to-check">
          <ArrowUp className="h-3.5 w-3.5" />Go to the AI check
        </Button>
      )}
    </section>
  );
}

/** The playbook inline — the lead popup's Call tab (Inbox and Outreach alike). The AI result sits ABOVE it
 *  (LeadDetailDialog → LeadHookPanel 'call'), so this body never repeats it. */
export function ColdCallPlaybookInline({ leadId, initialScript, onLogCall, onShowCheck }: { leadId: string; initialScript?: 'call' | 'voice'; onLogCall?: () => void; onShowCheck?: () => void }) {
  const q = useColdCallPlaybook(leadId, true);
  if (q.isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading the script…</p>;
  if (q.isError) return <p className="text-sm text-destructive">Couldn't load the script: {(q.error as { message?: string })?.message ?? 'unknown error'}</p>;
  if (!q.data) return <p className="text-sm text-muted-foreground">Lead not found.</p>;
  const gate = callScriptGate(leadId, q.data);
  /* The popup opens whatever the check's state; the SCRIPT waits for a valid completed check. Log call and Quick
     Close stay — a call can be logged with or without a script. */
  return (
    <div className="space-y-3 pb-2" data-testid="cold-call-playbook">
      {gate.show ? <>
        <Warnings p={q.data} />
        <Scripts p={q.data} leadId={leadId} initial={initialScript} />
      </> : <ScriptLocked gate={gate} onShowCheck={onShowCheck} />}
      {onLogCall && <LogCallBar onLogCall={onLogCall} leadId={leadId} />}
    </div>
  );
}

export function ColdCallPlaybookSheet({ leadId, open, onOpenChange, onLogCall }: { leadId: string | null; open: boolean; onOpenChange: (open: boolean) => void; onLogCall?: () => void }) {
  const q = useColdCallPlaybook(leadId, open);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="mb-3 space-y-0 pr-8 text-left">
          <div className="flex min-w-0 items-start gap-3">
            <IconTile icon={ScrollText} tone="blue" />
            <div className="min-w-0 flex-1">
              <SheetTitle className="break-words">{COLD_CALL_PLAYBOOK_LABEL}</SheetTitle>
              <SheetDescription className="mt-0.5 text-xs leading-snug sm:text-sm">{q.data?.context.business ?? 'Built from the evidence already stored for this lead. Nothing is re-run.'}</SheetDescription>
            </div>
          </div>
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
            {(() => {
              const gate = callScriptGate(leadId, q.data);
              return gate.show ? <><Warnings p={q.data} /><Scripts p={q.data} leadId={leadId} /></> : <ScriptLocked gate={gate} />;
            })()}
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
