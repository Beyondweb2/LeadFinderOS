/* The final sales release's own fixes (integration/final-sales-product-release, 2026-10-05).
   docs/pre-sales-certification/final-sales-product-release.md §4.
   1. Unsaved note + Escape (and every other way of leaving the lead workspace).
   2. A future salesperson start date — SUPERSEDED 2026-10-06 (sales-team-today, Paul): a start date, set or not,
      past or future, no longer stops selling; only account restrictions do (migration 20261012120000).
   3. A not-ready refusal names the real cause, never "usage paused" (E2E-02) — since 2026-10-06 that cause is
      always an account restriction: "Your sales access is not active … Speak to Paul."
   4. Quick Close link expiry in human words ("about 30 days", never "about 715 hours").
   5. The Welcome Pack's monthly start = the v3 agreement (found by the stale-wording sweep).
   Real modules; the browser half of 1 was driven in the visual QA harness (the record says what was seen). */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { escapeBelongsToField, leaveNeedsConfirm, makeDraftLedger, ESCAPE_CANCELS_EDIT } from '../src/components/UnsavedDraftGuard.tsx';
import { onboardingSummary, startDateReached, startsOnWords, ukToday, SELLING_GATE_KEYS, MISSING_KEY_WORDS } from '../src/lib/salespersonOnboarding.ts';
import { guardRefusalDetail, NOT_READY_DETAIL, USAGE_PAUSED_DETAIL } from '../src/lib/protectionLimits.ts';
import { missingItemWords, noteMyReadiness, notReadyMessage, onboardingWordsForPausedRefusal, refusalIsOnboarding, type ReadinessSnapshot } from '../src/lib/readinessWords.ts';
import { refusalText } from '../src/lib/salesCrm.ts';
import { campaignErrorText } from '../src/lib/campaignRules.ts';
import { callErrorText } from '../src/lib/csvLeadImport.ts';
import { guardRefusalReason, reasonText, startRefusalReason } from '../src/lib/salesCheck.ts';
import { linkTimeLeftWords, linkUsableUntilMs, SIGNUP_LINK_LIFETIME_MS } from '../src/lib/quickClose.ts';
import { AGREEMENT_KEY_POINTS } from '../src/lib/welcomePackHtml.ts';
import { MONTHLY_START_V3_WORDS } from '../src/lib/findableOffer.ts';

let failed = 0;
const ok = (c: unknown, m: string) => { if (c) console.log(`  ✓ ${m}`); else { failed++; console.log(`  ✗ ${m}`); } };
const ROOT = path.resolve(import.meta.dirname ?? __dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

console.log('── 1. unsaved drafts: the one leave guard ──');
{
  const l = makeDraftLedger();
  let went = 0, asked = 0;
  const go = () => { went++; }, ask = () => { asked++; };
  l.leave(go, ask);
  ok(went === 1 && asked === 0, 'nothing typed → Escape / close happens at once (no prompt)');
  l.mark('internal-note-1', true);
  l.leave(go, ask);
  ok(went === 1 && asked === 1, 'an unsaved note → asked first, NOT closed');
  l.mark('internal-note-1', false);
  l.leave(go, ask);
  ok(went === 2 && asked === 1, 'the note saved / cleared → closes normally again');
  l.mark('log-contact-note-2', true); l.mark('private-note', true);
  let keep = 0; l.leave(go, () => { keep++; });
  ok(keep === 1 && went === 2 && l.dirtyKeys().length === 2, 'Keep editing (the default) leaves everything as it was');
  l.discard(go);
  ok(went === 3 && l.dirtyKeys().length === 0, 'Discard → leaves and forgets the drafts');
  ok(!leaveNeedsConfirm([]) && leaveNeedsConfirm(['x']) && !leaveNeedsConfirm(new Set()), 'the decision is a positive match on a marked draft');
  const field = { closest: (sel: string) => (sel === `[${ESCAPE_CANCELS_EDIT}]` ? {} : null) };
  ok(escapeBelongsToField(field as unknown as EventTarget) && !escapeBelongsToField({ closest: () => null } as unknown as EventTarget) && !escapeBelongsToField(null),
    'Escape inside the name / contact-field edit cancels that edit only, never the popup');

  const dlg = read('src/components/LeadDetailDialog.tsx');
  const main = dlg.slice(dlg.indexOf('export function LeadDetailDialog'), dlg.indexOf('interface LeadDetailBodyProps'));
  ok(/<Dialog open=\{open\} onOpenChange=\{requestOpenChange\}>/.test(main) && /drafts\.guard\(\(\) => onOpenChange\(false\)\)/.test(main),
    'the workspace Dialog closes ONLY through the guard (Escape, outside click and the X are all Radix onOpenChange)');
  ok(/if \(escapeBelongsToField\(e\.target\)\) e\.preventDefault\(\);/.test(main), 'Escape in an inline edit never reaches the popup');
  ok(/if \(drafts\.asking\) \{ e\.preventDefault\(\); drafts\.keepEditing\(\); return; \}/.test(main) && /onInteractOutside=\{\(e\) => \{ if \(drafts\.asking\) e\.preventDefault\(\); \}\}/.test(main),
    'while the prompt shows, Escape = Keep editing and a click never counts as another leave (found in visual QA)');
  ok(/<StepperBar s=\{guardedStepper\} \/>/.test(main) && /guardedStepper\.onNext\(\)/.test(main) && /guardedStepper\.onPrev\(\)/.test(main) && !/stepper\.onNext\(\)/.test(main.replace(/guardedStepper/g, '')),
    'Previous / Next (buttons and ← / →) go through the same guard — a remount would lose the draft too');
  ok(/<DraftRegistryProvider registry=\{drafts\.registry\}>/.test(main) && /\{drafts\.confirm\}/.test(main), 'the body is inside the registry and the confirm is mounted');
  ok(/useUnsavedDraft\('private-note', isEditingNotes && notesDirty\)/.test(dlg), 'the private note marks itself while unsaved');
  ok((dlg.match(/\{\.\.\.\{ \[ESCAPE_CANCELS_EDIT\]: '' \}\}/g) ?? []).length === 2, 'both inline edits (name, contact field) carry the Escape-cancels-edit marker');
  const crm = read('src/components/LeadCrmPanel.tsx');
  ok(/function InternalNote[\s\S]{0,200}useUnsavedDraft\(`internal-note-\$\{useId\(\)\}`, note\.trim\(\) !== ''\)/.test(crm), 'Internal note marks itself while it holds text');
  const flow = read('src/components/LeadCallFlow.tsx');
  ok(/useUnsavedDraft\(`log-outcome-note-\$\{useId\(\)\}`, note\.trim\(\) !== ''\)/.test(flow), 'the Log window\'s note marks itself (and outlives the window: its state is outside the dialog)');
  ok(/useUnsavedDraft\(`profile-\$\{draftId\}`, editing && !!lead && \(/.test(crm), 'the Details editor marks itself only when a field differs from what was opened');
  const g = read('src/components/UnsavedDraftGuard.tsx');
  ok(/Discard unsaved changes\?/.test(g) && /<AlertDialogCancel autoFocus[^>]*>Keep editing<\/AlertDialogCancel>/.test(g) && />\s*Discard\s*</.test(g),
    'the prompt: "Discard unsaved changes?" — [Keep editing] (focused, the safe default) [Discard]');
}

console.log('\n── 2. a start date is recorded, and (since 2026-10-06) never stops selling ──');
{
  const T = '2026-10-12';
  ok(startDateReached(T, T), 'start date = today → started');
  ok(startDateReached('2026-10-01', T), 'start date in the past → started');
  ok(!startDateReached('2026-10-13', T), 'start date tomorrow → NOT started');
  ok(!startDateReached('2026-11-12', T), 'start date next month → NOT started');
  ok(!startDateReached(null, T) && !startDateReached('', T) && !startDateReached('12/10/2026', T), 'absent / unreadable → not started (never assumed)');
  // UK date boundary (BST, UTC+1): 23:30 UTC on 11 Oct is already 12 Oct in London; 22:59 UTC is still 11 Oct.
  ok(ukToday(new Date('2026-10-11T23:30:00Z')) === '2026-10-12' && startDateReached('2026-10-12', ukToday(new Date('2026-10-11T23:30:00Z'))),
    'UK boundary (BST): 00:30 London on the start date → started, though UTC still says the day before');
  ok(ukToday(new Date('2026-10-11T22:59:00Z')) === '2026-10-11' && !startDateReached('2026-10-12', ukToday(new Date('2026-10-11T22:59:00Z'))),
    'UK boundary (BST): 23:59 London the night before → not yet');
  ok(ukToday(new Date('2026-12-01T00:30:00Z')) === '2026-12-01', 'UK boundary (GMT, winter): London = UTC');
  ok(startsOnWords('2026-10-12', '2026-10-06') === 'Starts on 12 October', '"Starts on 12 October" (this year)');
  ok(startsOnWords('2027-01-04', '2026-10-06') === 'Starts on 4 January 2027', 'a start date next year names the year');
  const base = { user_id: 'u', age_18_confirmed_on: '2026-10-01', rtw_result: 'pass', rtw_method: 'manual_video_call', rtw_checked_on: '2026-10-01',
    rtw_checked_by: 'Paul', rtw_evidence_ref: 'folder', bank_details_received_on: '2026-10-01', vat_registered: false, contractor_type: 'individual',
    team_guide_version: 'team-guide-2026-10-02', team_guide_acknowledged_on: '2026-10-01' } as Record<string, unknown>;
  const member = { status: 'active', role: 'sales' as const, has_signed_in: true };
  const docs = [{ id: 'team-guide-2026-10-02', kind: 'team_guide', label: 'Team guide', status: 'approved' }] as never;
  const sum = (start: string | null, today: string) => onboardingSummary({ ...base, start_date: start } as never, member, docs, today);
  const fut = sum('2026-10-12', '2026-10-06');
  const item = fut.items.find((i) => i.key === 'start_date')!;
  ok(fut.readyToSell && item.done && item.detail === 'Starts on 12 October', `future start → CAN sell, the checklist says "${item.detail}" (2026-10-06)`);
  ok(sum('2026-10-06', '2026-10-06').readyToSell, 'start today → Ready (every other item done)');
  ok(sum('2026-10-01', '2026-10-06').readyToSell, 'start in the past → Ready');
  const unset = sum(null, '2026-10-06').items.find((i) => i.key === 'start_date')!;
  ok(sum(null, '2026-10-06').readyToSell && !unset.done && unset.detail === 'Not set.', 'no start date → still CAN sell; the checklist says "Not set." (2026-10-06)');
  ok(!(SELLING_GATE_KEYS as readonly string[]).includes('not_started') && !!MISSING_KEY_WORDS.not_started,
    'not_started is no longer a selling-gate key; an older server answer naming it still reads in plain words');
  /* The 20261011120000 file is history (applied, then superseded by 20261012120000); its text is pinned as written. */
  const mig = read('supabase/migrations/20261011120000_ready_to_sell_start_date.sql');
  const fn = mig.slice(mig.indexOf('create or replace function public.salesperson_onboarding_missing'), mig.indexOf('revoke all on function public.salesperson_onboarding_missing'));
  ok(/if r\.start_date is null then m := m \|\| 'start_date'::text;\s*\n(\s*--[^\n]*\n)?\s*elsif r\.start_date > v_today then m := m \|\| 'not_started'::text; end if;/.test(fn),
    'SQL: NULL → start_date; > today (London) → not_started; today or earlier passes');
  ok(/v_today date := \(now\(\) at time zone 'Europe\/London'\)::date;/.test(fn), "SQL: today is the London calendar day");
  const prev = read('supabase/migrations/20261010140000_ready_to_sell_without_paperwork.sql');
  const prevFn = prev.slice(prev.indexOf('create or replace function public.salesperson_onboarding_missing'), prev.indexOf('revoke all on function public.salesperson_onboarding_missing'));
  ok(fn.replace(/\n\s*-- ⛔ A START DATE STILL TO COME[^\n]*\n\s*elsif r\.start_date > v_today then m := m \|\| 'not_started'::text; end if;/, ' end if;') === prevFn,
    'SQL: the body is the live 20261010140000 body plus exactly the one rule');
  ok(/'starts_on', v_start/.test(mig) && /if 'not_started' = any\(v_missing\) then/.test(mig), "my_onboarding_status returns their own start date only while it is to come");
  ok(/grant execute on function public\.my_onboarding_status\(\) to authenticated;/.test(mig) && /revoke all on function public\.salesperson_onboarding_missing\(uuid\) from public, anon, authenticated;/.test(mig),
    'grants unchanged: the rule is service-role only, the own-status read is for signed-in people');
}

console.log('\n── 3. a not-ready refusal names the real cause: sales access not active (2026-10-06) ──');
{
  ok(guardRefusalDetail('not_onboarded', 'sales') === NOT_READY_DETAIL && NOT_READY_DETAIL === 'Your sales access is not active. Speak to Paul.', 'server: not_onboarded → "Your sales access is not active. Speak to Paul."');
  for (const r of ['paused', 'all_stop', 'suspended', 'rate_limit', 'spend_cap', 'team_cap', 'not_allowed', 'guard_unavailable', null])
    ok(guardRefusalDetail(r, 'sales') === USAGE_PAUSED_DETAIL, `server: ${r ?? 'no reason'} → still "${USAGE_PAUSED_DETAIL}" (never turned into onboarding)`);
  ok(/emergency stop/i.test(guardRefusalDetail('all_stop', 'admin')) && guardRefusalDetail('not_onboarded', 'admin') !== NOT_READY_DETAIL, 'the admin wording is unchanged');
  const prot = read('supabase/functions/_shared/protection.ts');
  ok(/const error = reason === "not_onboarded" \? "not_ready_to_sell" as const : "usage_paused" as const;/.test(prot), 'server: the refusal body carries not_ready_to_sell for an incomplete onboarding only');
  ok(/reason === "suspended" \|\| reason === "not_allowed" \|\| reason === "not_onboarded"\) return refusal\(reason, role, 403\)/.test(prot), 'server: not_onboarded answers 403 (a permission, not a rate limit)');

  const S = (o: Partial<ReadinessSnapshot>): ReadinessSnapshot => ({ gated: true, ready: false, missing: ['login'], startsOn: null, failed: false, loaded: true, ...o });
  ok(refusalIsOnboarding(S({})), 'a loaded, not-ready (login off), unsuspended salesperson → the access-restriction words');
  ok(!refusalIsOnboarding(S({ missing: ['suspended', 'login'] })), 'suspended → NOT these words (the guard says suspended first)');
  ok(!refusalIsOnboarding(S({ ready: true, missing: [] })), 'a ready rep → a genuine pause stays a pause');
  ok(!refusalIsOnboarding(S({ loaded: false })) && !refusalIsOnboarding(S({ failed: true })) && !refusalIsOnboarding(null), 'unread / failed status → never claimed to be onboarding');
  ok(!refusalIsOnboarding(S({ gated: false, ready: true, missing: [] })), 'the admin → never');
  ok(notReadyMessage('Find Leads', ['ended', 'agreement'], null, '2026-10-06') === 'Your sales access is not active, so Find Leads is not available (engagement ended). Speak to Paul.',
    'Find Leads: the account restriction in plain words (paperwork never listed)');
  ok(notReadyMessage(null) === 'Your sales access is not active. Speak to Paul.' && !/onboarding/i.test(notReadyMessage('Find Leads', ['login'])), 'no feature, no keys → the plain sentence; never "onboarding"');
  ok(missingItemWords(['not_started'], null)[0] === MISSING_KEY_WORDS.not_started, 'no date known → plain words, never a blank');

  noteMyReadiness(S({ missing: ['login'] }));
  ok(refusalText('usage_paused') === 'Your sales access is not active (login not active). Speak to Paul.', 'claim / add lead: usage_paused from a restricted rep → the access words');
  ok(/^Your sales access is not active/.test(campaignErrorText('usage_paused')), 'campaigns / queue: the same');
  ok(/^Your sales access is not active, so CSV import is not available/.test(callErrorText({ ok: false, error: 'usage_paused', reason: null } as never)), 'CSV import: the same');
  ok(/^Your sales access is not active, so Find Leads is not available/.test(onboardingWordsForPausedRefusal('Find Leads') ?? ''), 'Find Leads (older server answer): the same');
  noteMyReadiness(S({ ready: true, missing: [] }));
  ok(refusalText('usage_paused') === 'Usage temporarily paused — contact Paul' && campaignErrorText('usage_paused') === 'Usage temporarily paused — contact Paul', 'a READY rep keeps the genuine pause wording');
  noteMyReadiness(S({ missing: ['suspended'] }));
  ok(refusalText('usage_paused') === 'Usage temporarily paused — contact Paul', 'a SUSPENDED rep keeps the suspension (paused) wording');
  noteMyReadiness(null);
  ok(refusalText('usage_paused') === 'Usage temporarily paused — contact Paul', 'status unknown → unchanged');
  ok(callErrorText({ ok: false, error: 'usage_paused', reason: 'all_stop' } as never).startsWith('Imports are paused'), 'the admin\'s CSV pause wording unchanged');

  /* The salesCheck wording itself is src's to own (it still says "Complete your onboarding before starting checks" —
     reported to the release owner, 2026-10-06); pinned here: the mapping, and that it is never an allowance message. */
  ok(guardRefusalReason('not_onboarded') === 'not_ready' && !!reasonText('not_ready') && !/allowance/i.test(reasonText('not_ready')), 'pre-call checks: not_onboarded → its own not-ready words, never "allowance used"');
  ok(guardRefusalReason('rate_limit') === 'allowance_used' && guardRefusalReason('paused') === 'paused' && guardRefusalReason('suspended') === 'not_allowed', 'pre-call checks: the other reasons are unchanged');
  ok(startRefusalReason({ error: 'not_ready_to_sell' }).reason === 'not_ready' && startRefusalReason({ error: 'usage_paused' }).reason === 'paused', 'create-ai-audit refusals map the same way');
  const ei = read('src/lib/edgeInvoke.ts');
  ok(/export function edgeErrorMessage\(e: unknown, fallback\?: string\): string \{/.test(ei) && /e\.code === 'not_ready_to_sell'/.test(ei)
    && /e\.code === 'usage_paused'\) \{ const w = onboardingWordsForPausedRefusal\(\); if \(w\) return w; \}/.test(ei) && /return coreEdgeErrorMessage\(e, fallback\);/.test(ei)
    && !/export \{[^}]*edgeErrorMessage[^}]*\} from '\.\/edgeInvokeCore'/.test(ei),
    'every edge refusal shown through edgeErrorMessage gets the same onboarding words (functions not redeployed this release included); everything else unchanged');
  const idx = read('src/pages/Index.tsx');
  ok(/title: 'Your sales access is not active\.'/.test(idx) && /title: 'Checking your access'/.test(idx) && /title: 'Could not check your access'/.test(idx)
    && !/Find Leads is paused|Complete your onboarding/.test(idx), 'Find Leads\' own pre-check says the cause: access not active (and "Checking" / "Could not check" while unknown)');
  ok(/noteMyReadiness\(/.test(read('src/hooks/useMyReadiness.ts')) && (read('src/lib/readinessWords.ts').match(/noteMyReadiness/g) ?? []).length >= 1,
    'the readiness the words read is the server answer (my_onboarding_status), written by useMyReadiness only');
}

console.log('\n── 4. Quick Close link expiry in human words ──');
{
  const H = 3_600_000, D = 24 * H;
  ok(linkTimeLeftWords(715 * H) === 'send it within about 30 days', `715 hours → "${linkTimeLeftWords(715 * H)}"`);
  const gen = Date.parse('2026-10-05T10:00:00Z');
  const until = linkUsableUntilMs({ link_url: 'https://findable.live/agree/x', link_kind: 'signup', link_generated_at: new Date(gen).toISOString(), link_expires_at: new Date(gen + SIGNUP_LINK_LIFETIME_MS).toISOString() } as never)!;
  ok(linkTimeLeftWords(until - gen) === 'send it within about 30 days', 'a fresh sign-up link (its real lifetime, unchanged) → "about 30 days"');
  ok(linkTimeLeftWords(3 * D + 2 * H) === 'send it within about 3 days', '3 days → days');
  ok(linkTimeLeftWords(47 * H) === 'send it within about 47 hours' && linkTimeLeftWords(1.5 * H) === 'send it within about 1 hour', 'under two days → hours');
  ok(linkTimeLeftWords(20 * 60_000) === 'send it within the hour' && linkTimeLeftWords(0) === 'expired' && linkTimeLeftWords(NaN) === 'expired', 'under an hour / expired / unreadable');
  ok(SIGNUP_LINK_LIFETIME_MS === 30 * D, 'the link lifetime itself is not changed (30 days)');
  ok(/return linkTimeLeftWords\(Date\.parse\(iso\) - Date\.now\(\)\);/.test(read('src/components/QuickCloseDialog.tsx')), 'the Close panel uses the one wording');
}

console.log('\n── 5. the Welcome Pack names the v3 monthly start ──');
{
  for (const route of ['build', 'optimise', 'unknown'] as const)
    ok(AGREEMENT_KEY_POINTS[route].includes(`Monthly payments start ${MONTHLY_START_V3_WORDS}.`) && !AGREEMENT_KEY_POINTS[route].some((l) => /six weeks after your first payment/i.test(l)), `${route}: the v3 Payment Start words, never "six weeks after your first payment"`);
  const wp = read('src/lib/welcomePackHtml.ts');
  ok(!/Six weeks after your first payment/i.test(wp), 'no "six weeks after your first payment" anywhere in the pack');
}

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');
