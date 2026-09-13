import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarClock, FileText, ListChecks, HelpCircle, MessageCircle, ExternalLink, Loader2,
  Check, ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { normalizeWaNumber } from '@/hooks/useInbox';
import { REPORT_PUBLIC_ORIGIN } from '@/lib/findableOffer';
import { isDemoLead } from '@/lib/demoLeads';
import {
  DELIVERY_CHECKLIST_ITEMS, DELIVERY_REF_FIELDS, checklistDone, defaultRemeasureDue,
  remeasureStatus, type DeliveryChecklist,
} from '@/lib/deliveryCockpit';
import type { OutreachLead } from '@/types/outreach';
import { auditKind, isInternalMeasurement } from '@/lib/auditKind';

/* ============================================================
   THE CLIENT DELIVERY COCKPIT — everything I need on a client, at a glance (Paul's spec 2026-08-18).

   Rendered inside LeadDetailDialog, so BOTH Outreach and Inbox inherit it (one component). It
   resolves the lead's BASELINE audit on open (owner-RLS read of ai_audits) to build the key dates
   and the quick-launch links, and stores its own state — the re-measure due date, the 5-item
   checklist, the reference info — on outreach_leads via onUpdateLead (owner-RLS, no new endpoint).

   ⛔ NO SECRETS. The reference store is non-secret info only (login email, host, access notes); the
   UI says so. Passwords stay in a password manager — Postgres columns are readable via the service
   key/dashboard/backups.
   ============================================================ */

interface BaselineAudit { id: string; created_at: string; isBaseline: boolean }

export function LeadDeliveryCockpit({ lead, onUpdateLead, context, onClose }: {
  lead: OutreachLead;
  onUpdateLead: (leadId: string, updates: Partial<OutreachLead>) => Promise<OutreachLead | null> | void;
  context: 'outreach' | 'inbox';
  onClose: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();

  /* Resolve the lead's audit for dates + links.
     ⛔ THE POINTER FIRST, NEVER "THE NEWEST AUDIT WITH A RUN TARGET" (2026-09-13). That rule picked
     the newest multi-run audit, and under the three-type model the newest multi-run audit at day 0
     is the FULL MEASURE — so this cockpit pointed RG at his 26 Aug measurement instead of his 11 Aug
     baseline, and AD Locksmithing's "Baseline report" opened d3453511 under a /baseline/ URL. The
     lead's baseline_audit_id is claimed by trigger inside the baseline's own insert and is the one
     authoritative answer. Only a lead with NO pointer falls back — and then never to an internal
     measurement (isInternalMeasurement), so the "Client report" link below can never resolve to a
     document the public renderer refuses. */
  const [audit, setAudit] = useState<BaselineAudit | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [questionsOpen, setQuestionsOpen] = useState(false);

  useEffect(() => {
    if (isDemoLead(lead.id)) { setAuditLoading(false); return; }
    let alive = true;
    void (async () => {
      type Row = { id: string; created_at: string; baseline_target_runs: number | null; is_market: boolean | null; is_measurement: boolean | null; audit_purpose: string | null };
      // is_market / is_measurement / audit_purpose absent from generated types → through unknown.
      const { data } = await supabase
        .from('ai_audits')
        .select('id, created_at, baseline_target_runs, is_market, is_measurement, audit_purpose')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false }) as unknown as { data: Row[] | null };
      if (!alive) return;
      const rows = (data ?? []).filter((a) => a.is_market !== true && !isInternalMeasurement(a));
      const pointer = lead.baseline_audit_id ?? null;
      const pointed = pointer ? rows.find((a) => a.id === pointer) ?? null : null;
      // No pointer (a lead paid before the trigger existed, or unpaid): a recognised baseline by
      // kind, else the newest audit that is NOT an internal measurement.
      const chosen = pointed
        ?? rows.find((a) => auditKind(a) === 'paid_baseline' || auditKind(a) === 'multi_run_unmarked')
        ?? rows[0]
        ?? null;
      setAudit(chosen ? { id: chosen.id, created_at: chosen.created_at, isBaseline: !!pointed || chosen.baseline_target_runs != null } : null);
      setAuditLoading(false);
    })();
    return () => { alive = false; };
  }, [lead.id, lead.baseline_audit_id]);

  const loadQuestions = async () => {
    setQuestionsOpen((o) => !o);
    if (questions || !audit) return;
    // The saved set = the audit's latest run's queue rows, in order.
    const { data: runs } = await supabase
      .from('ai_audit_runs').select('id').eq('audit_id', audit.id)
      .order('run_number', { ascending: false }).limit(1);
    const runId = (runs ?? [])[0]?.id as string | undefined;
    if (!runId) { setQuestions([]); return; }
    const { data: q } = await supabase
      .from('ai_audit_queue').select('question').eq('run_id', runId).order('created_at', { ascending: true });
    setQuestions((q ?? []).map((r) => (r as { question: string }).question));
  };

  // ── KEY DATES ─────────────────────────────────────────────────────────────────────────────
  const baselineDate = audit?.created_at ? audit.created_at.slice(0, 10) : null;
  const remeasureDue = lead.remeasure_due_date ?? (baselineDate ? defaultRemeasureDue(baselineDate) : null);
  const rm = useMemo(() => remeasureStatus(remeasureDue, Date.now()), [remeasureDue]);
  const [dueOpen, setDueOpen] = useState(false);

  const rmTone =
    rm.state === 'red' ? 'border-red-500/50 bg-red-500/10 text-red-500'
    : rm.state === 'amber' ? 'border-amber-500/50 bg-amber-500/10 text-amber-600'
    : rm.state === 'ok' ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-600'
    : 'border-border/60 bg-muted/30 text-muted-foreground';

  const setRemeasureDue = (d: Date | undefined) => {
    setDueOpen(false);
    const iso = d ? format(d, 'yyyy-MM-dd') : null;
    if (iso !== (lead.remeasure_due_date ?? null)) void onUpdateLead(lead.id, { remeasure_due_date: iso } as Partial<OutreachLead>);
  };

  // ── CHECKLIST ─────────────────────────────────────────────────────────────────────────────
  const checklist: DeliveryChecklist = (lead.delivery_checklist as DeliveryChecklist) ?? {};
  const toggle = (key: string) =>
    void onUpdateLead(lead.id, { delivery_checklist: { ...checklist, [key]: !checklist[key] } } as Partial<OutreachLead>);

  // ── REFERENCE INFO ────────────────────────────────────────────────────────────────────────
  const ref = (lead.delivery_ref as Record<string, string>) ?? {};
  const [refDraft, setRefDraft] = useState<Record<string, string>>(ref);
  const saveRefField = (key: string) => {
    const next = { ...ref, [key]: (refDraft[key] ?? '').trim() };
    if ((next[key] ?? '') === (ref[key] ?? '')) return;
    if (!next[key]) delete next[key];
    void onUpdateLead(lead.id, { delivery_ref: next } as Partial<OutreachLead>);
  };

  // ── GO TO INBOX CONVERSATION (from Outreach only) ─────────────────────────────────────────
  const goToInbox = () => {
    const norm = user?.id && lead.phone ? normalizeWaNumber(lead.phone, lead.country) : null;
    if (!user?.id || !norm) return;
    onClose();
    navigate(`/inbox?c=${encodeURIComponent(`${user.id}::${norm}`)}`);
  };

  const CARD = 'rounded-xl border border-border/60 bg-card/60 p-3.5 shadow-sm';
  const clDone = checklistDone(checklist);

  return (
    <div className="space-y-4">
      {/* ══ KEY DATES — the guarantee clock, most visual weight. ══ */}
      <div className={`rounded-xl border p-3.5 ${rmTone}`}>
        <div className="flex items-center gap-1.5 mb-2">
          <CalendarClock className="h-3.5 w-3.5" />
          <span className="text-[11px] font-semibold uppercase tracking-wide">Key dates</span>
        </div>
        {auditLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> resolving baseline…</div>
        ) : !baselineDate ? (
          <p className="text-xs text-muted-foreground">No baseline audit yet — dates appear once a baseline has run.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Baseline taken</div>
              <div className="font-semibold text-foreground">{format(new Date(`${baselineDate}T00:00:00`), 'd MMM yyyy')}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Re-measure due (8 wks)</div>
              <Popover open={dueOpen} onOpenChange={setDueOpen}>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-1.5 font-semibold hover:underline">
                    {remeasureDue ? format(new Date(`${remeasureDue}T00:00:00`), 'd MMM yyyy') : 'set date'}
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide border border-current/30">{rm.label}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={remeasureDue ? new Date(`${remeasureDue}T00:00:00`) : undefined} onSelect={setRemeasureDue} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}
      </div>

      {/* ══ QUICK LAUNCH ══ */}
      <section className={CARD}>
        <div className="flex items-center gap-1.5 mb-2.5">
          <ExternalLink className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quick launch</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {audit ? (
            <>
              <Link to={`/baseline/${audit.id}`} state={{ from: context === 'inbox' ? '/inbox' : '/outreach', fromLabel: context === 'inbox' ? 'Inbox' : 'Outreach' }} onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20">
                <FileText className="h-3.5 w-3.5" /> Baseline report
              </Link>
              <button onClick={() => void loadQuestions()}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-semibold text-foreground/80 hover:bg-muted/60">
                <HelpCircle className="h-3.5 w-3.5" /> Audit questions
              </button>
              <a href={`${REPORT_PUBLIC_ORIGIN}/report/${audit.id}`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-semibold text-foreground/80 hover:bg-muted/60">
                <ExternalLink className="h-3.5 w-3.5" /> Client report
              </a>
              {/* ⛔ PLAYBOOK BY AUDIT ID, NOT LEAD ID (fixed 2026-08-18). usePlaybook resolves the
                  :id AUDIT-first; a lead id fails that lookup and loads a degraded, audit-less
                  playbook — the "weird load". audit.id resolves cleanly, exactly like the Baseline
                  report and the AiAudit page's own Playbook button. Lives inside the audit block for
                  the same reason: no audit, no playbook to build. */}
              <Link to={`/playbook/${audit.id}`} state={{ from: context === 'inbox' ? '/inbox' : '/outreach', fromLabel: context === 'inbox' ? 'Inbox' : 'Outreach' }} onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-semibold text-foreground/80 hover:bg-muted/60">
                <ClipboardList className="h-3.5 w-3.5" /> Playbook
              </Link>
            </>
          ) : !auditLoading ? (
            <span className="text-xs italic text-muted-foreground/70">No audit yet — baseline links appear once one has run.</span>
          ) : null}
          {/* Go to Inbox conversation — only meaningful from Outreach (from Inbox you're already here). */}
          {context === 'outreach' && lead.phone && (
            <button onClick={goToInbox}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-semibold text-foreground/80 hover:bg-muted/60">
              <MessageCircle className="h-3.5 w-3.5" /> Go to Inbox conversation
            </button>
          )}
        </div>
        {questionsOpen && (
          <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-2.5 text-xs">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Saved audit questions</div>
            {questions === null ? (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> loading…</div>
            ) : questions.length === 0 ? (
              <div className="text-muted-foreground/70 italic">No saved questions found.</div>
            ) : (
              <ol className="list-decimal pl-4 space-y-0.5 text-foreground/85">{questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
            )}
          </div>
        )}
      </section>

      {/* ══ DELIVERY CHECKLIST — 5 manual milestones ══ */}
      <section className={CARD}>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5">
            <ListChecks className="h-3.5 w-3.5 text-sky-400" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Delivery</span>
          </div>
          <span className="text-[11px] font-medium text-muted-foreground">{clDone}/{DELIVERY_CHECKLIST_ITEMS.length} done</span>
        </div>
        <div className="space-y-1.5">
          {DELIVERY_CHECKLIST_ITEMS.map((item) => {
            const on = checklist[item.key] === true;
            return (
              <button key={item.key} onClick={() => toggle(item.key)}
                className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted/40"
                title={item.hint}>
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border'}`}>
                  {on && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span>
                  <span className={`text-xs font-medium ${on ? 'text-foreground' : 'text-foreground/80'}`}>{item.label}</span>
                  <span className="block text-[10.5px] text-muted-foreground/70">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ══ REFERENCE INFO — non-secret only ══ */}
      <section className={CARD}>
        <div className="flex items-center gap-1.5 mb-1">
          <ClipboardList className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Delivery reference</span>
        </div>
        <p className="mb-2.5 text-[10.5px] text-amber-600/90">Reference only — never paste passwords here. Keep real passwords in your password manager.</p>
        <div className="space-y-2">
          {DELIVERY_REF_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{f.label}</label>
              <Input
                value={refDraft[f.key] ?? ''}
                onChange={(e) => setRefDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                onBlur={() => saveRefField(f.key)}
                placeholder={f.placeholder}
                className="h-7 text-xs"
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
