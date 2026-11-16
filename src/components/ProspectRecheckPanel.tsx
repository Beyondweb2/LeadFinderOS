import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, Loader2, Pencil, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useLeadCrmRow, leadCrmKey } from '@/components/LeadCrmPanel';
import { useLeadActivity, useTeamDirectory, salesKeys } from '@/hooks/useSalesCrm';
import { leadRecheckKey, useLeadRecheck, type RecheckAuditRow } from '@/hooks/useLeadRecheck';
import { useCampaignReportStyle, reportLinkFor } from '@/hooks/useReportStyle';
import { hookVisibilityQueryKey } from '@/hooks/useHookVisibility';
import { leadRpc } from '@/lib/leadRpc';
import { refusalText } from '@/lib/salesCrm';
import { notifyLeadChanged } from '@/lib/leadSync';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { isAggregatorUrl } from '@/lib/aggregators';
import { splitLine } from '@/lib/reportDesign';
import { REPORT_PUBLIC_ORIGIN } from '@/lib/findableOffer';
import { isTownRefusal, townRefusalWords } from '@/lib/townRefusal';
import {
  checkRecheckQuestions, recheckDraftQuestions, recheckExpectedAnswers, recheckLabel, recheckSkipReason,
  RECHECK_AUDIT_PURPOSE, RECHECK_QUESTIONS, RECHECK_REPLACED_LABEL, RECHECK_RUNS,
} from '@/lib/prospectRecheck';
import { cn } from '@/lib/utils';

/* ══ FIX THE DETAILS, RE-CHECK (Paul, 2026-11-16; src/lib/prospectRecheck.ts) ═════════════════════════════════════
   On a call the rep learns the lead's details were wrong. Here they fix the trade, the areas served and the main services
   (lead_set_details + lead_set_profile: both roles, own leads only; each save writes a History line with who and when),
   then press "Re-check now": three searches pre-filled from the details as they are NOW, editable, none naming the
   business, each asked 3 times on ChatGPT and Gemini (create-ai-audit purpose 'recheck'; prospecting budget). The result
   shows here and on its own report link. Earlier checks stay as they were and read "Replaced: details were wrong".
   Nothing is sent to the lead. ════════════════════════════════════════════════════════════════════════════════════ */

const CARD = 'rounded-xl border border-border/60 bg-card/60 p-3.5 shadow-sm';
const LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-foreground/70';
const splitLabels = (v: string) => v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const day = (ts: string) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
const when = (ts: string) => new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

interface LeadBits {
  id: string; business_name: string | null; search_keyword: string | null; category: string | null; derived_town: string | null;
  search_location: string | null; country: string | null; website: string | null; services_included: string[] | null;
  service_areas: string[] | null; campaign_id: string | null;
}

export function ProspectRecheckPanel({ leadId }: { leadId: string }) {
  const crm = useLeadCrmRow(leadId);
  const lead = (crm.data ?? null) as LeadBits | null;
  const website = lead?.website && !isAggregatorUrl(lead.website) ? lead.website : null;
  const recheck = useLeadRecheck(leadId, lead ? { website } : null);
  const activity = useLeadActivity(leadId);
  const team = useTeamDirectory();
  const style = useCampaignReportStyle(lead?.campaign_id ?? null);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ trade: '', areas: '', services: '' });
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [skip, setSkip] = useState<string | null>(null);

  const lastChange = useMemo(() => (activity.data ?? []).find((a) => a.kind === 'details_set') ?? null, [activity.data]);
  if (!lead) return null;

  const trade = (lead.search_keyword || lead.category || '').trim();
  const town = (lead.derived_town || lead.search_location || '').trim();
  const areas = (lead.service_areas ?? []).filter(Boolean);
  const services = (lead.services_included ?? []).filter(Boolean);
  const data = recheck.data;
  const running = data?.state?.kind === 'running';
  const checked = questions ? checkRecheckQuestions(questions, { businessName: lead.business_name ?? '', trade, town }) : null;
  const problem = checked && 'reason' in checked ? checked : null;
  const byName = lastChange?.actor_user_id ? team.byId.get(lastChange.actor_user_id)?.display_name ?? 'A teammate' : null;
  const none = <span className="italic text-muted-foreground/60">Not recorded yet</span>;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: leadCrmKey(leadId) });
    void qc.invalidateQueries({ queryKey: salesKeys.activity(leadId) });
    notifyLeadChanged(leadId);
  };

  const startEdit = () => { setF({ trade, areas: areas.join(', '), services: services.join(', ') }); setEditing(true); setQuestions(null); };

  /* One Save, two server functions (both ownership-checked, both write the History line that says who and when).
     Only what changed is sent: lead_set_profile leaves the address and website alone when they are not passed. */
  const save = async () => {
    const nextTrade = f.trade.trim();
    const nextAreas = splitLabels(f.areas);
    const nextServices = splitLabels(f.services);
    if (!nextTrade) { toast({ title: 'Add the trade', description: 'The re-check asks about this trade.', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      if (nextTrade !== trade) {
        const r = await leadRpc('lead_set_details', { _lead_id: leadId, _contact_name: null, _search_keyword: nextTrade, _search_location: null });
        if (!r.ok) { toast({ title: 'Not saved', description: refusalText(r.error), variant: 'destructive' }); return; }
      }
      if (!sameList(nextAreas, areas) || !sameList(nextServices, services)) {
        const r = await leadRpc('lead_set_profile', { _lead_id: leadId, _services: nextServices, _areas: nextAreas, _address: null, _website: null });
        if (!r.ok) { toast({ title: 'Not saved', description: refusalText(r.error), variant: 'destructive' }); return; }
      }
      qc.setQueryData(leadCrmKey(leadId), (row: unknown) => (row ? { ...(row as object), search_keyword: nextTrade, service_areas: nextAreas.length ? nextAreas : null, services_included: nextServices.length ? nextServices : null } : row));
      setEditing(false);
      toast({ title: 'Details saved', description: 'Press Re-check now to ask AI with the new details.' });
      refresh();
    } finally { setBusy(false); }
  };

  const draft = () => {
    setSkip(null);
    setQuestions(recheckDraftQuestions({ trade, town, areas, services }));
  };

  const run = async () => {
    if (!checked?.ok) return;
    setBusy(true); setSkip(null);
    try {
      const body = {
        purpose: RECHECK_AUDIT_PURPOSE, lead_id: leadId, business_name: lead.business_name, business_type: trade, location_text: town,
        country: lead.country ?? null, website: website ?? undefined, has_website: !!website, questions: checked.questions,
        ...(services.length ? { specialisms: services.join(', ') } : {}), ...(areas.length ? { service_areas: areas } : {}),
      };
      const res = await invokeEdge<{ ok: boolean; error?: string; detail?: string; already_running?: boolean }>('create-ai-audit', body);
      if (!res?.ok) {
        const why = recheckSkipReason(res?.error, res?.detail);
        if (why) { setSkip(why); return; }
        toast({ title: "Couldn't start the re-check", description: res?.detail ?? res?.error ?? 'Try again', variant: 'destructive' });
        return;
      }
      setQuestions(null);
      await Promise.all([qc.invalidateQueries({ queryKey: leadRecheckKey(leadId) }), qc.invalidateQueries({ queryKey: hookVisibilityQueryKey(leadId) })]);
      refresh();
      toast(res.already_running
        ? { title: 'Already running', description: 'A check on this lead is still asking AI, so nothing new was started.' }
        : { title: 'Re-check started', description: `${RECHECK_QUESTIONS} searches, asked ${RECHECK_RUNS} times each. The result shows here in a few minutes. Nothing is sent to the lead.` });
    } catch (e) {
      const code = (e as { code?: string })?.code ?? '';
      const why = recheckSkipReason(code, (e as { detail?: string })?.detail ?? null);
      if (why) { setSkip(why); return; }
      if (isTownRefusal(`${code} ${edgeErrorMessage(e, '')}`)) { setSkip(`${townRefusalWords(town).headline}. ${townRefusalWords(town).detail}`); return; }
      toast({ title: "Couldn't start the re-check", description: edgeErrorMessage(e, 'Try again'), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const linkOf = (a: RecheckAuditRow) => (a.short_code ? reportLinkFor(a.short_code, style) : `${REPORT_PUBLIC_ORIGIN}/report/${a.id}`);
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast({ title: 'Report link copied' }); } catch { toast({ title: "Couldn't copy", description: url }); }
  };

  return (
    <section className={cn(CARD, 'space-y-3')} data-testid="prospect-recheck">
      {/* ── The details the re-check asks about ── */}
      <div className="flex items-center justify-between gap-2">
        <span className={LABEL}>Business details</span>
        {!editing && <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={startEdit} data-testid="recheck-edit"><Pencil className="h-3.5 w-3.5" />Fix details</Button>}
      </div>
      {!editing ? (
        <ul className="grid gap-1 text-xs">
          <li className="flex gap-2"><span className="w-28 shrink-0 text-muted-foreground">Trade</span><span className="min-w-0">{trade || none}</span></li>
          <li className="flex gap-2"><span className="w-28 shrink-0 text-muted-foreground">Areas served</span><span className="min-w-0">{areas.length ? areas.join(', ') : town ? <>{town} <span className="text-muted-foreground">(town only)</span></> : none}</span></li>
          <li className="flex gap-2"><span className="w-28 shrink-0 text-muted-foreground">Main services</span><span className="min-w-0">{services.length ? services.join(', ') : none}</span></li>
          {lastChange && <li className="pt-0.5 text-[11px] text-muted-foreground" data-testid="recheck-changed-by">Changed by {byName} · {when(lastChange.created_at)}</li>}
        </ul>
      ) : (
        <div className="grid gap-2" data-testid="recheck-edit-form">
          <label className="text-[11px] text-muted-foreground">Trade (what they actually are)
            <Input className="mt-1 h-9 text-sm" value={f.trade} maxLength={200} onChange={(e) => setF({ ...f, trade: e.target.value })} placeholder="e.g. mechanic" aria-label="Trade" />
          </label>
          <label className="text-[11px] text-muted-foreground">Areas served (comma separated)
            <Input className="mt-1 h-9 text-sm" value={f.areas} onChange={(e) => setF({ ...f, areas: e.target.value })} placeholder="e.g. Wakefield, Ossett, Horbury" aria-label="Areas served" />
          </label>
          <label className="text-[11px] text-muted-foreground">Main services (comma separated)
            <Input className="mt-1 h-9 text-sm" value={f.services} onChange={(e) => setF({ ...f, services: e.target.value })} placeholder="e.g. MOT, servicing, clutch repair" aria-label="Main services" />
          </label>
          <p className="text-[11px] text-muted-foreground">Saved on the lead with your name and the time. Only what the owner told you.</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" className="h-8 gap-1 text-xs" disabled={busy} onClick={() => void save()} data-testid="recheck-save">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Save details
            </Button>
          </div>
        </div>
      )}

      {/* ── Re-check now: three searches from the details as they are now, editable ── */}
      {!editing && !questions && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2.5">
          <span className="text-[11px] text-muted-foreground">Details were wrong? Fix them, then ask AI again.</span>
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={busy || running || !trade || !town} onClick={draft} data-testid="recheck-now"
            title={!trade || !town ? 'Add the trade (and the town) first' : running ? 'A re-check is still asking AI' : undefined}>
            <RefreshCw className="h-3.5 w-3.5" />Re-check now
          </Button>
        </div>
      )}
      {questions && (
        <div className="space-y-2 border-t border-border/50 pt-2.5" data-testid="recheck-questions">
          <div className={LABEL}>The {RECHECK_QUESTIONS} searches — edit any of them</div>
          {questions.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-4 shrink-0 text-right text-xs text-muted-foreground">{i + 1}</span>
              <Input value={q} maxLength={240} aria-label={`Search ${i + 1}`} data-testid={`recheck-question-${i + 1}`}
                className={cn('h-9 text-sm', problem && problem.index === i && 'border-orange-500')}
                onChange={(e) => { const v = e.target.value; setQuestions((prev) => (prev ? prev.map((p, j) => (j === i ? v : p)) : prev)); }} />
            </div>
          ))}
          {problem && <p className="text-[11px] text-orange-600 dark:text-orange-400" data-testid="recheck-question-problem">{problem.reason}</p>}
          <p className="text-[11px] text-muted-foreground">
            Each search is asked {RECHECK_RUNS} times on ChatGPT and Gemini: {recheckExpectedAnswers()} answers, judged by the same rules as every audit. Counts against today&rsquo;s checking budget. Nothing is sent to the lead.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={busy} onClick={() => setQuestions(null)}>Cancel</Button>
            <Button size="sm" className="h-8 gap-1 text-xs" disabled={busy || !checked?.ok} onClick={() => void run()} data-testid="recheck-run">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Run re-check
            </Button>
          </div>
        </div>
      )}
      {skip && <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-300" data-testid="recheck-skip">{skip}</p>}

      {/* ── The newest re-check ── */}
      {data?.latest && (
        <div className="space-y-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-2.5" data-testid="recheck-result">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="text-xs font-semibold text-foreground">{recheckLabel(RECHECK_QUESTIONS, Number(data.latest.baseline_target_runs ?? RECHECK_RUNS) || RECHECK_RUNS)}</span>
            <span className="text-[11px] text-muted-foreground">{day(data.latest.created_at)}</span>
          </div>
          {data.latest.business_type && <div className="text-[11px] text-muted-foreground">Asked as: {data.latest.business_type}{data.latest.location_text ? ` · ${data.latest.location_text}` : ''}</div>}
          {data.state?.kind === 'running' && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Asking AI… {data.state.runsDone} of {data.state.runsTarget} rounds done</div>
          )}
          {data.state?.kind === 'skipped' && <p className="text-xs text-amber-700 dark:text-amber-300" data-testid="recheck-result-skip">{data.state.reason}</p>}
          {data.state?.kind === 'done' && (
            data.state.summary?.incomplete
              ? <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Audit incomplete — {data.state.summary.incomplete.unmeasured} of {data.state.summary.incomplete.answers} answers couldn&rsquo;t be read, so no figures yet.</p>
              : data.state.summary?.split
                ? <p className="text-xs text-foreground" data-testid="recheck-split">{splitLine(data.state.summary.split)}{data.state.summary.split.unmeasured ? ` · Couldn’t measure ${data.state.summary.split.unmeasured}` : ''}</p>
                : <p className="text-xs text-muted-foreground">No result to show.</p>
          )}
          {data.state?.kind === 'done' && data.state.summary && data.state.summary.pct !== null && !data.state.summary.incomplete && (
            <p className="text-[11px] text-muted-foreground">Named in {data.state.summary.named} of {data.state.summary.answers} answers.</p>
          )}
          {data.state?.kind !== 'skipped' && (
            <div className="flex flex-wrap gap-2 pt-0.5">
              <a href={`${linkOf(data.latest)}${linkOf(data.latest).includes('?') ? '&' : '?'}preview=1`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" data-testid="recheck-open-report"><ExternalLink className="h-3.5 w-3.5" />Open report</a>
              <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" onClick={() => void copy(linkOf(data.latest!))} data-testid="recheck-copy-link"><Copy className="h-3.5 w-3.5" />Copy link</button>
            </div>
          )}
        </div>
      )}

      {/* ── Earlier checks the re-check replaced: kept, never deleted; their links still open what they always showed ── */}
      {(data?.replaced.length ?? 0) > 0 && (
        <div className="space-y-1" data-testid="recheck-replaced">
          {data!.replaced.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-muted-foreground">
                {day(a.created_at)}{a.business_type ? ` · ${a.business_type}` : ''}{' '}
                <span className="ml-1 rounded border border-border px-1 py-px font-medium text-foreground/70">{RECHECK_REPLACED_LABEL}</span>
              </span>
              <a href={`${linkOf(a)}${linkOf(a).includes('?') ? '&' : '?'}preview=1`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Open old report</a>
            </div>
          ))}
        </div>
      )}
      {recheck.isError && <p className="text-[11px] text-destructive">Couldn&rsquo;t load the re-check. <button type="button" className="underline" onClick={() => void recheck.refetch()}>Try again</button></p>}
    </section>
  );
}
