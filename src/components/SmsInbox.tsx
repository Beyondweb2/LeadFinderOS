import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Copy, Globe, ListChecks, Link2, Loader2, Mail, MapPin, MessageSquareText, MoreHorizontal, Plus, Send, Sparkles, Star, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useInbox, type LeadLite } from '@/hooks/useInbox';
import { useLeadPermissions } from '@/hooks/useLeadPermissions';
import { useAllLoggedContacts } from '@/hooks/useLastLoggedContacts';
import { useLeadSalesState } from '@/hooks/useLeadSalesState';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState, IconTile, LoadState } from '@/components/operator/ui';
import { InboxChannelSwitch } from '@/components/InboxChannelSwitch';
import { LeadSmsPanel } from '@/components/LeadSmsPanel';
import { CampaignPicker } from '@/components/CampaignPicker';
import { PipelineStatusSelect } from '@/components/PipelineStatusSelect';
import { NextActionPill } from '@/components/NextActionPill';
import { NextActionEditor } from '@/components/NextActionEditor';
import { ConvStateChip } from '@/components/ConvStateChip';
import { SocialLinks } from '@/components/SocialLinks';
import { LeadOwnerControl } from '@/components/LeadOwnerControl';
import { HookVisibilityCard } from '@/components/HookVisibilityCard';
import { AutoReplyToggle } from '@/components/AutoReplyToggle';
import { hookVisibilityQueryKey, useHookVisibility } from '@/hooks/useHookVisibility';
import { hookAuditRequestBody } from '@/lib/hookAuditRequest';
import { OUTREACH_HOOK_QUESTIONS } from '@/lib/auditQuestionCounts';
import { auditListQueryKey } from '@/types/auditBook';
import { LeadDetailFromInbox } from '@/components/LeadDetailFromInbox';
import { assessOnboardingLink } from '@/components/OnboardingLinkCard';
import { useSmsMessages, useSmsUnread, type SmsRow } from '@/hooks/useSms';
import { PIPELINE_STATUS_OPTIONS, type PipelineStatus } from '@/types/outreach';
import { conversationState, INBOX_QUICK_FILTERS, londonToday, passesQuickFilter, type ConversationState, type InboxQuickFilter } from '@/lib/conversationState';
import { NEXT_ACTION_KIND_OPTIONS, NEXT_ACTION_WHEN_OPTIONS, nextActionSortKey, passesNextActionFilter, type NextActionKind, type NextActionWhen } from '@/lib/nextActionView';
import { salesStateOf } from '@/lib/leadState';
import { shownStatusMatches } from '@/lib/statusFilter';
import { markLeadInterested, setLeadPipelineStatus } from '@/lib/leadQuickActions';
import { updateLeadStatus } from '@/lib/leadStatus';
import { notifyLeadChanged } from '@/lib/leadSync';
import { maySetStatus } from '@/lib/access';
import { refusalText } from '@/lib/salesCrm';
import { onboardingUrl, onboardingUrlLabel } from '@/config/findableSite';
import { recordOnboardingLinkEvent } from '@/hooks/useOnboardingLink';
import { isPlausibleUkMobile, smsPillOf } from '@/lib/smsStatus';
import { outreachLeadLink } from '@/lib/salesLinks';
import { smsDeliveryState, SMS_STATE_LABEL } from '@/lib/smsMessages';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/* THE SMS TAB OF THE ONE INBOX — THE WHATSAPP INBOX'S TWIN (2026-10-09, Paul: "SMS inbox = WhatsApp inbox").
   Same page shape, same filters, same conversation rows, same header, same AI-visibility strip and the same status / star /
   next-action / owner / prospect controls — and they are the SAME COMPONENTS and the SAME WRITE PATHS (PipelineStatusSelect,
   NextActionEditor, markLeadInterested, setLeadPipelineStatus, HookVisibilityCard, LeadOwnerControl, LeadDetailFromInbox,
   conversationState/ConvStateChip, the status filter's shownStatusMatches), reading the same lead rows (useInbox). A lead's
   status can therefore never differ between the two tabs.
   What is genuinely different, and only that:
     · NO 24-HOUR WINDOW — an SMS has none, so the composer always allows free text (once the lead has been replied to or is
       past the cold opener; the cold-opener rules are the shared contact guard, unchanged) and there is no "Window open" chip.
     · the conversation is keyed by LEAD (one thread per lead), not by (user, phone).
     · NO "when a prospect replies" automation control: the SMS inbound path has no audit/auto-reply behaviour, so the control
       is not offered (it would be a switch that does nothing). Turning that on is a backend build, not a UI one.
   ⛔ A cold opener that was delivered is NOT a genuine conversation: this file draws, it never decides (the guard is server-side). */

const HEADER_ICON_BTN = 'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40';
const LIST_PAGE = 150;
const LIST_SORT_OPTIONS = [
  { value: 'recent', label: 'Newest message', short: 'Newest message' },
  { value: 'recent_reply', label: 'Most recent reply from them', short: 'Latest reply' },
  { value: 'next_action', label: 'Next action: most overdue first', short: 'Most overdue' },
] as const;

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toLocaleDateString('en-GB', { timeZone: 'Europe/London' }) === d.toLocaleDateString('en-GB', { timeZone: 'Europe/London' });
  return today ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
};

interface Conv { leadId: string; lead: LeadLite | undefined; label: string; phone: string; rows: SmsRow[]; last: SmsRow | null; lastInboundAt: string | null; hidden: boolean }

/** SmsRow → the shape conversationState reads. An SMS "undelivered" is a failure like WhatsApp's failed. */
const asConv = (rows: SmsRow[]) => rows.map((m) => ({ direction: m.direction, status: m.status === 'undelivered' ? 'failed' : m.status, created_at: m.created_at, body: m.body }));

export function SmsInbox() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useSubscription();
  const perms = useLeadPermissions();
  const { user, leads, patchLeadStatus, patchLeadPotentialWork, refetch: refetchLeads, isLoading: leadsLoading } = useInbox();
  const [params, setParams] = useSearchParams();
  const msgs = useSmsMessages();
  const unread = useSmsUnread();
  const activeId = params.get('lead');
  const scope = { tier: 'session' as const, scope: user?.id };
  const [campaignFilter, setCampaignFilter] = usePersistedState<string | null>('sms-inbox-campaign-filter', null, scope);
  const [statusFilter, setStatusFilter] = usePersistedState<string | null>('sms-inbox-status-filter', null, scope);
  const [search, setSearch] = usePersistedState<string>('sms-inbox-search', '', scope);
  const [quickFilter, setQuickFilter] = usePersistedState<InboxQuickFilter>('sms-inbox-quick-filter', 'all', scope);
  const [naWhen, setNaWhen] = usePersistedState<NextActionWhen>('sms-inbox-na-when', 'all', scope);
  const [naKind, setNaKind] = usePersistedState<NextActionKind>('sms-inbox-na-kind', 'all', scope);
  const [listSort, setListSort] = usePersistedState<'recent' | 'next_action' | 'recent_reply'>('sms-inbox-sort', 'recent', scope);
  const [showHidden, setShowHidden] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);
  const [starSaving, setStarSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);
  const [signupCopied, setSignupCopied] = useState(false);
  const [listLimit, setListLimit] = useState(LIST_PAGE);

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const allLogged = useAllLoggedContacts();
  const stageOf = useCallback((leadId: string | null) => {
    const l = leadId ? leadById.get(leadId) : undefined;
    if (!l) return null;
    const lc = allLogged.data?.get(l.id);
    return salesStateOf({ ...l, lastLogged: lc ? { outcome: lc.outcomeValue ?? '', at: lc.at, reached: lc.everReached } : null });
  }, [leadById, allLogged.data]);

  const queueRows = useQuery({
    queryKey: ['sms-queue', 'rows'], refetchInterval: 30_000,
    queryFn: async () => { const { data, error } = await sb.rpc('my_sms_queue'); if (error) throw error; return (data ?? []) as Array<{ id: string }>; },
  });
  const queuedCount = queueRows.data?.length ?? 0;

  // ── conversations: one per lead, from the texts the caller may see ────────────────────────────────────────────────────────
  const convs: Conv[] = useMemo(() => {
    const byLead = new Map<string, SmsRow[]>();
    for (const m of msgs.data ?? []) { if (!m.lead_id) continue; const a = byLead.get(m.lead_id) ?? []; a.push(m); byLead.set(m.lead_id, a); }
    const out: Conv[] = [];
    for (const [leadId, rows] of byLead) {
      const lead = leadById.get(leadId);
      const last = rows[rows.length - 1] ?? null;
      const inbound = [...rows].reverse().find((r) => r.direction === 'inbound');
      out.push({ leadId, lead, label: lead?.business_name || 'Unnamed lead', phone: last?.phone ?? lead?.phone ?? '', rows, last, lastInboundAt: inbound?.created_at ?? null,
        hidden: lead?.status === 'not_interested' || lead?.status === 'closed' });
    }
    return out.sort((a, b) => (b.last?.created_at ?? '').localeCompare(a.last?.created_at ?? ''));
  }, [msgs.data, leadById]);

  const unreadByPhone = useMemo(() => new Map((unread.data ?? []).map((u) => [u.phone, u.unread_messages])), [unread.data]);
  const stateById = useMemo(() => {
    const out = new Map<string, ConversationState>();
    const nowMs = Date.now();
    for (const c of convs) {
      const st = conversationState({
        messages: asConv(c.rows), lastReadAt: null, leadStatus: c.lead?.status ?? null, isPotentialWork: !!c.lead?.is_potential_work,
        nextAction: c.lead?.next_action, nextActionDate: c.lead?.next_action_date, nowMs,
      });
      // Unread comes from the SMS read marks (my_sms_unread_counts), not from the WhatsApp ones.
      out.set(c.leadId, { ...st, unread: (unreadByPhone.get(c.phone) ?? 0) > 0 });
    }
    return out;
  }, [convs, unreadByPhone]);
  const quickCounts = useMemo(() => {
    let u = 0; let w = 0;
    for (const st of stateById.values()) { if (st.unread) u++; if (st.waitingSinceMs !== null) w++; }
    return { unread: u, waiting: w };
  }, [stateById]);

  const term = search.trim().toLowerCase();
  const hiddenCount = useMemo(() => convs.filter((c) => c.hidden).length, [convs]);
  const filtered = useMemo(() => {
    let list = convs;
    if (campaignFilter) list = list.filter((c) => c.lead?.campaign_id === campaignFilter);
    if (statusFilter) list = list.filter((c) => !!c.lead && (shownStatusMatches(statusFilter, { status: c.lead.status, is_potential_work: c.lead.is_potential_work }, stageOf(c.leadId)) || (c.lead.amount_paid ?? 0) > 0));
    const reveal = showHidden || statusFilter === 'not_interested' || statusFilter === 'closed';
    if (!reveal) list = list.filter((c) => !c.hidden);
    if (term) list = list.filter((c) => c.label.toLowerCase().includes(term) || c.phone.includes(term.replace(/\D/g, '') || '§'));
    const today = londonToday();
    if (naWhen !== 'all' || naKind !== 'all') list = list.filter((c) => passesNextActionFilter(c.lead ?? null, naWhen, naKind, today));
    const kept = quickFilter === 'all' ? [...list] : list.filter((c) => { const st = stateById.get(c.leadId); return !!st && passesQuickFilter(quickFilter, st); });
    if (listSort === 'next_action') kept.sort((a, b) => nextActionSortKey(a.lead ?? null).localeCompare(nextActionSortKey(b.lead ?? null)));
    else if (listSort === 'recent_reply') kept.sort((a, b) => (b.lastInboundAt ?? '').localeCompare(a.lastInboundAt ?? ''));
    else if (quickFilter === 'waiting') kept.sort((a, b) => (stateById.get(a.leadId)?.waitingSinceMs ?? 0) - (stateById.get(b.leadId)?.waitingSinceMs ?? 0));
    return kept;
  }, [convs, campaignFilter, statusFilter, showHidden, term, naWhen, naKind, quickFilter, listSort, stateById, stageOf]);
  useEffect(() => { setListLimit(LIST_PAGE); }, [term, campaignFilter, statusFilter, quickFilter, naWhen, naKind, listSort]);
  const naFiltered = naWhen !== 'all' || naKind !== 'all' || listSort !== 'recent';

  const open = (leadId: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (leadId) n.set('lead', leadId); else n.delete('lead'); return n; });

  // The open conversation: an existing thread, or a lead started from "New" that has no texts yet.
  const active: Conv | null = useMemo(() => {
    if (!activeId) return null;
    const c = convs.find((x) => x.leadId === activeId);
    if (c) return c;
    const lead = leadById.get(activeId);
    return lead ? { leadId: lead.id, lead, label: lead.business_name || 'Unnamed lead', phone: lead.phone, rows: [], last: null, lastInboundAt: null, hidden: false } : null;
  }, [activeId, convs, leadById]);
  const shown = useMemo(() => {
    const head = filtered.slice(0, listLimit);
    if (!active || head.some((c) => c.leadId === active.leadId) || !convs.some((c) => c.leadId === active.leadId)) return head;
    return [active, ...head];
  }, [filtered, listLimit, active, convs]);
  const activeOutsideFilters = !!active && convs.some((c) => c.leadId === active.leadId) && !filtered.some((c) => c.leadId === active.leadId);
  const activeLead = active?.lead;
  const activeSales = useLeadSalesState(active?.leadId ?? '');
  const activeState = active ? stateById.get(active.leadId) : undefined;

  // ── the same write paths as the WhatsApp tab ──────────────────────────────────────────────────────────────────────────────
  const toggleStar = async (c: Conv) => {
    const on = !c.lead?.is_potential_work;
    setStarSaving(true);
    try {
      const r = await markLeadInterested(c.leadId, perms.editLeadRecord, on);
      if (!r.ok) { toast({ title: on ? 'Could not mark interested' : 'Could not remove the star', description: r.error, variant: 'destructive' }); return; }
      patchLeadPotentialWork(c.leadId, on);
    } finally { setStarSaving(false); }
  };
  const handleSetStatus = async (c: Conv, status: PipelineStatus): Promise<boolean> => {
    const cur = c.lead?.status ?? null;
    if (status === cur && (status !== 'interested' || c.lead?.is_potential_work)) return false;
    if (!maySetStatus(perms, status)) { toast({ title: 'Admin only', description: refusalText('stage_not_allowed'), variant: 'destructive' }); return false; }
    if (status === 'interested') {
      const r = await markLeadInterested(c.leadId, perms.editLeadRecord);
      if (!r.ok) { toast({ title: 'Could not mark interested', description: r.error, variant: 'destructive' }); return false; }
      patchLeadPotentialWork(c.leadId, true);
      toast({ title: 'Marked interested', description: 'The pipeline status was left unchanged.' });
      return true;
    }
    if (cur === 'payment_received' && status !== 'payment_received') {
      if (!window.confirm(`${c.label} is marked Paid. Change it to "${status.replace(/_/g, ' ')}"? This removes it from the paid state.`)) return false;
    }
    setSavingStatusId(c.leadId);
    try {
      const r = await setLeadPipelineStatus(c.leadId, status, perms.editLeadRecord);
      if (!r.ok) { toast({ title: 'Could not update status', description: r.error, variant: 'destructive' }); return false; }
      patchLeadStatus(c.leadId, status);
      if (status === 'not_interested') toast({ title: 'Marked not interested', description: 'Hidden from the list — reappears if they reply.' });
      return true;
    } finally { setSavingStatusId(null); }
  };
  const removeFromInbox = async (c: Conv) => {
    if (!window.confirm(`Remove ${c.label} from the inbox? This marks the lead Closed. It stays in Outreach and reappears here if they reply.`)) return;
    setRemovingId(c.leadId);
    try {
      const { error } = await updateLeadStatus(c.leadId, 'closed');
      if (error) { toast({ title: 'Could not remove', description: error, variant: 'destructive' }); return; }
      notifyLeadChanged(c.leadId);
      patchLeadStatus(c.leadId, 'closed');
      if (activeId === c.leadId) open(null);
      toast({ title: 'Removed from inbox', description: 'Marked Closed — reappears if they reply.' });
    } finally { setRemovingId(null); }
  };
  const handleSendNow = async () => {
    setSendingNow(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-sms-queue', { body: { send_now: true } });
      if (error) throw error;
      if (data?.sent) toast({ title: 'Sent next text', description: data.simulated ? 'Test mode — nothing real was sent' : undefined });
      else {
        const reason: Record<string, string> = { paused: 'Queue is paused', cap_reached: 'Daily cap reached', outside_window: 'Outside sending hours', empty_queue: 'Nothing queued to send', all_held: 'Everything queued is on hold' };
        toast({ title: reason[data?.skipped as string] ?? (data?.error ? `Not sent (${data.error})` : `No send (${data?.skipped ?? 'unknown'})`) });
      }
      void qc.invalidateQueries({ queryKey: ['sms-queue'] });
    } catch (e) {
      toast({ title: "Couldn't send now", description: (e as Error)?.message ?? 'Failed', variant: 'destructive' });
    } finally { setSendingNow(false); }
  };

  /* RUN AI AUDIT (header) — the WhatsApp card's "Run new" request, one body (hookAuditRequestBody): a NEW 3 × 2 hook audit that NEVER queues a
     pitch and sends nothing to the lead. The WhatsApp header button also queues a WhatsApp pitch; that is deliberately not offered on texts. */
  const hookData = useHookVisibility(active?.leadId ?? null).data;
  const [auditBusy, setAuditBusy] = useState(false);
  const runAudit = async () => {
    if (!active || !activeLead || auditBusy) return;
    const old = hookData?.audit ?? null;
    const bizType = (old?.business_type || activeLead.category || activeLead.search_keyword || '').trim();
    const loc = (old?.location_text || activeLead.search_location || activeLead.address || '').trim();
    if (!bizType || !loc) { toast({ title: 'Need a trade and a town', description: 'Add them in the Prospect workspace first.', variant: 'destructive' }); return; }
    if (!window.confirm(`Run a new ${OUTREACH_HOOK_QUESTIONS} questions × ChatGPT + Google AI audit for ${activeLead.business_name}?\n\nThe old result is kept. Nothing is sent to the lead.`)) return;
    setAuditBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-ai-audit', { body: hookAuditRequestBody(activeLead, bizType, loc, old?.business_name) });
      if (error || !data?.ok) { toast({ title: "Couldn't start the audit", description: error?.message ?? data?.detail ?? data?.error ?? 'Try again', variant: 'destructive' }); return; }
      void qc.invalidateQueries({ queryKey: auditListQueryKey(user?.id) });
      await qc.invalidateQueries({ queryKey: hookVisibilityQueryKey(active.leadId) });
      toast({ title: 'New audit started', description: `${OUTREACH_HOOK_QUESTIONS} questions × ChatGPT + Google AI. The old result is kept, and nothing will be sent.` });
    } finally { setAuditBusy(false); }
  };

  const signupLink = activeLead ? assessOnboardingLink(activeLead) : null;
  const copySignupLink = async () => {
    if (!activeLead) return;
    try {
      await navigator.clipboard.writeText(onboardingUrl(activeLead.id, activeLead.business_name));
      setSignupCopied(true); setTimeout(() => setSignupCopied(false), 1500);
      void recordOnboardingLinkEvent(activeLead.id, 'generated', null);
    } catch { window.prompt('Copy the sign-up link:', onboardingUrl(activeLead.id, activeLead.business_name)); }
  };
  const mapsUrl = activeLead?.google_maps_url || (activeLead?.place_id ? `https://www.google.com/maps/place/?q=place_id:${activeLead.place_id}` : null);
  const websiteUrl = activeLead?.website ? (/^https?:\/\//i.test(activeLead.website) ? activeLead.website : `https://${activeLead.website}`) : null;

  // "New": only leads whose number can be texted at all (a plausible UK mobile that is not already No SMS).
  const newChoices = useMemo(() => leads.filter((l) => isPlausibleUkMobile(l.phone) && smsPillOf(l) !== 'no_sms'), [leads]);

  const loading = msgs.isLoading || leadsLoading;

  return (
    <div className="space-y-4 md:flex md:h-[calc(100dvh-6.5rem)] md:min-h-[560px] md:flex-col md:space-y-2 lg:h-[calc(100dvh-7.5rem)]" data-testid="sms-inbox">
      <div className={cn('space-y-3 md:shrink-0', active && 'hidden md:block')}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <h1 className="flex shrink-0 items-center gap-2.5 text-xl font-extrabold leading-tight tracking-tight sm:text-2xl"><IconTile icon={MessageSquareText} tone="blue" />Inbox</h1>
            <InboxChannelSwitch current="sms" />
            <p className="hidden truncate text-sm text-muted-foreground min-[1760px]:block">Every text conversation with your leads.</p>
          </div>
          {/* The ONE reply rule's control (admin-only — hides itself otherwise). Same setting as WhatsApp; "Audit and reply" is disabled for texts. */}
          {perms.queueControls && <AutoReplyToggle channel="sms" />}
          <div className="flex shrink-0 items-center gap-2">
            {queuedCount > 0 && <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300" data-testid="sms-queued-count">{queuedCount} queued</span>}
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => void handleSendNow()} disabled={sendingNow} aria-label="Send now" data-testid="sms-send-now"
                title="Send the next queued text now — skips only the pacing wait; still respects pause, the daily cap and the sending window">
                {sendingNow ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1.5" /> : <Send className="h-4 w-4 sm:mr-1.5" />}<span className="hidden sm:inline">Send now</span>
              </Button>
            )}
            <Button size="sm" onClick={() => setNewOpen((v) => !v)} data-testid="sms-new"><Plus className="mr-1.5 h-4 w-4" /> New</Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6 xl:flex xl:flex-nowrap xl:items-center" role="group" aria-label="Filter conversations">
          {perms.campaigns && <CampaignPicker mode="filter" hideCreate value={campaignFilter} onChange={setCampaignFilter} className={cn('h-9 w-full md:col-span-2 xl:w-[170px]', campaignFilter && 'border-primary/50 text-primary')} />}
          <Select value={statusFilter ?? '__all__'} onValueChange={(v) => setStatusFilter(v === '__all__' ? null : v)}>
            <SelectTrigger className={cn('h-9 xl:w-[170px]', perms.campaigns ? 'md:col-span-2' : 'md:col-span-3', statusFilter && 'border-primary/50 text-primary')} aria-label="Lead status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All statuses</SelectItem>
              {PIPELINE_STATUS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={naWhen} onValueChange={(v) => setNaWhen(v as NextActionWhen)}>
            <SelectTrigger className={cn('h-9 xl:w-[160px]', perms.campaigns ? 'md:col-span-2' : 'md:col-span-3', naWhen !== 'all' && 'border-primary/50 text-primary')} aria-label="Next action due"><SelectValue /></SelectTrigger>
            <SelectContent>{NEXT_ACTION_WHEN_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={naKind} onValueChange={(v) => setNaKind(v as NextActionKind)}>
            <SelectTrigger className={cn('h-9 md:col-span-3 xl:w-[160px]', naKind !== 'all' && 'border-primary/50 text-primary')} aria-label="Next action type"><SelectValue /></SelectTrigger>
            <SelectContent>{NEXT_ACTION_KIND_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={listSort} onValueChange={(v) => setListSort(v as typeof listSort)}>
            <SelectTrigger className={cn('h-9 md:col-span-3 xl:w-[200px]', perms.campaigns && 'col-span-2', listSort !== 'recent' && 'border-primary/50 text-primary')} aria-label="Sort conversations"><span className="truncate"><span className="mr-1.5 text-muted-foreground">Sort:</span>{LIST_SORT_OPTIONS.find((o) => o.value === listSort)?.short}</span></SelectTrigger>
            <SelectContent>{LIST_SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {newOpen && (
        <Card className="p-3 md:shrink-0">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Start a text conversation with one of your leads (UK mobile numbers only):</p>
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {newChoices.length === 0 ? <p className="text-xs text-muted-foreground/60">No leads with a UK mobile number.</p>
              : newChoices.map((l) => (
                <button key={l.id} type="button" onClick={() => { open(l.id); setNewOpen(false); }} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/50" data-testid="sms-new-choice">
                  <span className="truncate">{l.business_name || '(no name)'}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">{l.phone}</span>
                </button>
              ))}
          </div>
        </Card>
      )}

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 md:min-h-0 md:flex-1 md:grid-cols-[300px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
        {/* Conversation list */}
        <Card className={cn('min-w-0 overflow-y-auto p-1.5 md:h-full md:max-h-none', active ? 'hidden md:block' : 'min-h-[50vh]')} aria-label="Conversations">
          <div className="mb-1.5 grid grid-cols-2 gap-1 px-0.5" role="tablist" aria-label="Show conversations">
            {INBOX_QUICK_FILTERS.map((f) => {
              const n = f.value === 'unread' ? quickCounts.unread : f.value === 'waiting' ? quickCounts.waiting : null;
              const on = quickFilter === f.value;
              return (
                <button key={f.value} type="button" role="tab" aria-selected={on} onClick={() => setQuickFilter(f.value)}
                  className={cn('flex h-8 items-center justify-center gap-1 whitespace-nowrap rounded-md px-1.5 text-xs font-medium transition-colors',
                    on ? 'bg-blue-500/15 text-blue-700 ring-1 ring-blue-500/30 dark:text-blue-300' : 'text-muted-foreground hover:bg-muted/60')}>
                  {f.label}{n !== null && n > 0 && <span className={cn('rounded-full px-1.5 text-[10px] font-bold tabular-nums', on ? 'bg-blue-500 text-white' : 'bg-muted text-foreground')}>{n}</span>}
                </button>
              );
            })}
          </div>
          {(hiddenCount > 0 || showHidden) && (
            <button onClick={() => setShowHidden((v) => !v)} className="mb-1 w-full rounded-md px-2.5 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted/50">
              {showHidden ? '← Hide closed / not-interested' : `Show hidden (${hiddenCount})`}
            </button>
          )}
          <div className="relative mb-1.5 px-0.5">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by business name…" className="h-8 pr-7 text-xs md:text-xs" aria-label="Search conversations by business name" data-testid="sms-search" />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">✕</button>}
          </div>
          {naFiltered && (
            <div className="mb-1.5 px-0.5">
              <button type="button" onClick={() => { setNaWhen('all'); setNaKind('all'); setListSort('recent'); }} className="text-left text-[11px] font-medium text-primary hover:underline">
                Reset next action filters · {filtered.length} shown
              </button>
            </div>
          )}
          {loading ? <LoadState className="h-full" label="Loading conversations…" />
            : msgs.isError ? <div className="flex h-full items-center justify-center p-3"><ErrorState className="w-full" title="Couldn’t load conversations." onRetry={() => { void msgs.refetch(); void refetchLeads(); }} retryLabel="Retry" /></div>
            : shown.length === 0 ? (
              <div className="flex h-full items-center justify-center p-3">
                <EmptyState icon={MessageSquareText} className="w-full" title={term ? <>No conversations match “{search.trim()}”.</> : 'No conversations yet.'} testId="sms-empty">
                  {term ? 'Clear the search to see the full list.' : 'Start one with “New”, or replies will appear here as they arrive.'}
                </EmptyState>
              </div>
            ) : shown.map((c) => {
              const st = stateById.get(c.leadId);
              return (
                <div key={c.leadId} role="button" tabIndex={0} onClick={() => open(c.leadId)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(c.leadId); } }}
                  data-testid="sms-conv" data-unread={st?.unread ? 'true' : 'false'}
                  className={cn('relative flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-2.5 py-2.5 text-left transition-colors md:py-2',
                    activeId === c.leadId ? 'bg-muted' : 'hover:bg-muted/50', st?.unread && activeId !== c.leadId && 'bg-blue-500/[0.06]')}>
                  {st?.unread && <span className="absolute left-0.5 top-3.5 h-2 w-2 rounded-full bg-blue-500" aria-label="Unread" />}
                  {activeOutsideFilters && activeId === c.leadId && <span className="text-[10px] font-medium text-primary">Opened · outside your current filters</span>}
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                      <span className={cn('truncate', st?.unread && 'font-bold')}>{c.label}</span>
                      {c.lead?.is_potential_work && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500"><title>Interested</title></Star>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <ConvStateChip state={st} compact />
                      {c.last && <span className={cn('text-[10px]', st?.unread ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-muted-foreground')}>{when(c.last.created_at)}</span>}
                    </span>
                  </div>
                  {c.last && <span className="truncate text-xs text-muted-foreground">{c.last.direction === 'outbound' ? 'You: ' : ''}{c.last.body}</span>}
                  {c.last && <span className="text-[10px] text-muted-foreground/80">{SMS_STATE_LABEL[smsDeliveryState(c.rows)]}</span>}
                  {c.lead && (
                    <div className="mt-0.5 flex items-center gap-1">
                      {savingStatusId === c.leadId
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        : <PipelineStatusSelect value={c.lead.status as PipelineStatus} stage={stageOf(c.leadId)} onValueChange={(status) => handleSetStatus(c, status)} askReasonFor={{ leadId: c.leadId, businessName: c.label }} />}
                      <NextActionPill lead={c.lead} size="xs" className="ml-auto" />
                    </div>
                  )}
                </div>
              );
            })}
          {filtered.length > listLimit && (
            <button type="button" onClick={() => setListLimit((n) => n + LIST_PAGE)} className="mx-2 my-2 rounded-md border border-border/60 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50">
              Show {Math.min(LIST_PAGE, filtered.length - listLimit)} more ({listLimit} of {filtered.length} shown)
            </button>
          )}
        </Card>

        {/* Thread + reply */}
        <Card className={cn('min-w-0 flex-col overflow-hidden md:flex md:h-full', active ? 'flex h-[calc(100dvh-10.5rem)]' : 'hidden')} aria-label="Conversation">
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
              <MessageSquareText className="mb-2 h-7 w-7 opacity-30" />
              <p className="text-sm">Select a conversation</p>
            </div>
          ) : (
            <>
              <div className="space-y-0.5 border-b border-border px-3 py-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <button type="button" onClick={() => open(null)} className="-ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-muted md:hidden" aria-label="Back to all conversations"><ArrowLeft className="h-5 w-5" /></button>
                  <p className="flex min-w-0 items-center gap-1 text-sm font-semibold"><span className="truncate">{active.label}</span></p>
                  <button type="button" disabled={starSaving} onClick={() => void toggleStar(active)}
                    title={activeLead?.is_potential_work ? 'Interested — click to remove the star' : 'Mark as interested (star)'}
                    aria-label={activeLead?.is_potential_work ? 'Remove interested star' : 'Mark as interested'} aria-pressed={!!activeLead?.is_potential_work}
                    className="-ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-muted disabled:opacity-50">
                    <Star className={cn('h-4 w-4', activeLead?.is_potential_work ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground/60')} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {activeLead && (savingStatusId === active.leadId
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      : <PipelineStatusSelect value={activeLead.status as PipelineStatus} stage={activeSales.view} onValueChange={(status) => handleSetStatus(active, status)} askReasonFor={{ leadId: active.leadId, businessName: active.label }} />)}
                    {activeLead && <NextActionEditor lead={activeLead} variant="pill" />}
                    <ConvStateChip state={activeState} hideQueued />
                    {activeLead && <SocialLinks lead={activeLead} size="xs" />}
                  </div>
                  <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1">
                    <button type="button" onClick={() => setDetailLeadId(active.leadId)} title="Open the prospect: log a call, scripts, next action, notes, sign-up link" aria-label="Open prospect workspace" data-testid="sms-open-lead"
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 text-xs font-semibold text-primary hover:bg-primary/20">
                      <ListChecks className="h-3.5 w-3.5" />Prospect
                    </button>
                    <button type="button" onClick={() => void runAudit()} disabled={auditBusy} title="Run a new AI visibility check (sends nothing to the lead)" aria-label="Run AI audit" data-testid="sms-run-audit" className={HEADER_ICON_BTN}>
                      {auditBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    </button>
                    <LeadOwnerControl leadId={active.leadId} />
                    {activeLead && signupLink && !signupLink.paid && (
                      <button type="button" onClick={() => void copySignupLink()} aria-label={signupLink.blocking ? `Copy sign-up link. Warning: ${signupLink.warnings.join('; ')}` : 'Copy sign-up link'}
                        title={[signupCopied ? 'Copied' : 'Copy sign-up link', onboardingUrlLabel(activeLead.id, activeLead.business_name), ...signupLink.warnings.map((w) => `! ${w}`)].join('\n')}
                        className={cn(HEADER_ICON_BTN, 'relative', signupLink.blocking && 'text-orange-400 hover:text-orange-300')}>
                        {signupCopied ? <Check className="h-4 w-4 text-green-500" /> : <Link2 className="h-4 w-4" />}
                        {signupLink.warnings.length > 0 && <span aria-hidden="true" className={cn('absolute right-0.5 top-0.5 h-2 w-2 rounded-full ring-1 ring-background', signupLink.blocking ? 'bg-orange-500' : 'bg-amber-400')} />}
                      </button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" title="More: Maps, website, email, remove" aria-label="More actions" className={HEADER_ICON_BTN}>
                          {removingId === active.leadId ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {mapsUrl && <DropdownMenuItem asChild><a href={mapsUrl} target="_blank" rel="noreferrer"><MapPin className="mr-2 h-4 w-4" />Open in Google Maps</a></DropdownMenuItem>}
                        {websiteUrl && <DropdownMenuItem asChild><a href={websiteUrl} target="_blank" rel="noreferrer"><Globe className="mr-2 h-4 w-4" />Open the website</a></DropdownMenuItem>}
                        {activeLead?.email && <DropdownMenuItem asChild><a href={`mailto:${activeLead.email}`}><Mail className="mr-2 h-4 w-4" /><span className="truncate">Email {activeLead.email}</span></a></DropdownMenuItem>}
                        <DropdownMenuItem onClick={() => { void navigator.clipboard?.writeText(active.phone.startsWith('+') ? active.phone : `+${active.phone}`); toast({ title: 'Number copied', description: active.phone }); }}>
                          <Copy className="mr-2 h-4 w-4" /><span className="tabular-nums">{active.phone}</span><span className="ml-auto text-[10px] text-muted-foreground">Copy</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(outreachLeadLink(active.leadId))}>Open in Outreach</DropdownMenuItem>
                        {maySetStatus(perms, 'closed') && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => void removeFromInbox(active)} disabled={removingId === active.leadId} className="text-destructive focus:text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />Remove from inbox (mark Closed)
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>

              {/* AI visibility strip — View full audit / Open report / Copy link, the same card as the WhatsApp tab. */}
              <HookVisibilityCard leadId={active.leadId} onRunNew={() => void runAudit()} runNewBusy={auditBusy} />

              {/* The conversation + composer. No 24-hour window on SMS: nothing here closes after a day. */}
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <LeadSmsPanel leadId={active.leadId} height="max-h-[calc(100dvh-27rem)] min-h-[140px]" />
              </div>
            </>
          )}
        </Card>
      </div>

      <LeadDetailFromInbox leadId={detailLeadId} open={!!detailLeadId} onOpenChange={(o) => { if (!o) setDetailLeadId(null); }} onStatusPatched={patchLeadStatus} />
    </div>
  );
}
