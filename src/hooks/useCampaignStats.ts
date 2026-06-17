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
  // Site funnel (generated_sites linked via lead → campaign).
  funnel: { sent: number; opened: number; replied: number; claimed: number; addon: number };
  // Headline (Decision 1): claimed ÷ opened — both automatic, always accurate.
  conversionPct: number | null;        // null when opened = 0
  // Secondary, only meaningful once sites are marked "sent" (manual admin signal).
  claimedPerSentPct: number | null;    // null when sent = 0
  replyRatePct: number | null;         // null when sent = 0
  // Contact-method breakdown from the leads' own pill value (call/sms/whatsapp/facebook_msg).
  methods: Record<ContactMethod, number>;
}

interface LeadRow { id: string; campaign_id: string | null; contact_method: string | null; status: string | null }
interface SiteRow {
  lead_id: string | null;
  first_opened_at: string | null;
  claimed_at: string | null;
  addon_interest_at: string | null;
}

const emptyMethods = (): Record<ContactMethod, number> =>
  ({ call: 0, sms: 0, whatsapp: 0, facebook_msg: 0 });

const pct = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num / den) * 100) : null;

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
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const client = supabase as unknown as SupabaseClient;
      const [leadsRes, sitesRes] = await Promise.all([
        client.from('outreach_leads').select('id, campaign_id, contact_method, status'),
        client.from('generated_sites')
          .select('lead_id, first_opened_at, claimed_at, addon_interest_at'),
      ]);
      setLeads((leadsRes.data || []) as LeadRow[]);
      setSites((sitesRes.data || []) as SiteRow[]);
    } catch (e) {
      console.error('Campaign stats fetch failed (non-blocking):', e);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Resolve a lead → its campaign id.
  const leadToCampaign = new Map<string, string | null>();
  for (const l of leads) leadToCampaign.set(l.id, l.campaign_id ?? null);

  // Seed one bucket per campaign, plus an Unassigned bucket.
  const buckets = new Map<string | null, CampaignStats>();
  const seed = (campaign: Campaign | null): CampaignStats => ({
    campaign,
    leadCount: 0,
    funnel: { sent: 0, opened: 0, replied: 0, claimed: 0, addon: 0 },
    conversionPct: null,
    claimedPerSentPct: null,
    replyRatePct: null,
    methods: emptyMethods(),
  });
  for (const c of campaigns) buckets.set(c.id, seed(c));

  const bucketFor = (campaignId: string | null): CampaignStats => {
    const key = campaignId && buckets.has(campaignId) ? campaignId : null;
    if (!buckets.has(key)) buckets.set(key, seed(null));
    return buckets.get(key)!;
  };

  // Leads → lead counts + contact-method breakdown + Sent/Replied (status is the
  // source of truth: Outreach status pill drives these, NOT generated_sites).
  for (const l of leads) {
    const b = bucketFor(l.campaign_id ?? null);
    b.leadCount += 1;
    const m = l.contact_method as ContactMethod | null;
    if (m && m in b.methods) b.methods[m] += 1;
    if (isSentStatus(l.status)) b.funnel.sent += 1;
    if (isRepliedStatus(l.status)) b.funnel.replied += 1;
  }

  // Sites → automatic event counts (campaign resolved through the linked lead).
  for (const s of sites) {
    const campaignId = s.lead_id ? (leadToCampaign.get(s.lead_id) ?? null) : null;
    const b = bucketFor(campaignId);
    if (s.first_opened_at) b.funnel.opened += 1;
    if (s.claimed_at) b.funnel.claimed += 1;
    if (s.addon_interest_at) b.funnel.addon += 1;
  }

  // Derived rates.
  for (const b of buckets.values()) {
    b.conversionPct = pct(b.funnel.claimed, b.funnel.opened);
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
