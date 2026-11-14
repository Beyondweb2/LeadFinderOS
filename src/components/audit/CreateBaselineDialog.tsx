/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CREATE BASELINE — from a Discovery, with NO new searches (Paul, 2026-11-14; V2's "Create baseline from
   this Discovery"). The 20 targeted searches are proposed instantly from the Discovery's own answers
   (targetedPick.ts); each can be swapped before saving. Saving copies those answers into a new
   "baseline from Discovery" audit (edge function discovery-baseline — nothing asked again, nothing spent),
   then runs the website scan for it only if there is no SEO grade yet (run-seo-scan reuses one for free).
   ⛔ Not the guarantee baseline: no lead pointer, no payment clock (see discovery-baseline).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useState } from 'react';
import { ListChecks, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { DialogHero } from '@/components/operator/ui';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { isRealCompetitor, type QueueRow } from '@/lib/auditReport';
import { cellNamed } from '@/lib/namedSignal';
import { isAggregatorUrl } from '@/lib/aggregators';
import { summariseOpportunity, theirAreas, type OppQuestion, type OppRow } from '@/lib/reportOpportunity';
import { winnableOf } from '@/lib/reportDesign';
import { pickTargetedSearches, PICK_SOURCE_LABEL, TARGETED_SEARCH_COUNT, type PickInput, type PickSource } from '@/lib/targetedPick';
import { shortReportUrl } from '@/lib/reportSlug';

export interface DiscoveryAuditLite {
  id: string; lead_id: string | null; business_name: string; business_type: string | null; location_text: string | null;
}

type Row = { question: string; source: PickSource | 'swapped' };

export function CreateBaselineDialog({ open, onOpenChange, audit, loadRows, toast, onCreated }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  audit: DiscoveryAuditLite;
  loadRows: (auditId: string) => Promise<QueueRow[]>;
  toast: (t: { title: string; description?: string; variant?: 'destructive' }) => void;
  onCreated?: (auditId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pool, setPool] = useState<Array<PickInput & { why: string; namedYou: number }>>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const qrows = await loadRows(audit.id);
        const town = audit.location_text ?? '';
        const trade = audit.business_type ?? '';
        const nctx = { businessName: audit.business_name, trade: trade || null, town: town || null };
        const oppRows: OppRow[] = qrows.filter((r) => r.status === 'done' || r.result).map((r) => ({ question: r.question, result: r.result as never }));
        const questions = [...new Set(oppRows.map((r) => r.question.trim()))];
        /* The same website facts the Discovery page uses (render-audit-report): the services and pages its website check
           stored, so a search about a service not on their site is left out here exactly as it is on the page. */
        const { data: crawlRuns } = await supabase.from('ai_audit_runs').select('run_number, crawl:results->crawl_check' as string).eq('audit_id', audit.id).order('run_number', { ascending: true });
        const crawl = ((crawlRuns ?? []) as unknown as Array<{ crawl: { insights?: { services?: Array<{ name?: string; coverage?: string }> }; signals?: { checkedPages?: Array<{ url?: string }> } } | null }>)
          .map((r) => r.crawl).find((c) => Array.isArray(c?.insights?.services) && c!.insights!.services!.length) ?? null;
        const services = crawl ? crawl.insights!.services!.map((x) => ({ name: String(x.name ?? ''), dedicated: x.coverage === 'dedicated' })) : [];
        const pageUrls = crawl ? (crawl.signals?.checkedPages ?? []).map((x) => String(x.url ?? '')) : [];
        const s = summariseOpportunity(oppRows, {
          businessName: audit.business_name, services, pageUrls, town,
          siteText: crawl ? [audit.business_name, trade, ...services.map((x) => x.name), ...pageUrls].join(' ').toLowerCase() : undefined,
          areas: theirAreas({ locationText: town, pageUrls, questions, fromDiscovery: true }),
          isDirectoryHost: (h: string) => isAggregatorUrl('https://' + h),
          isNamed: (c: unknown) => cellNamed(c as never, nctx),
          isRival: (n: string) => isRealCompetitor(n, town),
        }, 200);
        const p = s.questions.map((q: OppQuestion) => ({ question: q.question, tier: q.tier, firms: q.distinct, verdict: winnableOf(q), why: q.why, namedYou: q.namedYou }));
        /* The hook searches: the lead's newest AI check (an ordinary audit). Only those the Discovery also asked count. */
        let hook: string[] = [];
        if (audit.lead_id) {
          const { data: a } = await supabase.from('ai_audits').select('id').eq('lead_id', audit.lead_id)
            .or('audit_purpose.is.null,audit_purpose.eq.audit').order('created_at', { ascending: false }).limit(1).maybeSingle();
          if (a?.id) {
            const { data: qs } = await supabase.from('ai_audit_queue').select('question, created_at').eq('audit_id', a.id).order('created_at', { ascending: true }).limit(60);
            hook = [...new Set(((qs ?? []) as Array<{ question: string }>).map((x) => x.question.trim()))].slice(0, 3);
          }
        }
        if (cancelled) return;
        setPool(p);
        setRows(pickTargetedSearches(p, hook).map((x) => ({ question: x.question, source: x.source })));
      } catch (e) {
        if (!cancelled) setError(edgeErrorMessage(e, 'Could not read the Discovery'));
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [open, audit, loadRows]);

  const byQ = useMemo(() => new Map(pool.map((p) => [p.question, p])), [pool]);
  const unpicked = pool.filter((p) => p.verdict !== null && !rows.some((r) => r.question === p.question));
  const noFirms = rows.filter((r) => byQ.get(r.question)?.tier === 'nofirms').length;

  const swap = (i: number, q: string) => setRows((rs) => rs.map((r, j) => (j === i ? { question: q, source: 'swapped' } : r)));

  const save = async () => {
    if (rows.length !== TARGETED_SEARCH_COUNT || saving) return;
    setSaving(true);
    try {
      const r = await invokeEdge<{ ok: true; audit_id: string; short_code: string | null }>('discovery-baseline', { discovery_audit_id: audit.id, questions: rows.map((x) => x.question) });
      toast({ title: 'Baseline created', description: 'The 20 targeted searches, scored from the Discovery. Nothing was asked again.' });
      /* The website scan, only if there is no SEO grade yet (run-seo-scan reuses an existing one for free). */
      const { data: run } = await supabase.from('ai_audit_runs').select('id').eq('audit_id', r.audit_id).order('run_number', { ascending: false }).limit(1).maybeSingle();
      if (run?.id) {
        void invokeEdge('run-seo-scan', { runId: run.id })
          .then(() => toast({ title: 'Website scan done', description: 'The SEO grade is on the baseline audit.' }))
          .catch(() => toast({ title: 'Website scan did not run', description: 'Use Run SEO scan on the baseline audit to try again.', variant: 'destructive' }));
      }
      if (r.short_code) window.open(shortReportUrl(r.short_code) + '?preview=1', '_blank', 'noopener');
      onCreated?.(r.audit_id);
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Could not create the baseline', description: edgeErrorMessage(e, 'Try again'), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHero icon={ListChecks} tone="blue" title="Create baseline"
          subtitle={<>20 targeted searches from this Discovery: every AI-check search, the winnable ones with the most room, and 3 or 4 harder main searches. Scored from the answers already collected — nothing is asked again. Swap any, then create. This is not the guarantee baseline.</>} />
        {loading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Reading the Discovery…</p>
          : error ? <p className="text-sm text-destructive">{error}</p>
          : <div className="max-h-[55vh] space-y-1 overflow-y-auto pr-1">
            {rows.map((r, i) => {
              const p = byQ.get(r.question);
              return <div key={r.question + i} className="flex items-start gap-2 rounded-lg border px-2 py-1.5 text-sm">
                <span className="w-6 shrink-0 text-right text-muted-foreground">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="break-words">{r.question}</p>
                  <p className="text-xs text-muted-foreground">{r.source === 'swapped' ? 'Swapped in' : PICK_SOURCE_LABEL[r.source]} · {p?.verdict === 'winnable' ? 'Winnable' : 'Not winnable'}{p?.namedYou ? ` · named you ${p.namedYou}×` : ''}{p?.why ? ` · ${p.why}` : ''}</p>
                </div>
                {unpicked.length > 0 && <select aria-label="Swap this search" className="h-8 max-w-[11rem] shrink-0 rounded-md border bg-background px-1 text-xs" value="" onChange={(e) => e.target.value && swap(i, e.target.value)}>
                  <option value="">Swap…</option>
                  {unpicked.map((u) => <option key={u.question} value={u.question}>{u.verdict === 'winnable' ? '✓ ' : ''}{u.question}</option>)}
                </select>}
              </div>;
            })}
            {rows.length < TARGETED_SEARCH_COUNT && <p className="text-sm text-amber-700">This Discovery has only {rows.length} usable searches; a baseline needs {TARGETED_SEARCH_COUNT}. Ask more searches in the Discovery first.</p>}
            {noFirms > 0 && <p className="text-xs text-amber-700">⚠ {noFirms} search{noFirms === 1 ? '' : 'es'} where AI names no firms {noFirms === 1 ? 'was' : 'were'} needed to reach 20. Swap {noFirms === 1 ? 'it' : 'them'} if you can.</p>}
          </div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={loading || saving || rows.length !== TARGETED_SEARCH_COUNT}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create baseline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
