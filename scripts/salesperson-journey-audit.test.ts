/* THE SALESPERSON JOURNEY AUDIT (2026-11-10, docs/salesperson-journey-audit.md): the rules it added, each pinned.
   Calls and the stale-bundle reload are in twilio-comms.test.ts and stale-chunk.test.ts. */
import fs from 'node:fs';
import path from 'node:path';
import { archivedPaidClients, leadOfArchiveKey, paidClientArchiveKey, splitArchived } from '../src/lib/paidClientArchive.ts';
import { hiddenByMark, type NeedsMark } from '../src/lib/needsMe.ts';
import { signedPlanLock } from '../src/lib/signedPlanLock.ts';
import { planPaymentCountLine, planSoldLine } from '../src/lib/newClientEmailWords.ts';
import { closeSaleName, quickCloseEmail, quickCloseMessage, quickCloseScript } from '../src/lib/quickClose.ts';
import { agreementWords, paidClientRecord } from '../src/lib/paidClientRecord.ts';
import { CLIENT_PAYMENT_PLANS, PAYMENT_PLAN_SPEC } from '../src/lib/paymentPlans.ts';
import { configuredPriceId, planPriceExpectations, priceProblem } from '../src/lib/planPriceCheck.ts';
import { ADD_MOBILE_REFUSAL_WORDS, addMobileRefusalWords, leadHasMobile, offerAddMobile, typedMobileProblem } from '../src/lib/leadAddMobile.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('PASS', m); else { f++; console.log('FAIL', m); } };
const read = (p: string) => fs.readFileSync(path.resolve(p), 'utf8').replace(/\r\n/g, '\n');

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333';

console.log('1. archive a paid client: a mark, never a delete');
{
  ok(paidClientArchiveKey(A) === `paidclient:${A}` && leadOfArchiveKey(`paidclient:${A}`) === A, 'A1. the key names the lead, and reads back');
  ok(leadOfArchiveKey(`client:${A}`) === null && leadOfArchiveKey('paidclient:not-a-uuid') === null && leadOfArchiveKey(null) === null, 'A2. another row\'s key, or a malformed one, archives nobody');
  const marks = [
    { id: 'm1', item_key: paidClientArchiveKey(A), action: 'archive', undone_at: null },
    { id: 'm2', item_key: paidClientArchiveKey(B), action: 'archive', undone_at: '2026-11-10T10:00:00Z' },
    { id: 'm3', item_key: paidClientArchiveKey(C), action: 'dismiss', undone_at: null },
    { id: 'm4', item_key: `interested:${C}`, action: 'archive', undone_at: null },
  ];
  const arc = archivedPaidClients(marks);
  ok(arc.size === 1 && arc.get(A) === 'm1', 'A3. only a live archive mark on a paid-client key counts: an undone mark, a dismiss and another row\'s archive do not');
  const rows = [{ id: B }, { id: A }, { id: C }];
  const s = splitArchived(rows, (r) => r.id, arc);
  ok(s.live.map((r) => r.id).join() === `${B},${C}` && s.archived.map((r) => r.id).join() === A, 'A4. the list splits into shown and archived, order kept');
  ok(splitArchived(rows, (r) => r.id, new Map()).live.length === 3, 'A5. nothing archived (or the read failed and gave nothing): every client is shown');
  const mark: NeedsMark = { id: 'm1', item_key: paidClientArchiveKey(A), action: 'archive', until: null, created_at: '2026-11-10T09:00:00Z' };
  ok(hiddenByMark({ key: `client:${A}`, sinceIso: null }, [mark], Date.now())?.id === 'm1', 'A6. the same mark hides that client\'s New client row in What needs you');
  ok(hiddenByMark({ key: `client:${B}`, sinceIso: null }, [mark], Date.now()) === null && hiddenByMark({ key: `interested:${A}`, sinceIso: null }, [mark], Date.now()) === null, 'A7. …and no other client, and no other kind of row for that lead');
  const hook = read('src/hooks/usePaidClientArchive.ts');
  ok(/from\('admin_home_marks'\)\.insert\(/.test(hook) && /update\(\{ undone_at:/.test(hook) && !/\.delete\(/.test(hook), 'A8. archive inserts a mark and restore stamps it undone: nothing is deleted');
  ok(!/outreach_leads|payment_ledger|commission_|is_archived/.test(hook.replace(/\/\*[\s\S]*?\*\//g, '')), 'A9. the hook touches no lead, payment or commission row, and never the lead\'s own archive flag');
  const page = read('src/pages/PaidClients.tsx'), owed = read('src/components/admin/CommissionOwed.tsx');
  ok(/data-testid="paid-client-archive"/.test(page) && /data-testid="paid-clients-show-archived"/.test(page) && /data-testid="paid-client-restore"/.test(page), 'A10. Paid Clients has Archive, Show archived and Restore');
  ok(/data-testid="new-paid-archive"/.test(owed) && /data-testid="new-paid-show-archived"/.test(owed) && /data-testid="new-paid-restore"/.test(owed), 'A11. New paid clients has Archive, Show archived and Restore');
  ok(/<\/Link>\s*\{archived/.test(page), 'A12. on Paid Clients the button sits beside the card\'s link, not inside it');
}

console.log('2. the plan cannot change under a signature');
{
  const sig = [{ agreement_version: 'v7.1', payment_plan: 'complete' }];
  ok(signedPlanLock([], 'complete_upfront') === null, 'P1. nothing signed: any plan may be picked');
  ok(signedPlanLock(sig, 'complete') === null, 'P2. back to the signed plan is always allowed');
  const refusal = signedPlanLock(sig, 'complete_upfront');
  ok(!!refusal && /already signed the agreement for Findable Complete/.test(refusal) && /tell Paul/.test(refusal), 'P3. a different plan on the same agreement is refused, and the words say what they signed and who to tell');
  ok(signedPlanLock(sig, 'legacy_twelve') === null && signedPlanLock([{ agreement_version: 'v5', payment_plan: null }], 'complete') === null, 'P4. a plan on the other agreement version needs a new signature anyway, so it is not locked here');
  ok(signedPlanLock([{ agreement_version: 'v7.1', payment_plan: null }], 'six') === null, 'P5. a signature that records no plan locks nothing');
  const fn = read('supabase/functions/quick-close/index.ts');
  ok(/changed\.includes\("payment_plan"\)[\s\S]{0,700}signedPlanLock\(/.test(fn) && /error: "plan_locked"/.test(fn) && /error: "plan_lock_unreadable"/.test(fn), 'P6. quick-close asks the rule when the plan changes, and an unreadable agreement record refuses (fails closed)');
  ok(fn.indexOf('signedPlanLock(') < fn.indexOf('const stored = await writeQc(service, rowId, revOf(qcNow), next, patch);'), 'P7. …before anything is written');
  ok(/'plan_locked'/.test(read('src/components/QuickCloseDialog.tsx')), 'P8. the Close screen re-reads after that refusal');
}

console.log('3. the new-client email names the plan that was sold');
{
  ok(planSoldLine('complete_upfront') === 'Findable Complete, paid up front · £999 once, for 12 months (save £189)', 'E1. Complete up front');
  ok(planSoldLine('full') === 'Findable Essential, pay in full · £499 once', 'E2. Essential paid in full');
  ok(planSoldLine('twelve') === 'Findable Essential, 12 months · £99 now, then £49.99 × 11 (12 payments, £648.89 in total)', 'E3. Essential 12 months');
  ok(planSoldLine('six') === 'Findable Essential, 6 months · £99 × 6 (£594 in total)' && planSoldLine('complete') === 'Findable Complete · £99 a month for 12 months (£1,188 in total)', 'E4. Essential 6 months and Complete monthly');
  for (const p of CLIENT_PAYMENT_PLANS) {
    const line = planPaymentCountLine(p), n = PAYMENT_PLAN_SPEC[p].totalPayments;
    ok(n === 1 ? /one payment, paid in full today\. No monthly payments follow\./.test(line) && !/payment 1\b/.test(line) : new RegExp(`${n} payments in total \\(this one is payment 1\\)`).test(line), `E5. ${p}: the count is the plan's own (${n})`);
  }
  ok(/£49\.99 a month/.test(planPaymentCountLine('twelve')) && /£99 a month/.test(planPaymentCountLine('six')), 'E6. the monthly named is the plan\'s monthly');
  const wh = read('supabase/functions/stripe-webhook/index.ts');
  ok(/soldOnPlan \? planSoldLine\(paidPlan\)/.test(wh) && /soldOnPlan \? planPaymentCountLine\(paidPlan\)/.test(wh), 'E7. the webhook uses both for every plan but the old staff one');
  ok(/const out = await postResendRetrying\(\{\s*from: FROM_OPERATOR,\s*to: \[ADMIN_EMAIL\]/.test(wh) && /RESEND_RETRY_WAITS_MS = \[\d+, \d+\]/.test(wh), 'E8. the new-client email is retried when the provider did not take it');
  ok(/last\.status === 0 \|\| last\.status === 429 \|\| last\.status >= 500/.test(wh), 'E9. …only for no answer, rate limit or the provider\'s own error: a refusal is not retried');
  ok(/const ADMIN_EMAIL = "paul@findable\.live"/.test(wh), 'E10. it goes to paul@findable.live');
}

console.log('4. the link message names the plan they bought');
{
  ok(closeSaleName('build', 'complete') === 'Findable Complete' && closeSaleName('build', 'complete_upfront') === 'Findable Complete' && closeSaleName('build', 'six') === 'Findable Essential', 'N1. Complete and Essential are named as themselves');
  ok(closeSaleName('build', 'legacy_twelve') === 'Findable Build' && closeSaleName('build', null) === 'Findable Build', 'N2. the old staff plan, or no plan, keeps the route\'s name');
  const msg = quickCloseMessage('Sam Lee', 'https://findable.live/agree/x', 'build', 'complete_upfront');
  ok(/^Hi Sam, here's your Findable Complete sign-up link:/.test(msg) && !/Findable Build/.test(msg), 'N3. the message opens with the plan and never says Build for a Complete sale');
  ok(quickCloseEmail({ greetName: null, businessName: 'ABC Ltd', url: 'u', route: 'build', senderName: 'Sumi', plan: 'full' }).subject === 'Your Findable Essential sign-up link - ABC Ltd', 'N4. the email subject too');
  ok(/It's Findable Complete: We build/.test(quickCloseScript('build', 'complete')), 'N5. and the words the salesperson reads out');
}

console.log('5. New paid clients carries the agreement, the trade and the town');
{
  const r = paidClientRecord({
    lead: { category: null, search_keyword: 'roofer', search_location: 'Leeds', phone: '07700 900123' },
    onboarding: { confirmed_location: 'Leeds, West Yorkshire', quick_close: { answers: { manager: 'agency', domain: 'yes' }, client_confirmed: { at: '2026-11-10T10:00:00Z', answers: { manager: 'owner' }, changed: ['manager'] } } },
    activity: [], agreement: { agreement_version: 'v7.1', typed_name: 'Sam Lee', typed_role: 'Owner', accepted_at: '2026-11-10T10:05:00Z' },
  });
  ok(r.agreement?.version === 'v7.1' && agreementWords(r.agreement!) === 'Agreement v7.1 signed by Sam Lee (Owner)', 'R1. who signed, in what role, which version');
  ok(r.lines.find((l) => l.label === 'Trade')?.value === 'roofer' && r.lines.find((l) => l.label === 'Town')?.value === 'Leeds, West Yorkshire', 'R2. trade and town are on the record (the client\'s own town first)');
  ok(r.lines.some((l) => l.label === 'Corrected by the client at sign-up' && /who looks after the website/.test(l.value)), 'R3. a fact the client corrected on their sign-up page is said');
  ok(JSON.stringify(r.lines).includes('Myself') || !JSON.stringify(r.lines).includes('agency'), 'R4. …and the corrected answer is the one shown, not the salesperson\'s');
  ok(paidClientRecord({ lead: {}, onboarding: null, activity: [] }).agreement === null, 'R5. no acceptance row: the record says none (the screen shows "No signed agreement on record")');
  ok(r.contactName === 'Sam Lee' && paidClientRecord({ lead: { contact_name: 'Jo Typed' }, onboarding: null, activity: [], agreement: { agreement_version: 'v7.1', typed_name: 'Sam Lee', accepted_at: '2026-11-10T10:05:00Z' } }).contactName === 'Jo Typed', 'R5b. with no contact name recorded, the name they signed in is the contact; a recorded one still wins');
  const fn = read('supabase/functions/sales-earnings/index.ts');
  ok(/from\("client_agreement_acceptances"\)\.select\("lead_id, agreement_version, typed_name, typed_role, accepted_at"\)/.test(fn), 'R6. the server reads who / role / version / when, never the agreed text or the IP address');
  ok(/o\.status === "paid" && !firstOb\.has\(o\.lead_id\)/.test(fn), 'R7. the sign-up that was PAID is the one read, not merely the newest row');
  ok(/seller_pending: credit\.kind === "awaiting_attribution"/.test(fn) && /Seller awaiting your review/.test(read('src/components/admin/CommissionOwed.tsx')), 'R8. a seller held for review is never shown as Self-service');
}

console.log('5b. every plan and the Stripe Price its monthly uses');
{
  const ex = planPriceExpectations();
  const by = Object.fromEntries(ex.map((x) => [x.plan, x]));
  ok(ex.map((x) => x.plan).join() === 'complete,complete_upfront,full,six,twelve,legacy_twelve', 'S1. every plan that can be charged is listed, the staff plan last');
  ok(by.complete.firstPence === 9900 && by.complete_upfront.firstPence === 99900 && by.full.firstPence === 49900 && by.six.firstPence === 9900 && by.twelve.firstPence === 9900, 'S2. first payments: £99, £999, £499, £99, £99');
  ok(by.complete.monthlyCount === 11 && by.complete.monthlyPence === 9900 && by.six.monthlyCount === 5 && by.six.monthlyPence === 9900 && by.twelve.monthlyCount === 11 && by.twelve.monthlyPence === 4999, 'S3. monthlies: 11 × £99, 5 × £99, 11 × £49.99');
  ok(by.complete_upfront.monthlyCount === 0 && by.complete_upfront.secrets.length === 0 && by.full.monthlyCount === 0 && by.full.secrets.length === 0, 'S4. the two one-payment plans need no Stripe Price');
  ok(by.complete.secrets.join() === 'FINDABLE_STANDARD_MONTHLY_PRICE_ID,FINDABLE_NEW_SITE_PRICE_ID' && by.twelve.secrets.join() === 'FINDABLE_REDUCED_MONTHLY_PRICE_ID', 'S5. the secrets are read in the order the webhook reads them');
  const env = (m: Record<string, string>) => (n: string) => m[n];
  ok(configuredPriceId(by.complete.secrets, env({ FINDABLE_NEW_SITE_PRICE_ID: 'price_abc123' })).secret === 'FINDABLE_NEW_SITE_PRICE_ID' && configuredPriceId(by.twelve.secrets, env({})).id === null && configuredPriceId(by.twelve.secrets, env({ FINDABLE_REDUCED_MONTHLY_PRICE_ID: 'prod_x' })).malformed, 'S6. the fallback secret is used when the first is unset; nothing set is nothing; a non-price id is malformed');
  const good = { unit_amount: 4999, currency: 'gbp', active: true, livemode: true, recurring: { interval: 'month', interval_count: 1 } };
  ok(priceProblem(4999, good) === null, 'S7. a live, active £49.99 monthly price is right for the 12-month plan');
  ok(/charges £99\.00, and the plan says £49\.99/.test(priceProblem(4999, { ...good, unit_amount: 9900 }) ?? ''), 'S8. a wrong amount is said in pounds');
  ok(/not a once-a-month/.test(priceProblem(4999, { ...good, recurring: { interval: 'year' } }) ?? '') && /archived/.test(priceProblem(4999, { ...good, active: false }) ?? '') && /TEST-mode/.test(priceProblem(4999, { ...good, livemode: false }) ?? '') && /no Price/.test(priceProblem(4999, null) ?? ''), 'S9. yearly, archived, test-mode and missing are each named');
  const fn = read('supabase/functions/sales-earnings/index.ts');
  ok(fn.indexOf('if (actor.role !== "admin") return await adminOnly();') < fn.indexOf('if (mode === "plan_prices")') && /price_tail: cfg\.id\.slice\(-6\)/.test(fn) && !/stripeAddEvents\([^)]*\)[\s\S]{0,40}plan_prices/.test(fn), 'S10. the check is admin only, read only, and returns only the tail of a Price id');
}

console.log('6. Hide earnings holds on the server');
{
  const helper = read('supabase/functions/_shared/earnings-hidden.ts');
  ok(/if \(actor\.role !== "sales"\) return false;/.test(helper) && /if \(error \|\| !data\?\.user\) return true;/.test(helper) && /catch[\s\S]{0,200}return true;/.test(helper), 'H1. only a salesperson can be hidden, and an unreadable account is hidden');
  const earn = read('supabase/functions/sales-earnings/index.ts');
  ok(/\(mode === "summary" \|\| mode === "owed"\) && await salesEarningsHidden\(service, actor\)/.test(earn) && earn.indexOf('salesEarningsHidden(service, actor)') < earn.indexOf('const earnings = await loadEarnings('), 'H2. sales-earnings refuses both of a salesperson\'s reads before any money is loaded');
  const perf = read('supabase/functions/sales-performance/index.ts');
  ok(/const moneyHidden = await salesEarningsHidden\(service, actor\);\s*if \(!moneyHidden\) try \{/.test(perf), 'H3. sales-performance loads no commission for a hidden salesperson');
}

console.log('7. a call they answered opens the Text button');
{
  const sms = read('supabase/functions/_shared/twilio-sms.ts');
  ok(/from\("call_logs"\)\.select\("id"\)\.eq\("lead_id", lead\.id\)\.not\("answered_at", "is", null\)/.test(sms), 'T1. the server reads Twilio\'s own answered stamp for this lead');
  ok(/loggedConversation: \(typeof block === "string" && block\.length > 0\) \|\| answeredCall,/.test(sms), 'T2. …and it counts as the conversation a text must follow');
  ok(/const gate = isCold \|\| smsGateOpen\(/.test(sms) && sms.indexOf('checkSuppressed(') < sms.indexOf('smsGateOpen('), 'T3. the gate itself, and the opt-out check before it, are unchanged');
  const hook = read('src/hooks/useSms.ts');
  ok(/answeredLead === leadId \|\| \(activity\.data \?\? \[\]\)\.some\(\(a\) => a\.kind === 'call_made'/.test(hook) && /\|\| answeredCall;/.test(hook), 'T4. the screen agrees: picked up in this session, or History holds the answered call');
  const live = read('src/components/LiveCall.tsx');
  ok(/const answeredLead = call\.answered && !call\.simulated \? call\.leadId : null;/.test(live), 'T5. a simulated call never counts');
}

console.log('8. first login: could not check is not no access; a waiting name tells Paul');
{
  const sub = read('src/hooks/useSubscription.tsx'), gate = read('src/components/RequireAccess.tsx');
  ok(/attempt < ROLE_READ_TRIES/.test(sub) && /setRoleError\(true\)/.test(sub) && /const ROLE_READ_TRIES = 3;/.test(sub), 'F1. the role read is retried, and a server that never answered is roleError');
  ok(/setRole\(data === 'admin' \|\| data === 'sales' \? data : null\);/.test(sub), 'F2. a role is still only the server\'s positive answer');
  ok(gate.indexOf('data-testid="access-unchecked"') > 0 && gate.indexOf('data-testid="access-unchecked"') < gate.indexOf('<h1 className="text-lg font-semibold">No access</h1>'), 'F3. the could-not-check screen comes before No access');
  const unchecked = gate.slice(gate.indexOf('if (!role && roleError)'), gate.indexOf('if (!role) {'));
  ok(/retryRole\(\)/.test(unchecked) && !/signOut/.test(unchecked), 'F4. it offers Try again, and never Sign out (which ends every session on the account)');
  const mig = read('supabase/migrations/20261210090000_message_name_pending_notice.sql');
  ok(/create trigger trg_profiles_message_name_pending_notice\s+after insert or update on public\.profiles/.test(mig) && /on conflict \(user_id, dedupe_key\) do nothing/.test(mig), 'F5. a name that starts waiting notifies the book owner once');
  ok(/'team_update'/.test(mig) && /'\/team'/.test(mig) && !/update public\.profiles|message_name\s*=/.test(mig.replace(/--.*$/gm, '')), 'F6. the notice is a bell that opens the Team page; the migration approves and changes no name');
  ok(/exception when others then/.test(mig), 'F7. a failed notice can never stop someone saving their name');
}

console.log('9. a salesperson can add a mobile to a lead that has none');
{
  ok(!leadHasMobile('0113 496 0000', 'UK') && !leadHasMobile(null, 'UK') && !leadHasMobile('', null), 'M1. a landline, or no number, is not a mobile');
  ok(leadHasMobile('07700 900123', 'UK') && leadHasMobile('+44 7700 900123', null) && leadHasMobile('+60123456789', 'UK'), 'M2. a UK mobile is, written either way; a number with its own country code is read as that country');
  ok(offerAddMobile('0113 496 0000', 'UK') && offerAddMobile(null, 'UK') && !offerAddMobile('07700 900123', 'UK'), 'M3. the box is offered only where the lead has no mobile');
  ok(typedMobileProblem('', 'UK') !== null && typedMobileProblem('0113 496 0000', 'UK') === ADD_MOBILE_REFUSAL_WORDS.not_a_mobile && typedMobileProblem(' 07700 900123 ', 'UK') === null, 'M4. a landline typed into the box is caught before the server is asked');
  ok(/another lead \(Stefan\)/.test(addMobileRefusalWords('duplicate', 'Stefan')) && addMobileRefusalWords('already_mobile') === ADD_MOBILE_REFUSAL_WORDS.already_mobile && /could not be added/.test(addMobileRefusalWords('something_new')), 'M5. each refusal has words; a duplicate names who has it; an unknown code still says it failed');
  const mig = read('supabase/migrations/20261210100000_lead_add_mobile.sql');
  const body = mig.slice(mig.indexOf('create or replace function public.lead_add_mobile'));
  ok(/add column if not exists phone_original text;/.test(mig) && !/default/i.test(mig.slice(mig.indexOf('add column'), mig.indexOf('comment on column'))), 'M6. the original number has its own plain column: no default, no table rewrite');
  ok(body.indexOf('perform public._require_work(_lead_id);') > 0 && body.indexOf('perform public._require_work(_lead_id);') < body.indexOf('from public.outreach_leads where id = _lead_id for update'), 'M7. the role and ownership check runs first, then the row is locked');
  ok(/public\.mobile_market\(v_country, v_pk\) is null[\s\S]{0,80}'not_a_mobile'/.test(body), 'M8. only a mobile for this lead\'s market is accepted (the rule every sender asks)');
  ok(/mobile_market\(v_country, public\.phone_key\(v_phone\)\) is not null and v_role is distinct from 'admin'[\s\S]{0,80}'already_mobile'/.test(body), 'M9. a salesperson cannot replace a number that is already a mobile');
  ok(/from public\.contact_suppressions s where s\.phone_e164 = v_new[\s\S]{0,60}'suppressed'/.test(body), 'M10. a number on the do-not-contact list is refused');
  ok(/pg_advisory_xact_lock\(hashtext\('lead_add_mobile:' \|\| v_pk\)\)/.test(body) && /o\.id <> _lead_id and public\.phone_key\(o\.phone\) = v_pk[\s\S]{0,200}'duplicate'/.test(body), 'M11. a number another lead holds is refused, one writer per number at a time');
  ok(/phone_original = coalesce\(phone_original, nullif\(btrim\(coalesce\(phone, ''\)\), ''\)\)/.test(body), 'M12. the FIRST number is kept, and never overwritten by a later change');
  ok(/insert into public\.lead_activity[\s\S]{0,160}'details_set'[\s\S]{0,160}'mobile_added', v_new, 'original_number'/.test(body), 'M13. History records who added which mobile, and the number it replaced');
  ok(/revoke all on function public\.lead_add_mobile\(uuid, text\) from public, anon;/.test(mig) && /grant execute on function public\.lead_add_mobile\(uuid, text\) to authenticated;/.test(mig), 'M14. signed-in people only');
  ok(/whatsapp_delivery_status = null, whatsapp_ever_delivered = false, sms_delivery_status = null/.test(body), 'M15. what was known about the old number (No mobile, No SMS) does not carry over to the new one');
  const ui = read('src/components/QuickCloseDialog.tsx');
  ok(/noMobile && v\.canEdit && <AddMobileBox/.test(ui) && /leadRpc\('lead_add_mobile', \{ _lead_id: leadId, _mobile: typed\.trim\(\) \}\)/.test(ui) && !/from\('outreach_leads'\)\.update/.test(ui), 'M16. the Close section asks the function; it never writes the lead itself');
  ok(/country: lead\.country \?\? null/.test(read('supabase/functions/quick-close/index.ts')), 'M17. the Close view carries the lead\'s country, so the screen and the server read the number the same way');
}

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
