import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusiness, Clock, Lock, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import { useLeadActivity, useTeamDirectory, salesKeys } from '@/hooks/useSalesCrm';
import { hookVisibilityQueryKey, useHookVisibility } from '@/hooks/useHookVisibility';
import { HookVisibilityCard } from '@/components/HookVisibilityCard';
import { LeadOwnerControl } from '@/components/LeadOwnerControl';
import { OwnerAvatar } from '@/components/OwnerBadge';
import { leadRpc, type RpcResult } from '@/lib/leadRpc';
import { leadSourceFor } from '@/lib/outreachLeadColumns';
import { isAggregatorUrl } from '@/lib/aggregators';
import { OUTREACH_HOOK_QUESTIONS } from '@/lib/auditQuestionCounts';
import { ACTIVITY_LABEL, CALL_OUTCOMES, NEXT_ACTION_OPTIONS, WEBSITE_CONTROL_OPTIONS, refusalText } from '@/lib/salesCrm';
import { cn } from '@/lib/utils';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE LEAD'S CRM — ONE PANEL, BOTH ROLES (2026-09-27, Paul: "one primary CRM workflow").

   What the retired My Leads lead page (/sales/lead/:id) held, moved into the normal lead detail that
   Outreach and the Inbox both open: owner, next action + follow-up note, call booked, call outcome,
   website control, internal notes, the activity timeline and the Hook Audit. Nothing was dropped and
   no history moved — every value lives where it always did (outreach_leads' CRM columns and
   lead_activity), read and written by the same functions.

   ⛔ EVERY WRITE IS A SERVER FUNCTION, FOR BOTH ROLES (lead_set_follow_up, lead_set_call_booked,
   lead_record_call, lead_set_website_control, lead_add_note; assign_lead for the owner). Each checks
   the role and — for a salesperson — that the lead is assigned to them and is not a client, and
   writes the activity row. The admin passes the same check for every lead, so both roles share one
   code path and one timeline.
   ⛔ Reads come from the caller's OWN source (leadSourceFor): a salesperson reads the sales_leads
   view, so a lead that is not theirs simply returns nothing here.
   ⛔ Internal notes are activity rows and are NEVER sent to the lead.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

// The view and the CRM columns are not in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const CRM_COLUMNS = 'id, business_name, search_keyword, category, derived_town, search_location, country, website, next_action, next_action_date, next_action_note, call_booked_at, website_control, website_control_note, assigned_to_user_id';

interface CrmRow {
  id: string; business_name: string | null; search_keyword: string | null; category: string | null;
  derived_town: string | null; search_location: string | null; country: string | null; website: string | null;
  next_action: string | null; next_action_date: string | null; next_action_note: string | null;
  call_booked_at: string | null; website_control: string | null; website_control_note: string | null;
  assigned_to_user_id: string | null;
}

export const leadCrmKey = (leadId: string) => ['lead-crm', leadId] as const;

const CARD = 'rounded-xl border border-border/60 bg-card/60 p-3.5 shadow-sm';

function fmt(ts: string) {
  return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LeadCrmPanel({ leadId }: { leadId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { role } = useSubscription();
  const team = useTeamDirectory();
  const activity = useLeadActivity(leadId);
  const src = leadSourceFor(role);
  const crm = useQuery({
    queryKey: leadCrmKey(leadId),
    queryFn: async () => {
      const { data, error } = await sb.from(src.table).select(CRM_COLUMNS).eq('id', leadId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as CrmRow | null;
    },
  });
  const hookQ = useHookVisibility(leadId);
  const hook = hookQ.data;
  const [hookBusy, setHookBusy] = useState(false);
  const [note, setNote] = useState('');
  const [callOutcome, setCallOutcome] = useState('');
  const [callNote, setCallNote] = useState('');

  const lead = crm.data;
  if (crm.isLoading) return <section className={CARD}><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></section>;
  if (!lead) return null; // not readable by this caller → nothing to show (the server said so)

  const changed = () => {
    void qc.invalidateQueries({ queryKey: leadCrmKey(leadId) });
    void qc.invalidateQueries({ queryKey: salesKeys.activity(leadId) });
    window.dispatchEvent(new CustomEvent('lead-row-changed', { detail: { leadId } }));
  };
  const save = async (name: string, args: Record<string, unknown>, okText: string): Promise<RpcResult> => {
    const r = await leadRpc(name, { _lead_id: leadId, ...args });
    if (r.ok) { toast({ title: okText }); changed(); }
    else toast({ title: 'Not saved', description: refusalText(r.error), variant: 'destructive' });
    return r;
  };

  const runHook = async () => {
    const bizType = (hook?.audit?.business_type || lead.search_keyword || lead.category || '').trim();
    const loc = (hook?.audit?.location_text || lead.derived_town || lead.search_location || '').trim();
    if (!bizType || !loc) { toast({ title: 'Need a trade and a town', description: 'This lead has no trade or town to check.', variant: 'destructive' }); return; }
    if (!window.confirm(`Run an AI visibility check for ${lead.business_name}? Nothing is sent to the lead.`)) return;
    setHookBusy(true);
    try {
      const website = lead.website && !isAggregatorUrl(lead.website) ? lead.website : undefined;
      const { data, error } = await supabase.functions.invoke('create-ai-audit', {
        body: {
          lead_id: lead.id, business_name: lead.business_name, business_type: bizType, location_text: loc,
          country: lead.country ?? null, website, has_website: !!website, question_count: OUTREACH_HOOK_QUESTIONS,
          hook_audit: true, fresh_audit: true,
        },
      });
      if (error || !data?.ok) { toast({ title: "Couldn't start the check", description: data?.error ?? error?.message ?? 'Try again', variant: 'destructive' }); return; }
      await qc.invalidateQueries({ queryKey: hookVisibilityQueryKey(lead.id) });
      toast({ title: 'AI visibility check started', description: 'The result appears here in a few minutes.' });
    } finally { setHookBusy(false); }
  };

  const actorName = (id: string | null) => (id ? team.byId.get(id)?.display_name ?? 'Someone' : 'System');

  return (
    <div className="space-y-4">
      {/* Hook Audit — the one-lead AI visibility check and its evidence (rivals named, sources). The
          card shows once a check exists; before that, this is where it is started. */}
      <HookVisibilityCard leadId={lead.id} onRunNew={() => void runHook()} runNewBusy={hookBusy} />
      {!hookQ.isLoading && !hookQ.isError && !hook?.audit && (
        <section className={cn(CARD, 'flex flex-wrap items-center justify-between gap-2')}>
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">AI visibility check</span> — not run for this lead yet. It asks ChatGPT and Google AI the questions a customer would, and shows who they name instead.
          </div>
          <Button size="sm" className="h-7 gap-1 text-xs" disabled={hookBusy} onClick={() => void runHook()}>
            {hookBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Run AI visibility check
          </Button>
        </section>
      )}

      <section className={CARD}>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <BriefcaseBusiness className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">CRM</span>
          </div>
          {/* Owner: the admin reassigns here (assign_lead); a salesperson sees who owns it. */}
          <LeadOwnerControl leadId={lead.id} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FollowUp key={`${lead.next_action}|${lead.next_action_date}|${lead.next_action_note}`} lead={lead}
            onSave={(a) => save('lead_set_follow_up', { _next_action: a.nextAction, _date: a.date, _note: a.note }, 'Follow-up saved')} />

          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-muted-foreground">Call booked</label>
            <Input type="datetime-local" key={lead.call_booked_at ?? 'none'} className="h-8 text-xs"
              defaultValue={lead.call_booked_at ? toLocalInput(lead.call_booked_at) : ''}
              onBlur={async (e) => {
                const v = e.target.value ? new Date(e.target.value).toISOString() : null;
                if (v === (lead.call_booked_at ? new Date(lead.call_booked_at).toISOString() : null)) return;
                await save('lead_set_call_booked', { _at: v }, v ? 'Call booked' : 'Call cleared');
              }} />
            <label className="block pt-1 text-[11px] font-medium text-muted-foreground">Who controls the website?</label>
            <Select value={lead.website_control ?? ''} onValueChange={(v) => void save('lead_set_website_control', { _value: v, _note: lead.website_control_note }, 'Saved')}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Not asked yet" /></SelectTrigger>
              <SelectContent>{WEBSITE_CONTROL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input key={lead.website_control_note ?? ''} defaultValue={lead.website_control_note ?? ''} className="h-8 text-xs" placeholder="Detail, e.g. agency contract ends November"
              onBlur={async (e) => {
                const v = e.target.value.trim() || null;
                if (v === (lead.website_control_note ?? null)) return;
                await save('lead_set_website_control', { _value: lead.website_control, _note: v }, 'Saved');
              }} />
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-muted-foreground">Record a call</label>
            <Select value={callOutcome} onValueChange={setCallOutcome}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Outcome…" /></SelectTrigger>
              <SelectContent>{CALL_OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={callNote} onChange={(e) => setCallNote(e.target.value)} className="h-8 text-xs" placeholder="Note (optional)" />
            <Button size="sm" className="h-7 text-xs" disabled={!callOutcome} onClick={async () => {
              const r = await save('lead_record_call', { _outcome: callOutcome, _note: callNote.trim() || null }, 'Call recorded');
              if (r.ok) { setCallOutcome(''); setCallNote(''); }
            }}>Save call</Button>
          </div>

          <div className="space-y-2 rounded-lg border border-amber-500/40 p-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium"><Lock className="h-3 w-3" />Internal note <span className="text-[10px] uppercase tracking-wide text-amber-500">never sent</span></div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="resize-none text-xs" placeholder="Spoke to owner, agency runs the site, call again next month…" />
            <Button size="sm" className="h-7 text-xs" disabled={!note.trim()} onClick={async () => {
              const r = await save('lead_add_note', { _body: note }, 'Note added');
              if (r.ok) setNote('');
            }}>Add note</Button>
          </div>
        </div>
      </section>

      <section className={CARD}>
        <div className="mb-2 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-cyan-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">Notes &amp; activity</span>
        </div>
        <ul className="max-h-60 space-y-2 overflow-y-auto pr-1 text-xs thin-scrollbar">
          {(activity.data ?? []).map((a) => (
            <li key={a.id} className="flex gap-2">
              <OwnerAvatar name={actorName(a.actor_user_id)} avatarUrl={a.actor_user_id ? team.byId.get(a.actor_user_id)?.avatar_url : null} className="mt-0.5" />
              <div className="min-w-0">
                <div><span className="font-medium">{ACTIVITY_LABEL[a.kind] ?? a.kind}</span> <span className="text-muted-foreground">· {actorName(a.actor_user_id)} · {fmt(a.created_at)}</span></div>
                {a.kind === 'note' && <div className="whitespace-pre-wrap text-muted-foreground">{a.body}</div>}
                {a.kind === 'call_outcome' && <div className="text-muted-foreground">{CALL_OUTCOMES.find((o) => o.value === a.data?.outcome)?.label ?? String(a.data?.outcome ?? '')}{a.body ? ` — ${a.body}` : ''}</div>}
                {a.kind === 'stage_changed' && <div className="text-muted-foreground">{String(a.data?.from ?? '—')} → {String(a.data?.to ?? '—')}</div>}
                {a.kind === 'follow_up_set' && <div className="text-muted-foreground">{String(a.data?.next_action ?? '')}{a.data?.date ? ` on ${String(a.data.date)}` : ''}{a.data?.note ? ` — ${String(a.data.note)}` : ''}</div>}
                {a.kind === 'bulk_queued' && a.data?.template ? <div className="text-muted-foreground">{String(a.data.template)}</div> : null}
                {a.kind === 'archived_set' && <div className="text-muted-foreground">{a.data?.archived ? 'Archived' : 'Restored'}</div>}
                {a.kind === 'marked_interested' && <div className="text-muted-foreground">{a.data?.on === false ? 'Unstarred' : 'Starred'}</div>}
                {(a.kind === 'lead_assigned' || a.kind === 'lead_unassigned') && <div className="text-muted-foreground">{actorName((a.data?.from as string) ?? null)} → {a.data?.to ? actorName(a.data.to as string) : 'Unassigned'}</div>}
              </div>
            </li>
          ))}
          {(activity.data ?? []).length === 0 && <li className="text-muted-foreground/60">Nothing recorded yet.</li>}
        </ul>
      </section>
    </div>
  );
}

function FollowUp({ lead, onSave }: {
  lead: { next_action: string | null; next_action_date: string | null; next_action_note: string | null };
  onSave: (a: { nextAction: string; date: string | null; note: string | null }) => Promise<unknown>;
}) {
  const known = NEXT_ACTION_OPTIONS.some((o) => o.value === lead.next_action);
  const [nextAction, setNextAction] = useState(known ? lead.next_action ?? 'none' : (lead.next_action ?? 'none'));
  const [date, setDate] = useState(lead.next_action_date ?? '');
  const [note, setNote] = useState(lead.next_action_note ?? '');
  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-medium text-muted-foreground">Next action</label>
      <Select value={nextAction} onValueChange={setNextAction}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={lead.next_action ?? 'Nothing planned'} /></SelectTrigger>
        <SelectContent>
          {NEXT_ACTION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          {!known && lead.next_action ? <SelectItem value={lead.next_action}>{lead.next_action.replace(/_/g, ' ')}</SelectItem> : null}
        </SelectContent>
      </Select>
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn('h-8 text-xs', nextAction === 'none' && 'opacity-50')} disabled={nextAction === 'none'} />
      <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-8 text-xs" placeholder="Follow-up note, e.g. after their website contract ends" />
      <Button size="sm" className="h-7 text-xs" onClick={() => void onSave({ nextAction, date: nextAction === 'none' ? null : (date || null), note: note.trim() || null })}>Save follow-up</Button>
    </div>
  );
}
