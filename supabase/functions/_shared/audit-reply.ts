// Per-lead resolution of the audit_reply template's variables — the SINGLE source used by any
// sender (send-whatsapp-message's audit_reply branch today). Resolves STRICTLY from the target
// lead's own latest completed audit: {{1}} trade, {{2}} competitors, {{3}} business, {{4}} report.
// The report link is /a/<auditId> — served live by render-audit-report from the audit (no stored
// business_reports row needed). Competitors come from the SHARED buildReportData output — the
// report's HEADLINE rivals (gutPunch) first, so the pitch names exactly what the report leads
// with; frequency-aggregate fallback (US-marker-filtered for UK audits) when there's no gutPunch.
import { buildReportData, seoStyleForAudit, type QueueRow, type RunRow } from "../../../src/lib/auditReport.ts";
import { isAggregatorUrl } from "./aggregators.ts";
import { countAnsweredCells, readCleaningStamp } from "../../../src/lib/competitorCleaning.ts";
import { usableRivals, excludeSelfRivals } from "../../../src/lib/rivalHook.ts";
import { nameMatches } from "../../../src/lib/nameMatch.ts";
import { shortReportUrl } from "../../../src/lib/reportSlug.ts";
import { resolveSiteFault, type CrawlSignals } from "../../../src/lib/crawlCheck.ts";

// Public report origin (matches the /a/<slug|auditId> route fronted by functions/a/[slug].ts).
/* ⛔ THE PROSPECT-FACING ORIGIN. findable.live/report/<auditId> — a Pages Function proxy that forces
   text/html (findable-site functions/report/[id].ts). NEVER the Supabase function URL: the gateway
   serves it text/plain with nosniff, so a browser shows raw HTML source.
   {{4}} of the audit_reply template is a BODY TEXT variable (templateBodyParams sends type:"body"),
   not a button URL, so changing this value needs NO Meta template resubmission — the template body
   is unchanged and the value is filled at send time.
   The 64 links already sent point at yoursites.uk/a/<uuid>; that proxy stays live and untouched. */
const REPORT_SITE_ORIGIN = "https://findable.live";

/* ⛔ META REJECTS A PARAMETER CONTAINING A NEWLINE, A TAB, OR 4+ CONSECUTIVE SPACES — #132018,
   "Param text cannot have new-line/tab characters or more than 4 consecutive spaces". The whole
   send fails; nothing is delivered and the lead who just replied hears nothing back.
   It happened four times on 2026-08-12, every one of them the SAME extraction fragment reaching
   {{2}}: "Checkatrade
    
    If" — a competitor name carrying two newlines and eight spaces.
   `.trim()` alone could never catch it, because the whitespace is INTERNAL.

   ⚠️ COLLAPSE, NOT REJECT. Dropping the name would lose a real competitor ("Checkatrade" IS who AI
   named); collapsing keeps the fact and makes it sendable. A name is a name whether the extractor
   wrapped it across lines or not.
   ⚠️ AND IT IS A GUARD, NOT THE FIX. The extractor should not be emitting multi-line fragments as
   business names in the first place — that is a separate, larger repair upstream.

   🔴 THE LOCAL `collapseWhitespace` HELPER IS GONE (2026-09-14) AND THE RULE IS NOT. It lived here
   and was applied to ONE variable of ONE template; `usableRivals` (src/lib/rivalHook.ts) now does
   the same collapse where the names are CHOSEN, so the joined {{2}} and competitor_hook's three
   separate parameters cannot be cleaned differently. templateBodyParams' own `forMeta` still
   collapses EVERY variable of EVERY template immediately before the send, which is the backstop.
   Two layers, one rule, no third copy. */

/** Top competitor names → a readable list ("Whitings, TC Group and Charlotte Watson"). Caps at 3
 *  so the WhatsApp line stays tight. Empty string when there are none. (Mirrors the auto-flow.) */
export function formatCompetitors(list: string[]): string {
  /* ⛔ THE JOINED STRING AND THE THREE SEPARATE PARAMETERS ARE THE SAME NAMES, BY CONSTRUCTION.
     `competitor_hook` sends the rivals as three variables ({{3}} {{4}} {{5}}) while `audit_reply`
     sends one joined string ({{2}}), and the Inbox renders the joined form as the transcript for
     BOTH. Selecting them twice — once here, once for the parameters — is the rules-in-two-places
     shape: the two would agree today and drift the first time either capped, collapsed or
     de-duplicated differently, and the operator's record of what was sent would stop matching what
     the prospect read. So both start from usableRivals. */
  const top = usableRivals(list);
  if (top.length === 0) return "";
  if (top.length === 1) return top[0];
  return `${top.slice(0, -1).join(", ")} and ${top[top.length - 1]}`;
}

export type AuditReplyVars =
  /* `town` is carried because audit_result_hook names it ({{3}}) while audit_reply does not.
     The resolver has always SELECTED location_text; it simply never returned it. Deriving it here
     rather than at each call site keeps one answer to "which town is this lead's audit about". */
  /* `rivals` is the SAME top names `competitors` is joined from, kept as a list for a template that
     sends them as separate variables (competitor_hook's {{3}} {{4}} {{5}}). It can hold FEWER than
     three — that is the caller's decision to make (src/lib/rivalHook.ts), not a reason to refuse
     here: audit_reply and video_template are unaffected by how many there are. */
  /* `siteFault` is `audit_followup_fault`'s {{6}} (siteFaultLine): the no-website line for a lead with
     no site at all, else the lead's main crawl fault. NULL when the lead HAS a website but the crawl
     found nothing to name (clean site, or unreachable) — Meta rejects an empty parameter, so a null
     here is what makes that template unsendable and unoffered for that lead. Every other template
     ignores it. */
  | { ok: true; trade: string; competitors: string; rivals: string[]; business: string; link: string; town: string; auditId: string; siteFault: string | null }
  | { ok: false; reason: string };

/**
 * Resolve audit_reply's 4 vars for a lead from its OWN latest completed audit. Returns
 * { ok:false, reason } (never throws) when there's no completed audit, no competitors, or the
 * audit lacks a business name/type — so the caller can refuse rather than send a broken template.
 */
// deno-lint-ignore no-explicit-any
export async function resolveAuditReplyVars(service: any, leadId: string): Promise<AuditReplyVars> {
  // 1) The lead's newest audit that has a COMPLETE (or capped) run — strictly by lead_id.
  const { data: audits } = await service
    .from("ai_audits")
    .select("id, short_code, business_name, business_type, location_text, specialism, country, created_at, baseline_target_runs, ai_audit_runs(id, run_number, status, mention_rate, results, created_at), is_measurement")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  const list = Array.isArray(audits) ? audits : [];
  // deno-lint-ignore no-explicit-any
  let audit: any = null; let run: any = null;
  for (const a of list) {
    const runs = Array.isArray(a.ai_audit_runs) ? [...a.ai_audit_runs] : [];
    runs.sort((x, y) => (y.run_number ?? 0) - (x.run_number ?? 0));
    const done = runs.find((r) => r.status === "complete" || r.status === "capped");
    if (done) { audit = a; run = done; break; }
  }
  if (!audit || !run) return { ok: false, reason: "No completed audit for this lead yet — run an audit first." };

  // 2) Competitors via the SHARED aggregation (same list the report uses), from THIS run.
  const { data: qrows } = await service
    .from("ai_audit_queue")
    .select("id, question, status, result")
    .eq("run_id", run.id)
    .order("created_at", { ascending: true });
  /* ⛔ A CAPPED RUN IS NOT AUTOMATICALLY A FINISHED AUDIT — the SAME check bulk-jobs already makes,
     ported here so the two paths cannot disagree about the same lead.
     THE BUG THIS FIXES: a capped run that never answered a single question passed the run test above
     and then failed below with "The audit named no competitors yet" — a TRUE statement about a FALSE
     premise. It happened for real on 2026-08-08 (ten leads, 30 queue rows, all failed, zero answers,
     $0.0000 spent) and sent Paul looking at competitor extraction when the cause was queue
     concurrency two layers up. bulk-jobs was fixed then; this path was not.
     ⚠️ ONLY A CAPPED RUN IS QUESTIONED, exactly as bulk-jobs does it — "a complete run is not
     questioned, it is complete by definition". A FAILED run never reaches here at all: the selector
     above accepts only complete|capped, so a failed audit already returns the no-completed-audit
     reason and is never described as a competitor problem. */
  const answered = countAnsweredCells((qrows ?? []) as Parameters<typeof countAnsweredCells>[0]);
  if (run.status === "capped" && answered === 0) {
    return { ok: false, reason: "The audit didn't answer any questions — re-run it." };
  }

  const data = buildReportData((qrows ?? []) as QueueRow[], run as RunRow, {
    businessName: audit.business_name ?? "",
    businessType: audit.business_type ?? "",
    locationText: audit.location_text ?? "",
    specialisms: audit.specialism ?? "",
    isAggregatorUrl,
    // The WhatsApp hook is pre-payment by definition — plain issues, never a grade.
    seoStyle: seoStyleForAudit(
      (audit as { baseline_target_runs?: unknown }).baseline_target_runs,
      (audit as { is_measurement?: unknown }).is_measurement,
    ),
  });
  // {{2}} competitor names — PREFER the report's HEADLINE rivals (data.gutPunch.rivals: the one
  // curated best question+engine answer the report leads with), so the pitch and the report agree
  // BY CONSTRUCTION. Fall back to the cross-question frequency aggregate (data.competitors) only
  // when there's no gutPunch — and for UK audits, strip obvious US-market names from that FALLBACK
  // (LLC/Inc/Corp suffixes, trailing ", <state>"): an ambiguous town name (Stamford, Peterborough,
  // Boston…) can make one engine answer from the wrong country, and those wrong-country names win
  // the raw frequency count (the exact bug this fixes). gutPunch rivals are already curated —
  // never filtered here.
  const US_MARKERS = /\b(LLC|L\.L\.C\.?|Inc\.?|Corp\.?)\b|,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\.?\s*$/i;
  /* ⛔ THE AUDIT-WIDE LEADERS FIRST, NOT THE ONE ANSWER'S RIVALS. This used to prefer
     gutPunch.rivals so the pitch would name exactly what the report led with — which was right as
     a principle and wrong in fact, because the report led with whoever appeared in ONE curated
     answer. Wilson's report named Get A Splash / Fresh Car / Clean Me while Ultimate Valet
     Cambridge, the most-named firm in his own audit, went unmentioned; he rejected the report and
     was right to. topCompetitors is grouped and frequency-ranked (Chapman’s and Chapman's are one
     firm), so the pitch and the report still agree BY CONSTRUCTION — they now agree on the right
     names. gutPunch rivals remain the fallback for an audit built before topCompetitors existed. */
  const topNames = (data?.topCompetitors ?? [])
    .map((c: { name?: string }) => (c?.name ?? "").trim()).filter(Boolean);
  const gutRivals = (data?.gutPunch?.rivals ?? []).map((c: string) => (c ?? "").trim()).filter(Boolean);
  let pool: string[] = topNames.length ? topNames : gutRivals;
  if (pool.length === 0) {
    pool = data?.competitors ?? [];
    const cc = (audit.country ?? "").trim().toUpperCase();
    if (cc === "UK" || cc === "GB") pool = pool.filter((c: string) => !US_MARKERS.test(c));
  }
  /* ⛔ DECLARED HERE, ABOVE ITS FIRST USE, AND THAT IS NOT A TIDY-UP. It used to sit ~25 lines
     below, beside the trade guard; reading it from the self-exclusion would have been a temporal
     dead zone — a ReferenceError at runtime that `deno check` and the parse gate both pass,
     because a `const` is hoisted but not initialised. This repo has recorded three TDZ bites
     already (CLAUDE.md §26), and this one would have thrown inside the function that resolves
     every outreach pitch. The guard that needs it still runs in its original place. */
  const business = (audit.business_name ?? "").trim();

  /* ⛔ THE SELF-EXCLUSION IS APPLIED ONCE, HERE, SO THE JOINED {{2}} AND THE THREE SEPARATE
     {{3}}-{{5}} CANNOT DISAGREE. audit_reply names competitors in one string and competitor_hook /
     audit_followup name them as three parameters; filtering only the second would leave a business
     listed as its own competitor in exactly one template, which is the two-copies drift this file
     already warns about for the whitespace collapse. */
  const rivalPool = excludeSelfRivals(pool, business, nameMatches);
  const competitors = formatCompetitors(rivalPool);
  /* {{2}} is a REQUIRED Meta var — refuse rather than send an empty/broken template. But SAY WHICH
     REFUSAL IT IS: one message used to cover three different situations, which is why a block felt
     random.
     ⛔ EMPTY IS USUALLY NOT "AI NAMED NOBODY". Since the regex scraper was deleted (2026-08-28),
     `competitors` is written ONLY by the extract-competitors LLM, so an empty list means either the
     cleaner never ran (OpenAI out of credit, or the invoke failed) or it ran and found none. The run
     carries a receipt that tells them apart — results.competitor_cleaning — and this path was not
     reading it.
     ⚠️ ABSENCE OF A RECEIPT IS NOT PROOF THE CLEANER FAILED: every audit finalised before
     2026-08-28 has no stamp. That is why the wording says "haven't been extracted yet" rather than
     asserting a failure — it is honest for both the old-audit and the never-ran cases, and it still
     sends the operator somewhere useful. Only a stamp that says `complete` earns the original
     sentence. Refusal wording only: what actually sends is unchanged. */
  if (!competitors) {
    const stamp = readCleaningStamp((run as { results?: unknown }).results);
    if (stamp?.complete !== true) {
      return { ok: false, reason: "Competitor names haven't been extracted yet — the cleaner hasn't run on this audit." };
    }
    return { ok: false, reason: "The audit named no competitors yet." };
  }

  const trade = (audit.business_type ?? "").trim();
  if (!trade || !business) return { ok: false, reason: "Audit is missing the business name or type." };

  /* THE LEAD'S TRADE, NOT JUST THE AUDIT'S. This guard used to check only audit.business_type, which
     is a different field with a different history: an audit created through the wizard carries the
     trade that was typed into it, while the LEAD row can still have none. Three leads are in exactly
     that state, so this pitch could be sent, followed, and paid for — and then startPaidBaseline
     would refuse with skipped:"no_business_type", leaving a four-week guarantee with no baseline.
     findable-checkout refuses that payment as a last line of defence, but this is the common path
     and it should fail here, before a prospect is ever pointed at a report.
     Mirrors audit-baseline.ts's bizType expression character for character. Nothing is inferred. */
  const { data: leadRow } = await service
    .from("outreach_leads").select("category, search_keyword, website").eq("id", leadId).maybeSingle();
  const leadTrade = ((leadRow?.category as string) || (leadRow?.search_keyword as string) || "").trim();
  if (!leadTrade) {
    return {
      ok: false,
      reason: "That lead has no trade stored, so no baseline could run if they paid — add the trade on the lead and try again.",
    };
  }

  /* ⛔ NEVER THE NAME-CARRYING business_reports SLUG. REMOVED 2026-08-05, DO NOT REINSTATE.
     This used to read business_reports and swap in a name+8-hex slug when one existed. That is the
     bug that started all of this: a NAME slug resolves ONLY if it ends in the 8-hex code, and just
     69 of 123 report rows do — so the "prettier" branch was a coin flip on whether a prospect got a
     dead link.
     ⚠️ THE SHORT CODE BELOW IS A DIFFERENT ANIMAL and safe to prefer: ai_audits.short_code is on
     EVERY audit (backfilled onto all existing rows, assigned by a DB trigger on every insert, unique
     index), so /r/<code> resolves directly with no lookup that can miss — the exact property the id
     has and the name slug lacked. Falls back to the UUID /report/ form only if a code is somehow
     absent. Still a BODY TEXT variable, so no Meta resubmission — see the note at the top of this
     file. */
  const link = (audit.short_code as string | null | undefined)
    ? shortReportUrl(audit.short_code as string)
    : `${REPORT_SITE_ORIGIN}/report/${audit.id}`;

  /* ⛔ A BUSINESS IS NEVER ITS OWN RIVAL — the rule, the measurement and the reasoning live in
     src/lib/rivalHook.ts, which is where the test can reach them. This function needs a supabase
     client, so a rule written inline here would be a rule nothing asserts.
     ⛔ Dropping a self-match can leave fewer than three names; that is correct and already handled
     — rivalHookDecision falls back to video_template rather than padding. */
  /* ── {{6}} FOR audit_followup_fault ────────────────────────────────────────────────────────────
     A lead with NO WEBSITE gets the no-website line (there is nothing of theirs to crawl); a lead
     WITH a website gets its main crawl fault under the same fresh + v2 gate the report applies; a
     lead with a website and no current fault gets null, which keeps the template unsendable (Meta
     rejects an empty {{6}}). siteFaultLine is the ONE rule the picker (useInbox) reads too, so the
     send and the offer agree. Never throws. */
  const hasWebsite = !!String((leadRow as { website?: string | null } | null)?.website ?? "").trim();
  // deno-lint-ignore no-explicit-any
  let cc: any = null;
  if (hasWebsite) {
    try {
      const { data } = await service
        .from("lead_crawl_checks").select("result, created_at")
        .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      cc = data;
    } catch (_e) { cc = null; }
  }
  const runSources = (audit.ai_audit_runs ?? [])
    .filter((r: { status?: string | null }) => r.status === "complete" || r.status === "capped")
    .sort((a: { run_number?: number | null }, b: { run_number?: number | null }) => (b.run_number ?? 0) - (a.run_number ?? 0))
    .map((r: { results?: { crawl_check?: unknown }; created_at?: string | null }) => {
      const crawl = r.results?.crawl_check as { status?: string; version?: number; signals?: CrawlSignals } | undefined;
      return {
        result: crawl,
        createdAtMs: r.created_at ? new Date(r.created_at).getTime() : 0,
        complete: crawl?.status === "complete",
      };
    });
  const siteFault = resolveSiteFault(
    hasWebsite,
    runSources,
    cc ? { result: cc.result ?? null, createdAtMs: new Date(cc.created_at).getTime() } : null,
  );
  return { ok: true, trade, competitors, rivals: usableRivals(rivalPool), business, link, town: (audit.location_text ?? "").trim(), auditId: audit.id, siteFault };
}
