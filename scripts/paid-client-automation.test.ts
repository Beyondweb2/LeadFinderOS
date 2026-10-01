/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PAID CLIENT AUTOMATION + SALES HANDOFF + DELIVERY READINESS (2026-10-02, docs/paid-client-automation.md)

   Pins, from the pure rules and the source (nothing here touches the database or Stripe):
     PAYMENT   the webhook makes the Paid Client, records "Payment received" once, emails once (a claim,
               released on a refused send), names the package and the seller, never on a recurring invoice,
               drafts no questions and starts no Discovery;
     HANDOFF   six answers, prefilled but never complete until a person saves; owed only on a salesperson's
               own sale since handoffs existed; only the seller may edit after payment;
     CHECKLIST required / not needed per client (no GBP, no site, own sale), who owes each item, done/total;
     STAGE     one next step, crawl → Discovery → questions → approve → baseline, legacy clients placed by
               their real progress;
     ONBOARDING the post-payment form is seeded from ONE known source each, crawler guesses labelled;
     HISTORY   one list of kinds in SQL, the writer and the labels; one-per-lead events are indexed.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import { handoffReadiness, crawlIsFresh, CRAWL_REUSE_DAYS, READY_LABEL, WAITING_LABEL, type HandoffLead, type HandoffOnboarding, type HandoffEvidence } from "../src/lib/handoffReadiness.ts";
import { deliveryStage, discoverySummary, matchesFilter, DELIVERY_STAGES, type StageInput } from "../src/lib/deliveryStage.ts";
import {
  cleanHandoff, handoffComplete, handoffMissing, handoffPrefill, handoffWithPrefill, handoffChangedKeys, salesHandoffApplies,
  SALES_HANDOFF_SINCE, HANDOFF_QUESTIONS, WORK_TYPE_OPTIONS,
} from "../src/lib/salesHandoff.ts";
import { clientKnown, KNOWN_SOURCE_LINE } from "../src/lib/setupPrefill.ts";
import { newClientSetupLines, newClientSubject } from "../src/lib/newClientEmail.ts";
import { ACTIVITY_LABEL } from "../src/lib/salesCrm.ts";
import { clientSetupUrl } from "../src/config/findableSite.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const HOOK = read("supabase/functions/stripe-webhook/index.ts");
const HUB = read("supabase/functions/paid-client-hub/index.ts");
const QC = read("supabase/functions/quick-close/index.ts");
const SETUP = read("supabase/functions/_shared/client-setup.ts");
const ONB = read("supabase/functions/findable-onboarding/index.ts");
const PB = read("supabase/functions/paid-baseline/index.ts");
const MIG = read("supabase/migrations/20261004120000_paid_client_automation.sql");

/* ── fixtures ──────────────────────────────────────────────────────────────────────────────────── */
const lead: HandoffLead = { business_name: "ZZ QA Plumbing", phone: "07700900401", website: "https://qa.example", amount_paid: 99, status: "payment_received" };
const ob: HandoffOnboarding = {
  services_list: ["Boiler repair"], areas_list: ["Wakefield"], business_website: "https://qa.example", confirmed_location: "Wakefield",
  website_route: "optimise_existing", website_manager: "direct_access", gbp_status: "done",
};
const ev = (o: Partial<HandoffEvidence> = {}): HandoffEvidence => ({
  crawl: true, crawlAgeDays: 3, hookAudit: true, salesHandoff: { applies: "required", complete: true, missing: 0 }, ...o,
});
const stageIn = (o: Partial<StageInput> = {}): StageInput => ({
  readiness: handoffReadiness(lead, ob, ev()), lead: { ...lead }, onboarding: { baseline_status: "needs_questions" }, baselineAudit: null,
  discovery: { generated: false, started: false, finished: false }, route: "optimise", today: "2026-10-02", ...o,
});

console.log("── PAYMENT ──");
{
  const checkout = HOOK.slice(HOOK.indexOf('case "checkout.session.completed"'), HOOK.indexOf('case "invoice.paid"'));
  const invoice = HOOK.slice(HOOK.indexOf('case "invoice.paid"'), HOOK.indexOf('case "invoice.payment_failed"'));
  ok(/status: "payment_received",\s*amount_paid: amountGbp/.test(checkout), "1. a completed first payment writes the paid lead (the Paid Client is membership by amount_paid — no manual move)");
  ok(/recordLeadEvent\(service, findableLeadId, "payment_received"/.test(checkout), "1. …and records 'Payment received' in History");
  ok(/lead_activity_one_payment_received[\s\S]*where kind = 'payment_received'/.test(MIG) && /"23505"\) return "exists"/.test(SETUP), "2. a retried event cannot add a second 'Payment received' (partial unique index; 23505 = already there)");
  ok(/\.update\(\{ new_client_email_at: new Date\(\)\.toISOString\(\) \}\)\s*\.eq\("id", findableLeadId\)\.is\("new_client_email_at", null\)\.select\("id"\)/.test(checkout), "2/6. the new-client email is a CLAIM only one delivery can win");
  ok(/let claimedEmail = !paidEmailAlreadySent;/.test(checkout), "6. …and a client emailed before the claim existed (trace) is never emailed again");
  ok(/if \(!sent && findableLeadId\) \{\s*await service\.from\("outreach_leads"\)\.update\(\{ new_client_email_at: null \}\)/.test(checkout), "6. a send Resend refused releases the claim (never silent for ever)");
  ok(/paymentHandoff\(service, findableLeadId \|\| null, onboardingId \|\| null, amountGbp,\s*paid\.route \? `\$\{SERVICE_ROUTE_NAME\[paid\.route\]\}/.test(checkout), "3. the package named is the route the SESSION was paid on");
  ok(/const seller = setup\.sellerId;/.test(HOOK) && /\(l\.sold_by_user_id \?\? l\.assigned_to_user_id\)/.test(SETUP), "4. the salesperson is sold_by_user_id (stamped at payment), the owner only for older rows");
  ok(!/notifyOfFindablePayment|newClientSubject|recordLeadEvent/.test(invoice), "7. a recurring invoice sends no new-client email and writes no History");
  ok(!/preparePaidBaselineQuestions/.test(strip(HOOK)), "25. payment drafts NO baseline questions (they come after Discovery)");
  ok(!/discovery_run|startDiscoveryRun/.test(strip(HOOK)), "25. payment never starts Discovery (manual, Paul's spend)");
  ok(/subject: opts\.noLead \? `PAID \$\{amount\} — \$\{name\} \(NO LEAD\)` : newClientSubject\(name, opts\.amountGbp\)/.test(HOOK), "the subject: 'New Findable client: …' for a linked payment, the PAID alarm for an unlinked one");
  ok(newClientSubject("ABC Plumbing", 99) === "New Findable client: ABC Plumbing (paid £99.00)", "…in Paul's words");
}

console.log("\n── 5. SALES CHASING STOPS ──");
{
  // Clients leave every sales surface by the existing SQL rule; no automatic path may write a Next Action.
  const view = read("supabase/migrations/20261002200000_lost_reason.sql");
  ok(/not public\.lead_is_client\(/.test(view), "a paid lead leaves the sales_leads view (Sales' Outreach / Inbox)");
  ok(!/next_action/.test(strip(HOOK)), "…and the webhook writes no Next Action (human-set only)");
}

console.log("\n── HANDOFF ──");
{
  ok(HANDOFF_QUESTIONS.filter((q) => q.required).map((q) => q.key).join() === "work_type,site_situation,client_wants,promised,why_bought,decision_maker_name", "six required answers, role + note optional");
  ok(WORK_TYPE_OPTIONS.map((o) => o.label).join("|") === "Brand new website|Rebuild their existing website|Rebuild, keeping their current design fairly close|Optimise their existing website", "the four 'what are we doing' options, mapped to the two real routes");
  const c = cleanHandoff({ work_type: "rocket", site_situation: "agency", client_wants: "  More   calls ", junk: "x", promised: 5 });
  ok(!c.work_type && c.site_situation === "agency" && c.client_wants === "More calls" && !("junk" in c) && !c.promised, "cleanHandoff is an allowlist: unknown keys / tokens / types dropped, whitespace collapsed");
  ok(cleanHandoff({ client_wants: "x".repeat(900) }).client_wants!.length === 500, "…lengths capped");
  const pre = handoffPrefill({ quickClose: { route: "optimise", manager: "agency" }, contactName: "Sam Owner" });
  ok(pre.fields.work_type === "optimise" && pre.fields.site_situation === "agency" && pre.fields.decision_maker_name === "Sam Owner", "10. existing info pre-fills (route, who runs the site, the contact)");
  ok(!handoffPrefill({ quickClose: { route: "build", manager: "owner" } }).fields.work_type, "…but rebuild vs keep-close is never guessed");
  ok(handoffPrefill({ route: "build", hasWebsite: false }).fields.work_type === "new_site", "…a Build with no site is a brand new website");
  ok(handoffWithPrefill({ site_situation: "client" }, pre.fields).site_situation === "client", "saved answers win over the prefill");
  const full = { work_type: "optimise", site_situation: "client", client_wants: "a", promised: "b", why_bought: "c", decision_maker_name: "d" } as const;
  ok(!handoffComplete({ ...full }) && handoffComplete({ ...full, saved_at: "2026-10-02T10:00:00Z" }), "complete only once a person has SAVED it (a prefill alone never is)");
  ok(handoffMissing({ ...full, promised: null }).join() === "promised", "9. the missing answers are named");
  ok(handoffChangedKeys(full, { ...full, why_bought: "z" }).join() === "why_bought" && handoffChangedKeys(full, full).length === 0, "History records a material change, never a no-op save");
  ok(salesHandoffApplies({ sellerId: "rep", sellerIsBookOwner: false, paidOn: SALES_HANDOFF_SINCE }) === "required", "owed on a salesperson's sale");
  ok(salesHandoffApplies({ sellerId: "paul", sellerIsBookOwner: true, paidOn: "2026-10-05" }) === "not_needed_own_sale", "…not on Paul's own sale");
  ok(salesHandoffApplies({ sellerId: "rep", sellerIsBookOwner: false, paidOn: "2026-09-17" }) === "not_recorded_before", "33. …and never fabricated for a client paid before handoffs existed");
  ok(salesHandoffApplies({ sellerId: null, sellerIsBookOwner: null, paidOn: null }) === "no_seller", "…nor with no seller at all");
  // 8 / 11: who may edit.
  ok(/const mayHandoff = actor\.role === "admin" \|\| \(!paidLead && access\.ok\) \|\| \(paidLead && actor\.role === "sales" && lead\.sold_by_user_id === actor\.id\);/.test(QC), "8/11. after payment only the SELLER (or Paul) may write the handoff; before it, whoever works the lead");
  ok(/if \(mode === "save_handoff"\) \{\s*if \(!mayHandoff\) \{\s*await recordDenial/.test(QC), "11. another rep is refused and the denial recorded");
  ok(/\.update\(\{ sales_handoff: next \}\)\.eq\("id", leadId\)/.test(QC) && !/sales_handoff/.test(read("src/lib/outreachLeadColumns.ts")), "the handoff is written to ONE column, by quick-close only");
  ok(/\.eq\("sold_by_user_id", actor\.id\)\.gt\("amount_paid", 0\)/.test(QC) && !/amount_paid:/.test(QC.slice(QC.indexOf('mode === "my_handoffs"'), QC.indexOf('const leadId ='))), "a rep's 'finish the handoff' list is their OWN sales and carries no amount");
}

console.log("\n── CHECKLIST: required vs not needed ──");
{
  const r = handoffReadiness(lead, ob, ev());
  ok(r.ready && r.label === READY_LABEL && r.done === r.total && r.waitingOn === null, "16. everything required in → READY FOR DELIVERY, done = total");
  const noHandoff = handoffReadiness(lead, ob, ev({ salesHandoff: { applies: "required", complete: false, missing: 2 } }));
  ok(!noHandoff.ready && noHandoff.missing[0] === "Sales handoff" && noHandoff.waitingOn === "sales" && noHandoff.label === WAITING_LABEL, "9. a missing handoff is the first gap and waits on Sales");
  ok(noHandoff.items.find((i) => i.key === "sales_handoff")!.detail === "Not complete — 2 answers missing", "…saying how much is missing");
  const own = handoffReadiness(lead, ob, ev({ salesHandoff: { applies: "not_needed_own_sale", complete: false, missing: 0 } }));
  ok(own.ready && own.items.find((i) => i.key === "sales_handoff")!.notNeeded === true, "15. Paul's own sale: the handoff is NOT NEEDED, never a block");
  const noGbp = handoffReadiness(lead, { ...ob, gbp_status: null, gbp_exists: "no" }, ev());
  ok(noGbp.ready && noGbp.items.find((i) => i.key === "gbp_access")!.notNeeded === true, "15. a client with no Google Business Profile is never blocked by 'GBP access'");
  const unsure = handoffReadiness(lead, { ...ob, gbp_status: null, gbp_exists: "not_sure" }, ev());
  ok(!unsure.ready && unsure.missing.includes("Google Business Profile access"), "…but 'not sure' still asks (only a positive no is not needed)");
  const says = handoffReadiness(lead, { ...ob, gbp_status: "done" }, ev());
  ok(says.items.find((i) => i.key === "gbp_access")!.who === "findable", "client says the invite is sent → Findable's to confirm");
  const noObRow = handoffReadiness(lead, null, ev());
  ok(noObRow.missing.includes("Client onboarding") && noObRow.waitingOn === "client", "no onboarding → waits on the client");
  const half = handoffReadiness(lead, { ...ob, confirmed_location: null }, ev());
  ok(half.missing.includes("Client onboarding"), "13. onboarding complete = the two baseline fields (questionnaireComplete), nothing more");
  const total = (x: ReturnType<typeof handoffReadiness>) => `${x.done}/${x.total}`;
  ok(total(handoffReadiness(lead, ob, ev({ crawl: false, crawlAgeDays: null }))) === `${r.total - 1}/${r.total}`, "18. done/total counts required items only");
}

console.log("\n── CRAWL REUSE ──");
{
  ok(CRAWL_REUSE_DAYS === 30 && crawlIsFresh(3) && !crawlIsFresh(31) && !crawlIsFresh(null) && !crawlIsFresh(-1), "22. a crawl is reused inside the shared window; unknown age is never fresh");
  const stale = handoffReadiness(lead, ob, ev({ crawlAgeDays: 45 }));
  ok(!stale.ready && stale.missing.includes("Website crawled") && /Out of date · 45 days old/.test(stale.items.find((i) => i.key === "crawl")!.detail), "23. a stale crawl is a missing item, named with its age");
  const s = deliveryStage(stageIn({ readiness: stale }));
  ok(s.stage === "setup" && s.next.key === "crawl" && s.next.label === "Crawl website" && s.next.action, "23. …and its next step is 'Crawl website' (Paul's action)");
  const noSite = handoffReadiness({ ...lead, website: null }, { ...ob, business_website: null, website_route: "new_site", domain_status: "new", dns_permission: true, materials_confirmed: true }, ev({ crawl: false, crawlAgeDays: null }));
  ok(noSite.items.find((i) => i.key === "crawl")!.notNeeded === true && !noSite.missing.includes("Website crawled"), "no website → no crawl needed");
  ok(!/crawl-check|crawl_jobs/.test(strip(HOOK)) && !/crawl-check/.test(strip(SETUP)), "payment never crawls (the existing crawl is reused)");
}

console.log("\n── STAGE + ONE NEXT STEP ──");
{
  ok(DELIVERY_STAGES.join() === "setup,ready,discovery,questions,baseline,build,launched,remeasure", "the pipeline is the real workflow, no extra stages");
  const ready = handoffReadiness(lead, ob, ev());
  ok(deliveryStage(stageIn({ readiness: ready })).next.key === "submit", "19. everything in, not submitted → 'Submit for delivery'");
  const sub = deliveryStage(stageIn({ readiness: ready, lead: { ...lead, delivery_submitted_at: "2026-10-02T10:00:00Z" } }));
  ok(sub.stage === "ready" && sub.state === "ready" && sub.next.label === "Run Discovery", "19. submitted → READY FOR DELIVERY, next 'Run Discovery'");
  const waitClient = deliveryStage(stageIn({ readiness: handoffReadiness(lead, { ...ob, gbp_status: "will_do" }, ev()) }));
  ok(waitClient.state === "waiting_client" && /^Waiting for client: Google Business Profile access/.test(waitClient.next.label) && !waitClient.next.action, "19. a client gap → WAITING FOR CLIENT, naming it");
  const waitSales = deliveryStage(stageIn({ readiness: handoffReadiness(lead, ob, ev({ salesHandoff: { applies: "required", complete: false, missing: 6 } })) }));
  ok(waitSales.state === "waiting_sales" && waitSales.next.label === "Complete sales handoff", "19. a handoff gap → 'Complete sales handoff'");
  const gen = deliveryStage(stageIn({ discovery: { generated: true, started: false, finished: false } }));
  ok(gen.stage === "discovery" && gen.next.key === "run_discovery", "26. a generated pool → 'Run Discovery' (manual)");
  const running = deliveryStage(stageIn({ discovery: { generated: true, started: true, finished: false } }));
  ok(running.next.key === "wait_discovery" && !running.next.action, "Discovery running → wait");
  const done = deliveryStage(stageIn({ discovery: { generated: true, started: true, finished: true } }));
  ok(done.stage === "questions" && done.next.key === "review_questions", "26/27. Discovery finished → review the proposed questions");
  const legacyDraft = deliveryStage(stageIn({ onboarding: { baseline_status: "needs_approval" } }));
  ok(legacyDraft.next.key !== "review_questions", "26. a question draft made BEFORE Discovery never jumps to 'Approve' (Discovery comes first)");
  ok(deliveryStage(stageIn({ onboarding: { baseline_status: "approved" } })).next.key === "run_baseline", "30. approved & frozen → 'Run baseline' (never automatic)");
  ok(deliveryStage(stageIn({ onboarding: { baseline_status: "running" } })).next.key === "wait_baseline", "baseline running → wait");
  const built = (wb: Record<string, unknown> | null, route: "build" | "optimise") => deliveryStage(stageIn({ route, onboarding: { baseline_status: "complete" }, lead: { ...lead, baseline_audit_id: "a", website_build: wb as never, remeasure_due_date: "2026-11-30" }, baselineAudit: { baseline_completed_at: "2026-10-01T00:00:00Z" } }));
  ok(built(null, "build").next.key === "build", "baseline done, Build route → 'Build website'");
  ok(built({ production_url: "https://x.co.uk", qa: { production_checked: true } }, "build").stage === "launched", "a verified live site → Launched (the shared weeklyStart rule)");
  ok(built(null, "optimise").next.key === "optimise", "Optimise route → optimise and mark it live");
  const due = deliveryStage(stageIn({ onboarding: { baseline_status: "complete" }, lead: { ...lead, baseline_audit_id: "a", remeasure_due_date: "2026-10-05" }, baselineAudit: { baseline_completed_at: "2026-09-01T00:00:00Z" } }));
  ok(due.stage === "remeasure" && /Remeasure on 2026-10-05/.test(due.next.label), "the remeasure stage starts in the week before it is due");
  // 33. A legacy client past setup is placed by progress, never dragged back to "waiting".
  const legacy = deliveryStage(stageIn({ readiness: handoffReadiness(lead, null, ev({ salesHandoff: { applies: "not_recorded_before", complete: false, missing: 0 } })), onboarding: { baseline_status: "complete" }, lead: { ...lead, baseline_audit_id: "a" }, baselineAudit: { baseline_completed_at: "2026-09-01T00:00:00Z" } }));
  ok(legacy.state === "in_delivery" && legacy.stage !== "setup", "33. an in-delivery legacy client with gaps stays in delivery (no fabricated setup)");
  ok(deliveryStage(stageIn({ lead: { ...lead, status: "refunded" } })).state === "ended", "a refunded client is Ended, nothing to do");
  // 20. Filters.
  ok(matchesFilter(waitClient, "attention") && !matchesFilter(waitClient, "ready") && matchesFilter(sub, "ready") && matchesFilter(running, "in_delivery") && !matchesFilter(running, "attention"), "20. filters: waiting = needs attention; a running job does not");
  ok(discoverySummary({ pool: [{}], audit_id: "x" }, ["complete", "capped"]).finished && !discoverySummary({ pool: [{}], audit_id: "x" }, ["complete", "pending"]).finished && !discoverySummary({ pool: [{}], audit_id: "x" }, ["mystery"]).finished, "Discovery is finished only on terminal run statuses (positive)");
}

console.log("\n── ONBOARDING ASKS ONLY WHAT IS MISSING ──");
{
  const k = clientKnown({ onboarding: null, lead: { services_included: [], service_areas: ["Ossett"] }, crawlSiteInfo: { services: ["Emergency plumbing", { name: "Boiler repair" }, "emergency plumbing"], towns: ["Leeds"] } });
  ok(k.services?.source === "website" && k.services.items.join() === "Emergency plumbing,Boiler repair", "12. services found on their site are offered (deduped), labelled as found on the website");
  ok(k.areas?.source === "sales" && k.areas.items.join() === "Ossett", "…ONE source per list: Sales' areas outrank the crawl's towns, never merged");
  const own = clientKnown({ onboarding: { services_list: ["Leak detection"] }, lead: { services_included: ["Roofing"] }, crawlSiteInfo: { services: ["Boilers"] } });
  ok(own.services?.items.join() === "Leak detection" && own.services.source === "you", "14. the client's own answer outranks everything (a removed service never comes back)");
  ok(clientKnown({ onboarding: null, lead: null, crawlSiteInfo: null }).services === null, "28. nothing known → nothing offered (no trade-based invention)");
  ok(/We found these on your website/.test(KNOWN_SOURCE_LINE.website), "a crawler guess is labelled as one");
  ok(/known = \{\s*services: k\.services \?/.test(ONB) && /line: KNOWN_SOURCE_LINE\[k\.services\.source\]/.test(ONB), "q2_prefill returns the known lists with the server's own line (one copy of the words)");
  ok(/!questionnaireComplete\(existing as never\)/.test(ONB) && /"onboarding_submitted"/.test(ONB), "34. the client's FIRST complete submission is a History event (a correction is not)");
  ok(clientSetupUrl("o1", "l1") === "https://findable.live/onboarding/?q2=o1&lead=l1", "the client's setup link re-enters the paid form by onboarding id");
}

console.log("\n── SUBMIT FOR DELIVERY ──");
{
  ok(/if \(!setup\.readiness\.ready\) return \{ ok: false, error: "not_ready"/.test(SETUP), "submit is refused unless every REQUIRED item is in (re-derived on the server)");
  ok(/\.update\(\{ delivery_submitted_at: now, delivery_submitted_by: actor\.id \}\)\s*\.eq\("id", leadId\)\.is\("delivery_submitted_at", null\)/.test(SETUP), "…stamped ONCE (a conditional write)");
  ok(/"delivery_submitted", \{[\s\S]*?snapshot:/.test(SETUP), "…with the handoff + checklist SNAPSHOT in History");
  ok(/if \(actor\.source !== "admin"\) \{\s*try \{\s*await notify\(/.test(SETUP), "…and Paul is emailed only when someone else submitted it");
}

console.log("\n── EMAIL CONTENT ──");
{
  const r = handoffReadiness(lead, { ...ob, gbp_status: "will_do" }, ev({ salesHandoff: { applies: "required", complete: false, missing: 1 } }));
  const st = deliveryStage(stageIn({ readiness: r }));
  const lines = newClientSetupLines({
    packageName: "Findable Optimise", salesperson: "Finn", amountGbp: 99, website: "https://abcplumbing.co.uk/", siteManagement: "No agency evidence · 78% (automatic check — not confirmed)",
    services: { list: ["Emergency plumbing", "Boiler repair"], source: "crawl" }, handoff: { applies: "required", complete: false }, readiness: r, stage: st,
    clientLink: "https://app.leadfinderos.com/paid-clients/l1", setupLink: "https://findable.live/onboarding/?q2=o1&lead=l1",
  });
  const t = lines.join("\n");
  ok(/Package: Findable Optimise/.test(t) && /Salesperson: Finn/.test(t) && /Payment: £99\.00 received/.test(t) && /Website: abcplumbing\.co\.uk/.test(t), "27. package, salesperson, payment and website");
  ok(/Services \(found on their website — not yet confirmed\):\n  - Emergency plumbing/.test(t), "27. services found are labelled as a guess");
  ok(/Sales handoff: NOT COMPLETE/.test(t) && new RegExp(`Setup: ${r.done}/${r.total} complete`).test(t), "27. handoff state and n/m");
  ok(/Waiting for:\n  - Sales handoff \(sales\)\n  - Google Business Profile access \(client\)/.test(t), "27. what we wait for, and from whom");
  ok(/Next step: Complete sales handoff/.test(t) && /Open the client: https:\/\/app\.leadfinderos\.com\/paid-clients\/l1/.test(t), "33. the next step and the link that opens THAT client");
  ok(/Client's setup link/.test(t), "…plus the client's own setup link while the client owes something");
}

console.log("\n── HISTORY ──");
{
  const kinds = ["payment_received", "handoff_saved", "onboarding_submitted", "delivery_submitted", "discovery_run", "baseline_approved", "baseline_run", "build_started", "launched"];
  const check = MIG.slice(MIG.indexOf("lead_activity_kind_check check"), MIG.indexOf("]::text[]"));
  ok(kinds.every((k) => check.includes(`'${k}'`)), "34. every delivery event is allowed by the CHECK");
  const prev = read("supabase/migrations/20261002200000_lost_reason.sql");
  const old = [...prev.slice(prev.indexOf("lead_activity_kind_check check"), prev.indexOf("]::text[]")).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  ok(old.length > 20 && old.every((k) => check.includes(`'${k}'`)), "…and keeps every kind the live CHECK already allows");
  const union = SETUP.slice(SETUP.indexOf("export type LeadEventKind"), SETUP.indexOf("export async function recordLeadEvent"));
  ok(kinds.every((k) => union.includes(`"${k}"`)), "the writer's kinds are the same list");
  ok(kinds.every((k) => !!ACTIVITY_LABEL[k]), "every event has a History label");
  ok(/lead_activity_one_launched[\s\S]*where kind = 'launched'/.test(MIG), "35. 'Launched' is once per lead");
  ok(/if \(firstComplete \|\| \(changed\.length && prev\?\.completed_at\)\)/.test(QC), "35. a handoff save writes History only on completion or a material change after it");
  ok(/"discovery_run"/.test(PB) && /"baseline_approved"/.test(PB) && /"baseline_run"/.test(PB), "34. Discovery, approve & freeze and baseline run are recorded where they happen");
  ok(/"build_started"/.test(HUB) && /"launched"/.test(HUB), "34. build started and launched are recorded on the Website Build save");
  ok(/source: "system" \| "client" \| "sales" \| "admin"/.test(SETUP), "30. every event says who acted: system / client / sales / admin");
}

console.log("\n── ONE RECORD, NO DUPLICATES ──");
{
  ok(/add column if not exists sales_handoff jsonb/.test(MIG) && !/create table/i.test(MIG), "no new client table: the lead stays the one client record");
  ok(/export function pickOnboarding/.test(SETUP) && /\.find\(\(r\) => r\.status === "paid"\) \?\? byNewest\[0\]/.test(SETUP), "21. one onboarding row per client: the newest paid row (never a free check)");
  ok(!/password/i.test(strip(read("src/lib/salesHandoff.ts")) + strip(read("src/components/SalesHandoffForm.tsx")) + strip(read("src/components/ClientSetupCard.tsx"))), "32. no password field anywhere in the handoff or setup");
}

console.log(`\n${f ? `${f} FAILURE${f === 1 ? "" : "S"}` : "ALL PASS"}`);
process.exit(f ? 1 : 0);
