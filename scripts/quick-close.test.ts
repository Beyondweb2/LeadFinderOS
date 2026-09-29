/* ════════════════════════════════════════════════════════════════════════════════════════════════
   QUICK CLOSE (Sales Experience, 2026-09-29; docs/sales-experience.md §9). Pins the rules (src/lib/quickClose.ts)
   and the shape of fn quick-close / the webhook handoff. The live proof: supabase/tests/quick-close.sql
   (rolled back) and the live run recorded in the doc.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import {
  cleanAnswers, missingQuestions, mayGenerateLink, onboardingColumnsFor, quickCloseGate, quickCloseHandoffLines, quickCloseMessage,
  quickCloseState, LINK_REUSE_MS, QUICK_CLOSE_QUESTIONS, QUICK_CLOSE_SCRIPT, QUICK_CLOSE_AFTER_PAYMENT,
} from "../src/lib/quickClose.ts";
import { FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP } from "../src/lib/findableOffer.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const SAFE = { decision_maker: "yes", domain: "yes", manager: "owner", access: "yes" } as const;

console.log("\n── the bare minimum ──");
ok(QUICK_CLOSE_QUESTIONS.length === 5, "five questions, nothing else before payment");
ok(!/service|opening hours|credential|description|photo|google business/i.test(JSON.stringify(QUICK_CLOSE_QUESTIONS)), "no services, hours, credentials, copy, images or GBP questions before payment");
ok(JSON.stringify(cleanAnswers({ decision_maker: "yes", domain: "maybe", evil: "x" })) === JSON.stringify({ decision_maker: "yes" }), "only known answers survive");
ok(missingQuestions({}).join() === "decision_maker,domain,manager,access,authority", "nothing answered: everything missing");
ok(missingQuestions(SAFE).length === 0, "owner-managed site: the authority question does not apply");
ok(missingQuestions({ ...SAFE, manager: "agency" }).includes("authority") && missingQuestions({ ...SAFE, manager: "agency", authority: "not_applicable" }).includes("authority"), "agency-managed: authority must be answered ('not applicable' does not answer it)");
ok(missingQuestions({ decision_maker: "yes", domain: "no_domain", manager: "no_website" }).length === 0, "no website: access and authority do not apply");

console.log("\n── the gate ──");
{
  const g = quickCloseGate({ ...SAFE, decision_maker: "no" });
  ok(g.blocked && quickCloseState("answers_saved", { answers: { ...SAFE, decision_maker: "no" } }) === "blocked" && !mayGenerateLink("answers_saved", { answers: { ...SAFE, decision_maker: "no" } }), "decision maker 'No' blocks payment");
  ok(quickCloseGate(SAFE).review.length === 0 && quickCloseState("answers_saved", { answers: SAFE }) === "ready" && mayGenerateLink("answers_saved", { answers: SAFE }), "safe answers → ready for payment");
  ok(quickCloseState("answers_saved", { answers: { decision_maker: "yes", domain: "no_domain", manager: "no_website" } }) === "ready", "no domain + no website is a normal, safe route (they register a domain)");
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
  ok(quickCloseState("answers_saved", { answers: SAFE, link_url: "https://x", link_generated_at: "2026-09-29T10:00:00Z" }) === "link_generated" && quickCloseState("paid", { answers: SAFE }) === "paid", "link generated; the row's own paid status is Paid");
  ok(LINK_REUSE_MS < 24 * 3_600_000, "a link is reused only while its Stripe session is still valid (under 24h)");
}

console.log("\n── one onboarding record: the canonical columns ──");
ok(JSON.stringify(onboardingColumnsFor({ domain: "yes", manager: "owner", access: "yes" })) === JSON.stringify({ domain_status: "existing", domain_owned: "yes", website_manager: "direct_access" }), "owner + access → the columns the self-service form writes");
ok(onboardingColumnsFor({ domain: "no_domain", manager: "no_website" }).domain_status === "new" && onboardingColumnsFor({ manager: "no_website" }).website_platform === "no_website", "no domain / no website map to the same values the checkout gates read");
ok(onboardingColumnsFor({ manager: "agency", authority: "yes" }).website_manager === "web_company" && onboardingColumnsFor({ manager: "agency", authority: "yes" }).authority_confirmed === true, "agency → web_company; authority confirmed");
ok(onboardingColumnsFor({ authority: "not_sure" }).authority_confirmed === undefined, "'not sure' never writes a yes");

console.log("\n── the words ──");
ok(QUICK_CLOSE_SCRIPT.includes(`£${FINDABLE_SETUP_PRICE_GBP} today`) && QUICK_CLOSE_SCRIPT.includes(`£${FINDABLE_MONTHLY_GBP} a month`), "the script names both figures (house rule: never one without the other)");
const msg = quickCloseMessage("ABC Plumbing", "https://checkout.stripe.com/c/pay/x");
ok(msg.includes("https://checkout.stripe.com/c/pay/x") && msg.includes(`£${FINDABLE_MONTHLY_GBP} a month`), "the WhatsApp / copy message carries the link and both figures");
ok(!/guarantee|guaranteed|improve|rank|top of/i.test(QUICK_CLOSE_SCRIPT + msg + QUICK_CLOSE_AFTER_PAYMENT.join(" ")), "no promised result, no guaranteed improvement");

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
ok(/functions\/v1\/findable-checkout/.test(fn) && /body: JSON\.stringify\(\{ onboarding_id: row\.id, lead_id: leadId \}\)/.test(fn), "the link is the EXISTING findable-checkout, sent only the row and the lead");
ok(!/price|unit_amount|amount|discount|coupon|line_items/i.test(fn.slice(fn.indexOf('if (mode === "generate_link")'))), "nothing in the link path can set a price, amount, discount or line item");
ok(/if \(!mayGenerateLink\(row\.status, qc\)\)/.test(fn), "the server re-checks the gate before any Stripe call (blocked / review / incomplete refused)");
ok(/Date\.now\(\) - Date\.parse\(qc\.link_generated_at\) < LINK_REUSE_MS/.test(fn) && /quick_close_claim_link/.test(fn), "a double click reuses the link / waits on the claim — one Stripe session");
ok(/service\.rpc\("quick_close_row"/.test(fn), "one onboarding row per lead, via the locked find-or-create");
ok(/approve_review/.test(fn) && /if \(actor\.role !== "admin"\) \{ await recordDenial/.test(fn), "only Paul releases a flagged Quick Close");
ok((fn.match(/await event\(service/g) ?? []).length >= 6, "every save / request / release / link / refusal is in the audit trail");
ok(/if \(changed\.length && qc\?\.link_url\)/.test(fn) && /if \(changed\.length && qc\?\.review_approved_at\)/.test(fn), "changing an answer invalidates an old link and an old release");
const mig = read("supabase/migrations/20260929160000_quick_close.sql");
ok(/pg_advisory_xact_lock\(hashtext\('quick_close:' \|\| _lead_id::text\)\)/.test(mig) && /revoke all on function public\.quick_close_row\(uuid, text\) from public, anon, authenticated/.test(mig), "find-or-create is locked and server-only");
ok(/revoke insert, update, delete on public\.quick_close_events from authenticated/.test(mig), "the audit trail cannot be edited from the browser");
const hook = read("supabase/functions/stripe-webhook/index.ts");
ok(/quickCloseHandoffLines\(\{/.test(hook) && /kind: "paid"/.test(hook) && /opts\.quickClose\?\.length/.test(hook), "payment → the audit trail records Paid and the PAID email carries the Quick Close handoff");
ok(/metadata\[lead_id\]/.test(read("supabase/functions/findable-checkout/index.ts")), "attribution survives checkout: the session carries the lead (sold_by is stamped from it at payment)");
ok(/\[functions\.quick-close\]\nverify_jwt = true/.test(read("supabase/config.toml")), "config.toml entry");

console.log("\n── where it lives, and the phone ──");
const dlg = read("src/components/QuickCloseDialog.tsx");
ok(/<QuickCloseButton leadId=\{lead\.id\} \/>/.test(read("src/components/LeadDetailDialog.tsx")) && /<QuickCloseButton leadId=\{lead\.id\} size="lg" \/>/.test(read("src/pages/Focus.tsx")), "in the lead workspace (Outreach + WhatsApp Inbox) and Focus Mode");
ok(/min-h-\[56px\]/.test(dlg) && /h-\[100dvh\]/.test(dlg) && /answers\.decision_maker === 'no' \? null/.test(dlg), "phone: full screen, one question at a time, big targets; a 'No' ends the questions");
ok(/mode: 'save', answers: \{ \[key\]: value \}/.test(dlg), "every tap is saved (a dropped call resumes)");
ok(/disabled=\{!v\.windowOpen/.test(dlg) && /send-whatsapp-message/.test(dlg), "WhatsApp send uses the canonical sender and respects the 24-hour window");
ok(/self-service sign-up link is still/.test(dlg), "the self-service onboarding link remains the fallback");

if (f) { console.log(`\n${f} FAILURES`); process.exit(1); }
console.log("\nALL PASS");
