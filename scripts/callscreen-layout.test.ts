/* THE CALL TAB LAYOUT (2026-10-20, Paul — preview branch): the five "What we do" steps say only what is true. */
import { readFileSync } from 'node:fs';
import { CALL_WHAT_WE_DO_STEPS, WHY_IT_MATTERS_SOURCE_LINE, YEXT_SOURCE } from '../src/lib/salesExplainer.ts';
import { GUARANTEE_LINE } from '../src/lib/offerFactSheet.ts';
let failures = 0;
const ok = (c: unknown, l: string) => { if (c) console.log('  PASS ' + l); else { failures++; console.log('  FAIL ' + l); } };
const all = CALL_WHAT_WE_DO_STEPS.flatMap((s) => [s.title, ...s.lines.map((l) => l.text)]).join('\n');
ok(CALL_WHAT_WE_DO_STEPS.map((s) => s.n).join() === '1,2,3,4,5', 'five numbered steps');
ok(!/every\s+(?:4|four)\s+weeks/i.test(all), 'never "every 4 weeks" (v5 5.3: one re-measure)');
ok(!/\badd(?:ed)? (?:you )?to\b[^.]*director/i.test(all), 'never "add to directories" (v5: listings reviewed for consistency)');
ok(CALL_WHAT_WE_DO_STEPS[3].lines.some((l) => l.text.replace(/\*\*/g, '') === GUARANTEE_LINE), 'the guarantee is the fact sheet line, word for word');
const lines = CALL_WHAT_WE_DO_STEPS.flatMap((s) => s.lines);
const completeOnly = lines.filter((l) => l.complete);
/* 2026-10-30 (two plans): review replies are a Findable Complete item, no longer a 'coming soon' line. */
ok(lines.every((l) => !l.soon) && !/not included|coming soon/i.test(all) && completeOnly.some((l) => /reviews/i.test(l.text)), 'review replies appear only as a Findable Complete item, never as "coming soon" / "not included yet"');
ok(completeOnly.length === 4 && completeOnly.every((l) => /review|Business Profile|monthly|Changes/i.test(l.text)), 'the Complete-only lines are review replies, GBP/directories kept up to date, the monthly audit and changes within reason');
ok(!/rank|guarantee(?:d)? to|will be (?:named|recommended)/i.test(all), 'no ranking or naming promise');
ok(/Yext/.test(WHY_IT_MATTERS_SOURCE_LINE) && YEXT_SOURCE.includes('600') && !/https?:/.test(WHY_IT_MATTERS_SOURCE_LINE), 'the stats show their source as text, never a link');
const ui = readFileSync(new URL('../src/components/ColdCallPlaybook.tsx', import.meta.url), 'utf8');
ok(/fit\.reason !== BUILD_DEFAULT_REASON/.test(ui) && /why-it-matters-card/.test(ui) && /what-we-do-steps/.test(ui), 'the thin Offer line is gone; the stats are their own card; the steps are a numbered list');
console.log(failures ? `\nFAILED: ${failures}` : '\nAll passed.');
if (failures) process.exit(1);
