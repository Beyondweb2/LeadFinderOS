import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusiness, CalendarClock, Clock, Link2, Lock, Loader2, PhoneCall, Sparkles, X } from 'lucide-react';
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
import { HookVisibilityCard } from '@/components/HookVisibilityCard';
import { LeadOwnerControl } from '@/components/LeadOwnerControl';
import { OwnerAvatar } from '@/components/OwnerBadge';
import { leadRpc, type RpcResult } from '@/lib/leadRpc';
import { leadSourceFor } from '@/lib/outreachLeadColumns';
import { notifyLeadChanged } from '@/lib/leadSync';
import { isAggregatorUrl } from '@/lib/aggregators';
import { OUTREACH_HOOK_QUESTIONS } from '@/lib/auditQuestionCounts';
import { LINK_CHANNEL_LABEL } from '@/lib/onboardingLinkStatus';
import { ACTIVITY_LABEL, CALL_OUTCOMES, CONTACT_CHANNEL_OPTIONS, NEXT_ACTION_OPTIONS, WEBSITE_CONTROL_OPTIONS, refusalText } from '@/lib/salesCrm';
import { cn } from '@/lib/utils';

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

type SaveFn = (name: string, args: Record<string, unknown>, okText: string) => Promise<RpcResult>;

function useSave(leadId: string): SaveFn {
  const { toast } = useToast();
  return async (name, args, okText) => {
    const r = await leadRpc(name, { _lead_id: leadId, ...args });
    if (r.ok) { toast({ title: okText }); notifyLeadChanged(leadId); }
    else toast({ title: 'Not saved', description: refusalText(r.error), variant: 'destructive' });
    return r;
  };
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
          onSave={(a) => save('lead_set_follow_up', { _next_action: a.nextAction, _date: a.date, _note: a.note }, a.nextAction === 'none' ? 'Next action cleared' : 'Next action saved')} />
      </section>

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
        </div>
      </details>
    </div>
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
export function LeadHookPanel({ leadId }: { leadId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const crm = useLeadCrmRow(leadId);
  const hookQ = useHookVisibility(leadId);
  const hook = hookQ.data;
  const [hookBusy, setHookBusy] = useState(false);
  const lead = crm.data;
  if (!lead) return null;

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

  return (
    <div className="space-y-3">
      <HookVisibilityCard leadId={lead.id} onRunNew={() => void runHook()} runNewBusy={hookBusy} />
      {!hookQ.isLoading && !hookQ.isError && !hook?.audit && (
        <section className={cn(CARD, 'flex flex-wrap items-center justify-between gap-2')}>
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">AI visibility check</span> — not run for this lead yet. It asks ChatGPT and Google AI the questions a customer would, and shows who they name instead.
          </div>
          <Button size="sm" className="h-8 gap-1 text-xs" disabled={hookBusy} onClick={() => void runHook()}>
            {hookBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Run AI visibility check
          </Button>
        </section>
      )}
    </div>
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
    const outcome = CALL_OUTCOMES.find((o) => o.value === a.data?.outcome)?.label ?? String(a.data?.outcome ?? '');
    const channel = CONTACT_CHANNEL_OPTIONS.find((c) => c.value === a.data?.channel)?.label;
    let detail: string | null = null;
    if (a.kind === 'note') detail = a.body;
    else if (a.kind === 'call_outcome' || a.kind === 'contact_logged') detail = `${a.kind === 'contact_logged' && channel ? channel + ': ' : ''}${outcome}${a.body ? ` — ${a.body}` : ''}`;
    else if (a.kind === 'stage_changed') detail = `${String(a.data?.from ?? '—')} → ${String(a.data?.to ?? '—')}`;
    else if (a.kind === 'follow_up_set') detail = `${String(a.data?.next_action ?? '').replace(/_/g, ' ')}${a.data?.date ? ` on ${String(a.data.date)}` : ''}${a.data?.note ? ` — ${String(a.data.note)}` : ''}`;
    else if (a.kind === 'bulk_queued' && a.data?.template) detail = String(a.data.template);
    else if (a.kind === 'archived_set') detail = a.data?.archived ? 'Archived' : 'Restored';
    else if (a.kind === 'marked_interested') detail = a.data?.on === false ? 'Unstarred' : 'Starred';
    else if (a.kind === 'lead_added' && a.data?.source) detail = `Source: ${String(a.data.source).replace(/_/g, ' ')}`;
    else if (a.kind === 'lead_assigned' || a.kind === 'lead_unassigned') detail = `${actorName((a.data?.from as string) ?? null)} → ${a.data?.to ? actorName(a.data.to as string) : 'Unassigned'}`;
    items.push({ key: a.id, at: a.created_at, actor: a.actor_user_id, title: ACTIVITY_LABEL[a.kind] ?? a.kind, detail });
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
