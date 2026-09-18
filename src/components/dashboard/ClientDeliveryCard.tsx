import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BriefcaseBusiness, FileText, ExternalLink, ListChecks } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useClientPages } from '@/hooks/useClientPages';
import { DeliveryChecklistList } from '@/components/delivery/DeliveryChecklist';
import { checklistDone, defaultRemeasureDue, TICKABLE_ITEMS, type DeliveryChecklist } from '@/lib/deliveryCockpit';
import { currentTermsVerdict } from '@/lib/remeasureResults';
import type { OutreachLead } from '@/types/outreach';

/* ══ PAYING CLIENTS — what each one needs next (2026-09-13, Paul's brief) ═════════════════════
   The gap this closes: the Dashboard had no per-client view at all. Its "Deliver" task fires only
   for a paid lead with NO baseline audit, which none of the paying clients has, so the four of them
   were invisible on the one screen that is meant to say what to do next.

   ⛔ THE SAME LIST AS THE LEAD CARD'S COCKPIT, THROUGH THE SAME COMPONENT (DeliveryChecklistList),
   stored in the same place (outreach_leads.delivery_checklist), so a tick here is the tick there.
   Pages come from client_pages (one line per planned page); the week-four light is the lead's
   stored remeasure_due_date (or the +28 default from the baseline's date when none is stored).

   ⛔ THE DOOR TO THE BASELINE SCREEN IS HERE, and it goes through the POINTER (baseline_audit_id) —
   never "the newest audit", which is the full measure under the three-type model. A client with no
   pointer gets no link and says so; that is the Deliver task's territory.

   Paid = amount_paid > 0 (CLAUDE.md §6). Refunded clients are excluded and counted, not hidden. */

interface BaselineFact { id: string; created_at: string; baseline_completed_at: string | null; baseline_contract?: unknown }

const isPaid = (l: OutreachLead) => (Number(l.amount_paid) || 0) > 0;

export function ClientDeliveryCard({ leads, onChanged }: { leads: OutreachLead[]; onChanged: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const paying = useMemo(
    () => leads.filter((l) => isPaid(l) && !l.is_archived && l.status !== 'refunded')
      .sort((a, b) => (a.business_name ?? '').localeCompare(b.business_name ?? '')),
    [leads],
  );
  const refundedCount = useMemo(() => leads.filter((l) => isPaid(l) && !l.is_archived && l.status === 'refunded').length, [leads]);

  /* Both pointers: the baseline (for "baseline done") and the day-28 replay (for "results held" —
     a replay that has finished with no stamp on the lead is one the sender routed to a task). */
  const pointerIds = useMemo(
    () => [...new Set(paying.flatMap((l) => [l.baseline_audit_id, l.remeasure_audit_id]).filter((id): id is string => !!id))].sort(),
    [paying],
  );
  const baselines = useQuery({
    queryKey: ['client-baselines', user?.id ?? null, pointerIds.join(',')],
    enabled: !!user && pointerIds.length > 0,
    queryFn: async (): Promise<Record<string, BaselineFact>> => {
      const client = supabase as unknown as SupabaseClient;
      const { data, error } = await client.from('ai_audits').select('id, created_at, baseline_completed_at, baseline_contract').in('id', pointerIds);
      if (error) throw error;
      return Object.fromEntries(((data ?? []) as BaselineFact[]).map((b) => [b.id, b]));
    },
  });

  const leadIds = useMemo(() => paying.map((l) => l.id), [paying]);
  const { pages, isLoading: pagesLoading, setPageBuilt } = useClientPages(leadIds);

  /* Optimistic ticks until the Dashboard's refetch lands (its metrics query owns the leads). */
  const [local, setLocal] = useState<Record<string, DeliveryChecklist>>({});
  const checklistFor = (l: OutreachLead): DeliveryChecklist => local[l.id] ?? ((l.delivery_checklist as DeliveryChecklist) ?? {});

  const toggle = async (l: OutreachLead, key: string) => {
    const cur = checklistFor(l);
    const next = { ...cur, [key]: !cur[key] };
    setLocal((m) => ({ ...m, [l.id]: next }));
    const { error } = await supabase.from('outreach_leads').update({ delivery_checklist: next } as never).eq('id', l.id);
    if (error) {
      setLocal((m) => ({ ...m, [l.id]: cur }));
      toast({ title: 'Could not save the tick', description: error.message, variant: 'destructive' });
      return;
    }
    onChanged();
  };

  const togglePage = async (pageId: string, built: boolean) => {
    const err = await setPageBuilt(pageId, built);
    if (err) toast({ title: 'Could not update the page', description: err, variant: 'destructive' });
  };

  return (
    <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <CardTitle className="flex items-center gap-2 text-xs sm:text-sm font-medium text-muted-foreground">
          <BriefcaseBusiness className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500" />
          <span className="truncate">Paying clients</span>
          <span className="ml-auto text-[11px] font-normal">
            {paying.length} paying{refundedCount ? ` · ${refundedCount} refunded (not shown)` : ''}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        {paying.length === 0 && (
          <p className="border-t border-border/50 pt-3 text-xs text-muted-foreground">No paying clients yet.</p>
        )}
        {paying.map((l) => {
          const cl = checklistFor(l);
          const technicalFixes = Array.isArray((cl as Record<string, unknown>).technical_fixes)
            ? ((cl as Record<string, unknown>).technical_fixes as unknown[])
            : [];
          const b = l.baseline_audit_id ? baselines.data?.[l.baseline_audit_id] ?? null : null;
          const baselineDate = b?.created_at ? b.created_at.slice(0, 10) : null;
          const due = l.remeasure_due_date ?? (baselineDate ? defaultRemeasureDue(baselineDate) : null);
          const terms = currentTermsVerdict({
            contract: b?.baseline_contract ?? null,
            amountPaid: l.amount_paid,
            baselineFrozenAt: b?.baseline_completed_at ?? null,
            remeasureDueDate: l.remeasure_due_date,
          });
          const clientPages = (pages ?? []).filter((p) => p.lead_id === l.id);
          const done = checklistDone(cl);
          const town = l.derived_town || l.search_location || null;
          return (
            <div key={l.id} className="rounded-lg border border-border/60 bg-background/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{l.business_name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {town ? `${town} · ` : ''}paid £{Number(l.amount_paid).toFixed(2)}{l.payment_date ? ` on ${new Date(l.payment_date).toLocaleDateString('en-GB')}` : ''}
                    {' · '}{done}/{TICKABLE_ITEMS.length} done
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {l.baseline_audit_id ? (
                    <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                      {/* The operator's Baseline screen, through the pointer. Carries where it came
                          from so BackLink returns here (the house pattern for /baseline/:auditId). */}
                      <Link to={`/baseline/${l.baseline_audit_id}`} state={{ from: '/dashboard', fromLabel: 'Dashboard' }}>
                        <FileText className="mr-1 h-3.5 w-3.5" /> Baseline
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                      <Link to={`/baseline-setup/${l.id}`} state={{ from: '/dashboard', fromLabel: 'Dashboard' }}>
                        <FileText className="mr-1 h-3.5 w-3.5" /> Needs Baseline
                      </Link>
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate('/outreach', { state: { launch: { leadId: l.id, channel: 'open' } } })}>
                    <ExternalLink className="mr-1 h-3.5 w-3.5" /> Lead card
                  </Button>
                  <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                    <Link to="/page-plan"><ListChecks className="mr-1 h-3.5 w-3.5" /> Page plan</Link>
                  </Button>
                  {technicalFixes.length > 0 && <span className="text-[11px] text-amber-600">{technicalFixes.length} technical fix{technicalFixes.length === 1 ? '' : 'es'}</span>}
                </div>
              </div>
              <div className="mt-2">
                <DeliveryChecklistList
                  compact
                  checklist={cl}
                  onToggle={(key) => void toggle(l, key)}
                  pages={pages === null ? null : clientPages}
                  pagesLoading={pagesLoading}
                  onTogglePage={(id, built) => void togglePage(id, built)}
                  remeasure={{ dueISO: due, fired: !!l.remeasure_audit_id }}
                  results={{
                    sentAt: l.remeasure_results_sent_at ?? null,
                    // Held = the replay has finalised and nothing was stamped: the sender routed it to a task.
                    held: !l.remeasure_results_sent_at && !!(l.remeasure_audit_id && baselines.data?.[l.remeasure_audit_id]?.baseline_completed_at),
                    /* ⛔ THE SAME PREDICATE THE SENDER USES, read from rows this card already has:
                       the lead carries the amount and the due date, and the baseline read carries
                       the contract. No extra request, and no second copy of the rule — the card
                       cannot say "will send" about a client the server will refuse. */
                    legacyTerms: terms.current === true ? null : terms.reason,
                  }}
                  baselineDone={!!b?.baseline_completed_at}
                  baselineDoneLabel={b?.baseline_completed_at ? new Date(b.baseline_completed_at).toLocaleDateString('en-GB') : null}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
