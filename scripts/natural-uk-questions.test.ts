/* NATURAL UK QUESTIONS (Paul, 2026-11-20; docs/natural-question-wording.md).
   New UK audit questions name the town the way people type it — never "UK". The ask itself runs from the UK
   (actor countryCode "gb"). A town shared with a bigger place abroad gets its local form. Other countries unchanged. */
import { readFileSync } from 'node:fs';
import { questionPlaceSuffix, ukLocalPlaceName, naturalUkQuestion, qualifyPlace, hookPlaceFor } from '../src/lib/seedGuard.ts';
import { toCustomerQuestion, coreQuestions, areaCoreQuestion, placeWithCountry } from '../src/lib/customerQuestion.ts';
import { buildAiSearchInput, toCountryCode } from '../supabase/functions/_shared/enrichment/ai-search.ts';
import { abroadSignals, abroadFlagText, isUkAuditCountry } from '../src/lib/abroadAnswer.ts';

let failures = 0;
const eq = (got: unknown, want: unknown, label: string) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (!pass) failures++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${label}${pass ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
};

console.log('── the ask runs from the UK ──');
eq(toCountryCode('UK'), 'gb', 'a UK lead → countryCode gb');
eq(toCountryCode(null), 'gb', 'a blank country → gb');
eq(buildAiSearchInput('plumber in Leeds', 'gb').countryCode, 'gb', 'every normal run sends gb');
eq(buildAiSearchInput('plumber in Leeds', 'gb', { lane: 'chatgpt' }).countryCode, 'gb', '…and every one-engine lane too');

console.log('── the suffix ──');
eq(questionPlaceSuffix('UK'), '', 'UK → no suffix');
eq(questionPlaceSuffix(null), '', 'blank → no suffix (UK-first)');
eq(questionPlaceSuffix('India'), 'India', 'India keeps its suffix');
eq(questionPlaceSuffix('Ireland'), 'Ireland', 'Ireland keeps its suffix');

console.log('── the town ──');
eq(ukLocalPlaceName('Leeds'), 'Leeds', 'an ordinary town is left alone');
eq(ukLocalPlaceName('Leeds UK'), 'Leeds', 'a typed "UK" is dropped');
eq(ukLocalPlaceName('Wisbech, UK'), 'Wisbech', '…with a comma too');
eq(ukLocalPlaceName('Newcastle'), 'Newcastle', 'Newcastle stayed in the UK bare in the test → left as typed');
eq(ukLocalPlaceName('halifax uk'), 'Halifax, West Yorkshire', 'halifax uk → Halifax, West Yorkshire (Gemini went to Nova Scotia)');
eq(ukLocalPlaceName('Lincoln'), 'Lincoln, Lincolnshire', 'Lincoln → Lincoln, Lincolnshire (Gemini mixed in Nebraska)');
eq(ukLocalPlaceName('Richmond'), 'Richmond', 'Richmond is ambiguous inside the UK → never guessed');
eq(ukLocalPlaceName('Boston'), 'Boston, Lincolnshire', 'Boston → Boston, Lincolnshire');
eq(ukLocalPlaceName('Ukfield'), 'Ukfield', 'a town starting "Uk" is not touched');
eq(hookPlaceFor('Leeds', 'UK'), 'Leeds', 'hook place: Leeds');
eq(hookPlaceFor('Stamford', 'GB'), 'Stamford, Lincolnshire', 'hook place: Stamford, Lincolnshire');
eq(hookPlaceFor('Pune', 'India'), 'Pune India', 'hook place: India unchanged');

console.log('── a generated question ──');
eq(naturalUkQuestion('best plumber in Leeds UK', 'Leeds'), 'best plumber in Leeds', 'stray "UK" dropped');
eq(naturalUkQuestion('best plumber in leeds uk', 'Leeds'), 'best plumber in leeds', 'lower case too, town casing kept');
eq(naturalUkQuestion('electrician in Newcastle UK', 'Newcastle'), 'electrician in Newcastle', 'Newcastle UK → Newcastle');
eq(naturalUkQuestion('electrician in Boston, Lincolnshire', 'Boston'), 'electrician in Boston, Lincolnshire', 'already local → unchanged (no double)');
eq(naturalUkQuestion('electrician in Boston, Lincolnshire UK', 'Boston'), 'electrician in Boston, Lincolnshire', '…and its "UK" dropped');
eq(naturalUkQuestion('driving lessons in boston uk', 'Boston'), 'driving lessons in Boston, Lincolnshire', 'boston uk → Boston, Lincolnshire');
eq(naturalUkQuestion('plumber for small businesses', 'Leeds'), 'plumber for small businesses', 'a question without the town is untouched');
eq(naturalUkQuestion('boiler repair in Leeds, United Kingdom', 'Leeds'), 'boiler repair in Leeds', '"United Kingdom" dropped');
eq(naturalUkQuestion('Who is the best locksmith in Halifax UK?', 'Halifax'), 'Who is the best locksmith in Halifax, West Yorkshire?', 'question form keeps its mark');

console.log('── qualifyPlace with the UK (empty) suffix ──');
{
  const r = qualifyPlace(['locksmith in Wisbech', 'locksmith in Wisbech UK', 'locksmith for landlords'], 'Wisbech', '');
  eq(r.questions, ['locksmith in Wisbech', 'locksmith in Wisbech', 'locksmith for landlords'], 'no UK appended; a stray one dropped');
  eq(r.repaired.length, 1, 'the one change is logged');
  eq(qualifyPlace(['plumber in Pune'], 'Pune', 'India').questions, ['plumber in Pune India'], 'India still pinned');
}

console.log('── paid-client customer questions ──');
eq(placeWithCountry('canterbury', ''), 'Canterbury', 'UK place: the town alone');
eq(placeWithCountry('Westport', 'Ireland'), 'Westport, Ireland', 'Ireland unchanged');
eq(coreQuestions('Locksmiths', 'Canterbury', ''), ['Can you recommend a good locksmith in Canterbury?', 'Which locksmiths in Canterbury have the best reviews?'], 'core questions, no UK');
eq(areaCoreQuestion('Plumbers', 'Boston', ''), 'Can you recommend a good plumber in Boston, Lincolnshire?', 'area question with a local form');
{
  const ctx = { trade: 'Locksmiths', towns: ['Canterbury', 'Boston'], countrySuffix: '' };
  eq(toCustomerQuestion('mortice lock replacement in whitstable uk', { ...ctx, towns: ['Whitstable'] }), 'Who offers mortice lock replacement in Whitstable?', 'keyword → question, UK dropped');
  eq(toCustomerQuestion('Who can help if I am locked out in Canterbury, UK?', ctx), 'Who can help if I am locked out in Canterbury?', 'question form: ", UK" dropped');
  eq(toCustomerQuestion('Can you recommend a locksmith in Boston, Lincolnshire?', ctx), 'Can you recommend a locksmith in Boston, Lincolnshire?', 'already local → idempotent');
  eq(toCustomerQuestion('emergency locksmith Boston', ctx), 'Can you recommend an emergency locksmith in Boston, Lincolnshire?', 'bare Boston → local form');
  const once = toCustomerQuestion('best locksmith in Canterbury', ctx);
  eq(toCustomerQuestion(once, ctx), once, 'idempotent');
}

console.log('── the edge callers use the natural suffix ──');
{
  const cai = readFileSync('supabase/functions/create-ai-audit/index.ts', 'utf8');
  eq(/\$\{l\} UK`|\$\{locationText\} UK`|\$\{locationText\}, UK`/.test(cai), false, 'create-ai-audit never writes "<town> UK"');
  eq((cai.match(/qualifyPlace\([^)]*questionPlaceSuffix\(country\)\)/g) ?? []).length, 2, 'both qualifyPlace calls pass questionPlaceSuffix');
  for (const f of ['supabase/functions/paid-baseline/index.ts', 'supabase/functions/_shared/baseline-discovery.ts']) {
    const s = readFileSync(f, 'utf8');
    eq(s.includes('questionPlaceSuffix(') && !s.includes('placeSuffixForCountry('), true, `${f} uses questionPlaceSuffix`);
  }
}

console.log('── the abroad flag (display only) ──');
eq(abroadSignals('Top driving schools in Boston, Massachusetts: Safety Auto School (617) 988-8899'), ['Massachusetts', '(617) 988-8899'], 'Boston MA answer → flagged');
eq(abroadSignals('Beeler Security Service in Halifax, Nova Scotia'), ['Nova Scotia'], 'Halifax NS → flagged');
eq(abroadSignals('Boston, MA 02116 and Quincy, MA'), ['Boston, MA', 'Quincy, MA'], 'state codes after a town → flagged');
eq(abroadSignals('Call +1 705-313-0096 for Peterborough plumbing'), ['+1 705-313-0096'], 'a North American phone → flagged');
eq(abroadSignals('Tyneside Electrical, 119 St Cuthberts Rd, Newcastle upon Tyne NE5 2QS, United Kingdom. 0191 432 8842'), [], 'a UK answer → nothing');
eq(abroadSignals('Plumbers in Washington, Tyne and Wear; Virginia Water, Surrey; Victoria, London; Jersey Road'), [], 'UK places that share names abroad are never markers');
eq(abroadSignals('Australian-owned firm, Canadian-trained staff'), [], 'adjectives are not places');
eq(abroadSignals(''), [], 'empty answer → nothing');
eq(abroadFlagText('Lincoln, Nebraska firms: Sentry Electric')?.includes('outside the UK (Nebraska)'), true, 'operator line names the place');
eq([isUkAuditCountry('UK'), isUkAuditCountry('GB'), isUkAuditCountry(''), isUkAuditCountry('Australia')], [true, true, true, false], 'only UK audits are flagged');
{ const page = readFileSync('src/pages/AiAudit.tsx', 'utf8'); eq(page.includes('ukAudit={isUkAuditCountry(resultsCountry)}') && page.includes('abroadFlagText(er.answer_text)'), true, 'the audit page shows the flag on UK audits'); }

if (failures) throw new Error(`${failures} natural-UK-question check(s) failed`);
console.log('natural-uk-questions: all checks passed');
