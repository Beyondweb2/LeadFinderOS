import { useEffect, useState, type ReactNode } from 'react';
import { logFeatureUse } from '@/lib/featureUsage';
import { AlertTriangle, Check, Copy, ExternalLink, Globe, Info, Loader2, PhoneCall, ScanSearch, ScrollText, ShieldCheck, Sparkles } from 'lucide-react';
import {
  AI_FRIENDLY_SITE, FOLLOW_UP_VOICE_NOTE, GOOGLE_STILL_MATTERS, HOW_WE_KNOW, HOW_WE_KNOW_CAVEAT, HOW_WE_KNOW_EXAMPLES,
  WEBSITE_MATTERS, WHAT_WE_DO, WHAT_WE_DO_SHORT, WHY_IT_MATTERS, WINNABILITY_ALSO_DEPENDS_ON, spokenSeconds,
} from '@/lib/salesExplainer';
import { useHookVisibility } from '@/hooks/useHookVisibility';
import { ProspectAuditDialog } from '@/components/ProspectAuditDialog';
import { VoiceNoteScriptBody } from '@/components/VoiceNoteScriptButton';
import { QuickCloseButton } from '@/components/QuickCloseDialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useColdCallPlaybook } from '@/hooks/useColdCallPlaybook';
import { playbookDate, usableExcerpt, OPENING_COMPETITORS, type ColdCallPlaybook } from '@/lib/coldCallPlaybook';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   COLD CALL PLAYBOOK — the one shared UI, opened from BOTH Inbox and Outreach (2026-09-23).

   A side panel built to be read DURING a call (simplified 2026-09-27): who they are, what AI found,
   what to talk about, then ONE call script beside the voice-note script; the questions, the full audit
   evidence and the report link are one click away. Read-only — it renders what
   useColdCallPlaybook read and assembled; it has no send, no audit and no crawl control, and must
   not grow one (scripts/cold-call-playbook.test.ts).
   ⛔ Operator-only. It shows the lead's private WhatsApp history, so it lives behind the app's
   authenticated routes and reads through the operator's own session. Nothing here is ever written
   into a public report URL.
   ⚠️ QUICK CLOSE ON THE CALL SCREEN (fix workstream 5, 2026-10-04): the close block and the sticky bar carry the
   SAME Quick Close button as the workspace header (QuickCloseDialog) — it only opens that dialog; the payment
   link is made there, by its own rules. The panel itself still sends nothing and starts no audit or crawl.
   ⚠️ THE ONE WRITE (Admin control centre, release 5, 2026-09-30): a feature-usage row via
   src/lib/featureUsage.ts — the call script shown for a lead, a LinkedIn / email script copied — at
   most one per person/feature/lead/day. It spends nothing and changes no lead; it is how the admin
   dashboard knows whether these scripts are used at all.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const COLD_CALL_PLAYBOOK_LABEL = 'Cold Call Playbook';

function CopyButton({ text, label, onCopied }: { text: string; label: string; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 gap-1 px-2 text-xs"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          onCopied?.();
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

/* ── THE PLAYBOOK, SIMPLIFIED (Paul, 2026-09-27) ────────────────────────────────────────────────
   Built to be glanced at mid-call. IMPORTANT NOW is visible: who they are, what AI found, what to
   talk about, the script. USEFUL IF ASKED is one click away: the questions. DETAILED PROOF is
   secondary: every audit result, and the report link. The old A–H journey (Opening / How to explain
   it / Transition / Offer) is ONE call script now; its pieces are still assembled in coldCallPlaybook.ts. */

const EYEBROW = 'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground';

function Block({ title, children, tone }: { title: string; children: ReactNode; tone?: 'primary' }) {
  return (
    <section className={cn('space-y-1.5', tone === 'primary' && 'rounded-lg border border-primary/40 bg-primary/5 p-3')}>
      <h3 className={EYEBROW}>{title}</h3>
      {children}
    </section>
  );
}

const SITE_LABEL: Record<string, string> = { own_site: 'Own site', directory_profile: 'Profile page', social_profile: 'Social profile', none: 'None on file' };

function Prospect({ p }: { p: ColdCallPlaybook }) {
  const c = p.context;
  const last = p.followUp?.lastInbound ?? p.followUp?.lastOutbound ?? null;
  const lastWho = p.followUp?.lastInbound && last === p.followUp.lastInbound ? 'They said' : 'You said';
  return (
    <div className="space-y-1 text-sm" data-testid="playbook-prospect">
      {/* The business name is the sheet's own header line; only trade and town here, no repeat. */}
      {(c.trade || c.town) && <p className="text-muted-foreground">{[c.trade, c.town].filter(Boolean).join(', ')}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {c.phone
          ? <a href={'tel:' + c.phone} className="inline-flex items-center gap-1 font-semibold hover:underline"><PhoneCall className="h-3.5 w-3.5" />{c.phone}</a>
          : <span className="text-muted-foreground">No phone</span>}
        <span className="min-w-0 break-all">
          <span className="text-muted-foreground">{p.site.source === 'own_site' ? 'Website' : SITE_LABEL[p.site.source]}{p.site.label ? ` (${p.site.label})` : ''}: </span>
          {c.website
            ? <a href={/^https?:\/\//i.test(c.website) ? c.website : 'https://' + c.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">{c.website.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')}</a>
            : 'none'}
        </span>
      </div>
      <p className="text-xs"><span className="text-muted-foreground">WhatsApp: </span>{c.whatsappStatus}</p>
      {last && <p className="line-clamp-2 text-xs"><span className="text-muted-foreground">{lastWho} ({playbookDate(last.at)}): </span>“{last.text}”</p>}
    </div>
  );
}

function AiOpportunity({ p }: { p: ColdCallPlaybook }) {
  const ev = p.evidence;
  if (ev.kind === 'none') return <p className="text-sm text-muted-foreground">No AI result stored for this lead. Don't claim one on the call.</p>;
  const names = ev.competitors.slice(0, OPENING_COMPETITORS);
  return (
    <div className="space-y-1.5" data-testid="playbook-ai-opportunity">
      <p className="text-base font-semibold">
        {ev.named
          ? <span className="text-emerald-600 dark:text-emerald-400">{ev.engine ?? 'AI'} named {p.context.business}</span>
          : <span className="text-amber-600 dark:text-amber-400">{ev.engine ?? 'AI'} didn't name {p.context.business}</span>}
      </p>
      {ev.question && <p className="text-sm"><span className="text-muted-foreground">Search: </span>“{ev.question}”</p>}
      {ev.kind === 'gap' && (names.length
        ? <div className="flex flex-wrap items-center gap-1.5 text-sm"><span className="text-muted-foreground">Named instead:</span>{names.map((n) => <span key={n} className="rounded-md bg-muted px-2 py-0.5 font-semibold">{n}</span>)}</div>
        : <p className="text-xs text-muted-foreground">{ev.competitorsNote}</p>)}
      {p.context.auditDate && <p className="text-[11px] text-muted-foreground">Checked {p.context.auditDate}{p.context.auditStale ? ' (old, say "when I checked")' : ''}</p>}
    </div>
  );
}

function TalkAbout({ p }: { p: ColdCallPlaybook }) {
  if (!p.findings.length) {
    const note = p.site.source === 'own_site' && /no strong website issues/i.test(p.findingsNote ?? '')
      ? 'No strong owned-site technical issue found from the available evidence.'
      : p.findingsNote;
    return <p className="text-sm text-muted-foreground" data-testid="playbook-no-findings">{note}</p>;
  }
  return (
    <ul className="space-y-1.5 text-sm" data-testid="playbook-findings">
      {p.findings.map((f) => (
        <li key={f.kind}>
          <p className="font-medium">{f.title}</p>
          <p className="text-muted-foreground">{f.explanation}</p>
          {f.proof.length > 0 && (
            <details className="text-[11px] text-muted-foreground">
              <summary className="cursor-pointer select-none">Proof</summary>
              <ul className="mt-0.5 space-y-0.5 break-all font-mono">{f.proof.map((line) => <li key={line}>{line}</li>)}</ul>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

type ScriptTab = 'call' | 'voice' | 'linkedin' | 'email';

function Scripts({ p, leadId, initial = 'call' }: { p: ColdCallPlaybook; leadId: string; initial?: 'call' | 'voice' }) {
  const [tab, setTab] = useState<ScriptTab>(initial);
  // The call script counts as used when it is on screen for this lead (the database keeps one a day).
  useEffect(() => { if (tab === 'call') logFeatureUse('call_script', leadId); }, [tab, leadId]);
  const tabClass = (on: boolean) => cn('rounded-md px-3 py-1 text-sm font-semibold transition-colors', on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted');
  const tabs: Array<[ScriptTab, string]> = [['call', 'Call script'], ['voice', 'Voice note'], ['linkedin', 'LinkedIn'], ['email', 'Email']];
  /* LinkedIn and Email are the SAME facts as the call script (coldCallPlaybook.ts `messages`), for copying
     into those apps by hand. Nothing here sends. */
  return (
    <section className="rounded-lg border border-primary/40 bg-primary/5 p-3" data-testid="playbook-scripts">
      <div className="mb-2 flex flex-wrap items-center gap-1" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tabClass(tab === key)} onClick={() => setTab(key)}>{label}</button>
        ))}
        {tab === 'call' && <span className="ml-auto"><CopyButton text={callFlowText(p)} label="Copy" /></span>}
        {tab === 'linkedin' && <span className="ml-auto"><CopyButton text={p.messages.linkedin} label="Copy" onCopied={() => logFeatureUse('linkedin_script', leadId)} /></span>}
        {tab === 'email' && <span className="ml-auto flex gap-1"><CopyButton text={p.messages.email.subject} label="Copy subject" /><CopyButton text={p.messages.email.body} label="Copy email" onCopied={() => logFeatureUse('email_script', leadId)} /></span>}
      </div>
      {tab === 'call' && <CallFlow p={p} leadId={leadId} />}
      {tab === 'voice' && <div className="space-y-3"><VoiceNoteScriptBody leadId={leadId} currentAuditId={p.auditId} /><VoiceCoaching /></div>}
      {tab === 'linkedin' && <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed" data-testid="playbook-linkedin">{p.messages.linkedin}</p>}
      {tab === 'email' && (
        <div className="space-y-2" data-testid="playbook-email">
          <p className="text-sm"><span className="text-muted-foreground">Subject: </span><span className="font-medium">{p.messages.email.subject}</span></p>
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{p.messages.email.body}</p>
        </div>
      )}
    </section>
  );
}

/* ── THE CALL, IN ORDER (fix workstream 5, 2026-10-04) ───────────────────────────────────────────────
   1 Open (who is calling, then why — the opening read), 2 Ask (the questions worth asking), 3 If they're
   interested (the route that fits: price, payments, what they get; the guarantee; "I'll send you the link
   now" beside Quick Close), 4 After they pay. The gatekeeper and voicemail lines fold underneath. Short
   blocks, not a monologue: the rep glances, says it in their own words, moves on. */
const STEP = 'flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';
const stepNo = (n: number) => <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">{n}</span>;

export function callFlowText(p: ColdCallPlaybook): string {
  const c = p.close;
  return [
    ...p.callScript,
    'First question:\n- ' + (p.qualify[0] ?? ''),
    'What we do:\n' + WHAT_WE_DO_SHORT,
    'Discuss:\n' + p.qualify.slice(1).map((q) => '- ' + q).join('\n'),
    'If they\'re interested:\n' + c.routes.map((r) => r.name + ' (' + r.summary + '): ' + r.spoken.join(' ')).join('\n') + '\n' + c.guarantee.headline + ' ' + c.guarantee.spoken + '\n' + c.closeLine,
    'After they pay:\n' + c.afterPayment.map((l) => '- ' + l).join('\n'),
  ].join('\n\n');
}

function CallFlow({ p, leadId }: { p: ColdCallPlaybook; leadId: string }) {
  const c = p.close;
  return (
    <div className="space-y-4" data-testid="playbook-call-flow">
      <section className="space-y-2" data-testid="call-step-open">
        <h4 className={STEP}>{stepNo(1)}Open: who you are, why you're ringing</h4>
        <div className="space-y-2.5 text-[15px] leading-relaxed" data-testid="playbook-call-script">{p.callScript.map((line) => <p key={line}>{line}</p>)}</div>
        <p className="rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground" data-testid="call-fallback">{p.fallback}</p>
      </section>
      {p.qualify[0] && <section className="space-y-1.5" data-testid="call-step-first">
        <h4 className={STEP}>{stepNo(2)}First question</h4>
        <p className="text-[15px] font-medium leading-relaxed">{p.qualify[0]}</p>
      </section>}
      <section className="space-y-1.5" data-testid="call-step-explain">
        <h4 className={STEP}>{stepNo(3)}What we do, in a sentence</h4>
        <p className="text-[15px] leading-relaxed">{WHAT_WE_DO_SHORT}</p>
        <p className="text-[11px] text-muted-foreground">The longer version is in “What Findable actually does” below.</p>
      </section>
      <section className="space-y-1.5" data-testid="call-step-ask">
        <h4 className={STEP}>{stepNo(4)}Discuss</h4>
        <ul className="list-disc space-y-1 pl-5 text-sm">{p.qualify.slice(1).map((q) => <li key={q}>{q}</li>)}</ul>
      </section>
      <section className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3" data-testid="call-step-close">
        <h4 className={STEP}>{stepNo(5)}Offer and close</h4>
        {c.routeNote && <p className="text-xs text-muted-foreground">{c.routeNote}</p>}
        <div className={cn('grid gap-2', c.routes.length > 1 && 'sm:grid-cols-2')}>
          {c.routes.map((r, i) => (
            <div key={r.route} className={cn('rounded-md border bg-background/60 p-2.5', i === 0 ? 'border-emerald-500/50' : 'border-border/60')} data-testid={'call-route-' + r.route}>
              <p className="text-sm font-semibold">{r.name}{c.routes.length > 1 && i === 0 && <span className="ml-1.5 text-[10px] font-medium uppercase text-emerald-700 dark:text-emerald-300">keeps their site</span>}</p>
              <p className="text-xs font-medium">{r.summary}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{r.site}</p>
              <div className="mt-1.5 space-y-1 text-sm leading-relaxed">{r.spoken.map((s) => <p key={s}>{s}</p>)}</div>
            </div>
          ))}
        </div>
        <div className="rounded-md bg-background/60 p-2.5 text-sm" data-testid="call-guarantee">
          <p className="flex items-center gap-1.5 font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-600" />{c.guarantee.headline}</p>
          <p className="mt-1 leading-relaxed">{c.guarantee.spoken}</p>
          <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">{c.guarantee.caution}</p>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{c.monthly}</p>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-emerald-500/30 pt-2">
          <p className="min-w-0 flex-1 text-[15px] font-medium">“{c.closeLine}”</p>
          <QuickCloseButton leadId={leadId} />
        </div>
      </section>
      <section className="space-y-1.5" data-testid="call-step-after">
        <h4 className={STEP}>{stepNo(6)}After they pay</h4>
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">{c.afterPayment.map((l) => <li key={l}>{l}</li>)}</ul>
      </section>
      <details className="rounded-md border border-border/60 px-2.5 py-1.5 text-sm" data-testid="call-not-the-owner">
        <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-muted-foreground">Not the owner, or voicemail</summary>
        <p className="mt-1.5"><span className="text-muted-foreground">Someone else answers: </span>“{p.gatekeeper}”</p>
        <p className="mt-1"><span className="text-muted-foreground">Voicemail (under 20 seconds): </span>“{p.voicemail}”</p>
      </details>
    </div>
  );
}

/** Business, phone, website and the AI check in one strip — the first thing a rep sees on a laptop or a phone.
 *  "No audit yet" is said plainly, with the way to run one; nothing is invented when there is no result. */
/** compact (the Call tab's evidence card): the AI line and the website line are said by the sections below it,
 *  so the strip keeps only how to reach them — and, with no result yet, the way to run one. */
function CallCard({ p, onRunCheck, compact = false }: { p: ColdCallPlaybook; onRunCheck?: () => void; compact?: boolean }) {
  const c = p.context;
  const tone = p.audit.state === 'ready' ? (p.evidence.named ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300') : 'text-muted-foreground';
  return (
    <section className="space-y-1.5 rounded-lg border border-border/60 bg-card/60 p-3" data-testid="call-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {c.phone
          ? <a href={'tel:' + c.phone} className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline dark:text-emerald-300" data-testid="call-card-phone"><PhoneCall className="h-4 w-4" />{c.phone}</a>
          : <span className="text-muted-foreground">No phone on file</span>}
        <span className="inline-flex min-w-0 max-w-full items-center gap-1 text-xs" data-testid="call-card-website">
          <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {c.website
            ? <a href={/^https?:\/\//i.test(c.website) ? c.website : 'https://' + c.website} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">{c.website.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')}</a>
            : <span className="text-muted-foreground">No website</span>}
          {p.site.source !== 'own_site' && p.site.label && <span className="text-muted-foreground">({p.site.label} profile)</span>}
        </span>
        {(c.trade || c.town) && <span className="text-xs text-muted-foreground">{[c.trade, c.town].filter(Boolean).join(', ')}</span>}
      </div>
      {!(compact && p.audit.state !== 'none') && <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cn('flex min-w-0 items-center gap-1.5 text-sm font-semibold', tone)} data-testid="call-card-audit">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="min-w-0">{p.audit.headline}{p.audit.finding && <span className="block text-xs font-normal text-muted-foreground">Website: {p.audit.finding}</span>}</span>
        </p>
        {p.audit.state === 'none' && onRunCheck && (
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={onRunCheck} data-testid="call-card-run-check">Run the AI check (about a minute)</Button>
        )}
      </div>}
      {p.audit.state === 'none' && <p className="text-[11px] text-muted-foreground">No problem if you ring first — the script below does not claim a result.</p>}
    </section>
  );
}

/* ══ SALES WORKSPACE V2 (Paul, 2026-10-05): THE CALL TAB — everything needed while talking, in one scroll:
   A evidence → B script → C why it matters → D what Findable does → E how we build for AI → F questions.
   ⛔ The evidence is only what is STORED (the hook audit and the crawl); the explainer words are
   src/lib/salesExplainer.ts, the one source the voice-note coaching reads too. */
function AiCheckCount({ leadId }: { leadId: string }) {
  const q = useHookVisibility(leadId);
  const score = q.data?.card?.score;
  if (!score || score.expected === 0) return null;
  const named = score.results.filter((r) => r.status === 'named').length;
  return <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold" data-testid="ai-check-count">{named} / {score.expected} answers named this business</span>;
}

function CallEvidence({ p, leadId, onRunCheck }: { p: ColdCallPlaybook; leadId: string; onRunCheck?: () => void }) {
  /* The detailed evidence lives in ONE large window (ProspectAuditDialog, 2026-10-05) — the Call tab keeps
     the short version and opens the rest on request, so the call screen never becomes a technical audit. */
  const [fullOpen, setFullOpen] = useState(false);
  return (
    <section className="space-y-3 rounded-lg border border-border/60 bg-card/60 p-3" data-testid="call-evidence">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={EYEBROW}>What we found</h3>
        <button type="button" onClick={() => setFullOpen(true)} data-testid="open-full-audit"
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-medium hover:bg-muted">
          <ScanSearch className="h-3.5 w-3.5" /> Full audit &amp; website evidence
        </button>
      </div>
      <ProspectAuditDialog leadId={leadId} open={fullOpen} onOpenChange={setFullOpen} />
      <CallCard p={p} onRunCheck={onRunCheck} compact />
      {p.audit.state !== 'none' && (
        <div className="space-y-1.5" data-testid="call-evidence-ai">
          <div className="flex flex-wrap items-center gap-2"><span className={EYEBROW}>AI check</span><AiCheckCount leadId={leadId} /></div>
          <AiOpportunity p={p} />
          <details className="rounded-md border border-border/60 px-2.5 py-1.5" data-testid="playbook-evidence-toggle">
            <summary className="cursor-pointer select-none text-xs font-semibold text-muted-foreground">The questions and what AI said</summary>
            <div className="mt-2"><AuditEvidence leadId={leadId} /></div>
          </details>
        </div>
      )}
      <div className="space-y-1.5" data-testid="call-evidence-website">
        <span className={EYEBROW}>Website</span>
        <TalkAbout p={p} />
      </div>
      <ReportLinks p={p} />
    </section>
  );
}

function SourceNote({ source, url }: { source: string; url: string }) {
  return <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:underline" title={source} data-testid="source-note"><Info className="h-3 w-3" />{source}</a>;
}

function WhyItMatters() {
  return (
    <Block title="Why this matters">
      <ul className="space-y-1.5 text-sm" data-testid="why-it-matters">
        {WHY_IT_MATTERS.map((pt) => <li key={pt.text}>{pt.text}<br /><SourceNote source={pt.source} url={pt.url} /></li>)}
        <li className="text-muted-foreground">{GOOGLE_STILL_MATTERS}</li>
      </ul>
    </Block>
  );
}

function WhatWeDo() {
  return (
    <Block title="What Findable actually does">
      <ul className="list-disc space-y-1 pl-5 text-sm" data-testid="what-we-do">{WHAT_WE_DO.map((l) => <li key={l}>{l}</li>)}</ul>
      <details className="rounded-md border border-border/60 px-2.5 py-1.5 text-sm" data-testid="how-we-know">
        <summary className="cursor-pointer select-none text-xs font-semibold text-muted-foreground">If they ask “how do you know what's winnable?”</summary>
        <div className="mt-1.5 space-y-1.5">
          {HOW_WE_KNOW.map((l) => <p key={l}>{l}</p>)}
          <ul className="space-y-0.5">{HOW_WE_KNOW_EXAMPLES.map((e) => <li key={e.text}><span className="font-semibold">{e.label}:</span> {e.text}</li>)}</ul>
          <p className="text-muted-foreground">It also depends on {WINNABILITY_ALSO_DEPENDS_ON.join(', ')}.</p>
          <p className="text-[11px] text-amber-700 dark:text-amber-300">{HOW_WE_KNOW_CAVEAT}</p>
        </div>
      </details>
    </Block>
  );
}

function HowWeBuild() {
  return (
    <details className="rounded-md border border-border/60 px-2.5 py-1.5 text-sm" data-testid="ai-friendly-site">
      <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-muted-foreground">How we build for AI visibility</summary>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5">{AI_FRIENDLY_SITE.map((l) => <li key={l}>{l}</li>)}</ul>
      <p className="mt-1.5 text-muted-foreground" data-testid="website-matters">{WEBSITE_MATTERS}</p>
    </details>
  );
}

/** Beside the voice note: what we do, how it works, and the optional 20–30 second "how does it work?" follow-up. */
function VoiceCoaching() {
  const secs = spokenSeconds(FOLLOW_UP_VOICE_NOTE);
  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-background/60 p-2.5 text-sm" data-testid="voice-coaching">
      <p className={EYEBROW}>Keep the first voice note short. If they ask more:</p>
      <p><span className="font-semibold">What we do: </span>{WHAT_WE_DO_SHORT}</p>
      <details><summary className="cursor-pointer select-none text-xs font-semibold text-muted-foreground">How it works</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">{WHAT_WE_DO.map((l) => <li key={l}>{l}</li>)}</ul></details>
      <div className="space-y-1" data-testid="voice-follow-up">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold">Follow-up voice note: “How does it actually work?” (about {secs} seconds)</span><CopyButton text={FOLLOW_UP_VOICE_NOTE} label="Copy" /></div>
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{FOLLOW_UP_VOICE_NOTE}</p>
        <p className="text-[11px] text-muted-foreground">Put your own name in place of {'{rep}'}.</p>
      </div>
    </div>
  );
}

function Questions({ p }: { p: ColdCallPlaybook }) {
  return (
    <div className="divide-y divide-border/60 rounded-md border border-border/60" data-testid="playbook-questions">
      {p.objections.map((o) => (
        <details key={o.objection} className="px-2.5 py-1.5">
          <summary className="cursor-pointer select-none text-sm font-medium">“{o.objection}”</summary>
          <p className="mt-1 text-sm text-muted-foreground">{o.answer}</p>
        </details>
      ))}
    </div>
  );
}

const statusWord = (s: string) => (s === 'named' ? 'Named' : s === 'not_named' ? 'Not named' : s === 'failed' ? 'Failed' : 'Waiting');
const statusTone = (s: string) => (s === 'named' ? 'text-emerald-600 dark:text-emerald-400' : s === 'not_named' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground');

/** Every result of the lead's hook audit, question by question: the SAME scored rows the Inbox card
 *  reads (useHookVisibility → scoreHookAuditForCard), so the two cannot disagree. Each cell keeps its
 *  own competitors and answer; nothing is merged across questions or engines. */
function AuditEvidence({ leadId }: { leadId: string }) {
  const q = useHookVisibility(leadId);
  const card = q.data?.card ?? null;
  if (q.isLoading) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (!card || card.score.expected === 0) return <p className="text-xs text-muted-foreground">No hook-audit results stored for this lead.</p>;
  const { score, rivalsWithheld } = card;
  const questions = [...new Set(score.results.map((r) => r.questionIndex))].sort((a, b) => a - b);
  return (
    <div className="space-y-2 text-xs" data-testid="playbook-audit-evidence">
      {score.shape !== 'six' && (
        <p className="rounded bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-400">
          {score.shape === 'adaptive_legacy' ? 'Older early-stop check: it stopped early, so fewer questions were asked. ' : 'Older audit format. '}
          Scored out of its own {score.expected} results.
        </p>
      )}
      {questions.map((qi) => {
        const cells = score.results.filter((r) => r.questionIndex === qi);
        return (
          <details key={qi} className="rounded-md border border-border/60 px-2 py-1.5">
            <summary className="cursor-pointer select-none">
              <span className="font-medium">{cells[0]?.question}</span>
              <span className="mt-0.5 flex flex-wrap gap-x-3">
                {cells.map((r) => <span key={r.engine}><span className="text-muted-foreground">{r.label}: </span><span className={statusTone(r.status)}>{statusWord(r.status)}</span></span>)}
              </span>
            </summary>
            <div className="mt-1.5 space-y-1.5">
              {cells.map((r) => (
                <div key={r.engine}>
                  <p className="font-medium">{r.label}</p>
                  {r.status === 'not_named' && (rivalsWithheld
                    ? <p className="italic text-muted-foreground">Competitor names withheld (this run's list failed cleaning).</p>
                    : r.competitors.length ? <p><span className="text-muted-foreground">Named: </span>{r.competitors.slice(0, 5).join(', ')}</p> : <p className="text-muted-foreground">No competitor names for this answer.</p>)}
                  {usableExcerpt(r.answerExcerpt) ? <p className="line-clamp-4 text-muted-foreground">{usableExcerpt(r.answerExcerpt)}</p> : r.answerExcerpt ? <p className="italic text-muted-foreground">Answer was a map card or markup, not quotable. The report has it in full.</p> : null}
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function ReportLinks({ p }: { p: ColdCallPlaybook }) {
  if (!p.reportUrl) return <p className="text-xs text-muted-foreground">{p.reportNote}</p>;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="playbook-report">
      <a href={p.reportUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-medium hover:bg-muted"><ExternalLink className="h-3 w-3" />Open report</a>
      <CopyButton text={p.reportUrl} label="Copy report link" />
    </div>
  );
}

function PlaybookBody({ p, leadId, scriptsFirst, initialScript, onRunCheck }: { p: ColdCallPlaybook; leadId: string; scriptsFirst?: boolean; initialScript?: 'call' | 'voice'; onRunCheck?: () => void }) {
  /* Inside the prospect workspace the script is what is read mid-call, so it comes first and the
     prospect summary (already on the workspace's own tabs) is left out. Same pieces, same data. */
  if (scriptsFirst) {
    return (
      <div className="space-y-4 pb-2" data-testid="cold-call-playbook">
        {p.warnings.length > 0 && (
          <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
            {p.warnings.map((w) => <p key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</p>)}
          </div>
        )}
        <CallEvidence p={p} leadId={leadId} onRunCheck={onRunCheck} />
        <Scripts p={p} leadId={leadId} initial={initialScript} />
        <WhyItMatters />
        <WhatWeDo />
        <HowWeBuild />
        <Block title="Questions they may ask"><Questions p={p} /></Block>
      </div>
    );
  }
  return (
    <div className="space-y-4 pb-6" data-testid="cold-call-playbook">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', p.mode === 'cold' ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300')}>
          {p.mode === 'cold' ? 'NEW COLD CALL' : 'FOLLOW-UP'}
        </span>
      </div>
      {p.warnings.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
          {p.warnings.map((w) => <p key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</p>)}
        </div>
      )}
      <Prospect p={p} />
      <Block title="AI opportunity" tone="primary"><AiOpportunity p={p} /></Block>
      <Block title="What I'd talk about"><TalkAbout p={p} /></Block>
      <Scripts p={p} leadId={leadId} />
      <Block title="Questions they may ask"><Questions p={p} /></Block>
      <details className="rounded-md border border-border/60 px-2.5 py-1.5" data-testid="playbook-evidence-toggle">
        <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-muted-foreground">Audit evidence</summary>
        <div className="mt-2"><AuditEvidence leadId={leadId} /></div>
      </details>
      <ReportLinks p={p} />
    </div>
  );
}

/** The playbook inline — the prospect workspace's Scripts tab (Inbox and Outreach alike). Same data,
 *  same builder, same call/voice-note switch as the sheet; the script comes first. */
/** The call's outcome, Next Action and notes are logged on the Work tab (LeadWorkPanel — the ONE outcome rule).
 *  `onLogCall` takes the person there with Log a contact open, so the script and the record are one click apart. */
function LogCallBar({ onLogCall, leadId }: { onLogCall: () => void; leadId: string }) {
  return <div className="sticky bottom-0 mt-3 flex items-center gap-2 border-t border-border bg-background py-2">
    <Button type="button" className="min-w-0 flex-1" onClick={onLogCall} data-testid="log-this-call"><PhoneCall className="mr-1.5 h-4 w-4 shrink-0" /><span className="truncate">Log this call<span className="hidden sm:inline">: outcome and Next Action</span></span></Button>
    <QuickCloseButton leadId={leadId} className="h-10 px-3 text-sm" />
  </div>;
}

/** onRunCheck: the workspace's Work tab, where the one-lead AI check is proposed and run (LeadHookPanel). */
export function ColdCallPlaybookInline({ leadId, initialScript, onLogCall, onRunCheck }: { leadId: string; initialScript?: 'call' | 'voice'; onLogCall?: () => void; onRunCheck?: () => void }) {
  const q = useColdCallPlaybook(leadId, true);
  if (q.isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading the script…</p>;
  if (q.isError) return <p className="text-sm text-destructive">Couldn't load the script: {(q.error as { message?: string })?.message ?? 'unknown error'}</p>;
  if (!q.data) return <p className="text-sm text-muted-foreground">Lead not found.</p>;
  return <><PlaybookBody p={q.data} leadId={leadId} scriptsFirst initialScript={initialScript} onRunCheck={onRunCheck} />{onLogCall && <LogCallBar onLogCall={onLogCall} leadId={leadId} />}</>;
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
        {q.data && leadId && <PlaybookBody p={q.data} leadId={leadId} />}
        <div className="sticky bottom-0 -mx-6 flex gap-2 border-t border-border bg-background px-6 py-2">
          {onLogCall && leadId && <Button type="button" className="flex-1" onClick={onLogCall} data-testid="log-this-call"><PhoneCall className="mr-1.5 h-4 w-4" />Log this call</Button>}
          <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The labelled button + its panel. The ONE entry point Inbox and Outreach both render. */
export function ColdCallPlaybookButton({ leadId, className, compact, iconOnly }: { leadId: string; className?: string; compact?: boolean; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  /* Icon-only sits in the Inbox header row and the Outreach row's contact icons (Paul, 2026-09-23):
     the caller passes that row's own button class so it matches its siblings; the label is carried
     by title/aria-label exactly as every sibling's is. */
  if (iconOnly) {
    return (
      <>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          title={COLD_CALL_PLAYBOOK_LABEL}
          aria-label={COLD_CALL_PLAYBOOK_LABEL}
          className={className}
        >
          <ScrollText className="h-4 w-4" />
        </button>
        {open && <ColdCallPlaybookSheet leadId={leadId} open={open} onOpenChange={setOpen} />}
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title={COLD_CALL_PLAYBOOK_LABEL}
        aria-label={COLD_CALL_PLAYBOOK_LABEL}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 font-semibold text-sky-700 transition-colors hover:bg-sky-500/20 dark:text-sky-300',
          compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs',
          className,
        )}
      >
        <PhoneCall className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        {COLD_CALL_PLAYBOOK_LABEL}
      </button>
      {open && <ColdCallPlaybookSheet leadId={leadId} open={open} onOpenChange={setOpen} />}
    </>
  );
}
