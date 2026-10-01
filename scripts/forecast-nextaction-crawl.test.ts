/* ════════════════════════════════════════════════════════════════════════════════════════════════
   2026-10-01 — THE SIX-MONTH FORECAST, THE NEXT ACTION CTA, CRAWL-FIRST HOOK QUESTIONS.
   (The trailing-commission rule itself — six, the cutover, the boundary — is pinned in
   sales-commission.test.ts; the ladder in monthly-commission-tiers.test.ts.)
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import { commissionForecast, commissionLines, earningsTotals, type ForecastClient, type LedgerRow } from "../src/lib/commission.ts";
import { pickServicesForQuestions, serviceCandidates, serviceKey, verifiedServices, SERVICE_EVIDENCE_VERSION } from "../src/lib/serviceEvidence.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── 1. THE FORECAST ─────────────────────────────────────────────────────────────────────────── */
console.log("\n── 1. the six-month forecast ──");
const REP = "rep";
let n = 0;
const row = (lead: string, kind: string, amount: number, at: string, extra: Partial<LedgerRow> = {}): LedgerRow => ({
  id: `r${++n}`, lead_id: lead, kind, status: "succeeded", amount_gbp: amount, occurred_at: at, stripe_object_id: `o${n}`,
  stripe_payment_intent_id: `pi${n}`, stripe_charge_id: `ch${n}`, stripe_invoice_id: kind === "recurring" ? `in${n}` : null, sold_by_user_id: REP, ...extra,
});
const TODAY = "2026-10-15";
const ledger = [
  row("a", "initial", 99, "2026-10-03T10:00:00Z"),                 // sold this month
  row("b", "initial", 99, "2026-08-20T10:00:00Z"), row("b", "recurring", 99, "2026-10-05T10:00:00Z"), // a monthly collected this month
  row("c", "initial", 99, "2026-09-10T10:00:00Z"),                 // past due: expects nothing
  row("d", "initial", 99, "2026-09-12T10:00:00Z", { stripe_payment_intent_id: "pi_delta" }), row("d", "refund", 99, "2026-10-08T10:00:00Z", { stripe_payment_intent_id: "pi_delta" }),
];
const { lines, clients } = commissionLines({ ledger, payouts: [], isCommissionable: (u) => u === REP, businessName: new Map([["a", "Alpha"], ["b", "Bravo"], ["c", "Charlie"], ["d", "Delta"]]) });
const left = new Map(clients.map((c) => [c.leadId, c.commissionablePaymentsLeft]));
const fc: ForecastClient[] = [
  { leadId: "a", business: "Alpha", nextPaymentAt: "2026-11-03T10:00:00Z", paymentsLeft: left.get("a")!, monthlyGbp: 99, live: true },
  { leadId: "b", business: "Bravo", nextPaymentAt: "2026-11-05T10:00:00Z", paymentsLeft: left.get("b")!, monthlyGbp: 99, live: true },
  { leadId: "c", business: "Charlie", nextPaymentAt: "2026-10-10T10:00:00Z", paymentsLeft: left.get("c")!, monthlyGbp: 99, live: false },
  { leadId: "d", business: "Delta", nextPaymentAt: null, paymentsLeft: left.get("d")!, monthlyGbp: 99, live: false },
];
const F = commissionForecast(lines, fc, TODAY);
const totals = earningsTotals(lines, [], [], TODAY);
ok(F.months.length === 6 && F.months[0].monthStart === "2026-10-01" && F.months[5].monthStart === "2027-03-01", "six blocks: this month and the next five London calendar months");
const m0 = F.months[0];
ok(m0.earnedNewSale === 0 && m0.earnedRecurring === 19.8 && m0.expected === 0, `this month splits new-sale from monthly commission, net of a refund this month (Alpha +29.70, Delta −29.70; Bravo 19.80) (got ${m0.earnedNewSale}/${m0.earnedRecurring}/${m0.expected})`);
ok(m0.items.some((i) => i.leadId === "d" && i.kind === "reversal" && i.amount === -29.7) && m0.items.some((i) => i.leadId === "a" && i.kind === "new_sale" && i.amount === 29.7), "the refund is listed as itself, beside the sale");
ok(Math.round((m0.earnedNewSale + m0.earnedRecurring) * 100) / 100 === totals.earnedThisMonth, `this month's collected IS the ledger's earned-this-month (${totals.earnedThisMonth})`);
ok(F.months[1].expected === 39.6 && F.months[1].items.map((i) => i.business).sort().join() === "Alpha,Bravo", "November expects Alpha's and Bravo's monthly payments (2 × £19.80)");
ok(F.months.slice(1).every((m) => !m.items.some((i) => i.leadId === "c" || i.leadId === "d")), "a past-due subscription and a refunded client expect nothing");
ok(F.months.every((m) => m.items.every((i) => ["a", "b", "c", "d"].includes(i.leadId))) && F.months.slice(1).every((m) => m.earnedNewSale === 0), "no hypothetical sales: only clients already sold, no new sale in a future month");
const alphaExpected = F.months.flatMap((m) => m.items).filter((i) => i.leadId === "a" && i.state === "expected").length;
const bravoExpected = F.months.flatMap((m) => m.items).filter((i) => i.leadId === "b" && i.state === "expected").length;
ok(alphaExpected === 5 && bravoExpected === 5, `inside the window: Nov–Mar is 5 payments each (Alpha ${alphaExpected}, Bravo ${bravoExpected}); the 6th falls after it`);
ok(F.expectedTotal === Math.round(F.months.reduce((s, m) => s + m.expected, 0) * 100) / 100 && F.periodTotal === Math.round(F.months.reduce((s, m) => s + m.total, 0) * 100) / 100, "the totals are the sum of the months — nothing counted twice");
const none = commissionForecast([], [], TODAY);
ok(none.expectedTotal === 0 && none.periodTotal === 0 && none.months.every((m) => m.items.length === 0), "no sales → £0 everywhere, never a guess");
const passed = commissionForecast([], [{ leadId: "z", business: "Zulu", nextPaymentAt: "2026-10-01T10:00:00Z", paymentsLeft: 2, monthlyGbp: 99, live: true }], TODAY);
ok(passed.months[0].expected === 0 && passed.months[1].expected === 19.8, "a billing date already passed with no payment is not expected; the next one is");
const undated = commissionForecast([], [{ leadId: "u", business: "Undated", nextPaymentAt: null, paymentsLeft: 3, monthlyGbp: 99, live: true }], TODAY);
ok(undated.expectedTotal === 0 && undated.undated.length === 1 && undated.undated[0].amount === 59.4, "no billing date yet → listed, never placed in a month");
const capped = commissionForecast([], [{ leadId: "k", business: "Six", nextPaymentAt: "2026-10-20T10:00:00Z", paymentsLeft: 6, monthlyGbp: 99, live: true }], TODAY);
ok(capped.months.reduce((s, m) => s + m.items.length, 0) === 6, "a client with six to go: one expected payment in each of the six months");

const earn = read("supabase/functions/_shared/earnings.ts");
ok(/subscription_renews_at/.test(earn) && /commissionForecast\(lines,/.test(earn) && /FORECAST_LIVE = new Set\(\["active", "trialing"\]\)/.test(earn), "the server builds it from the ledger lines and Stripe's next billing date; only active/trialing expect");
const card = read("src/components/salesDash/CommissionForecastCard.tsx");
for (const [label, re] of [["Earned this month", /label="Earned this month"/], ["Total earned to date", /label="Total earned to date"/], ["Expected next 6 months", /label="Expected next 6 months"/], ["6-month total", /label="6-month total"/]] as const) ok(re.test(card), `the card shows "${label}"`);
ok(/grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-6/.test(card), "six months side by side on desktop, stacked on a phone");
ok(/PopoverContent[\s\S]*m\.items\.map/.test(card) && /collected/.test(card) && /expected/.test(card), "tapping a month lists each client's amount, collected or expected");
ok(/<CommissionForecastCard forecast=\{e\.forecast\} totals=\{e\.totals\} \/>/.test(read("src/pages/SalesDashboard.tsx")), "on the Sales page, under the ladder");

/* ── 2. THE NEXT ACTION CTA, FIND EMAIL ──────────────────────────────────────────────────────── */
console.log("\n── 2. the Inbox header: Next Action in place of Find email ──");
const inbox = strip(read("src/pages/Inbox.tsx"));
ok(!/FindEmailButton/.test(inbox), "the Inbox has no Find email");
ok(/<NextActionEditor lead=\{activeLead\} variant="pill" \/>/.test(inbox) && !/<NextActionPill lead=\{activeLead\}/.test(inbox), "the header pill IS the Next Action editor (one control, not a pill plus a button)");
const editor = read("src/components/NextActionEditor.tsx");
ok(/Set next action/.test(editor) && /\[v\.label, v\.when \?\? 'No date set', v\.time\]\.filter\(Boolean\)\.join\(' · '\)/.test(editor), '"+ Set next action", or the action itself: "Call · Tomorrow · 14:30"');
ok((editor.match(/saveNextAction\(/g) ?? []).length === 1 && (editor.match(/<NextActionForm/g) ?? []).length === 1, "the same form and the one write, whichever trigger opened it");
ok(/perms\.enrichLeads && <FindEmailButton/.test(read("src/components/LeadDetailDialog.tsx")) && /perms\.enrichLeads && <FindEmailButton/.test(read("src/components/ProspectFacts.tsx")), "the lead popup and the prospect facts: Find email for the admin only");
const index = read("src/pages/Index.tsx");
ok(/onFindEmails=\{viewerRole === 'admin' \? findEmails : undefined\}/.test(index) && /onAddAllWithEmails=\{viewerRole === 'admin' \? handleAddAllWithEmails : undefined\}/.test(index), "Find Leads: the email scan and 'Add all with emails' are the admin's");
ok(fs.existsSync(path.join(root, "src/components/FindEmailButton.tsx")) && /'lead_set_email'/.test(read("src/components/FindEmailButton.tsx")), "the email tools still exist for the admin; nothing about email data was removed");
ok(!fs.readdirSync(path.join(root, "supabase/migrations")).some((m) => /drop column[^;]*email/i.test(read(`supabase/migrations/${m}`)) && m >= "20261001"), "no migration drops an email field");

/* ── 3. CRAWL FIRST ──────────────────────────────────────────────────────────────────────────── */
console.log("\n── 3. crawl first, then the hook questions ──");
const home = `<html><head><title>Smith Plumbing</title></head><body>
<nav><a href="/">Home</a><a href="/boiler-repairs/">Boiler Repairs</a><a href="/boiler-installation/">Boiler Installation</a>
<a href="/emergency-plumber/">24 Hour Emergency Plumber</a><a href="/plumbers-in-leeds/">Plumbers In Leeds</a><a href="/worcester-bosch/">Worcester Bosch</a>
<a href="/about/">About Us</a><a href="/contact/">Contact</a><a href="/areas-we-cover/">Areas We Cover</a><a href="https://facebook.com/x">Facebook</a><a href="/plumbing/">Plumbing</a></nav>
<h2>Our Services</h2><h3>Boiler Repairs</h3><h3>Emergency Plumbing</h3><h3>Gas Safety Certificates</h3><h2>Reviews</h2></body></html>`;
const pages = [
  { url: "https://smith.example/boiler-repairs/", html: "<title>Boiler Repairs | Smith Plumbing</title><h1>Boiler Repairs in Leeds</h1>" },
  { url: "https://smith.example/gas-safety/", html: "<title>Gas Safety Certificates - Smith</title><h1>Gas Safety Certificates</h1>" },
];
const ev = serviceCandidates(home, "https://smith.example/", pages);
ok(ev.version === SERVICE_EVIDENCE_VERSION && ev.candidates.every((c) => c.url && c.kind), "every candidate keeps where it was found (the page, or the homepage Services section)");
ok(!ev.candidates.some((c) => /facebook/i.test(c.url)), "off-site links are never evidence");
const v = verifiedServices(ev, { trade: "Plumbers", towns: ["Leeds"], businessName: "Smith Plumbing" });
const names = v.map((s) => s.name);
console.log("   verified:", names.join(" · "));
ok(names.includes("Boiler Repairs") && names.includes("Gas Safety Certificates") && names.some((x) => /emergency/i.test(x)), "real services from the menu, the Services section and the pages' own headings");
ok(!names.some((x) => /leeds|worcester|bosch|about|contact|areas|^plumbing$/i.test(x)), "no town pages, brands, About/Contact, coverage pages or the bare trade word");
ok(names.filter((x) => /emergency/i.test(x)).length === 1, '"24 Hour Emergency Plumber" and "Emergency Plumbing" are one intent');
ok(names.includes("Boiler Installation") && names.includes("Boiler Repairs"), '"Boiler Repairs" and "Boiler Installation" stay two intents');
ok(serviceKey("Wall Safe", "Locksmiths") !== "" && verifiedServices({ version: 1, candidates: [{ text: "Wall Safes", url: "/wall-safes/", kind: "nav" }, { text: "Wall Safe Installation", url: "/wall-safe-installation/", kind: "nav" }] }, { trade: "Locksmiths", towns: [], businessName: "X" }).length === 1, '"Wall Safe Installation" merges into "Wall Safes"');
ok(v[0].sources.length >= 2 && v.every((s, i) => i === 0 || v[i - 1].score >= s.score), "ranked by how prominently the site itself presents them");
ok(verifiedServices(null, { trade: "Plumbers", towns: [], businessName: "X" }).length === 0 && verifiedServices({ version: 1, candidates: [] }, { trade: "Plumbers", towns: [], businessName: "X" }).length === 0, "no evidence → no services (nothing inferred from the category)");
ok(verifiedServices({ version: 1, candidates: [{ text: "Repair", url: "/repair/", kind: "nav" }, { text: "Tipton", url: "/tipton/", kind: "nav" }] }, { trade: "Plumbers", towns: ["Tipton"], businessName: "X" }).length === 0, "a lone generic word, or a town, is not a service");
const pick = pickServicesForQuestions(verifiedServices({ version: 1, candidates: ["New Boilers", "New Gas Boiler", "New Oil Boiler", "Boiler Repairs", "Boiler Servicing"].map((t) => ({ text: t, url: `/${t.toLowerCase().replace(/ /g, "-")}/`, kind: "nav" as const })) }, { trade: "Plumbers", towns: [], businessName: "X" }), 3).map((s) => s.name);
ok(pick.length === 3 && pick.includes("Boiler Repairs") && pick.includes("Boiler Servicing"), `three questions span three intents, not three boiler variants (got ${pick.join(", ")})`);

const cc = read("supabase/functions/crawl-check/index.ts");
ok(/serviceCandidates\(home\.html, servedUrl \|\| homeUrl, samplePagesForInfo\)/.test(cc) && /\.\.\.\(serviceEvidence \? \{ serviceEvidence \} : \{\}\)/.test(cc), "crawl-check stores the evidence from the pages it already fetched (no extra request)");
ok(/serviceCandidates\(String\(home\.lean/.test(read("supabase/functions/_shared/crawl-job.ts")), "the full crawl stores it too");
const hs = read("supabase/functions/_shared/hook-services.ts");
ok(/HOOK_CRAWL_FRESH_MS = 30 \* 86_400_000/.test(hs) && /reused = true/.test(hs) && /r\.serviceEvidence/.test(hs), "a fresh stored crawl with service evidence is reused");
ok(/deep: true/.test(hs), "a new crawl is deep, so the post-audit crawl reuses it rather than crawling twice");
for (const reason of ["no_website", "crawl_failed", "no_services_found", "not_checked"]) ok(hs.includes(`"${reason}"`), `fallback reason recorded: ${reason}`);
ok(!/openai|apify|chat\/completions/i.test(strip(hs)), "no paid AI or search API: the services come from the site's own HTML");
const caa = read("supabase/functions/create-ai-audit/index.ts");
ok(/const hookServices = hookAuditRequested && auditPurpose === ORDINARY_AUDIT_PURPOSE && !reuseAuditId/.test(caa), "hook audits only — baseline, measurement, re-measure, free check, discovery, weekly check never reach it");
ok(/count: HOOK_SCORE_QUESTIONS/.test(caa) && (caa.match(/questionSpecialisms/g) ?? []).length === 3, "the same question count; the services reach only the hook's generator call (and its preview)");
ok(/generateWithMoney\(\n\s+businessName, businessType, locationText, hasWebsite, specialisms, ask\(questionCount\)/.test(caa) && /generateDiscoverySet\(\n\s+businessName, businessType, locationText, hasWebsite, specialisms,/.test(caa), "baseline / measurement / discovery generation is byte-for-byte unchanged");
ok(/crawlIfMissing: !\(providedQuestions && providedQuestions\.length\)/.test(caa), "a reviewed preview sent back verbatim records its basis without a second crawl");
ok(/basis: hookServices\.basis/.test(caa), "the basis is stored on the run (results.hook.basis) and returned with the preview");
const view = read("src/components/HookVisibilityView.tsx");
ok(/b\?\.source === 'crawl'/.test(view) && /Audit based on/.test(view), '"Audit based on …" shows only when the services came from the website; the fallback stays internal');

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURE(S)`);
process.exit(f === 0 ? 0 : 1);
