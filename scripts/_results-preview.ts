/* UNTRACKED SCRATCH (like _render-check.ts / _distance-rerun.ts) — never stage this file.
   READ-ONLY preview of the four-week document against REAL stored rows: RG Locksmiths' paid
   baseline (f64920ce, 11 Aug, 3 runs) vs his 8 Sep re-measurement (876579bd). Nothing is sent,
   stamped or published; this calls the same renderer the sender calls. */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { compareMeasurements } from '../src/lib/measurementCompare.ts';
import { renderRemeasureResultsHtml } from '../src/lib/remeasureResultsHtml.ts';
import { resultsEmailSubject, resultsEmailParagraphs } from '../src/lib/remeasureResults.ts';

const REF = 'ruusxpkkmwtljxxulhbq';
const keys = JSON.parse(execFileSync('npx', ['supabase', 'projects', 'api-keys', '--project-ref', REF, '--output', 'json'], { encoding: 'utf8', shell: true }));
const jwt = (keys as Array<{ name: string; api_key: string }>).find((k) => k.name === 'service_role')!.api_key;
const base = `https://${REF}.supabase.co/rest/v1`;
const get = async (p: string) => { const r = await fetch(base + p, { headers: { apikey: jwt, Authorization: 'Bearer ' + jwt } }); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); };

async function main() {
  const BEFORE = 'f64920ce-8bdc-44b3-b35a-a63a75ee4395', AFTER = '876579bd-656e-4b73-a29d-d83f79b4495c';
  const rows = (id: string) => get(`/ai_audit_queue?audit_id=eq.${id}&select=run_id,question,engines,status,result&order=id.asc`);
  const [b, a] = await Promise.all([rows(BEFORE), rows(AFTER)]);
  const [ab, aa] = await Promise.all([get(`/ai_audits?id=eq.${BEFORE}&select=created_at,website,location_text`), get(`/ai_audits?id=eq.${AFTER}&select=created_at`)]);
  const c = compareMeasurements(b, a, { businessName: 'RG Locksmiths cambs', ownWebsite: ab[0].website });
  console.log(JSON.stringify({ before: c.before, after: c.after, movement: c.movement, withinNoise: c.withinNoise, matched: c.matchedCount, beforeRows: b.length, afterRows: a.length }, null, 1));
  const html = renderRemeasureResultsHtml({ businessName: 'RG Locksmiths cambs', town: ab[0].location_text ?? null, comparison: c, beforeDate: ab[0].created_at, afterDate: aa[0].created_at, sentAtLabel: '13 Sep 2026' });
  writeFileSync(process.argv[2], html, 'utf8');
  const copy = { businessName: 'RG Locksmiths cambs', town: ab[0].location_text ?? null, beforeNamed: c.before.named, beforeAnswered: c.before.answered, afterNamed: c.after.named, afterAnswered: c.after.answered, questions: c.matchedCount, wentUp: c.movement === 'improved', withinNoise: c.withinNoise, documentUrl: 'https://findable.live/results/<replay audit id>' };
  console.log('\nSUBJECT: ' + resultsEmailSubject(copy));
  for (const p of resultsEmailParagraphs(copy)) console.log('\n' + p);
  console.log('\nwrote ' + process.argv[2] + ' (' + html.length + ' bytes)');
}
main().catch((e) => { console.error(e); process.exit(1); });
