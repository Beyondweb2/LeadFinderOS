/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CLIENT MISSING-INFO ACTIONS (2026-10-05, docs/pre-sales-certification/client-missing-info-actions.md)

   Ask salesperson / Contact client on a Paid Client. Pins:
     the missing-info summary (from the checklist, derived) · who the seller is (sold_by_user_id only) ·
     Ask only for another, active salesperson's sale, never Paul's own · ONE open request, a second press
     is "already requested", a reminder only after the gap, two presses at once still one request ·
     only the addressed seller answers it, another salesperson cannot · the seller's answer lands on the
     fields the checklist reads, so setup updates by itself · Contact client opens THAT lead's Inbox thread
     with the need list as an INTERNAL note · nothing in this feature sends a message · the no-
     conversation fallbacks · the closed-client protections · the History / notification kinds.
   The request writer runs against an in-memory stand-in for the database that enforces the same
   one-open-request rule as the unique index (the live index + RLS are proven by the rolled-back SQL
   QA recorded in the doc).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { handoffReadiness, type HandoffEvidence, type HandoffLead, type HandoffOnboarding } from "../src/lib/handoffReadiness.ts";
import { salesHandoffApplies } from "../src/lib/salesHandoff.ts";
import {
  CLIENT_INFO_REMIND_AFTER_HOURS, CLIENT_NEED_WORDS, SELLER_WEBSITE_CONTROL_VALUES, cleanInfoKeys, cleanSellerClientInfo, cleanSellerWebsite,
  clientContactRoutes, clientInfoRequestMessage, gatherKnown, patchForCandidate, clientInfoRequestView, clientItems, missingInformation, needParamValue, parseNeedParam,
  planClientInfoRequest, sellerAskState, sellerItems, sellerRequestBody, sellerRequestTitle, type ClientInfoRequestRow,
} from "../src/lib/clientMissingInfo.ts";
import { WEBSITE_CONTROL_OPTIONS, ACTIVITY_LABEL } from "../src/lib/salesCrm.ts";
import { GBP_MANAGER_EMAIL } from "../src/lib/findableOffer.ts";
import { answerClientInfoRequest, requestClientInfo } from "../supabase/functions/_shared/client-info-request.ts";
import { ClientInfoNeededHelper } from "../src/components/ClientInfoNeededHelper.tsx";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const HUB = read("supabase/functions/paid-client-hub/index.ts");
const QC = read("supabase/functions/quick-close/index.ts");
const REQ = read("supabase/functions/_shared/client-info-request.ts");
const SETUP = read("supabase/functions/_shared/client-setup.ts");
const MIG = read("supabase/migrations/20261009090000_client_info_requests.sql");
const PANEL = read("src/components/ClientMissingInfoPanel.tsx");
const HELPER = read("src/components/ClientInfoNeededHelper.tsx");
const CARD = read("src/components/ClientSetupCard.tsx");
const INBOX = read("src/pages/Inbox.tsx");
const MINE = read("src/components/salesDash/MyHandoffs.tsx");
const FORM = read("src/components/SellerClientInfoForm.tsx");
const QCD = read("src/components/QuickCloseDialog.tsx");

/* ── fixtures: an OPTIMISE client (their own site) with most of the client's answers still to come ── */
const lead: HandoffLead = { business_name: "ZZ QA Portsmouth Plumbing", phone: "07700900501", amount_paid: 99, status: "payment_received", contract_total_payments: 6 };
const ev = (o: Partial<HandoffEvidence["salesHandoff"]> = {}): HandoffEvidence => ({
  crawl: false, crawlAgeDays: null, hookAudit: true, salesHandoff: { applies: "required", complete: false, missing: 6, ...o },
});
const thin = handoffReadiness(lead, null, ev());

console.log("── WHAT IS MISSING ──");
{
  const items = missingInformation(thin);
  const keys = items.map((i) => i.key);
  ok(JSON.stringify(keys) === JSON.stringify(["sales_handoff", "services", "service_areas", "website", "website_access", "gbp_access", "domain", "onboarding"]),
    `1. the missing information, in checklist order (${keys.join(", ")})`);
  ok(!keys.includes("paid") && !keys.includes("crawl") && !keys.includes("hook_audit"), "1. Findable's own work (payment, crawl, Hook Audit) is never 'missing information'");
  ok(JSON.stringify(sellerItems(items).map((i) => i.key)) === JSON.stringify(["sales_handoff", "services", "service_areas", "website", "website_access"]), "1. the seller can answer the handoff + the four lead facts only");
  ok(!clientItems(items).some((i) => i.key === "sales_handoff") && clientItems(items).some((i) => i.key === "domain") && clientItems(items).some((i) => i.key === "gbp_access"), "1. the client answers domain / GBP / their form, never the seller's handoff");
  const ob: HandoffOnboarding = { gbp_status: "done", services_list: ["Boilers"], areas_list: ["Portsmouth"], confirmed_location: "Portsmouth", business_website: "https://qa.example", website_manager: "direct_access", plan_tier: "keep" };
  const gbpPending = missingInformation(handoffReadiness(lead, ob, ev({ complete: true, missing: 0 })));
  ok(!gbpPending.some((i) => i.key === "gbp_access"), "1. GBP the client says is done (Findable to confirm) is Paul's check, not missing information");
  const none = missingInformation(handoffReadiness(lead, { ...ob, gbp_status: undefined, gbp_exists: "no" }, { ...ev({ complete: true, missing: 0 }), crawl: true, crawlAgeDays: 1 }));
  ok(none.length === 0, "1. nothing missing → the panel has nothing to show (renders nothing)");
  ok(/if \(!mi\.items\.length\) return null;/.test(PANEL), "1. …and the panel renders nothing then");
}

console.log("\n── WHO SOLD IT, AND WHEN ASK SALESPERSON SHOWS ──");
{
  const items = missingInformation(thin);
  const base = { applies: "required" as const, soldByUserId: "rep-1", sellerActive: true, closed: false, items };
  ok(sellerAskState(base) === "ask", "2/3. another, active salesperson's sale with seller-answerable gaps → Ask salesperson");
  ok(sellerAskState({ ...base, applies: "not_needed_own_sale" }) === "own_sale", "4. Paul's own sale → no Ask (own_sale)");
  ok(salesHandoffApplies({ sellerId: "paul", sellerIsBookOwner: true, paidOn: "2026-10-05" }) === "not_needed_own_sale", "4. …the book owner as seller IS Paul's own sale");
  ok(sellerAskState({ ...base, soldByUserId: null }) === "no_seller", "2. no sold_by_user_id → nobody to ask (the current owner is never read as the seller)");
  ok(sellerAskState({ ...base, applies: "not_recorded_before" }) === "not_recorded_before", "2. a client paid before handoffs existed is never asked (its seller is a backfill)");
  ok(sellerAskState({ ...base, sellerActive: null }) === "seller_inactive" && sellerAskState({ ...base, sellerActive: false }) === "seller_inactive", "3. a seller who left — or whose status cannot be read — is never asked");
  ok(sellerAskState({ ...base, closed: true }) === "closed", "13. an ended / refunded client is never asked about");
  ok(sellerAskState({ ...base, items: items.filter((i) => !i.seller) }) === "nothing_to_ask", "3. nothing the seller could answer → no Ask");
  ok(sellerAskState({ ...base, applies: undefined }) === "no_seller", "3. an absent handoff rule is never 'ask' (positive match only)");
  ok(/const soldBy = typeof L\.sold_by_user_id === "string"/.test(HUB) && !/soldBy = [^;]*assigned_to_user_id/.test(HUB.slice(HUB.indexOf("async function missingInfoFor"), HUB.indexOf("async function missingInfoFor") + 2500)),
    "2. paid-client-hub derives the seller from sold_by_user_id ONLY (never the assigned owner)");
  ok(/if \(mi\.ask\.state !== "ask"\) return json\(\{ ok: false, error: "cannot_ask"/.test(HUB), "3. the SERVER refuses a request unless the same rule says ask (the screen never decides)");
  ok(/const canAsk = askState === 'ask'/.test(PANEL) && /canAsk && !pending && \(/.test(PANEL), "3/4. the button exists only when the rule says ask");
  ok(/Not needed — your own sale/.test(CARD), "4. 'Not needed — your own sale' stays on the Sales handoff");
  ok(/sh\.applies === 'required' && \(/.test(CARD) && /Salesperson: /.test(CARD) && /last update/.test(CARD), "Sales handoff shows the salesperson, last update and request status for someone else's sale");
}

console.log("\n── ONE REQUEST, IDEMPOTENT ──");
{
  const t0 = Date.parse("2026-10-05T10:00:00Z");
  const open: ClientInfoRequestRow = { id: "r1", seller_user_id: "rep-1", requested_at: new Date(t0).toISOString(), items: ["services"], reminded_at: null, answered_at: null, closed_at: null };
  ok(planClientInfoRequest(null, false, t0).do === "create", "5. no open request → create");
  ok(planClientInfoRequest(open, false, t0 + 1000).do === "already_pending", "6. a second press → already requested (no new request)");
  ok(planClientInfoRequest(open, true, t0 + 3_600_000).do === "too_soon", "6. remind inside the gap → too soon");
  ok(planClientInfoRequest(open, true, t0 + CLIENT_INFO_REMIND_AFTER_HOURS * 3_600_000).do === "remind", `6. remind after ${CLIENT_INFO_REMIND_AFTER_HOURS}h → remind`);
  ok(planClientInfoRequest({ ...open, closed_at: "x" }, false, t0).do === "create", "an answered request does not block a new one later");
  const v = clientInfoRequestView(open, t0 + 1000);
  ok(v.state === "pending" && !v.canRemind, "6. Paul sees 'Requested from…' with Remind disabled until the gap passes");
  ok(clientInfoRequestView({ ...open, closed_at: "2026-10-06T09:00:00Z", closed_reason: "answered", answered_at: "2026-10-06T09:00:00Z" }).state === "answered", "the answered request reads as answered");
  ok(clientInfoRequestView({ ...open, closed_at: "x", closed_reason: "cancelled" }).state === "none", "a cancelled one reads as none");
  ok(/create unique index if not exists client_info_requests_one_open on public\.client_info_requests \(lead_id\) where closed_at is null/.test(MIG), "6. the DATABASE enforces one open request per client (partial unique index)");
  ok(/"23505"/.test(REQ), "6. a losing insert reads the winner back instead of failing");
}

/* ── An in-memory stand-in for the four tables the writer touches, with the same one-open rule ── */
type Row = Record<string, unknown>;
function fakeDb() {
  const t: Record<string, Row[]> = { client_info_requests: [], lead_activity: [], notifications: [] };
  let seq = 0;
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let op: "select" | "insert" | "update" = "select"; let payload: Row = {}; let single = false; let orderKey: string | null = null; let desc = false; let lim: number | null = null;
    const exec = async () => {
      await Promise.resolve();
      if (op === "insert") {
        const row: Row = { id: `row-${++seq}`, closed_at: null, reminded_at: null, remind_count: 0, answered_at: null, created_at: new Date().toISOString(), ...payload };
        if (table === "client_info_requests" && t[table].some((r) => r.lead_id === row.lead_id && r.closed_at === null)) return { data: null, error: { code: "23505", message: "duplicate key" } };
        t[table].push(row);
        return { data: single ? { ...row } : [{ ...row }], error: null };
      }
      let rs = t[table].filter((r) => filters.every((fn) => fn(r)));
      if (op === "update") { rs.forEach((r) => Object.assign(r, payload)); return { data: rs.map((r) => ({ ...r })), error: null }; }
      if (orderKey) rs = [...rs].sort((a, b) => String(a[orderKey!]).localeCompare(String(b[orderKey!])) * (desc ? -1 : 1));
      if (lim !== null) rs = rs.slice(0, lim);
      return single ? { data: rs[0] ? { ...rs[0] } : null, error: null } : { data: rs.map((r) => ({ ...r })), error: null };
    };
    const api: Record<string, unknown> = {
      select: () => api, insert: (p: Row) => { op = "insert"; payload = p; return api; }, update: (p: Row) => { op = "update"; payload = p; return api; },
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return api; }, is: (k: string, v: unknown) => { filters.push((r) => (r[k] ?? null) === v); return api; },
      order: (k: string, o?: { ascending?: boolean }) => { orderKey = k; desc = o?.ascending === false; return api; }, limit: (n: number) => { lim = n; return api; },
      maybeSingle: () => { single = true; return exec(); },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => exec().then(res, rej),
    };
    return api;
  };
  const rpc = async (fn: string, a: Record<string, unknown>) => {
    if (fn === "notify_person" && !t.notifications.some((n) => n.user_id === a._user && n.dedupe_key === a._dedupe)) {
      t.notifications.push({ user_id: a._user, kind: a._kind, title: a._title, body: a._body, link: a._link, dedupe_key: a._dedupe });
    }
    return { error: null };
  };
  return { t, from, rpc };
}

console.log("\n── THE REQUEST WRITER (in-memory database) ──");
{
  const db = fakeDb();
  const base = { leadId: "lead-1", businessName: "ZZ QA Portsmouth Plumbing", sellerId: "rep-1", actorId: "paul", actorName: "Paul", keys: ["services", "service_areas", "website"] };
  const t0 = Date.parse("2026-10-05T10:00:00Z");
  const a = await requestClientInfo(db, { ...base, remind: false, nowMs: t0 });
  ok(a.ok && a.outcome === "created" && db.t.client_info_requests.length === 1, "5. Ask salesperson creates ONE request");
  ok(db.t.notifications.length === 1 && db.t.notifications[0].user_id === "rep-1" && db.t.notifications[0].kind === "client_info_request", "5. …and ONE notification, to the seller only");
  ok(String(db.t.notifications[0].title).startsWith("CLIENT INFO NEEDED") && db.t.notifications[0].link === "/sales-dashboard?handoff=lead-1", "7. the seller's notice says CLIENT INFO NEEDED and opens that client's handoff");
  ok(/is missing: Services · Service areas · Current website\. Please add anything you collected during the sale\./.test(String(db.t.notifications[0].body)), "5. the notice names the client, what is missing, and the ask");
  ok(db.t.lead_activity.some((e) => e.kind === "client_info_requested" && e.actor_user_id === "paul"), "History: Paul requested missing info from the salesperson");
  const b = await requestClientInfo(db, { ...base, remind: false, nowMs: t0 + 60_000 });
  ok(b.ok && b.outcome === "already_pending" && db.t.client_info_requests.length === 1 && db.t.notifications.length === 1, "6. pressing Ask again → 'already requested', no second request, no second notice");
  const c = await requestClientInfo(db, { ...base, remind: true, nowMs: t0 + 3_600_000 });
  ok(c.ok && c.outcome === "too_soon" && db.t.notifications.length === 1, "6. Remind inside the gap sends nothing");
  const d = await requestClientInfo(db, { ...base, remind: true, nowMs: t0 + CLIENT_INFO_REMIND_AFTER_HOURS * 3_600_000 + 1 });
  ok(d.ok && d.outcome === "reminded" && db.t.notifications.length === 2 && db.t.client_info_requests.length === 1, "6. Remind after the gap → one reminder notice, still ONE request");
  const e = await requestClientInfo(db, { ...base, remind: true, nowMs: t0 + CLIENT_INFO_REMIND_AFTER_HOURS * 3_600_000 + 2 });
  ok(e.ok && e.outcome === "too_soon" && db.t.notifications.length === 2, "6. a second Remind straight after → nothing more");

  const db2 = fakeDb();
  const both = await Promise.all([requestClientInfo(db2, { ...base, remind: false, nowMs: t0 }), requestClientInfo(db2, { ...base, remind: false, nowMs: t0 })]);
  ok(db2.t.client_info_requests.length === 1 && db2.t.notifications.length === 1 && both.every((x) => x.ok), "6. two presses at the same moment → one request, one notice (the unique index decides)");

  // Answering: only the seller it was addressed to.
  const other = await answerClientInfoRequest(db, { leadId: "lead-1", actorId: "rep-2", actorName: "Other rep", businessName: base.businessName, what: "x" });
  ok(!other && db.t.client_info_requests[0].closed_at === null, "9. another salesperson cannot answer (the request stays open)");
  const admin = await answerClientInfoRequest(db, { leadId: "lead-1", actorId: "paul", actorName: "Paul", businessName: base.businessName, what: "x" });
  ok(!admin && db.t.client_info_requests[0].closed_at === null, "…nor does Paul's own edit close the seller's request");
  const mine = await answerClientInfoRequest(db, { leadId: "lead-1", actorId: "rep-1", actorName: "Rep One", businessName: base.businessName, what: "Client details added: services" });
  ok(mine && db.t.client_info_requests[0].closed_reason === "answered" && db.t.client_info_requests[0].answered_by === "rep-1", "8. the seller's save answers it");
  ok(db.t.lead_activity.some((x) => x.kind === "client_info_answered") && db.t.notifications.some((n) => n.user_id === "paul" && n.link === "/paid-clients/lead-1"), "History: the salesperson answered — and Paul is told, linked to the client");
  const again = await answerClientInfoRequest(db, { leadId: "lead-1", actorId: "rep-1", actorName: "Rep One", businessName: base.businessName, what: "x" });
  ok(!again && db.t.notifications.filter((n) => n.user_id === "paul").length === 1, "…a later save does not tell Paul twice");
}

console.log("\n── WHAT THE SALESPERSON SEES, AND THE SECURITY ──");
{
  const my = QC.slice(QC.indexOf('if (mode === "my_handoffs")'), QC.indexOf("const leadId = typeof body.lead_id"));
  ok(/\.from\("client_info_requests"\)[^;]*\.eq\("seller_user_id", actor\.id\)/.test(my) && /\.eq\("sold_by_user_id", actor\.id\)/.test(my), "7. the seller's list reads only THEIR requests on THEIR own sales");
  ok(/create policy client_info_requests_read[\s\S]*my_role\(\)\) = 'admin' or seller_user_id = \(select auth\.uid\(\)\)/.test(MIG), "7/9. RLS: the admin reads every request, a salesperson only those addressed to them");
  ok(/revoke all on public\.client_info_requests from anon, authenticated;\s*grant select on public\.client_info_requests to authenticated;/.test(MIG), "9. no write grants — only the two functions write, on the service role");
  const sci = QC.slice(QC.indexOf('if (mode === "save_client_info")'), QC.indexOf('if (mode === "submit_delivery")'));
  ok(/if \(!mayHandoff\) \{[\s\S]*recordDenial[\s\S]*not_your_sale/.test(sci), "9. save_client_info refuses anyone but the seller (or the admin) — and records the denial");
  ok(/paidLead && actor\.role === "sales" && lead\.sold_by_user_id === actor\.id/.test(QC), "9. mayHandoff after payment is the SELLER of this client only (unchanged rule)");
  ok(/actor\.role === "sales" && lead\.sold_by_user_id === actor\.id/.test(sci) && /\.eq\("seller_user_id", i\.actorId\)/.test(REQ), "9. only the addressed seller's save answers the request");
  ok(/info_request: infoRequest && \(actor\.role === "admin" \|\| \(infoRequest as Obj\)\.seller_user_id === actor\.id\)/.test(QC), "9. the request is shown on the handoff screen only to its seller (and the admin)");
  ok(/requireAdmin/.test(HUB) && /action === "request_client_info"/.test(HUB), "Ask salesperson is admin-only (paid-client-hub is requireAdmin)");
  ok(/params\.get\(HANDOFF_PARAM\)/.test(MINE) && /CLIENT INFO NEEDED/.test(MINE) && /Paul asked for:/.test(MINE), "7. 'Finish the handoff' lists the request and the notice link opens it");
  ok(/CLIENT INFO NEEDED/.test(QCD) && /SellerClientInfoForm/.test(QCD) && /mode: 'save_client_info'/.test(QCD), "7. the handoff screen shows what Paul asked for and the seller's form");
}

console.log("\n── THE SELLER'S ANSWER UPDATES SETUP BY ITSELF ──");
{
  const r = cleanSellerClientInfo({ services: "Boiler repairs, Bathroom fitting, boiler repairs", service_areas: ["Portsmouth", " Fareham "], website: "portsmouthplumbing.co.uk", website_control: "client_controls", amount_paid: 0, status: "x" }, { website: null });
  ok(JSON.stringify(Object.keys(r.patch).sort()) === JSON.stringify(["service_areas", "services_included", "website", "website_control"]), "13. only the four allowlisted lead fields can be written (never money or status)");
  ok(JSON.stringify(r.patch.services_included) === JSON.stringify(["Boiler repairs", "Bathroom fitting"]) && r.patch.website === "https://portsmouthplumbing.co.uk", "lists trimmed + de-duplicated; a bare domain gets https://");
  const after = handoffReadiness({ ...lead, ...r.patch }, null, ev({ complete: true, missing: 0 }));
  const still = missingInformation(after).map((i) => i.key);
  ok(!still.includes("services") && !still.includes("service_areas") && !still.includes("website") && !still.includes("website_access") && !still.includes("sales_handoff"),
    `10. after the seller's answers the checklist drops those items — nothing marked resolved by hand (left: ${still.join(", ")})`);
  ok(cleanSellerClientInfo({ services: "", service_areas: [] }, null).changed.length === 0, "13. a blank box never clears what is there");
  const keep = cleanSellerClientInfo({ website: "other.co.uk" }, { website: "https://theirs.co.uk" });
  ok(!keep.patch.website && keep.refused.length === 1, "13. a website already on file is never overwritten by the seller");
  ok(cleanSellerClientInfo({ website_control: "unknown" }, null).refused.length === 1, "'unknown' is not an answer for who controls the site");
  ok(cleanSellerWebsite("not a site") === null && cleanSellerWebsite("javascript:alert(1)") === null && cleanSellerWebsite("https://ok.example") === "https://ok.example", "website must be one real host");
  const fromCrm = WEBSITE_CONTROL_OPTIONS.map((o) => o.value).filter((v) => v !== "unknown");
  ok(JSON.stringify([...SELLER_WEBSITE_CONTROL_VALUES]) === JSON.stringify(fromCrm), "the seller's website-control choices = the CRM's, minus 'unknown' (one list)");
  ok(/\.update\(patch\)\.eq\("id", leadId\)/.test(QC) && !/update\(\{ ?\.\.\.body/.test(QC), "13. the write is exactly the cleaned patch");
  ok(/client_closed/.test(QC.slice(QC.indexOf('if (mode === "save_client_info")'), QC.indexOf('if (mode === "submit_delivery")'))) && /not_paid/.test(QC.slice(QC.indexOf('if (mode === "save_client_info")'), QC.indexOf('if (mode === "submit_delivery")'))),
    "13. refused before payment and for an ended / refunded client");
}

console.log("\n── CONTACT CLIENT ──");
{
  ok(JSON.stringify(clientContactRoutes({ phone: "07700900501", email: "a@b.co", capability: "unchecked", conversation: true }).map((r) => r.kind)) === JSON.stringify(["whatsapp_thread", "email", "phone"]),
    "11. a conversation exists → open it first (email and phone beside it)");
  ok(clientContactRoutes({ phone: "07700900501", email: null, capability: "mobile_unchecked", conversation: false })[0].kind === "whatsapp_start", "12. no conversation, a mobile worth trying → the Inbox's own start state");
  ok(clientContactRoutes({ phone: "07700900501", email: "a@b.co", capability: "not_on_whatsapp", conversation: false })[0].kind === "email", "12. Meta rejected the number → email first, never WhatsApp");
  ok(clientContactRoutes({ phone: "01234567890", email: null, capability: "not_mobile", conversation: false }).map((r) => r.kind).join() === "phone", "12. a landline → call only");
  ok(clientContactRoutes({ phone: "07700900501", email: null, capability: "unchecked", conversation: false }).map((r) => r.kind).join() === "phone", "12. an unchecked number starts no new WhatsApp thread");
  ok(clientContactRoutes({ phone: "", email: "", capability: "unchecked", conversation: false }).length === 0, "12. no phone, no email → no route (never a dead button)");
  ok(/no-contact-route/.test(PANEL) && /clientKeys\.length > 0 && primary && routeButton\(primary, true\)/.test(PANEL), "12. …the panel says so instead of drawing a button");
  ok(/navigate\(`\$\{whatsAppLinkForLead\(leadId\)\}&\$\{NEED_PARAM\}=/.test(PANEL), "11. Contact client → /inbox?lead=<THIS client>&need=… (the one deep link)");
  ok(/needFor && active\.leadId === needFor\.leadId/.test(INBOX), "11. the note shows on THAT lead's thread only");
  ok(needParamValue(["services", "bogus", "domain"]) === "services,domain" && parseNeedParam("services,<script>,domain").join() === "services,domain", "the need list in the URL is keys only, an allowlist");
  ok(/action: 'client_contact_opened'/.test(PANEL) && /nothing sent by the app/.test(HUB) && /Opened the client's WhatsApp conversation from Paid Client/.test(HUB), "History: Paul opened client contact — recorded as OPENED, never as sent");
}

console.log("\n── INTERNAL ONLY, NOTHING AUTO-SENDS ──");
{
  const html = renderToStaticMarkup(createElement(ClientInfoNeededHelper, { keys: ["services", "domain"], contactName: "Dave Smith", windowOpen: false, onDraft: () => undefined, onDismiss: () => undefined }));
  ok(/Need from this client/.test(html) && /internal — never sent/.test(html) && html.includes(CLIENT_NEED_WORDS.services), "11. the Inbox note says INTERNAL — never sent, with what to ask");
  ok(!/Put in reply box/.test(html), "…outside the 24-hour window it offers Copy only (free text cannot go)");
  const open = renderToStaticMarkup(createElement(ClientInfoNeededHelper, { keys: ["services"], contactName: null, windowOpen: true, onDraft: () => undefined, onDismiss: () => undefined }));
  ok(/Put in reply box/.test(open), "…inside the window it can fill the reply box for Paul to edit");
  ok(/onDraft=\{\(text\) => insertWarmDraft\(active\.key, text\)\}/.test(INBOX), "11. 'Put in reply box' only fills the composer (the reply drafter's path), never sends");
  const NEW = [PANEL, HELPER, FORM, REQ, read("src/lib/clientMissingInfo.ts")].map(strip).join("\n");
  ok(!/send-whatsapp-message|sendMessage|doSend|sendTemplate|process-whatsapp-queue|sendOperatorAlert|resend|sendEmail/i.test(NEW), "12. NOTHING in this feature calls a sender (WhatsApp, email or queue)");
  const hubNew = strip(HUB.slice(HUB.indexOf('if (action === "request_client_info")'), HUB.indexOf("/* ══ END THE SERVICE")));
  ok(!/send-whatsapp-message|sendOperatorAlert|qaEmailHold|fetch\(/.test(hubNew), "12. the two new hub actions send nothing to anyone outside the app");
  const msg = clientInfoRequestMessage({ contactName: "Dave Smith", keys: ["services", "gbp_access"], setupLink: null });
  ok(/^Hi Dave, /.test(msg) && msg.includes(GBP_MANAGER_EMAIL) && !/paul@move37/.test(msg) && /Thanks, Paul$/.test(msg), "COPY REQUEST: first name, the canonical GBP manager address, Paul signs it");
  ok(!/guarantee|money back|refund|rank|£/i.test(msg), "COPY REQUEST makes no offer or outcome claim");
  ok(sellerRequestTitle(" ") === "CLIENT INFO NEEDED · A client" && /^Your client is missing: Services\./.test(sellerRequestBody(null, ["services"])), "words survive a blank name");
  ok(cleanInfoKeys(["services", "services", "x"]).join() === "services", "stored request keys are an allowlist, de-duplicated");
}

console.log("\n── FIND WHAT WE ALREADY HAVE ──");
{
  const known = gatherKnown({
    missing: ["services", "service_areas", "website", "website_access", "contact", "domain", "gbp_access", "onboarding"],
    lead: { website: null, website_control: null },
    onboardingRows: [
      { id: "counted", source: "onboarding", services_list: ["Ignored — already counted"] },
      { id: "fc", source: "free_check", updated_at: "2026-09-30T10:00:00Z", services: "Boiler repairs, Gas safety", areas_wanted: "Portsmouth", business_website: "portsmouthplumbing.co.uk", contact_email: "dave@qa.example" },
    ],
    countedOnboardingId: "counted",
    crawl: { url: "https://portsmouthplumbing.co.uk/", created_at: "2026-10-01T09:00:00Z", siteInfo: { services: [{ name: "Bathroom fitting" }, "Boiler repairs"], towns: ["Fareham"], phone: "023 9200 0000" } },
    handoffSiteSituation: "agency", quickCloseManager: "owner",
  });
  const by = (k: string) => known.find((x) => x.key === k)!;
  ok(by("services").candidates.length === 2 && by("services").candidates.every((c) => c.apply === "services"), "F1. services: the free-check form AND the website crawl, shown separately (never merged)");
  ok(!JSON.stringify(known).includes("Ignored — already counted"), "F1. the onboarding row the checklist already reads is not offered again");
  const crawlSvc = by("services").candidates.find((c) => c.source === "crawl")!;
  ok(JSON.stringify(crawlSvc.items) === JSON.stringify(["Bathroom fitting", "Boiler repairs"]) && /a guess until the client confirms it/.test(crawlSvc.note ?? ""), "F2. a website-crawl find is labelled a guess to confirm");
  ok(by("service_areas").candidates.map((c) => c.items?.join()).join("|") === "Portsmouth|Fareham", "F1. areas from the form and from the crawl's towns");
  ok(by("website").candidates.length === 1 && by("website").candidates[0].value === "https://portsmouthplumbing.co.uk" && by("website").candidates[0].source === "free_check",
    "F1. the website from the form and the crawl is ONE find (same site, trailing slash ignored)");
  ok(by("website_access").candidates.map((c) => `${c.source}:${c.value}`).join() === "handoff:agency_controls,quick_close:client_controls", "F3. who controls the site: the handoff and the Quick Close answer, side by side (they can disagree — Paul picks)");
  ok(by("contact").candidates.every((c) => c.apply === null), "F4. contact details found elsewhere are shown to copy, never written");
  ok(["domain", "gbp_access", "onboarding"].every((k) => by(k).clientOnly && by(k).candidates.length === 0), "F5. domain / Google access / their form: nothing offered — only the client can answer");
  const hasSite = gatherKnown({ missing: ["website"], lead: { website: "https://theirs.example" }, onboardingRows: [], countedOnboardingId: null, crawl: { url: "https://other.example" } });
  ok(hasSite[0].candidates.every((c) => c.apply === null), "F6. a website already on file is never replaced from a find");
  ok(JSON.stringify(patchForCandidate(crawlSvc, null)) === JSON.stringify({ services_included: ["Bathroom fitting", "Boiler repairs"] }), "F7. Use writes exactly that candidate through the seller allowlist");
  ok(patchForCandidate(by("contact").candidates[0], null) === null, "F7. a reference-only find cannot be applied");
  const after = handoffReadiness({ ...lead, ...patchForCandidate(crawlSvc, null)! }, null, ev());
  ok(!missingInformation(after).some((i) => i.key === "services"), "F8. once used, the checklist no longer lists it — derived, nothing marked by hand");
  const empty = gatherKnown({ missing: ["services"], lead: null, onboardingRows: [], countedOnboardingId: null, crawl: null });
  ok(empty[0].candidates.length === 0, "F9. no crawl, no other form → nothing found (never invented)");
  const ga = HUB.slice(HUB.indexOf('if (action === "gather_known" || action === "apply_known")'), HUB.indexOf("/* ══ PAUL OPENED THE CLIENT'S CONTACT"));
  ok(/\.find\(\(c\) => c\.id === text\(body\.candidate_id\)\)/.test(ga) && !/body\.(value|items|services)/.test(ga), "F10. apply_known re-gathers on the server and applies by id — the browser never sends a value");
  ok(/clientClosed\(own as never\)/.test(ga) && /\.eq\("user_id", user\.id\)/.test(ga) && /kind: "details_set"/.test(ga), "F10. refused for an ended client, only the book's own clients, recorded in History");
  ok(!/send-whatsapp-message|sendOperatorAlert|fetch\(/.test(strip(ga)), "F10. finding and using sends nothing");
  ok(/KnownInfoFinder/.test(PANEL) && /Find what we already have/.test(read("src/components/KnownInfoFinder.tsx")), "F11. the button sits in the Missing information box");
}

console.log("\n── KINDS: HISTORY + NOTIFICATIONS ──");
{
  const kinds = ["client_info_requested", "client_info_answered", "client_contact_opened"];
  const check = MIG.slice(MIG.indexOf("lead_activity_kind_check check"), MIG.indexOf("]::text[]"));
  ok(kinds.every((k) => check.includes(`'${k}'`)), "the History kinds are allowed by the CHECK");
  const prev = read("supabase/migrations/20261004120000_paid_client_automation.sql");
  const old = [...prev.slice(prev.indexOf("lead_activity_kind_check check"), prev.indexOf("]::text[]")).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  ok(old.length > 25 && old.every((k) => check.includes(`'${k}'`)) && check.includes("'payment_link_shared'"), "…and the CHECK keeps every kind already allowed (incl. payment_link_shared, live)");
  const union = SETUP.slice(SETUP.indexOf("export type LeadEventKind"), SETUP.indexOf("export async function recordLeadEvent"));
  ok(kinds.every((k) => union.includes(`"${k}"`)), "the writer's kinds include them");
  ok(kinds.every((k) => !!ACTIVITY_LABEL[k]), "every new event has a History label");
  ok(kinds.every((k) => HUB.slice(HUB.indexOf("const DELIVERY_ACTIVITY_KINDS"), HUB.indexOf("const DELIVERY_ACTIVITY_KINDS") + 600).includes(`"${k}"`)), "the client page's History shows them");
  const nchk = MIG.slice(MIG.indexOf("notifications_kind_check check"), MIG.indexOf("'client_info_request'));") + 30);
  const board = read("supabase/migrations/20261001200000_sales_team_board.sql");
  const oldN = [...board.slice(board.indexOf("notifications_kind_check check"), board.indexOf("'team_task'));") + 14).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  ok(oldN.length >= 17 && oldN.every((k) => nchk.includes(`'${k}'`)) && nchk.includes("'client_info_request'"), "the notification CHECK keeps every kind and adds client_info_request");
  ok(/client_info_request: \{ icon:/.test(read("src/components/NotificationCenter.tsx")), "the bell draws the new kind");
  ok(/kind === 'client_info_request'\) void qc\.invalidateQueries\(\{ queryKey: \['my-handoffs'\] \}\)/.test(read("src/hooks/useNotifications.ts")), "a new request refreshes the seller's list at once");
}

console.log(`\n${f ? `${f} FAILURE${f === 1 ? "" : "S"}` : "ALL PASS"}`);
process.exit(f ? 1 : 0);
