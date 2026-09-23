import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Plus, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PaidBaseline } from '@/lib/paidBaseline';
import { canonicalServices, coverageReport, INTENT_LABELS, sameIntent, type IntentType } from '@/lib/baselineMix';
import { OPPORTUNITY_GROUP_LABELS, type OpportunityClass } from '@/lib/discoveryOpportunity';
import { BASELINE_QUESTIONS, BASELINE_RUNS } from '@/lib/auditQuestionCounts';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   DISCOVERY → BASELINE (Paid Clients, 2026-09-23).

   Discovery explores a WIDE pool across the home town and every approved service area; Paul adds
   the questions worth measuring to the baseline draft, or asks for a balanced draft; the coverage
   summary shows, before the freeze, where the 20 sit by town, service and intent.
   ⛔ Opening this spends nothing. "Generate Discovery questions" writes questions (no AI engine is
   asked). "Run Discovery" asks ChatGPT and Gemini and says its price on the button.
   ⛔ Winnability is shown to inform, never to choose: the balanced generator does not read it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const GROUP_ORDER: Array<OpportunityClass | 'unmeasured'> = ['winnable', 'possible', 'named', 'low', 'unmeasured'];
const GROUP_TONE: Record<OpportunityClass | 'unmeasured', string> = {
  winnable: 'text-emerald-700 dark:text-emerald-300', possible: 'text-sky-700 dark:text-sky-300',
  named: 'text-violet-700 dark:text-violet-300', low: 'text-muted-foreground', unmeasured: 'text-muted-foreground',
};

export function mixContextOf(data: PaidBaseline) {
  const areas = (data.areas_list ?? []).filter((a) => a.trim().toLowerCase() !== (data.location ?? '').trim().toLowerCase());
  const towns = [data.location, ...areas].filter(Boolean);
  return { primaryTown: data.location ?? '', areas, services: canonicalServices(data.canonical_services?.length ? data.canonical_services : (data.services_list ?? []), towns) };
}

export function DiscoverySection({ data, questions, busy, frozen, onGenerate, onRun, onAdd }: {
  data: PaidBaseline; questions: string[]; busy: boolean; frozen: boolean;
  onGenerate: () => void; onRun: () => void; onAdd: (q: string) => void;
}) {
  const d = data.discovery;
  const ctx = useMemo(() => mixContextOf(data), [data]);
  const towns = [ctx.primaryTown, ...ctx.areas];
  const [view, setView] = useState<'opportunity' | 'town'>('opportunity');
  const measured = !!d?.pool.some((p) => p.opportunity);
  const inDraft = (q: string) => questions.some((x) => x.trim().toLowerCase() === q.trim().toLowerCase() || sameIntent(x, q, towns));
  const running = !!d?.audit && !d.audit.complete;
  const groups = useMemo(() => {
    const m = new Map<string, NonNullable<PaidBaseline['discovery']>['pool']>();
    for (const p of d?.pool ?? []) {
      const k = view === 'opportunity' && measured ? (p.opportunity?.classification ?? 'unmeasured') : (p.town ?? 'No town');
      (m.get(k) ?? m.set(k, []).get(k)!).push(p);
    }
    const keys = view === 'opportunity' && measured ? GROUP_ORDER.filter((g) => m.has(g)) : [...m.keys()].sort((a, b) => (a === ctx.primaryTown ? -1 : b === ctx.primaryTown ? 1 : a.localeCompare(b)));
    return keys.map((k) => ({ key: k, items: m.get(k)! }));
  }, [d, view, measured, ctx.primaryTown]);

  return <section className="rounded-md border p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="font-medium">B. Discovery — explore before choosing the baseline</h3>
        <p className="text-sm text-muted-foreground">A wide pool across {ctx.primaryTown || 'the home town'}{ctx.areas.length ? ` and ${ctx.areas.length} approved area${ctx.areas.length === 1 ? '' : 's'} (${ctx.areas.join(', ')})` : ''}, from {ctx.services.length} approved service{ctx.services.length === 1 ? '' : 's'}. Add the questions worth measuring to the baseline. Discovery is research — it is never frozen and never compared.</p>
      </div>
      {!frozen && <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={onGenerate}><Sparkles className="mr-1 h-4 w-4" />{d?.pool.length ? 'Regenerate Discovery questions' : 'Generate Discovery questions'}</Button>
        {!!d?.pool.length && <Button size="sm" variant="outline" disabled={busy || running} onClick={onRun}
          title="Asks ChatGPT and Gemini each Discovery question, three times — the same engine as every Discovery scan.">
          <Search className="mr-1 h-4 w-4" />{running ? `Discovery running (${d.audit!.runs_done}/${d.audit!.runs_target} runs)` : `Run Discovery — ${d.pool.length} q × 3 · about $${d.estimate_usd.toFixed(2)}`}
        </Button>}
      </div>}
    </div>
    <p className="mt-1 text-xs text-muted-foreground">Generating questions asks no AI engine. Running Discovery does, and costs what the button says.</p>
    {d?.towns_failed?.length ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">No questions came back for: {d.towns_failed.join(', ')} — regenerate to retry.</p> : null}
    {!!d?.pool.length && <>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">{d.pool.length} Discovery questions{d.generated_at ? ` · generated ${new Date(d.generated_at).toLocaleString('en-GB')}` : ''}{d.audit ? ` · measured ${d.audit.complete ? 'complete' : `${d.audit.runs_done}/${d.audit.runs_target} runs`}` : ' · not measured yet'}</span>
        {measured && <span className="ml-auto flex gap-1">
          <Button size="sm" variant={view === 'opportunity' ? 'secondary' : 'ghost'} className="h-7 text-xs" onClick={() => setView('opportunity')}>By opportunity</Button>
          <Button size="sm" variant={view === 'town' ? 'secondary' : 'ghost'} className="h-7 text-xs" onClick={() => setView('town')}>By town</Button>
        </span>}
      </div>
      {measured && <p className="mt-1 text-xs text-muted-foreground">Winnable / Possible / Already named / Weak come from the existing winnability classifier over the Discovery runs. They explain a question; they do not decide the baseline — a baseline of only easy questions would not measure the business.</p>}
      <div className="mt-2 max-h-[340px] space-y-3 overflow-y-auto pr-1">{groups.map((g) => <div key={g.key}>
        <p className={`text-xs font-semibold uppercase tracking-wide ${GROUP_TONE[g.key as keyof typeof GROUP_TONE] ?? 'text-muted-foreground'}`}>
          {view === 'opportunity' && measured ? (g.key === 'unmeasured' ? 'Not answered yet' : OPPORTUNITY_GROUP_LABELS[g.key as OpportunityClass]) : g.key} · {g.items.length}
        </p>
        <ul className="mt-1 space-y-1">{g.items.map((p) => {
          const added = inDraft(p.question);
          return <li key={p.question} className="flex items-start justify-between gap-2 rounded border px-2 py-1 text-sm">
            <div className="min-w-0">
              <p className="break-words">{p.question}</p>
              <p className="text-xs text-muted-foreground">{[p.town ?? 'no town', p.service ?? 'no specific service', INTENT_LABELS[p.intent as IntentType] ?? p.intent].join(' · ')}
                {p.opportunity ? ` · named in ${p.opportunity.namedRuns}/${p.opportunity.runs} runs · ${p.opportunity.fragmentation} — ${p.opportunity.reason}` : ''}</p>
            </div>
            {!frozen && <Button size="sm" variant={added ? 'ghost' : 'outline'} className="h-7 shrink-0 text-xs" disabled={added || busy} onClick={() => onAdd(p.question)}>
              {added ? 'In baseline' : <><Plus className="mr-1 h-3.5 w-3.5" />Add to baseline</>}
            </Button>}
          </li>;
        })}</ul>
      </div>)}</div>
    </>}
  </section>;
}

/** Where the draft sits, before the freeze. Recomputed live from the questions on screen. */
export function CoveragePanel({ data, questions }: { data: PaidBaseline; questions: string[] }) {
  const ctx = useMemo(() => mixContextOf(data), [data]);
  const r = useMemo(() => coverageReport(questions, ctx, BASELINE_QUESTIONS), [questions, ctx]);
  const f = (n: number) => n.toLocaleString('en-GB');
  return <div className="mt-3 space-y-2 rounded-md border bg-background p-3 text-xs">
    <p className="text-sm font-medium">{f(r.total)} / {BASELINE_QUESTIONS} selected · {BASELINE_RUNS} runs · ChatGPT + Gemini</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <div><p className="font-semibold uppercase tracking-wide text-muted-foreground">Areas</p>
        <ul>{r.areas.map((a) => <li key={a.town} className={a.count === 0 ? 'text-muted-foreground' : ''}>{a.town} — {a.count}</li>)}{r.noTown > 0 && <li className="text-muted-foreground">No town named — {r.noTown}</li>}</ul></div>
      <div><p className="font-semibold uppercase tracking-wide text-muted-foreground">Services</p>
        <ul>{r.services.map((s) => <li key={s.service}>{s.service} — {s.count}</li>)}{r.noService > 0 && <li className="text-muted-foreground">General / no single service — {r.noService}</li>}</ul></div>
      <div><p className="font-semibold uppercase tracking-wide text-muted-foreground">Intent types</p>
        <ul>{(Object.keys(INTENT_LABELS) as IntentType[]).map((k) => <li key={k}>{INTENT_LABELS[k]} — {r.intents[k]}</li>)}</ul>
        <p className="mt-1 text-muted-foreground">Guide for 20: 4–5 broad · 7–8 service · 5–6 service + other area · 2–3 emergency/problem.</p></div>
    </div>
    {r.warnings.length > 0 && <ul className="space-y-0.5">{r.warnings.map((w) => <li key={w} className="flex items-start gap-1.5 text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</li>)}</ul>}
    {r.duplicates.length > 0 && <div><p className="font-medium text-amber-700 dark:text-amber-300">Near-duplicates — the same question in different words:</p>
      <ul className="ml-4 list-disc">{r.duplicates.map(([a, b]) => <li key={`${a}-${b}`}>#{a + 1} “{questions.filter((q) => q.trim())[a]}” ≈ #{b + 1} “{questions.filter((q) => q.trim())[b]}”</li>)}</ul></div>}
  </div>;
}

export const nearDuplicateCount = (data: PaidBaseline, questions: string[]) => coverageReport(questions, mixContextOf(data), BASELINE_QUESTIONS).duplicates.length;

export function BusyNote({ text }: { text: string }) {
  return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{text}</span>;
}
