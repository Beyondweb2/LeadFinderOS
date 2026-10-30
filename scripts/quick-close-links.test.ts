/* ════════════════════════════════════════════════════════════════════════════════════════════════
   QUICK CLOSE — PRE-SALES FIX WORKSTREAM 2 (2026-10-04; docs/pre-sales-certification/fixes-02-quick-close.md).
   Run: npx tsx scripts/quick-close-links.test.ts

   Drives the decisions fn quick-close runs — planQuickCloseSave, linkStep, adoptLink, linkUsable,
   quickCloseState (src/lib/quickClose.ts) — through a small in-memory row that keeps the edge function's
   write rule: every write is conditional on the `rev` it read, and a loser re-reads and decides again.
   The SHELL below mirrors the function's loops; the source checks at the bottom pin that the function
   really calls these decisions, so what is tested here is what runs.

   Covers M-001 (Build cannot close), M-011 / M-012 (terms, consent wording), M-013 (link first),
   M-014 (stale / superseded links), M-015 (sharing), M-022 (false "not paid" alert), route integrity.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import {
  adoptLink, answersKey, buildConsentsFor, BUILD_CONSENT_NO_DOMAIN, BUILD_CONSENTS, cleanAnswers, LINK_CLAIM_MS, linkStep, linkUsable, linkUsableUntilMs, SIGNUP_LINK_LIFETIME_MS,
  closeFlow, mergeAnswers, missingQuestions, planQuickCloseSave, quickCloseEmail, quickCloseGreeting, quickCloseMessage, quickCloseScript, quickCloseState,
  QUICK_CLOSE_AGREEMENT_LINE, QUICK_CLOSE_PROMISE, QUICK_CLOSE_QUESTIONS, routeOwnershipLine, routeTermsLines, stripeSessionIdFromUrl,
  type QcRecord, type QuickCloseAnswers,
} from "../src/lib/quickClose.ts";
import { FINDABLE_GUARANTEE } from "../src/lib/findableOffer.ts";
import { ACTIVITY_LABEL, activityDetail } from "../src/lib/salesCrm.ts";
import { foldAdminOverview, type AdminInput, type AdminLead } from "../src/lib/adminMetrics.ts";
import { buildExclusions } from "../src/lib/metricExclusions.ts";
import { resolvePeriod } from "../src/lib/reportingPeriod.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

/* ── The in-memory row: the edge function's I/O rules, nothing else ─────────────────────────────── */
type Row = { status: string; quick_close: QcRecord | null; cols: Record<string, unknown> };
const REP = "rep-1";
let clock = Date.parse("2026-10-04T10:00:00Z");
const iso = () => new Date(clock).toISOString();
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
/** writeQc: conditional on the rev read; returns the stored record or null (someone wrote first). */
function writeQc(row: Row, expect: number | null, next: QcRecord, cols: Record<string, unknown> = {}): QcRecord | null {
  const cur = row.quick_close?.rev ?? null;
  if (cur !== expect) return null;
  const stored = { ...clone(next), rev: (expect ?? 0) + 1 };
  row.quick_close = stored; Object.assign(row.cols, cols);
  return stored;
}
/** mode save — the edge function's loop (route lock omitted: it is a database read, pinned by source below). */
function save(row: Row, answers: Record<string, string>, o: { expectRoute?: unknown; routeChange?: boolean; readAt?: QcRecord | null } = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const seen = attempt === 0 && o.readAt !== undefined ? o.readAt : clone(row.quick_close);
    const plan = planQuickCloseSave(seen, answers, { ...("expectRoute" in o ? { expectRoute: o.expectRoute } : {}), routeChangeConfirmed: o.routeChange === true, actorId: REP, nowIso: iso() });
    if (!plan.ok) return { ok: false as const, error: plan.error, detail: plan.detail };
    const stored = writeQc(row, seen?.rev ?? null, plan.next, plan.cols);
    if (!stored) continue;
    return { ok: true as const, plan, expired: plan.superseded };
  }
  return { ok: false as const, error: "busy", detail: "" };
}
/** 🔴 v3 (2026-10-05): findable-checkout answers Quick Close with the client's SIGN-UP LINK (their agreement
 *  page) — no Stripe session exists until the client has signed. `expired` still records any OLD Stripe
 *  session a sign-up link replaces (a pre-v3 stored payment link). */
let sessionSeq = 0;
const expired: string[] = [];
let checkoutCalls = 0;
const checkout = () => { checkoutCalls++; const n2 = ++sessionSeq; return { url: `https://findable.live/agree/${String(n2).padStart(64, 'a')}`, session: null as string | null, kind: 'signup' as const }; };
/** mode generate_link, split at the Stripe call so two tabs can interleave. */
function claim(row: Row): { kind: "refuse" | "reuse" | "wait" | "claimed"; key?: string; state?: string } {
  const qc = clone(row.quick_close);
  const step = linkStep(row.status, qc, clock);
  if (step.kind !== "claim") return { kind: step.kind, state: step.kind === "refuse" ? step.state : undefined };
  const stored = writeQc(row, qc?.rev ?? null, { ...(qc ?? {}), link_claimed_at: iso(), link_claimed_by: REP });
  return stored ? { kind: "claimed", key: answersKey(stored.answers) } : { kind: "wait" };
}
function adopt(row: Row, key: string, ours: { url: string; session: string | null; kind?: 'signup' }) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const fq = clone(row.quick_close);
    const a = adoptLink(row.status, fq, key, { ...ours, expiresIso: new Date(clock + SIGNUP_LINK_LIFETIME_MS).toISOString() }, REP, iso(), clock);
    if (a.kind !== "store") { if (ours.session) expired.push(ours.session); return a.kind; }
    if (!writeQc(row, fq?.rev ?? null, a.next)) continue;
    if (a.replaced) expired.push(a.replaced);
    return "stored";
  }
  return "busy";
}
function generate(row: Row) {
  const c = claim(row);
  if (c.kind !== "claimed") return c.kind;
  return adopt(row, c.key!, checkout());
}
const state = (row: Row) => quickCloseState(row.status, row.quick_close, clock);
/** The dialog's counter: questions shown for these answers, and how many are answered. */
function counter(a: QuickCloseAnswers) {
  /* v2: the questions on screen are closeFlow — only the ones this website approach needs. */
  const shown = closeFlow(a);
  return `${shown.filter((k) => a[k]).length}/${shown.length}`;
}
const newRow = (): Row => ({ status: "answers_saved", quick_close: null, cols: {} });

/* ═══ BUILD ═══════════════════════════════════════════════════════════════════════════════════════ */
console.log("── BUILD: one answer per call, exactly as the dialog sends them ──");
{
  // The bug, documented: cleaning the lone answer before the merge threw the consent away.
  ok(cleanAnswers({ build_consents: "yes" }).build_consents === undefined, "(the old bug) cleaning the single incoming answer drops build_consents — why the server must never do it");
  ok(mergeAnswers({ decision_maker: "yes", approach: "new_template", domain: "no_domain" }, { build_consents: "yes" }).build_consents === "yes", "mergeAnswers keeps the consent: it is merged OVER the saved set before the cross-answer rules run");

  const row = newRow();
  const steps: [string, string][] = [["decision_maker", "yes"], ["manager", "owner"], ["domain", "no_domain"], ["rights", "yes"], ["approach", "new_template"], ["payment_plan", "six"]];
  let route: unknown = null;
  for (const [k, v] of steps) {
    const r = save(row, { [k]: v }, { expectRoute: route });
    ok(r.ok, `save ${k}=${v} → saved`);
    route = cleanAnswers(row.quick_close?.answers).route ?? null;
  }
  const a4 = cleanAnswers(row.quick_close!.answers);
  /* 2026-10-07: Quick Close is QUICK — on Build (self-run / no site) the offer and authority are all it asks. */
ok(counter(a4) === "3/3" && state(row) === "ready" && missingQuestions(a4).length === 0, "Build: the situation answers and the plan → READY (no consent questions, no logins; the agreement and the onboarding form cover them)");
  ok(buildConsentsFor(a4)[0] === BUILD_CONSENT_NO_DOMAIN && !/own or control the domain/.test(buildConsentsFor(a4)[0]), "M-012: with No domain the first consent says they WILL register one — not that they own one");
  const r5 = save(row, { build_consents: "yes" }, { expectRoute: "build" });
  ok(r5.ok, "the final answer \"Yes — they confirm all three\" is accepted");
  const a5 = cleanAnswers(row.quick_close!.answers);
  ok(a5.build_consents === "yes" && counter(a5) === "3/3" && state(row) === "ready", "a legacy consent answer is still accepted and kept; still ready");
  ok((row.quick_close!.build_consents_confirmed as { wording: string; lines: string[] }).wording === "no_domain" && (row.quick_close!.build_consents_confirmed as { lines: string[] }).lines[0] === BUILD_CONSENT_NO_DOMAIN, "the stored consent records WHICH wording was read out");
  ok(row.cols.dns_permission === true && row.cols.materials_confirmed === true && row.cols.plan_tier === "new_site" && row.cols.website_addon === true, "the canonical columns the checkout reads: Build, DNS permission, materials");
  // Refresh = a new load of the stored row.
  const reloaded = clone(row.quick_close);
  ok(quickCloseState(row.status, reloaded, clock) === "ready" && counter(cleanAnswers(reloaded!.answers)) === "3/3", "refresh: still 3 of 3, still ready");
  // Double submit of the final answer.
  const rev = row.quick_close!.rev;
  const again = save(row, { build_consents: "yes" }, { expectRoute: "build" });
  ok(again.ok && again.plan.changed.length === 0 && state(row) === "ready" && row.quick_close!.rev === (rev ?? 0) + 1, "double-tapping the final answer is harmless: nothing changes, still ready");
  // Two taps that READ the same version: the second re-reads and re-applies instead of overwriting.
  const seen = clone(row.quick_close);
  save(row, { build_consents: "yes" }, { expectRoute: "build", readAt: seen });
  const raced = save(row, { build_consents: "yes" }, { expectRoute: "build", readAt: seen });
  ok(raced.ok && cleanAnswers(row.quick_close!.answers).build_consents === "yes", "a racing duplicate loses the version check, re-reads, and still lands on the same answers");
  // The link.
  ok(generate(row) === "stored" && state(row) === "link_generated" && linkUsable(row.quick_close, clock), "the sign-up link becomes available");
  ok(row.quick_close!.link_kind === "signup" && row.quick_close!.link_session_id === null && /^https:\/\/findable\.live\/agree\/[0-9a-f]{64}$/.test(String(row.quick_close!.link_url)) && stripeSessionIdFromUrl(row.quick_close!.link_url) === null, "v3: the link is the client's agreement page — no Stripe session exists before they sign");
}

/* ═══ v5: OPTIMISE IS WITHDRAWN (2026-10-16) ═══════════════════════════════════════════════════════ */
console.log("\n── v5: OPTIMISE can no longer be sold; an old close still reads and moves to Build ──");
/** A ready Build close, one answer per call (the dialog's order). */
const BUILD_STEPS = [["decision_maker", "yes"], ["manager", "owner"], ["domain", "yes"], ["rights", "yes"], ["route", "build"], ["payment_plan", "six"]] as const;
/** A close saved on Optimise BEFORE v5 — written straight onto the row (no save can produce one now). */
const optimiseV4Row = (): Row => ({ status: "answers_saved", cols: { plan_tier: "keep", website_addon: false }, quick_close: { answers: { decision_maker: "yes", manager: "owner", domain: "yes", rights: "yes", approach: "improve", route: "optimise", access: "yes" }, rev: 1 } as QcRecord });
{
  const row = newRow();
  for (const [k, v] of [["decision_maker", "yes"], ["manager", "owner"], ["domain", "yes"], ["rights", "yes"]] as const) ok(save(row, { [k]: v }).ok, `save ${k}=${v}`);
  const viaApproach = save(row, { approach: "improve" }, { expectRoute: null });
  ok(!viaApproach.ok && viaApproach.error === "route_withdrawn", "save approach=improve (the Optimise approach) → REFUSED out loud: route_withdrawn");
  const viaRoute = save(row, { route: "optimise" }, { expectRoute: null, routeChange: true });
  ok(!viaRoute.ok && viaRoute.error === "route_withdrawn" && !cleanAnswers(row.quick_close!.answers).route, "save route=optimise → REFUSED, even confirmed; nothing stored");
  const old = optimiseV4Row();
  ok(cleanAnswers(old.quick_close!.answers).route === "optimise" && state(old) === "in_progress" && missingQuestions(cleanAnswers(old.quick_close!.answers)).join() === "payment_plan", "a pre-v5 Optimise close still READS (no crash), is in progress, and is asked the plan again");
  ok(linkStep(old.status, old.quick_close, clock).kind === "refuse", "…and can never make a link");
  const keepAnswer = save(old, { domain: "yes" }, { expectRoute: "optimise" });
  ok(keepAnswer.ok, "an unrelated answer on that old close still saves (it is not refused for carrying the old plan)");
  const silent = save(old, { route: "build" }, { expectRoute: "optimise" });
  ok(!silent.ok && silent.error === "route_change_unconfirmed", "moving it to Build is a route change — asked, never a stray tap");
  const moved = save(old, { route: "build" }, { expectRoute: "optimise", routeChange: true });
  save(old, { payment_plan: "six" }, { expectRoute: "build" });
  ok(moved.ok && cleanAnswers(old.quick_close!.answers).route === "build" && old.cols.plan_tier === "new_site" && old.cols.website_addon === true && state(old) === "ready", "confirmed → Build: the row's columns follow and it is ready for the sign-up link");
}

/* ═══ PAYMENT LINK ════════════════════════════════════════════════════════════════════════════════ */
console.log("\n── PAYMENT LINK: one current link, stale links never 'ready' ──");
{
  const row = newRow();
  for (const [k, v] of BUILD_STEPS) save(row, { [k]: v });
  checkoutCalls = 0;
  ok(generate(row) === "stored" && generate(row) === "reuse" && checkoutCalls === 1, "double generation → one sign-up link, the second press reuses it");
  const first = row.quick_close!.link_url;

  // Two tabs press at the same moment: one claims, the other is told to wait for that link.
  const row2 = newRow();
  for (const [k, v] of BUILD_STEPS) save(row2, { [k]: v });
  checkoutCalls = 0;
  const tabA = claim(row2);
  const tabB = claim(row2);
  ok(tabA.kind === "claimed" && tabB.kind === "wait", "two tabs: the first claims, the second waits (no second link)");
  ok(adopt(row2, tabA.key!, checkout()) === "stored" && claim(row2).kind === "reuse" && checkoutCalls === 1, "…and then reuses the first tab's link");
  // A claim abandoned past LINK_CLAIM_MS is taken over; if both sessions come back, only one becomes THE link.
  const row3 = newRow();
  for (const [k, v] of BUILD_STEPS) save(row3, { [k]: v });
  const slow = claim(row3);
  clock += LINK_CLAIM_MS + 1000;
  const fast = claim(row3);
  ok(slow.kind === "claimed" && fast.kind === "claimed", "a stuck claim is taken over after LINK_CLAIM_MS");
  const sFast = checkout(); const sSlow = checkout();
  ok(adopt(row3, fast.key!, sFast) === "stored" && adopt(row3, slow.key!, sSlow) === "other_won", "both links came back: the first stored is THE link, the other is refused");
  ok(row3.quick_close!.link_url === sFast.url, "…the two tabs can never hold contradictory current links");

  // Stale link → never ready; a fresh one replaces it.
  clock += SIGNUP_LINK_LIFETIME_MS + 60_000;
  ok(!linkUsable(row.quick_close, clock) && state(row) === "link_expired", "a sign-up link past its lifetime is EXPIRED, not 'Agreement & payment link ready'");
  ok(linkStep(row.status, row.quick_close, clock).kind === "claim", "…so the next press makes a fresh one (it is not reused — every refusal re-runs)");
  ok(generate(row) === "stored" && row.quick_close!.link_url !== first && state(row) === "link_generated", "Make a fresh sign-up link: a new link is stored");
  /* 🔴 v3: a NAKED STRIPE LINK stored before the agreement-first flow is never handed over again, however
     fresh — the next press makes the sign-up link and closes that Stripe session. */
  const legacy: Row = { status: "answers_saved", cols: {}, quick_close: { ...clone(row.quick_close!), link_kind: null, link_url: "https://checkout.stripe.com/c/pay/cs_test_OLD#f", link_session_id: "cs_test_OLD", link_generated_at: new Date(clock - 60_000).toISOString(), link_expires_at: new Date(clock + 23 * 3_600_000).toISOString() } };
  ok(!linkUsable(legacy.quick_close, clock) && state(legacy) === "link_expired", "a stored Stripe payment link (pre-v3) is NOT usable, even one minute old");
  ok(generate(legacy) === "stored" && legacy.quick_close!.link_kind === "signup" && expired.includes("cs_test_OLD"), "…the next press stores the sign-up link and the old Stripe session is EXPIRED (no bypass of the agreement)");
  ok(!linkUsable({ link_url: "x", link_generated_at: "not a date", link_kind: "signup" }, clock) && !linkUsable(null, clock), "no link / an unreadable time is never usable (positive match)");
  const made = { link_kind: "signup" as const, link_url: "https://findable.live/agree/x", link_generated_at: new Date(clock - 2 * 3_600_000).toISOString(), link_expires_at: new Date(clock - 2 * 3_600_000 + SIGNUP_LINK_LIFETIME_MS).toISOString() };
  ok(linkUsableUntilMs(made) === clock - 2 * 3_600_000 + SIGNUP_LINK_LIFETIME_MS - 4 * 3_600_000, "the rep is told how long they may still send the sign-up link");
  ok(linkUsableUntilMs({ link_url: "https://checkout.stripe.com/c/pay/cs_test_Y", link_generated_at: new Date(clock).toISOString(), link_expires_at: new Date(clock + 22 * 3_600_000).toISOString() }) === null, "a Stripe link has no sending window at all under v3");

  // An answer changed while Stripe was making the session: that session is cancelled, nothing stored.
  const row4 = newRow();
  for (const [k, v] of BUILD_STEPS) save(row4, { [k]: v });
  const c4 = claim(row4);
  save(row4, { manager: "employee" });
  const s4 = checkout();
  ok(adopt(row4, c4.key!, s4) === "answers_changed" && !row4.quick_close!.link_url, "answers changed during generation → no link stored");
  // Paid while the session was being made.
  const row5 = newRow();
  for (const [k, v] of BUILD_STEPS) save(row5, { [k]: v });
  const c5 = claim(row5); row5.status = "paid";
  const s5 = checkout();
  ok(adopt(row5, c5.key!, s5) === "paid" && !row5.quick_close!.link_url, "paid meanwhile → no link stored");
  ok(linkStep("paid", row5.quick_close, clock).kind === "refuse", "a paid row never makes a link");
}

/* ═══ ROUTE ═══════════════════════════════════════════════════════════════════════════════════════ */
console.log("\n── ROUTE: only Build can be chosen; changes are deliberate ──");
{
  const row = newRow();
  for (const [k, v] of [["decision_maker", "yes"], ["manager", "owner"], ["domain", "yes"], ["rights", "yes"], ["approach", "unsure"], ["route", "build"], ["payment_plan", "six"], ["build_consents", "yes"]] as const) save(row, { [k]: v });
  generate(row);
  const buildSession = row.quick_close!.link_session_id as string;
  const sw = save(row, { route: "optimise" }, { expectRoute: "build", routeChange: true });
  ok(!sw.ok && sw.error === "route_withdrawn" && cleanAnswers(row.quick_close!.answers).route === "build" && !!row.quick_close!.link_url && buildSession === null, "v5: Build → Optimise is REFUSED even when confirmed; the route and the sign-up link stay");
  const stale = save(row, { domain: "agency" }, { expectRoute: "optimise" });
  ok(!stale.ok && stale.error === "stale_route", "a screen showing a different route than the saved one is refused (stale tab)");
  /* A pre-v5 Optimise close with Build consents never had them; moving it to Build asks nothing more on the call. */
  const back = optimiseV4Row();
  const b2 = save(back, { route: "build" }, { expectRoute: "optimise", routeChange: true });
  ok(b2.ok && cleanAnswers(back.quick_close!.answers).build_consents === undefined && missingQuestions(cleanAnswers(back.quick_close!.answers)).join() === "payment_plan", "an old Optimise close moved to Build: no consents carried over, nothing more is asked on the call but how they pay");
  const nosite = newRow();
  for (const [k, v] of [["decision_maker", "yes"], ["manager", "no_website"], ["domain", "no_domain"], ["approach", "unsure"]] as const) save(nosite, { [k]: v });
  const opt = save(nosite, { route: "optimise" }, { expectRoute: null });
  ok(!opt.ok && opt.error === "route_withdrawn", "no website + Optimise is refused out loud (the plan is withdrawn)");
  // Consents read with one domain situation do not survive a change to the other.
  const dom = newRow();
  for (const [k, v] of [["decision_maker", "yes"], ["manager", "owner"], ["domain", "no_domain"], ["rights", "yes"], ["approach", "new_template"], ["build_consents", "yes"]] as const) save(dom, { [k]: v });
  save(dom, { domain: "yes" }, { expectRoute: "build" });
  ok(cleanAnswers(dom.quick_close!.answers).build_consents === undefined && buildConsentsFor(cleanAnswers(dom.quick_close!.answers))[0] === BUILD_CONSENTS[0], "No domain → own a domain: the consents are asked again, with the standard wording");
  /* v2: the APPROACH moves the plan, so it is a route change too — confirmed, never a stray tap. */
  const ap = optimiseV4Row();
  const apSilent = save(ap, { approach: "new_template" }, { expectRoute: "optimise" });
  ok(!apSilent.ok && apSilent.error === "route_change_unconfirmed" && cleanAnswers(ap.quick_close!.answers).route === "optimise", "an old Optimise close: improve → a new site WITHOUT confirming is refused; still Optimise");
  const apSw = save(ap, { approach: "new_template" }, { expectRoute: "optimise", routeChange: true });
  ok(apSw.ok && cleanAnswers(ap.quick_close!.answers).route === "build" && missingQuestions(cleanAnswers(ap.quick_close!.answers)).join() === "payment_plan", "confirmed → Build; no domain / consent / site-access questions follow (2026-10-07) — only how they pay");
  const apRoute = save(ap, { route: "optimise" }, { expectRoute: "build", routeChange: true });
  ok(!apRoute.ok && apRoute.error === "route_withdrawn" && cleanAnswers(ap.quick_close!.answers).route === "build", "v5: once on Build it can never be moved back to Optimise");
  const fn = read("supabase/functions/quick-close/index.ts");
  ok(/if \(plan\.routeChange\)/.test(fn) && /lead\.contract_total_payments != null\) return json\(\{ ok: false, error: "route_locked"/.test(fn) && /from\("client_agreement_acceptances"\)/.test(fn) && /error: "route_lock_unreadable"[^\n]*503/.test(fn), "locked route: a contract or ANY agreement acceptance refuses a route change; an unreadable record refuses too (fails closed)");
  ok(/if \(row\.status === "paid"\) return json\(\{ ok: false, error: "already_paid"/.test(fn), "after payment nothing in Quick Close can change");
}

/* ═══ WORDS ═══════════════════════════════════════════════════════════════════════════════════════ */
console.log("\n── COMMERCIAL TERMS BEFORE THE LINK ──");
ok(/keep their existing website/.test(routeOwnershipLine("optimise")) && /plan ends/.test(routeTermsLines("optimise").join(" ")), "a pre-v5 Optimise client is still described correctly (history only — never sold)");
for (const route of ["build"] as const) {
  const n = 12;
  const terms = routeTermsLines(route).join(" | ");
  ok(terms.includes("£99 today") && terms.includes("£99 a month") && terms.includes(`${n} payments in total`) && terms.includes("(the minimum term)") && !/-month minimum/.test(terms), `${route}: the card says £99 today, £99 a month, ${n} payments (the minimum term), never "a ${n}-month minimum"`);
  const own = routeOwnershipLine(route);
  ok(route === "build" ? /builds, hosts and manages a new website/.test(own) && /website is theirs/.test(terms) : /keep their existing website/.test(own) && /stays theirs/.test(own) && /plan ends/.test(terms) && !/29\.99/.test(terms), `${route}: who owns the website is said; Build: theirs after the payments; Optimise: the plan ends, no £29.99`);
  const url = "https://findable.live/agree/" + "b".repeat(64);
  for (const [label, text] of [["script", quickCloseScript(route, "legacy_twelve")], ["message", quickCloseMessage("Bob Smith", url, route)], ["email", quickCloseEmail({ greetName: "Bob", businessName: "ABC Ltd", url, route, senderName: "Sumi" }).text]] as const) {
    ok(text.includes(`${n} payments in total`) && text.includes("(the minimum term)") && !/-month minimum/.test(text) && text.includes(QUICK_CLOSE_PROMISE) && text.includes(FINDABLE_GUARANTEE) && /read and sign the Client Service Agreement/.test(text) && !/tick to accept/.test(text), `${route} ${label}: payments, minimum term, the guarantee (exact) and signing the agreement before paying (v3)`);
    ok(!/guaranteed|rank|top of|recommend|cited|citation|week six/i.test(text), `${route} ${label}: no ranking / recommendation / citation promise, no "week six"`);
    ok(!/\([^)]*\(/.test(text), `${route} ${label}: no nested brackets (A-29)`);
  }
  ok(!quickCloseMessage(null, url, route).includes("6 payments") && !/optimise/i.test(quickCloseMessage(null, url, route)), `${route}: never names the withdrawn plan or its count`);
}
ok(quickCloseGreeting("Bob Smith") === "Hi Bob" && quickCloseGreeting("BRIAN SLATTERY PLUMBERS LIMITED") === "Hi BRIAN" && quickCloseGreeting(null) === "Hi" && quickCloseGreeting("07700 900000") === "Hi", "greets the contact's first name; never a phone number");
ok(quickCloseEmail({ greetName: null, businessName: "ABC Ltd", url: "u", route: "build", senderName: "Sumi" }).subject === "Your Findable Build sign-up link - ABC Ltd", "email subject names the route and the business");
ok(QUICK_CLOSE_AGREEMENT_LINE.includes("read and sign the Client Service Agreement") && /payment only opens after they sign/.test(QUICK_CLOSE_AGREEMENT_LINE), "the rep's card says the client signs before payment can open (v3)");
const dlg = read("src/components/QuickCloseDialog.tsx");
ok(/data-testid="qc-route-terms"/.test(dlg) && /QUICK_CLOSE_GUARANTEE_LINES\[0\]/.test(dlg) && /QUICK_CLOSE_AGREEMENT_LINE/.test(dlg) && /routeOwnershipLine\(sellRoute\)/.test(dlg), "the rep's card shows terms, ownership, guarantee and agreement tick");
ok(dlg.indexOf('data-testid="qc-route-terms"') < dlg.indexOf('data-testid="qc-handoff"') && dlg.indexOf('data-testid="qc-link"') < dlg.indexOf('data-testid="qc-handoff"'), "M-013: the terms and the link come BEFORE the handoff");
/* 2026-10-06 (Send to Paul): folded while the rep ANSWERS — it opens once the link is out, after payment, or when
   complete and not yet sent (the link card still comes first on screen, above). */
ok(/const openNow = !sent && \(v\.state === 'paid' \|\| v\.state === 'link_generated' \|\| v\.state === 'link_expired' \|\| h\.complete\);/.test(dlg) && /open=\{openNow\}/.test(dlg), "M-013: the handoff is folded while answering (opens once the link is out, after payment, or ready to send)");

/* ═══ SHARING ═════════════════════════════════════════════════════════════════════════════════════ */
console.log("\n── SHARING: copy, email, WhatsApp — each recorded, none overclaimed ──");
{
  const fn = read("supabase/functions/quick-close/index.ts");
  const share = fn.slice(fn.indexOf('if (mode === "share_link")'));
  ok(/if \(!linkUsable\(qc\)\) return json\(\{ ok: false, error: "link_expired"/.test(share), "an expired link cannot be shared (server refuses)");
  ok(/channel === "copy"/.test(share) && /Sign-up link copied \(to send by hand — not confirmed as sent\)/.test(share), "copy is recorded as COPIED, never as sent");
  ok(/checkSuppressed\(service, \{ email: to, leadId \}\)/.test(fn) && /qaEmailHold\(service, leadId, to\)/.test(fn) && /api\.resend\.com\/emails/.test(fn) && /quick_close_link_email_failed/.test(fn), "email: do-not-contact check, QA guard (fails closed), Resend, failure recorded");
  ok(/reply_to: FINDABLE_CONTACT_EMAIL/.test(fn), "a reply to the email reaches Findable");
  ok(/decideLinkRoute\(await conversation\(\), \{ template: tplState \}\)/.test(share) && /if \(lr\.route === "none"\) return json\(\{ ok: false, error: lr\.reason/.test(share) && /functions\/v1\/send-whatsapp-message/.test(share) && /Authorization: req\.headers\.get\("authorization"\)/.test(share), "WhatsApp: only the approved template or a replied open conversation (paymentLinkRoute), through the canonical sender AS THE CALLER");
  ok(/if \(!res\.ok \|\| !out\.ok\) \{[\s\S]{0,200}"link_share_failed"/.test(share) && /share\.status = out\.simulated \? "simulated"/.test(share), "a failed WhatsApp is not recorded as sent; a test-mode one says so");
  ok(/kind: "payment_link_shared"/.test(share) && /"link_shared", \{ channel/.test(share), "every share writes History and the audit trail");
  ok(ACTIVITY_LABEL.payment_link_shared === "Sign-up link" && activityDetail({ kind: "payment_link_shared", body: "Sign-up link emailed to a@b.co" }, () => "x") === "Sign-up link emailed to a@b.co", "History shows how the link was shared");
  ok(/v\.share\?\.email && <Button[^\n]*data-testid="qc-send-email"/.test(dlg) && /data-testid="qc-send-whatsapp"/.test(dlg) && /data-testid="qc-link-fallback"/.test(dlg) && /data-testid="qc-share-availability"/.test(dlg) && /data-testid="qc-share-history"/.test(dlg), "the screen says which ways are available (one-click WhatsApp, or the honest fallback) and shows what was shared, when");
  ok(/Make a fresh agreement &amp; payment link|Make a fresh agreement & payment link/.test(dlg) && /Copy link/.test(dlg) && /url: usable \? cur\.link_url : null/.test(fn), "COPY SIGN-UP LINK is the primary action; an expired link offers a fresh one and its URL is never sent to the screen");
  const mig = read("supabase/migrations/20261006020000_quick_close_link_sharing.sql");
  ok(/'link_shared', 'link_share_failed', 'link_superseded'/.test(mig) && /'payment_link_shared'/.test(mig) && /if not \(v = any\(v_vals\)\)/.test(mig), "migration widens both checks from their LIVE definition (never clobbers another workstream's kinds)");
  ok(/\.in\("kind", \["link_generated", "link_reused", "link_shared"\]\)/.test(read("supabase/functions/_shared/earnings.ts")) && /e\.kind === 'link_shared' && e\.data\?\.variant === 'setup'/.test(read("src/lib/commission.ts")), "sharing the agreement link is not commission evidence (only a Full Setup send is, isSaleClosingEvent)");
}

/* ═══ REMINDERS / FALSE ALERTS ════════════════════════════════════════════════════════════════════ */
console.log("\n── M-022: starting a Quick Close is not 'submitted, not paid' ──");
{
  const notifier = read("supabase/functions/notify-onboarding-submit/index.ts");
  ok(notifier.includes(".or(`source.eq.free_check,and(created_at.lte.${cutoff},or(source.is.null,source.neq.quick_close))`)"), "the notifier never picks a Quick Close row (and keeps NULL-source self-service rows)");
  ok(/source, qc_link_at:quick_close->>link_generated_at/.test(read("supabase/functions/_shared/admin-overview-load.ts")), "the admin loader reads the source and when a Quick Close link was made");
  const NOW = Date.parse("2026-10-04T14:00:00Z");
  const p = (k: string) => resolvePeriod(k, NOW);
  const PAUL = "p0000000-0000-0000-0000-000000000001";
  const lead = (id: string): AdminLead => ({ id, business_name: id, created_at: "2026-09-01T10:00:00Z", added_by_user_id: PAUL, assigned_to_user_id: null, sold_by_user_id: null, sold_at: null, status: "new", amount_paid: null, is_potential_work: null, call_booked_at: null, whatsapp_sent_at: null, next_action: null, next_action_date: null, is_archived: false, phone: null, email: null, search_keyword: "plumber", category: null, payment_date: null, refunded_at: null, service_terminated_at: null, subscription_status: null, contract_total_payments: null, baseline_audit_id: null, remeasure_due_date: null, remeasure_audit_id: null } as AdminLead);
  const input: AdminInput = {
    period: p("30d"), today: p("today"), yesterday: p("yesterday"), week: p("week"), month: p("mtd"), nowMs: NOW, bookOwnerId: PAUL,
    people: [{ userId: PAUL, name: "Paul", role: "admin", excluded: false }], exclusions: buildExclusions([]),
    leads: [lead("QC-STARTED"), lead("QC-LINK-OLD"), lead("QC-LINK-NEW"), lead("SELF-SERVE")], messages: [], activity: [], suppressions: [], ledger: [],
    onboarding: [
      { lead_id: "QC-STARTED", status: "answers_saved", created_at: "2026-10-01T10:00:00Z", plan_tier: null, website_addon: null, source: "quick_close", qc_link_at: null },
      { lead_id: "QC-LINK-OLD", status: "answers_saved", created_at: "2026-10-01T10:00:00Z", plan_tier: "keep", website_addon: false, source: "quick_close", qc_link_at: "2026-10-02T10:00:00Z" },
      { lead_id: "QC-LINK-NEW", status: "answers_saved", created_at: "2026-09-20T10:00:00Z", plan_tier: "keep", website_addon: false, source: "quick_close", qc_link_at: "2026-10-04T12:00:00Z" },
      { lead_id: "SELF-SERVE", status: "submitted", created_at: "2026-10-02T10:00:00Z", plan_tier: "keep", website_addon: false, source: null },
    ],
    commissionLines: null, commissionTotals: null, commissionDueBySeller: new Map(), payoutsBySeller: new Map(),
    cost: { period: [], today: [], yesterday: [], week: [], month: [] },
  };
  const att = foldAdminOverview(input).attention.filter((i) => i.kind === "signup_unpaid");
  const by = (id: string) => att.find((i) => i.leadId === id);
  ok(!by("QC-STARTED"), "a Quick Close that was only STARTED (no link) never becomes 'Chase the sign-up'");
  ok(!by("QC-LINK-NEW"), "a Quick Close link made two hours ago is not chased (the clock is the LINK, not the first answer)");
  ok(!!by("QC-LINK-OLD") && /Quick Close sign-up link made 2 days ago and not paid/.test(by("QC-LINK-OLD")!.why), "a Quick Close link unpaid for days IS listed, named as Quick Close, timed from the link");
  ok(!!by("SELF-SERVE") && /Filled the sign-up 2 days ago/.test(by("SELF-SERVE")!.why), "self-service sign-ups are unchanged");
}

/* ═══ THE FUNCTION RUNS THESE DECISIONS ═══════════════════════════════════════════════════════════ */
console.log("\n── the edge function uses the tested decisions ──");
{
  const fn = read("supabase/functions/quick-close/index.ts");
  ok(/const plan = planQuickCloseSave\(qcNow, rawIncoming, \{/.test(fn) && /writeQc\(service, rowId, revOf\(qcNow\), next, patch\)/.test(fn), "save: planQuickCloseSave, then a rev-conditional write (retried on conflict)");
  ok(/const step = linkStep\(row!\.status, qc\)/.test(fn) && /const adopt = adoptLink\(/.test(fn) && /writeQc\(service, rowId, revOf\(fq\), adopt\.next\)/.test(fn), "link: linkStep → claim → Stripe → adoptLink → rev-conditional write");
  ok(/q\.is\("quick_close->>rev", null\) : q\.eq\("quick_close->>rev", String\(expect\)\)/.test(fn), "every quick_close write is conditional on its rev");
  ok(!/quick_close_claim_link/.test(fn) && !/cleanAnswers\(body\.answers\)/.test(fn), "no unconditional claim RPC and no cleaning of the lone incoming answer remain");
  ok(/sessions\/\$\{encodeURIComponent\(sessionId\)\}\/expire/.test(fn), "superseded sessions are expired at Stripe (POST /v1/checkout/sessions/:id/expire)");
  ok(/purpose: "signup_link"/.test(fn) && /out\.kind !== "signup_link"/.test(fn) && /kind: "signup" as const/.test(fn), "v3: Quick Close asks checkout for the SIGN-UP LINK and refuses anything else (never a Stripe URL)");
  ok(/\.or\("is_archived\.is\.null,is_archived\.eq\.false"\)/.test(fn), "M-008: an archived sale is not listed as owing a handoff");
}

if (f) { console.log(`\n${f} FAILURES`); process.exit(1); }
console.log("\nALL PASS");
