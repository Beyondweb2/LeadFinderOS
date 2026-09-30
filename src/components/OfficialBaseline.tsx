import { useMemo, useState } from 'react';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuditQuestionEditor } from '@/components/AuditQuestionEditor';
import { CollapsibleBlock } from '@/components/CollapsibleSection';
import { CoveragePanel, EngineLines, HookBadge, recArgsOf, tallyTarget } from '@/components/BaselineDiscovery';
import { describeDraft, HOOK_REPLACEMENT_MIN_REASON, SOURCE_LABELS, summarise } from '@/lib/baselineRecommendation';
import { INTENT_LABELS } from '@/lib/baselineMix';
import { BASELINE_QUESTIONS } from '@/lib/auditQuestionCounts';
import type { PaidBaseline } from '@/lib/paidBaseline';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   STEP 4 — THE OFFICIAL BASELINE, REVIEWED (2026-09-30).

   The exact 20 that will be frozen, in the order they will be frozen. Each row: the question, its
   service and area, where it came from (Hook Audit / Discovery / added by hand), why, and what it
   measured so far. ⛔ HOOK AUDIT · LOCKED IN rows cannot be edited or removed casually: "Replace"
   asks for the reason (a factual or business error), which travels with the approval and is kept.
   The server refuses an approval that drops a Hook question without one (paid-baseline, approve).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const SOURCE_TONE = {
  hook: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  discovery: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  manual: 'border-border bg-muted text-muted-foreground',
} as const;

export function OfficialBaseline({ data, questions, onChange, frozen, busy, hookReasons, onHookReason }: {
  data: PaidBaseline; questions: string[]; onChange: (next: string[]) => void; frozen: boolean; busy: boolean;
  hookReasons: Record<string, string>; onHookReason: (question: string, reason: string) => void;
}) {
  const args = useMemo(() => recArgsOf(data), [data]);
  const rows = useMemo(() => describeDraft(questions, args), [questions, args]);
  const summary = useMemo(() => summarise(rows, { ctx: args.ctx, target: BASELINE_QUESTIONS }), [rows, args]);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [adding, setAdding] = useState('');
  const clean = questions.map((q) => q.trim()).filter(Boolean);
  const replaceHook = (q: string) => {
    const reason = window.prompt(`Replace the Hook Audit question\n\n“${q}”\n\nOnly for a factual or business error (a service they do not offer, a town they do not serve). Why must it be replaced?`, hookReasons[q] ?? '');
    if (reason === null) return;
    if (reason.trim().length < HOOK_REPLACEMENT_MIN_REASON) { window.alert('A reason of at least a few words is required — the Hook Audit questions are kept unless one is genuinely wrong.'); return; }
    onHookReason(q, reason.trim());
    onChange(clean.filter((x) => x !== q));
  };
  const commitEdit = (i: number) => {
    const t = editText.trim();
    if (t) onChange(clean.map((q, j) => (j === i ? t : q)));
    setEditing(null);
  };

  return <section className="rounded-md border p-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">4. Official baseline — review</p>
        <p className="text-lg font-semibold">{clean.length} / {BASELINE_QUESTIONS} questions</p>
        <p className="text-xs text-muted-foreground">{summary.fromHook} Hook Audit · {summary.fromDiscovery} Discovery{summary.manual ? ` · ${summary.manual} added by hand` : ''}</p>
      </div>
      {frozen && <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-emerald-600"><Lock className="h-3.5 w-3.5"/>Frozen</span>}
    </div>
    {clean.length > 0 && <div className="mt-2 grid gap-2 text-xs sm:grid-cols-4">
      <Stat label="Services" value={`${summary.services.covered} of ${summary.services.total}`}/>
      <Stat label="Areas" value={`${summary.towns.covered} of ${summary.towns.total} · ${summary.towns.home} home`}/>
      <Stat label="Intents" value={(Object.keys(summary.intents) as Array<keyof typeof summary.intents>).filter((k) => summary.intents[k]).map((k) => `${summary.intents[k]} ${INTENT_LABELS[k].split(' ')[0].toLowerCase()}`).join(' · ')}/>
      <Stat label="Opportunity mix" value={[summary.opportunity.absent && `${summary.opportunity.absent} not named`, summary.opportunity.partial && `${summary.opportunity.partial} partly`, summary.opportunity.named && `${summary.opportunity.named} named`, summary.opportunity.unmeasured && `${summary.opportunity.unmeasured} unmeasured`].filter(Boolean).join(' · ') || '—'}/>
    </div>}
    <CoveragePanel data={data} questions={clean}/>
    <ol className="mt-3 space-y-1.5">{rows.map((r, i) => <li key={`${i}-${r.question}`} className="rounded border px-2 py-1.5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 gap-2">
          <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
          {editing === i
            ? <Input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} onBlur={() => commitEdit(i)} onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(i); if (e.key === 'Escape') setEditing(null); }} className="h-8"/>
            : <span className="min-w-0 break-words">{r.question}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {r.source === 'hook' ? <HookBadge/> : <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SOURCE_TONE[r.source]}`}>{SOURCE_LABELS[r.source]}</span>}
          {!frozen && r.source === 'hook' && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => replaceHook(r.question)}>Replace…</Button>}
          {!frozen && r.source !== 'hook' && <>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} aria-label="Edit question" onClick={() => { setEditing(i); setEditText(r.question); }}><Pencil className="h-3.5 w-3.5"/></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} aria-label="Remove question" onClick={() => onChange(clean.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5"/></Button>
          </>}
        </div>
      </div>
      <div className="ml-7 space-y-0.5">
        <p className="text-xs text-muted-foreground">{[r.service ?? 'general', r.town ?? 'no approved town', INTENT_LABELS[r.intent]].join(' · ')}</p>
        <p className="text-xs">{r.reason}</p>
        <EngineLines engines={r.engines} target={tallyTarget(data, r.question)} compact/>
      </div>
    </li>)}</ol>
    {Object.keys(hookReasons).length > 0 && <div className="mt-2 rounded border border-amber-400/50 bg-amber-500/10 p-2 text-xs">
      <p className="font-medium">Hook Audit question{Object.keys(hookReasons).length === 1 ? '' : 's'} replaced — the reason is kept with the approval:</p>
      <ul className="ml-4 list-disc">{Object.entries(hookReasons).map(([q, why]) => <li key={q}>“{q}” — {why}</li>)}</ul>
    </div>}
    {!frozen && <div className="mt-3 space-y-2">
      <div className="flex gap-2"><Input value={adding} placeholder="Add a question…" onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && adding.trim()) { onChange([...clean, adding.trim()]); setAdding(''); } }} className="h-8"/>
        <Button size="sm" variant="outline" disabled={busy || !adding.trim()} onClick={() => { onChange([...clean, adding.trim()]); setAdding(''); }}><Plus className="mr-1 h-4 w-4"/>Add</Button></div>
      <CollapsibleBlock defaultOpen={false} titleClassName="text-xs text-muted-foreground" title="Paste or edit the list as text">
        <AuditQuestionEditor questions={questions} onChange={onChange} disabled={frozen} busy={busy}/>
      </CollapsibleBlock>
    </div>}
  </section>;
}

const Stat = ({ label, value }: { label: string; value: string }) => <div className="rounded border bg-background px-2 py-1"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="break-words">{value}</p></div>;
