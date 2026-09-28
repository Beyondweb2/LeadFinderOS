/* ════════════════════════════════════════════════════════════════════════════════════════════════
   DOMAIN OWNERSHIP / AUTHORITY (Paul, 2026-09-28, docs/domain-authority.md). Pins the rule, and where
   it is enforced: the onboarding answers are saved (all three lists), checkout refuses a new-site
   payment that is not domain-ready, Paid Clients is never READY TO START without it, a terminated
   service gets no guarantee re-measure or results, billing is stopped by Paul (the app never moves
   money), a faithful rebuild needs confirmed rights, assets must be client-owned, Sales gets nothing
   new that is admin- or money-shaped. The live proof is supabase/tests/domain-authority.sql.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import { domainAuthority, domainInputFromRow, DOMAIN_CONTROL_OPTIONS, DOMAIN_QUESTIONS, SALES_DOMAIN_LINE, type DomainAuthorityInput } from "../src/lib/domainAuthority.ts";
import { handoffReadiness, type HandoffLead, type HandoffOnboarding } from "../src/lib/handoffReadiness.ts";
import { assetsToDownload, executionBlockers } from "../src/lib/buildExecution.ts";
import { leadPermissions } from "../src/lib/access.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

/* ── THE RULE ── */
const base: DomainAuthorityInput = {
  newSite: true, hasCurrentSite: true, domain_status: "existing", domain_owned: "yes", domain_access: "yes",
  domain_third_party: "no", authority_confirmed: true, dns_permission: true, materials_confirmed: true, site_rights: "yes",
};
const v = (x: Partial<DomainAuthorityInput>) => domainAuthority({ ...base, ...x });
ok(v({}).ready && v({}).label === "DOMAIN READY", "A: client owns the domain + has access + confirmations → DOMAIN READY");
ok(v({ domain_access: "agency" }).ready, "B: client owns the domain, an agency manages access / the site → eligible once they confirm authority");
ok(!v({ domain_access: "agency", authority_confirmed: false }).ready, "…but not without the authority confirmation");
ok(!v({ domain_third_party: "yes" }).ready && v({ domain_third_party: "yes" }).stop, "C: a third party owns / controls the domain → not build-ready, and it STOPS");
ok(!v({ domain_owned: "no" }).ready && v({ domain_owned: "no" }).stop, "C: the business does not own the domain → stop");
ok(!v({ domain_owned: "not_sure" }).ready && v({ domain_owned: "not_sure" }).stop, "D: ownership unsure → not build-ready (never guessed)");
ok(!v({ domain_third_party: "not_sure" }).ready && v({ domain_third_party: "not_sure" }).stop, "D: unsure whether a third party controls it → stop");
ok(!v({ domain_access: "no" }).ready && v({ domain_access: "no" }).stop, "no registrar / DNS access → stop");
ok(!v({ dns_permission: false }).ready && !v({ dns_permission: false }).stop, "DNS permission not given → not build-ready (a box to tick, not a stop)");
ok(!v({ materials_confirmed: false }).ready, "rights to supplied material not confirmed → not build-ready");
ok(!v({ domain_owned: null, domain_access: null, domain_third_party: null }).ready, "unanswered ownership questions are never a yes");
ok(!v({ domain_status: null }).ready && v({ domain_status: null }).reasons.includes("domain_not_answered"), "no domain answer at all → not ready");
ok(v({ domain_status: "new", domain_owned: null, domain_access: null, domain_third_party: null }).ready, "a brand-new domain (the client registers it) needs no ownership answers, only the confirmations");
ok(!v({ domain_status: "new", domain_owned: null, domain_access: null, domain_third_party: null, dns_permission: false }).ready, "…and still needs DNS permission");
ok(v({ hasCurrentSite: false, authority_confirmed: null }).ready, "no current website → no 'entitled to replace it' confirmation needed");
ok(domainAuthority({ ...base, newSite: false, domain_owned: "no" }).label === "NOT NEEDED" && domainAuthority({ ...base, newSite: false }).ready, "optimising their own site: the rule does not apply");
ok(v({}).mayReuseExistingSite && !v({ site_rights: "no" }).mayReuseExistingSite && !v({ site_rights: "not_sure" }).mayReuseExistingSite && !v({ site_rights: null }).mayReuseExistingSite,
  "faithful / modernised rebuild (or a move) only where they confirm they own / may reuse the site — no, unsure or blank = a fresh build");
{
  const i = domainInputFromRow({ website_addon: true, business_website: "x.co.uk", domain_status: "existing", domain_owned: "yes", domain_access: "yes", domain_third_party: "no", authority_confirmed: true, dns_permission: true, materials_confirmed: true, site_rights: "no" });
  ok(i.newSite && i.hasCurrentSite && domainAuthority(i).ready && !domainAuthority(i).mayReuseExistingSite, "a stored row maps once: new site from website_addon, a current site from the website");
  ok(domainInputFromRow({ website_route: "rebuild_existing" }).newSite && domainInputFromRow({ website_route: "new_site" }).newSite && !domainInputFromRow({ website_route: "optimise_existing" }).newSite, "…or from the operator's route");
  ok(!domainInputFromRow(null).newSite, "an absent row is not a new site (the handoff treats it as not answered, below)");
}
ok(Object.values(DOMAIN_QUESTIONS).every((q) => !/password/i.test(q)), "no question asks for a password");
ok(DOMAIN_QUESTIONS.authority.startsWith("I have checked that my business is entitled to replace or move its current website") && DOMAIN_QUESTIONS.dns.startsWith("I authorise Findable to connect") && DOMAIN_QUESTIONS.materials.startsWith("I have the right to provide Findable"), "the three confirmations are Paul's wording");

/* ── PAID CLIENTS ── */
const lead: HandoffLead = { business_name: "QA", phone: "0770", website: "https://qa.example", amount_paid: 99, status: "payment_received", delivery_checklist: { gbp_access: true } };
const ob: HandoffOnboarding = { services_list: ["x"], areas_list: ["y"], business_website: "https://qa.example", website_route: "rebuild_existing", website_manager: "web_company", website_addon: true,
  domain_status: "existing", domain_owned: "yes", domain_access: "agency", domain_third_party: "no", authority_confirmed: true, dns_permission: true, materials_confirmed: true, site_rights: "no" };
{
  const r = handoffReadiness(lead, ob, { crawl: true, hookAudit: true });
  ok(r.ready && r.domain.label === "DOMAIN READY", "Paid Clients: agency-managed but client-owned domain, all confirmed → READY TO START");
  const bad = handoffReadiness(lead, { ...ob, domain_third_party: "yes" }, { crawl: true, hookAudit: true });
  ok(!bad.ready && bad.missing.includes("Domain / authority") && bad.domain.label === "DOMAIN / AGENCY ISSUE", "a third-party-owned domain → MISSING INFORMATION: Domain / authority (DOMAIN / AGENCY ISSUE)");
  ok(/A third party owns or controls the domain/.test(bad.items.find((i) => i.key === "domain")!.detail), "…with the reason");
  const optimise = handoffReadiness(lead, { ...ob, website_route: "optimise_existing", website_addon: false, website_manager: "direct_access", domain_owned: null, domain_access: null, domain_third_party: null, dns_permission: null, materials_confirmed: null, authority_confirmed: null }, { crawl: true, hookAudit: true });
  ok(optimise.ready && optimise.domain.label === "NOT NEEDED", "optimising their own site → the domain rule does not block READY");
  const none = handoffReadiness({ ...lead, services_included: ["x"], service_areas: ["y"], website_control: "client_controls" }, null, { crawl: true, hookAudit: true });
  ok(!none.ready && none.missing.includes("Domain / authority"), "no onboarding at all → never READY (the client's own confirmation is required; Sales data cannot satisfy it)");
  const ended = handoffReadiness({ ...lead, service_terminated_at: "2026-09-28T00:00:00Z" }, ob, { crawl: true, hookAudit: true });
  ok(!ended.ready && ended.missing.includes("Service active"), "a terminated service is never READY");
}

/* ── WHERE IT IS ENFORCED ── */
{
  const onb = read("supabase/functions/findable-onboarding/index.ts");
  for (const col of ["domain_owned", "domain_access", "domain_third_party", "site_rights", "authority_confirmed", "dns_permission", "materials_confirmed", "domain_escalated_at"]) {
    const inAnswers = new RegExp(`\\n\\s+${col}:`).test(onb);
    const lists = (onb.match(new RegExp(`"${col}"`, "g")) ?? []).length;
    ok(inAnswers && lists >= 2, `findable-onboarding saves ${col} (answers + NEWER_COLS + optional)`);
  }
  const co = read("supabase/functions/findable-checkout/index.ts");
  ok(/const domain = domainAuthority\(domainInputFromRow\(ob as DomainRow\)\);\s*if \(domain\.applies && !domain\.ready\)/.test(co) && /error: "domain_unresolved"/.test(co), "checkout refuses a new-site payment whose domain / authority is unresolved (server-side, from the row)");
  ok(co.indexOf("checkout_refused_row_already_paid") < co.indexOf("domain_unresolved"), "…after the already-paid checks (an existing client is never re-gated)");
  const rr = read("supabase/functions/_shared/remeasure-results.ts");
  ok(/if \(lead\.service_terminated_at\) return \{ kind: "skipped"/.test(rr), "no 'the guarantee applies' results email after Findable ends the service for a dispute");
  ok(/\.is\("service_terminated_at", null\)/.test(read("supabase/functions/_shared/audit-baseline.ts")), "…and no guarantee re-measure is fired for it");
  const hub = read("supabase/functions/paid-client-hub/index.ts");
  ok(/if \(action === "terminate_service"\)/.test(hub) && /requireAdmin\(req/.test(hub), "ending the service is an admin action (paid-client-hub is requireAdmin)");
  const term = hub.slice(hub.indexOf('if (action === "terminate_service")'), hub.indexOf("SECTION 5 — WEBSITE BUILD"));
  ok(/body\.confirm !== true/.test(term) && /note\.length < 10/.test(term) && /\.is\("service_terminated_at", null\)/.test(term), "…with an explicit confirm, a written note, once only");
  ok(!/stripe|api\.stripe\.com|subscriptions|refunds/i.test(term.replace(/stripe_subscription_id|Stripe/g, "")), "…and it never calls Stripe: no charge, cancel or refund — it emails Paul to cancel the subscription");
  ok(/Cancel their subscription in Stripe now/.test(term) && /the £99 is not refunded for this reason/.test(term), "…the alert tells Paul to stop future billing and states the carve-out");
  const notify = read("supabase/functions/notify-onboarding-submit/index.ts");
  ok(/DOMAIN \/ AGENCY ISSUE/.test(notify) && /domain_escalated_at/.test(notify), "the questionnaire alert flags a domain issue and an escalation");
}

/* ── WEBSITE BUILD ── */
{
  const build = read("src/lib/buildExecution.ts");
  ok(/const use = approved\.filter\(\(a\) => a\.ownership === 'client_owned'\);/.test(build), "only CLIENT-OWNED approved assets are downloaded (visible on the site is not owned)");
  ok(/s\.rebuild_style !== 'new_design' && !mayPreserveCopy\(s\.copy_ownership\)/.test(build), "a faithful / modernised rebuild is blocked unless the client confirmed ownership / permission");
  ok(!/The client has authorised a rebuild of THIS site/.test(read("src/lib/recon.ts")), "recon no longer asserts an authorisation nobody recorded");
  void assetsToDownload; void executionBlockers;
}

/* ── SALES ── */
{
  const p = leadPermissions("sales");
  ok(!p.clientDelivery && !p.editLeadRecord && !p.crawlSite, "Sales gains no admin, payment or delivery permission");
  ok(DOMAIN_CONTROL_OPTIONS.map((o) => o.value).join() === "client_owns,client_owns_agency_manages,third_party_owns,unknown", "Sales records the four situations (A/B/C/D)");
  ok(/do not promise/i.test(DOMAIN_CONTROL_OPTIONS[2].guidance) && /don't guess/i.test(DOMAIN_CONTROL_OPTIONS[3].guidance), "C → promise nothing and flag to Paul; D → don't guess");
  ok(/normally fine/.test(SALES_DOMAIN_LINE) && /owns or controls the domain/.test(SALES_DOMAIN_LINE), "the suggested sales line");
  const play = read("src/lib/coldCallPlaybook.ts");
  ok(!/talk about moving it to our hosting or a rebuild/.test(play) && /My agency controls the website \/ domain/.test(play) && /we would never ask you to break it/.test(play), "call script: no rebuild promise, an agency objection, never 'break your contract'");
  ok(/promise a new website or a switch-over before they have said their business owns or controls the domain/.test(read("src/lib/warmReply.ts")), "the reply drafter may not promise a new site before the domain is confirmed");
  const mig = read("supabase/migrations/20260928180000_domain_authority.sql");
  ok(/function public\.lead_set_domain_control[\s\S]*?perform public\._require_work\(_lead_id\);/.test(mig) && /revoke all on function public\.lead_set_domain_control\(uuid, text\) from public, anon;/.test(mig), "lead_set_domain_control: own leads only, anon refused");
  const view = mig.slice(mig.indexOf("create or replace view public.sales_leads"), mig.indexOf("from public.outreach_leads l"));
  ok(!/service_terminat|stripe|sold_by/.test(view), "the sales view gains the domain situation only — no termination, Stripe or sale data");
}

/* ── THE QUESTIONNAIRE ALERT (2026-09-28): the domain questions are pre-payment; only the platform is later ── */
{
  const notify = read("supabase/functions/notify-onboarding-submit/index.ts");
  const gate = read("src/lib/serveGate.ts");
  ok(!/Website questions not asked yet/.test(gate + notify) && /Website platform not known yet — that question comes after payment/.test(gate), "no alert says the website questions come after payment");
  ok(notify.includes('line("Website platform:", siteLine)') && notify.includes("<strong>Website platform:</strong>") && !notify.includes('"Site:"'), "the alert says Website platform:, never Site: a platform they did not say");
  ok(notify.includes('"not provided yet (asked after payment)"'), "an unknown platform reads: not provided yet (asked after payment)");
  ok(notify.includes('line("Domain:", domainLine)') && notify.includes('"Answered — DOMAIN READY"') && notify.includes('"Answered — DOMAIN / AGENCY ISSUE (see NEEDS YOU)"'), "the alert summarises the domain answers");
}

/* ── ONE RULE, BOTH REPOS ── */
ok(/SAME_FILES = \[\s*\{ what: "the domain ownership \/ authority rule"/.test(read("scripts/check-cross-repo-sync.mjs")), "check-cross-repo-sync holds domainAuthority.ts byte-identical across both repos");

if (f) { console.log(`\n${f} FAILURES`); process.exit(1); }
console.log("\nALL PASS");
