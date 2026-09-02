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
   {{2}}: "Checkatrade\n    \n    If" — a competitor name carrying two newlines and eight spaces.
   `.trim()` alone could never catch it, because the whitespace is INTERNAL.

   ⚠️ COLLAPSE, NOT REJECT. Dropping the name would lose a real competitor ("Checkatrade" IS who AI
   named); collapsing keeps the fact and makes it sendable. A name is a name whether the extractor
   wrapped it across lines or not.
   ⚠️ AND IT IS A GUARD, NOT THE FIX. The extractor should not be emitting multi-line fragments as
   business names in the first place — that is a separate, larger repair upstream. This sits at the
   last point before the value becomes a template parameter, so it holds whatever the extractor
   does. Same collapse is applied in templateBodyParams for every OTHER variable. */
const collapseWhitespace = (s: string): string => (s ?? "").replace(/\s+/g, " ").trim();

/** Top competitor names → a readable list ("Whitings, TC Group and Charlotte Watson"). Caps at 3
 *  so the WhatsApp line stays tight. Empty string when there are none. (Mirrors the auto-flow.) */
export function formatCompetitors(list: string[]): string {
  const top = (list ?? []).map((s) => collapseWhitespace(s)).filter(Boolean).slice(0, 3);
  if (top.length === 0) return "";
  if (top.length === 1) return top[0];
  return `${top.slice(0, -1).join(", ")} and ${top[top.length - 1]}`;
}

export type AuditReplyVars =
  | { ok: true; trade: string; competitors: string; business: string; link: string; auditId: string }
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
    .select("id, business_name, business_type, location_text, specialism, country, created_at, baseline_target_runs, ai_audit_runs(id, run_number, status, mention_rate, results, created_at), is_measurement")
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
  const competitors = formatCompetitors(pool);
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
  const business = (audit.business_name ?? "").trim();
  if (!trade || !business) return { ok: false, reason: "Audit is missing the business name or type." };

  /* THE LEAD'S TRADE, NOT JUST THE AUDIT'S. This guard used to check only audit.business_type, which
     is a different field with a different history: an audit created through the wizard carries the
     trade that was typed into it, while the LEAD row can still have none. Three leads are in exactly
     that state, so this pitch could be sent, followed, and paid for — and then startPaidBaseline
     would refuse with skipped:"no_business_type", leaving an 8-week guarantee with no baseline.
     findable-checkout refuses that payment as a last line of defence, but this is the common path
     and it should fail here, before a prospect is ever pointed at a report.
     Mirrors audit-baseline.ts's bizType expression character for character. Nothing is inferred. */
  const { data: leadRow } = await service
    .from("outreach_leads").select("category, search_keyword").eq("id", leadId).maybeSingle();
  const leadTrade = ((leadRow?.category as string) || (leadRow?.search_keyword as string) || "").trim();
  if (!leadTrade) {
    return {
      ok: false,
      reason: "That lead has no trade stored, so no baseline could run if they paid — add the trade on the lead and try again.",
    };
  }

  /* ⛔ THE AUDIT ID, ALWAYS. NO SLUG PREFERENCE. REMOVED 2026-08-05, DO NOT REINSTATE.
     This used to read business_reports and swap in a name-carrying slug when one existed, keeping the
     id only as a fallback. That preference is the bug that started all of this: a slug resolves ONLY
     if it ends in the 8-hex code, and just 69 of 123 report rows do — published ones among the 54
     that do not. So the "prettier" branch was a coin flip on whether a prospect got a dead link,
     while the id it was overriding resolves directly with no lookup and cannot fail.
     A marginally nicer URL is not worth a link that 404s on a live prospect. The name is in the
     document; it does not need to be in the address bar. */
  const link = `${REPORT_SITE_ORIGIN}/report/${audit.id}`;

  return { ok: true, trade, competitors, business, link, auditId: audit.id };
}
