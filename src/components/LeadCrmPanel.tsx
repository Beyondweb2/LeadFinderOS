import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusiness, CalendarClock, Clock, Link2, Lock, Loader2, PhoneCall, RefreshCw, Sparkles, X } from 'lucide-react';
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
import { LeadOwnerControl } from '@/components/LeadOwnerControl';
import { CampaignPicker } from '@/components/CampaignPicker';
import { OwnerAvatar } from '@/components/OwnerBadge';
import { leadRpc, type RpcResult } from '@/lib/leadRpc';
import { leadSourceFor } from '@/lib/outreachLeadColumns';
import { notifyLeadChanged } from '@/lib/leadSync';
import { isAggregatorUrl } from '@/lib/aggregators';
import { OUTREACH_HOOK_QUESTIONS } from '@/lib/auditQuestionCounts';
import { LINK_CHANNEL_LABEL } from '@/lib/onboardingLinkStatus';
import { ACTIVITY_LABEL, CALL_OUTCOMES, CONTACT_CHANNEL_OPTIONS, NEXT_ACTION_OPTIONS, WEBSITE_CONTROL_OPTIONS, activityDetail, refusalText } from '@/lib/salesCrm';
import { cn } from '@/lib/utils';
import { DOMAIN_CONTROL_OPTIONS, SALES_DOMAIN_LINE } from '@/lib/domainAuthority';

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
   ⛔ An outcome is ACTIVITY only. It never sets the status or the next action — Next Action is
   human-set only (Paul, 2026-09-28); the person chooses it in the box right below.
   ⛔ Reads come from the caller's OWN source (leadSourceFor): a salesperson reads the sales_leads
   view, so a lead that is not theirs simply returns nothing here.
   ⛔ Internal notes are activity rows and are NEVER sent to the lead.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

// The view and the CRM columns are not in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const CRM_COLUMNS = 'id, business_name, search_keyword, category, derived_town, search_location, country, website, next_action, next_action_date, next_action_note, call_booked_at, website_control, website_control_note, assigned_to_user_id, services_included, service_areas, address, campaign_id, domain_control';

interface CrmRow {
  id: string; business_name: string | null; search_keyword: string | null; category: string | null;
  derived_town: string | null; search_location: string | null; country: string | null; website: string | null;
  next_action: string | null; next_action_date: string | null; next_action_note: string | null;
  call_booked_at: string | null; website_control: string | null; website_control_note: string | null;
  assigned_to_user_id: string | null;
  services_included: string[] | null; service_areas: string[] | null; address: string | null;
  campaign_id: string | null;
  domain_control: string | null;
}

export const leadCrmKey = (leadId: string) => ['lead-crm', leadId] as const;

const CARD = 'rounded-xl border border-border/60 bg-card/60 p-3.5 shadow-sm';
const LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-foreground/70';

function fmt(ts: string) {
  return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** A London calendar day, n days from today, as YYYY-MM-DD. */
export function londonDayPlus(n: number, now = new Date()): string {
  const d = new Date(now.getTime() + n * 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}
export const QUICK_DATES = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
] as const;

/** The lead's CRM columns, from the caller's own source. */
export function useLeadCrmRow(leadId: string) {
  const { role } = useSubscription();
  const src = leadSourceFor(role);
  return useQuery({
    queryKey: leadCrmKey(leadId),
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
export function LeadWorkPanel({ leadId }: { leadId: string }) {
  const crm = useLeadCrmRow(leadId);
  const save = useSave(leadId);
  const lead = crm.data;
  if (crm.isLoading) return <section className={CARD}><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></section>;
  if (crm.isError) return <section className={cn(CARD, 'text-xs text-destructive')}>Could not load this lead's CRM details. Close and open it again.</section>;
  if (!lead) return null; // not readable by this caller → nothing to show (the server said so)

  return (
    <div className="space-y-3">
      <LogContact save={save} />

      <section className={CARD}>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-primary" /><span className={LABEL}>Next action</span></div>
          <LeadOwnerControl leadId={lead.id} />
        </div>
        <FollowUp key={`${lead.next_action}|${lead.next_action_date}|${lead.next_action_note}`} lead={lead}
          onSave={(a) => save('lead_set_follow_up', { _next_action: a.nextAction, _date: a.date, _note: a.note }, a.nextAction === 'none' ? 'Next action cleared' : 'Next action saved',
            { next_action: a.nextAction, next_action_date: a.nextAction === 'none' ? null : a.date, next_action_note: a.note })} />
      </section>

      <LeadCampaign lead={lead} save={save} />

      <InternalNote save={save} />

      <details className={CARD}>
        <summary className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
          <BriefcaseBusiness className="h-3.5 w-3.5 text-primary" />Call booked · who controls the website
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-muted-foreground">Call booked for</label>
            <Input type="datetime-local" key={lead.call_booked_at ?? 'none'} className="h-9 text-xs"
              defaultValue={lead.call_booked_at ? toLocalInput(lead.call_booked_at) : ''}
              onBlur={async (e) => {
                const v = e.target.value ? new Date(e.target.value).toISOString() : null;
                if (v === (lead.call_booked_at ? new Date(lead.call_booked_at).toISOString() : null)) return;
                await save('lead_set_call_booked', { _at: v }, v ? 'Call booked' : 'Call cleared');
              }} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-muted-foreground">Who controls the website?</label>
            <Select value={lead.website_control ?? ''} onValueChange={(v) => void save('lead_set_website_control', { _value: v, _note: lead.website_control_note }, 'Saved')}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Not asked yet" /></SelectTrigger>
              <SelectContent>{WEBSITE_CONTROL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input key={lead.website_control_note ?? ''} defaultValue={lead.website_control_note ?? ''} className="h-9 text-xs" placeholder="Detail, e.g. agency contract ends November"
              onBlur={async (e) => {
                const v = e.target.value.trim() || null;
                if (v === (lead.website_control_note ?? null)) return;
                await save('lead_set_website_control', { _value: lead.website_control, _note: v }, 'Saved');
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
      </details>
    </div>
  );
}

/* ── CAMPAIGN: which existing campaign this lead is worked under (2026-09-28) ──────────────────────
   ⛔ THE ONE CAMPAIGN FIELD (outreach_leads.campaign_id) — the column the admin's bulk "Move to
   campaign" writes and the Sales dashboard groups by. lead_set_campaign checks the lead is the
   caller's to work (a salesperson: assigned to them, not a client) and that the campaign exists. Picking
   only: creating, renaming or deleting a campaign stays on the admin's campaign screens (hideCreate). */
function LeadCampaign({ lead, save }: { lead: CrmRow; save: SaveFn }) {
  return (
    <section className={cn(CARD, 'flex flex-wrap items-center justify-between gap-2')} data-testid="lead-campaign">
      <span className={LABEL}>Campaign</span>
      <CampaignPicker mode="assign" hideCreate value={lead.campaign_id} className="h-8 w-[220px] text-xs"
        onChange={(id) => { if (id !== lead.campaign_id) void save('lead_set_campaign', { _campaign_id: id }, id ? 'Campaign saved' : 'Removed from its campaign', { campaign_id: id }); }} />
    </section>
  );
}

/** One tap per outcome. The channel defaults to Call; the note is optional and saved with it. */
function LogContact({ save }: { save: SaveFn }) {
  const [channel, setChannel] = useState<string>('call');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const chip = (on: boolean) => cn('rounded-full border px-2.5 py-1 text-xs font-medium transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60 text-muted-foreground hover:bg-muted');
  return (
    <section className={cn(CARD, 'border-primary/30')} data-testid="log-contact">
      <div className="mb-2 flex items-center gap-1.5"><PhoneCall className="h-3.5 w-3.5 text-primary" /><span className={LABEL}>Log a contact</span></div>
      <div className="mb-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="How you contacted them">
        {CONTACT_CHANNEL_OPTIONS.map((c) => (
          <button key={c.value} type="button" role="radio" aria-checked={channel === c.value} className={chip(channel === c.value)} onClick={() => setChannel(c.value)}>{c.label}</button>
        ))}
      </div>
      <Input value={note} onChange={(e) => setNote(e.target.value)} className="mb-2 h-9 text-xs" placeholder="Note (optional), saved with the outcome" />
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {CALL_OUTCOMES.map((o) => (
          <Button key={o.value} type="button" size="sm" variant="outline" disabled={busy !== null}
            className={cn('h-9 justify-start px-2.5 text-xs', (o.value === 'interested' || o.value === 'meeting_booked') && 'border-emerald-500/40', (o.value === 'not_interested' || o.value === 'wrong_number') && 'border-rose-500/30')}
            onClick={async () => {
              setBusy(o.value);
              try {
                const label = CONTACT_CHANNEL_OPTIONS.find((c) => c.value === channel)?.label ?? 'Contact';
                const r = await save('lead_log_contact', { _channel: channel, _outcome: o.value, _note: note.trim() || null }, `${label} logged: ${o.label}`);
                if (r.ok) { setNote(''); setLast(`${label}: ${o.label}`); }
              } finally { setBusy(null); }
            }}>
            {busy === o.value ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}{o.label}
          </Button>
        ))}
      </div>
      {last && <p className="mt-2 text-[11px] text-muted-foreground">Logged <span className="font-medium text-foreground">{last}</span>. Set the next action below if one is needed.</p>}
    </section>
  );
}

function InternalNote({ save }: { save: SaveFn }) {
  const [note, setNote] = useState('');
  return (
    <section className={cn(CARD, 'border-amber-500/40')}>
      <div className="mb-2 flex items-center gap-1.5"><Lock className="h-3 w-3" /><span className={LABEL}>Internal note</span><span className="text-[10px] uppercase tracking-wide text-amber-500">never sent</span></div>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="resize-none text-xs" placeholder="Spoke to owner, agency runs the site, call again next month…" />
      <div className="mt-2 flex justify-end">
        <Button size="sm" className="h-8 text-xs" disabled={!note.trim()} onClick={async () => {
          const r = await save('lead_add_note', { _body: note }, 'Note added');
          if (r.ok) setNote('');
        }}>Add note</Button>
      </div>
    </section>
  );
}

function FollowUp({ lead, onSave }: {
  lead: { next_action: string | null; next_action_date: string | null; next_action_note: string | null };
  onSave: (a: { nextAction: string; date: string | null; note: string | null }) => Promise<unknown>;
}) {
  const known = NEXT_ACTION_OPTIONS.some((o) => o.value === lead.next_action);
  const [nextAction, setNextAction] = useState(lead.next_action ?? 'none');
  const [date, setDate] = useState(lead.next_action_date ?? '');
  const [note, setNote] = useState(lead.next_action_note ?? '');
  const has = !!lead.next_action && lead.next_action !== 'none';
  const chip = 'rounded-md border border-border/60 px-2 py-1 text-[11px] font-medium hover:bg-muted';
  return (
    <div className="space-y-2" data-testid="next-action">
      {has && (
        <p className="text-xs"><span className="text-muted-foreground">Now: </span>
          <span className="font-semibold">{NEXT_ACTION_OPTIONS.find((o) => o.value === lead.next_action)?.label ?? lead.next_action!.replace(/_/g, ' ')}</span>
          {lead.next_action_date ? <span className="text-muted-foreground"> on {new Date(lead.next_action_date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</span> : null}
        </p>
      )}
      <Select value={nextAction} onValueChange={setNextAction}>
        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Nothing planned" /></SelectTrigger>
        <SelectContent>
          {NEXT_ACTION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          {!known && lead.next_action ? <SelectItem value={lead.next_action}>{lead.next_action.replace(/_/g, ' ')}</SelectItem> : null}
        </SelectContent>
      </Select>
      <div className={cn('flex flex-wrap items-center gap-1.5', nextAction === 'none' && 'pointer-events-none opacity-40')}>
        {QUICK_DATES.map((q) => (
          <button key={q.label} type="button" className={cn(chip, date === londonDayPlus(q.days) && 'border-primary text-primary')} onClick={() => setDate(londonDayPlus(q.days))}>{q.label}</button>
        ))}
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-[9.5rem] text-xs" disabled={nextAction === 'none'} aria-label="Next action date" />
      </div>
      <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-9 text-xs" placeholder="What to do, e.g. ring after their website contract ends" />
      <div className="flex items-center justify-end gap-2">
        {has && (
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-muted-foreground" onClick={() => void onSave({ nextAction: 'none', date: null, note: note.trim() || null })}>
            <X className="h-3.5 w-3.5" />Clear
          </Button>
        )}
        <Button size="sm" className="h-8 text-xs" onClick={() => void onSave({ nextAction, date: nextAction === 'none' ? null : (date || null), note: note.trim() || null })}>Save next action</Button>
      </div>
    </div>
  );
}

/* ── HOOK AUDIT: the one-lead AI visibility check and its evidence (rivals named, sources) ─────── */
/* ⛔ PROPOSE → REVIEW → RUN (2026-09-28). The system proposes the three questions from what is genuinely
   on the lead — trade, town, and the services / service areas Sales recorded — through create-ai-audit's
   own preview, which plans them exactly as the run will (finalHookPlan). The salesperson reads them and
   either runs THOSE three (sent back verbatim) or asks for a fresh proposal. No free-text editing: the
   questions must come from the lead's real services and places, never from a typed invention.
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

export function LeadHookPanel({ leadId }: { leadId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const crm = useLeadCrmRow(leadId);
  const hookQ = useHookVisibility(leadId);
  const hook = hookQ.data;
  const [hookBusy, setHookBusy] = useState(false);
  const [proposed, setProposed] = useState<string[] | null>(null);
  const lead = crm.data;
  if (!lead) return null;

  const propose = async () => {
    const { bizType, loc, body } = hookInputs(lead, hook);
    if (!bizType || !loc) { toast({ title: 'Need a trade and a town', description: 'Add the trade and town on the Prospect tab first.', variant: 'destructive' }); return; }
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

  const run = async () => {
    if (!proposed?.length) return;
    const { body } = hookInputs(lead, hook);
    setHookBusy(true);
    try {
      const data = await invokeEdge<{ ok: boolean; error?: string; message?: string }>('create-ai-audit', { ...body, questions: proposed });
      if (!data?.ok) { toast({ title: "Couldn't start the check", description: data?.message ?? data?.error ?? 'Try again', variant: 'destructive' }); return; }
      setProposed(null);
      await qc.invalidateQueries({ queryKey: hookVisibilityQueryKey(lead.id) });
      notifyLeadChanged(lead.id);
      toast({ title: 'AI visibility check started', description: 'The result appears here in a few minutes. Nothing is sent to the lead.' });
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
          <div className={LABEL}>The {proposed.length} questions we would ask ChatGPT and Google AI</div>
          <ol className="list-decimal space-y-1 pl-5 text-sm">{proposed.map((q) => <li key={q}>{q}</li>)}</ol>
          <p className="text-[11px] text-muted-foreground">
            Built from this lead&rsquo;s trade, town{lead.services_included?.length ? ', services' : ''}{lead.service_areas?.length ? ' and service areas' : ''}. Each is asked once on both engines: {proposed.length * 2} results. Nothing is sent to the lead.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={hookBusy} onClick={() => setProposed(null)}>Cancel</Button>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={hookBusy} onClick={() => void propose()}>
              <RefreshCw className="h-3.5 w-3.5" />Propose again
            </Button>
            <Button size="sm" className="h-8 gap-1 text-xs" disabled={hookBusy} onClick={() => void run()} data-testid="hook-run-reviewed">
              {hookBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Run these questions
            </Button>
          </div>
        </section>
      )}
      {!proposed && !hookQ.isLoading && !hookQ.isError && !hook?.audit && (
        <section className={cn(CARD, 'flex flex-wrap items-center justify-between gap-2')}>
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">AI visibility check</span> — not run for this lead yet. It asks ChatGPT and Google AI the questions a customer would, and shows who they name instead.
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
export function LeadHistoryPanel({ leadId }: { leadId: string }) {
  const team = useTeamDirectory();
  const activity = useLeadActivity(leadId);
  const link = useOnboardingLink(leadId);
  const actorName = (id: string | null) => (id ? team.byId.get(id)?.display_name ?? 'Someone' : 'System');
  type Item = { key: string; at: string; actor: string | null; title: string; detail?: string | null; link?: boolean };
  const items: Item[] = [];
  for (const a of activity.data ?? []) {
    items.push({ key: a.id, at: a.created_at, actor: a.actor_user_id, title: ACTIVITY_LABEL[a.kind] ?? a.kind, detail: activityDetail(a, actorName) });
  }
  (link.data?.events ?? []).forEach((e, i) => {
    items.push({ key: `link-${i}`, at: e.created_at, actor: e.actor_user_id, link: true, title: e.kind === 'sent' ? 'Sign-up link sent' : 'Sign-up link copied', detail: e.kind === 'sent' ? `${LINK_CHANNEL_LABEL[e.channel] ?? e.channel}${e.template_name ? ` (${e.template_name})` : ''}` : null });
  });
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
