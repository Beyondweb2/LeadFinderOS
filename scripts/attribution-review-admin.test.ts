/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ATTRIBUTION REVIEW — ADMIN (2026-10-05, docs/pre-sales-certification/attribution-review-admin.md).
   Two fixes, no commercial rule changed:
   1. BUSINESS REVENUE ≠ SALESPERSON-ATTRIBUTED REVENUE. A sale under an open review (or recorded Not credited)
      is real money for the business and NO PERSON'S performance — not the book owner's (the old fallback put it
      on Paul's row), not the current owner's, not the claimed seller's. Shown as "£X awaiting attribution".
   2. CONFIRM SELLER chooses from the evidence-backed candidates, or anyone else as an explicit admin override
      with a reason; the original evidence and claim are kept; one final decision; admin only.
   The database half is proven live, rolled back: supabase/tests/attribution-review-admin.sql (32/32).
   Run: npx tsx scripts/attribution-review-admin.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { foldAdminOverview, type AdminInput, type AdminLead, type AdminLedgerRow } from '../src/lib/adminMetrics.ts';
import { foldSalesPerformance } from '../src/lib/salesPerformance.ts';
import { resolvePeriod, addDays } from '../src/lib/reportingPeriod.ts';
import { buildExclusions } from '../src/lib/metricExclusions.ts';
import { ATTRIBUTION_OVERRIDE_REASON_MIN, CANDIDATE_SOURCE_LABEL, checkResolution, isAttributionHeld, saleCreditOf } from '../src/lib/saleAttribution.ts';
import { canOpenRoute } from '../src/lib/access.ts';
import { ATTRIBUTION_ERRORS, evidenceView, overrideChoices, resolutionText, type AttributionReview } from '../src/lib/attributionReviewView.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const PAUL = 'p0000000-0000-0000-0000-000000000001';
const OWNER = 'o0000000-0000-0000-0000-000000000002';   // holds the lead now
const CLAIMED = 'c0000000-0000-0000-0000-000000000003'; // the review's claimed seller
const OTHER = 'x0000000-0000-0000-0000-000000000004';   // another evidence-backed person
const NOW = Date.parse('2026-10-05T14:00:00Z');
const at = (daysAgo: number) => new Date(Date.parse(`${addDays('2026-10-05', -daysAgo)}T10:00:00Z`)).toISOString();

let seq = 0;
const lead = (o: Partial<AdminLead> = {}): AdminLead => ({
  id: `L${++seq}`, business_name: `Client ${seq}`, created_at: at(40), added_by_user_id: PAUL, assigned_to_user_id: null, sold_by_user_id: null, sold_at: null,
  status: 'payment_received', amount_paid: 99, is_potential_work: null, call_booked_at: null, whatsapp_sent_at: null, next_action: null, next_action_date: null,
  is_archived: false, phone: `07700 90${String(seq).padStart(4, '0')}`, email: null, search_keyword: 'plumber', category: null, payment_date: at(2), refunded_at: null,
  service_terminated_at: null, subscription_status: null, contract_total_payments: null, baseline_audit_id: null, remeasure_due_date: null, remeasure_audit_id: null, ...o,
});
const pay = (l: AdminLead, o: Partial<AdminLedgerRow> = {}): AdminLedgerRow => ({ id: `P${++seq}`, lead_id: l.id, kind: 'initial', status: 'succeeded', amount_gbp: 99, occurred_at: at(2), sold_by_user_id: null, ...o });
function base(o: Partial<AdminInput> = {}): AdminInput {
  const p = (k: string) => resolvePeriod(k, NOW);
  return {
    period: p('30d'), today: p('today'), yesterday: p('yesterday'), week: p('week'), month: p('mtd'), nowMs: NOW,
    bookOwnerId: PAUL,
    people: [PAUL, OWNER, CLAIMED, OTHER].map((u, i) => ({ userId: u, name: ['Paul', 'Owen', 'Claire', 'Oscar'][i], role: i ? 'sales' : 'admin', excluded: false })),
    exclusions: buildExclusions([]),
    leads: [], messages: [], activity: [], suppressions: [], ledger: [], onboarding: [],
    commissionLines: [], commissionTotals: null, commissionDueBySeller: new Map(), payoutsBySeller: new Map(),
    cost: { period: [], today: [], yesterday: [], week: [], month: [] }, ...o,
  };
}
const rev = (o: ReturnType<typeof foldAdminOverview>, u: string) => o.team.find((r) => r.userId === u)?.revenue ?? 0;
const sales = (o: ReturnType<typeof foldAdminOverview>, u: string) => o.team.find((r) => r.userId === u)?.paid ?? 0;

console.log('── 1. the one credit rule (saleCreditOf) ──');
{
  ok(saleCreditOf({ leadSeller: null, leadSoldAt: at(1), reviewStatus: 'open' }).kind === 'awaiting_attribution', 'open review → awaiting attribution');
  ok(saleCreditOf({ ledgerSeller: OWNER, leadSeller: OWNER, leadSoldAt: at(1), reviewStatus: 'open' }).kind === 'awaiting_attribution', 'open review → awaiting, WHATEVER a row\'s seller says (the commission engine reads the hold the same way)');
  ok(saleCreditOf({ leadSoldAt: at(1), reviewStatus: 'not_credited' }).kind === 'not_credited', 'not credited → not credited');
  ok(saleCreditOf({ leadSoldAt: at(1), reviewStatus: 'something_new' }).kind === 'awaiting_attribution', 'an unknown review status is HELD (awaiting), never credited');
  const c = saleCreditOf({ leadSeller: CLAIMED, leadSoldAt: at(1), reviewStatus: 'confirmed' });
  ok(c.kind === 'seller' && c.userId === CLAIMED, 'confirmed → the stamped seller');
  const l = saleCreditOf({ ledgerSeller: OTHER, leadSeller: CLAIMED, leadSoldAt: at(1) });
  ok(l.kind === 'seller' && l.userId === OTHER, 'no review: the ledger snapshot first, then the lead stamp (unchanged)');
  ok(saleCreditOf({ leadSeller: null, leadSoldAt: at(1), reviewStatus: null }).kind === 'awaiting_attribution', 'decided with NO seller and the review not read → awaiting (fail closed), never a fallback');
  ok(saleCreditOf({ leadSeller: null, leadSoldAt: null, reviewStatus: null }).kind === 'unstamped', 'never decided (before the stamp existed) → unstamped: the caller\'s old fallback applies');
  ok(isAttributionHeld('open') && isAttributionHeld('not_credited') && !isAttributionHeld('confirmed') && !isAttributionHeld(null), 'the hold rule commission reads is unchanged');
}

console.log('\n── 2. the admin team table (adminMetrics) ──');
{
  // The live shape of an open review: paid, sold_at set, NO seller; held by OWNER; review claims CLAIMED.
  const held = lead({ assigned_to_user_id: OWNER, sold_at: at(2) });
  const input = base({ leads: [held], ledger: [pay(held)], attributionOf: new Map([[held.id, { status: 'open' }]]) });
  const o = foldAdminOverview(input);
  ok(rev(o, PAUL) === 0 && sales(o, PAUL) === 0, 'OPEN review: NOT on Paul\'s row (the book-owner fallback no longer catches it)');
  ok(rev(o, OWNER) === 0 && sales(o, OWNER) === 0, 'OPEN review: NOT on the current owner\'s row');
  ok(rev(o, CLAIMED) === 0 && sales(o, CLAIMED) === 0, 'OPEN review: NOT on the claimed seller\'s row');
  ok(o.team.every((r) => r.revenue === 0 && r.paid === 0) && o.totals.revenue === 0, '…nor anyone else\'s; the team total carries none of it');
  ok(o.money.period.gross === 99 && o.money.period.initial === 99 && o.money.month.gross === 99, 'the BUSINESS payment still exists: collected revenue includes it');
  ok(o.money.unattributed.awaiting.amount === 99 && o.money.unattributed.awaiting.clients === 1 && o.money.unattributed.awaiting.names[0] === held.business_name, 'shown apart: £99 awaiting attribution, 1 client, named');
  ok(!o.money.bySeller.some((s) => s.gross > 0), 'no seller in "money by seller" carries it');
  ok(o.today.sales + o.yesterday.sales >= 0 && o.money.payingClients === 1, 'the paying-client count (the business) still counts the client');

  const unread = foldAdminOverview({ ...input, attributionOf: null });
  ok(rev(unread, PAUL) === 0 && unread.money.unattributed.awaiting.amount === 99, 'reviews UNREADABLE: decided-with-no-seller still reads as awaiting — never handed to Paul');

  const ghost = foldAdminOverview(base({ leads: [held], ledger: [pay(held, { sold_by_user_id: OWNER })], attributionOf: new Map([[held.id, { status: 'open' }]]) }));
  ok(rev(ghost, OWNER) === 0 && ghost.money.unattributed.awaiting.amount === 99, 'a seller on the ledger row cannot credit a held sale');

  const nc = lead({ assigned_to_user_id: OWNER, sold_at: at(2) });
  const ncO = foldAdminOverview(base({ leads: [nc], ledger: [pay(nc), pay(nc, { kind: 'recurring', amount_gbp: 29.99, occurred_at: at(1) })], attributionOf: new Map([[nc.id, { status: 'not_credited' }]]) }));
  ok(ncO.team.every((r) => r.revenue === 0 && r.paid === 0), 'NOT CREDITED never enters any rep\'s revenue (first or monthly payment)');
  ok(ncO.money.unattributed.notCredited.amount === 128.99 && ncO.money.unattributed.awaiting.amount === 0 && ncO.money.period.gross === 128.99, 'NOT CREDITED: business revenue, listed apart as not credited');

  // CONFIRMED: the resolver stamps the chosen seller on the lead and on the ledger rows without one.
  const cf = lead({ assigned_to_user_id: OWNER, sold_at: at(2), sold_by_user_id: OTHER });
  const cfO = foldAdminOverview(base({ leads: [cf], ledger: [pay(cf, { sold_by_user_id: OTHER })], attributionOf: new Map([[cf.id, { status: 'confirmed' }]]) }));
  ok(rev(cfO, OTHER) === 99 && sales(cfO, OTHER) === 1, 'CONFIRM SELLER: the confirmed seller\'s row gets the sale and its revenue');
  ok(rev(cfO, OWNER) === 0 && rev(cfO, PAUL) === 0 && rev(cfO, CLAIMED) === 0 && cfO.money.unattributed.awaiting.amount === 0, '…and nobody else\'s; nothing left awaiting');

  // HISTORICAL sales: unchanged.
  const old = lead({ sold_at: null, sold_by_user_id: null });
  const mine = lead({ sold_at: at(3), sold_by_user_id: PAUL });
  const reps = lead({ sold_at: at(3), sold_by_user_id: CLAIMED, assigned_to_user_id: OWNER });
  const hO = foldAdminOverview(base({ leads: [old, mine, reps], ledger: [pay(old), pay(mine), pay(reps)] }));
  ok(rev(hO, PAUL) === 198 && sales(hO, PAUL) === 2, 'historical: a payment from before the stamp existed is still the book owner\'s; Paul\'s own stamped sale is his');
  ok(rev(hO, CLAIMED) === 99 && rev(hO, OWNER) === 0, 'historical: a stamped rep sale stays the rep\'s (not the current owner\'s)');
  ok(hO.money.unattributed.awaiting.payments === 0 && hO.money.unattributed.notCredited.payments === 0, 'historical: nothing reads as awaiting');
}

console.log('\n── 3. the rep\'s own dashboard (salesPerformance) ──');
{
  const L = (o: Record<string, unknown>) => ({ id: 'S1', business_name: 'Held Co', campaign_id: null, status: 'payment_received', amount_paid: 99, is_potential_work: null, lead_source: null, assigned_to_user_id: OWNER, ...o });
  const fold = (personId: string | null, l: Record<string, unknown>) => foldSalesPerformance({ personId, sinceMs: null, leads: [l as never], messages: [], activity: [], linkEvents: [], hits: [], campaignNames: new Map() });
  const heldLead = L({ sold_by_user_id: null, sold_at: at(2) });
  ok(fold(OWNER, heldLead).funnel.won === 0, 'OPEN review: not a win for the current owner');
  ok(fold(CLAIMED, heldLead).funnel.won === 0, 'OPEN review: not a win for the claimed seller');
  ok(fold(null, heldLead).funnel.won === 1, '…still a client on the whole-business view');
  ok(fold(OTHER, L({ sold_by_user_id: OTHER, sold_at: at(2) })).funnel.won === 1 && fold(OWNER, L({ sold_by_user_id: OTHER, sold_at: at(2) })).funnel.won === 0, 'CONFIRMED: the confirmed seller\'s win, not the owner\'s');
  ok(fold(OWNER, L({ sold_by_user_id: null, sold_at: undefined })).funnel.won === 1, 'historical (never stamped): still the holder\'s win, as before');
}

console.log('\n── 4. resolving: candidates, override, one decision ──');
{
  const cands = [CLAIMED, OTHER];
  const c1 = checkResolution({ decision: 'confirmed', sellerId: OTHER, candidateIds: cands, overrideReason: '', note: '' });
  ok(c1.ok && c1.basis === 'evidence', 'an evidence-backed candidate who is not the claim is a plain confirmation (no reason needed)');
  const c2 = checkResolution({ decision: 'confirmed', sellerId: OWNER, candidateIds: cands, overrideReason: '', note: '' });
  ok(!c2.ok && 'error' in c2 && c2.error === 'override_reason_required', 'anyone else needs a reason');
  ok(!checkResolution({ decision: 'confirmed', sellerId: OWNER, candidateIds: cands, overrideReason: '  short   ', note: '' }).ok, `a reason under ${ATTRIBUTION_OVERRIDE_REASON_MIN} characters (trimmed) is refused`);
  const c3 = checkResolution({ decision: 'confirmed', sellerId: OWNER, candidateIds: cands, overrideReason: 'Owen closed it on the phone', note: '' });
  ok(c3.ok && c3.basis === 'admin_override', 'with a reason it is an explicit admin override');
  ok(!checkResolution({ decision: 'confirmed', sellerId: null, candidateIds: cands, overrideReason: '', note: '' }).ok, 'Confirm needs a person');
  const c4 = checkResolution({ decision: 'not_credited', sellerId: null, candidateIds: cands, overrideReason: '', note: '' });
  ok(c4.ok && c4.basis === null, 'Not credited needs no person');
  ok(Object.keys(CANDIDATE_SOURCE_LABEL).sort().join() === 'claimed_seller,link_creator,owner_at_payment,signup_creator', 'four evidence sources, each labelled');
  for (const k of ['not_admin', 'no_open_review', 'override_reason_required', 'not_a_team_member', 'seller_not_allowed', 'seller_already_stamped']) ok(!!ATTRIBUTION_ERRORS[k], `the resolver's "${k}" has words`);

  const people = [
    { user_id: PAUL, name: 'Paul', status: 'active', role: 'admin', is_book_owner: true },
    { user_id: OWNER, name: 'Owen', status: 'active', role: 'sales', is_book_owner: false },
    { user_id: CLAIMED, name: 'Claire', status: 'active', role: 'sales', is_book_owner: false },
    { user_id: OTHER, name: 'Oscar', status: 'disabled', role: null, is_book_owner: false },
  ];
  const review: AttributionReview = {
    lead_id: 'R1', business_name: 'Conflict Co', claimed_seller_user_id: CLAIMED, reason: 'conflicting_creators', status: 'open', resolution_note: null, resolved_at: null, created_at: at(1),
    evidence: {
      mode: 'paid_signup', paid_signup: 'SU1', signup_creators: [CLAIMED, OTHER], owner_at_payment: OWNER, claimed_seller_readiness: ['bank_details'],
      all_links: [{ creator: CLAIMED, role: 'sales', signup: 'SU1', ready: true, at: at(5) }, { creator: OTHER, role: 'sales', signup: 'SU1', ready: false, missing: ['right_to_work'], at: at(4) }],
      owner_history: [{ kind: 'lead_assigned', by: PAUL, data: { from: CLAIMED, to: OWNER }, at: at(3) }],
    },
    lead: { amount_paid: 99, payment_date: at(1), status: 'payment_received', owner_now: OWNER, sold_by_user_id: null, sold_at: at(1) },
    first_payment: { amount_gbp: 99, occurred_at: at(1) },
    candidates: [{ user_id: CLAIMED, name: 'Claire', sources: ['signup_creator', 'claimed_seller'] }, { user_id: OTHER, name: 'Oscar', sources: ['signup_creator'] }],
  };
  const nameOf = (id: string | null | undefined) => people.find((p) => p.user_id === id)?.name ?? 'Nobody';
  const v = evidenceView(review, nameOf);
  ok(v.creators.length === 2 && v.creators[0].startsWith('Claire') && /Ready to Sell at the time/.test(v.creators[0]) && /right to work/i.test(v.creators[1]), 'evidence: BOTH sign-up creators, each with their readiness when they made it');
  ok(/^Claire — not Ready to Sell — missing: bank details/.test(v.claimed), 'evidence: the claimed seller and their readiness when the review opened');
  ok(v.ownerAtPayment === 'Owen' && v.ownerNow === 'Owen' && /moved from Claire to Owen by Paul/.test(v.ownerHistory[0]), 'evidence: lead owner at payment, now, and how it moved');
  ok(/^£99 on .*through the sign-up link the client signed\. Real business revenue — no one's sales or commission until you decide\.$/.test(v.payment), 'evidence: the payment, how it came in, and that it is nobody\'s yet');
  ok(v.links.length === 2 && v.links.every((l) => /the sign-up that was paid/.test(l)), 'evidence: every sign-up link made for the client');
  ok(/more than one person/i.test(v.why), 'evidence: why the review opened');
  const choices = overrideChoices(people, review.candidates!);
  ok(choices.map((p) => p.user_id).join() === [OWNER, PAUL].sort((a, b) => nameOf(a).localeCompare(nameOf(b))).join(), 'override list = the team MINUS the evidence-backed candidates (no one offered twice)');
  const none = evidenceView({ ...review, evidence: { mode: 'manual', owner_at_payment: null } }, nameOf);
  ok(none.creators[0] === 'Nobody created the paid sign-up through Quick Close.' && none.ownerAtPayment === 'Nobody (unassigned)', 'absent evidence is said as absent, never invented');
  ok(/admin override/.test(resolutionText({ ...review, status: 'confirmed', resolved_seller_user_id: OWNER, resolution_basis: 'admin_override', resolved_by: PAUL, resolved_at: at(0) }, nameOf))
    && /Seller confirmed: Owen/.test(resolutionText({ ...review, status: 'confirmed', resolved_seller_user_id: OWNER, resolution_basis: 'admin_override', resolved_by: PAUL, resolved_at: at(0) }, nameOf)),
    'a resolved review reads: who, on what basis, by whom');
  ok(/Not credited/.test(resolutionText({ ...review, status: 'not_credited', resolved_by: PAUL, resolved_at: at(0) }, nameOf)), '…and Not credited reads as such');
}

console.log('\n── 5. the database (migration 20261011100000) — wiring; behaviour proven live, rolled back ──');
{
  const mig = read('supabase/migrations/20261011100000_attribution_review_admin.sql');
  const fn = (name: string) => { const s = mig.indexOf(`create or replace function public.${name}(`); return s < 0 ? '' : mig.slice(s, mig.indexOf('$$;', s)); };
  const res = fn('resolve_sale_attribution_with_seller');
  ok(/not exists \(select 1 from public\.user_roles where user_id = _actor and role = 'admin'\)/.test(res) && res.indexOf("'not_admin'") < res.indexOf('for update'), 'the resolver checks the ACTOR is an admin, before touching anything (a salesperson cannot resolve)');
  ok(/r\.status <> 'open' then return jsonb_build_object\('ok', false, 'error', 'no_open_review'\)/.test(res), 'one final decision');
  ok(new RegExp(`char_length\\(coalesce\\(v_override, ''\\)\\) < ${ATTRIBUTION_OVERRIDE_REASON_MIN}`).test(res) && new RegExp(`char_length\\(btrim\\(override_reason\\)\\) >= ${ATTRIBUTION_OVERRIDE_REASON_MIN}`).test(mig),
    `the override reason minimum (${ATTRIBUTION_OVERRIDE_REASON_MIN}) is the same number in the resolver, the table check and the screen`);
  ok(/public\.sale_attribution_candidates\(_lead_id\)/.test(res) && /v_basis := 'evidence'/.test(res) && /v_basis := 'admin_override'/.test(res), 'evidence vs override is decided by the DATABASE\'s candidate list');
  ok(/update public\.payment_ledger set sold_by_user_id = _seller where lead_id = _lead_id and sold_by_user_id is null/.test(res)
    && /set_config\('app\.attribution_resolve', _lead_id::text, true\)/.test(res), 'confirm uses the existing stamp path (lead + ledger rows with no seller) — the commission mechanism is unchanged');
  ok(/insert into public\.sale_attribution_review_events/.test(res), 'every decision is written to the history');
  const cand = fn('sale_attribution_candidates');
  ok(/from public\.sale_attribution_reviews where lead_id = _lead_id/.test(cand) && !/outreach_leads|assigned_to_user_id/.test(cand), 'candidates come ONLY from the review\'s frozen evidence (never the lead\'s current owner)');
  ok(/u\.role = 'admin'/.test(cand) && /is_book_owner is not true/.test(cand), 'the owner at payment is a candidate only when a salesperson (never Paul by ownership)');
  const guard = fn('trg_sale_attribution_reviews_guard');
  ok(/new\.evidence is distinct from old\.evidence/.test(guard) && /new\.claimed_seller_user_id is distinct from old\.claimed_seller_user_id/.test(guard), 'the original evidence and claim are immutable');
  ok(/old\.status <> 'open' then\s+raise exception/.test(guard) && /never deleted/.test(guard), 'a resolved review is final; no review is deleted directly');
  ok(/sale_attribution_review_events is append-only/.test(mig) && /before update or delete on public\.sale_attribution_review_events/.test(mig), 'the history is append-only');
  ok(/revoke all on function public\.resolve_sale_attribution_with_seller[^;]*from public, anon, authenticated/.test(mig)
    && /grant execute on function public\.resolve_sale_attribution_with_seller[^;]*to service_role/.test(mig)
    && /revoke all on public\.sale_attribution_review_events from public, anon, authenticated/.test(mig), 'service-role only; no signed-in access');
  ok(/create or replace function public\.resolve_sale_attribution_review\(_lead_id uuid, _decision text, _note text, _actor uuid\)/.test(mig) && /public\.resolve_sale_attribution_with_seller\(_lead_id, _decision, case when _decision = 'confirmed' then v_claimed end/.test(mig),
    'the old entry point keeps its signature and confirms the CLAIMED seller through the one resolver');
  ok(!/sale_attribution_held|sale_attribution_holds|sale_attribution_decision|trg_outreach_leads_sold_by\b/.test(strip(mig).replace(/--.*$/gm, '')), 'the hold, the decision and the stamp are not redefined');
}

console.log('\n── 6. the server and the screens ──');
{
  const au = strip(read('supabase/functions/admin-users/index.ts'));
  ok(au.indexOf("'attribution_review_resolve'") > au.indexOf('Not authorized - no admin role') && /rpc\('resolve_sale_attribution_with_seller'/.test(au), 'admin-users: resolve is admin-only and calls the one resolver');
  ok(/rpc\('sale_attribution_candidates'/.test(au) && /from\('sale_attribution_review_events'\)/.test(au), 'admin-users: the list carries the database\'s candidates and the history');
  ok(/_seller: body\.seller_user_id \?\? null/.test(au) && /_override_reason:/.test(au), 'admin-users: the chosen seller and the override reason go to the database unaltered');
  const hub = strip(read('supabase/functions/paid-client-hub/index.ts'));
  ok(!/sold_by_user_id \?\? l\.assigned_to_user_id|L\.sold_by_user_id \?\? L\.assigned_to_user_id/.test(hub) && /sellerShown\(/.test(hub), 'Paid Clients: a held sale names nobody (no fallback to the current owner)');
  const am = strip(read('src/lib/adminMetrics.ts'));
  ok(/saleCreditOf\(/.test(am) && !/sold_by_user_id \?\? \(r\.lead_id \? leadById\.get\(r\.lead_id\)\?\.sold_by_user_id : null\) \?\? input\.bookOwnerId/.test(am), 'the team table uses the one credit rule (the book-owner fallback only for unstamped history)');
  ok(/saleCreditOf\(/.test(strip(read('src/lib/salesPerformance.ts'))), 'the rep dashboard uses the one credit rule');
  ok(/loadAttributionHolds\(service\)/.test(read('supabase/functions/_shared/admin-overview-load.ts')), 'admin-overview reads the reviews (unreadable → null, still fail-closed)');
  const card = read('src/components/AttributionReviews.tsx');
  ok(/candidates\.map/.test(card) && /admin override/i.test(card) && /checkResolution\(/.test(card), 'the card offers the evidence-backed candidates and an explicit override');
  ok(!/window\.prompt/.test(card), 'no bare prompt: the decision is made on the card with the evidence in view');
  const team = read('src/pages/Team.tsx');
  ok(/serverReady: Array\.isArray\(r\.people\)/.test(team) && /disabled=\{busy \|\| locked\}/.test(card) && /disabled=\{busy \|\| locked \|\| !confirmCheck\.ok\}/.test(card),
    'DEPLOY GAP: against an older admin-users (no people in the list) the card will not resolve — it would have confirmed the CLAIMED seller whoever was picked');
  ok(canOpenRoute('admin', '/team') && !canOpenRoute('sales', '/team'), 'the Team page (where reviews are resolved) opens for an admin only (access.ts)');
  const tc = read('src/components/admin/teamControl.tsx');
  ok(/UnattributedNote/.test(tc) && /awaiting attribution/.test(tc), 'the team table shows "£X awaiting attribution" apart');
  const comm = read('src/lib/commission.ts');
  ok(/import \{ isAttributionHeld \} from '\.\/saleAttribution\.ts';/.test(comm) && !/saleCreditOf|resolved_seller|override_reason/.test(comm), 'the commission engine is untouched (it still reads the hold itself)');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
