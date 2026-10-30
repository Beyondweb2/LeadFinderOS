/* THE OFFER FACT SHEET (2026-10-20, Paul) — src/lib/offerFactSheet.ts. Every figure on the sheet is pinned to the LIVE
   agreement text (src/lib/clientAgreement.ts), so a new agreement or a changed constant fails here before a reply can drift.
   Pure: nothing sends, calls a model or reads the database. */
import {
  FACT_SHEET, FACT_SHEET_AGREEMENT, FACT_SHEET_VERSION, GUARANTEE_LINE, ENGINE_WORDING, CASE_STUDIES, FACT_SHEET_CONFLICTS,
  caseStudyUsable, factFor, factSheetForPrompt,
} from '../src/lib/offerFactSheet.ts';
import { agreementVersion } from '../src/lib/clientAgreement.ts';
import { agreementVersionForPlan } from '../src/lib/paymentPlans.ts';
import { AI_REPLY_SYSTEM_PROMPT } from '../src/lib/aiReplyDraft.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };

const v = agreementVersion(FACT_SHEET_AGREEMENT);
const clause = (num: string) => v.body.find((b) => b.kind === 'clause' && (b as { num?: string }).num === num) as { text: string } | undefined;
const say = (t: Parameters<typeof factFor>[0]) => factFor(t)?.say ?? '';

console.log('1. the sheet follows the agreement new sales sign (v7, the two plans)');
ok(FACT_SHEET_AGREEMENT === 'v7' && agreementVersionForPlan('six') === FACT_SHEET_AGREEMENT && agreementVersionForPlan('complete') === FACT_SHEET_AGREEMENT && FACT_SHEET_VERSION >= '2026-10-30', `the sheet is for v7, the agreement every new plan signs; a new agreement needs a new sheet version`);
ok(/^\d{4}-\d{2}-\d{2}\.\d+$/.test(FACT_SHEET_VERSION), 'the sheet is versioned');
ok(/Findable Complete: a £99 initial payment, then 11 further monthly payments of £99/.test(clause('3.1')?.text ?? '') && /Findable Complete is £99 a month, 12 payments in total/.test(say('price')) && /pay in full: £499, one payment/.test(clause('3.1')?.text ?? '') && /£99 initial payment, then 5 further monthly payments of £99/.test(clause('3.1')?.text ?? '') && /11 further monthly payments of £49\.99/.test(clause('3.1')?.text ?? '') && /£499 once, or £99 a month for 6 months, or £99 to start then £49\.99 a month, 12 payments in total/.test(say('price')), 'price: the three plans (3.1)');
ok(/minimum term is all the payments in your plan/.test(clause('4.1')?.text ?? '') && /all the payments in your plan/.test(say('term')) && /not a cancel any time plan/.test(say('term')), 'term: all the payments in the plan, not cancel any time (4.1)');
ok(/day after the Refund Window ends/.test(clause('5.6')?.text ?? '') && /after your results and the 7 day refund window/.test(say('monthly_start')) && /7 days after the Results Date/.test(clause('5.4')?.text ?? ''), 'monthly start: after the results and the refund window (5.6), not a fixed 42 days');
ok(/always yours/.test(clause('9.1')?.text ?? '') && /always yours/.test(say('domain')), 'domain: always theirs (9.1)');
ok(/final payment has cleared/.test(clause('4.3')?.text ?? '') && /once your final payment clears/.test(say('ownership')), 'the site becomes theirs once the final payment clears (4.3)');
ok(/£29\.99 a month/.test(clause('9A.2')?.text ?? '') && /remind you before the Plan Period ends/.test(clause('9A.5')?.text ?? '') && /optional £29\.99 a month/.test(say('after_term')) && /6 months on pay in full/.test(say('after_term')), 'after the plan: optional £29.99, 6 months included on pay in full (9.2, 9A)');
ok(/20 realistic customer-style questions, each asked 3 times/.test(clause('5.2')?.text ?? '') && /20 real customer style questions, 3 times each/.test(say('measurement')) && say('measurement').includes(ENGINE_WORDING), 'measurement: 20 questions × 3 runs, one engine wording (5.2)');
ok(/28 days after the Baseline Date/.test(clause('5.3')?.text ?? '') && /4 weeks/.test(say('guarantee')), 're-measured four weeks (28 days) after the baseline (5.3)');
ok(/refund of all payments you have made/.test(clause('5.4')?.text ?? '') && say('guarantee').startsWith(GUARANTEE_LINE) && /everything you've paid/.test(say('guarantee')), 'guarantee: Paul\'s line word for word, then everything paid back (5.4)');
ok(GUARANTEE_LINE === 'We improve AI visibility or you get your money back.', 'the guarantee line is exactly Paul\'s words');
ok(/Google Business Profile/.test(clause('7.1')?.text ?? '') && /Google Business Profile/.test(say('client_needs')) && /domain/.test(say('client_needs')) && /services and areas/.test(say('client_needs')), 'what the client gives: services and areas, the domain, GBP access (7.1)');
ok(/paul@findable\.live/.test(say('changes')) && v.findableDetails.some(([k, val]) => k === 'Email for notices' && val === 'paul@findable.live'), 'changes: email Paul at the agreement\'s address');
ok(factFor('provider')?.paulLooks === true && factFor('cancel')?.paulLooks === true, 'contract-exit answers flag Needs you (Paul looks first)');

console.log('2. nothing the agreement does not say');
const all = FACT_SHEET.map((x) => x.say).join(' ');
ok(!/\bunlimited\b|monthly audit|every month we|rank|first page|guaranteed? (to|you)|cancel any time\b(?! plan)/i.test(all.replace("It's not a cancel any time plan.", '')), 'no "unlimited", monthly audits, ranking promises or cancel-any-time');
ok(!/12[- ]month minimum|twelve[- ]month/i.test(all), 'counts payments, never "a 12-month minimum"');
ok(!/Optimise|£9\.99/.test(all), 'no withdrawn plan or retired price (£49.99 is the 12-month monthly since 2026-10-29)');
ok(FACT_SHEET.every((x) => x.status === 'live' ? !!x.source : true) && FACT_SHEET.filter((x) => x.source === 'paul').every((x) => x.topic === 'build_time'), 'every fact cites a clause; only the build time is Paul\'s own word');

console.log('3. case studies are drafts until Paul approves each');
ok(CASE_STUDIES.length === 4 && CASE_STUDIES.every((c) => c.status === 'draft' && !caseStudyUsable(c)), 'ABLM, MCL, BS4 and a review: all drafts, none usable');
ok(!caseStudyUsable({ id: 'x', label: 'x', status: 'approved', permission: 'yes', evidence: null, quote: 'q' }), 'approved without evidence is still not usable');
ok(!/ABLM|MCLocksmiths|BS4|case stud/i.test(factSheetForPrompt() + AI_REPLY_SYSTEM_PROMPT), 'no case study reaches the model');

console.log('4. the gaps are written down for Paul');
for (const id of ['monthly-start', 'term-words', 'engine-wording', 'build-time', 'reminder-12', 'case-studies']) ok(FACT_SHEET_CONFLICTS.some((c) => c.id === id), `conflict listed: ${id}`);

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
