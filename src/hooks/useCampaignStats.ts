import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCampaigns, type Campaign } from '@/hooks/useCampaigns';
import { looksAutomated, isDecline } from '@/lib/inboundClassify';
import { isRealSend } from '@/lib/realSend';
import { isPaidLead } from '@/lib/leadPayment';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { creditRepliesByTemplate, creditOpenToTemplate, creditEventToTemplate, OPEN_ATTRIBUTION_SLACK_MS } from '@/lib/templateAttribution';
import { foldArmComparison, type ArmComparison, type ArmLeadInput } from '@/lib/armComparison';
import { canonicalTemplate } from '@/lib/whatsappTemplates';

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
   video_template and free_check_result have `audit_url`.
   ⚠️ IT IS DELIBERATELY WIDER THAN PITCH_TEMPLATES. The first version of this used audit_reply
   alone, because that is the pitch. Measured against the live table, that was wrong in a way that
   mattered: links sent 577 -> 653, opened 366 -> 408, and the opens we could not attribute at all
   fell from 55 to 13 — because most of those "unexplained" opens were leads sent their report by
   video_template, which became the outreach hook and never got added here.
   ⚠️ SO: IF A NEW TEMPLATE EVER CARRIES A REPORT LINK, ADD IT HERE. Forgetting does not throw; it
   silently moves real prospect opens into the unattributed bucket and understates the rate. */
/* ⚠️ audit_reply_warm ADDED 2026-09-07 WITH THE TEMPLATE ITSELF. Its {{3}} is the report link, so
   forgetting it here does not throw — it silently moves real prospect opens into the unattributable
   bucket and understates the open rate, which is the failure this set's own comment records. */
/* ⚠️ FIVE NOW. Forgetting to add a report-carrying template here does not throw — it silently moves
   that template's real prospect opens into the "not attributable" bucket and prints a low open rate
   for the template beside it. competitor_hook's {{6}} is the same findable.live/report/<auditId>
   link every other entry carries. */
const REPORT_LINK_TEMPLATES = new Set(['audit_reply', 'video_template', 'free_check_result', 'audit_reply_warm', 'competitor_hook']);

/* ⛔ THE DAY PAGE-HIT LOGGING WENT LIVE. Every site-visit rate is measured from here, because a
   send that predates it had no way to be counted and would drag its template's rate to a meaningless
   0%. Set once, when findable-onboarding's prefill hook was deployed — do not "refresh" it, and do
   not derive it from the earliest row in the table: an empty first week would then silently move the
   start date forward and inflate every rate.
   ⚠️ IT IS THE MIDNIGHT AFTER THE DEPLOY, NOT THE DEPLOY MINUTE, AND THAT IS THE CONSERVATIVE
   DIRECTION ON PURPOSE. The hook went live mid-afternoon on 2026-09-05 with the table not yet
   created, so part of that day's sends could not have produced a hit however fast the SQL was run.
   Counting them would divide real sends by a period the tracking was not running and print a low
   rate on day one — the first number anyone looks at. Excluding the partial day costs one day of
   history and buys a figure that is right from the moment it first appears. The card shows
   "none sent since" until a template is sent inside the tracked window, which is the honest state.
   ⚠️ London is UTC+1 in September and the outreach window is 07:00–21:30 London, so a UTC-midnight
   boundary lands over an hour before any send day begins. No day is ever split by it. */
const SITE_TRACKING_START = Date.parse('2026-09-06T00:00:00Z');

/* A questionnaire submission whose source is the FREE CHECK form is not a sign-up start. 12 of the
   22 onboarding rows on file are free checks (measured 2026-09-05), and counting them credited our
   outreach with people who found the website on their own. */
const FREE_CHECK_SOURCE = 'free_check';

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
  /* ── THE CLICK FUNNEL ──────────────────────────────────────────────────────────────
     ⛔ `sentSinceTracking` IS THE DENOMINATOR FOR siteVisits AND IT IS NOT THE SAME AS `leads`.
     Page-hit logging began on SITE_TRACKING_START; a template sent 400 times BEFORE that date could
     not have produced a single recorded visit, so dividing by its lifetime sends would print a
     confident 0% for a message that was never measured. Rates over an unmeasured period are the
     fake zeros this card exists to avoid. */
  sentSinceTracking: number;
  /** Of `sentSinceTracking`, leads who then landed on the sign-up page. */
  siteVisits: number;
  /** Leads who SUBMITTED the questionnaire after this template. Free-check form submissions are
   *  excluded — they are a different form, reached from the website rather than driven by us. */
  signupStarted: number;
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
  /* ⛔ COLD vs WARM, AND IT IS A DIFFERENT QUESTION FROM byTemplate. The per-template rows credit
     LAST TOUCH ("which message earned this click"); this credits the arm the LEAD was sent
     ("does warm convert better than cold"), so a follow-up going out in between cannot take a
     click off the template under test. Both are honest; they answer different things, and the card
     labels which is which. See src/lib/armComparison.ts. */
  armComparison: ArmComparison;
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
/** One recorded landing on the sign-up page. Written by findable-onboarding's prefill hook. */
interface HitRow { lead_id: string | null; created_at: string }
/** A questionnaire submission, from the submissions endpoint (the table is RLS-no-policy). */
interface StartedRow { lead_id: string | null; created_at: string; source: string | null }

const pct = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num / den) * 100) : null;

/**
 * Per-campaign rollups derived from whatsapp_messages. Leads are the caller's own (RLS).
 * Best-effort: a failure logs and leaves the previous numbers rather than blanking the page.
 */
/** Stable empties — a fresh array per render defeats the caching below. */
const EMPTY_LEADS: LeadRow[] = [];
const EMPTY_MSGS: MsgRow[] = [];
const EMPTY_STARTED: StartedRow[] = [];
const EMPTY_HITS: HitRow[] = [];
const EMPTY_AUDITS: AuditRow[] = [];

/** One campaign-stats load. Was six useState slots. */
interface CampaignStatsData {
  leads: LeadRow[];
  messages: MsgRow[];
  startedRows: StartedRow[];
  hits: HitRow[];
  audits: AuditRow[];
  /** Only an actual successful read sets this — see the site-visit branch. */
  siteTrackingReady: boolean;
}

export function useCampaignStats() {
  const { user } = useAuth();
  const { campaigns, isLoading: campaignsLoading } = useCampaigns();
  const queryClient = useQueryClient();
  /* ⛔ ON REACT QUERY SINCE 2026-09-10. This hook read the whole lead table, the whole message
     table and the whole audit table on EVERY arrival at the campaigns view — three paginated
     full-table scans plus two more reads — and threw the results away on navigation. Held for
     the app-wide five minutes now.
     ⚠️ The fetch body is unchanged, including both defensive branches: a site-visit failure
     still means "not tracked" rather than "zero visits", and a questionnaire-starts failure
     still degrades `started` to 0 rather than taking the card down. They set fields on the
     returned object where they used to call setters. */
  const queryKey = useMemo(() => ['campaign-stats', user?.id ?? null] as const, [user?.id]);

  const fetchData = useCallback(async (): Promise<CampaignStatsData> => {
    let leads: LeadRow[] = EMPTY_LEADS;
    let messages: MsgRow[] = EMPTY_MSGS;
    let startedRows: StartedRow[] = EMPTY_STARTED;
    let hits: HitRow[] = EMPTY_HITS;
    let audits: AuditRow[] = EMPTY_AUDITS;
    let siteTrackingReady = false;
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
      leads = (leadsRes.rows);
      /* ⛔ CANONICALISE THE TEMPLATE NAME ONCE, HERE, AND EVERY COUNT BELOW INHERITS IT.
         Two templates were re-registered at Meta under new names on 2026-09-12, and 135 + 20 rows
         in this very table still carry the old ones. Every consumer downstream compares against a
         literal — REPORT_LINK_TEMPLATES, PITCH_TEMPLATES, SIGNUP_TEMPLATES, the per-template
         buckets, last-touch attribution and the A/B arms — so canonicalising at any ONE of those
         would have left the others quietly short. Doing it at the read is the only place that
         cannot be partially applied.
         ⚠️ It rewrites nothing in the database: the stored row is the receipt of what Meta was
         actually told, and it stays that way. See TEMPLATE_RENAMES. */
      messages = msgsRes.rows.map((m) => (
        m.template_name ? { ...m, template_name: canonicalTemplate(m.template_name) } : m
      ));
      audits = (auditsRes.rows);
    } catch (e) {
      console.error('Campaign stats fetch failed (non-blocking):', e);
    }

    /* ── SITE VISITS ─────────────────────────────────────────────────────────────────
       ⛔ A FAILURE HERE MUST MEAN "UNKNOWN", NEVER "ZERO VISITS". Until the SQL is run the table
       does not exist and PostgREST answers 404/PGRST205; owner RLS could also (in the failure this
       project keeps hitting) answer 200 with an empty array. Only an ACTUAL SUCCESSFUL READ sets
       siteTrackingReady, so the card can say "not tracked yet" instead of printing 0% against every
       template — which would read as "nobody clicked" and is the opposite of the truth. */
    try {
      const client = supabase as unknown as SupabaseClient;
      const res = await fetchAllRows<HitRow>('Campaign stats (page hits)', (from, to) =>
        client.from('lead_page_hits').select('lead_id, created_at')
          .order('id', { ascending: true }).range(from, to));
      hits = (res.rows);
      siteTrackingReady = (true);
    } catch (e) {
      siteTrackingReady = (false);
      console.warn('Site-visit tracking unavailable (shows as not tracked):', e instanceof Error ? e.message : e);
    }

    /* Questionnaire starts — THROUGH THE submissions ENDPOINT. The old direct read of
       onboarding_responses hit RLS-with-no-policies and returned 200 [] for every browser session,
       so `started` was structurally 0 on every campaign card since the day it shipped (proven live
       2026-08-19: an operator session sees 0 of the 7 rows that exist). Still defensive: a failure
       degrades `started` to 0 rather than taking the whole card down. */
    try {
      const { data: res, error } = await supabase.functions.invoke('submissions', { body: { action: 'lead_statuses' } });
      if (error || !res?.ok) throw new Error(error?.message ?? res?.error ?? 'lead_statuses failed');
      startedRows = ((res.rows ?? []) as StartedRow[]);
    } catch (e) {
      console.warn('Onboarding starts unavailable (started shows 0):', e instanceof Error ? e.message : e);
    }

    return { leads, messages, startedRows, hits, audits, siteTrackingReady };
  }, []);

  const query = useQuery({ queryKey, queryFn: fetchData, enabled: !!user?.id });
  const data = query.data;
  /* Module-level empties: a new array per render would give every fold below a fresh identity. */
  const leads = data?.leads ?? EMPTY_LEADS;
  const messages = data?.messages ?? EMPTY_MSGS;
  const startedRows = data?.startedRows ?? EMPTY_STARTED;
  const hits = data?.hits ?? EMPTY_HITS;
  const audits = data?.audits ?? EMPTY_AUDITS;
  /* ⛔ FALSE UNTIL AN ACTUAL SUCCESSFUL READ SAYS OTHERWISE — unchanged, and the reason is
     unchanged too: the card must be able to say "not tracked yet" rather than print 0% against
     every template, which reads as "nobody clicked" and is the opposite of the truth. */
  const siteTrackingReady = data?.siteTrackingReady ?? false;
  const isLoading = !!user?.id && query.isPending;

  // --- Group messages by lead, oldest first (the fetch is already ordered). ---
  const msgsByLead = new Map<string, MsgRow[]>();
  for (const m of messages) {
    if (!m.lead_id) continue;
    const arr = msgsByLead.get(m.lead_id);
    if (arr) arr.push(m); else msgsByLead.set(m.lead_id, [m]);
  }

  /* Audits per lead. A lead can have several (re-audits mint a new row), so the open test below
     asks whether ANY of them was opened after the link went out. */
  /* Earliest recorded landing per lead. Earliest, not latest: the question a template is credited
     with is "did this message get them to the site", and a later return visit does not un-happen it. */
  const firstHitByLead = new Map<string, number>();
  for (const h of hits) {
    if (!h.lead_id) continue;
    const t = Date.parse(h.created_at);
    const cur = firstHitByLead.get(h.lead_id);
    if (cur === undefined || t < cur) firstHitByLead.set(h.lead_id, t);
  }

  /* Questionnaire submissions per lead. Free-check rows are kept in `startedByLead` (the
     campaign-level count wants them) and filtered out of the per-template credit below. */
  const startedByLead = new Map<string, StartedRow[]>();
  for (const r of startedRows) {
    if (!r.lead_id) continue;
    const arr = startedByLead.get(r.lead_id);
    if (arr) arr.push(r); else startedByLead.set(r.lead_id, [r]);
  }

  const auditsByLead = new Map<string, AuditRow[]>();
  for (const a of audits) {
    if (!a.lead_id) continue;
    const arr = auditsByLead.get(a.lead_id);
    if (arr) arr.push(a); else auditsByLead.set(a.lead_id, [a]);
  }

  /* Per-campaign A/B input, gathered in the same pass as everything else. Keyed the same way the
     buckets are, so a lead lands in the comparison for the campaign it belongs to. */
  const armRows = new Map<string | null, ArmLeadInput[]>();

  // Seed one bucket per campaign, plus an Unassigned bucket.
  const buckets = new Map<string | null, CampaignStats>();
  const seed = (campaign: Campaign | null): CampaignStats => ({
    campaign, leadCount: 0, reached: 0, delivered: 0, read: 0, replied: 0, declined: 0,
    pitched: 0, pitchReplied: 0, signupSent: 0, started: 0, paid: 0, moneyIn: 0,
    reportLinksSent: 0, reportOpened: 0, reportOpensUnattributed: 0,
    replyRatePct: null, pitchReplyRatePct: null, repliedToPaidPct: null, reachedToPaidPct: null,
    reportOpenRatePct: null,
    byTemplate: {},
    armComparison: { arms: { video_template: { leads: 0, leadsTracked: 0, reportOpened: 0, siteVisits: 0, signups: 0 },
                             audit_reply_warm: { leads: 0, leadsTracked: 0, reportOpened: 0, siteVisits: 0, signups: 0 } },
                     bothArms: 0, hasData: false },
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
    sentSinceTracking: Set<string>; siteVisits: Set<string>; signupStarted: Set<string>;
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
    /* Campaign-level `started` keeps counting EVERY submission including free checks: at campaign
       level the question is "did anyone fill anything in", and the free-check form is a real signal
       of interest. The PER-TEMPLATE figure is the one that excludes them, because there it would be
       crediting a template with a visitor who arrived on their own. */
    if (startedByLead.has(l.id)) b.started += 1;
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
                 reportLinksSent: new Set(), reportOpened: new Set(),
                 sentSinceTracking: new Set(), siteVisits: new Set(), signupStarted: new Set() };
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
      /* The measurable denominator for site visits: only sends that happened while the hook that
         records a landing was actually running. */
      if (Date.parse(m.created_at) >= SITE_TRACKING_START) sets.sentSinceTracking.add(l.id);
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

    /* ── SITE VISIT ────────────────────────────────────────────────────────────────
       ⚠️ NO restrictTo, UNLIKE THE REPORT OPEN. A report open can only belong to a template that
       carried a report link; a site visit can follow ANY message — they may have tapped the report
       link and then the offer button, or an onboarding link, or gone to the site after reading the
       opener. Last touch answers the only question available: which message was in front of them.
       ⚠️ A visit with NO send before it earns nothing (creditEventToTemplate returns null). Those
       are people who found the site themselves; crediting them to a later template would invent a
       click out of a coincidence. */
    const visitCredit = creditEventToTemplate(ms, firstHitByLead.get(l.id) ?? null);
    /* ⛔ THE NUMERATOR IS GATED BY THE SAME WINDOW AS THE DENOMINATOR, OR THE RATE CAN EXCEED
       100%. Caught before shipping: a lead sent audit_reply LAST MONTH who lands on the site
       tomorrow is credited to audit_reply, but that send is not in `sentSinceTracking` (it predates
       the hook), so the visit would have been divided by a denominator it was never part of.
       Requiring the credited lead to be in that template's tracked-send set makes the numerator a
       subset of the denominator by construction rather than by arithmetic that happens to agree. */
    if (visitCredit && setsFor(visitCredit).sentSinceTracking.has(l.id)) {
      setsFor(visitCredit).siteVisits.add(l.id);
    }

    /* ── SIGN-UP STARTED ──────────────────────────────────────────────────────────
       ⛔ "STARTED" IS A SUBMISSION, NOT A PAGE VIEW, AND THE LABEL MUST NOT PRETEND OTHERWISE. An
       onboarding_responses row is written by exactly one thing: action:"submit" (the finish button
       or the bail-out). Landing on the questionnaire writes nothing — that is what the site-visit
       column above now covers. The two together are the funnel; either alone is half of it.
       ⚠️ Free-check submissions are excluded HERE and only here. They are a different form on the
       website, so crediting one to a template would credit outreach with a visitor who arrived on
       their own. The campaign-level `started` above deliberately still counts them. */
    const firstStart = (startedByLead.get(l.id) ?? [])
      .filter((r) => r.source !== FREE_CHECK_SOURCE)
      .map((r) => Date.parse(r.created_at))
      .sort((a, z) => a - z)[0];
    const startCredit = creditEventToTemplate(ms, firstStart ?? null);
    if (startCredit) setsFor(startCredit).signupStarted.add(l.id);

    /* ── THE A/B ROW ──────────────────────────────────────────────────────────────
       Built from the SAME facts the columns above use, so the two views cannot disagree about what
       happened — only about which template to credit for it. `sends` is every real templated send
       in time order; the fold picks the arm out of it. */
    if (!armRows.has(key)) armRows.set(key, []);
    armRows.get(key)!.push({
      leadId: l.id,
      sends: outTemplated.map((m) => ({ template: m.template_name!, at: Date.parse(m.created_at) })),
      firstVisitAt: firstHitByLead.get(l.id) ?? null,
      firstSignupAt: firstStart ?? null,
      firstReportOpenAt: firstOpenAt,
    });
  }

  for (const [key, byT] of tmplSets) {
    const b = bucketFor(key);
    for (const [tmpl, sets] of byT) {
      b.byTemplate[tmpl] = {
        leads: sets.leads.size, delivered: sets.delivered.size, read: sets.read.size,
        replied: sets.replied.size, repliedAmbiguous: sets.repliedAmbiguous.size,
        reportLinksSent: sets.reportLinksSent.size, reportOpened: sets.reportOpened.size,
        sentSinceTracking: sets.sentSinceTracking.size, siteVisits: sets.siteVisits.size,
        signupStarted: sets.signupStarted.size,
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

  /* The A/B fold, per campaign. Runs over the rows gathered above rather than re-reading anything,
     so it costs one pass and cannot drift from the per-template numbers beside it. */
  for (const [key, rows] of armRows) {
    bucketFor(key).armComparison = foldArmComparison(rows, SITE_TRACKING_START);
  }

  // Campaigns first (creation order), Unassigned last and only if it has activity.
  const stats: CampaignStats[] = campaigns.map((c) => buckets.get(c.id)!).filter(Boolean);
  const unassigned = buckets.get(null);
  if (unassigned && (unassigned.leadCount > 0 || unassigned.reached > 0)) stats.push(unassigned);

  /* siteTrackingReady travels with the stats so the card can tell "no visits" from "no tracking".
     Deriving it in the component from `siteVisits === 0` would be exactly the conflation the flag
     exists to prevent. */
  /* ⛔ `refetch` MUST INVALIDATE, NOT CALL THE LOADER. `fetchData` returns its results now
     instead of writing state, so calling it directly would run five queries and throw the
     answer away — a refresh button that silently does nothing. Invalidating is also what stops
     two refresh presses starting two fetches. */
  const refetch = useCallback(
    () => { void queryClient.invalidateQueries({ queryKey }); },
    [queryClient, queryKey],
  );
  return { stats, siteTrackingReady, isLoading: isLoading || campaignsLoading, refetch };
}
