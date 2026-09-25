/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WARM REPLY ASSISTANT — the Inbox's "Research & draft reply" row (2026-09-25).

   ⛔ IT NEVER SENDS. It asks warm-lead-reply for TEXT and hands it to `onDraft`, which puts it in
      the composer. Paul edits it and presses the composer's own Send. This component has no send
      path, no template picker and no call to send-whatsapp-message (scripts/warm-lead-reply.test.ts
      fails the build if one appears).

   Button states:
     · no saved research, or stale    → "Research & draft reply" (reads the site if needed, then drafts)
     · fresh saved research           → "Draft reply" + "Refresh research"
     · after a draft                  → "Regenerate" (same research, no site fetch) + "Refresh research"
   Progress reads "Researching site…" → "Analysing…" → "Draft ready".

   Mounted per conversation (keyed by it in the Inbox), so a draft or its "why" can never follow Paul
   into someone else's thread.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, ChevronDown, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { SALES_FACT_LABELS, SALES_FACT_KEYS, type SalesFacts } from '@/lib/warmReply';
import { cn } from '@/lib/utils';

type Freshness = 'none' | 'fresh' | 'stale' | 'website_changed' | 'failed';
type Phase = 'idle' | 'researching' | 'analysing' | 'ready' | 'error';

interface ResearchSummary {
  generatedAt: string;
  status: string;
  technicallyClean: boolean;
  strongestFindings: Array<{ id: string; title: string; source: string; strength: number }>;
  warnings: string[];
  sourcesRead: number;
  timings?: { researchMs: number };
}

interface StatusResponse { ok: true; freshness: Freshness; has_website: boolean; research: ResearchSummary | null; sales_facts: SalesFacts }
interface ResearchResponse { ok: true; plan: string; research: ResearchSummary | null; ms: number }
interface DraftWhy {
  questionType: string;
  questionSummary: string | null;
  detectedByRules: string[];
  findingsUsed: Array<{ id: string; title: string; source: string }>;
  research: { generatedAt: string; status: string; sourceCrawlAt: string | null; technicallyClean: boolean; warnings: string[] } | null;
  audit: { createdAt: string | null; named: number | null; total: number | null; namedEverywhere: boolean } | null;
  askedOwnership: boolean;
  ownershipAlreadyKnown: boolean;
  reportUrlAllowed: boolean;
  salesFacts: SalesFacts;
  factsRejected: string[];
  problems: string[];
  warnings: string[];
  operatorNote: string | null;
  usedFallback: boolean;
  timings: { generationMs: number; totalMs: number; researchMs: number | null };
}
interface DraftResponse { ok: true; reply: string; why: DraftWhy }

const QUESTION_LABELS: Record<string, string> = {
  price: 'Asked the price', how_it_works: 'Asked how it works', existing_provider: 'Already has a provider',
  show_changes: 'Asked what we’d change', tell_me_more: 'Wants more info', call_request: 'Asked for a call',
  ownership_answer: 'Answered about the site', not_interested: 'Not interested', other: 'General reply',
};

const day = (iso: string | null | undefined) => {
  if (!iso) return 'unknown date';
  try { return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
};
const secs = (ms: number | null | undefined) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)}s`);

export interface WarmReplyAssistantProps {
  leadId: string;
  phone: string;
  /** The Meta 24h window, from the conversation's newest inbound message. */
  windowOpen: boolean;
  /** Readable text for our own outbound template messages, by message id (context for the model). */
  getReadable: () => Record<string, string>;
  /** What is in the reply box now. A draft never silently replaces Paul's own typing. */
  getComposerText: () => string;
  /** Put the draft into the composer. The ONLY thing this component does with a draft. */
  onDraft: (text: string) => void;
}

export function WarmReplyAssistant({ leadId, phone, windowOpen, getReadable, getComposerText, onDraft }: WarmReplyAssistantProps) {
  const [freshness, setFreshness] = useState<Freshness | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [why, setWhy] = useState<DraftWhy | null>(null);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [variant, setVariant] = useState(0);
  const [whyOpen, setWhyOpen] = useState(false);

  /* The saved-research state decides the label. A read of our own table — no fetch, no model. */
  useEffect(() => {
    if (!windowOpen) return;
    let live = true;
    invokeEdge<StatusResponse>('warm-lead-reply', { action: 'status', lead_id: leadId })
      .then((s) => { if (live) setFreshness(s.freshness); })
      .catch(() => { if (live) setFreshness('none'); });
    return () => { live = false; };
  }, [leadId, windowOpen]);

  if (!windowOpen) {
    return (
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
        Research &amp; draft reply needs the 24h window — only an approved Meta template can be sent now.
      </p>
    );
  }

  const busy = phase === 'researching' || phase === 'analysing';

  const run = async (mode: 'draft' | 'refresh' | 'regenerate') => {
    if (busy) return;
    /* Ask only when the box holds something Paul wrote — our own untouched draft is replaced freely. */
    const current = getComposerText().trim();
    if (current && current !== (lastReply ?? '').trim() && !window.confirm('Replace what is in the reply box with a new draft?')) return;
    setError(null);
    try {
      /* Regenerate NEVER asks for research — it reuses the saved record. Refresh always does. A first
         draft asks only when nothing fresh is saved, and the server still reuses what it can. */
      if (mode === 'refresh' || (mode === 'draft' && freshness !== 'fresh')) {
        setPhase('researching');
        await invokeEdge<ResearchResponse>('warm-lead-reply', { action: 'research', lead_id: leadId, refresh: mode === 'refresh' });
        setFreshness('fresh');
      }
      setPhase('analysing');
      const nextVariant = mode === 'regenerate' ? variant + 1 : 0;
      const d = await invokeEdge<DraftResponse>('warm-lead-reply', {
        action: 'draft', lead_id: leadId, phone, readable: getReadable(),
        variant: nextVariant, avoid: mode === 'regenerate' ? lastReply : null,
      });
      onDraft(d.reply);
      setWhy(d.why);
      setLastReply(d.reply);
      setVariant(nextVariant);
      setPhase('ready');
    } catch (e) {
      setError(edgeErrorMessage(e, 'Could not draft a reply.'));
      setPhase('error');
    }
  };

  const hasDraft = lastReply !== null;
  const mainLabel = hasDraft ? 'Regenerate' : freshness === 'fresh' ? 'Draft reply' : 'Research & draft reply';
  const mainTitle = hasDraft
    ? 'Write another version from the same saved research (does not re-read the site)'
    : freshness === 'fresh'
      ? 'Draft a reply from the saved research — nothing is sent'
      : 'Read their site (or reuse what we have), then draft a reply — nothing is sent';

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={busy || freshness === null}
          onClick={() => void run(hasDraft ? 'regenerate' : 'draft')} title={mainTitle}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : hasDraft ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
          {mainLabel}
        </Button>
        {(freshness === 'fresh' || hasDraft) && (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" disabled={busy}
            onClick={() => void run('refresh')} title="Re-read their website, then draft again">
            Refresh research
          </Button>
        )}
        <span className="text-[11px] text-muted-foreground" aria-live="polite">
          {phase === 'researching' && 'Researching site…'}
          {phase === 'analysing' && 'Analysing…'}
          {phase === 'ready' && <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400"><Check className="h-3 w-3" /> Draft ready — review, edit, then send</span>}
        </span>
        {why && (
          <button type="button" onClick={() => setWhyOpen((o) => !o)} aria-expanded={whyOpen}
            className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground">
            Why this reply? <ChevronDown className={cn('h-3 w-3 transition-transform', whyOpen && 'rotate-180')} />
          </button>
        )}
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {why && why.problems.length > 0 && !whyOpen && (
        <p className="flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> Check this draft before sending — {why.problems[0]}
        </p>
      )}
      {why && whyOpen && <WhyPanel why={why} />}
    </div>
  );
}

function WhyPanel({ why }: { why: DraftWhy }) {
  const facts = SALES_FACT_KEYS.filter((k) => why.salesFacts?.[k]);
  return (
    <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/30 p-2 text-[11px] leading-snug">
      <p className="text-muted-foreground">For you only — none of this is sent. Nothing has been sent.</p>
      <Row label="Their message">
        {QUESTION_LABELS[why.questionType] ?? why.questionType}
        {why.questionSummary ? ` — ${why.questionSummary}` : ''}
      </Row>
      <Row label="Findings used">
        {why.findingsUsed.length ? why.findingsUsed.map((f) => f.title).join(' · ') : 'None — answered from the offer and what we already know'}
      </Row>
      <Row label="Research">
        {why.research
          ? `${day(why.research.generatedAt)} · ${why.research.status}${why.research.technicallyClean ? ' · no technical fault found' : ''}`
          : 'None saved — the site was not mentioned'}
      </Row>
      {why.audit && (
        <Row label="AI check">
          {why.audit.namedEverywhere ? 'Named on every engine' : why.audit.total ? `Named ${why.audit.named ?? 0} of ${why.audit.total}` : 'No counts'} · {day(why.audit.createdAt)}
        </Row>
      )}
      <Row label="Ownership">
        {why.ownershipAlreadyKnown ? 'Already answered — not asked again' : why.askedOwnership ? 'Asked (the research gave a reason)' : 'Not asked'}
        {' · '}Report link {why.reportUrlAllowed ? 'allowed' : 'not included'}
      </Row>
      {facts.length > 0 && (
        <Row label="They’ve said">
          {facts.map((k) => `${SALES_FACT_LABELS[k]}: ${why.salesFacts[k]!.value} (“${why.salesFacts[k]!.quote}”)`).join(' · ')}
        </Row>
      )}
      {why.research?.warnings?.length ? <Row label="Research notes">{why.research.warnings.join(' ')}</Row> : null}
      {why.problems.length > 0 && <Row label="Check" tone="bad">{why.problems.join(' ')}</Row>}
      {why.warnings.length > 0 && <Row label="Worth a look" tone="warn">{why.warnings.join(' ')}</Row>}
      {why.operatorNote && <Row label="Note">{why.operatorNote}</Row>}
      <Row label="Timing">
        Research {secs(why.timings.researchMs)} · draft {secs(why.timings.generationMs)}{why.usedFallback ? ' · model unavailable, rule-built draft' : ''}
      </Row>
    </div>
  );
}

function Row({ label, children, tone }: { label: string; children: ReactNode; tone?: 'bad' | 'warn' }) {
  return (
    <p className={cn(tone === 'bad' && 'text-destructive', tone === 'warn' && 'text-amber-600 dark:text-amber-400')}>
      <span className="font-medium text-foreground">{label}: </span>{children}
    </p>
  );
}
