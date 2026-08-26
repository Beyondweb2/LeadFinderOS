import { useEffect, useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { usePersistedState } from '@/hooks/usePersistedState';
import { Loader2, ListOrdered, Sparkles, ArrowUp, ArrowDown, Pause, Play, Trash2, GitMerge, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

/* ════════════════════════════════════════════════════════════════════════════════════════════
   PAGE-PLAN QUEUE (Stage 1) — the per-client months-long working plan: measured questions clustered
   into distinct-job pages, scored, waved (siblings together), stored in the DB (client_pages), and
   EDITABLE here: reorder, move wave, hold/un-hold, remove, merge, rename. Nothing generates from
   here yet (Stage 3 hands rows to the generator). Build/Rebuild is the one priced action (~2p, one
   clustering call) and REPLACES the stored plan — the confirm says so. Holds and near-dup flags are
   always itemised with reasons, never silent (house rule).
   ════════════════════════════════════════════════════════════════════════════════════════════ */

interface QaClient { audit_id: string; business_name: string; business_type: string | null }
interface PlanRow {
  id: string; job: string; topic: string; primary_question: string; rationale: string | null;
  winnability: string | null; score: number | null; score_reasons: string[] | null;
  wave: number; position: number; status: 'planned' | 'held' | 'merged' | 'removed';
  held_reason: string | null; near_dup_of: string | null;
  questions: { question_text: string; named_rate: { chatgpt: number | null; gemini: number | null } | null }[];
}

const WINN_STYLE: Record<string, string> = {
  wide_open: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-500',
  informational: 'border-sky-500/40 text-sky-600 dark:text-sky-400',
  unclear: 'border-border text-muted-foreground',
  locked: 'border-red-500/40 text-red-600 dark:text-red-500',
};

const PagePlanQueue = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [clients, setClients] = useState<QaClient[]>([]);
  const [clientId, setClientId] = usePersistedState<string>('pageplan-client', '', { tier: 'both', scope: user?.id });
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [building, setBuilding] = useState(false);
  const [tablesMissing, setTablesMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<{ id: string; job: string } | null>(null);
  const [mergeFrom, setMergeFrom] = useState<string>('');

  useEffect(() => {
    void (async () => {
      const { data: res } = await supabase.functions.invoke('page-generator', { body: { action: 'qa_clients' } });
      if (res?.ok) setClients(res.clients ?? []);
    })();
  }, []);

  const load = async (auditId: string) => {
    setClientId(auditId);
    setRows([]); setError(null); setTablesMissing(false); setMergeFrom('');
    if (!auditId) return;
    setBusy(true);
    try {
      const { data: res, error: err } = await supabase.functions.invoke('page-generator', { body: { action: 'plan_get', audit_id: auditId } });
      if (err) throw new Error(err.message);
      if (!res?.ok) {
        if (res?.error === 'plan_tables_missing') { setTablesMissing(true); return; }
        throw new Error(res?.error ?? 'load failed');
      }
      setRows(res.pages ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setBusy(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (clientId) void load(clientId); }, []);

  const build = async () => {
    if (!clientId) return;
    const replaces = rows.length > 0 ? ' This REPLACES the current plan, including your edits.' : '';
    if (!window.confirm(`Build the page plan from the measured questions? One AI clustering call (~2p).${replaces}`)) return;
    setBuilding(true); setError(null);
    try {
      const { data: res, error: err } = await supabase.functions.invoke('page-generator', { body: { action: 'plan_build', audit_id: clientId } });
      if (err) throw new Error(err.message);
      if (!res?.ok) {
        if (res?.error === 'plan_tables_missing') { setTablesMissing(true); return; }
        if (res?.error === 'no_credits') { setError('AI credits need topping up — the plan builds the moment credits land.'); return; }
        throw new Error(res?.error ?? 'build failed');
      }
      if (res.partitionOk === false) toast({ title: 'Clustering fell back to one-page-per-question', description: String((res.problems ?? []).slice(0, 2).join('; ')), variant: 'destructive' });
      await load(clientId);
      toast({ title: `Plan built — ${res.built} pages from ${res.questionCount} questions` });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'build failed');
    } finally {
      setBuilding(false);
    }
  };

  const update = async (pageId: string, body: Record<string, unknown>, reload = true) => {
    const { data: res, error: err } = await supabase.functions.invoke('page-generator', { body: { action: 'plan_update', page_id: pageId, ...body } });
    if (err || !res?.ok) { toast({ title: 'Update failed', description: err?.message ?? res?.error, variant: 'destructive' }); return false; }
    if (reload && clientId) await load(clientId);
    return true;
  };

  const swap = async (a: PlanRow, b: PlanRow) => {
    await update(a.id, { set: { position: b.position } }, false);
    await update(b.id, { set: { position: a.position } }, true);
  };

  const active = rows.filter((r) => r.status === 'planned' || r.status === 'held');
  const waves = [...new Set(active.map((r) => r.wave))].sort((a, b) => a - b);
  const gone = rows.filter((r) => r.status === 'merged' || r.status === 'removed');
  const jobOf = (id: string | null) => rows.find((r) => r.id === id)?.job ?? null;

  const row = (r: PlanRow, siblings: PlanRow[]) => {
    const idx = siblings.findIndex((s) => s.id === r.id);
    const rate = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
    return (
      <div key={r.id} className={`rounded-md border p-3 space-y-1.5 ${r.status === 'held' ? 'border-amber-500/40 bg-amber-500/5' : 'border-border/60'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <button className="text-muted-foreground" onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}>
            {open[r.id] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {editing?.id === r.id ? (
            <>
              <Input className="h-7 w-64 text-sm" value={editing.job} onChange={(e) => setEditing({ id: r.id, job: e.target.value })} />
              <Button size="sm" className="h-7" onClick={async () => { if (await update(r.id, { set: { job: editing.job } })) setEditing(null); }}>Save</Button>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(null)}>Cancel</Button>
            </>
          ) : (
            <span className="font-medium text-sm cursor-pointer" title="Click to rename" onClick={() => setEditing({ id: r.id, job: r.job })}>{r.job}</span>
          )}
          <Badge variant="outline" className="text-[10px] font-normal">{r.topic}</Badge>
          {r.winnability && <Badge variant="outline" className={`text-[10px] ${WINN_STYLE[r.winnability] ?? ''}`}>{r.winnability.replace('_', ' ')}</Badge>}
          <Badge variant="outline" className="text-[10px] font-normal">score {r.score ?? '—'}</Badge>
          {r.questions.length > 1 && <Badge variant="outline" className="text-[10px] font-normal">{r.questions.length} variants merged</Badge>}
          {r.near_dup_of && (
            <span className="flex items-center gap-1 text-[10px] text-amber-600"><AlertTriangle className="h-3 w-3" /> near-duplicate of “{jobOf(r.near_dup_of) ?? 'another page'}”</span>
          )}
          <span className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={idx <= 0} onClick={() => swap(r, siblings[idx - 1])} title="Move up"><ArrowUp className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={idx >= siblings.length - 1} onClick={() => swap(r, siblings[idx + 1])} title="Move down"><ArrowDown className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => update(r.id, { set: { wave: r.wave === 1 ? 2 : 1 } })}>→ wave {r.wave === 1 ? 2 : 1}</Button>
            {r.status === 'held'
              ? <Button size="sm" variant="ghost" className="h-7 px-1.5" title="Un-hold" onClick={() => update(r.id, { set: { status: 'planned' } })}><Play className="h-3.5 w-3.5" /></Button>
              : <Button size="sm" variant="ghost" className="h-7 px-1.5" title="Hold" onClick={() => update(r.id, { set: { status: 'held', held_reason: 'held by operator' } })}><Pause className="h-3.5 w-3.5" /></Button>}
            <Button size="sm" variant="ghost" className="h-7 px-1.5" title="Merge into another page" onClick={() => setMergeFrom(mergeFrom === r.id ? '' : r.id)}><GitMerge className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" className="h-7 px-1.5 text-destructive" title="Remove" onClick={() => update(r.id, { set: { status: 'removed' } })}><Trash2 className="h-3.5 w-3.5" /></Button>
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{r.primary_question}</p>
        {r.status === 'held' && r.held_reason && <p className="text-xs text-amber-600 dark:text-amber-500">held: {r.held_reason}</p>}
        {mergeFrom === r.id && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Merge “{r.job}” into:</span>
            <Select onValueChange={async (target) => { setMergeFrom(''); await update(r.id, { merge_into: target }); }}>
              <SelectTrigger className="h-7 w-72 text-xs"><SelectValue placeholder="pick the page that keeps the job…" /></SelectTrigger>
              <SelectContent>
                {active.filter((x) => x.id !== r.id).map((x) => <SelectItem key={x.id} value={x.id}>{x.job}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {open[r.id] && (
          <div className="rounded border border-border/40 bg-muted/30 p-2 space-y-1 text-xs">
            {r.rationale && <p><span className="text-muted-foreground">Why grouped this way:</span> {r.rationale}</p>}
            {(r.score_reasons ?? []).map((s, i) => <p key={i} className="text-muted-foreground">· {s}</p>)}
            <p className="font-medium text-muted-foreground pt-1">Questions this page answers (named-rate ChatGPT / Gemini):</p>
            {r.questions.map((q) => (
              <p key={q.question_text}>“{q.question_text}” <span className="text-muted-foreground">— {rate(q.named_rate?.chatgpt ?? null)} / {rate(q.named_rate?.gemini ?? null)}</span></p>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <SEOHead title="Page plan | LeadFinder Pro" description="The per-client page queue: distinct jobs, scored and waved." canonical="/page-plan" noindex />
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Page plan</h1>
        <p className="text-sm text-muted-foreground">
          Measured questions clustered into distinct-job pages, scored by the evidence, released in
          waves — siblings publish together. Edit freely; nothing is built from here yet.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <ListOrdered className="h-4 w-4 text-primary" /> Client
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select value={clientId} onValueChange={load}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Pick a client with a baseline…" /></SelectTrigger>
            <SelectContent>
              {clients.map((c) => <SelectItem key={c.audit_id} value={c.audit_id}>{c.business_name}{c.business_type ? ` — ${c.business_type}` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
          {clientId && (
            <Button size="sm" disabled={building} onClick={build}>
              {building ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
              {rows.length ? 'Rebuild plan · ~2p' : 'Build plan · ~2p'}
            </Button>
          )}
          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardContent>
      </Card>

      {tablesMissing && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 text-sm">
            The plan tables don't exist yet — run the migration
            <code className="mx-1">supabase/migrations/20260828090000_page_plan_queue.sql</code>
            in the Supabase SQL editor, then press Build.
          </CardContent>
        </Card>
      )}
      {error && (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {waves.map((w) => {
        const members = active.filter((r) => r.wave === w).sort((a, b) => a.position - b.position);
        return (
          <Card key={w}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Wave {w} — {members.length} page{members.length === 1 ? '' : 's'}
                {members.some((m) => m.status === 'held') && ` (${members.filter((m) => m.status === 'held').length} held)`}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">{members.map((r) => row(r, members))}</CardContent>
          </Card>
        );
      })}

      {gone.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Merged / removed — kept for the record</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            {gone.map((r) => (
              <p key={r.id}>“{r.job}” — {r.status}{r.near_dup_of && r.status === 'merged' ? ` into “${jobOf(r.near_dup_of) ?? '?'}”` : ''}
                <Button size="sm" variant="ghost" className="h-6 px-2 ml-1 text-xs" onClick={() => update(r.id, { set: { status: 'planned' } })}>restore</Button>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {clientId && !busy && !tablesMissing && rows.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">No plan yet for this client — press Build.</p>
      )}
    </div>
  );
};

export default PagePlanQueue;
