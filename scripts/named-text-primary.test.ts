/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE ANSWER TEXT IS THE EVIDENCE OF "NAMED" — a verdict about it may not contradict it.

   🔴 THE FAULT (MCLocksmiths' frozen baseline, 2026-09-22). The model verdict said "not named" on
   five answers that plainly list "MC Locksmiths" in prose and "named" on two that never mention the
   business; the string fallback could not see "MC Locksmiths" as "MCLocksmiths centre". 34 of 120
   read where the text says 39.

   Run: npx tsx scripts/named-text-primary.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { answerProse, nameIsTextJudgeable, nameMatches, tokensContainJoined } from '../src/lib/nameMatch';
import { cellNamed, namedEvidence, namedInMode, type NamedContext } from '../src/lib/namedSignal';
import { buildBaselineView } from '../src/lib/baselineView';
import { buildReportData, type EngineResult, type QueueRow } from '../src/lib/auditReport';

const checks: Array<[string, boolean]> = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

const MCL: NamedContext = { businessName: 'MCLocksmiths centre', trade: 'Locksmiths', town: 'Canterbury' };
const m = (text: string) => nameMatches(answerProse(text), 'MCLocksmiths centre', { trade: 'Locksmiths', town: 'Canterbury' });

// 1. Spelling variants of the same name.
check('joined vs split: "MC Locksmiths" names "MCLocksmiths centre"', m('* **MC Locksmiths** - advertises 24/7 Ramsgate coverage'));
check('stored spelling still matches', m('MCLocksmiths centre - Canterbury-based, lists gearbox replacement') && m('**MCLocksmiths centre** 5.0 · Keytek'));
check('case and punctuation: "M.C. Locksmiths", "mc-locksmiths", "MC LOCKSMITHS"', m('Try M.C. Locksmiths on Walden Court') && m('mc-locksmiths came recommended') && m('MC LOCKSMITHS · 24/7'));
check('joined with the suffix: "MC Locksmiths centre"', m('MC Locksmiths centre and Keytek both cover Canterbury'));
check('name with the owner: "MC Locksmiths / Morgan C."', m('* **MC Locksmiths / Morgan C.** - advertises 24/7 coverage in Faversham'));
check('a legal suffix is not identity', nameMatches('Brownlee Roofing were quick', 'Brownlee Roofing Ltd') && nameMatches('Sinners N Saints is open late', 'Sinners and Saints Pool Bar Ltd'));

// 2. Similar competitors are NOT the business.
check('rival "MCA Locksmiths" does not match', !m('* **MCA (Essex) Locksmiths** - covers Clacton') && !m('MCA Locksmiths came out fast'));
check('rival "Locksmiths Canterbury" does not match', !m('**Locksmiths Canterbury** 5.0 - local locksmith at Wincheap'));
check('rival "Castle Locksmiths Kent", "Keytek", "LockFit Canterbury" do not match', !m('Castle Locksmiths Kent, Keytek and LockFit Canterbury Locksmiths all advertise multipoint repairs'));
check('the trade and town alone never match', !m('There are several locksmiths in Canterbury who can help with a lockout.'));
check('a fragment inside a longer word does not match', !tokensContainJoined(['somclocksmithsx'], ['mclocksmiths']) && !tokensContainJoined(['mclocksmithsworld'], ['mclocksmiths']));
check('a short first name is never a lone needle', !nameMatches('Lewis & Co handled the probate', 'Lewis Brownlee Chartered Accountants', { trade: 'Accountants', town: 'Chichester' }));

// 3. Citation-only is not named.
check('a cited domain in the prose is not a naming', !m('Sources: https://mc-locksmiths.com/services and checkatrade.com') && !m('See mc-locksmiths.com for prices'));
check('a markdown link to the site is not a naming, its label is judged', !m('[their site](https://mc-locksmiths.com/) lists prices') && m('[MC Locksmiths](https://mc-locksmiths.com/) lists prices'));
const citedOnly = { self_named: false, named: true, answer_text: 'Keytek covers Ramsgate. [1] https://mc-locksmiths.com/', citations: [{ title: 'MC Locksmiths', url: 'https://mc-locksmiths.com/' }] };
check('cellNamed: a client citation with no naming in the prose is NOT named', cellNamed(citedOnly, MCL) === false);

// 4. The text overrides a wrong verdict in both directions; verdicts still decide when the text cannot.
const falseNo = { self_named: false, named: false, answer_text: '* **MC Locksmiths** - covers all of Herne Bay (CT6) 24/7' };
const falseYes = { self_named: true, named: false, answer_text: 'Keytek and Castle Locksmiths Kent both cover Canterbury after a break-in.' };
check('a false "not named" verdict cannot hide a clear naming', cellNamed(falseNo, MCL) === true && namedEvidence(falseNo, MCL) === 'text');
check('a false "named" verdict cannot invent one', cellNamed(falseYes, MCL) === false && namedEvidence(falseYes, MCL) === 'text');
check('no context → the old behaviour, exactly', cellNamed(falseNo) === false && cellNamed(falseYes) === true && namedEvidence(falseYes) === 'model');
check('no answer text → the model verdict', cellNamed({ self_named: true, named: false }, MCL) === true && namedEvidence({ self_named: true }, MCL) === 'model');
const tradeTown: NamedContext = { businessName: 'Locksmiths Canterbury', trade: 'Locksmiths', town: 'Canterbury' };
check('a trade-and-town name is not text-judgeable → the model verdict decides', !nameIsTextJudgeable('Locksmiths Canterbury', { trade: 'Locksmiths', town: 'Canterbury' }) && cellNamed({ self_named: false, named: true, answer_text: 'Locksmiths Canterbury is at Wincheap' }, tradeTown) === false);
check('without trade or town the text is not trusted to judge', !nameIsTextJudgeable('MCLocksmiths centre', {}) && cellNamed(falseNo, { businessName: 'MCLocksmiths centre' }) === false);
check('namedInMode: the text wins over legacy mode when it can judge', namedInMode(falseNo, 'legacy', MCL) === true && namedInMode(falseNo, 'legacy') === false);

// 5. Three-run and total arithmetic stay consistent across the internal view and the report.
const cell = (o: Partial<EngineResult>): EngineResult => ({ named: false, position: null, competitors: [], citations: [], answer_text: 'Keytek covers Canterbury.', ...o });
const q = 'Who offers emergency locksmith services in Herne Bay?';
const runs: Array<Record<string, EngineResult>> = [
  { chatgpt: cell({ self_named: true, named: false, answer_text: '* **MC Locksmiths** - advertises 24/7 coverage across Herne Bay' }), gemini: cell({ self_named: false }) },
  { chatgpt: cell({ self_named: false, named: false, answer_text: '* **MC Locksmiths** - covers all of Herne Bay (CT6) 24/7' }), gemini: cell({ self_named: false }) },
  { chatgpt: cell({ self_named: true, named: true, answer_text: '**MCLocksmiths centre** 5.0 · Keytek' }), gemini: cell({ self_named: true, answer_text: 'Keytek is the main option in Herne Bay.' }) },
];
const queueRows: QueueRow[] = runs.map((r, i) => ({ id: `q-${i}`, question: q, status: 'done', result: r }));
const lite = runs.map((r, i) => ({ run_id: `run-${i + 1}`, question: q, engines: ['chatgpt', 'gemini'], status: 'done', result: r }));
const view = buildBaselineView(lite, { businessName: MCL.businessName, trade: MCL.trade, town: MCL.town });
const report = buildReportData(queueRows, null, { businessName: MCL.businessName!, businessType: MCL.trade!, locationText: MCL.town!, specialisms: '', isAggregatorUrl: () => false, ownWebsite: 'https://mc-locksmiths.com/' }) as unknown as { named: number; total: number; questionBreakdown: Array<{ perEngine: Array<{ label: string; named: number; recommended?: number }> }> };
const eng = (label: string) => report.questionBreakdown[0].perEngine.find((e) => e.label === label)!;
check('three runs: ChatGPT 3 of 3 by the text (one false "no" verdict overridden)', view.questions[0].engines.chatgpt.named === 3 && eng('ChatGPT').named === 3 && eng('ChatGPT').recommended === 3);
check('three runs: Gemini 0 of 3 by the text (one false "yes" verdict overridden)', view.questions[0].engines.gemini.named === 0 && eng('Gemini').named === 0);
check('totals: view and report agree, 3 of 6', view.namedCells === 3 && view.answeredCells === 6 && report.named === 3 && report.total === 6 && view.namedRatePct === 50);

let failures = 0;
for (const [label, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++; }
if (failures) throw new Error(`${failures} failures`);
