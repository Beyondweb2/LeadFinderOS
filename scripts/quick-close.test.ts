/* ════════════════════════════════════════════════════════════════════════════════════════════════
   QUICK CLOSE (Sales Experience, 2026-09-29; docs/sales-experience.md §9). Pins the rules (src/lib/quickClose.ts)
   and the shape of fn quick-close / the webhook handoff. The live proof: supabase/tests/quick-close.sql
   (rolled back) and the live run recorded in the doc.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import {
  cleanAnswers, mergeAnswers, buildConsentsFor, BUILD_CONSENT_DOMAIN_PENDING, missingQuestions, mayGenerateLink, onboardingColumnsFor, quickCloseGate, quickCloseHandoffLines, quickCloseMessage,
  quickCloseState, LINK_REUSE_MS, QUICK_CLOSE_QUESTIONS, quickCloseScript, QUICK_CLOSE_AFTER_PAYMENT, QUICK_CLOSE_PROMISE,
} from "../src/lib/quickClose.ts";
import { FINDABLE_GUARANTEE, FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP } from "../src/lib/findableOffer.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

/* 2026-09-29: the website route is a required answer (service-route-terms.test.ts pins it).
   Sales workspace v2 (2026-10-05): the WEBSITE APPROACH is asked second and decides the route; only the
   questions that approach needs are asked. SAFE = improve their current site (Optimise) with access. */
const SAFE = { decision_maker: "yes", approach: "improve", access: "yes", manager: "owner" } as const;
const NEW_SITE = { decision_maker: "yes", approach: "new_template", domain: "yes", build_consents: "yes" } as const;

console.log("\n── the bare minimum, in the v2 order ──");
ok(QUICK_CLOSE_QUESTIONS[0].key === "decision_maker" && QUICK_CLOSE_QUESTIONS[1].key === "approach" && QUICK_CLOSE_QUESTIONS[QUICK_CLOSE_QUESTIONS.length - 1].key === "build_consents", "authority first, then what they want, the Build consents last");
/* The Build consents' own wording (their `detail`) is a confirmation, not a collection, so it is not scanned. The rights
   question names photos on purpose (the right to REUSE them), so it is scanned without that word. */
ok(!/service|opening hours|credential|description|google business/i.test(JSON.stringify(QUICK_CLOSE_QUESTIONS.map((q) => ({ key: q.key, text: q.text, options: q.options })))), "no services, hours, credentials, copy or GBP questions before payment");
ok(JSON.stringify(cleanAnswers({ decision_maker: "yes", domain: "maybe", evil: "x" })) === JSON.stringify({ decision_maker: "yes" }), "only known answers survive");
ok(missingQuestions({}).join() === "decision_maker,approach", "nothing answered: authority and the approach first — nothing about access or domains yet");
ok(missingQuestions({ decision_maker: "yes", approach: "improve" }).join() === "access,manager", "improve their site (Optimise): access and who manages it — NOT the domain");
ok(missingQuestions({ decision_maker: "yes", approach: "new_template" }).join() === "domain,build_consents", "new Findable site (Build): the domain and the consents — NEVER current-site access");
ok(missingQuestions({ decision_maker: "yes", approach: "refresh" }).join() === "rights,domain,build_consents", "visual refresh (Build): rights to reuse content, then the domain");
ok(missingQuestions({ decision_maker: "yes", approach: "recreation" }).join() === "rights,design_owner,domain,build_consents", "close recreation (Build): rights, who owns the design, then the domain");
ok(missingQuestions({ decision_maker: "yes", approach: "unsure" }).join() === "route", "unsure: the plan is picked explicitly before anything else");
ok(missingQuestions(SAFE).length === 0 && missingQuestions(NEW_SITE).length === 0, "both complete answer sets are complete");
ok(cleanAnswers({ approach: "improve", route: "build" }).route === "optimise" && cleanAnswers({ approach: "new_template", route: "optimise" }).route === "build", "a known approach DECIDES the route (prices unchanged)");
ok(cleanAnswers({ approach: "unsure", route: "build" }).route === "build", "unsure keeps the plan that was picked");

console.log("\n── the gate ──");
{
  const g = quickCloseGate({ ...SAFE, decision_maker: "no" });
  ok(g.blocked && quickCloseState("answers_saved", { answers: { ...SAFE, decision_maker: "no" } }) === "blocked" && !mayGenerateLink("answers_saved", { answers: { ...SAFE, decision_maker: "no" } }), "decision maker 'No' blocks payment");
  ok(quickCloseGate(SAFE).review.length === 0 && quickCloseState("answers_saved", { answers: SAFE }) === "ready" && mayGenerateLink("answers_saved", { answers: SAFE }), "Optimise with access → ready for payment");
  ok(quickCloseState("answers_saved", { answers: NEW_SITE }) === "ready", "a new Findable site with the domain theirs → ready");
  /* ⛔ THE SCREENSHOT FIX: a new site where they cannot give access to the old one is NOT a review. */
  const newNoAccess = { ...NEW_SITE, access: "no", manager: "agency" } as const;
  ok(quickCloseGate(newNoAccess).review.length === 0 && quickCloseState("answers_saved", { answers: newNoAccess }) === "ready", "Build + no access to the CURRENT site → no review, ready (we never need the old backend)");
  for (const d of ["not_sure", "agency", "no"] as const) {
    const a = { ...NEW_SITE, domain: d };
    const gd = quickCloseGate(a);
    ok(gd.review.length === 0 && gd.flags.includes("domain_handoff") && quickCloseState("answers_saved", { answers: { ...a } }) === "ready", `Build + domain "${d}" → a domain-handoff FLAG, not a review — still ready to pay`);
    ok(mergeAnswers(NEW_SITE, { domain: d }).build_consents === undefined && buildConsentsFor({ ...NEW_SITE, domain: d })[0] === BUILD_CONSENT_DOMAIN_PENDING, `…and consents read for a controlled domain are asked again, in the pending wording (domain "${d}")`);
  }
  for (const [label, a, reason] of [
    ["Optimise + no site access", { ...SAFE, access: "no" }, "no_site_access"],
    ["Optimise on an agency site, access not sure", { ...SAFE, manager: "agency", access: "not_sure" }, "optimise_access_unsure"],
    ["Optimise, agency + no authority (legacy answer)", { ...SAFE, manager: "agency", authority: "no" }, "third_party_no_authority"],
  ] as const) {
    const g2 = quickCloseGate(a);
    ok(g2.review.includes(reason as never) && quickCloseState("answers_saved", { answers: a }) === "needs_review" && !mayGenerateLink("answers_saved", { answers: a }), `${label} → WEBSITE ACCESS ISSUE, Paul review (never silently safe)`);
  }
  ok(quickCloseGate({ ...SAFE, domain: "not_sure" }).review.length === 0 && quickCloseGate({ ...SAFE, domain: "not_sure" }).flags.length === 0, "Optimise is never stopped (or flagged) over the domain — we edit the site in place");
  const flagged = { ...SAFE, access: "no" } as const;
  ok(quickCloseState("answers_saved", { answers: flagged, review_approved_at: "2026-09-29T10:00:00Z" }) === "ready", "…Paul can release it, so the opportunity is kept");
  ok(quickCloseState("answers_saved", { answers: { decision_maker: "yes" } }) === "in_progress" && quickCloseState(null, null) === "not_started", "partial answers: in progress; nothing: not started");
  const recent = new Date(Date.now() - 3_600_000).toISOString();
  /* 2026-10-05 (v3): only a SIGN-UP link is ever usable; a stored Stripe payment link reads expired. */
  ok(quickCloseState("answers_saved", { answers: SAFE, link_url: "https://x", link_generated_at: recent, link_kind: "signup" }) === "link_generated"
    && quickCloseState("answers_saved", { answers: SAFE, link_url: "https://checkout.stripe.com/c/pay/cs_x", link_generated_at: recent }) === "link_expired"
    && quickCloseState("paid", { answers: SAFE }) === "paid", "sign-up link generated (and still usable); a pre-v3 Stripe link is never ready; the row's own paid status is Paid");
  ok(quickCloseState("answers_saved", { answers: SAFE, link_url: "https://x", link_generated_at: "2026-09-29T10:00:00Z" }) === "link_expired", "2026-10-04 (M-014): an old stored link is EXPIRED, never 'ready'");
  ok(LINK_REUSE_MS < 24 * 3_600_000, "a link is reused only while its Stripe session is still valid (under 24h)");
  /* Recreation: rights unclear never blocks Build, never promises an exact copy. */
  const rec = { decision_maker: "yes", approach: "recreation", rights: "not_sure", design_owner: "agency", domain: "yes", build_consents: "yes" } as const;
  ok(quickCloseGate(rec).review.length === 0 && quickCloseGate(rec).flags.includes("exact_copy_rights") && quickCloseState("answers_saved", { answers: rec }) === "ready", "recreation with unclear rights → still sellable as Build, flagged for Paul");
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
  const lines = quickCloseHandoffLines({ qc: { answers: { ...SAFE, access: "no" }, completed_at: "2026-09-29T10:00:00Z", review_approved_at: "2026-09-29T11:00:00Z", review_note: "Client will add us" }, closedBy: "Test", campaign: "Plumbers", leadSource: "linkedin", contact: { name: "Bob", email: "b@x.invalid" }, latestNote: "Wants it done by Friday", latestMessages: [{ direction: "inbound", body: "Yes send it" }] })!;
  const t = lines.join("\n");
  ok(/QUICK CLOSE by Test on 2026-09-29/.test(t) && /Website approach: Improve their current website/.test(t) && /Can give site access: No/.test(t) && /WEBSITE ACCESS ISSUE/.test(t) && /you released it: Client will add us/.test(t), "closer, the approach, the answers and the access issue (with Paul's release)");
  const nl = quickCloseHandoffLines({ qc: { answers: { ...NEW_SITE, domain: "agency" } }, closedBy: "Test", campaign: null, leadSource: null, contact: {}, latestNote: null, latestMessages: [] })!.join("\n");
  ok(/FOR PAUL: Domain handoff to resolve before launch/.test(nl) && !/WEBSITE ACCESS ISSUE/.test(nl) && !/Can give site access/.test(nl), "a new site's domain handoff reaches Paul as a note — never as an access issue");
  ok(/Contact: Bob · b@x\.invalid/.test(t) && /Campaign \/ source: Plumbers · linkedin/.test(t) && /Sales note: Wants it done by Friday/.test(t) && /Them: Yes send it/.test(t) && /Still to collect after payment/.test(t), "contact, campaign/source, sales note, latest conversation, what is still missing");
  ok(quickCloseHandoffLines({ qc: null, closedBy: null, campaign: null, leadSource: null, contact: {}, latestNote: null, latestMessages: [] }) === null, "no Quick Close: the PAID email is unchanged");
}

console.log("\n── source: security, the canonical checkout, idempotency ──");
const fn = read("supabase/functions/quick-close/index.ts");
ok(/const \[access, all\] = await Promise\.all\(\[leadAccess\(service, actor, leadId\)/.test(fn) && /if \(!access\.ok\) return json\(\{ ok: false, error: "not_your_lead"/.test(fn), "only a lead the caller may work (leadAccess, server-side) — never another rep's");
ok(/lead\.sold_by_user_id === actor\.id \|\| lead\.assigned_to_user_id === actor\.id/.test(fn) && /row\?\.status === "paid"/.test(fn), "after payment the seller may still SEE the outcome (read-only)");
ok(/functions\/v1\/findable-checkout/.test(fn) && /body: JSON\.stringify\(\{ onboarding_id: rowId, lead_id: leadId, purpose: "signup_link" \}\)/.test(fn), "the link is the EXISTING findable-checkout, sent only the row, the lead and the sign-up purpose (v3: never a Stripe URL)");
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
ok(/<QuickClosePanel leadId=\{lead\.id\} active=\{tab === 'close'\} \/>/.test(read("src/components/LeadDetailDialog.tsx")) && /QuickCloseNav\.Provider value=\{\{ openClose: \(\) => goTab\('close'\) \}\}/.test(read("src/components/LeadDetailDialog.tsx")), "v2: in the lead workspace it IS the Close tab, and every Quick Close button there switches to it (one close UI)");
ok(/min-h-\[56px\]/.test(dlg) && /h-\[100dvh\]/.test(dlg) && /answers\.decision_maker === 'no' \? null/.test(dlg), "phone: full screen, one question at a time, big targets; a 'No' ends the questions");
ok(/mode: 'save', answers: \{ \[key\]: value \}/.test(dlg), "every tap is saved (a dropped call resumes)");
ok(/disabled=\{!v\.windowOpen/.test(dlg) && /functions\/v1\/send-whatsapp-message/.test(fn) && /Authorization: req\.headers\.get\("authorization"\)/.test(fn), "WhatsApp send uses the canonical sender AS THE CALLER (server-side since 2026-10-04) and respects the 24-hour window");
ok(/self-service sign-up link is on the lead's Close tab/.test(dlg) && /<OnboardingLinkCard lead=\{lead\} \/>/.test(read("src/components/LeadDetailDialog.tsx").slice(read("src/components/LeadDetailDialog.tsx").indexOf('value="close"'))), "the self-service onboarding link remains the fallback — on the Close tab, before payment");

if (f) { console.log(`\n${f} FAILURES`); process.exit(1); }
console.log("\nALL PASS");
