import { useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, PhoneCall, ScrollText } from 'lucide-react';
import { useHookVisibility } from '@/hooks/useHookVisibility';
import { VoiceNoteScriptBody } from '@/components/VoiceNoteScriptButton';
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
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const COLD_CALL_PLAYBOOK_LABEL = 'Cold Call Playbook';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 gap-1 px-2 text-xs"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
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

function Scripts({ p, leadId }: { p: ColdCallPlaybook; leadId: string }) {
  const [tab, setTab] = useState<'call' | 'voice'>('call');
  const tabClass = (on: boolean) => cn('rounded-md px-3 py-1 text-sm font-semibold transition-colors', on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted');
  return (
    <section className="rounded-lg border border-primary/40 bg-primary/5 p-3" data-testid="playbook-scripts">
      <div className="mb-2 flex items-center gap-1" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'call'} className={tabClass(tab === 'call')} onClick={() => setTab('call')}>Call script</button>
        <button type="button" role="tab" aria-selected={tab === 'voice'} className={tabClass(tab === 'voice')} onClick={() => setTab('voice')}>Voice note</button>
        {tab === 'call' && <span className="ml-auto"><CopyButton text={p.callScript.join('\n\n')} label="Copy" /></span>}
      </div>
      {tab === 'call'
        ? <div className="space-y-2.5 text-[15px] leading-relaxed" data-testid="playbook-call-script">{p.callScript.map((line) => <p key={line}>{line}</p>)}</div>
        : <VoiceNoteScriptBody leadId={leadId} currentAuditId={p.auditId} />}
    </section>
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

function PlaybookBody({ p, leadId }: { p: ColdCallPlaybook; leadId: string }) {
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

export function ColdCallPlaybookSheet({ leadId, open, onOpenChange }: { leadId: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
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
        <div className="sticky bottom-0 -mx-6 border-t border-border bg-background px-6 py-2">
          <Button type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>Close</Button>
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
