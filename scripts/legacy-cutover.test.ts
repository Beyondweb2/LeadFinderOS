/* ============================================================
   LEGACY PAYMENT BYPASS — closed (2026-10-05). Paul's rule: NO payment may be taken for a new v3 sale
   without the v3 agreement acceptance; the system fails closed.
   1. The cutover finds every still-payable legacy Findable object (open Checkout Sessions incl. Quick Close
      links already sent, active Findable Payment Links), never touches history or non-Findable objects,
      and executes ONLY the reviewed plan — against a FAKE Stripe.
   2. After the cutover there is no supported route in the code to a Stripe payment without v3 acceptance.
   3. The webhook BACKSTOP holds an unsigned payment: no Paid Client lifecycle, no subscription, no ledger
      (no commission) — and leaves historical payments alone.
   Run: npx tsx scripts/legacy-cutover.test.ts
   ============================================================ */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { buildCutoverPlan, classifyPaymentLink, classifySession, cutoverReportText, CUTOVER_CONFIRM_PHRASE, type StripePaymentLinkLite } from '../src/lib/legacyCutover.ts';
import { cutoverReport, executeCutover } from '../supabase/functions/_shared/legacy-cutover.ts';
import { checkoutAgreementGate, webhookV3Verdict, type GateAcceptance } from '../src/lib/signupGate.ts';
import { holdPayment } from '../supabase/functions/_shared/payment-hold.ts';
import { linkUsable, quickCloseState } from '../src/lib/quickClose.ts';
import { COMMERCIAL_TERMS_V3, COMMERCIAL_TERMS_V4 } from '../src/lib/clientTimeline.ts';
import { AGREEMENT_FIRST_TERMS } from '../src/lib/clientAgreement.ts';

let failures = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failures++; };
const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

/* ── a fake Stripe account holding every kind of object ── */
const sessions = [
  { id: 'cs_live_LEGACY_QC', status: 'open', created: 1, amount_total: 9900, metadata: { onboarding_id: 'OB-QC', lead_id: 'L-QC', agreement_version: 'v1' } },          // a Quick Close link already sent
  { id: 'cs_live_LEGACY_SELF', status: 'open', created: 2, amount_total: 9900, metadata: { onboarding_id: 'OB-SELF', lead_id: 'L-SELF' } },                              // self-service, pre-v3
  { id: 'cs_live_V3_SIGNED', status: 'open', created: 3, amount_total: 9900, metadata: { onboarding_id: 'OB-V3', lead_id: 'L-V3', commercial_terms: COMMERCIAL_TERMS_V3, agreement_version: 'v3', agreement_acceptance_id: 'A1' } },
  { id: 'cs_live_BARBER', status: 'open', created: 4, amount_total: 999, metadata: { generated_site_id: 'site-1' } },                                                     // another product
  { id: 'cs_live_LINK_SESSION', status: 'open', created: 5, amount_total: 4999, payment_link: 'plink_FOUNDER', metadata: {} },                                           // someone mid-way through the Payment Link
];
const links: Array<StripePaymentLinkLite & { line_items: StripePaymentLinkLite['line_items'] }> = [
  { id: 'plink_FOUNDER', active: true, url: 'https://buy.stripe.com/founder', metadata: {}, line_items: [{ description: 'AI visibility sprint (founder price)', price: { unit_amount: 4999, currency: 'gbp' } }] },
  { id: 'plink_99', active: true, url: 'https://buy.stripe.com/x99', metadata: {}, line_items: [{ description: 'Setup', price: { unit_amount: 9900, currency: 'gbp' } }] },
  { id: 'plink_BARBER', active: true, url: 'https://buy.stripe.com/barber', metadata: {}, line_items: [{ description: 'Barber website hosting only', price: { unit_amount: 999, currency: 'gbp' } }] },
  { id: 'plink_MYSTERY', active: true, url: 'https://buy.stripe.com/mystery', metadata: {}, line_items: [{ description: 'Consultation', price: { unit_amount: 2500, currency: 'gbp' } }] },
];
function fakeStripe(state: { sessions: typeof sessions; links: typeof links }) {
  const writes: string[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    const u = new URL(url); const p = u.pathname.replace('/v1/', '');
    const method = init?.method ?? 'GET';
    if (method === 'POST') {
      writes.push(p);
      const exp = /^checkout\/sessions\/([^/]+)\/expire$/.exec(p);
      if (exp) { const s = state.sessions.find((x) => x.id === exp[1]); if (s) s.status = 'expired'; return new Response('{}'); }
      const pl = /^payment_links\/([^/]+)$/.exec(p);
      if (pl) { const l = state.links.find((x) => x.id === pl[1]); if (l) l.active = false; return new Response('{}'); }
      return new Response('{"error":"unexpected"}', { status: 400 });
    }
    if (p === 'checkout/sessions') return new Response(JSON.stringify({ data: state.sessions.filter((s) => s.status === (u.searchParams.get('status') ?? s.status)), has_more: false }));
    if (p === 'payment_links') return new Response(JSON.stringify({ data: state.links.filter((l) => l.active).map(({ line_items: _li, ...l }) => l), has_more: false }));
    const li = /^payment_links\/([^/]+)\/line_items$/.exec(p);
    if (li) return new Response(JSON.stringify({ data: state.links.find((l) => l.id === li[1])?.line_items ?? [], has_more: false }));
    return new Response('{}', { status: 404 });
  };
  return { fetcher, writes };
}
function fakeDb(qc: Array<Record<string, unknown>>) {
  const inserted: Array<{ table: string; row: unknown }> = [];
  const chain = (table: string) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'not', 'limit', 'eq', 'is', 'in', 'order']) c[m] = () => c;
    c.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: table === 'onboarding_responses' ? qc : [], error: null }).then(res);
    c.maybeSingle = async () => ({ data: table === 'team_members' ? { user_id: 'paul' } : null, error: null });
    c.insert = async (row: unknown) => { inserted.push({ table, row }); return { error: null }; };
    c.upsert = async (row: unknown) => { inserted.push({ table, row }); return { error: null }; };
    c.update = (row: unknown) => { inserted.push({ table: table + ':update', row }); return c; };
    return c;
  };
  return { svc: { from: chain }, inserted };
}
const QC_ROWS = [
  { id: 'OB-QC', lead_id: 'L-QC', status: 'answers_saved', qc_url: 'https://checkout.stripe.com/c/pay/cs_live_LEGACY_QC#x', qc_session: 'cs_live_LEGACY_QC', qc_kind: null },
  { id: 'OB-OLD', lead_id: 'L-OLD', status: 'answers_saved', qc_url: 'https://checkout.stripe.com/c/pay/cs_live_GONE#x', qc_session: 'cs_live_GONE', qc_kind: null },   // its session already expired
  { id: 'OB-NEW', lead_id: 'L-NEW', status: 'answers_saved', qc_url: 'https://findable.live/agree/' + 'a'.repeat(64), qc_session: null, qc_kind: 'signup' },
  { id: 'OB-PAID', lead_id: 'L-PAID', status: 'paid', qc_url: 'https://checkout.stripe.com/c/pay/cs_live_PAID#x', qc_session: 'cs_live_PAID', qc_kind: null },        // history
];

async function main() {
  console.log('── CLASSIFICATION: only Findable sales paths, never history, never other products ──');
  ok(classifySession(sessions[0]) === 'findable_legacy' && classifySession(sessions[1]) === 'findable_legacy', 'an open pre-v3 Findable session (Quick Close or self-service) is LEGACY');
  ok(classifySession(sessions[2]) === 'findable_v3_signed', 'a signed v3 session is left alone');
  ok(classifySession(sessions[3]) === 'not_findable', 'a session of another product (no onboarding id) is never touched');
  ok(classifyPaymentLink(links[0]) === 'findable' && classifyPaymentLink(links[1]) === 'findable', 'a Payment Link named Findable, or charging a historic Findable first-payment price (£19.99 / £49.99 / £99), is FINDABLE');
  ok(classifyPaymentLink(links[2]) === 'not_findable', 'a Payment Link for another product is left alone');
  ok(classifyPaymentLink(links[3]) === 'unclassified', 'a Payment Link nobody can classify is REPORTED for Paul, never guessed');

  console.log('\n── THE REPORT (read-only) ──');
  const state = { sessions: structuredClone(sessions), links: structuredClone(links) };
  const { fetcher, writes } = fakeStripe(state);
  const db = fakeDb(QC_ROWS);
  const r = await cutoverReport(db.svc, { fetcher, secret: 'sk_test_fake' });
  ok(writes.length === 0 && db.inserted.length === 0, 'the report writes NOTHING (to Stripe or the database)');
  const ids = r.plan.expireSessions.map((s) => s.id).sort();
  ok(JSON.stringify(ids) === JSON.stringify(['cs_live_LEGACY_QC', 'cs_live_LEGACY_SELF', 'cs_live_LINK_SESSION']), `legacy Checkout Sessions identified for expiry: ${ids.join(', ')}`);
  ok(r.plan.expireSessions.find((s) => s.id === 'cs_live_LEGACY_QC')!.quick_close, 'the session behind a Quick Close link ALREADY SENT is identified as such');
  ok(JSON.stringify(r.plan.deactivateLinks.map((l) => l.id).sort()) === JSON.stringify(['plink_99', 'plink_FOUNDER']), 'active Findable Payment Links identified for deactivation');
  ok(r.plan.unclassifiedLinks.length === 1 && r.plan.otherBypassPaths === 1, 'the unclassifiable link counts as an OTHER BYPASS PATH until Paul decides');
  ok(r.plan.storedQuickClose.total === 2 && r.plan.storedQuickClose.payable === 1, 'stored legacy Quick Close Stripe links: 2, of which 1 still payable (a paid row and a sign-up link are not counted)');
  ok(r.plan.untouched.v3SignedSessions === 1 && r.plan.untouched.notFindableSessions === 1 && r.plan.untouched.notFindableLinks === 1, 'signed v3 and non-Findable objects are listed as untouched');
  ok(!r.plan.ready, 'NOT READY while anything payable remains');
  const text = r.text;
  ok(/^LEGACY FINDABLE CHECKOUT CUTOVER\n\nOpen legacy Checkout Sessions: 3\nActive legacy Payment Links: 2\nStored legacy Quick Close links: 2 \(still payable: 1\)\nOther bypass paths: 1/.test(text), 'the report reads exactly as specified');
  ok(/EXPIRE session cs_live_LEGACY_QC \(Quick Close link already sent\)/.test(text) && /DEACTIVATE Payment Link plink_FOUNDER/.test(text) && /REVIEW Payment Link plink_MYSTERY/.test(text), 'it names exactly which objects need invalidating');
  /* Integration (2026-10-05): each DEACTIVATE says what it sells and WHICH evidence classified it, so a person can
     confirm before executing; a price-only match says so. Display only — the hash covers ids. */
  ok(/DEACTIVATE Payment Link plink_FOUNDER .* names Findable .*: AI visibility sprint \(founder price\) 4999 gbp/.test(text)
    && /DEACTIVATE Payment Link plink_99 .*\(price match only\).*: Setup 9900 gbp/.test(text), 'a DEACTIVATE line shows the items and whether a name or only a price matched');

  console.log('\n── EXECUTE: only the reviewed plan ──');
  const bad = await executeCutover(db.svc, { fetcher, secret: 'sk', planHash: r.planHash, confirm: 'yes' });
  ok(bad.kind === 'refused' && writes.length === 0, 'without the exact confirm phrase → refused, nothing written');
  const stale = await executeCutover(db.svc, { fetcher, secret: 'sk', planHash: 'f'.repeat(64), confirm: CUTOVER_CONFIRM_PHRASE });
  ok(stale.kind === 'refused' && writes.length === 0, 'a plan hash that is not the current plan → refused, nothing written');
  const done = await executeCutover(db.svc, { fetcher, secret: 'sk', planHash: r.planHash, confirm: CUTOVER_CONFIRM_PHRASE });
  ok(done.kind === 'executed', 'the reviewed plan executes');
  ok(JSON.stringify(writes.sort()) === JSON.stringify(['checkout/sessions/cs_live_LEGACY_QC/expire', 'checkout/sessions/cs_live_LEGACY_SELF/expire', 'checkout/sessions/cs_live_LINK_SESSION/expire', 'payment_links/plink_99', 'payment_links/plink_FOUNDER'].sort()), 'it expires EXACTLY the legacy sessions and deactivates EXACTLY the Findable links');
  ok(state.sessions.find((s) => s.id === 'cs_live_V3_SIGNED')!.status === 'open' && state.sessions.find((s) => s.id === 'cs_live_BARBER')!.status === 'open' && state.links.find((l) => l.id === 'plink_BARBER')!.active, 'signed v3 sessions and other products are untouched');
  if (done.kind === 'executed') {
    ok(done.after.plan.expireSessions.length === 0 && done.after.plan.deactivateLinks.length === 0 && done.after.plan.storedQuickClose.payable === 0, 'after the cutover: no open legacy session, no active Findable link, no payable stored Quick Close link');
    ok(!done.after.plan.ready && done.after.plan.otherBypassPaths === 1, '…and still NOT READY until Paul decides the one unclassifiable link');
  }
  /* Paul decides the mystery link is not Findable (deactivated or relabelled) → READY. */
  state.links = state.links.filter((l) => l.id !== 'plink_MYSTERY');
  const final = await cutoverReport(db.svc, { fetcher, secret: 'sk' });
  ok(final.plan.ready && /READY: no payable legacy Findable path remains/.test(final.text), 'READY once nothing payable and nothing unclassified remains');
  ok(!writes.some((w) => /refund|charges|payment_intents|invoices/.test(w)), 'historical completed payments are never touched (no refund / charge / invoice call exists)');

  console.log('\n── NO SUPPORTED FINDABLE ROUTE TO STRIPE WITHOUT v3 ACCEPTANCE (code scan) ──');
  const files: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(path.join(root, d))) { const p = path.join(d, n); if (statSync(path.join(root, p)).isDirectory()) { if (n !== 'node_modules') walk(p); } else if (/\.(ts|tsx|mjs|js)$/.test(n)) files.push(p.replace(/\\/g, '/')); } };
  walk('supabase/functions'); walk('src');
  const creators = files.filter((f) => /api\.stripe\.com\/v1\/checkout\/sessions["`]\s*,/.test(read(f)) || /checkout\.sessions\.create|paymentLinks\.create|"payment_links"\s*,\s*\{\s*method:\s*"POST"/.test(read(f)));
  ok(JSON.stringify(creators) === JSON.stringify(['supabase/functions/findable-checkout/index.ts']), `exactly ONE place can create a Stripe Checkout Session, and no code creates Payment Links (found: ${creators.join(', ') || 'none'})`);
  ok(!files.some((f) => /buy\.stripe\.com/.test(read(f))), 'no stored Payment Link URL anywhere in the code');
  const co = read('supabase/functions/findable-checkout/index.ts');
  ok(co.indexOf('checkoutAgreementGate(') > 0 && co.indexOf('checkoutAgreementGate(') < co.indexOf('https://api.stripe.com/v1/checkout/sessions'), 'that one creator runs the v3 gate before it can create a session');
  const good: GateAcceptance = { id: 'A1', lead_id: 'L', onboarding_id: 'OB', agreement_version: 'v3', service_route: 'build', method: 'agree_page', authority_confirmed: true, agreed_text_sha256: 'h' };
  const g = (a: GateAcceptance | null) => checkoutAgreementGate({ acceptance: a, leadId: 'L', onboardingId: 'OB', route: 'build', currentVersion: 'v3', recomputedSha: 'h' });
  ok(!g(null).ok, 'no acceptance → no checkout');
  ok(!g({ ...good, agreement_version: 'v1' }).ok, 'an old v1 acceptance → no checkout');
  ok(g(good).ok, 'a valid v3 acceptance → checkout may open');
  const legacyQc = { link_url: 'https://checkout.stripe.com/c/pay/cs_live_LEGACY_QC#x', link_session_id: 'cs_live_LEGACY_QC', link_generated_at: new Date().toISOString(), link_expires_at: new Date(Date.now() + 20 * 3_600_000).toISOString(), answers: { decision_maker: 'yes' as const } };
  ok(!linkUsable(legacyQc) && quickCloseState('answers_saved', legacyQc) !== 'link_generated', 'an old stored Quick Close Stripe URL is never reused or shown as ready');
  const site = read('src/lib/legacyCutover.ts');
  ok(/status \?\? 'open'\) !== 'open'\) continue; \/\/ complete \/ expired = history/.test(site), 'completed sessions are skipped by the plan (history is never listed)');

  console.log('\n── THE WEBHOOK BACKSTOP ──');
  const v = (meta: Record<string, string | undefined>, acc: GateAcceptance | null, sha = 'h') => webhookV3Verdict({ metadata: meta, acceptance: acc, leadId: 'L', onboardingId: 'OB', recomputedSha: sha, termsByVersion: AGREEMENT_FIRST_TERMS });
  const META = { commercial_terms: COMMERCIAL_TERMS_V3, agreement_version: 'v3', agreement_acceptance_id: 'A1', service_route: 'build' };
  ok(v(META, good).ok, 'a valid v3 checkout is processed as a sale — also after v4 became current (a v3 session paid late keeps v3 terms)');
  ok(v({ ...META, commercial_terms: COMMERCIAL_TERMS_V4, agreement_version: 'v4' }, { ...good, agreement_version: 'v4' }).ok, 'a valid v4 checkout is processed as a sale');
  ok(!v({ ...META, commercial_terms: COMMERCIAL_TERMS_V4 }, good).ok, 'a v3 signature with v4 terms on the session → HELD');
  ok(!v({ onboarding_id: 'OB', agreement_version: 'v1' }, null).ok, 'a pre-cutover (v1 / tick) session is HELD');
  ok(!v({ ...META, agreement_acceptance_id: 'OTHER' }, good).ok, 'a session naming a signature that is not the one read back → HELD');
  ok(!v(META, { ...good, lead_id: 'OTHER' }).ok && !v(META, { ...good, onboarding_id: 'OB-OLD' }).ok && !v({ ...META, service_route: 'optimise' }, good).ok, 'wrong client / wrong sign-up / wrong service → HELD');
  ok(!v(META, good, 'tampered').ok, 'a fingerprint that no longer matches → HELD');
  const hdb = fakeDb([]);
  const alerts: string[] = [];
  await holdPayment(hdb.svc, { id: 'cs_live_X', payment_intent: 'pi_X', amount_total: 9900, metadata: { onboarding_id: 'OB' } }, { leadId: 'L', onboardingId: 'OB', reason: 'not_a_v3_checkout', eventId: 'evt' }, async (s) => { alerts.push(s); return { ok: true, status: 200, error: null }; });
  const tables = hdb.inserted.map((i) => i.table);
  ok(tables.includes('client_payment_holds') && alerts.length === 1 && tables.includes('notifications'), 'a held payment is recorded, Paul is emailed AND notified');
  ok(!tables.some((t) => /payment_ledger|outreach_leads|onboarding_responses|client_service_terms/.test(t)), 'holding writes NO ledger row (no commission), does not mark the lead paid, starts nothing');
  const wh = read('supabase/functions/stripe-webhook/index.ts');
  const at = (s: string) => wh.indexOf(s);
  ok(at('await verifyV3Checkout(') > 0 && at('await verifyV3Checkout(') < at('await markOnboardingPaid(') && at('await verifyV3Checkout(') < at('establishLeadPayment(service, findableLeadId') && at('await verifyV3Checkout(') < at('await recordLedger(service, {') && at('await verifyV3Checkout(') < at('const subscription = await createDelayedSubscription('), 'the backstop runs BEFORE the paid state, the ledger (commission) and the subscription');
  ok(/if \(!verdict\.ok\) \{[\s\S]{0,500}await holdPayment\([\s\S]{0,900}?break;/.test(wh), 'a held payment stops there (break) — nothing after it runs');
  ok(/if \(!\(await paymentAlreadyRecorded\(service, piForHold, s\.id\)\)\)/.test(wh), 'a replay of a payment the ledger already recorded (history) is never held or re-judged');
  ok(/s\.status === "complete" && !\(\(s\.metadata\?\.generated_site_id as string\) \|\| ""\) && \(s\.payment_link \|\| s\.mode === "payment"\)\) \{\s*\n\s*await holdPayment/.test(wh), 'a Payment Link payment (no sign-up) is HELD too — until now it left no trace at all');
  ok(/if \(await openHoldFor\(service, effectiveLeadId\)\)[\s\S]{0,200}error: "payment_held" \}, 409/.test(co), 'while a held payment is open, the checkout refuses a second one (no double charge)');
  const mig = read('supabase/migrations/20261010090000_client_agreement_v3_commercial.sql');
  ok(/create table if not exists public\.client_payment_holds[\s\S]{0,200}checkout_session_id text not null unique/.test(mig) && /revoke all on public\.client_payment_holds from anon, authenticated/.test(mig), 'holds are one row per session, server-only');

  if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
  console.log('\nAll legacy-cutover / bypass checks passed.');
}
main().catch((e) => { console.error(e); process.exit(1); });
