// Per-lead resolution of the audit_reply template's variables — the SINGLE source used by any
// sender (send-whatsapp-message's audit_reply branch today). Resolves STRICTLY from the target
// lead's own latest completed audit: {{1}} trade, {{2}} competitors, {{3}} business, {{4}} report.
// The report link is /a/<auditId> — served live by render-audit-report from the audit (no stored
// business_reports row needed). Competitors come from the SHARED buildReportData output — the
// report's HEADLINE rivals (gutPunch) first, so the pitch names exactly what the report leads
// with; frequency-aggregate fallback (US-marker-filtered for UK audits) when there's no gutPunch.
import { buildReportData, type QueueRow, type RunRow } from "../../../src/lib/auditReport.ts";
import { isAggregatorUrl } from "./aggregators.ts";

// Public report origin (matches the /a/<slug|auditId> route fronted by functions/a/[slug].ts).
const REPORT_SITE_ORIGIN = "https://yoursites.uk";

/** Top competitor names → a readable list ("Whitings, TC Group and Charlotte Watson"). Caps at 3
 *  so the WhatsApp line stays tight. Empty string when there are none. (Mirrors the auto-flow.) */
export function formatCompetitors(list: string[]): string {
  const top = (list ?? []).map((s) => (s ?? "").trim()).filter(Boolean).slice(0, 3);
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
    .select("id, business_name, business_type, location_text, specialism, country, created_at, ai_audit_runs(id, run_number, status, mention_rate, results, created_at)")
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
  const data = buildReportData((qrows ?? []) as QueueRow[], run as RunRow, {
    businessName: audit.business_name ?? "",
    businessType: audit.business_type ?? "",
    locationText: audit.location_text ?? "",
    specialisms: audit.specialism ?? "",
    isAggregatorUrl,
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
  const gutRivals = (data?.gutPunch?.rivals ?? []).map((c: string) => (c ?? "").trim()).filter(Boolean);
  let pool: string[] = gutRivals;
  if (pool.length === 0) {
    pool = data?.competitors ?? [];
    const cc = (audit.country ?? "").trim().toUpperCase();
    if (cc === "UK" || cc === "GB") pool = pool.filter((c: string) => !US_MARKERS.test(c));
  }
  const competitors = formatCompetitors(pool);
  // {{2}} is a REQUIRED Meta var — refuse rather than send an empty/broken template.
  if (!competitors) return { ok: false, reason: "The audit named no competitors yet." };

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

  return { ok: true, trade, competitors, business, link: `${REPORT_SITE_ORIGIN}/a/${audit.id}`, auditId: audit.id };
}
