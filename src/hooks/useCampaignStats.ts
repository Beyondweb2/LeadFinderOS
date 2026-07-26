import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCampaigns, type Campaign } from '@/hooks/useCampaigns';
import { isSentStatus, isRepliedStatus, type ContactMethod } from '@/types/outreach';

/** Per-campaign rollup. All numbers come from real, tracked columns — never faked. */
export interface CampaignStats {
  campaign: Campaign | null;   // null = the "Unassigned" bucket
  leadCount: number;
  // Campaign funnel. sent/replied/paid from lead status; opened/claimed/addon from
  // generated_sites (barber-site opens — kept for the barber campaigns); reportOpened
  // from ai_audits.first_opened_at (real AUDIT-report opens, added alongside — a
  // DISTINCT signal from the barber site opens).
  funnel: { sent: number; opened: number; reportOpened: number; replied: number; claimed: number; addon: number; paid: number };
  // Conversion = Paid ÷ Sent (paid = payment_received-or-beyond status) — the same
  // definition for EVERY campaign type. Always a number (0 when nothing sent), never null.
  conversionPct: number;
  // Secondary, only meaningful once sites are marked "sent" (manual admin signal).
  claimedPerSentPct: number | null;    // null when sent = 0
  replyRatePct: number | null;         // null when sent = 0
  // Contact-method breakdown from the leads' own pill value (call/sms/whatsapp/facebook_msg).
  methods: Record<ContactMethod, number>;
  // WhatsApp delivery receipts — the lead-level whatsapp_delivery_status ratchet
  // (webhook-written). HISTORICAL engagement signal, DISTINCT from reportOpened: this
  // is the WhatsApp read receipt (did the message reach / get read), not a report view.
  // delivered = leads ever delivered-or-read; read = leads whose message was read.
  receipts: { delivered: number; read: number };
  // Per-template MINI-FUNNEL keyed by the REAL per-send template (whatsapp_messages.
  // template_name). leads = DISTINCT leads reached by that template in this campaign;
  // replied from the lead's status; opened from the lead's audit first_opened_at. Every
  // template that actually sent — including audit_reply — gets its own row (a lead
  // reached by both an opener AND a pitch appears in both rows, by design).
  byTemplate: Record<string, { leads: number; replied: number; opened: number }>;
}

interface LeadRow { id: string; campaign_id: string | null; contact_method: string | null; status: string | null; whatsapp_delivery_status: string | null }
interface SiteRow {
  lead_id: string | null;
  first_opened_at: string | null;
  claimed_at: string | null;
  addon_interest_at: string | null;
}
interface MsgRow { lead_id: string | null; template_name: string | null }
interface AuditRow { lead_id: string | null; first_opened_at: string | null }

const emptyMethods = (): Record<ContactMethod, number> =>
  ({ call: 0, sms: 0, whatsapp: 0, facebook_msg: 0, email: 0 });

const pct = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num / den) * 100) : null;

// Paid = payment_received-or-beyond in the forward-only pipeline ordering.
const PAID_OR_BEYOND = new Set(['payment_received', 'in_delivery', 'completed']);

/**
 * Builds per-campaign stat rollups by joining generated_sites → outreach_leads →
 * campaign. Admin-scoped in practice (generated_sites RLS); leads are the
 * caller's own (outreach_leads RLS). Best-effort; never throws.
 */
export function useCampaignStats() {
  const { user } = useAuth();
  const { campaigns, isLoading: campaignsLoading } = useCampaigns();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const client = supabase as unknown as SupabaseClient;
      const [leadsRes, sitesRes, msgsRes, auditsRes] = await Promise.all([
        client.from('outreach_leads').select('id, campaign_id, contact_method, status, whatsapp_delivery_status'),
        client.from('generated_sites').select('lead_id, first_opened_at, claimed_at, addon_interest_at'),
        // The REAL per-send template tag — every outbound send with a template (opener,
        // pitch/audit_reply, etc.). Freeform (null template) rows carry no template row.
        client.from('whatsapp_messages').select('lead_id, template_name').eq('direction', 'outbound').not('template_name', 'is', null),
        // Audit-report opens (shipped today). Fully defensive: if the column were missing
        // the select errors → caught below → opens degrade to 0, never blocking the page.
        client.from('ai_audits').select('lead_id, first_opened_at').not('first_opened_at', 'is', null),
      ]);
      setLeads((leadsRes.data || []) as LeadRow[]);
      setSites((sitesRes.data || []) as SiteRow[]);
      setMessages((msgsRes.data || []) as MsgRow[]);
      setAudits((auditsRes.data || []) as AuditRow[]);
    } catch (e) {
      console.error('Campaign stats fetch failed (non-blocking):', e);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Resolve a lead → its campaign id + status (for per-template replied), and the set of
  // lead_ids whose AUDIT has been opened (real report view).
  const leadToCampaign = new Map<string, string | null>();
  const leadToStatus = new Map<string, string | null>();
  for (const l of leads) {
    leadToCampaign.set(l.id, l.campaign_id ?? null);
    leadToStatus.set(l.id, l.status ?? null);
  }
  const openedAuditLeads = new Set<string>();
  for (const a of audits) if (a.lead_id) openedAuditLeads.add(a.lead_id);

  const normKey = (campaignId: string | null): string | null =>
    campaignId && buckets.has(campaignId) ? campaignId : null;

  // Seed one bucket per campaign, plus an Unassigned bucket.
  const buckets = new Map<string | null, CampaignStats>();
  const seed = (campaign: Campaign | null): CampaignStats => ({
    campaign,
    leadCount: 0,
    funnel: { sent: 0, opened: 0, reportOpened: 0, replied: 0, claimed: 0, addon: 0, paid: 0 },
    conversionPct: 0,
    claimedPerSentPct: null,
    replyRatePct: null,
    methods: emptyMethods(),
    receipts: { delivered: 0, read: 0 },
    byTemplate: {},
  });
  for (const c of campaigns) buckets.set(c.id, seed(c));

  const bucketFor = (campaignId: string | null): CampaignStats => {
    const key = normKey(campaignId);
    if (!buckets.has(key)) buckets.set(key, seed(null));
    return buckets.get(key)!;
  };

  // Per-template DISTINCT-lead sets, keyed by (campaign key → template → sets). Built from
  // whatsapp_messages so a lead reached by multiple templates counts once PER template.
  const tmplSets = new Map<string | null, Map<string, { leads: Set<string>; replied: Set<string>; opened: Set<string> }>>();

  // Leads → lead counts + contact-method breakdown + Sent/Replied (status is the source of
  // truth) + WhatsApp delivery receipts + report opens (per campaign, distinct by lead).
  for (const l of leads) {
    const b = bucketFor(l.campaign_id ?? null);
    b.leadCount += 1;
    const m = l.contact_method as ContactMethod | null;
    if (m && m in b.methods) b.methods[m] += 1;
    if (isSentStatus(l.status)) b.funnel.sent += 1;
    if (isRepliedStatus(l.status)) b.funnel.replied += 1;
    if (PAID_OR_BEYOND.has(l.status ?? '')) b.funnel.paid += 1;
    if (openedAuditLeads.has(l.id)) b.funnel.reportOpened += 1;
    // WhatsApp read-status ratchet: 'read' implies delivered, so both count toward
    // delivered; 'read' also counts toward read.
    const ds = l.whatsapp_delivery_status;
    if (ds === 'delivered' || ds === 'read') b.receipts.delivered += 1;
    if (ds === 'read') b.receipts.read += 1;
  }

  // Sites → barber-site automatic event counts (campaign resolved through the linked lead).
  // Kept intact so the barber campaigns' historical funnel stays accurate.
  for (const s of sites) {
    const campaignId = s.lead_id ? (leadToCampaign.get(s.lead_id) ?? null) : null;
    const b = bucketFor(campaignId);
    if (s.first_opened_at) b.funnel.opened += 1;
    if (s.claimed_at) b.funnel.claimed += 1;
    if (s.addon_interest_at) b.funnel.addon += 1;
  }

  // Messages → per-template mini-funnel, DISTINCT leads reached per template per campaign.
  for (const msg of messages) {
    if (!msg.lead_id || !msg.template_name) continue;
    const key = normKey(leadToCampaign.get(msg.lead_id) ?? null);
    let byT = tmplSets.get(key);
    if (!byT) { byT = new Map(); tmplSets.set(key, byT); }
    let sets = byT.get(msg.template_name);
    if (!sets) { sets = { leads: new Set(), replied: new Set(), opened: new Set() }; byT.set(msg.template_name, sets); }
    sets.leads.add(msg.lead_id);
    if (isRepliedStatus(leadToStatus.get(msg.lead_id))) sets.replied.add(msg.lead_id);
    if (openedAuditLeads.has(msg.lead_id)) sets.opened.add(msg.lead_id);
  }
  // Fold the distinct-lead sets into counts on each bucket.
  for (const [key, byT] of tmplSets) {
    const b = bucketFor(key);
    for (const [tmpl, sets] of byT) {
      b.byTemplate[tmpl] = { leads: sets.leads.size, replied: sets.replied.size, opened: sets.opened.size };
    }
  }

  // Derived rates.
  for (const b of buckets.values()) {
    // Conversion = Paid ÷ Sent, every type, always a number (0 when nothing sent yet).
    b.conversionPct = b.funnel.sent > 0 ? Math.round((b.funnel.paid / b.funnel.sent) * 100) : 0;
    b.claimedPerSentPct = pct(b.funnel.claimed, b.funnel.sent);
    b.replyRatePct = pct(b.funnel.replied, b.funnel.sent);
  }

  // Campaigns first (creation order), Unassigned last and only if it has activity.
  const stats: CampaignStats[] = campaigns
    .map((c) => buckets.get(c.id)!)
    .filter(Boolean);
  const unassigned = buckets.get(null);
  if (unassigned && (unassigned.leadCount > 0 || unassigned.funnel.sent > 0 ||
      unassigned.funnel.opened > 0 || unassigned.funnel.claimed > 0)) {
    stats.push(unassigned);
  }

  return { stats, isLoading: isLoading || campaignsLoading, refetch: fetchData };
}
