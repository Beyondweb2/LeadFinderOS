import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCampaigns, type Campaign } from '@/hooks/useCampaigns';
import { looksAutomated, isDecline } from '@/lib/inboundClassify';

/* ============================================================
   CAMPAIGN METRICS, DERIVED FROM MESSAGES

   Every number here used to come from outreach_leads.status, which made the card confidently wrong:

   - "Sent" was `status !== 'not_contacted'`, so a lead merely QUEUED, or marked no_whatsapp_needs_sms
     and unreachable, counted as sent. plumber read Sent 217 when 104 leads had ever been messaged;
     Accountants read 192 when the true figure was 17.
   - "Replied" was a lifetime status test (replied-or-beyond), so it counted leads that never sent a
     message, counted `not_interested`, and — because it was intersected with each template's lead
     set — printed the SAME leads under the opener and the pitch. That is why "Replied 50" appeared
     twice, and why a template sent to 2 people showed 100% reply.
   - Every rate divided by that inflated "Sent", so the honest reply rates were roughly HALVED.

   Now: Reached, Replied and Pitch reply come from whatsapp_messages, both directions. A reply is an
   actual inbound message that is not an auto-responder. Pitch reply is send-attributed by timestamp,
   which is the number that says whether the report and pitch work.
   ============================================================ */

/** The pitch: the report follow-up whose effect we are trying to measure. */
const PITCH_TEMPLATES = new Set(['audit_reply']);
/** The sign-up link. */
const SIGNUP_TEMPLATES = new Set(['onboarding_followup']);
/** Paid = payment_received-or-beyond in the forward-only pipeline ordering. */
const PAID_OR_BEYOND = new Set(['payment_received', 'in_delivery', 'completed']);

/** A receipt on the message itself: 'read' implies delivered, so both count as delivered. */
const isDeliveredStatus = (s: string | null | undefined) => s === 'delivered' || s === 'read';

export interface TemplateStats {
  /** DISTINCT leads sent this template in this campaign. Sends, deduped by lead. */
  leads: number;
  delivered: number;
  read: number;
  /* NO `replied` field, deliberately. The old one was "has this lead replied, ever", which is not a
     property of this template — it made every row claim the same replies. A per-template reply count
     is only meaningful send-attributed, and for the opener that is ambiguous when several openers
     went to one lead. The campaign-level Pitch reply is the send-attributed number that matters. */
}

export interface CampaignStats {
  campaign: Campaign | null;   // null = the "Unassigned" bucket
  /** UNARCHIVED leads in this campaign. Archived leads are excluded everywhere here, matching every
   *  other dashboard surface — this hook was the only one that still counted them. */
  leadCount: number;
  /** Leads that have actually been sent a templated message. The base for every rate. */
  reached: number;
  delivered: number;
  read: number;
  /** Leads with >= 1 real inbound message that is not an auto-responder. */
  replied: number;
  /** Of `replied`, how many said no. Reported separately rather than removed: a decline IS a reply,
   *  and hiding it would overstate how many people are still in play. */
  declined: number;
  /** Leads sent the pitch. */
  pitched: number;
  /** Of `pitched`, leads whose newest non-bot inbound arrived AFTER their newest pitch send. */
  pitchReplied: number;
  signupSent: number;
  /** Leads with an onboarding_responses row — they started the questionnaire. */
  started: number;
  paid: number;
  /** Sum of amount_paid, in pounds. */
  moneyIn: number;
  replyRatePct: number | null;       // replied / reached — null when nothing reached
  pitchReplyRatePct: number | null;  // pitchReplied / pitched — null when nothing pitched
  byTemplate: Record<string, TemplateStats>;
}

interface LeadRow {
  id: string; campaign_id: string | null; status: string | null; amount_paid: number | null;
}
interface MsgRow {
  lead_id: string | null; direction: string | null; template_name: string | null;
  status: string | null; created_at: string; body: string | null;
}

const pct = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num / den) * 100) : null;

/**
 * Fetch every row of a table, a page at a time.
 *
 * PostgREST caps a single response at the project's `db-max-rows` (default 1000) and returns the
 * truncated page with NO error and no indication it was cut — so an unpaginated select silently
 * starts under-reporting once a table crosses the cap. outreach_leads is at 689.
 *
 * The loop advances by the number of rows actually RETURNED rather than by the requested page size,
 * so it stays correct even if the server's cap is lower than PAGE. It ends when a page comes back
 * empty. MAX_PAGES is a runaway guard, not an expected limit; hitting it sets `truncated`.
 */
const PAGE = 1000;
const MAX_PAGES = 50;
async function fetchAll<T>(
  client: SupabaseClient,
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  let from = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length === 0) return { rows, truncated: false };
    from += batch.length;
  }
  console.warn(`Campaign stats: stopped paging at ${MAX_PAGES} pages (${rows.length} rows) — numbers may be incomplete.`);
  return { rows, truncated: true };
}

/**
 * Per-campaign rollups derived from whatsapp_messages. Leads are the caller's own (RLS).
 * Best-effort: a failure logs and leaves the previous numbers rather than blanking the page.
 */
export function useCampaignStats() {
  const { user } = useAuth();
  const { campaigns, isLoading: campaignsLoading } = useCampaigns();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [startedLeadIds, setStartedLeadIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const client = supabase as unknown as SupabaseClient;
      const [leadsRes, msgsRes] = await Promise.all([
        fetchAll<LeadRow>(client, (from, to) =>
          client.from('outreach_leads').select('id, campaign_id, status, amount_paid')
            .eq('is_archived', false).range(from, to)),
        // BOTH directions now: inbound is what makes a reply a reply. Freeform outbound (null
        // template) is fetched too — it does not create a template row, but an operator's freeform
        // message still counts as us having written to them for the pitch-reply ordering.
        fetchAll<MsgRow>(client, (from, to) =>
          client.from('whatsapp_messages').select('lead_id, direction, template_name, status, created_at, body')
            .order('created_at', { ascending: true }).range(from, to)),
      ]);
      setLeads(leadsRes.rows);
      setMessages(msgsRes.rows);
    } catch (e) {
      console.error('Campaign stats fetch failed (non-blocking):', e);
    }

    /* Questionnaire starts. Separate and defensive: onboarding_responses is not in the generated
       types and is RLS-locked to the server on some paths, so a failure here degrades `started` to
       0 rather than taking the whole card down. */
    try {
      const client = supabase as unknown as SupabaseClient;
      const { rows } = await fetchAll<{ lead_id: string | null }>(client, (from, to) =>
        client.from('onboarding_responses').select('lead_id').not('lead_id', 'is', null).range(from, to));
      setStartedLeadIds(new Set(rows.map((r) => r.lead_id).filter((v): v is string => !!v)));
    } catch (e) {
      console.warn('Onboarding starts unavailable (started shows 0):', e instanceof Error ? e.message : e);
    }

    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- Group messages by lead, oldest first (the fetch is already ordered). ---
  const msgsByLead = new Map<string, MsgRow[]>();
  for (const m of messages) {
    if (!m.lead_id) continue;
    const arr = msgsByLead.get(m.lead_id);
    if (arr) arr.push(m); else msgsByLead.set(m.lead_id, [m]);
  }

  // Seed one bucket per campaign, plus an Unassigned bucket.
  const buckets = new Map<string | null, CampaignStats>();
  const seed = (campaign: Campaign | null): CampaignStats => ({
    campaign, leadCount: 0, reached: 0, delivered: 0, read: 0, replied: 0, declined: 0,
    pitched: 0, pitchReplied: 0, signupSent: 0, started: 0, paid: 0, moneyIn: 0,
    replyRatePct: null, pitchReplyRatePct: null, byTemplate: {},
  });
  for (const c of campaigns) buckets.set(c.id, seed(c));
  const bucketFor = (campaignId: string | null): CampaignStats => {
    const key = campaignId && buckets.has(campaignId) ? campaignId : null;
    if (!buckets.has(key)) buckets.set(key, seed(null));
    return buckets.get(key)!;
  };

  // Per-template DISTINCT-lead sets, per campaign.
  const tmplSets = new Map<string | null, Map<string, { leads: Set<string>; delivered: Set<string>; read: Set<string> }>>();

  for (const l of leads) {
    const b = bucketFor(l.campaign_id ?? null);
    const key = l.campaign_id && buckets.has(l.campaign_id) ? l.campaign_id : null;
    b.leadCount += 1;

    const ms = msgsByLead.get(l.id) ?? [];
    const outTemplated = ms.filter((m) => m.direction === 'outbound' && m.template_name);
    /* A reply is an inbound message that is not an auto-responder — the SAME looksAutomated() the
       auto-pitch rule uses, so the dashboard and the sender agree on what a human is. */
    const humanInbound = ms.filter((m) => m.direction === 'inbound' && !looksAutomated(m.body ?? ''));

    if (outTemplated.length > 0) b.reached += 1;
    if (outTemplated.some((m) => isDeliveredStatus(m.status))) b.delivered += 1;
    if (outTemplated.some((m) => m.status === 'read')) b.read += 1;

    if (humanInbound.length > 0) {
      b.replied += 1;
      if (humanInbound.some((m) => isDecline(m.body ?? ''))) b.declined += 1;
    }

    /* PITCH REPLY — the number this rebuild exists for. Send-attributed by timestamp: did their
       newest real message arrive AFTER we pitched them? No new column needed; created_at is on
       every row in both directions. Compared against the NEWEST pitch, so re-pitching resets the
       question to "did they answer the latest one" rather than crediting an older reply. */
    const pitches = outTemplated.filter((m) => PITCH_TEMPLATES.has(m.template_name!));
    if (pitches.length > 0) {
      b.pitched += 1;
      const lastPitchAt = pitches[pitches.length - 1].created_at;
      const newestInboundAt = humanInbound.length ? humanInbound[humanInbound.length - 1].created_at : null;
      if (newestInboundAt && newestInboundAt > lastPitchAt) b.pitchReplied += 1;
    }

    if (outTemplated.some((m) => SIGNUP_TEMPLATES.has(m.template_name!))) b.signupSent += 1;
    if (startedLeadIds.has(l.id)) b.started += 1;
    if (PAID_OR_BEYOND.has(l.status ?? '') || Number(l.amount_paid ?? 0) > 0) b.paid += 1;
    b.moneyIn += Number(l.amount_paid ?? 0);

    // Per-template rows: distinct leads, plus that template's own receipts.
    let byT = tmplSets.get(key);
    if (!byT) { byT = new Map(); tmplSets.set(key, byT); }
    for (const m of outTemplated) {
      let sets = byT.get(m.template_name!);
      if (!sets) { sets = { leads: new Set(), delivered: new Set(), read: new Set() }; byT.set(m.template_name!, sets); }
      sets.leads.add(l.id);
      if (isDeliveredStatus(m.status)) sets.delivered.add(l.id);
      if (m.status === 'read') sets.read.add(l.id);
    }
  }

  for (const [key, byT] of tmplSets) {
    const b = bucketFor(key);
    for (const [tmpl, sets] of byT) {
      b.byTemplate[tmpl] = { leads: sets.leads.size, delivered: sets.delivered.size, read: sets.read.size };
    }
  }

  // Derived rates — both over what was actually done, never over "Sent".
  for (const b of buckets.values()) {
    b.replyRatePct = pct(b.replied, b.reached);
    b.pitchReplyRatePct = pct(b.pitchReplied, b.pitched);
  }

  // Campaigns first (creation order), Unassigned last and only if it has activity.
  const stats: CampaignStats[] = campaigns.map((c) => buckets.get(c.id)!).filter(Boolean);
  const unassigned = buckets.get(null);
  if (unassigned && (unassigned.leadCount > 0 || unassigned.reached > 0)) stats.push(unassigned);

  return { stats, isLoading: isLoading || campaignsLoading, refetch: fetchData };
}
