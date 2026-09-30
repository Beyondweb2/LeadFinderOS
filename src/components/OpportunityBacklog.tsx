import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { CollapsibleBlock } from '@/components/CollapsibleSection';
import { EngineLines } from '@/components/BaselineDiscovery';
import { invokePaidBaselineRaw } from '@/lib/paidBaseline';
import type { EngineTally } from '@/lib/discoveryOpportunity';
import { ACTION_BY_KEY, backlogCounts, IMPROVEMENT_ACTIONS, OPPORTUNITY_STATUS_LABELS, OPPORTUNITY_STATUSES, type OpportunityStatus } from '@/lib/opportunityBacklog';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONGOING OPPORTUNITIES (2026-09-30) — the Opportunity Backlog and the improvement cycle.

   ⛔ NOT THE GUARANTEE. The official baseline and its re-measure are the frozen 20; this list is the
   flexible second kind of measurement — new questions welcome, used to decide what to improve next,
   never folded into the before/after (src/lib/opportunityBacklog.ts header).

   Find → choose action → implement → record what changed → wait → check → record the result → next.
   A CHECK spends (questions × 3 runs × both engines) and says its price before it runs.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface Opportunity {
  id: string; question: string; service: string | null; area: string | null; intent: string | null; source: string;
  visibility: { engines?: EngineTally[] } | null; competitors: string[]; evidence_gap: string | null;
  suggested_action: string | null; action_note: string | null; status: OpportunityStatus; what_changed: string | null;
  implemented_at: string | null; recheck_due: string | null; recheck_audit_id: string | null; created_at: string;
}
interface CheckResult { audit_id: string; created_at: string | null; complete: boolean; runs_target: number; by_question: Record<string, EngineTally[]> }
type ListResponse = { opportunities: Opportunity[]; checks: Record<string, CheckResult>; check_usd_per_question: number };

const STATUS_TONE: Partial<Record<OpportunityStatus, string>> = {
  new: 'text-sky-700 dark:text-sky-300', planned: 'text-amber-700 dark:text-amber-300', in_progress: 'text-amber-700 dark:text-amber-300',
  implemented: 'text-violet-700 dark:text-violet-300', waiting_recheck: 'text-violet-700 dark:text-violet-300',
  improved: 'text-emerald-700 dark:text-emerald-300', no_change: 'text-muted-foreground', not_pursuing: 'text-muted-foreground',
};

export function useOpportunities(leadId: string, enabled = true) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await invokePaidBaselineRaw<ListResponse>('opportunities', leadId); setData({ opportunities: r.opportunities ?? [], checks: r.checks ?? {}, check_usd_per_question: r.check_usd_per_question ?? 0 }); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the opportunities'); }
    finally { setLoading(false); }
  }, [leadId]);
  useEffect(() => { if (enabled) void load(); }, [enabled, load]);
  return { data, error, loading, reload: load };
}

export function OpportunityBacklog({ leadId, state }: { leadId: string; state: ReturnType<typeof useOpportunities> }) {
  const { toast } = useToast();
  const { data, error, loading, reload } = state;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [newQ, setNewQ] = useState('');
  const items = data?.opportunities ?? [];
  const counts = backlogCounts(items);
  const groups = useMemo(() => {
    const order: OpportunityStatus[] = ['in_progress', 'planned', 'implemented', 'waiting_recheck', 'new', 'improved', 'no_change', 'not_pursuing'];
    return order.map((s) => ({ status: s, items: items.filter((i) => i.status === s) })).filter((g) => g.items.length);
  }, [items]);

  const save = async (id: string | null, item: Record<string, unknown>) => {
    setBusy(true);
    try { await invokePaidBaselineRaw('opportunity_save', leadId, { id, item }); await reload(); return true; }
    catch (e) { toast({ title: 'Could not save', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' }); return false; }
    finally { setBusy(false); }
  };
  const check = async () => {
    const ids = [...selected];
    if (!ids.length || !data) return;
    const usd = (ids.length * data.check_usd_per_question).toFixed(2);
    if (!window.confirm(`Check ${ids.length} opportunit${ids.length === 1 ? 'y' : 'ies'} now: ${ids.length} question${ids.length === 1 ? '' : 's'} × 2 engines × 3 runs, about $${usd}. This is an ongoing check — it never changes the official baseline or the guarantee. Continue?`)) return;
    setBusy(true);
    try { await invokePaidBaselineRaw('opportunity_check', leadId, { ids, confirm_cost: true }); setSelected(new Set()); toast({ title: 'Check started', description: 'It runs on the server; results appear here as it finishes.' }); await reload(); }
    catch (e) { toast({ title: 'Check did not start', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return <div className="space-y-3 text-sm">
    <p className="text-xs text-muted-foreground">What to improve next. Separate from the official baseline: checks here are flexible and never change the guarantee result.</p>
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span><b>{counts.total}</b> open</span><span>· <b>{counts.active}</b> active</span><span>· <b>{counts.waiting}</b> waiting for recheck</span><span>· <b>{counts.improved}</b> improved</span>
      <Button size="sm" variant="ghost" className="ml-auto h-7" disabled={loading} onClick={() => void reload()}><RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}/>Refresh</Button>
    </div>
    {error && <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive"><AlertCircle className="mt-0.5 h-3.5 w-3.5"/>{error}</p>}
    {!data && loading && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin text-primary"/>Loading…</p>}
    {data && items.length === 0 && <p className="text-xs text-muted-foreground">Nothing yet. Approving the official baseline puts the Discovery questions it did not use here; you can also add one below.</p>}
    {groups.map((g) => <CollapsibleBlock key={g.status} persistKey={`hub.opportunities.${g.status}`} defaultOpen={g.status !== 'no_change' && g.status !== 'not_pursuing' && g.status !== 'new'}
      titleClassName={`text-xs font-semibold uppercase tracking-wide ${STATUS_TONE[g.status] ?? ''}`} title={`${OPPORTUNITY_STATUS_LABELS[g.status]} (${g.items.length})`}>
      <ul className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1">{g.items.map((o) => <OpportunityRow key={o.id} o={o} check={o.recheck_audit_id ? data?.checks[o.recheck_audit_id] : undefined}
        selected={selected.has(o.id)} onSelect={(v) => setSelected((cur) => { const n = new Set(cur); if (v) n.add(o.id); else n.delete(o.id); return n; })}
        busy={busy} onSave={(patch) => save(o.id, patch)}/>)}</ul>
    </CollapsibleBlock>)}
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={busy || !selected.size} onClick={() => void check()}><Search className="mr-1 h-4 w-4"/>Check selected now{selected.size ? ` (${selected.size})` : ''}</Button>
      <div className="flex min-w-[220px] flex-1 gap-2"><Input className="h-8" placeholder="Add a question or intent to track…" value={newQ} onChange={(e) => setNewQ(e.target.value)}/>
        <Button size="sm" variant="outline" disabled={busy || !newQ.trim()} onClick={async () => { if (await save(null, { question: newQ })) setNewQ(''); }}><Plus className="mr-1 h-4 w-4"/>Add</Button></div>
    </div>
  </div>;
}

function OpportunityRow({ o, check, selected, onSelect, busy, onSave }: { o: Opportunity; check?: CheckResult; selected: boolean; onSelect: (v: boolean) => void; busy: boolean; onSave: (patch: Record<string, unknown>) => Promise<boolean> }) {
  const [status, setStatus] = useState<OpportunityStatus>(o.status);
  const [action, setAction] = useState(o.suggested_action ?? '');
  const [changed, setChanged] = useState(o.what_changed ?? '');
  const [due, setDue] = useState(o.recheck_due ?? '');
  const dirty = status !== o.status || action !== (o.suggested_action ?? '') || changed !== (o.what_changed ?? '') || due !== (o.recheck_due ?? '');
  const latest = check?.by_question[o.question.trim().toLowerCase()];
  const why = action ? ACTION_BY_KEY[action]?.why : null;
  return <li className="rounded border px-2 py-1.5">
    <div className="flex items-start gap-2">
      <input type="checkbox" className="mt-1" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label="Select for a check"/>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="break-words font-medium">{o.question}</p>
        <p className="text-xs text-muted-foreground">{[o.service ?? 'general', o.area ?? 'no area', o.source === 'discovery' ? 'from Discovery' : 'added by hand'].join(' · ')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">When found</p><EngineLines engines={o.visibility?.engines} target={3}/></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Latest check{check ? ` · ${check.created_at ? new Date(check.created_at).toLocaleDateString('en-GB') : ''}${check.complete ? '' : ' · still running'}` : ''}</p>
            {check ? <EngineLines engines={latest} target={check.runs_target}/> : <p className="text-xs text-muted-foreground">Not checked since.</p>}</div>
        </div>
        {o.competitors.length > 0 && <p className="text-xs"><span className="text-muted-foreground">Named instead: </span>{o.competitors.join(', ')}</p>}
        {o.evidence_gap && <p className="text-xs"><span className="text-muted-foreground">Evidence gap: </span>{o.evidence_gap}</p>}
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs"><span className="text-muted-foreground">Status</span>
            <select className="mt-0.5 block h-8 w-full rounded-md border bg-background px-2" value={status} onChange={(e) => setStatus(e.target.value as OpportunityStatus)}>
              {OPPORTUNITY_STATUSES.map((s) => <option key={s} value={s}>{OPPORTUNITY_STATUS_LABELS[s]}</option>)}</select></label>
          <label className="text-xs sm:col-span-2"><span className="text-muted-foreground">Suggested action</span>
            <select className="mt-0.5 block h-8 w-full rounded-md border bg-background px-2" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">— choose —</option>{IMPROVEMENT_ACTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select></label>
        </div>
        {why && <p className="text-xs text-muted-foreground">Why it may help: {why}</p>}
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs sm:col-span-2"><span className="text-muted-foreground">What changed</span><Textarea rows={2} className="mt-0.5 text-xs" value={changed} onChange={(e) => setChanged(e.target.value)} placeholder="What was done, and where"/></label>
          <label className="text-xs"><span className="text-muted-foreground">Recheck on</span><Input type="date" className="mt-0.5 h-8" value={due} onChange={(e) => setDue(e.target.value)}/></label>
        </div>
        {dirty && <Button size="sm" disabled={busy} onClick={() => void onSave({ status, suggested_action: action || null, what_changed: changed, recheck_due: due || null })}>Save</Button>}
      </div>
    </div>
  </li>;
}
