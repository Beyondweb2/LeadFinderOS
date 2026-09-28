/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SELF-SOURCED PROSPECTS + PAID-CLIENT HANDOFF (2026-09-28, docs/self-sourced-handoff.md). Pins, from
   the pure rules and the source (the live proof is supabase/tests/self-sourced-handoff.sql, always
   rolled back):
     · READY TO START / MISSING INFORMATION: either the client's onboarding OR what Sales collected
       satisfies an item; missing data names exactly what; unknown values are missing, never "fine";
     · the report share rule: sent / opened; staff opens carry preview=1 and are never counted;
     · one list each: lead sources (DB CHECK == SQL function == labels), shared platform hosts
       (migration == src/lib/aggregators.ts), GBP checklist key (handoff == delivery cockpit);
     · the hook audit: 3 questions × 2 engines × 1 run, one plan for preview and run, sales on own
       leads only, a hand-added lead with no Google place is not town-gated (and only that lead);
     · the crawl: sales only on a lead they work, only its own website, filed under the book;
     · attribution: sold_by is stamped once at payment and read by Paid Clients, the email and the
       Sales Dashboard; nothing money-shaped reaches Sales.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import { handoffReadiness, handoffLine, HANDOFF_GBP_CHECKLIST_KEY, type HandoffLead, type HandoffOnboarding } from "../src/lib/handoffReadiness.ts";
import { reportShareStatus, staffPreviewUrl, type ReportLinkEvent } from "../src/lib/reportShare.ts";
import { LEAD_SOURCE_LABELS } from "../src/lib/salesPerformance.ts";
import { GBP_ACCESS_CHECKLIST_KEY } from "../src/lib/deliveryCockpit.ts";
import { leadPermissions } from "../src/lib/access.ts";
import { activityDetail, ACTIVITY_LABEL } from "../src/lib/salesCrm.ts";
import { HOOK_SCORE_QUESTIONS, HOOK_ENGINES } from "../src/lib/hookScore.ts";
import { SALES_VIEW_COLUMNS } from "../src/lib/outreachLeadColumns.ts";
import { foldSalesPerformance, type FoldInput } from "../src/lib/salesPerformance.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const MIG = read("supabase/migrations/20260928160000_self_sourced_handoff.sql");

/* ── READY / MISSING ─────────────────────────────────────────────────────────────────────────── */
const paidLead: HandoffLead = { business_name: "QA Plumbing", phone: "07700900401", website: "https://qa.example", amount_paid: 99, status: "payment_received" };
const fullOnboarding: HandoffOnboarding = {
  services_list: ["Boiler repair"], areas_list: ["Wakefield"], business_website: "https://qa.example",
  website_route: "optimise_existing", website_manager: "direct_access", gbp_status: "done",
};
{
  const r = handoffReadiness(paidLead, fullOnboarding, { crawl: true, hookAudit: true });
  ok(r.ready && r.label === "READY TO START" && r.missing.length === 0, "complete onboarding + crawl → READY TO START");
  ok(r.items.find((i) => i.key === "services")?.source === "onboarding", "…services read from the client's answers");
}
{
  // Sales-entered equivalents satisfy readiness with NO onboarding row at all.
  const salesLead: HandoffLead = { ...paidLead, services_included: ["Boiler repair"], service_areas: ["Wakefield", "Ossett"], website_control: "client_controls",
    delivery_checklist: { [HANDOFF_GBP_CHECKLIST_KEY]: true } };
  const r = handoffReadiness(salesLead, null, { crawl: true, hookAudit: true });
  /* 2026-09-28 (the domain rule): with no onboarding the client has not confirmed the domain / authority
     themselves, so the ONLY thing missing is that — everything Sales collected still counts. */
  ok(!r.ready && r.missing.join() === "Domain / authority", "Sales-entered services, areas, website control + Findable's GBP tick satisfy everything except the client's own domain confirmation");
  ok(["services", "service_areas", "website_access"].every((k) => r.items.find((i) => i.key === k)?.source === "sales"), "…and each item says it came from Sales");
}
{
  // Onboarding outranks Sales when both exist (no merge).
  const r = handoffReadiness({ ...paidLead, services_included: ["Roofing"] }, fullOnboarding, { crawl: true, hookAudit: false });
  ok(r.items.find((i) => i.key === "services")?.detail === "Boiler repair", "onboarding outranks Sales for services (lists never merged)");
  ok(r.ready, "a missing hook audit never blocks READY (informational)");
}
{
  const r = handoffReadiness(paidLead, null, { crawl: false, hookAudit: false });
  ok(!r.ready && r.label === "MISSING INFORMATION", "nothing collected → MISSING INFORMATION");
  for (const m of ["Main services", "Service areas", "Website access / control", "Google Business Profile access", "Website crawl"]) ok(r.missing.includes(m), `…names "${m}"`);
  ok(!r.missing.includes("Hook Audit"), "…never lists the hook audit as missing");
  ok(handoffLine(r).startsWith("MISSING INFORMATION: "), "the email line names what is missing");
}
{
  // Positive matches only: unknown / later / no access are missing.
  const r1 = handoffReadiness({ ...paidLead, website_control: "unknown" }, { ...fullOnboarding, website_route: null, website_manager: null }, { crawl: true, hookAudit: true });
  ok(r1.missing.includes("Website access / control"), "website control 'unknown' is missing, not an answer");
  for (const g of ["will_do", "no_access", null]) {
    const r = handoffReadiness(paidLead, { ...fullOnboarding, gbp_status: g }, { crawl: true, hookAudit: true });
    ok(r.missing.includes("Google Business Profile access"), `GBP '${g}' is missing`);
  }
  const noSite = handoffReadiness({ ...paidLead, website: null }, { ...fullOnboarding, business_website: null, website_route: "new_site", domain_status: "new", dns_permission: true, materials_confirmed: true }, { crawl: false, hookAudit: false });
  ok(noSite.ready, "a new-site client needs no crawl and no website access");
  const unpaid = handoffReadiness({ ...paidLead, amount_paid: null }, fullOnboarding, { crawl: true, hookAudit: true });
  ok(!unpaid.ready && unpaid.missing[0] === "Payment confirmed", "no recorded amount → not ready (paid means amount_paid > 0)");
  const refunded = handoffReadiness({ ...paidLead, status: "refunded" }, fullOnboarding, { crawl: true, hookAudit: true });
  ok(!refunded.ready, "a refunded client is not ready");
  const blank = handoffReadiness(null, null, { crawl: false, hookAudit: false });
  ok(!blank.ready && blank.missing.includes("Business name"), "an absent lead is never ready");
}
ok(HANDOFF_GBP_CHECKLIST_KEY === GBP_ACCESS_CHECKLIST_KEY, "the handoff's GBP tick is the delivery cockpit's key (one key)");

/* ── REPORT SHARE ────────────────────────────────────────────────────────────────────────────── */
{
  const A = "a1";
  const ev = (kind: "generated" | "sent", channel: string, at: string): ReportLinkEvent => ({ audit_id: A, kind, channel, actor_user_id: null, template_name: null, created_at: at });
  const none = reportShareStatus([], A, null);
  ok(!none.sent && !none.opened && !none.generated, "no events, no open → not sent, not opened");
  const copied = reportShareStatus([ev("generated", "copy", "2026-09-28T10:00:00Z")], A, null);
  ok(copied.generated && !copied.sent, "a copy is GENERATED, never sent");
  const sent = reportShareStatus([ev("sent", "linkedin", "2026-09-28T10:00:00Z"), ev("sent", "whatsapp", "2026-09-28T11:00:00Z")], A,
    { first_opened_at: "2026-09-28T12:00:00Z", open_count: 3 });
  ok(sent.sent && sent.firstSentAt === "2026-09-28T10:00:00Z" && sent.sentChannels.join() === "linkedin,whatsapp", "sent: first time + every channel");
  ok(sent.opened && sent.openCount === 3 && !sent.openedBeforeSend, "opened after the send, with the view count");
  const early = reportShareStatus([ev("sent", "email", "2026-09-28T12:00:00Z")], A, { first_opened_at: "2026-09-28T09:00:00Z", open_count: 1 });
  ok(early.openedBeforeSend, "an open before any recorded send is flagged as such");
  ok(!reportShareStatus([{ ...ev("sent", "email", "2026-09-28T12:00:00Z"), audit_id: "other" }], A, null).sent, "another audit's send never counts");
  ok(staffPreviewUrl("https://findable.live/r/abc234") === "https://findable.live/r/abc234?preview=1", "staff open adds ?preview=1");
  ok(staffPreviewUrl("https://x/r?slug=a") === "https://x/r?slug=a&preview=1" && staffPreviewUrl("https://x/r?preview=1") === "https://x/r?preview=1", "…once, with & when a query exists");
}
{
  const render = read("supabase/functions/render-audit-report/index.ts");
  ok(/if \(url\.searchParams\.get\("preview"\) !== "1"\) \{\s*await recordAuditOpen/.test(render), "render-audit-report skips the open count for preview=1");
  const view = read("src/components/HookVisibilityView.tsx");
  ok(/href=\{staffPreviewUrl\(report\.link\.url\)\}/.test(view) && /href=\{staffPreviewUrl\(link\.url\)\}/.test(view), "every in-app Open report / Previous report link is a staff preview");
  ok(/navigator\.clipboard\?\.writeText\(link\.url\)/.test(view), "Copy link copies the CLEAN public URL (no preview flag) for the prospect");
  ok(/preview=1/.test(read("src/components/ClientHandoffCard.tsx")), "the paid-client handoff's report link is a staff preview too");
  const SITE = process.env.FINDABLE_SITE_DIR || path.resolve(root, "..", "findable-site");
  for (const p of ["functions/r/[code].ts", "functions/report/[id].ts"]) {
    let src: string | null = null;
    try { src = fs.readFileSync(path.join(SITE, p), "utf8"); } catch { /* sibling absent */ }
    if (src === null || !/preview/.test(src)) console.log(`NOTE ${SITE}/${p} does not pass preview=1 through (sibling older than this change) — skipped`);
    else ok(/searchParams\.get\("preview"\) === "1" \? "&preview=1" : ""/.test(src), `findable-site ${p} forwards ONLY preview=1`);
  }
}
ok(/create trigger trg_report_link_sent after insert or update of status on public\.whatsapp_messages/.test(MIG)
  && /exception when others then\s*--[^\n]*\n\s*null;/.test(MIG), "report sends are recorded by a trigger that can never block a message");
ok(/_channel not in \('email', 'linkedin', 'sms', 'in_person', 'other'\)/.test(MIG), "a hand-logged WhatsApp report send is refused (the trigger records those)");

/* ── ONE LIST EACH ───────────────────────────────────────────────────────────────────────────── */
{
  const checkList = (MIG.match(/outreach_leads_lead_source_check check \(\s*lead_source is null or lead_source in \(([^)]*)\)/) ?? [])[1] ?? "";
  const fnList = (MIG.match(/v_src not in \(([^)]*)\)/) ?? [])[1] ?? "";
  const parse = (s: string) => [...s.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort().join(",");
  const labels = Object.keys(LEAD_SOURCE_LABELS).sort().join(",");
  ok(parse(checkList) !== "" && parse(checkList) === parse(fnList) && parse(fnList) === labels, "lead sources: table CHECK == sales_add_lead == the picker's labels");
  for (const s of ["facebook", "linkedin", "google_maps", "referral", "networking", "email_research", "ai_research", "existing_relationship", "other"]) ok(s in LEAD_SOURCE_LABELS, `source offered: ${s}`);
}
{
  const agg = read("src/lib/aggregators.ts");
  const sets = ["BOOKING_PLATFORM_DOMAINS", "SOCIAL_AND_DIRECTORY_DOMAINS", "DIRECTORY_AND_RECORD_DOMAINS"].flatMap((name) => {
    const body = (agg.match(new RegExp(`const ${name} = new Set<string>\\(\\[([\\s\\S]*?)\\]\\)`)) ?? [])[1] ?? "";
    return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  });
  const sqlArr = (MIG.match(/unnest\(array\[([\s\S]*?)\]\) d where h = d/) ?? [])[1] ?? "";
  const sql = new Set([...sqlArr.matchAll(/'([^']+)'/g)].map((m) => m[1]));
  const missing = sets.filter((d) => !sql.has(d));
  ok(sets.length > 50 && missing.length === 0, `every aggregator/social/directory host is a non-identity in SQL${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
}

/* ── ADD LEAD / PROFILE ──────────────────────────────────────────────────────────────────────── */
{
  ok(/error', 'site_match'/.test(MIG) && /confirm_site_match/.test(MIG), "a website match WARNS (site_match) and can be confirmed as a different branch");
  ok(/lead_identity_lookup\(jsonb_build_array\(jsonb_build_object\(\s*'k', '1', 'place_id', v_pid, 'phone', _lead->>'phone', 'maps_url', v_mu\)\)\)/.test(MIG), "place id / phone / Maps link stay HARD refusals through the shared lookup");
  ok(/create or replace function public\.lead_set_profile[\s\S]*?perform public\._require_work\(_lead_id\);/.test(MIG), "lead_set_profile checks role + ownership first");
  ok(!/phone\s*=/.test((MIG.match(/update public\.outreach_leads set\s*services_included[\s\S]*?where id = _lead_id;/) ?? [""])[0]), "…and never writes the phone (an identity key)");
  ok(/revoke all on function public\.lead_set_profile\(uuid, text\[\], text\[\], text, text\) from public, anon;/.test(MIG), "anon cannot call lead_set_profile");
  const tail = SALES_VIEW_COLUMNS.slice(-5, -2).join(","); // then domain_control (20260928180000), town_fetch_note (20260929000000)
  ok(tail === "lead_source,services_included,service_areas", "the sales view gains services + areas at its END (and the SPA's column list matches)");
  const viewSql = (MIG.match(/create or replace view public\.sales_leads[\s\S]*?from public\.outreach_leads l/) ?? [""])[0];
  ok(!/sold_by|stripe|amount_paid,|refund|delivery_(checklist|ref|notes)/.test(viewSql.replace("null::numeric as amount_paid", "")), "the sales view carries no sale stamp, money or delivery column");
  const dialog = read("src/components/AddLeadDialog.tsx");
  ok(/services: labels\(f\.services\), service_areas: labels\(f\.areas\)/.test(dialog) && /r\.error === 'site_match'/.test(dialog), "Add a lead sends services/areas and handles the website warning");
  const crm = read("src/components/LeadCrmPanel.tsx");
  ok(/save\('lead_set_profile'/.test(crm), "the workspace profile saves through lead_set_profile (both roles)");
}

/* ── HOOK AUDIT: 3 × 2 × 1, one plan, own lead ───────────────────────────────────────────────── */
{
  ok(HOOK_SCORE_QUESTIONS === 3 && HOOK_ENGINES.length === 2, "the hook is 3 questions × 2 engines");
  const fn = read("supabase/functions/create-ai-audit/index.ts");
  ok((fn.match(/finalHookPlan\(/g) ?? []).length === 3, "ONE hook plan function, used by the preview AND the run");
  ok(/if \(hookAuditRequested && !isBaseline && !isMeasurement && !isDiscovery\) \{\s*qs = finalHookPlan/.test(fn), "the hook preview is planned exactly as the run");
  ok(/const handTypedTown = !!lead && !lead\.place_id && typeof lead\.lead_source === "string" && lead\.lead_source !== ""\s*&& locationSource === "search" && hasUsableTown\(locationText\);/.test(fn),
    "the town-gate exemption is a positive match: hand-added (lead_source), NO place id, the typed town in use");
  ok(/!townConfirmed && !handTypedTown && townGated\(lead\)/.test(fn), "…every other lead is gated as before");
  ok(/kind: "audit_run"/.test(fn), "a person's hook audit is written to the lead's history");
  ok(/salesAuditRefusal\(\{ purpose: body\.purpose, hookAudit: body\.hook_audit === true, leadId, reuseAuditId \}\)/.test(fn) && /canWorkLead\(actor, workLead\)/.test(fn), "sales: hook only, on a lead they work (unchanged gate)");
  const panel = read("src/components/LeadCrmPanel.tsx");
  ok(/invokeEdge<[^>]*>\('create-ai-audit', \{ \.\.\.body, preview: true \}\)/.test(panel) && /\{ \.\.\.body, questions: reviewed\.questions \}/.test(panel), "the workspace proposes, the operator reviews/edits (exactly three, reviewedHookQuestions), the reviewed three run verbatim");
  ok(/question_count: OUTREACH_HOOK_QUESTIONS/.test(panel) && /hook_audit: true/.test(panel), "…as a 3-question hook audit");
  ok(!/<Textarea[^>]*proposed/.test(panel), "reviewed questions are not free-text editable (no invented service)");
}

/* ── CRAWL ───────────────────────────────────────────────────────────────────────────────────── */
{
  const fn = read("supabase/functions/crawl-check/index.ts");
  ok(/if \(!wl \|\| isClientLead\(wl\) \|\| !canWorkLead\(\{ id: userId!, role \}, wl\)\) return json\(\{ ok: false, error: "not_your_lead" \}, 403\);/.test(fn), "sales may crawl only a lead they work, never a client");
  ok(/if \(body\?\.url \|\| body\?\.audit_id\) return json\(\{ ok: false, error: "lead_website_only"/.test(fn), "…only its own website (no url / audit_id override)");
  ok(/if \(!targetLead\) return json\(\{ ok: false, error: "lead_required"/.test(fn), "…and never the paste-a-URL check");
  ok(/const rowOwnerId: string \| null = salesLead \? salesLead\.user_id : userId;/.test(fn) && /user_id: rowOwnerId/.test(fn) && /userId: rowOwnerId/.test(fn), "the crawl row is filed under the book, never the rep");
  ok(leadPermissions("sales").crawlOwnLead && leadPermissions("admin").crawlOwnLead && !leadPermissions("sales").crawlSite, "workspace crawl for both roles; paste-a-URL / row buttons stay admin");
  const btn = read("src/components/CrawlCheckButton.tsx");
  ok(/These may make it harder for search engines or AI systems to crawl, understand or verify the business\./.test(btn), "findings carry the careful wording");
  ok(!/this is why AI|why AI didn|didn't recommend you/i.test(btn.replace(/\/\*[\s\S]*?\*\//g, "")), "…never a causal claim");
}

/* ── ATTRIBUTION ─────────────────────────────────────────────────────────────────────────────── */
{
  ok(/if tg_op = 'UPDATE' and old\.sold_by_user_id is not null then\s*new\.sold_by_user_id := old\.sold_by_user_id;/.test(MIG), "sold_by is immutable once stamped");
  ok(/new\.sold_by_user_id := coalesce\(new\.assigned_to_user_id, new\.user_id\);/.test(MIG), "…stamped from whoever holds the lead at payment");
  const perf = read("supabase/functions/sales-performance/index.ts");
  ok(/assigned_to_user_id\.eq\.\$\{personId\},sold_by_user_id\.eq\.\$\{personId\}/.test(perf), "Sales Dashboard scope includes clients the person SOLD after reassignment");
  const base: Omit<FoldInput, "leads"> = { personId: "rep", sinceMs: null, messages: [], activity: [], linkEvents: [], hits: [], campaignNames: new Map() };
  const lead = (id: string, sold: string | null) => ({ id, business_name: id, campaign_id: null, status: "payment_received", amount_paid: 99, is_potential_work: null, lead_source: null, sold_by_user_id: sold });
  const r = foldSalesPerformance({ ...base, leads: [lead("mine", "rep"), lead("theirs", "other"), lead("legacy", null)] });
  ok(r.won.map((w) => w.name).sort().join() === "legacy,mine", "a win counts for the seller, never for a later holder (legacy rows fall back)");
  ok(!JSON.stringify(r.won).match(/amount|99/), "…and carries no amount");
  const hook = read("supabase/functions/stripe-webhook/index.ts");
  ok(/const handoff = await paymentHandoff\(service, findableLeadId \|\| null, onboardingId \|\| null\);/.test(hook) && /line\("Sold by:"/.test(hook), "the PAID email names the seller and the handoff line");
  ok(/async function paymentHandoff[\s\S]*?catch \(e\) \{[\s\S]*?return none;/.test(hook), "…and a failed handoff read never blocks the email");
  const hub = read("supabase/functions/paid-client-hub/index.ts");
  ok(/requireAdmin\(req/.test(hub) && /handoffReadiness\(/.test(hub), "Paid Clients (admin only) derives the same readiness");
  ok(/if \(body\.handoff === false\)/.test(hub), "the hub's baseline poller does not re-read the handoff every tick");
}

/* ── ACTIVITY WORDS: one rule for History and the handoff ────────────────────────────────────── */
{
  ok(ACTIVITY_LABEL.crawl_run && ACTIVITY_LABEL.report_link && ACTIVITY_LABEL.audit_run, "labels for crawl / report share / audit run");
  ok(activityDetail({ kind: "details_set", data: { services: ["A", "B"], service_areas: [] } }, () => "x") === "services: A, B · service areas: cleared", "profile edits read in words");
  ok(activityDetail({ kind: "report_link", data: { channel: "linkedin" } }, () => "x") === "By LinkedIn", "a report share names its channel");
  ok(/activityDetail\(a, actorName\)/.test(read("src/components/LeadCrmPanel.tsx")) && /activityDetail\(a,/.test(read("src/components/ClientHandoffCard.tsx")), "History and the handoff describe activity with the same function");
}

if (f) { console.log(`\n${f} FAILURES`); process.exit(1); }
console.log("\nALL PASS");
