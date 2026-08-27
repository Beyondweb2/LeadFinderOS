/* Tests for src/lib/questionPaste.ts — the re-audit paste box. The acceptance case Paul asked for
   is first: a 10-line paste with one numbered line and one blank line -> 9 clean rows.
   Run: npx tsx scripts/question-paste.test.ts */
import { parseQuestionPaste, stripListMarker } from '../src/lib/questionPaste.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

console.log('── ⛔ THE ACCEPTANCE CASE: 10 lines, one numbered, one blank -> 9 clean rows ──');
{
  const pasted = [
    'How much does AndroFeme cost in the UK?',
    'Can I get HRT online without a GP referral?',
    '3. Which UK menopause clinics prescribe testosterone?',   // numbered
    '',                                                        // blank
    'Do I need blood tests before starting HRT?',
    'Is testosterone licensed for women in the UK?',
    'How do I get a second opinion on my HRT?',
    'What is the best online menopause clinic in the UK?',
    'How fast can I see a menopause specialist privately?',
    'My GP refused testosterone — what are my options?',
  ].join('\n');
  const rows = parseQuestionPaste(pasted);
  console.log(rows.map((r, i) => `   ${i + 1}. ${r}`).join('\n'));
  ok(rows.length === 9, `10 pasted lines -> ${rows.length} rows (blank dropped)`);
  ok(rows[2] === 'Which UK menopause clinics prescribe testosterone?', 'the "3. " marker is stripped, text intact');
  ok(!rows.some((r) => r === ''), 'no empty rows');
  ok(!rows.some((r) => /^\s|\s$/.test(r)), 'every row is trimmed');
}

console.log('── MARKER STYLES ──');
for (const [raw, want] of [
  ['1. First question?', 'First question?'],
  ['2) Second question?', 'Second question?'],
  ['(3) Third question?', 'Third question?'],
  ['12 - Twelfth?', 'Twelfth?'],
  ['- Dashed question?', 'Dashed question?'],
  ['* Starred question?', 'Starred question?'],
  ['• Bulleted question?', 'Bulleted question?'],
  ['– En-dashed?', 'En-dashed?'],
  ['4.Glued to the number?', 'Glued to the number?'],
  ['a) Lettered?', 'Lettered?'],
  ['   5.   Padded?   ', 'Padded?'],
] as [string, string][]) {
  ok(stripListMarker(raw) === want, `"${raw}" -> "${want}"`);
}

console.log('── ⛔ NEVER EAT REAL CONTENT ──');
for (const raw of [
  'How much does 24/7 cover cost?',
  'Top 10 plumbers in Wisbech?',
  '2026 boiler rules — what changed?',
  'Is 1.5kW enough for a shower pump?',
  'What does £99 include?',
]) {
  ok(stripListMarker(raw) === raw, `untouched: "${raw}"`);
}

console.log('── EDGE CASES ──');
ok(parseQuestionPaste('').length === 0, 'empty paste -> no rows');
ok(parseQuestionPaste('\n\n   \n\t\n').length === 0, 'whitespace-only paste -> no rows');
ok(parseQuestionPaste('1.\n2.\n- \n').length === 0, 'marker-only lines -> no rows, never blank ones');
ok(parseQuestionPaste('Same?\nSame?\nsame?').length === 1, 'exact duplicates collapse (never pay to ask twice)');
ok(parseQuestionPaste('A?\r\nB?\r\nC?').length === 3, 'CRLF (Windows/Word paste) handled');
{
  const order = parseQuestionPaste('Zebra?\nApple?\nMango?');
  ok(order[0] === 'Zebra?' && order[2] === 'Mango?', 'pasted order preserved, never sorted');
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILED`);
if (f > 0) process.exit(1);
