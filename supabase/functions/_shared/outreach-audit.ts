/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE OUTREACH AUDIT-AHEAD LANE — audit a queued lead BEFORE its audit_result_hook goes out.

   🔴 WHAT THIS EXISTS TO FIX, MEASURED 2026-09-02. audit_result_hook's {{4}} is the lead's report
   link, so the audit has to exist before the message can be built. It did not, and the drip did not
   wait: `resolveAuditReplyVars` failed and process-whatsapp-queue DROPPED THE LEAD OUT OF THE QUEUE
   — `status: "not_contacted", whatsapp_delivery_status: "audit_reply_unavailable"`. That is correct
   behaviour for a lead that can never be audited (a gated lead must not stall a one-send-per-tick
   drip) and completely wrong for one that simply has not been audited YET.
   Sixteen leads were sitting queued on audit_result_hook with zero completed audits when this was
   written. Every one of them would have been silently un-queued, one per tick, having received
   nothing.

   ⛔ SO THE POSITIVE PATH IS BUILT HERE: pick targets → start audits (capped) → the drip WAITS while
   one is in flight → the existing needsAudit guard lets it send once complete. The guard was never
   wrong; it just had nothing upstream of it.

   ⛔ AND IT IS A SEPARATE LANE FROM THE FREE CHECK, WITH ITS OWN CONSTANTS. The free check runs
   5 questions x 3 runs because a stranger is being emailed a frequency ("named 2 of 3 times").
   Outreach is a first-contact hook: 3 questions x 1 run, which is what the existing outreach audits
   have always been. Nothing here reads or writes a FREE_CHECK_* constant, and the free-check lane
   passes `target_runs` while this one deliberately does not.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { interleaveByCampaign } from "./campaign-interleave.ts";

/** Questions per outreach audit. Three is what the outreach lane has always asked and what the
 *  measured cost below is based on. */
export const OUTREACH_AUDIT_QUESTIONS = 3;

/** ⛔ ONE RUN, EXPRESSED BY SENDING NO `target_runs` AT ALL. create-ai-audit's run count is
 *  `isBaseline ? … : isMeasurement ? MEASUREMENT_RUNS : internalTargetRuns`, and internalTargetRuns
 *  is 0 without the param — 0 meaning an ordinary single-run audit. Stated as a constant so the
 *  cost note and the test have something to name, NOT passed to the API: passing 1 would also write
 *  `baseline_target_runs`, and any value > 1 there marks the lead as having a multi-run audit, which
 *  is what startPaidBaseline keys on (audit-baseline.ts:457). A hook audit must never look like a
 *  guarantee measurement. */
export const OUTREACH_AUDIT_RUNS = 1;

/** How many outreach audits may be in flight at once. Paul's number, 2026-09-02: a batch of 16
 *  queued leads must not fan 16 Apify runs out at once.
 *  ⚠️ This is a cap on what THIS lane starts, not on the audit queue as a whole —
 *  process-ai-audit-queue has its own START_BATCH (12) and AUDIT_IN_FLIGHT_CEILING (24) governing
 *  the questions inside those audits. */
export const OUTREACH_AUDIT_CONCURRENCY = 3;

/** Don't re-audit a lead audited this recently. Re-queuing a lead must not re-run its audit; the
 *  send path reuses whatever completed audit exists (resolveAuditReplyVars takes the newest). */
export const OUTREACH_AUDIT_REPEAT_DAYS = 30;

/** How long the drip will WAIT for a lead's in-flight audit before falling back to the old
 *  drop-out-of-the-queue behaviour. A 3-question audit is one Apify scrape, measured median ~6 min
 *  with a tail to ~18; MAX_RUN_AGE_MS (12 min) plus a retry is the realistic worst case.
 *  ⛔ IT IS BOUNDED ON PURPOSE. An unbounded wait turns one wedged audit into a permanently stalled
 *  queue, which is worse than the dequeue this replaces — the operator can re-queue a dropped lead,
 *  but a silent stall stops every other lead too. */
export const OUTREACH_AUDIT_STALE_MS = 45 * 60 * 1000;

/** Real cost of one outreach audit, MEASURED — not derived from a price list (CLAUDE.md 4).
 *  Fitted over 713 completed runs, `ai_audit_runs.actor_cost_usd` = $0.0004/run + $0.0108/question;
 *  the 579 real 3-question runs in the book average **$0.0331**. SEO is skipped, so that is the
 *  whole Apify cost of a queued lead: ~2.6p. */
export const OUTREACH_AUDIT_EST_USD = 0.0331;

/** The lead fields this lane needs. */
export interface OutreachAuditLead {
  id: string;
  user_id?: string | null;
  business_name: string | null;
  search_keyword: string | null;
  category: string | null;
  search_location: string | null;
  derived_town?: string | null;
  address: string | null;
  country: string | null;
  website: string | null;
  line_type?: string | null;
  status?: string | null;
  previous_status?: string | null;
  whatsapp_delivery_status?: string | null;
}

/* ⛔ PROVEN-NO-WHATSAPP, NOT "WE HAVE NOT CHECKED". These are the states the system writes only
   AFTER Meta has permanently refused a send to that number (classifyFailure → "permanent"), plus
   the SMS lane's own marker. They are facts, not guesses. */
const NO_WA_STATUSES = new Set(["no_whatsapp", "no_whatsapp_needs_sms", "whatsapp_failed"]);

export type WaCapability =
  | { audit: true }
  | { audit: false; reason: string };

/**
 * May we spend an audit on this queued lead — i.e. can it plausibly receive a WhatsApp?
 *
 * ⛔ ABSENCE IS NOT A NEGATIVE, AND THIS IS THE SEVENTEENTH TIME THAT RULE HAS MATTERED. There is NO
 * pre-send certainty about WhatsApp: capability is discovered only by attempting a send and reading
 * Meta's failure code. `whatsapp_status` looks like the answer and is NOT — measured 2026-09-02 it
 * reads 'unknown' on all 2,756 leads, it has never been populated by anything. The only real
 * pre-send signal is `line_type` from the Twilio HLR lookup in enrich-business (landline 1241,
 * mobile 1236, null 173, unknown 106), and process-sms-queue already gates on it the same way.
 *
 * So this refuses only what is KNOWN bad: a proven-permanent WhatsApp failure, or a known landline.
 * A null or 'unknown' line_type PROCEEDS. Skipping those would withhold the audit — and therefore
 * the whole outreach message — from 279 leads on the strength of a lookup that never ran, and the
 * costs are wildly asymmetric: a wasted audit is ~2.6p, a skipped real prospect is the product.
 *
 * ⚠️ A KNOWN LANDLINE IS STILL A HEURISTIC. WhatsApp Business accounts can and do sit on landline
 * numbers, so this will skip a few real ones. That is a deliberate trade against auditing 1,241
 * numbers that mostly cannot receive anything.
 */
export function waCapableForOutreach(lead: OutreachAuditLead): WaCapability {
  const delivery = (lead.whatsapp_delivery_status ?? "").trim();
  if (delivery === "no_whatsapp") {
    return { audit: false, reason: "a previous send was permanently refused — this number has no WhatsApp" };
  }
  for (const s of [lead.status, lead.previous_status]) {
    if (s && NO_WA_STATUSES.has(s)) {
      return { audit: false, reason: `lead status "${s}" records that this number has no WhatsApp` };
    }
  }
  const line = (lead.line_type ?? "").trim().toLowerCase();
  if (line === "landline") {
    return { audit: false, reason: "line_type is a known landline, so a WhatsApp message cannot arrive" };
  }
  return { audit: true };
}

/** Does this template's message need the lead's own completed audit to EXIST before it is queued?
 *  Derived from the template's DECLARED vars, never from its name.
 *
 *  ⛔ THIS IS NOT THE SEND PATHS' RULE, AND THE COMMENT HERE SAID IT WAS UNTIL 2026-09-15 — a stale
 *  comment as a load-bearing bug (CLAUDE.md §4). The senders had their own narrower expression
 *  (`trade || competitors`), which sent audit_followup and competitor_hook down the plain branch
 *  and 500'd. Their question is "which branch BUILDS this payload" and lives in
 *  src/lib/templateRouting.ts as `buildsFromAudit`.
 *  ⚠️ THE TWO GENUINELY DIFFER, ON ONE TEMPLATE, AND MERGING THEM WOULD BE WRONG:
 *  `free_check_result` declares an onboarding link AND a report link, so it BUILDS on the
 *  onboarding branch while still needing a completed audit to exist. Waiting is the broader
 *  question; keep it broader. */
export function templateNeedsAudit(vars: readonly string[] | undefined): boolean {
  if (!vars) return false;
  return vars.includes("trade") || vars.includes("competitors") || vars.includes("audit_url");
}

export interface AuditState {
  /** Newest COMPLETE (or capped) audit for the lead, ISO, if any. */
  completedAt: string | null;
  /** Newest audit that exists but has NOT settled, ISO, if any — i.e. one is in flight. */
  inFlightSince: string | null;
}

export type TargetDecision =
  | { start: true }
  | { start: false; wait: true; reason: string }
  | { start: false; wait: false; reason: string };

/**
 * What should happen to one queued lead, right now. Pure — the caller supplies the audit state so
 * this is testable without a database.
 *
 * ⛔ THE THREE OUTCOMES ARE DELIBERATELY DISTINCT, because two of them used to be the same thing.
 * `wait: true` is the state that did not exist before: the lead stays queued and the drip skips
 * this tick. `wait: false` is the old dequeue — it now fires ONLY when the lead genuinely cannot be
 * served, not merely when it has not been served yet.
 */
export function decideOutreachAudit(
  lead: OutreachAuditLead,
  state: AuditState,
  now: number = Date.now(),
): TargetDecision {
  // Already has a usable audit → nothing to start; the send path will use it.
  if (state.completedAt) {
    const age = now - new Date(state.completedAt).getTime();
    if (age <= OUTREACH_AUDIT_REPEAT_DAYS * 86_400_000) {
      return { start: false, wait: false, reason: "already has a recent completed audit" };
    }
    /* Older than the repeat window. Still NOT re-audited: the message only needs a report link, and
       resolveAuditReplyVars happily uses the newest completed audit however old it is. Re-auditing
       to freshen a link nobody complained about is spend with no recipient. */
    return { start: false, wait: false, reason: "has a completed audit (older than the repeat window, reused as-is)" };
  }

  // An audit is running. Wait for it — unless it has been running long enough to be wedged.
  if (state.inFlightSince) {
    const age = now - new Date(state.inFlightSince).getTime();
    if (age <= OUTREACH_AUDIT_STALE_MS) {
      return { start: false, wait: true, reason: `audit in flight (${Math.round(age / 60000)} min)` };
    }
    return { start: false, wait: false, reason: `audit has been in flight over ${Math.round(OUTREACH_AUDIT_STALE_MS / 60000)} min — treating it as stalled` };
  }

  // Nothing yet. May we spend on it?
  const cap = waCapableForOutreach(lead);
  if (!cap.audit) return { start: false, wait: false, reason: cap.reason };

  if (!(lead.business_name ?? "").trim()) {
    return { start: false, wait: false, reason: "no business name to audit" };
  }
  if (!auditTradeFor(lead)) {
    return { start: false, wait: false, reason: "no trade on the lead to ask about" };
  }
  if (!auditTownFor(lead)) {
    return { start: false, wait: false, reason: "no town on the lead to ask about" };
  }
  return { start: true };
}

/** The trade the audit asks about. Same precedence the other outreach entry points use. */
export function auditTradeFor(lead: OutreachAuditLead): string {
  return ((lead.search_keyword ?? lead.category) ?? "").trim();
}

/** ⛔ THE TOWN PRECEDENCE IS derived_town FIRST. `search_location` is the town SEARCHED, which has a
 *  radius: 31 of 44 measurable audits were more than 10 km from it, up to 79 km, and 28 of those
 *  reached a prospect (CLAUDE.md 8). create-ai-audit overrides this server-side anyway
 *  (confirmed_location || derived_town || search_location); passing the better value means the two
 *  agree even on the path where that override's try/catch fails. */
export function auditTownFor(lead: OutreachAuditLead): string {
  return ((lead.derived_town ?? lead.search_location ?? lead.address) ?? "").trim();
}

export type FireOutcome =
  | { ok: true; auditId: string | null; runId: string | null }
  | { ok: false; error: string };

/**
 * Start one outreach audit. Same endpoint and internal auth as every other internal caller.
 *
 * ⛔ AUTH IS x-cron-secret + x-internal-job. The `Authorization: Bearer SERVICE_ROLE_KEY` branch is
 * DEAD on every function in this project since the ~2026-08-11 key rotation — the gateway forwards
 * only a JWT-shaped bearer while the handler compares against the sb_secret value, and the two are
 * mutually exclusive. Copying that bearer would look right and authenticate nothing.
 *
 * ⚠️ NEVER THROWS. A failure to start an audit must not break the queue tick that noticed it.
 */
export async function fireOutreachAudit(
  // deno-lint-ignore no-explicit-any
  lead: OutreachAuditLead,
): Promise<FireOutcome> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  if (!supabaseUrl) return { ok: false, error: "SUPABASE_URL not set" };
  if (!cronSecret) return { ok: false, error: "CRON_SECRET not set — the internal door is shut" };

  const businessType = auditTradeFor(lead);
  const locationText = auditTownFor(lead);
  if (!lead.business_name) return { ok: false, error: "lead has no business name" };
  if (!businessType) return { ok: false, error: "lead has no trade to ask about" };
  if (!locationText) return { ok: false, error: "lead has no town to ask about" };

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/create-ai-audit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": cronSecret,
        "x-internal-job": "1",
      },
      body: JSON.stringify({
        user_id: lead.user_id ?? null,
        lead_id: lead.id,
        business_name: lead.business_name,
        business_type: businessType,
        location_text: locationText,
        country: lead.country ?? null,
        website: lead.website ?? null,
        has_website: !!(lead.website ?? "").trim(),
        question_count: OUTREACH_AUDIT_QUESTIONS,
        /* skip_seo: the scan is the dearest call in an audit (~4p) and nothing in
           audit_result_hook renders a website grade. The email lane's audit_and_push has forced it
           since the day it was built, for the same reason. */
        skip_seo: true,
        /* ⛔ NO `target_runs`. See OUTREACH_AUDIT_RUNS — omitting it is what makes this a single-run
           ordinary audit and keeps `baseline_target_runs` unwritten, so a hook audit can never be
           mistaken for a guarantee measurement. */
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) {
      return { ok: false, error: `create-ai-audit HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}` };
    }
    return { ok: true, auditId: body.audit_id ?? null, runId: body.run_id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** ⛔ A FAILED AUDIT MUST NOT RETRY FOREVER. A lead whose only audit failed has no completed audit
 *  and nothing in flight, so the decision function would say "start" on every single tick — a
 *  money loop on a lead that cannot be audited (a dead website, a name Apify chokes on). Two
 *  attempts inside the repeat window, then it drops out of the queue with the reason. */
export const OUTREACH_AUDIT_MAX_ATTEMPTS = 2;

// deno-lint-ignore no-explicit-any
type Client = any;

/**
 * The audit state of a set of leads: for each, the newest usable audit, whether one is in flight,
 * and how many have been attempted inside the repeat window.
 *
 * ⚠️ Embeds ai_audit_runs, the same way resolveAuditReplyVars does (audit-reply.ts:61) — that is the
 * proven-working shape for this join. It FAILS SAFE: a lead the read cannot account for is returned
 * with `attempts: -1`, which the caller treats as "do not spend", rather than as "never audited".
 */
export async function readAuditStates(
  service: Client,
  leadIds: string[],
  now: number = Date.now(),
): Promise<Map<string, AuditState & { attempts: number }>> {
  const out = new Map<string, AuditState & { attempts: number }>();
  if (!leadIds.length) return out;
  for (const id of leadIds) out.set(id, { completedAt: null, inFlightSince: null, attempts: 0 });

  const { data, error } = await service
    .from("ai_audits")
    .select("id, lead_id, created_at, ai_audit_runs(status)")
    .in("lead_id", leadIds)
    .order("created_at", { ascending: false });
  if (error) {
    /* ⛔ FAIL CLOSED. An unreadable audit history must not read as "no audits yet" — that is the
       absent-value fault pointed straight at the thing that spends money. */
    for (const id of leadIds) out.set(id, { completedAt: null, inFlightSince: null, attempts: -1 });
    return out;
  }

  const SETTLED_OK = new Set(["complete", "capped"]);
  const SETTLED_BAD = new Set(["failed", "cancelled"]);
  const window = OUTREACH_AUDIT_REPEAT_DAYS * 86_400_000;
  for (const a of (data ?? []) as Array<{ lead_id: string; created_at: string; ai_audit_runs?: Array<{ status: string }> }>) {
    const cur = out.get(a.lead_id);
    if (!cur || cur.attempts < 0) continue;
    const runs = Array.isArray(a.ai_audit_runs) ? a.ai_audit_runs : [];
    const usable = runs.some((r) => SETTLED_OK.has(String(r.status)));
    const inFlight = runs.length === 0 || runs.some((r) => !SETTLED_OK.has(String(r.status)) && !SETTLED_BAD.has(String(r.status)));
    if (now - new Date(a.created_at).getTime() <= window) cur.attempts += 1;
    // Newest-first, so the first usable one wins and later (older) rows never overwrite it.
    if (usable && !cur.completedAt) cur.completedAt = a.created_at;
    if (!usable && inFlight && !cur.inFlightSince) cur.inFlightSince = a.created_at;
  }
  return out;
}

export interface AuditAheadSummary {
  considered: number;
  started: number;
  waiting: number;
  skipped: number;
  inFlight: number;
  reasons: Record<string, string>;
}

/**
 * Start audits for queued leads whose template needs one, up to OUTREACH_AUDIT_CONCURRENCY in
 * flight. Reads only queued, unarchived leads with a phone — the same population the drip sends to.
 *
 * ⚠️ IT STARTS AUDITS AND NOTHING ELSE. It never changes a lead's status, never sends, and never
 * dequeues: a lead it cannot audit is simply left for the drip's own guard to report. Keeping the
 * two decisions in one place would mean this pass could silently un-queue a lead the operator was
 * still waiting on.
 */
export async function runOutreachAuditAhead(
  service: Client,
  templateVars: (name: string | null | undefined) => readonly string[] | undefined,
  now: number = Date.now(),
): Promise<AuditAheadSummary> {
  const sum: AuditAheadSummary = { considered: 0, started: 0, waiting: 0, skipped: 0, inFlight: 0, reasons: {} };

  const { data: leads } = await service
    .from("outreach_leads")
    .select("id, user_id, business_name, search_keyword, category, search_location, derived_town, address, country, website, line_type, status, previous_status, whatsapp_delivery_status, whatsapp_template, campaign_id, queued_at")
    .eq("status", "queued")
    .eq("is_archived", false)
    .not("phone", "is", null)
    .order("queued_at", { ascending: true })
    /* 🔴 60 → 400 ON 2026-09-14, BECAUSE 60 WAS SILENTLY TRUNCATING A REAL QUEUE. Measured that
       day: 111 leads queued, of which 44 already had a completed audit and 3 were in flight — so
       the oldest 60 were mostly leads with nothing left to do, and 51 leads with NO audit were not
       considered at all. The horizon is FIFO, so nothing was lost permanently; it just could not
       start work it could see no reason to start.
       ⚠️ THE DYNAMIC THAT CAUSES IT, because it will recur: an audited lead STAYS `queued` until it
       is SENT, and sending is paced (~2.18 min at cap 400) while three audits finish in ~5 min
       each. Audited-but-unsent leads therefore pile up at the FRONT of the FIFO and eat the
       horizon. The horizon must exceed a day's queue, not a day's audits.

       ⛔ 400 IS A CEILING SET BY A TRUNCATION TRAP, NOT A ROUND NUMBER, AND IT MUST NOT BE RAISED
       ALONE. readAuditStates() below does ONE `.in()` over these ids and gets back ONE ROW PER
       AUDIT — and PostgREST silently caps a result at db-max-rows, measured at exactly 1000 on this
       project (a paginated count of lead-linked audits returned a first page of exactly 1000 of
       1014). If that read truncates, the leads whose audits fall off the end read as
       `{completedAt: null, attempts: 0}` — which is INDISTINGUISHABLE FROM "never audited" and
       starts a duplicate paid audit. That is the contact_check failure of 2026-09-03 exactly: a
       guard that answers "clean" for something it simply could not see, while looking like it works.
       MEASURED FAN-OUT (whole book, paginated): 1,014 lead-linked audits across 994 leads — median
       1 per lead, p99 2, max 5. Today's queue returned 47 audit rows for 111 leads. At 400 ids the
       read returns ~128 rows measured, and ~800 even if every lead carried the p99 of 2. Past ~500
       the worst case touches 1000 and the trap opens.
       ⛔ SO: TO GO ABOVE ~450, PAGINATE readAuditStates FIRST (fetchAllRows' pattern, ordered by a
       unique tiebreaker). Raising this number on its own is the expensive half of the mistake.

       ⚠️ IT DOES NOT SLOW THE TICK, AND THAT WAS MEASURED RATHER THAN ASSUMED. Both reads are
       bounded and there are still exactly two of them per tick whatever N is — the per-lead loop
       breaks at OUTREACH_AUDIT_CONCURRENCY (3), so nothing downstream scales with N. Timed against
       the live database: 60 ids → 22 rows, 200 → 66, 300 → 99, 400 → 128 rows in 0.60s, 600 → 182
       in 1.10s, all from a laptop on the other side of the world; the function runs beside the
       database. The URL at 400 ids is ~14,900 chars and PostgREST serves it fine (a 909-item `.in()`
       was measured working in 2026-09-03's contact_check work).
       ⚠️ ONE FALSE ALARM WORTH RECORDING: Node's undici threw HeadersOverflowError at 400 ids while
       curl returned 200 at 600. That was the HARNESS, not the server. Check with a second client
       before believing a big-URL failure. */
    .limit(400);

  /* ⛔ ROUND-ROBIN ACROSS CAMPAIGNS, NOT FIFO (2026-09-14). The read above is ordered by queued_at,
     which is global FIFO — so this lane would start every audit for the campaign queued first and
     only reach the second one hours later. The SEND lane was fixed the same day for the same reason,
     and fixing only that one would have achieved nothing: an audit-class template cannot send
     without its audit, so a fairly-ordered sender would simply have been held by the needsAudit
     guard instead. Same starvation, one layer down. Both lanes call the SAME function. */
  const rows = interleaveByCampaign(
    ((leads ?? []) as Array<OutreachAuditLead & { whatsapp_template: string | null; campaign_id: string | null; queued_at: string | null }>)
      .filter((l) => templateNeedsAudit(templateVars(l.whatsapp_template))),
  );
  sum.considered = rows.length;
  if (!rows.length) return sum;

  const states = await readAuditStates(service, rows.map((l) => l.id), now);

  /* In-flight is counted across the WHOLE queued audit-class set before anything is started, so the
     cap is a cap on concurrent audits — not on how many this tick starts. */
  for (const l of rows) {
    const st = states.get(l.id);
    if (st?.inFlightSince) sum.inFlight += 1;
  }

  for (const l of rows) {
    if (sum.inFlight >= OUTREACH_AUDIT_CONCURRENCY) break;
    const st = states.get(l.id) ?? { completedAt: null, inFlightSince: null, attempts: 0 };
    if (st.attempts < 0) { sum.skipped += 1; sum.reasons[l.id] = "audit history unreadable — not spending"; continue; }
    if (st.attempts >= OUTREACH_AUDIT_MAX_ATTEMPTS && !st.completedAt) {
      sum.skipped += 1;
      sum.reasons[l.id] = `${st.attempts} audits already attempted and none completed`;
      continue;
    }
    const d = decideOutreachAudit(l, st, now);
    if (!d.start) {
      if (d.wait) { sum.waiting += 1; } else { sum.skipped += 1; sum.reasons[l.id] = d.reason; }
      continue;
    }
    const fired = await fireOutreachAudit(l);
    if (fired.ok) {
      sum.started += 1;
      sum.inFlight += 1;
      console.log(`[outreach-audit] started ${fired.auditId} for lead ${l.id} (${l.business_name})`);
    } else {
      sum.skipped += 1;
      sum.reasons[l.id] = `could not start: ${fired.error}`;
      console.error(`[outreach-audit] start FAILED for lead ${l.id}: ${fired.error}`);
    }
  }
  return sum;
}
