/* THE OFFER FACT SHEET (2026-10-20, Paul) — src/lib/offerFactSheet.ts. Every figure on the sheet is pinned to the LIVE
   agreement text (src/lib/clientAgreement.ts), so a new agreement or a changed constant fails here before a reply can drift.
   Pure: nothing sends, calls a model or reads the database. */
import {
  FACT_SHEET, FACT_SHEET_AGREEMENT, FACT_SHEET_VERSION, GUARANTEE_LINE, ENGINE_WORDING, CASE_STUDIES, FACT_SHEET_CONFLICTS,
  caseStudyUsable, factFor, factSheetForPrompt,
} from '../src/lib/offerFactSheet.ts';
import { CLIENT_AGREEMENT_VERSION, agreementVersion } from '../src/lib/clientAgreement.ts';
import { AI_REPLY_SYSTEM_PROMPT } from '../src/lib/aiReplyDraft.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };

const v = agreementVersion(FACT_SHEET_AGREEMENT);
const clause = (num: string) => v.body.find((b) => b.kind === 'clause' && (b as { num?: string }).num === num) as { text: string } | undefined;
const say = (t: Parameters<typeof factFor>[0]) => factFor(t)?.say ?? '';

console.log('1. the sheet follows the live agreement');
ok(CLIENT_AGREEMENT_VERSION === FACT_SHEET_AGREEMENT, `the sheet is for the live agreement (${CLIENT_AGREEMENT_VERSION}); a new agreement needs a new sheet version`);
ok(/^\d{4}-\d{2}-\d{2}\.\d+$/.test(FACT_SHEET_VERSION), 'the sheet is versioned');
ok(/£99 initial payment, then 11 further monthly payments of £99 \(12 payments in total/.test(clause('3.1')?.text ?? '') && /£99 to start, then £99 a month, 12 payments in total including the first one/.test(say('price')), 'price: £99, then £99 a month, 12 payments (3.1)');
ok(/minimum term is 12 payments/.test(clause('4.1')?.text ?? '') && /12 payments/.test(say('term')) && /not a cancel any time plan/.test(say('term')), 'term: 12 payments, not cancel any time (4.1)');
ok(/day after the Refund Window ends/.test(clause('5.6')?.text ?? '') && /after your results and the 14 day refund window/.test(say('monthly_start')), 'monthly start: after the results and the refund window (5.6), not a fixed 42 days');
ok(/always yours/.test(clause('9.1')?.text ?? '') && /always yours/.test(say('domain')), 'domain: always theirs (9.1)');
ok(/after all 12 minimum-term payments/.test(clause('4.3')?.text ?? '') && /once all 12 payments are made/.test(say('ownership')), 'the site becomes theirs after payment 12 (4.3)');
ok(/£29\.99 a month/.test(clause('9A.2')?.text ?? '') && /remind you before payment 12/.test(clause('9A.5')?.text ?? '') && /optional £29\.99 a month/.test(say('after_term')) && /remind you before payment 12/.test(say('after_term')), 'after payment 12: optional £29.99, a reminder before payment 12 (9A)');
ok(/20 realistic customer-style questions, each asked 3 times/.test(clause('5.2')?.text ?? '') && /20 real customer style questions, 3 times each/.test(say('measurement')) && say('measurement').includes(ENGINE_WORDING), 'measurement: 20 questions × 3 runs, one engine wording (5.2)');
ok(/four weeks/.test(clause('5.3')?.text ?? '') && /4 weeks/.test(say('guarantee')), 're-measured after four weeks (5.3)');
ok(/refund of your £99 initial payment/.test(clause('5.4')?.text ?? '') && say('guarantee').startsWith(GUARANTEE_LINE) && /your £99 back/.test(say('guarantee')), 'guarantee: Paul\'s line word for word, then the £99 (5.4)');
ok(GUARANTEE_LINE === 'We improve AI visibility or you get your money back.', 'the guarantee line is exactly Paul\'s words');
ok(/Google Business Profile/.test(clause('7.1')?.text ?? '') && /Google Business Profile/.test(say('client_needs')) && /domain/.test(say('client_needs')) && /services and areas/.test(say('client_needs')), 'what the client gives: services and areas, the domain, GBP access (7.1)');
ok(/paul@findable\.live/.test(say('changes')) && v.findableDetails.some(([k, val]) => k === 'Email for notices' && val === 'paul@findable.live'), 'changes: email Paul at the agreement\'s address');
ok(factFor('provider')?.paulLooks === true && factFor('cancel')?.paulLooks === true, 'contract-exit answers flag Needs you (Paul looks first)');

console.log('2. nothing the agreement does not say');
const all = FACT_SHEET.map((x) => x.say).join(' ');
ok(!/\bunlimited\b|monthly audit|every month we|rank|first page|guaranteed? (to|you)|cancel any time\b(?! plan)/i.test(all.replace("It's not a cancel any time plan.", '')), 'no "unlimited", monthly audits, ranking promises or cancel-any-time');
ok(!/12[- ]month minimum|twelve[- ]month/i.test(all), 'counts payments, never "a 12-month minimum"');
ok(!/Optimise|£9\.99|£49\.99/.test(all), 'no withdrawn plan or retired price');
ok(FACT_SHEET.every((x) => x.status === 'live' ? !!x.source : true) && FACT_SHEET.filter((x) => x.source === 'paul').every((x) => x.topic === 'build_time'), 'every fact cites a clause; only the build time is Paul\'s own word');

console.log('3. case studies are drafts until Paul approves each');
ok(CASE_STUDIES.length === 4 && CASE_STUDIES.every((c) => c.status === 'draft' && !caseStudyUsable(c)), 'ABLM, MCL, BS4 and a review: all drafts, none usable');
ok(!caseStudyUsable({ id: 'x', label: 'x', status: 'approved', permission: 'yes', evidence: null, quote: 'q' }), 'approved without evidence is still not usable');
ok(!/ABLM|MCLocksmiths|BS4|case stud/i.test(factSheetForPrompt() + AI_REPLY_SYSTEM_PROMPT), 'no case study reaches the model');

console.log('4. the gaps are written down for Paul');
for (const id of ['monthly-start', 'term-words', 'engine-wording', 'build-time', 'reminder-12', 'case-studies']) ok(FACT_SHEET_CONFLICTS.some((c) => c.id === id), `conflict listed: ${id}`);

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
