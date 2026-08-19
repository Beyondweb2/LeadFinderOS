import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCampaigns, type Campaign } from '@/hooks/useCampaigns';
import { looksAutomated, isDecline } from '@/lib/inboundClassify';
import { isRealSend } from '@/lib/realSend';
import { fetchAllRows } from '@/lib/fetchAllRows';

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
/* ⛔ THIS LINE USED TO READ "Paid = payment_received-or-beyond in the forward-only pipeline
   ordering." IT DESCRIBED A CONSTANT THAT NO LONGER EXISTS AND A RULE THAT IS WRONG. `paid` means
   `amount_paid > 0`, everywhere (CLAUDE.md §6) — which is what this file already does, ~170 lines
   below. Left uncorrected it invites exactly the "fix" that would reintroduce the £0-lead bug the
   comment beside that code was written to record. */

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
  /** Of the leads who REPLIED, how many paid — the niche's conversion. null when nobody replied. */
  repliedToPaidPct: number | null;
  /** Of the leads actually REACHED, how many paid — end-to-end. null when nobody reached. */
  reachedToPaidPct: number | null;
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
        fetchAllRows<LeadRow>('Campaign stats (leads)', (from, to) =>
          client.from('outreach_leads').select('id, campaign_id, status, amount_paid')
            .eq('is_archived', false).order('id', { ascending: true }).range(from, to)),
        // BOTH directions now: inbound is what makes a reply a reply. Freeform outbound (null
        // template) is fetched too — it does not create a template row, but an operator's freeform
        // message still counts as us having written to them for the pitch-reply ordering.
        /* .order('id') is a TIEBREAKER, not decoration: 3 groups of rows currently share a
           created_at, and ordering by a non-unique key makes page boundaries unstable — a tied row
           can be fetched twice and another missed. created_at still leads, so the per-lead arrays
           stay in send order, which is what the pitch-reply comparison depends on. */
        fetchAllRows<MsgRow>('Campaign stats (messages)', (from, to) =>
          client.from('whatsapp_messages').select('lead_id, direction, template_name, status, created_at, body')
            .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)),
      ]);
      setLeads(leadsRes.rows);
      setMessages(msgsRes.rows);
    } catch (e) {
      console.error('Campaign stats fetch failed (non-blocking):', e);
    }

    /* Questionnaire starts — THROUGH THE submissions ENDPOINT. The old direct read of
       onboarding_responses hit RLS-with-no-policies and returned 200 [] for every browser session,
       so `started` was structurally 0 on every campaign card since the day it shipped (proven live
       2026-08-19: an operator session sees 0 of the 7 rows that exist). Still defensive: a failure
       degrades `started` to 0 rather than taking the whole card down. */
    try {
      const { data: res, error } = await supabase.functions.invoke('submissions', { body: { action: 'lead_statuses' } });
      if (error || !res?.ok) throw new Error(error?.message ?? res?.error ?? 'lead_statuses failed');
      const rows = (res.rows ?? []) as { lead_id: string | null }[];
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
    replyRatePct: null, pitchReplyRatePct: null, repliedToPaidPct: null, reachedToPaidPct: null,
    byTemplate: {},
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
    /* isRealSend: a rejected (failed) or test-mode (simulated) row is not a send. Without it the
       Reached denominators counted leads whose every send Meta refused — Locksmiths read 56% reply
       when the truth was 60% (measured 2026-08-19). Applies to every downstream test on this list:
       a failed pitch is not "pitched", a failed sign-up link was not sent. */
    const outTemplated = ms.filter((m) => m.direction === 'outbound' && m.template_name && isRealSend(m.status));
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
    /* amount_paid only, so `paid` and `moneyIn` below can no longer disagree on the same card — the
       status half used to let a £0 lead in in_delivery count as paid while contributing £0. */
    if (Number(l.amount_paid ?? 0) > 0) b.paid += 1;
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

  // Derived rates — all over what was actually done, never over "Sent".
  // The two conversions compare niches: responsiveness is replyRatePct, conversion is
  // repliedToPaidPct (of those who answered, who bought) with reachedToPaidPct as end-to-end.
  for (const b of buckets.values()) {
    b.replyRatePct = pct(b.replied, b.reached);
    b.pitchReplyRatePct = pct(b.pitchReplied, b.pitched);
    b.repliedToPaidPct = pct(b.paid, b.replied);
    b.reachedToPaidPct = pct(b.paid, b.reached);
  }

  // Campaigns first (creation order), Unassigned last and only if it has activity.
  const stats: CampaignStats[] = campaigns.map((c) => buckets.get(c.id)!).filter(Boolean);
  const unassigned = buckets.get(null);
  if (unassigned && (unassigned.leadCount > 0 || unassigned.reached > 0)) stats.push(unassigned);

  return { stats, isLoading: isLoading || campaignsLoading, refetch: fetchData };
}
