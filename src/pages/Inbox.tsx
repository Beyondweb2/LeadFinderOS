import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useInbox, windowFor, normalizeWaNumber, WA_REPLY_TEMPLATES, type WaConversation, type LeadLite } from '@/hooks/useInbox';
import { useToast } from '@/hooks/use-toast';
import { useTemplates } from '@/hooks/useTemplates';
import { useSubscription } from '@/hooks/useSubscription';
import { usePersistedState } from '@/hooks/usePersistedState';
import { supabase } from '@/integrations/supabase/client';
import { fillTemplate } from '@/lib/leadUtils';
import { barberSitePreviewUrl } from '@/config/publicSite';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { CampaignPicker } from '@/components/CampaignPicker';
import { PipelineStatusSelect } from '@/components/PipelineStatusSelect';
import { updateLeadStatus } from '@/lib/leadStatus';
import { PIPELINE_STATUS_OPTIONS, type PipelineStatus } from '@/types/outreach';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Loader2, Send, MessageSquare, MessageSquarePlus, Clock, AlertTriangle, Plus, ShieldAlert, ExternalLink, MapPin, Globe, Mail, MessageCircle, Trash2, ListChecks } from 'lucide-react';

// Shared style for the compact thread-header quick-action icon buttons/links.
const HEADER_ICON_BTN = 'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40';

function relTime(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

// Fallback label for legacy template rows sent before the body was stored (body null).
function templateLabel(name: string | null): string {
  if (!name) return '';
  const t = WA_REPLY_TEMPLATES.find((x) => x.name === name);
  return `📄 ${t ? t.label : name}`;
}

// Clean display names for templates (incl. the legacy pre-rename name). Unknown → "Template".
const TEMPLATE_DISPLAY: Record<string, string> = {
  booking_page_intro: 'Booking page intro',
  no_website_barbers: 'Free website intro',
  free_website_intro: 'Free website intro', // legacy name (pre-rename)
  barber_poor_website: 'Updated website intro',
  booking_switch_barbers: 'Booking switch (no commission)',
  barber_fresha_booksy: 'Fresha/Booksy switch',
};
function friendlyTemplate(name: string | null | undefined): string {
  return (name && TEMPLATE_DISPLAY[name]) || 'Template';
}

/** Conversation-list preview only: never surface a raw template name. If the body is
 *  empty or itself looks like a raw snake_case template name, show a friendly label. */
function listPreview(m: { body: string | null; template_name: string | null }): string {
  const body = (m.body ?? '').trim();
  const looksRaw = !body || /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(body);
  if (!looksRaw) return body;
  return `📄 ${friendlyTemplate(m.template_name ?? (body || null))}`;
}

const Inbox = () => {
  const { user, conversations, messagesForKey, leads, sitesByLeadId, isLoading, send, refetch, patchLeadStatus } = useInbox();
  const { toast } = useToast();
  const { templates } = useTemplates(); // same source as the Templates page ("Texts" tab)
  const { isAdmin } = useSubscription(); // gates the admin-only "Send now" button
  const navigate = useNavigate();
  const [sendingNow, setSendingNow] = useState(false);

  // Admin "Send now": force the next queued WhatsApp message to send immediately,
  // SKIPPING ONLY the pacing wait (send_now). It still respects pause, the daily cap
  // and the sending window (the edge guards those). Admin-gated server-side too (403
  // for non-admins) — the button is also hidden below unless isAdmin.
  const handleSendNow = async () => {
    setSendingNow(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-whatsapp-queue', { body: { mode: 'tick', send_now: true } });
      if (error) throw error;
      if (data?.sent) {
        toast({ title: 'Sent next message', description: `${data.business ?? ''}${data.simulated ? ' — TEST_MODE, nothing real sent' : ''}`.trim() || undefined });
      } else {
        const reason: Record<string, string> = {
          paused: 'Queue is paused',
          cap_reached: 'Daily cap reached',
          outside_window: 'Outside sending hours',
          empty_queue: 'Nothing queued to send',
        };
        toast({ title: reason[data?.skipped as string] ?? `No send (${data?.skipped ?? 'unknown'})` });
      }
    } catch (e) {
      toast({ title: "Couldn't send now", description: (e as Error)?.message ?? 'Failed', variant: 'destructive' });
    } finally {
      setSendingNow(false);
    }
  };

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [synthetic, setSynthetic] = useState<WaConversation | null>(null);
  // Campaign filter (null = all). Unassigned conversations are ALWAYS shown, even
  // when a specific campaign is selected — that's where mis-routed / unknown-sender
  // replies land and must never be hidden.
  // Persisted per-user (sessionStorage) so the filter survives navigating away and back.
  const [campaignFilter, setCampaignFilter] = usePersistedState<string | null>('inbox-campaign-filter', null, { tier: 'session', scope: user?.id });
  // Status filter (null = all statuses). Composes with the campaign filter (AND).
  // Unassigned stays visible regardless (never hidden by a filter).
  const [statusFilter, setStatusFilter] = usePersistedState<string | null>('inbox-status-filter', null, { tier: 'session', scope: user?.id });
  // Not-interested conversations are hidden by default (dead prospects); a toggle
  // reveals them. A new inbound reply flips the lead back to 'replied' server-side
  // (whatsapp-inbound), so re-engaging conversations reappear on their own.
  const [showHidden, setShowHidden] = useState(false);
  const [savingStatusKey, setSavingStatusKey] = useState<string | null>(null);
  // Remove-from-inbox (status → 'closed'): in-flight spinner + optimistic hide keys.
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [template, setTemplate] = useState(WA_REPLY_TEMPLATES[0].name);
  const [sending, setSending] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  // The list shows fetched conversations; a just-started (synthetic) one is merged in
  // until its first message lands (after which the real row shares its key).
  const list = useMemo(() => {
    const base = synthetic && !conversations.some((c) => c.key === synthetic.key)
      ? [synthetic, ...conversations]
      : conversations;
    // Campaign + status filters both keep Unassigned ALWAYS visible (never hide the
    // mis-routed/unknown-sender bucket), and compose as AND for assigned convos.
    const byCampaign = !campaignFilter
      ? base
      : base.filter((c) => c.campaignId === campaignFilter || c.unassigned);
    // Site-milestone sentinels filter on generated_sites data (already loaded in
    // sitesByLeadId), NOT lead status. Presence-based/cumulative: a claimed lead also
    // matches Opened, etc. Unassigned stays visible, matching the status-filter convention.
    const byStatus = !statusFilter
      ? byCampaign
      : statusFilter === '__opened__'
        ? byCampaign.filter((c) => (c.leadId && sitesByLeadId[c.leadId]?.firstOpenedAt != null) || c.unassigned)
        : statusFilter === '__claimed__'
          ? byCampaign.filter((c) => (c.leadId && sitesByLeadId[c.leadId]?.claimedAt != null) || c.unassigned)
          : statusFilter === '__upsell__'
            ? byCampaign.filter((c) => (c.leadId && sitesByLeadId[c.leadId]?.addonInterestAt != null) || c.unassigned)
            : byCampaign.filter((c) => c.leadStatus === statusFilter || c.unassigned);
    // Hide dead-state convos (not_interested / closed) unless "Show hidden" is on OR
    // the user has explicitly filtered TO that status. `removedKeys` gives an instant
    // optimistic drop right after "Remove from inbox" (before the refetch lands).
    const revealHidden = showHidden || statusFilter === 'not_interested' || statusFilter === 'closed';
    const visible = revealHidden
      ? byStatus
      : byStatus.filter((c) => c.leadStatus !== 'not_interested' && c.leadStatus !== 'closed');
    return visible.filter((c) => !removedKeys.has(c.key));
  }, [conversations, synthetic, campaignFilter, statusFilter, showHidden, removedKeys, sitesByLeadId]);

  // How many not_interested conversations the current view is hiding (for the toggle).
  const hiddenCount = useMemo(() => {
    const base = campaignFilter ? conversations.filter((c) => c.campaignId === campaignFilter || c.unassigned) : conversations;
    return base.filter((c) => c.leadStatus === 'not_interested' || c.leadStatus === 'closed').length;
  }, [conversations, campaignFilter]);

  // Set a conversation's lead status from the Inbox (two-way sync with Outreach).
  // Manual override — no forward-only guard — EXCEPT a confirm when moving a paying
  // customer AWAY from payment_received (mis-click protection).
  const handleSetStatus = async (c: WaConversation, status: PipelineStatus) => {
    if (!c.leadId || status === c.leadStatus) return;
    if (c.leadStatus === 'payment_received' && status !== 'payment_received') {
      if (!window.confirm(`${c.label} is marked Paid. Change it to "${status.replace(/_/g, ' ')}"? This removes it from the paid state.`)) return;
    }
    setSavingStatusKey(c.key);
    try {
      const { error } = await updateLeadStatus(c.leadId, status);
      if (error) { toast({ title: 'Could not update status', description: error, variant: 'destructive' }); return; }
      patchLeadStatus(c.leadId, status); // optimistic local update — no full re-query/spinner
      if (status === 'not_interested') toast({ title: 'Marked not interested', description: 'Hidden from the list — reappears if they reply.' });
    } finally {
      setSavingStatusKey(null);
    }
  };

  // Remove a conversation from the Inbox: set its lead to 'closed' (a real status
  // change, so confirm first), optimistically drop it now, then hand ownership to the
  // default hide filter once the refetch lands. It stays in Outreach and reappears
  // here if the prospect replies (whatsapp-inbound flips it back to 'replied').
  const handleRemoveFromInbox = async (c: WaConversation) => {
    if (!c.leadId) return;
    if (!window.confirm(`Remove ${c.label} from the inbox? This marks the lead Closed. It stays in Outreach and reappears here if they reply.`)) return;
    setRemovingKey(c.key);
    try {
      const { error } = await updateLeadStatus(c.leadId, 'closed');
      if (error) { toast({ title: 'Could not remove', description: error, variant: 'destructive' }); return; }
      setRemovedKeys((prev) => new Set(prev).add(c.key)); // optimistic hide
      if (activeKey === c.key) setActiveKey(null);
      toast({ title: 'Removed from inbox', description: 'Marked Closed — reappears if they reply.' });
      await refetch();
      // Refetch now reports leadStatus='closed', so the hide filter owns it (still
      // visible under "Show hidden"); release the manual key so it isn't double-hidden.
      setRemovedKeys((prev) => { const n = new Set(prev); n.delete(c.key); return n; });
    } finally {
      setRemovingKey(null);
    }
  };

  const active: WaConversation | null =
    (activeKey && conversations.find((c) => c.key === activeKey)) ||
    (activeKey && synthetic?.key === activeKey ? synthetic : null) || null;

  const thread = active ? messagesForKey(active.key) : [];
  const win = active ? windowFor(active.lastInboundAt) : { open: false, hoursLeft: 0 };

  // Quick-reply scripts = the saved TEXT templates (not voice). Placeholders are filled
  // from the conversation's lead where possible, then inserted (editable, not auto-sent).
  const textTemplates = useMemo(() => templates.filter((t) => t.template_type === 'text'), [templates]);
  const activeLead = active?.leadId ? leads.find((l) => l.id === active.leadId) : undefined;
  const activeBusinessName = activeLead?.business_name;
  const insertTemplate = (content: string) => setText(fillTemplate(content, { businessName: activeBusinessName }));

  // Thread-header quick-action data — each button/link renders only when present.
  const activeSite = active?.leadId ? sitesByLeadId[active.leadId] : undefined;
  const sitePreviewUrl = activeSite?.shareToken ? barberSitePreviewUrl(activeSite.shareToken) : null;
  const mapsUrl = activeLead?.google_maps_url
    || (activeLead?.place_id ? `https://www.google.com/maps/place/?q=place_id:${activeLead.place_id}` : null);
  const websiteUrl = activeLead?.website
    ? (/^https?:\/\//i.test(activeLead.website) ? activeLead.website : `https://${activeLead.website}`)
    : null;

  const startFromLead = (lead: LeadLite) => {
    const norm = normalizeWaNumber(lead.phone, lead.country);
    if (!norm || !user) { toast({ title: 'No usable number', variant: 'destructive' }); return; }
    const key = `${user.id}::${norm}`;
    const existing = conversations.find((c) => c.key === key);
    if (existing) { setActiveKey(existing.key); setSynthetic(null); }
    else {
      const synth: WaConversation = {
        key, phone: norm, userId: user.id, leadId: lead.id,
        campaignId: lead.campaign_id ?? null,
        leadStatus: lead.status ?? null,
        label: lead.business_name || `+${norm}`, unassigned: false,
        lastMessage: undefined as never, lastMessageAt: new Date(0).toISOString(), lastInboundAt: null,
      };
      setSynthetic(synth);
      setActiveKey(key);
    }
    setNewOpen(false);
    setText('');
  };

  // Launch from the Outreach WhatsApp button / dashboard jump: open that lead's thread.
  const location = useLocation();
  const launchConsumed = useRef(false);
  useEffect(() => {
    const launch = (location.state as { launch?: { leadId?: string } } | null)?.launch;
    if (!launch?.leadId || launchConsumed.current || isLoading) return;
    launchConsumed.current = true;
    window.history.replaceState({}, document.title); // consume once (refresh/back won't relaunch)
    const lead = leads.find((l) => l.id === launch.leadId);
    if (lead) startFromLead(lead);
    else toast({ title: 'No WhatsApp number', description: 'That lead has no phone to message.', variant: 'destructive' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, leads, isLoading]);

  const doSend = async () => {
    if (!active) return;
    const useTemplate = !win.open;
    if (useTemplate && !active.leadId) {
      toast({ title: 'Template needs a lead', description: 'This conversation has no linked lead, so a claim template can’t be sent.', variant: 'destructive' });
      return;
    }
    if (!useTemplate && !text.trim()) return;
    setSending(true);
    const res = await send({
      phone: active.phone,
      leadId: active.leadId,
      body: useTemplate ? undefined : text.trim(),
      templateName: useTemplate ? template : undefined,
    });
    setSending(false);
    if (!res.ok) {
      const map: Record<string, string> = {
        window_closed: 'The 24h reply window is closed — send an approved template instead.',
        no_claim_link: 'That lead has no generated site yet, so there’s no claim link to send.',
        forbidden: 'You can only message your own conversations.',
        template_needs_lead: 'A template needs a linked lead.',
      };
      toast({ title: 'Not sent', description: map[res.error ?? ''] ?? res.error ?? 'Send failed.', variant: 'destructive' });
      return;
    }
    setText('');
    setSynthetic(null); // the real conversation now exists under the same key
    toast({ title: res.simulated ? 'Sent (simulated — test mode)' : 'Sent ✓' });
    setTimeout(() => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }), 50);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground">Manage WhatsApp conversations without leaving LeadFinder.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter conversations by campaign + status. Both keep Unassigned visible. */}
          <CampaignPicker mode="filter" hideCreate value={campaignFilter} onChange={setCampaignFilter} className="h-9 w-[180px]" />
          <Select value={statusFilter ?? '__all__'} onValueChange={(v) => setStatusFilter(v === '__all__' ? null : v)}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All statuses</SelectItem>
              {PIPELINE_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
              {/* Site-milestone filters (not lead statuses) — from generated_sites,
                  presence-based via sitesByLeadId. Distinct sentinel values. */}
              <SelectItem value="__opened__">Opened</SelectItem>
              <SelectItem value="__claimed__">Claimed</SelectItem>
              <SelectItem value="__upsell__">Upsell</SelectItem>
            </SelectContent>
          </Select>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSendNow}
              disabled={sendingNow}
              title="Send the next queued WhatsApp message now — skips only the pacing wait; still respects pause, the daily cap and the 7am–9:30pm window"
            >
              {sendingNow ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />} Send now
            </Button>
          )}
          <Button size="sm" onClick={() => setNewOpen((v) => !v)}><Plus className="mr-1.5 h-4 w-4" /> New</Button>
        </div>
      </div>

      {/* New-conversation lead picker */}
      {newOpen && (
        <Card className="p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Start a conversation with one of your leads (must have a phone):</p>
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {leads.length === 0 ? (
              <p className="text-xs text-muted-foreground/60">No leads with a phone number.</p>
            ) : leads.map((l) => (
              <button key={l.id} onClick={() => startFromLead(l)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/50">
                <span className="truncate">{l.business_name || '(no name)'}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{l.phone}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-[300px_1fr]">
        {/* Conversation list */}
        <Card className="max-h-[60vh] overflow-y-auto p-1.5">
          {/* Show-hidden toggle — only when there are hidden (not_interested) convos. */}
          {(hiddenCount > 0 || showHidden) && (
            <button
              onClick={() => setShowHidden((v) => !v)}
              className="mb-1 w-full rounded-md px-2.5 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted/50"
            >
              {showHidden ? '← Hide closed / not-interested' : `Show hidden (${hiddenCount})`}
            </button>
          )}
          {isLoading ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : list.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center text-muted-foreground">
              <MessageSquare className="mb-2 h-6 w-6 opacity-40" />
              <p className="text-sm">No conversations yet.</p>
              <p className="mt-1 text-xs opacity-70">Start one with “New”, or inbound replies will appear here as they arrive.</p>
            </div>
          ) : list.map((c) => (
            <div
              key={c.key}
              role="button"
              tabIndex={0}
              onClick={() => setActiveKey(c.key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveKey(c.key); } }}
              className={cn('flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors',
                activeKey === c.key ? 'bg-muted' : 'hover:bg-muted/50')}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {c.unassigned && <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                  <span className="truncate">{c.unassigned ? `Unassigned · +${c.phone}` : c.label}</span>
                </span>
                {c.lastMessage && <span className="shrink-0 text-[10px] text-muted-foreground">{relTime(c.lastMessageAt)}</span>}
              </div>
              {c.lastMessage && (
                <span className="truncate text-xs text-muted-foreground">
                  {c.lastMessage.direction === 'outbound' ? 'You: ' : ''}
                  {listPreview(c.lastMessage)}
                </span>
              )}
              {/* Editable status pill — only for conversations linked to a lead
                  (Unassigned has none). Two-way synced with Outreach. Beside it, ONE
                  engagement pill for the furthest milestone the lead reached
                  (Upsell > Claimed > Opened; nothing if none) — from generated_sites. */}
              {c.leadId && (
                <div className="mt-0.5 flex items-center gap-1">
                  {savingStatusKey === c.key
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    : <PipelineStatusSelect value={c.leadStatus} onValueChange={(status) => handleSetStatus(c, status)} />}
                  {(() => {
                    const s = sitesByLeadId[c.leadId];
                    if (!s) return null;
                    const pill = 'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold border-transparent';
                    if (s.addonInterestAt) return <span className={`${pill} bg-[hsl(var(--badge-waiting))] text-[hsl(var(--badge-waiting-fg))]`} title="Requested the booking + SMS add-on">Upsell</span>;
                    if (s.claimedAt) return <span className={`${pill} bg-[hsl(var(--badge-closed))] text-[hsl(var(--badge-closed-fg))]`} title="Claimed the free site">Claimed</span>;
                    if (s.firstOpenedAt) return <span className={`${pill} bg-[hsl(var(--badge-contacted))] text-[hsl(var(--badge-contacted-fg))]`} title="Opened the site link">Opened</span>;
                    return null;
                  })()}
                </div>
              )}
            </div>
          ))}
        </Card>

        {/* Thread + reply */}
        <Card className="flex h-[60vh] flex-col">
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="mb-2 h-7 w-7 opacity-30" />
              <p className="text-sm">Select a conversation</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{active.unassigned ? `Unassigned · +${active.phone}` : active.label}</p>
                  <p className="text-[11px] text-muted-foreground">+{active.phone}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* View their site — PREVIEW link (does NOT count as an "opened" event). */}
                  {sitePreviewUrl && (
                    <a href={sitePreviewUrl} target="_blank" rel="noreferrer" title="View their site (preview — doesn't count as opened)" aria-label="View site preview" className={HEADER_ICON_BTN}>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  {/* Jump to this lead's row on the Outreach page (reuses the launch pattern). */}
                  {active.leadId && (
                    <button type="button" onClick={() => navigate('/outreach', { state: { launch: { leadId: active.leadId, channel: 'open' } } })} title="Open this lead on the Outreach page" aria-label="Jump to Outreach" className={HEADER_ICON_BTN}>
                      <ListChecks className="h-4 w-4" />
                    </button>
                  )}
                  {/* Google Maps — stored URL preferred, else built from place_id. */}
                  {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noreferrer" title="Open in Google Maps" aria-label="Open in Google Maps" className={HEADER_ICON_BTN}>
                      <MapPin className="h-4 w-4" />
                    </a>
                  )}
                  {websiteUrl && (
                    <a href={websiteUrl} target="_blank" rel="noreferrer" title="Open the business website" aria-label="Open website" className={HEADER_ICON_BTN}>
                      <Globe className="h-4 w-4" />
                    </a>
                  )}
                  {activeLead?.email && (
                    <a href={`mailto:${activeLead.email}`} title={`Email ${activeLead.email}`} aria-label="Email the business" className={HEADER_ICON_BTN}>
                      <Mail className="h-4 w-4" />
                    </a>
                  )}
                  {/* Secondary fallback: open the chat in the WhatsApp app (wa.me). */}
                  <a href={`https://wa.me/${active.phone}`} target="_blank" rel="noreferrer" title="Open this chat in the WhatsApp app" aria-label="Open in WhatsApp app" className={HEADER_ICON_BTN}>
                    <MessageCircle className="h-4 w-4" />
                  </a>
                  {/* Remove from inbox → sets the lead to Closed (hidden here; stays in Outreach). */}
                  {active.leadId && (
                    <button type="button" onClick={() => handleRemoveFromInbox(active)} disabled={removingKey === active.key} title="Remove from inbox (mark Closed)" aria-label="Remove from inbox" className={cn(HEADER_ICON_BTN, 'hover:text-destructive')}>
                      {removingKey === active.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  )}
                  {win.open ? (
                    <span className="ml-1 flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-semibold text-green-600 dark:text-green-400">
                      <Clock className="h-3 w-3" /> Window open · ~{win.hoursLeft}h left
                    </span>
                  ) : (
                    <span className="ml-1 flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3 w-3" /> Window closed · template only
                    </span>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div ref={threadRef} className="flex-1 space-y-2 overflow-y-auto p-3">
                {thread.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground/60">No messages yet — send the first below.</p>
                ) : thread.map((m) => (
                  <div key={m.id} className={cn('flex', m.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[78%] rounded-2xl px-3 py-2 text-sm',
                      m.direction === 'outbound' ? 'bg-primary/90 text-primary-foreground' : 'bg-muted')}>
                      <p className="whitespace-pre-wrap break-words">
                        {m.body || templateLabel(m.template_name)}
                      </p>
                      <div className={cn('mt-0.5 flex items-center gap-1 text-[10px]',
                        m.direction === 'outbound' ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                        <span>{relTime(m.created_at)}</span>
                        {m.message_type === 'template' && <span>· template</span>}
                        {m.direction === 'outbound' && (
                          <span>· {m.status === 'simulated' ? 'simulated' : m.status === 'failed' ? '⚠ failed' : m.status}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply box */}
              <div className="border-t border-border p-2.5">
                {win.open ? (
                  <div className="space-y-2">
                    {/* Quick-reply: insert a saved TEXT script (editable before send). */}
                    {textTemplates.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={sending}>
                            <MessageSquarePlus className="h-3.5 w-3.5" /> Quick reply
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-72 w-80 overflow-y-auto thin-scrollbar">
                          {textTemplates.map((t, i) => (
                            <DropdownMenuItem key={`${t.title}-${i}`} onClick={() => insertTemplate(t.content)} className="flex flex-col items-start gap-0.5">
                              <span className="text-xs font-medium">{t.title}</span>
                              <span className="line-clamp-2 whitespace-normal text-[11px] text-muted-foreground">
                                {fillTemplate(t.content, { businessName: activeBusinessName })}
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <div className="flex items-end gap-2">
                      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a reply…"
                        className="min-h-[44px] max-h-32 flex-1 resize-none" maxLength={4000}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } }} disabled={sending} />
                      <Button onClick={doSend} disabled={sending || !text.trim()} size="icon" className="h-11 w-11 shrink-0">
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground">
                      Outside the 24h window — free text isn’t allowed. Send an approved template{active.leadId ? '' : ' (needs a linked lead)'}:
                    </p>
                    <div className="flex items-center gap-2">
                      <Select value={template} onValueChange={setTemplate}>
                        <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {WA_REPLY_TEMPLATES.map((t) => <SelectItem key={t.name} value={t.name}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button onClick={doSend} disabled={sending || !active.leadId} className="shrink-0">
                        {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                        Send template
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Inbox;
