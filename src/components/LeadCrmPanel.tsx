import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusiness, CalendarClock, Megaphone, Check, ChevronDown, Clock, Globe, Link2, Lock, Loader2, PhoneCall, RefreshCw, Sparkles, UserMinus, X } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { leadPermissions } from '@/lib/access';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import { useLeadActivity, useTeamDirectory } from '@/hooks/useSalesCrm';
import { hookVisibilityQueryKey, useHookVisibility } from '@/hooks/useHookVisibility';
import { useOnboardingLink } from '@/hooks/useOnboardingLink';
import { reportShareKey, useReportShare } from '@/hooks/useReportShare';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { REPORT_CHANNEL_LABEL, REPORT_SEND_CHANNELS } from '@/lib/reportShare';
import { HookVisibilityCard } from '@/components/HookVisibilityCard';
import { CampaignPicker } from '@/components/CampaignPicker';
import { useCampaigns } from '@/hooks/useCampaigns';
import { callBookedSummaryOf } from '@/lib/workspaceHeader';
import { OwnerAvatar } from '@/components/OwnerBadge';
import { leadRpc, salesRemoveLeads, type RpcResult } from '@/lib/leadRpc';
import { leadSourceFor } from '@/lib/outreachLeadColumns';
import { notifyLeadChanged } from '@/lib/leadSync';
import { isAggregatorUrl } from '@/lib/aggregators';
import { OUTREACH_HOOK_QUESTIONS } from '@/lib/auditQuestionCounts';
import { reviewedHookQuestions } from '@/lib/hookQuestionEdit';
import { OUTREACH_AUDIT_MAP_ROOT } from '@/lib/outreachAuditMap';
import { LINK_CHANNEL_LABEL } from '@/lib/onboardingLinkStatus';
import { ACTIVITY_LABEL, NEXT_ACTION_OPTIONS, REMOVE_FROM_MY_LEADS_EXPLAINER, REMOVE_FROM_MY_LEADS_LABEL, WEBSITE_CONTROL_OPTIONS, activityDetail, outcomesFor, refusalText, removeOutcomeText } from '@/lib/salesCrm';
import { CONTACT_METHODS, SOCIAL_CONTACT_METHODS, contactMethodLabel } from '@/lib/contactMethods';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { DOMAIN_CONTROL_OPTIONS, SALES_DOMAIN_LINE } from '@/lib/domainAuthority';
import { meetingWhen, lastLoggedContactOf, offeredOutcomes, outcomeLabel, outcomeRule, salesStateOf, stateChangeText, stateChangedWords, suggestNextAction, LOGGED_CONTACT_KINDS, type SalesStateView } from '@/lib/leadState';
import { applyOutcome } from '@/lib/leadOutcome';
import { NextActionForm, londonDayPlus, type NextActionPreset } from '@/components/NextActionForm';
import { bookMeeting, saveNextAction, type WriteResult } from '@/lib/nextActionWrite';
import { londonInstant, londonLocalInput } from '@/lib/nextActionView';
import { SalesStatePill } from '@/components/SalesStatePill';
import { WorkSection } from '@/components/WorkSection';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE LEAD'S CRM — THREE PANELS, BOTH ROLES, BOTH PAGES (2026-09-27; split into the prospect
   workspace's tabs 2026-09-28).

   LeadWorkPanel    — log a contact (call / LinkedIn / email / in person / other, one tap per outcome),
                      next action + date (quick chips, clear), internal note, call booked, website control.
   LeadHookPanel    — the Hook Audit card, or the button that runs it.
   LeadHistoryPanel — the activity timeline, with sign-up link sends/opens merged in.
   LeadCrmPanel     — all three stacked, for any caller that wants the old single panel.

   ⛔ EVERY WRITE IS A SERVER FUNCTION, FOR BOTH ROLES (lead_log_contact, lead_set_follow_up,
   lead_set_call_booked, lead_set_website_control, lead_add_note; assign_lead for the owner). Each
   checks the role and — for a salesperson — that the lead is assigned to them and is not a client,
   and writes the activity row. After a yes, ONE notice (notifyLeadChanged): the Inbox, Outreach and
   these panels all re-read the same row. No local copy is edited in place.
   ⛔ An outcome is written as ACTIVITY (lead_log_contact never writes a status or a next action).
   What else a tap does is THE ONE RULE, src/lib/leadState.ts (outcomePlan / suggestNextAction),
   carried out by src/lib/leadOutcome.ts for both roles and shown in the result line under the buttons
   — the state before → after, and the Next Action it suggests (lead state audit, 2026-09-30; Paul:
   "no toast-only actions"). In short:
     No answer / Left voicemail / Sent / Spoke to owner → the record itself (the lead reads Contacted if
       it was New) + a suggested Next Action pre-filled below;
     Interested → the star; Meeting booked → the star + asks when (call_booked_at) and sets the Next
       Action "Meeting" on that day in the same Save;
     Call back → asks which day: the Next Action "Call" cannot be saved without one;
     Not interested → status Not interested, the queue stopped, the Next Action cleared;
     Wrong number → the number suppressed (contact_suppressions).
   Suggestions are PRE-FILLED, never saved: Next Action stays human-set only (Paul, 2026-09-28).
   ⛔ "Agency controls site" is an ATTRIBUTE, not an outcome: the "Agency runs their site" chip sets
   website_control and logs no contact.
   ⛔ Reads come from the caller's OWN source (leadSourceFor): a salesperson reads the sales_leads
   view, so a lead that is not theirs simply returns nothing here.
   ⛔ Internal notes are activity rows and are NEVER sent to the lead.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

// The view and the CRM columns are not in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/* status / is_potential_work / amount_paid / whatsapp_sent_at (2026-09-30): the facts the sales state
   is read from (src/lib/leadState.ts), so the Work panel knows the state before and after a tap. Both
   sources have them (the sales view's amount_paid is always null — a client is not in it at all). */
const CRM_COLUMNS = 'id, business_name, search_keyword, category, derived_town, search_location, country, website, next_action, next_action_date, next_action_time, next_action_note, call_booked_at, website_control, website_control_note, assigned_to_user_id, services_included, service_areas, address, domain_control, campaign_id, status, is_potential_work, amount_paid, whatsapp_sent_at';

interface CrmRow {
  id: string; business_name: string | null; search_keyword: string | null; category: string | null;
  derived_town: string | null; search_location: string | null; country: string | null; website: string | null;
  next_action: string | null; next_action_date: string | null; next_action_time: string | null; next_action_note: string | null;
  call_booked_at: string | null; website_control: string | null; website_control_note: string | null;
  assigned_to_user_id: string | null;
  services_included: string[] | null; service_areas: string[] | null; address: string | null;
  campaign_id: string | null;
  domain_control: string | null;
  status: string | null; is_potential_work: boolean | null; amount_paid: number | null; whatsapp_sent_at: string | null;
}

export const leadCrmKey = (leadId: string) => ['lead-crm', leadId] as const;
export const wrongNumberKey = (leadId: string) => ['lead-wrong-number', leadId] as const;

/** Is this lead's number marked Wrong number (the canonical contact_suppressions row, read through
 *  lead_wrong_number — the table itself has no browser policies)? */
export function useWrongNumber(leadId: string) {
  return useQuery({
    queryKey: wrongNumberKey(leadId),
    enabled: !!leadId,
    queryFn: async () => {
      const r = await leadRpc('lead_wrong_number', { _lead_id: leadId });
      if (!r.ok) throw new Error(String(r.error ?? 'lookup_failed'));
      return { wrong: r.wrong_number === true, at: typeof r.at === 'string' ? r.at : null };
    },
  });
}

const CARD = 'rounded-xl border border-border/60 bg-card/60 p-3.5 shadow-sm';
const LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-foreground/70';

function fmt(ts: string) {
  return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}
/* The day helpers moved with the form (src/components/NextActionForm.tsx); re-exported for old imports. */
export { londonDayPlus, QUICK_DATES } from '@/components/NextActionForm';

/** The lead's CRM columns, from the caller's own source. */
export function useLeadCrmRow(leadId: string) {
  const { role } = useSubscription();
  const src = leadSourceFor(role);
  return useQuery({
    queryKey: leadCrmKey(leadId),
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await sb.from(src.table).select(CRM_COLUMNS).eq('id', leadId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as CrmRow | null;
    },
  });
}

type SaveFn = (name: string, args: Record<string, unknown>, okText: string, patch?: Record<string, unknown>) => Promise<RpcResult>;

/* ⛔ INSTANT, AND THE DATABASE STILL WINS (2026-09-28). With a `patch` (the columns this save sets),
   the open panel shows the new values the moment Save is pressed; a refusal puts the old values back
   and says why. After the server's yes, the same values ride on the notice so Outreach, the Inbox and
   other tabs show them at once too, and every reader then re-reads the row as before. */
function useSave(leadId: string): SaveFn {
  const { toast } = useToast();
  const qc = useQueryClient();
  return async (name, args, okText, patch) => {
    const key = leadCrmKey(leadId);
    const before = patch ? qc.getQueryData<CrmRow | null>(key) : undefined;
    if (patch) {
      qc.setQueryData<CrmRow | null>(key, (row) => (row ? { ...row, ...patch } as CrmRow : row));
      notifyLeadChanged(leadId, undefined, patch, true); // Outreach, the Inbox, other tabs: at once
    }
    const r = await leadRpc(name, { _lead_id: leadId, ...args });
    if (r.ok) { toast({ title: okText }); notifyLeadChanged(leadId, undefined, patch); }
    else {
      if (patch) { qc.setQueryData(key, before ?? null); notifyLeadChanged(leadId); } // everyone re-reads the true row
      toast({ title: 'Not saved', description: refusalText(r.error), variant: 'destructive' });
    }
    return r;
  };
}

/* ── PROFILE: what the business genuinely does and where (2026-09-28) ──────────────────────────────
   Services and service areas the salesperson has actually learned (the call, their website, the
   referral), plus the address and website. Progressive — any field can be filled later. Saved through
   lead_set_profile (both roles, own leads only) into services_included / service_areas: the SAME
   columns the paid-client handoff, the baseline context and clientFacts read as "the client record",
   ranked under the client's own onboarding answers. Never copied anywhere else. */
const splitLabels = (v: string) => v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

export function ProspectProfilePanel({ leadId }: { leadId: string }) {
  const crm = useLeadCrmRow(leadId);
  const save = useSave(leadId);
  const lead = crm.data;
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ services: '', areas: '', address: '', website: '' });
  if (!lead) return null;
  const services = lead.services_included ?? [];
  const areas = lead.service_areas ?? [];
  const start = () => {
    setF({ services: services.join(', '), areas: areas.join(', '), address: lead.address ?? '', website: lead.website ?? '' });
    setEditing(true);
  };
  const submit = async () => {
    const next = { services: splitLabels(f.services), areas: splitLabels(f.areas), address: f.address.trim(), website: f.website.trim() };
    const r = await save('lead_set_profile', { _services: next.services, _areas: next.areas, _address: next.address, _website: next.website }, 'Profile saved', {
      services_included: next.services.length ? next.services : null, service_areas: next.areas.length ? next.areas : null,
      address: next.address || null, website: next.website || null,
    });
    if (r.ok) setEditing(false);
  };
  const none = <span className="italic text-muted-foreground/60">Not recorded yet</span>;
  return (
    <section className={cn(CARD, 'space-y-2')} data-testid="prospect-profile">
      <div className="flex items-center justify-between gap-2">
        <span className={LABEL}>Services and areas</span>
        {!editing && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={start}>{services.length || areas.length ? 'Edit' : 'Add'}</Button>}
      </div>
      {!editing ? (
        <ul className="grid gap-1 text-xs">
          <li><span className="inline-block w-24 text-muted-foreground">Services</span>{services.length ? services.join(', ') : none}</li>
          <li><span className="inline-block w-24 text-muted-foreground">Service areas</span>{areas.length ? areas.join(', ') : none}</li>
        </ul>
      ) : (
        <div className="grid gap-2">
          <label className="text-[11px] text-muted-foreground">Main services they genuinely offer (comma separated)
            <Textarea rows={2} className="mt-1 resize-none text-sm" value={f.services} onChange={(e) => setF((p) => ({ ...p, services: e.target.value }))} placeholder="e.g. boiler repair, bathroom fitting" />
          </label>
          <label className="text-[11px] text-muted-foreground">Towns / areas they genuinely serve (comma separated)
            <Input className="mt-1 h-9 text-sm" value={f.areas} onChange={(e) => setF((p) => ({ ...p, areas: e.target.value }))} placeholder="e.g. Wakefield, Ossett, Horbury" />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] text-muted-foreground">Address
              <Input className="mt-1 h-9 text-sm" value={f.address} onChange={(e) => setF((p) => ({ ...p, address: e.target.value }))} />
            </label>
            <label className="text-[11px] text-muted-foreground">Website
              <Input className="mt-1 h-9 text-sm" value={f.website} onChange={(e) => setF((p) => ({ ...p, website: e.target.value }))} placeholder="example.co.uk" />
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">Only what you actually know. The AI check builds its questions from these, and they go to Paul if the client signs up.</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" className="h-8 text-xs" onClick={() => void submit()}>Save</Button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ── WORK: what a salesperson does after picking up the phone ─────────────────────────────────── */
/** What a logged outcome did, for the result line under the buttons. */
export interface OutcomeResultLine { contact: string | null; state: SalesStateView; change: string | null; said: string[]; failed: string[]; suggestion: string | null }
type FollowOn = (outcome: string, channel: string, logged: boolean) => Promise<OutcomeResultLine>;
/** A Next Action the panel pre-fills after an outcome (never saved by itself). requireDate: Call back —
 *  Save stays off until a day is picked. `why` names the outcome that suggested it. */
type FollowUpPreset = NextActionPreset;

/** logContactOpen: the person came to log a contact (Outreach's Call) — Log a contact starts expanded.
 *  editNextRequested: the header's Next Action bar asked for the editor; taken, then cleared (onEditNextHandled). */
export function LeadWorkPanel({ leadId, onRemoved, logContactOpen = false, editNextRequested = false, onEditNextHandled }: { leadId: string; onRemoved?: () => void; logContactOpen?: boolean; editNextRequested?: boolean; onEditNextHandled?: () => void }) {
  const crm = useLeadCrmRow(leadId);
  const activity = useLeadActivity(leadId);
  const wrong = useWrongNumber(leadId);
  const save = useSave(leadId);
  const { role } = useSubscription();
  const lead = crm.data;
  const qc = useQueryClient();
  const [preset, setPreset] = useState<FollowUpPreset | null>(null);
  const [askWhen, setAskWhen] = useState(false);
  const { toast } = useToast();
  const nextRef = useRef<HTMLElement>(null);
  /* ⛔ THE EDITOR OPENS ON DEMAND (declutter pass, 2026-10-01): the header bar is the display of the Next Action;
     here the ONE editor (NextActionForm) opens when asked — Edit / Set one on the bar or here, or an outcome's
     suggestion (preset) — and closes after a Save. Never a second, independently editable copy. */
  const [editingNext, setEditingNext] = useState(false);
  useEffect(() => {
    if (!editNextRequested) return;
    setEditingNext(true);
    onEditNextHandled?.();
    requestAnimationFrame(() => nextRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editNextRequested]);
  if (crm.isLoading) return <section className={CARD}><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></section>;
  if (crm.isError) return <section className={cn(CARD, 'text-xs text-destructive')}>Could not load this lead's CRM details. Close and open it again.</section>;
  if (!lead) return null; // not readable by this caller → nothing to show (the server said so)

  const stateLead = () => {
    const last = lastLoggedContactOf(activity.data);
    return { ...lead, lastLogged: last ? { outcome: last.outcomeValue ?? '', at: last.at, reached: last.everReached } : null, wrongNumber: wrong.data?.wrong ?? null };
  };
  const scrollToNext = () => requestAnimationFrame(() => nextRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));

  /* The follow-on of one outcome (see the header): the ONE plan, carried out, then the suggestion
     pre-filled. `logged` = lead_log_contact already recorded the contact (false for a WhatsApp
     conversation's result — the messages are the record). */
  const followOn: FollowOn = async (outcome, channel, logged) => {
    const sl = stateLead();
    const before = salesStateOf(sl);
    const res = await applyOutcome(sl, outcome, before, logged);
    if (res.plan.suppressNumber) void qc.invalidateQueries({ queryKey: wrongNumberKey(leadId) });
    const sug = suggestNextAction(channel, outcome);
    let suggestion: string | null = null;
    if (res.plan.askMeeting) { setAskWhen(true); suggestion = 'Add when it is below — it also sets the Next Action “Meeting”'; }
    else if (sug) {
      setPreset({ nextAction: sug.nextAction, date: sug.days === null ? undefined : londonDayPlus(sug.days), note: sug.note, requireDate: sug.days === null && res.plan.askCallBackDay, why: outcomeLabel(outcome) });
      scrollToNext();
      const word = NEXT_ACTION_OPTIONS.find((o) => o.value === sug.nextAction)?.label ?? sug.nextAction;
      suggestion = sug.days === null
        ? (res.plan.askCallBackDay ? 'Pick the day to call back below, then Save' : `Next Action “${word}” is filled in below — pick a day and Save`)
        : `Next Action “${word} · ${sug.days === 0 ? 'today' : sug.days === 1 ? 'tomorrow' : `in ${sug.days} days`}” is filled in below — Save to keep it`;
    }
    return { contact: null, state: res.after, change: stateChangeText(before, res.after), said: res.said, failed: res.failed, suggestion };
  };

  /* ⛔ ONE NEXT-ACTION WRITE (src/lib/nextActionWrite.ts, 2026-10-02): this panel, the Outreach row and the phone
     card save through the same functions. The meeting: ONE Save writes the time (call_booked_at) and the Next
     Action "Meeting" on that day — a person pressed Save with both shown, so it is still human-set. */
  const afterWrite = (r: WriteResult, okText: string, before?: CrmRow | null) => {
    if (r.ok) { if (r.patch) qc.setQueryData<CrmRow | null>(leadCrmKey(leadId), (row) => (row ? { ...row, ...r.patch } as CrmRow : row)); toast({ title: okText }); }
    else { if (before !== undefined) qc.setQueryData(leadCrmKey(leadId), before); toast({ title: 'Not saved', description: refusalText(r.error), variant: 'destructive' }); }
    return r;
  };
  /* The open panel shows the chosen values the moment Save is pressed; a refusal puts the old ones back. */
  const showAtOnce = (patch: Record<string, unknown>) => {
    const before = qc.getQueryData<CrmRow | null>(leadCrmKey(leadId));
    qc.setQueryData<CrmRow | null>(leadCrmKey(leadId), (row) => (row ? { ...row, ...patch } as CrmRow : row));
    return before ?? null;
  };
  const saveMeeting = async (localValue: string, note: string | null = null) => {
    /* The typed value is UK time, as every screen shows it (londonInstant), whatever this computer's clock. */
    const iso = localValue ? londonInstant(localValue.slice(0, 10), localValue.slice(11, 16)) : null;
    if (!iso) return;
    const r = afterWrite(await bookMeeting(leadId, iso, note ?? lead.next_action_note, stateLead()), 'Meeting booked · Next Action set');
    if (r.ok) setAskWhen(false);
  };

  const agency = lead.website_control === 'agency_controls';
  return (
    <div className="space-y-3">
      <LogContact save={save} followOn={followOn} defaultOpen={logContactOpen} />

      {askWhen && (
        <section className={cn(CARD, 'flex flex-wrap items-end gap-2 border-blue-500/50')} data-testid="meeting-when">
          <label className="min-w-0 flex-1 text-[11px] font-medium text-muted-foreground">When is the call / meeting? (UK time)
            <Input type="datetime-local" className="mt-1 h-9 text-xs" id={`meeting-at-${lead.id}`} defaultValue={lead.call_booked_at ? londonLocalInput(lead.call_booked_at) : ''} />
          </label>
          <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setAskWhen(false)}>Later</Button>
          <Button size="sm" className="h-9 text-xs" data-testid="meeting-save" onClick={() => {
            const el = document.getElementById(`meeting-at-${lead.id}`) as HTMLInputElement | null;
            void saveMeeting(el?.value ?? '');
          }}>Save meeting</Button>
          <p className="w-full text-[11px] text-muted-foreground">Shows as “Meeting booked” with the time, and sets the Next Action “Meeting” on that day.</p>
        </section>
      )}

      {/* ⛔ AN ATTRIBUTE, NOT AN OUTCOME: who runs their site changes how it is sold, whatever the call's
          outcome was. One tap here; the full choice stays under "Call booked · who controls the website". */}
      <section className={cn(CARD, 'flex flex-wrap items-center justify-between gap-2 py-2.5')} data-testid="learned-agency">
        <span className="text-xs text-muted-foreground">Learned on the call</span>
        <button type="button" data-testid="agency-chip" aria-pressed={agency}
          className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium', agency ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-border/60 text-muted-foreground hover:bg-muted')}
          onClick={() => void save('lead_set_website_control', { _value: agency ? 'unknown' : 'agency_controls', _note: lead.website_control_note }, agency ? 'Website control: unknown' : 'Saved: an agency runs their site', { website_control: agency ? 'unknown' : 'agency_controls' })}>
          <Globe className="h-3 w-3" />{agency ? 'Agency runs their site ✓' : 'Agency runs their site'}
        </button>
      </section>

      <section className={cn(CARD, preset && 'border-amber-500/50', !(editingNext || preset) && 'py-2.5')} ref={nextRef} data-testid="next-action-section">
        {editingNext || preset ? (<>
          <div className="mb-2.5 flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-primary" /><span className={LABEL}>Next action</span>
            {!preset && <button type="button" className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setEditingNext(false)} data-testid="next-action-close">Close</button>}
          </div>
          <NextActionForm key={`${lead.next_action}|${lead.next_action_date}|${lead.next_action_time}|${lead.next_action_note}|${preset ? JSON.stringify(preset) : ''}`} lead={lead} preset={preset} onDismiss={() => setPreset(null)}
            onSave={async (a) => {
              const before = showAtOnce({ next_action: a.nextAction, next_action_date: a.nextAction === 'none' ? null : a.date, next_action_time: a.nextAction === 'none' || !a.date ? null : (a.time ?? null), next_action_note: a.note });
              const r = afterWrite(await saveNextAction(leadId, a, stateLead()), a.nextAction === 'none' ? 'Next action cleared' : a.nextAction === 'meeting' && a.time && a.date ? 'Meeting booked · Next Action set' : 'Next action saved', before);
              if (r.ok) { setPreset(null); setEditingNext(false); } return r; }} />
        </>) : (
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-primary" /><span className={LABEL}>Next action</span>
              <span className="text-[11px] text-muted-foreground">· shown at the top</span></span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingNext(true)} data-testid="next-action-open">
              {lead.next_action && lead.next_action !== 'none' ? 'Edit' : 'Set one'}
            </Button>
          </div>
        )}
      </section>

      <LeadCampaign lead={lead} save={save} />

      <InternalNote save={save} />

      {/* Folded to its summary (declutter pass 2): the booked time and who controls the site and domain. */}
      <WorkSection icon={BriefcaseBusiness} title="Call booked · website" testId="call-booked" summary={callBookedSummary(lead)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-muted-foreground">Call booked for (UK time)</label>
            <Input type="datetime-local" key={lead.call_booked_at ?? 'none'} className="h-9 text-xs"
              defaultValue={lead.call_booked_at ? londonLocalInput(lead.call_booked_at) : ''}
              onBlur={async (e) => {
                const v = e.target.value ? londonInstant(e.target.value.slice(0, 10), e.target.value.slice(11, 16)) : null;
                if (v === (lead.call_booked_at ? new Date(lead.call_booked_at).toISOString() : null)) return;
                await save('lead_set_call_booked', { _at: v }, v ? 'Call booked' : 'Call cleared', { call_booked_at: v });
              }} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-muted-foreground">Who controls the website?</label>
            <Select value={lead.website_control ?? ''} onValueChange={(v) => void save('lead_set_website_control', { _value: v, _note: lead.website_control_note }, 'Saved', { website_control: v })}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Not asked yet" /></SelectTrigger>
              <SelectContent>{WEBSITE_CONTROL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input key={lead.website_control_note ?? ''} defaultValue={lead.website_control_note ?? ''} className="h-9 text-xs" placeholder="Detail, e.g. agency contract ends November"
              onBlur={async (e) => {
                const v = e.target.value.trim() || null;
                if (v === (lead.website_control_note ?? null)) return;
                await save('lead_set_website_control', { _value: lead.website_control, _note: v }, 'Saved', { website_control_note: v });
              }} />
          </div>
          {/* ⛔ THE DOMAIN RULE (Paul, 2026-09-28): managed by an agency is usually fine; OWNED or controlled
              by someone else blocks a new site until the client gets control. Never legal advice, never
              "break your contract", never promise to take over a domain we do not control. What Sales
              records here is information for Paul; only the client's own confirmation at sign-up counts. */}
          <div className="space-y-1.5 sm:col-span-2" data-testid="domain-control">
            <label className="block text-[11px] font-medium text-muted-foreground">Who owns / controls the domain?</label>
            <Select value={lead.domain_control ?? ''} onValueChange={(v) => void save('lead_set_domain_control', { _value: v }, 'Saved', { domain_control: v })}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Not asked yet" /></SelectTrigger>
              <SelectContent>{DOMAIN_CONTROL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            {(() => { const o = DOMAIN_CONTROL_OPTIONS.find((x) => x.value === lead.domain_control); return o ? <p className={cn('text-[11px]', o.value === 'third_party_owns' || o.value === 'unknown' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>{o.guidance}</p> : null; })()}
            <p className="text-[11px] text-muted-foreground">Say: “{SALES_DOMAIN_LINE}”</p>
          </div>
        </div>
      </WorkSection>

      {leadPermissions(role).removeFromMyLeads && <RemoveFromMyLeads leadId={lead.id} onRemoved={onRemoved} />}
    </div>
  );
}

/* ── REMOVE FROM MY LEADS (sales, 2026-09-28) ─────────────────────────────────────────────────────
   ⛔ Never a delete, and the server decides what it means (sales_remove_leads): never contacted →
   unassigned; contacted on any channel → archived and still theirs, never claimable.
   The confirmation says both before anything happens. */
function RemoveFromMyLeads({ leadId, onRemoved }: { leadId: string; onRemoved?: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const r = await salesRemoveLeads([leadId]);
    setBusy(false);
    const outcome = r.results?.[0];
    if (!r.ok || !outcome || outcome.outcome === 'refused') {
      toast({ title: 'Not removed', description: refusalText(r.ok ? outcome?.reason : r.error), variant: 'destructive' });
      return;
    }
    setOpen(false);
    toast({ title: 'Removed from your leads', description: removeOutcomeText(r) });
    void qc.invalidateQueries({ queryKey: leadCrmKey(leadId) });
    notifyLeadChanged(leadId);
    window.dispatchEvent(new CustomEvent('sales-lead-changed'));
    onRemoved?.();
  };
  return (
    <section className={cn(CARD, 'flex flex-wrap items-center justify-between gap-2')} data-testid="remove-from-my-leads">
      <span className="text-xs text-muted-foreground">Not working this one?</span>
      <AlertDialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setOpen(true)}>
          <UserMinus className="mr-1.5 h-3.5 w-3.5" />{REMOVE_FROM_MY_LEADS_LABEL}
        </Button>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this lead from your leads?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
                {REMOVE_FROM_MY_LEADS_EXPLAINER.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void run(); }}>
              {busy ? 'Removing…' : REMOVE_FROM_MY_LEADS_LABEL}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/* ── CAMPAIGN: which existing campaign this lead is worked under (2026-09-28) ──────────────────────
   ⛔ THE ONE CAMPAIGN FIELD (outreach_leads.campaign_id) — the column the admin's bulk "Move to
   campaign" writes and the Sales dashboard groups by. lead_set_campaign checks the lead is the
   caller's to work (a salesperson: assigned to them, not a client) and that the campaign exists. Picking
   only: creating, renaming or deleting a campaign stays on the admin's campaign screens (hideCreate). */
function LeadCampaign({ lead, save }: { lead: CrmRow; save: SaveFn }) {
  const { campaigns } = useCampaigns();
  const name = lead.campaign_id ? campaigns.find((c) => c.id === lead.campaign_id)?.name ?? 'Campaign set' : 'No campaign';
  return (
    <WorkSection icon={Megaphone} title="Campaign" testId="lead-campaign" summary={name}>
      <CampaignPicker mode="assign" hideCreate value={lead.campaign_id} className="h-8 w-full text-xs sm:w-[260px]"
        onChange={(id) => { if (id !== lead.campaign_id) void save('lead_set_campaign', { _campaign_id: id }, id ? 'Campaign saved' : 'Removed from its campaign', { campaign_id: id }); }} />
    </WorkSection>
  );
}

/** The Call booked section's folded line — the one rule in src/lib/workspaceHeader.ts (no time when the Next Action bar shows it). */
const callBookedSummary = (lead: CrmRow) => callBookedSummaryOf(lead, Date.now(), { websiteControl: WEBSITE_CONTROL_OPTIONS, meetingWhen });

/** A WhatsApp conversation is recorded by its messages; what CAME of it is still the rep's to say.
 *  These apply the same plan as the logged outcomes, without a second record of the messages. */
const WHATSAPP_RESULT_OUTCOMES = ['interested', 'meeting_booked', 'call_back', 'not_interested'] as const;

/** One tap per outcome. The channel defaults to Call; the note is optional and saved with it.
 *  ⛔ COLLAPSED BY DEFAULT (declutter pass, 2026-10-01): one line until the person opens it — or it opens itself
 *  when they came to log a call (defaultOpen). Every channel and every outcome is still inside. After a
 *  successful log it closes again; the result line (what was recorded, the state, the suggested Next Action)
 *  stays visible under the closed header. */
function LogContact({ save, followOn, defaultOpen = false }: { save: SaveFn; followOn: FollowOn; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [channel, setChannel] = useState<string>('call');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<OutcomeResultLine | null>(null);
  const tap = async (outcome: string, logged: boolean) => {
    setBusy(outcome);
    try {
      const label = contactMethodLabel(channel);
      if (logged) {
        const r = await save('lead_log_contact', { _channel: channel, _outcome: outcome, _note: note.trim() || null }, `${label} logged: ${outcomeLabel(outcome)}`);
        if (!r.ok) return;
        setNote('');
      }
      const res = await followOn(outcome, channel, logged);
      setOpen(false);
      setResult({ ...res, contact:`${logged ? CONTACT_METHODS.find((m) => m.value === channel)?.short ?? label : 'WhatsApp'} · ${outcomeLabel(outcome)}` });
    } finally { setBusy(null); }
  };
  const outcomeButton = (o: { value: string; label: string }, logged: boolean) => (
    <Button key={o.value} type="button" size="sm" variant="outline" disabled={busy !== null} title={outcomeRule(o.value).does} data-testid={`outcome-${o.value}`}
      className={cn('h-9 justify-start px-2.5 text-xs', (o.value === 'interested' || o.value === 'meeting_booked') && 'border-emerald-500/40', (o.value === 'not_interested' || o.value === 'wrong_number') && 'border-rose-500/30')}
      onClick={() => void tap(o.value, logged)}>
      {busy === o.value ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}{o.label}
    </Button>
  );
  const chip = (on: boolean) => cn('rounded-full border px-2.5 py-1 text-xs font-medium transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60 text-muted-foreground hover:bg-muted');
  /* ⛔ EVERY METHOD OF THE ONE SET (src/lib/contactMethods.ts): the most used as pills, the rest under
     More. WhatsApp is a pill but is recorded by the send itself — selecting it explains that instead of
     offering a second record of the same message. */
  const primary = CONTACT_METHODS.filter((m) => m.primary);
  const more = CONTACT_METHODS.filter((m) => !m.primary && !m.social);
  const current = CONTACT_METHODS.find((m) => m.value === channel);
  const inMore = !!current && !current.primary && !current.social;
  /* Social outreach → platform → outcome: ONE Social pill; picking it shows LinkedIn / Facebook /
     Instagram (LinkedIn first). Keeps the row at five pills. */
  const inSocial = !!current?.social;
  const resultLine = result ? (
    /* ⛔ THE VISIBLE RESULT (2026-09-30): what was recorded, the state it left the lead in (and the
       change, when there was one), what else happened, and the Next Action waiting to be saved. Drawn
       under the header whether the section is open or folded. */
    <div className="space-y-1 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 text-[11px]" data-testid="logged-line">
      <div className="flex flex-wrap items-center gap-1.5">
        <Check className="h-3.5 w-3.5 text-emerald-600" />
        <span className="font-semibold text-foreground">{result.contact}</span>
        <span className="text-muted-foreground">→</span>
        <SalesStatePill view={result.state} size="xs" />
        {result.change && <span className="text-muted-foreground" data-testid="state-change">{result.change}</span>}
      </div>
      {result.said.length > 0 && <p className="text-muted-foreground">{result.said.join(' · ')}</p>}
      {result.failed.length > 0 && <p className="text-destructive">{result.failed.join(' · ')}</p>}
      {result.suggestion && <p className="font-medium text-amber-700 dark:text-amber-300" data-testid="suggestion">{result.suggestion}</p>}
    </div>
  ) : null;
  return (
    <WorkSection icon={PhoneCall} title="Log a contact" summary={open ? null : 'Call, WhatsApp, email, in person, social'} summaryClass="hidden sm:inline"
      open={open} onOpenChange={setOpen} testId="log-contact" className={open ? 'border-primary/30' : undefined} after={resultLine}>
      <div className="mb-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="How you contacted them">
        {primary.map((c) => (
          <button key={c.value} type="button" role="radio" aria-checked={channel === c.value} className={chip(channel === c.value)} onClick={() => setChannel(c.value)}>{c.short}</button>
        ))}
        <button type="button" role="radio" aria-checked={inSocial} className={chip(inSocial)} onClick={() => { if (!inSocial) setChannel(SOCIAL_CONTACT_METHODS[0].value); }} data-testid="log-social">Social</button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn(chip(inMore), 'inline-flex items-center gap-0.5')} aria-label="More contact methods">
              {inMore ? current!.short : 'More'}<ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {more.map((c) => <DropdownMenuItem key={c.value} className="text-xs" onClick={() => setChannel(c.value)}>{c.label}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {inSocial && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Which social network" data-testid="log-social-platform">
          <span className="text-[11px] text-muted-foreground">On:</span>
          {SOCIAL_CONTACT_METHODS.map((c) => (
            <button key={c.value} type="button" role="radio" aria-checked={channel === c.value} className={chip(channel === c.value)} onClick={() => setChannel(c.value)}>{c.short}</button>
          ))}
        </div>
      )}
      {current?.recordedBy === 'send' ? (<>
        <p className="mb-2 rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground" data-testid="whatsapp-recorded-by-send">
          WhatsApp messages are recorded automatically — nothing to log. What came of the conversation?
        </p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" data-testid="whatsapp-result">
          {WHATSAPP_RESULT_OUTCOMES.map((v) => outcomeButton({ value: v, label: outcomeLabel(v) }, false))}
        </div>
      </>) : (<>
      <Input value={note} onChange={(e) => setNote(e.target.value)} className="mb-2 h-9 text-xs" placeholder="Note (optional), saved with the outcome" />
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {offeredOutcomes(outcomesFor(channel)).map((o) => outcomeButton(o, true))}
      </div>
      </>)}
    </WorkSection>
  );
}

function InternalNote({ save }: { save: SaveFn }) {
  const [note, setNote] = useState('');
  return (
    /* Quiet until used (declutter pass, 2026-10-01): one line to type in; it grows while there is a note. */
    <section className={CARD}>
      <div className="mb-2 flex items-center gap-1.5"><Lock className="h-3 w-3" /><span className={LABEL}>Internal note</span><span className="text-[10px] uppercase tracking-wide text-amber-500">never sent</span></div>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={note ? 2 : 1} className="min-h-[36px] resize-none text-xs" placeholder="e.g. agency runs the site, call again next month" />
      <div className={cn('mt-2 flex justify-end', !note.trim() && 'hidden')}>
        <Button size="sm" className="h-8 text-xs" disabled={!note.trim()} onClick={async () => {
          const r = await save('lead_add_note', { _body: note }, 'Note added');
          if (r.ok) setNote('');
        }}>Add note</Button>
      </div>
    </section>
  );
}

/* ── HOOK AUDIT: the one-lead AI visibility check and its evidence (rivals named, sources) ─────── */
/* ⛔ PROPOSE → REVIEW/EDIT → RUN (2026-09-28). The system proposes the three questions from what is
   genuinely on the lead — trade, town, and the services / service areas recorded — through
   create-ai-audit's own preview, which plans them exactly as the run will (finalHookPlan).
   ⛔ EDITABLE, BOTH ROLES (Paul, 2026-09-28 — overturns the earlier "no free-text editing"): the
   operator may reword any of the three before Run. The WORDS change, the method does not: exactly
   three (reviewedHookQuestions refuses a blank or a repeat rather than letting the server top it up),
   both engines, one run, the same create-ai-audit hook path.
   3 questions × 2 engines × 1 run = 6 results, scored by hookScore (unchanged). */
function hookInputs(lead: CrmRow, hook: ReturnType<typeof useHookVisibility>['data']) {
  const bizType = (hook?.audit?.business_type || lead.search_keyword || lead.category || '').trim();
  const loc = (lead.derived_town || lead.search_location || hook?.audit?.location_text || '').trim();
  const website = lead.website && !isAggregatorUrl(lead.website) ? lead.website : undefined;
  const services = (lead.services_included ?? []).filter(Boolean);
  const areas = (lead.service_areas ?? []).filter(Boolean);
  return {
    bizType, loc,
    body: {
      lead_id: lead.id, business_name: lead.business_name, business_type: bizType, location_text: loc,
      country: lead.country ?? null, website, has_website: !!website, question_count: OUTREACH_HOOK_QUESTIONS,
      hook_audit: true, fresh_audit: true,
      ...(services.length ? { specialisms: services.join(', ') } : {}),
      ...(areas.length ? { service_areas: areas } : {}),
    },
  };
}

/** autoPropose: the Outreach row's audit popup — when the lead has no audit yet, propose the three
 *  questions straight away instead of showing the "Propose questions" button first. */
export function LeadHookPanel({ leadId, autoPropose = false }: { leadId: string; autoPropose?: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const crm = useLeadCrmRow(leadId);
  const hookQ = useHookVisibility(leadId);
  const hook = hookQ.data;
  const [hookBusy, setHookBusy] = useState(false);
  const [proposed, setProposed] = useState<string[] | null>(null);
  /* Trade + town typed here when the lead has none (2026-10-01): the same values the Inbox's audit prompt
     saves (lead_set_details for sales, the row for the admin), so "add them first" has somewhere to go. */
  const [details, setDetails] = useState<{ type: string; loc: string } | null>(null);
  const [override, setOverride] = useState<{ type: string; loc: string } | null>(null);
  const autoProposed = useRef(false);
  const lead = crm.data;
  const needsProposal = autoPropose && !!lead && !hookQ.isLoading && !hookQ.isError && !hook?.audit && !proposed;
  useEffect(() => {
    if (!needsProposal || autoProposed.current) return;
    autoProposed.current = true;
    void propose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsProposal]);
  if (!lead) return null;

  /* The audit's inputs, with any trade/town typed here taking the place of the blank ones. */
  const inputs = (ov: { type: string; loc: string } | null = override) => {
    const base = hookInputs(lead, hook);
    if (!ov) return base;
    return { ...base, bizType: base.bizType || ov.type, loc: base.loc || ov.loc,
      body: { ...base.body, business_type: base.bizType || ov.type, location_text: base.loc || ov.loc } };
  };
  const propose = async (ov: { type: string; loc: string } | null = override) => {
    const { bizType, loc, body } = inputs(ov);
    if (!bizType || !loc) { setDetails({ type: bizType, loc }); return; }
    setHookBusy(true);
    try {
      const data = await invokeEdge<{ ok: boolean; questions?: string[]; error?: string }>('create-ai-audit', { ...body, preview: true });
      const qs = (data.questions ?? []).filter((q) => typeof q === 'string' && q.trim());
      if (!qs.length) { toast({ title: "Couldn't propose questions", description: data.error ?? 'Try again', variant: 'destructive' }); return; }
      setProposed(qs);
    } catch (e) {
      toast({ title: "Couldn't propose questions", description: edgeErrorMessage(e, 'Try again'), variant: 'destructive' });
    } finally { setHookBusy(false); }
  };

  const reviewed = proposed ? reviewedHookQuestions(proposed) : null;
  const saveDetailsThenPropose = async () => {
    const type = (details?.type ?? '').trim(); const loc = (details?.loc ?? '').trim();
    if (!type || !loc) { toast({ title: 'Both are needed', description: 'Enter the trade and the town.', variant: 'destructive' }); return; }
    setHookBusy(true);
    try {
      // Both roles through lead_set_details (ownership-checked, History logged) — never a direct row write here.
      const write = await leadRpc('lead_set_details', { _lead_id: lead.id, _contact_name: null, _search_keyword: type, _search_location: loc });
      if (!write.ok) { toast({ title: "Couldn't save the trade and town", description: refusalText(write.error), variant: 'destructive' }); return; }
      setOverride({ type, loc }); setDetails(null);
      void qc.invalidateQueries({ queryKey: leadCrmKey(lead.id) });
      notifyLeadChanged(lead.id);
    } finally { setHookBusy(false); }
    // Propose with the typed values themselves (the row re-read and the state update can lag a moment).
    void propose({ type, loc });
  };

  const run = async () => {
    if (!reviewed?.ok) return;
    const { body } = inputs();
    setHookBusy(true);
    try {
      const data = await invokeEdge<{ ok: boolean; error?: string; message?: string; already_running?: boolean }>('create-ai-audit', { ...body, questions: reviewed.questions });
      if (!data?.ok) { toast({ title: "Couldn't start the check", description: data?.message ?? data?.error ?? 'Try again', variant: 'destructive' }); return; }
      setProposed(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: hookVisibilityQueryKey(lead.id) }),
        qc.invalidateQueries({ queryKey: OUTREACH_AUDIT_MAP_ROOT }),
      ]);
      notifyLeadChanged(lead.id);
      toast(data.already_running
        ? { title: 'Already running', description: 'This business already has a check in progress, so nothing new was started. Its progress shows here.' }
        : { title: 'AI visibility check started', description: 'It runs on the server, so you can close this and carry on. The result appears on the lead in a few minutes. Nothing is sent to the lead.' });
    } catch (e) {
      toast({ title: "Couldn't start the check", description: edgeErrorMessage(e, 'Try again'), variant: 'destructive' });
    } finally { setHookBusy(false); }
  };

  const reportAuditId = hook?.report?.kind === 'ready' ? hook.report.link.auditId : null;
  const onReportCopied = (link: { auditId: string }) => {
    void leadRpc('lead_report_link_event', { _lead_id: lead.id, _audit_id: link.auditId, _kind: 'generated', _channel: null })
      .then(() => qc.invalidateQueries({ queryKey: reportShareKey(lead.id, link.auditId) }));
  };

  return (
    <div className="space-y-3">
      <HookVisibilityCard leadId={lead.id} onRunNew={() => void propose()} runNewBusy={hookBusy} onReportCopied={onReportCopied} />
      {reportAuditId && hook?.report?.kind === 'ready' && hook.report.isCurrent && <ReportSharePanel leadId={lead.id} auditId={reportAuditId} />}
      {proposed && (
        <section className={cn(CARD, 'space-y-2')} data-testid="hook-proposed-questions">
          <div className={LABEL}>The {proposed.length} questions we will ask ChatGPT and Google AI — edit any of them</div>
          <div className="space-y-1.5">
            {proposed.map((q, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-4 shrink-0 text-right text-xs text-muted-foreground">{i + 1}</span>
                <Input value={q} maxLength={240} className="h-9 text-sm" aria-label={`Question ${i + 1}`} data-testid={`hook-question-${i + 1}`}
                  onChange={(e) => { const v = e.target.value; setProposed((prev) => (prev ? prev.map((p, j) => (j === i ? v : p)) : prev)); }} />
              </div>
            ))}
          </div>
          {reviewed && reviewed.ok === false && "reason" in reviewed && <p className="text-[11px] text-orange-400">{reviewed.reason}</p>}
          <p className="text-[11px] text-muted-foreground">
            Proposed from this lead&rsquo;s trade, town{lead.services_included?.length ? ', services' : ''}{lead.service_areas?.length ? ' and service areas' : ''}. Word them the way a customer would ask. Each is asked once on both engines: {proposed.length * 2} results. Nothing is sent to the lead.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={hookBusy} onClick={() => setProposed(null)}>Cancel</Button>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={hookBusy} onClick={() => void propose()}>
              <RefreshCw className="h-3.5 w-3.5" />Propose again
            </Button>
            <Button size="sm" className="h-8 gap-1 text-xs" disabled={hookBusy || !reviewed?.ok} onClick={() => void run()} data-testid="hook-run-reviewed">
              {hookBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Run audit
            </Button>
          </div>
        </section>
      )}
      {details && !proposed && (
        <section className={cn(CARD, 'space-y-2')} data-testid="hook-need-details">
          <div className={LABEL}>The check needs this lead&rsquo;s trade and town</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input value={details.type} onChange={(e) => setDetails({ ...details, type: e.target.value })} placeholder="Trade, e.g. roofer" className="h-9 text-sm" aria-label="Trade" />
            <Input value={details.loc} onChange={(e) => setDetails({ ...details, loc: e.target.value })} placeholder="Town, e.g. Leeds" className="h-9 text-sm" aria-label="Town" />
          </div>
          <p className="text-[11px] text-muted-foreground">Saved on the lead, then the three questions are proposed for you to check. Nothing is sent to the lead.</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={hookBusy} onClick={() => setDetails(null)}>Cancel</Button>
            <Button size="sm" className="h-8 gap-1 text-xs" disabled={hookBusy} onClick={() => void saveDetailsThenPropose()} data-testid="hook-save-details">
              {hookBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Save and propose questions
            </Button>
          </div>
        </section>
      )}
      {/* RE-RUN (2026-10-01): a finished check can be run again — a NEW audit (the old one stays below and in
          History). The same propose → review → run path; the server refuses a second one while one is running. */}
      {!proposed && !details && !hookQ.isLoading && !hookQ.isError && hook?.audit && !hook.inFlight && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={hookBusy} onClick={() => void propose()} data-testid="hook-rerun">
            {hookBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Run a new check
          </Button>
        </div>
      )}
      {(hook?.history?.length ?? 0) > 1 && (
        <section className={cn(CARD, 'space-y-1')} data-testid="hook-history">
          <div className={LABEL}>Previous checks</div>
          <ul className="space-y-0.5 text-xs">
            {hook!.history.map((h) => (
              <li key={h.auditId} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">{h.createdAt ? new Date(h.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }) : 'Undated'}{h.label ? ` · ${h.label}` : ''}</span>
                {h.link ? <a href={h.link.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Open report</a> : <span className="text-muted-foreground/70">{h.finished ? '' : 'not finished'}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {!proposed && !details && !hookQ.isLoading && !hookQ.isError && !hook?.audit && (
        /* Compact until there is something to show (declutter pass, 2026-10-01): the name, "Not run yet", the one
           button; what it does is on hover. The proposed questions, the run, the result and history are unchanged. */
        <section className={cn(CARD, 'flex flex-wrap items-center justify-between gap-2 py-2.5')} data-testid="hook-not-run"
          title="Asks ChatGPT and Google AI the questions a customer would, and shows who they name instead. Nothing is sent to the lead.">
          <div className="flex items-center gap-1.5 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-primary" /><span className="font-medium text-foreground">AI visibility check</span>
            <span className="text-muted-foreground">· Not run yet</span>
          </div>
          <Button size="sm" className="h-8 gap-1 text-xs" disabled={hookBusy} onClick={() => void propose()} data-testid="hook-propose">
            {hookBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Propose questions
          </Button>
        </section>
      )}
    </div>
  );
}

/* ── THE REPORT, SHARED: sent / opened, and "sent another way" (2026-09-28, src/lib/reportShare.ts) ── */
function ReportSharePanel({ leadId, auditId }: { leadId: string; auditId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const share = useReportShare(leadId, auditId);
  const [channel, setChannel] = useState<string>('');
  const s = share.data;
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
  const markSent = async (ch: string) => {
    const r = await leadRpc('lead_report_link_event', { _lead_id: leadId, _audit_id: auditId, _kind: 'sent', _channel: ch });
    if (!r.ok) { toast({ title: "Couldn't record that", description: refusalText(r.error), variant: 'destructive' }); return; }
    toast({ title: 'Recorded: report sent' });
    setChannel('');
    void qc.invalidateQueries({ queryKey: reportShareKey(leadId, auditId) });
    notifyLeadChanged(leadId);
  };
  return (
    <section className={cn(CARD, 'flex flex-wrap items-center justify-between gap-2 py-2.5')} data-testid="report-share">
      <div className="text-xs">
        <span className="font-medium">Report</span>{' '}
        {!s ? <span className="text-muted-foreground">…</span> : (
          <span className="text-muted-foreground">
            {s.sent ? `Sent ${day(s.firstSentAt!)} (${s.sentChannels.map((c) => REPORT_CHANNEL_LABEL[c] ?? c).join(', ')})` : s.generated ? 'Link copied, not recorded as sent' : 'Not sent yet'}
            {' · '}
            {s.opened ? `Opened ${day(s.firstOpenedAt!)}${s.openCount > 1 ? ` · ${s.openCount} views` : ''}${s.openedBeforeSend ? ' (before any recorded send)' : ''}` : 'Not opened'}
          </span>
        )}
      </div>
      <Select value={channel} onValueChange={(v) => { setChannel(v); void markSent(v); }}>
        <SelectTrigger className="h-7 w-auto gap-1 text-[11px]"><SelectValue placeholder="Sent another way…" /></SelectTrigger>
        <SelectContent>{REPORT_SEND_CHANNELS.map((c) => <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>)}</SelectContent>
      </Select>
    </section>
  );
}

/* ── HISTORY: everything recorded on the lead, newest first ─────────────────────────────────────── */
export function LeadHistoryPanel({ leadId, older }: { leadId: string; older?: ReadonlyArray<{ id: string; user_id: string | null; description: string; created_at: string }> }) {
  const team = useTeamDirectory();
  const activity = useLeadActivity(leadId);
  const link = useOnboardingLink(leadId);
  const actorName = (id: string | null) => (id ? team.byId.get(id)?.display_name ?? 'Someone' : 'System');
  type Item = { key: string; at: string; actor: string | null; title: string; detail?: string | null; link?: boolean };
  const items: Item[] = [];
  /* ⛔ THE STATE CHANGE SITS ON THE CONTACT THAT CAUSED IT (2026-09-30): "Phone call · Spoke to owner /
     Status: Contacted → Interested". It joins the same person's NEAREST earlier contact row, only when
     that row's outcome is the one the change names and it is under a minute old; otherwise it stands
     alone (a WhatsApp conversation's result, a meeting saved later). The star / pipeline-status rows the
     lead functions wrote for that change in the same minute are its mechanism and fold into it — the one
     line says what happened. Only a real change was ever recorded (lead_log_state_change). */
  const rows = [...(activity.data ?? [])].sort((x, y) => Date.parse(x.created_at) - Date.parse(y.created_at));
  const joined = new Set<string>();
  const changeOf = new Map<string, string>();
  const MECHANISM = new Set(['marked_interested', 'stage_changed']);
  for (const [i, a] of rows.entries()) {
    if (a.kind !== 'state_changed') continue;
    const t = Date.parse(a.created_at);
    const near = (c: typeof a) => c.actor_user_id === a.actor_user_id && t - Date.parse(c.created_at) <= 60_000 && t >= Date.parse(c.created_at);
    for (const c of rows.slice(0, i)) if (MECHANISM.has(c.kind) && near(c)) joined.add(c.id);
    const cause = rows.slice(0, i).reverse().find((c) => LOGGED_CONTACT_KINDS.has(c.kind) && c.actor_user_id === a.actor_user_id);
    if (cause && near(cause) && !changeOf.has(cause.id) && cause.data?.outcome === a.data?.outcome) { changeOf.set(cause.id, stateChangedWords(a.data)); joined.add(a.id); }
  }
  for (const a of activity.data ?? []) {
    if (joined.has(a.id)) continue;
    const base = a.kind === 'state_changed' ? stateChangedWords(a.data) : activityDetail(a, actorName);
    const change = changeOf.get(a.id);
    items.push({ key: a.id, at: a.created_at, actor: a.actor_user_id, title: ACTIVITY_LABEL[a.kind] ?? a.kind, detail: change ? [base, change].filter(Boolean).join('\n') : base });
  }
  (link.data?.events ?? []).forEach((e, i) => {
    items.push({ key: `link-${i}`, at: e.created_at, actor: e.actor_user_id, link: true, title: e.kind === 'sent' ? 'Sign-up link sent' : 'Sign-up link copied', detail: e.kind === 'sent' ? `${LINK_CHANNEL_LABEL[e.channel] ?? e.channel}${e.template_name ? ` (${e.template_name})` : ''}` : null });
  });
  for (const o of older ?? []) items.push({ key: `older-${o.id}`, at: o.created_at, actor: o.user_id, title: o.description });
  const st = link.data?.status;
  if (st?.firstOpenedAt) items.push({ key: 'link-open', at: st.firstOpenedAt, actor: null, link: true, title: 'Sign-up page first opened', detail: st.openCount > 1 ? `${st.openCount} page loads since` : null });
  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return (
    <section className={CARD}>
      <div className="mb-2 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-cyan-400" /><span className={LABEL}>History</span></div>
      <ul className="space-y-2 text-xs">
        {items.map((a) => (
          <li key={a.key} className="flex gap-2">
            {a.link ? <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" /> : <OwnerAvatar name={actorName(a.actor)} avatarUrl={a.actor ? team.byId.get(a.actor)?.avatar_url : null} className="mt-0.5" />}
            <div className="min-w-0">
              <div><span className="font-medium">{a.title}</span> <span className="text-muted-foreground">· {a.link && !a.actor ? 'Findable' : actorName(a.actor)} · {fmt(a.at)}</span></div>
              {a.detail && <div className="whitespace-pre-wrap text-muted-foreground">{a.detail}</div>}
            </div>
          </li>
        ))}
        {activity.isLoading && <li className="text-muted-foreground/60"><Loader2 className="h-3.5 w-3.5 animate-spin" /></li>}
        {!activity.isLoading && items.length === 0 && <li className="text-muted-foreground/60">Nothing recorded yet.</li>}
      </ul>
    </section>
  );
}

/** The three panels stacked — the old single-panel shape, kept for any caller that wants it. */
export function LeadCrmPanel({ leadId }: { leadId: string }) {
  return (
    <div className="space-y-4">
      <LeadHookPanel leadId={leadId} />
      <LeadWorkPanel leadId={leadId} />
      <LeadHistoryPanel leadId={leadId} />
    </div>
  );
}
