import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCampaigns, type Campaign } from '@/hooks/useCampaigns';
import { looksAutomated, isDecline } from '@/lib/inboundClassify';
import { isRealSend } from '@/lib/realSend';
import { isPaidLead } from '@/lib/leadPayment';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { creditRepliesByTemplate, creditOpenToTemplate, OPEN_ATTRIBUTION_SLACK_MS } from '@/lib/templateAttribution';

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

/* ⛔ EVERY TEMPLATE THAT CARRIES THE REPORT LINK — NOT JUST THE PITCH, AND THE DIFFERENCE IS
   MEASURABLE. Report opens can only be attributed against the moment the link went out, so this
   set decides both the denominator and which opens count. Taken from the variable registry in
   _shared/whatsapp-send.ts, where each of these carries a report URL: audit_reply has `url`,
   audit_result_hook and free_check_result have `audit_url`.
   ⚠️ IT IS DELIBERATELY WIDER THAN PITCH_TEMPLATES. The first version of this used audit_reply
   alone, because that is the pitch. Measured against the live table, that was wrong in a way that
   mattered: links sent 577 -> 653, opened 366 -> 408, and the opens we could not attribute at all
   fell from 55 to 13 — because most of those "unexplained" opens were leads sent their report by
   audit_result_hook, which became the outreach hook and never got added here.
   ⚠️ SO: IF A NEW TEMPLATE EVER CARRIES A REPORT LINK, ADD IT HERE. Forgetting does not throw; it
   silently moves real prospect opens into the unattributed bucket and understates the rate. */
const REPORT_LINK_TEMPLATES = new Set(['audit_reply', 'audit_result_hook', 'free_check_result']);

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
  /* ⛔ `replied` IS BACK, AND IT IS A DIFFERENT NUMBER FROM THE ONE THAT WAS REMOVED. The removed
     one was "has this lead replied, ever", intersected with the template's lead set — not a
     property of this template at all, which is why every row claimed the same replies. This one is
     LAST-TOUCH: the reply is credited to the newest real send before it, and an inbound closes the
     run (src/lib/templateAttribution.ts carries the measurements). Distinct leads, never messages. */
  replied: number;
  /** Of `replied`, how many followed 2+ DIFFERENT templates with no reply in between — so which
   *  one earned it is unknowable and last-touch decided it by rule.
   *  ⛔ NEVER RENDER `replied` WITHOUT THIS AVAILABLE. contact_followup scores 20 of 20 contested
   *  by construction (a chase only exists because the opener got no answer), and a 26% chase rate
   *  shown as cleanly as a 52% opener rate is the misleading half of an honest metric. */
  repliedAmbiguous: number;
  /** Leads sent this template when it carried a report link. 0 for templates that carry none — the
   *  card must show nothing rather than a 0% open rate for a message with no report in it. */
  reportLinksSent: number;
  /** Of `reportLinksSent`, leads whose report was first opened after THIS template sent the link. */
  reportOpened: number;
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
  /** Leads sent a message carrying their report link (REPORT_LINK_TEMPLATES). The denominator for
   *  report opens: you cannot open a report you were never sent. */
  reportLinksSent: number;
  /** Of `reportLinksSent`, leads whose audit was first opened AFTER we sent them the link.
   *  ⛔ THE "AFTER" IS THE WHOLE POINT — see the fold below for why this is a prospect open and the
   *  raw open_count is not. */
  reportOpened: number;
  /** Audits with opens on leads we never sent a report link to. NOT counted as opens — surfaced so
   *  the excluded rows are visible rather than quietly dropped. */
  reportOpensUnattributed: number;
  replyRatePct: number | null;       // replied / reached — null when nothing reached
  pitchReplyRatePct: number | null;  // pitchReplied / pitched — null when nothing pitched
  /** reportOpened / reportLinksSent — null when no link has been sent. */
  reportOpenRatePct: number | null;
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
/* ai_audits carries the open-tracking written by render-audit-report via the bump_audit_open()
   RPC: first_opened_at set once (coalesced), open_count incremented. There is no per-open log and
   no viewer, so only the FIRST open can ever be attributed — which is why the metric below counts
   AUDITS OPENED (unique prospects) and never the 933 raw opens. */
interface AuditRow {
  id: string; lead_id: string | null; open_count: number | null; first_opened_at: string | null;
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
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const client = supabase as unknown as SupabaseClient;
      const [leadsRes, msgsRes, auditsRes] = await Promise.all([
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
        /* Report opens. Only the four columns the attribution needs — this table is 870 rows and
           carries whole audit payloads, so selecting * would pull megabytes for a counter. */
        fetchAllRows<AuditRow>('Campaign stats (audit opens)', (from, to) =>
          client.from('ai_audits').select('id, lead_id, open_count, first_opened_at')
            .order('id', { ascending: true }).range(from, to)),
      ]);
      setLeads(leadsRes.rows);
      setMessages(msgsRes.rows);
      setAudits(auditsRes.rows);
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

  /* Audits per lead. A lead can have several (re-audits mint a new row), so the open test below
     asks whether ANY of them was opened after the link went out. */
  const auditsByLead = new Map<string, AuditRow[]>();
  for (const a of audits) {
    if (!a.lead_id) continue;
    const arr = auditsByLead.get(a.lead_id);
    if (arr) arr.push(a); else auditsByLead.set(a.lead_id, [a]);
  }

  // Seed one bucket per campaign, plus an Unassigned bucket.
  const buckets = new Map<string | null, CampaignStats>();
  const seed = (campaign: Campaign | null): CampaignStats => ({
    campaign, leadCount: 0, reached: 0, delivered: 0, read: 0, replied: 0, declined: 0,
    pitched: 0, pitchReplied: 0, signupSent: 0, started: 0, paid: 0, moneyIn: 0,
    reportLinksSent: 0, reportOpened: 0, reportOpensUnattributed: 0,
    replyRatePct: null, pitchReplyRatePct: null, repliedToPaidPct: null, reachedToPaidPct: null,
    reportOpenRatePct: null,
    byTemplate: {},
  });
  for (const c of campaigns) buckets.set(c.id, seed(c));
  const bucketFor = (campaignId: string | null): CampaignStats => {
    const key = campaignId && buckets.has(campaignId) ? campaignId : null;
    if (!buckets.has(key)) buckets.set(key, seed(null));
    return buckets.get(key)!;
  };

  // Per-template DISTINCT-lead sets, per campaign.
  type TmplSets = {
    leads: Set<string>; delivered: Set<string>; read: Set<string>;
    replied: Set<string>; repliedAmbiguous: Set<string>;
    reportLinksSent: Set<string>; reportOpened: Set<string>;
  };
  const tmplSets = new Map<string | null, Map<string, TmplSets>>();

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

    /* ── REPORT OPENED ────────────────────────────────────────────────────────────────────────
       ⛔ ATTRIBUTED AGAINST THE SEND, WHICH IS THE ONLY THING THAT MAKES THIS NUMBER HONEST. The
       raw ai_audits.open_count cannot be used: the operator opens the SAME URL as the prospect
       (LeadDeliveryCockpit and the Inbox both link to findable.live/report/<auditId>), so a preview
       increments the same counter, and first_opened_at is coalesced so a preview permanently owns
       the "first open". This tile was REMOVED from the dashboard twice for exactly that reason.
       ⚠️ AND THE REASON IT COULD COME BACK IS THAT THE PESSIMISM WAS MEASURABLY WRONG. Comparing
       first_opened_at against the moment the link was sent separates them for every row: measured
       live 2026-09-04 across 427 opened audits, 371 opened AFTER the send, ONE before, and the
       rest belonged to leads never sent a link at all. Paul almost never previews via that URL.
       ⛔ SO AN OPEN ONLY COUNTS IF WE SENT THE LINK FIRST. No link sent means the open is ours (or
       arrived by a channel we do not track), and it is excluded and surfaced rather than dropped
       silently — see reportOpensUnattributed.
       ⚠️ UNIQUE AUDITS OPENED, NEVER open_count. There is no per-open log, so repeat views cannot
       be attributed; 933 raw opens across 433 audits would be counted as people if summed. */
    const reportLinks = outTemplated.filter((m) => REPORT_LINK_TEMPLATES.has(m.template_name!));
    const leadAudits = auditsByLead.get(l.id) ?? [];
    const openedAudits = leadAudits.filter((a) => (a.open_count ?? 0) > 0 && a.first_opened_at);
    if (reportLinks.length > 0) {
      b.reportLinksSent += 1;
      /* The EARLIEST link send, not the newest. The question is "have they ever opened the report
         we sent them", so re-sending must not invalidate an open that already happened. */
      const firstLinkAt = new Date(reportLinks[0].created_at).getTime();
      if (openedAudits.some((a) => new Date(a.first_opened_at!).getTime() >= firstLinkAt - OPEN_ATTRIBUTION_SLACK_MS)) {
        b.reportOpened += 1;
      }
    } else if (openedAudits.length > 0) {
      b.reportOpensUnattributed += 1;
    }

    if (outTemplated.some((m) => SIGNUP_TEMPLATES.has(m.template_name!))) b.signupSent += 1;
    if (startedLeadIds.has(l.id)) b.started += 1;
    /* ⛔ BOTH THROUGH isPaidLead, so `paid` and `moneyIn` cannot disagree on the same card — and so
       a REFUNDED customer leaves the count and the "£X in" figure TOGETHER. Summing the amount
       independently of the count is exactly how a refund would have stayed in the money while
       leaving the headcount. `amount_paid` is still the amount; isPaidLead only decides whether it
       counts. (The older comment here warned about the reverse failure — a £0 lead dragged to
       in_delivery counting as paid while contributing £0 — which this preserves.) */
    if (isPaidLead(l)) { b.paid += 1; b.moneyIn += Number(l.amount_paid ?? 0); }

    // Per-template rows: distinct leads, plus that template's own receipts.
    let byT = tmplSets.get(key);
    if (!byT) { byT = new Map(); tmplSets.set(key, byT); }
    const setsFor = (tmpl: string): TmplSets => {
      let sets = byT!.get(tmpl);
      if (!sets) {
        sets = { leads: new Set(), delivered: new Set(), read: new Set(),
                 replied: new Set(), repliedAmbiguous: new Set(),
                 reportLinksSent: new Set(), reportOpened: new Set() };
        byT!.set(tmpl, sets);
      }
      return sets;
    };
    for (const m of outTemplated) {
      const sets = setsFor(m.template_name!);
      sets.leads.add(l.id);
      if (isDeliveredStatus(m.status)) sets.delivered.add(l.id);
      if (m.status === 'read') sets.read.add(l.id);
      if (REPORT_LINK_TEMPLATES.has(m.template_name!)) sets.reportLinksSent.add(l.id);
    }

    /* ── PER-TEMPLATE REPLY AND OPEN ─────────────────────────────────────────────
       Both folds run over the lead's FULL message list, in both directions, because the whole
       method is sequence: which send came last before the reply, and which link went out before the
       open. Passing only the outbound templated rows would erase the inbound messages that close a
       run, and every reply after the first would be credited to the wrong template.
       ⚠️ The campaign-level replied/reportOpened above are NOT derived from these. They ask a
       different question ("did this lead ever answer us"), so a lead whose only reply predates any
       templated send counts there and nowhere here. Keeping them independent is why the two can be
       compared: the per-template replies sum to at most the campaign figure, never more. */
    for (const credit of creditRepliesByTemplate(ms)) {
      const sets = setsFor(credit.template);
      sets.replied.add(l.id);
      if (credit.ambiguous) sets.repliedAmbiguous.add(l.id);
    }
    const firstOpenAt = openedAudits.length
      ? Math.min(...openedAudits.map((a) => new Date(a.first_opened_at!).getTime()))
      : null;
    const openCredit = creditOpenToTemplate(ms, REPORT_LINK_TEMPLATES, firstOpenAt);
    if (openCredit) setsFor(openCredit).reportOpened.add(l.id);
  }

  for (const [key, byT] of tmplSets) {
    const b = bucketFor(key);
    for (const [tmpl, sets] of byT) {
      b.byTemplate[tmpl] = {
        leads: sets.leads.size, delivered: sets.delivered.size, read: sets.read.size,
        replied: sets.replied.size, repliedAmbiguous: sets.repliedAmbiguous.size,
        reportLinksSent: sets.reportLinksSent.size, reportOpened: sets.reportOpened.size,
      };
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
    b.reportOpenRatePct = pct(b.reportOpened, b.reportLinksSent);
  }

  // Campaigns first (creation order), Unassigned last and only if it has activity.
  const stats: CampaignStats[] = campaigns.map((c) => buckets.get(c.id)!).filter(Boolean);
  const unassigned = buckets.get(null);
  if (unassigned && (unassigned.leadCount > 0 || unassigned.reached > 0)) stats.push(unassigned);

  return { stats, isLoading: isLoading || campaignsLoading, refetch: fetchData };
}
