/* ════════════════════════════════════════════════════════════════════════════════════════════════
   QUICK CLOSE (Sales Experience, 2026-09-29; docs/sales-experience.md §9). Pins the rules (src/lib/quickClose.ts)
   and the shape of fn quick-close / the webhook handoff. The live proof: supabase/tests/quick-close.sql
   (rolled back) and the live run recorded in the doc.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import {
  cleanAnswers, missingQuestions, mayGenerateLink, onboardingColumnsFor, quickCloseGate, quickCloseHandoffLines, quickCloseMessage,
  quickCloseState, LINK_REUSE_MS, QUICK_CLOSE_QUESTIONS, quickCloseScript, QUICK_CLOSE_AFTER_PAYMENT, QUICK_CLOSE_PROMISE,
} from "../src/lib/quickClose.ts";
import { FINDABLE_GUARANTEE, FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP } from "../src/lib/findableOffer.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

/* 2026-09-29: the website route is a required answer (service-route-terms.test.ts pins it). */
const SAFE = { decision_maker: "yes", domain: "yes", manager: "owner", access: "yes", route: "optimise" } as const;

console.log("\n── the bare minimum ──");
ok(QUICK_CLOSE_QUESTIONS.length === 7 && QUICK_CLOSE_QUESTIONS[5].key === "route" && QUICK_CLOSE_QUESTIONS[6].key === "build_consents", "five questions, the website route and the Build-only consents (2026-09-29), nothing else before payment");
/* The Build consents' own wording (their `detail`) is a confirmation, not a collection, so it is not scanned. */
ok(!/service|opening hours|credential|description|photo|google business/i.test(JSON.stringify(QUICK_CLOSE_QUESTIONS.map((q) => ({ key: q.key, text: q.text, options: q.options })))), "no services, hours, credentials, copy, images or GBP questions before payment");
ok(JSON.stringify(cleanAnswers({ decision_maker: "yes", domain: "maybe", evil: "x" })) === JSON.stringify({ decision_maker: "yes" }), "only known answers survive");
ok(missingQuestions({}).join() === "decision_maker,domain,manager,access,authority,route", "nothing answered: everything missing, the route included");
ok(missingQuestions(SAFE).length === 0, "owner-managed site: the authority question does not apply");
ok(missingQuestions({ ...SAFE, manager: "agency" }).includes("authority") && missingQuestions({ ...SAFE, manager: "agency", authority: "not_applicable" }).includes("authority"), "agency-managed: authority must be answered ('not applicable' does not answer it)");
ok(missingQuestions({ decision_maker: "yes", domain: "no_domain", manager: "no_website", route: "build", build_consents: "yes" }).length === 0, "no website: access and authority do not apply");

console.log("\n── the gate ──");
{
  const g = quickCloseGate({ ...SAFE, decision_maker: "no" });
  ok(g.blocked && quickCloseState("answers_saved", { answers: { ...SAFE, decision_maker: "no" } }) === "blocked" && !mayGenerateLink("answers_saved", { answers: { ...SAFE, decision_maker: "no" } }), "decision maker 'No' blocks payment");
  ok(quickCloseGate(SAFE).review.length === 0 && quickCloseState("answers_saved", { answers: SAFE }) === "ready" && mayGenerateLink("answers_saved", { answers: SAFE }), "safe answers → ready for payment");
  ok(quickCloseState("answers_saved", { answers: { decision_maker: "yes", domain: "no_domain", manager: "no_website", route: "build", build_consents: "yes" } }) === "ready", "no domain + no website is a normal, safe route (they register a domain)");
  ok(quickCloseState("answers_saved", { answers: { ...SAFE, manager: "agency", authority: "yes" } }) === "ready", "an agency that manages the site is fine when the client has authority");
  for (const [label, a, reason] of [
    ["agency + no authority", { ...SAFE, manager: "agency", authority: "no" }, "third_party_no_authority"],
    ["third party + authority unsure", { ...SAFE, manager: "third_party", authority: "not_sure" }, "third_party_authority_unsure"],
    ["domain not owned", { ...SAFE, domain: "no" }, "domain_not_owned"],
    ["domain unsure", { ...SAFE, domain: "not_sure" }, "domain_unsure"],
    ["manager unsure", { ...SAFE, manager: "not_sure", authority: "yes" }, "manager_unsure"],
    ["no site access", { ...SAFE, access: "no" }, "no_site_access"],
  ] as const) {
    const g2 = quickCloseGate(a);
    ok(g2.review.includes(reason as never) && quickCloseState("answers_saved", { answers: a }) === "needs_review" && !mayGenerateLink("answers_saved", { answers: a }), `${label} → DOMAIN / AGENCY ISSUE, Paul review (never silently safe)`);
  }
  const flagged = { ...SAFE, domain: "not_sure" } as const;
  ok(quickCloseState("answers_saved", { answers: flagged, review_approved_at: "2026-09-29T10:00:00Z" }) === "ready", "…Paul can release it, so the opportunity is kept");
  ok(quickCloseState("answers_saved", { answers: { decision_maker: "yes" } }) === "in_progress" && quickCloseState(null, null) === "not_started", "partial answers: in progress; nothing: not started");
  const recent = new Date(Date.now() - 3_600_000).toISOString();
  ok(quickCloseState("answers_saved", { answers: SAFE, link_url: "https://x", link_generated_at: recent }) === "link_generated" && quickCloseState("paid", { answers: SAFE }) === "paid", "link generated (and still usable); the row's own paid status is Paid");
  ok(quickCloseState("answers_saved", { answers: SAFE, link_url: "https://x", link_generated_at: "2026-09-29T10:00:00Z" }) === "link_expired", "2026-10-04 (M-014): an old stored link is EXPIRED, never 'ready'");
  ok(LINK_REUSE_MS < 24 * 3_600_000, "a link is reused only while its Stripe session is still valid (under 24h)");
}

console.log("\n── one onboarding record: the canonical columns ──");
ok(JSON.stringify(onboardingColumnsFor({ domain: "yes", manager: "owner", access: "yes" })) === JSON.stringify({ domain_status: "existing", domain_owned: "yes", website_manager: "direct_access" }), "owner + access → the columns the self-service form writes");
ok(onboardingColumnsFor({ domain: "no_domain", manager: "no_website" }).domain_status === "new" && onboardingColumnsFor({ manager: "no_website" }).website_platform === "no_website", "no domain / no website map to the same values the checkout gates read");
ok(onboardingColumnsFor({ manager: "agency", authority: "yes" }).website_manager === "web_company" && onboardingColumnsFor({ manager: "agency", authority: "yes" }).authority_confirmed === true, "agency → web_company; authority confirmed");
ok(onboardingColumnsFor({ authority: "not_sure" }).authority_confirmed === undefined, "'not sure' never writes a yes");

console.log("\n── the words ──");
const QUICK_CLOSE_SCRIPT = quickCloseScript("build") + " " + quickCloseScript("optimise");
ok([quickCloseScript("build"), quickCloseScript("optimise")].every((s) => s.includes(`£${FINDABLE_SETUP_PRICE_GBP} today`) && s.includes(`£${FINDABLE_MONTHLY_GBP} a month`)), "the script names both figures on every route (house rule: never one without the other)");
ok(quickCloseScript(null) === "", "2026-10-04 (A-07): no script before a route is chosen — it would name no terms");
const msg = quickCloseMessage("ABC Plumbing", "https://checkout.stripe.com/c/pay/x", "build");
ok(msg.includes("https://checkout.stripe.com/c/pay/x") && msg.includes(`£${FINDABLE_MONTHLY_GBP} a month`), "the WhatsApp / copy message carries the link and both figures");
/* 2026-10-04 (M-011, Paul's brief): the guarantee IS said before payment — but only as the approved
   sentences (the headline + the byte-locked FINDABLE_GUARANTEE), and nothing that promises an outcome
   the engines decide: no ranking, no recommendation, no citation, no "guaranteed". */
ok(!/guaranteed|rank|top of|recommend|cited|citation|will name you|be named/i.test(QUICK_CLOSE_SCRIPT + msg + QUICK_CLOSE_AFTER_PAYMENT.join(" ")), "no promised ranking, recommendation or citation; no 'guaranteed'");
ok([quickCloseScript("build"), quickCloseScript("optimise"), msg].every((s) => s.includes(QUICK_CLOSE_PROMISE) && s.includes(FINDABLE_GUARANTEE)), "the guarantee is said, exactly as written, in the script and the message");

console.log("\n── the handoff ──");
{
  const lines = quickCloseHandoffLines({ qc: { answers: { ...SAFE, domain: "not_sure" }, completed_at: "2026-09-29T10:00:00Z", review_approved_at: "2026-09-29T11:00:00Z", review_note: "Domain is theirs" }, closedBy: "Test", campaign: "Plumbers", leadSource: "linkedin", contact: { name: "Bob", email: "b@x.invalid" }, latestNote: "Wants it done by Friday", latestMessages: [{ direction: "inbound", body: "Yes send it" }] })!;
  const t = lines.join("\n");
  ok(/QUICK CLOSE by Test on 2026-09-29/.test(t) && /Owns \/ controls domain: Not sure/.test(t) && /DOMAIN \/ AGENCY ISSUE/.test(t) && /you released it: Domain is theirs/.test(t), "closer, answers and the domain flag (with Paul's release)");
  ok(/Contact: Bob · b@x\.invalid/.test(t) && /Campaign \/ source: Plumbers · linkedin/.test(t) && /Sales note: Wants it done by Friday/.test(t) && /Them: Yes send it/.test(t) && /Still to collect after payment/.test(t), "contact, campaign/source, sales note, latest conversation, what is still missing");
  ok(quickCloseHandoffLines({ qc: null, closedBy: null, campaign: null, leadSource: null, contact: {}, latestNote: null, latestMessages: [] }) === null, "no Quick Close: the PAID email is unchanged");
}

console.log("\n── source: security, the canonical checkout, idempotency ──");
const fn = read("supabase/functions/quick-close/index.ts");
ok(/const \[access, all\] = await Promise\.all\(\[leadAccess\(service, actor, leadId\)/.test(fn) && /if \(!access\.ok\) return json\(\{ ok: false, error: "not_your_lead"/.test(fn), "only a lead the caller may work (leadAccess, server-side) — never another rep's");
ok(/lead\.sold_by_user_id === actor\.id \|\| lead\.assigned_to_user_id === actor\.id/.test(fn) && /row\?\.status === "paid"/.test(fn), "after payment the seller may still SEE the outcome (read-only)");
ok(/functions\/v1\/findable-checkout/.test(fn) && /body: JSON\.stringify\(\{ onboarding_id: rowId, lead_id: leadId \}\)/.test(fn), "the link is the EXISTING findable-checkout, sent only the row and the lead");
ok(!/price|unit_amount|amount|discount|coupon|line_items/i.test(fn.slice(fn.indexOf('if (mode === "generate_link")'))), "nothing in the link path can set a price, amount, discount or line item");
ok(/const step = linkStep\(row!\.status, qc\); \/\/ the gate, re-checked before any Stripe call/.test(fn) && /if \(step\.kind === "refuse"\)/.test(fn), "the server re-checks the gate before any Stripe call (blocked / review / incomplete refused)");
/* 2026-10-04: the claim RPC was replaced by rev-conditional writes (writeQc); quick-close-links.test.ts drives it. */
ok(/if \(step\.kind === "reuse"\) \{\s*await event\(service, leadId, rowId, actor\.id, "link_reused"/.test(fn) && /link_claimed_at: new Date\(\)\.toISOString\(\), link_claimed_by: actor\.id/.test(fn), "a double click reuses the usable link / waits on the claim — one Stripe session");
ok(/service\.rpc\("quick_close_row"/.test(fn), "one onboarding row per lead, via the locked find-or-create");
ok(/approve_review/.test(fn) && /if \(actor\.role !== "admin"\) \{ await recordDenial/.test(fn), "only Paul releases a flagged Quick Close");
ok((fn.match(/await event\(service/g) ?? []).length >= 6, "every save / request / release / link / refusal is in the audit trail");
{
  const lib = read("src/lib/quickClose.ts");
  ok(/if \(changed\.length && cur\?\.link_url\)/.test(lib) && /if \(changed\.length && cur\?\.review_approved_at\)/.test(lib) && /planQuickCloseSave\(qcNow, rawIncoming/.test(fn), "changing an answer invalidates an old link and an old release (planQuickCloseSave, which fn quick-close runs)");
}
const mig = read("supabase/migrations/20260929160000_quick_close.sql");
ok(/pg_advisory_xact_lock\(hashtext\('quick_close:' \|\| _lead_id::text\)\)/.test(mig) && /revoke all on function public\.quick_close_row\(uuid, text\) from public, anon, authenticated/.test(mig), "find-or-create is locked and server-only");
ok(/revoke insert, update, delete on public\.quick_close_events from authenticated/.test(mig), "the audit trail cannot be edited from the browser");
const hook = read("supabase/functions/stripe-webhook/index.ts");
ok(/quickCloseHandoffLines\(\{/.test(hook) && /kind: "paid"/.test(hook) && /opts\.quickClose\?\.length/.test(hook), "payment → the audit trail records Paid and the PAID email carries the Quick Close handoff");
ok(/metadata\[lead_id\]/.test(read("supabase/functions/findable-checkout/index.ts")), "attribution survives checkout: the session carries the lead (sold_by is stamped from it at payment)");
ok(/\[functions\.quick-close\]\nverify_jwt = true/.test(read("supabase/config.toml")), "config.toml entry");

console.log("\n── where it lives, and the phone ──");
const dlg = read("src/components/QuickCloseDialog.tsx");
ok(/<QuickCloseButton leadId=\{lead\.id\}( variant="quiet")? \/>/.test(read("src/components/LeadDetailDialog.tsx")), "in the lead workspace (Outreach + WhatsApp Inbox; Focus Mode retired 2026-10-01)");
ok(/min-h-\[56px\]/.test(dlg) && /h-\[100dvh\]/.test(dlg) && /answers\.decision_maker === 'no' \? null/.test(dlg), "phone: full screen, one question at a time, big targets; a 'No' ends the questions");
ok(/mode: 'save', answers: \{ \[key\]: value \}/.test(dlg), "every tap is saved (a dropped call resumes)");
ok(/disabled=\{!v\.windowOpen/.test(dlg) && /functions\/v1\/send-whatsapp-message/.test(fn) && /Authorization: req\.headers\.get\("authorization"\)/.test(fn), "WhatsApp send uses the canonical sender AS THE CALLER (server-side since 2026-10-04) and respects the 24-hour window");
ok(/self-service sign-up link is still/.test(dlg), "the self-service onboarding link remains the fallback");

if (f) { console.log(`\n${f} FAILURES`); process.exit(1); }
console.log("\nALL PASS");
