// tracked-link — wrap a report link we are about to send in a short tracked redirect on our own domain
// (Paul, 2026-11-22; docs/campaign-performance.md).
//
//   https://findable.live/r/k4m2p9         → https://findable.live/l/ab12cd34         (findable-site functions/l/[code].ts)
//   <the LeadFinderOS address, OPERATOR_APP_URL>/r/k4m2p9 → <same>/l/ab12cd34  (V1 functions/l/[code].ts)
// The visitor lands on exactly the page the original link opened; the hit is logged (bots marked) on the way.
//
// ⛔ FAIL-OPEN, NEVER FAIL-SEND. Any problem (no lead, a non-report URL, a DB error) returns the ORIGINAL url, so a send
//    is never held or changed in any other way because tracking could not be set up.
// ⛔ ONLY REPORT LINKS (/r/<code> on our two domains). Sign-up, agreement, payment, onboarding and welcome-pack links are
//    never wrapped: a redirect hop must never stand between a client and paying or setting up.
// ⛔ The target is checked again by the table's own constraint (our two domains only) — never an open redirect.

import { GO_CODE_RE, GO_LINK_DESTINATION } from "../../../src/lib/initialWithLink.ts";
import { LFOS_REPORT_ORIGIN } from "../../../src/lib/reportBrand.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

/**
 * initial_with_link's {{1}} (src/lib/initialWithLink.ts): a fresh tracking code for this lead + template.
 * ⛔ FAIL-CLOSED, unlike the report wrap: without a code the message's link is broken, so the send is refused with a reason.
 * ⛔ Only for a lead in a LeadFinderOS-style campaign (report_style 'leadfinderos').
 */
export async function goCodeFor(service: Service, leadId: string | null | undefined, template: string): Promise<{ ok: true; code: string } | { ok: false; reason: string }> {
  if (!leadId) return { ok: false, reason: "This message needs a lead." };
  try {
    const { data: lead, error: lErr } = await service.from("outreach_leads").select("campaign_id").eq("id", leadId).maybeSingle();
    if (lErr) return { ok: false, reason: "Could not read the lead, so nothing was sent. Try again." };
    const cid = (lead as { campaign_id?: string | null } | null)?.campaign_id ?? null;
    let style = "findable";
    if (cid) {
      const { data: camp, error: cErr } = await service.from("campaigns").select("report_style").eq("id", cid).maybeSingle();
      if (cErr) return { ok: false, reason: "Could not read the lead's campaign, so nothing was sent. Try again." };
      style = String((camp as { report_style?: string | null } | null)?.report_style ?? "findable");
    }
    if (style !== "leadfinderos") return { ok: false, reason: "This message is only for leads in a LeadFinderOS-style campaign (web developers / agencies)." };
    const { data, error } = await service.rpc("create_tracked_link", { p_lead_id: leadId, p_template: template, p_target: GO_LINK_DESTINATION });
    if (error || typeof data !== "string" || !GO_CODE_RE.test(data)) return { ok: false, reason: "Could not make the tracking link, so nothing was sent. Try again." };
    return { ok: true, code: data };
  } catch {
    return { ok: false, reason: "Could not make the tracking link, so nothing was sent. Try again." };
  }
}

const REPORT_LINK_RE = /^https:\/\/(findable\.live|app\.leadfinderos\.com)\/r\/[A-Za-z0-9]{6}$/;   // a 6-character short code only (never /r/example)

export function isTrackableReportLink(url: string): boolean {
  return REPORT_LINK_RE.test(url.trim());
}

export async function trackReportLink(service: Service, opts: { leadId: string | null | undefined; template: string; url: string }): Promise<string> {
  const url = (opts.url ?? "").trim();
  try {
    if (!opts.leadId || !isTrackableReportLink(url)) return opts.url;
    const { data, error } = await service.rpc("create_tracked_link", { p_lead_id: opts.leadId, p_template: opts.template, p_target: url });
    if (error || typeof data !== "string" || !/^[a-z0-9]{8}$/.test(data)) {
      console.warn("[tracked-link] not wrapped:", error?.message ?? "no code");
      return opts.url;
    }
    const origin = url.startsWith(LFOS_REPORT_ORIGIN + "/") ? LFOS_REPORT_ORIGIN : "https://findable.live";
    return `${origin}/l/${data}`;
  } catch (e) {
    console.warn("[tracked-link] not wrapped (error):", e instanceof Error ? e.message : e);
    return opts.url;
  }
}
