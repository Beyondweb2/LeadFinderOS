import { useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, PhoneCall, ScrollText } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useColdCallPlaybook } from '@/hooks/useColdCallPlaybook';
import { playbookDate, type ColdCallPlaybook } from '@/lib/coldCallPlaybook';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   COLD CALL PLAYBOOK — the one shared UI, opened from BOTH Inbox and Outreach (2026-09-23).

   A side panel built to be read DURING a call: the opening first, the competitors and the strongest
   finding picked out, the phone and the report link one click away. Read-only — it renders what
   useColdCallPlaybook read and assembled; it has no send, no audit and no crawl control, and must
   not grow one (scripts/cold-call-playbook.test.ts).
   ⛔ Operator-only. It shows the lead's private WhatsApp history, so it lives behind the app's
   authenticated routes and reads through the operator's own session. Nothing here is ever written
   into a public report URL.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const COLD_CALL_PLAYBOOK_LABEL = 'Cold Call Playbook';

function Section({ letter, title, children, tone }: { letter: string; title: string; children: ReactNode; tone?: 'primary' }) {
  return (
    <section className={cn('rounded-lg border p-3', tone === 'primary' ? 'border-primary/40 bg-primary/5' : 'border-border/60')}>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-muted text-[11px] text-foreground">{letter}</span>
        {title}
      </h3>
      <div className="space-y-2 text-sm">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

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

function PlaybookBody({ p }: { p: ColdCallPlaybook }) {
  const c = p.context;
  const ev = p.evidence;
  return (
    <div className="space-y-3 pb-6" data-testid="cold-call-playbook">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', p.mode === 'cold' ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300')}>
          {p.mode === 'cold' ? 'NEW COLD CALL' : 'FOLLOW-UP'}
        </span>
        {c.phone && (
          <a href={'tel:' + c.phone} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-sm font-semibold hover:bg-muted">
            <PhoneCall className="h-3.5 w-3.5" /> {c.phone}
          </a>
        )}
        {p.reportUrl && <CopyButton text={p.reportUrl} label="Copy report link" />}
      </div>

      {p.warnings.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
          {p.warnings.map((w) => (
            <p key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</p>
          ))}
        </div>
      )}

      <Section letter="A" title="Call context">
        <Row label="Business">{c.business}</Row>
        <Row label="Trade">{c.trade ?? <span className="text-muted-foreground">Not stored</span>}</Row>
        <Row label="Town">{c.town ?? <span className="text-muted-foreground">Not stored</span>}</Row>
        <Row label="Phone">{c.phone ?? <span className="text-muted-foreground">None</span>}</Row>
        <Row label="Website">
          {c.website
            ? <a href={/^https?:\/\//i.test(c.website) ? c.website : 'https://' + c.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">{c.website}<ExternalLink className="h-3 w-3" /></a>
            : <span className="text-muted-foreground">None on file</span>}
        </Row>
        <Row label="AI result">{c.auditDate ?? <span className="text-muted-foreground">No audit</span>}{c.auditStale && <span className="ml-1 text-amber-600">(old)</span>}</Row>
        <Row label="Website crawl">{c.crawlDate ?? <span className="text-muted-foreground">Not crawled</span>}{c.crawlStale && <span className="ml-1 text-amber-600">(old — not used)</span>}</Row>
        <Row label="WhatsApp">{c.whatsappStatus}</Row>
        {c.leadStatus && <Row label="Lead status">{c.leadStatus}</Row>}
      </Section>

      <Section letter="B" title="Opening" tone="primary">
        {p.opening.map((line) => <p key={line} className="text-[15px] leading-relaxed">{line}</p>)}
      </Section>

      {p.followUp && (
        <Section letter="↺" title="Where you left off">
          {p.followUp.lastOutbound && (
            <div>
              <p className="text-xs text-muted-foreground">You said · {playbookDate(p.followUp.lastOutbound.at)}</p>
              <p className="rounded bg-muted/50 px-2 py-1 text-xs">{p.followUp.lastOutbound.text}</p>
            </div>
          )}
          {p.followUp.lastInbound && (
            <div>
              <p className="text-xs text-muted-foreground">Their last reply · {playbookDate(p.followUp.lastInbound.at)}</p>
              <p className="rounded bg-emerald-500/10 px-2 py-1 text-xs">{p.followUp.lastInbound.text}</p>
            </div>
          )}
          <p className="text-xs">{p.followUp.reportSentAt ? 'Report link sent ' + playbookDate(p.followUp.reportSentAt) + '.' : 'No report link has been sent on WhatsApp.'} {p.followUp.sentCount} sent · {p.followUp.receivedCount} received.</p>
          <p className="font-medium">{p.followUp.continuation}</p>
        </Section>
      )}

      <Section letter="C" title="What we actually found">
        {ev.kind === 'none' ? (
          <p className="text-muted-foreground">No AI result stored for this lead. Don't claim one on the call.</p>
        ) : (
          <>
            <Row label="Question asked">{ev.question ? '“' + ev.question + '”' : '—'}</Row>
            <Row label="Engine">{ev.engine ?? '—'}</Row>
            <Row label="They appeared?">
              <span className={cn('font-semibold', ev.named ? 'text-emerald-600' : 'text-red-600')}>{ev.named ? 'Yes — named' : 'No — not named'}</span>
            </Row>
            <Row label="Date">{c.auditDate ?? '—'}</Row>
            {ev.kind === 'gap' && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Named instead</p>
                {ev.competitors.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {ev.competitors.map((n) => <span key={n} className="rounded-md bg-red-500/10 px-2 py-0.5 text-sm font-semibold text-red-700 dark:text-red-300">{n}</span>)}
                  </div>
                ) : <p className="text-xs text-muted-foreground">{ev.competitorsNote}</p>}
              </div>
            )}
            {ev.excerpt
              ? <blockquote className="border-l-2 border-muted-foreground/40 pl-2 text-xs italic text-muted-foreground">{ev.excerpt}</blockquote>
              : ev.excerptNote && <p className="text-xs text-muted-foreground">{ev.excerptNote}</p>}
          </>
        )}
      </Section>

      <Section letter="D" title="Strongest website findings">
        {p.findings.length ? p.findings.map((f, i) => (
          <div key={f.kind} className={cn('rounded-md border p-2', i === 0 ? 'border-primary/50 bg-primary/5' : 'border-border/60')}>
            <p className="font-semibold">{i === 0 && <span className="mr-1 text-[10px] uppercase text-primary">Strongest ·</span>}{f.title}</p>
            <p className="mt-1">{f.explanation}</p>
            <p className="mt-1 text-muted-foreground">{f.whyItMayMatter}</p>
            {f.proof.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 break-all font-mono text-[11px] text-muted-foreground">
                {f.proof.map((line) => <li key={line}>{line}</li>)}
              </ul>
            )}
          </div>
        )) : <p className="text-muted-foreground">{p.findingsNote}</p>}
        {p.findings.length > 0 && c.crawlDate && <p className="text-xs text-muted-foreground">From the crawl on {c.crawlDate}. These could be contributing — they are not proof of why AI named someone else.</p>}
      </Section>

      <Section letter="E" title="How to explain it">
        {p.explain.map((line) => <p key={line}>{line}</p>)}
      </Section>

      <Section letter="F" title="Transition to Findable">
        <p>{p.transition}</p>
      </Section>

      <Section letter="G" title="Offer / next step">
        {p.offer.lines.map((line) => <p key={line}>{line}</p>)}
        <p className="font-medium text-amber-700 dark:text-amber-300">{p.offer.monthly}</p>
        <ul className="list-disc space-y-0.5 pl-5">
          {p.offer.nextSteps.map((s) => <li key={s}>{s}</li>)}
        </ul>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {p.reportUrl ? (
            <>
              <a href={p.reportUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-primary hover:underline">{p.reportUrl}<ExternalLink className="h-3 w-3 shrink-0" /></a>
              <CopyButton text={p.reportUrl} label="Copy" />
            </>
          ) : <span className="text-xs text-muted-foreground">{p.reportNote}</span>}
        </div>
      </Section>

      <Section letter="H" title="Objections">
        {p.objections.map((o) => (
          <details key={o.objection} className="group rounded-md border border-border/50 px-2 py-1">
            <summary className="cursor-pointer text-sm font-medium">“{o.objection}”</summary>
            <p className="mt-1 text-sm text-muted-foreground">{o.answer}</p>
          </details>
        ))}
      </Section>
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
        {q.data && <PlaybookBody p={q.data} />}
        <div className="sticky bottom-0 -mx-6 border-t border-border bg-background px-6 py-2">
          <Button type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The labelled button + its panel. The ONE entry point Inbox and Outreach both render. */
export function ColdCallPlaybookButton({ leadId, className, compact }: { leadId: string; className?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
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
