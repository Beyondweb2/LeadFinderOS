// SCORE A BENCH RUN AGAINST THE ANSWER KEY (2026-11-15, docs/WEBSITE_CHECK_ACCURACY.md).
//   node --import tsx scripts/website-check-bench/score.ts <results.json> [--by id|family] [--shown] [--false]
// Accuracy = findings the client would read that are true ÷ findings labelled. A finding the key has never seen for that
// site is UNLABELLED — counted apart, never as right. --shown scores only what the client report would show.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BENCH_DIR } from './net.ts';
import { CHECK_FAMILY } from '../../src/lib/websiteCheckAccuracy.ts';

export interface Scored { id: string; family: string; right: number; wrong: number; unlabelled: number; examples: string[] }

export function scoreRun(results: Array<{ slug: string; issues: Array<{ id: string; saw: string; clientShown?: boolean }> }>, opts: { shownOnly?: boolean } = {}) {
  const truth = JSON.parse(readFileSync(path.join(BENCH_DIR, 'truth.json'), 'utf8')) as Record<string, Record<string, [string, string]>>;
  const byId = new Map<string, Scored>();
  for (const r of results) {
    const key = truth[r.slug];
    if (!key || key._excluded) continue;
    for (const i of r.issues) {
      if (opts.shownOnly && i.clientShown === false) continue;
      const s = byId.get(i.id) ?? { id: i.id, family: CHECK_FAMILY[i.id] ?? 'other', right: 0, wrong: 0, unlabelled: 0, examples: [] };
      const label = key[i.id] as [string, string, string?] | undefined;
      /* A verdict holds only for the words it was given for: a finding that now says something else is re-labelled by hand. */
      const changed = !!label && typeof label[2] === 'string' && label[2] !== i.saw;
      const v = changed ? undefined : label?.[0];
      if (v === 'T') s.right++;
      else if (v === 'F') { s.wrong++; s.examples.push(`${r.slug}: ${label![1]}`); }
      else { s.unlabelled++; s.examples.push(`${changed ? 'CHANGED' : 'NEW'} ${r.slug}: ${i.saw.slice(0, 200)}`); }
      byId.set(i.id, s);
    }
  }
  return [...byId.values()];
}

export function rollUp(rows: Scored[], by: 'id' | 'family') {
  if (by === 'id') return rows;
  const m = new Map<string, Scored>();
  for (const r of rows) {
    const s = m.get(r.family) ?? { id: r.family, family: r.family, right: 0, wrong: 0, unlabelled: 0, examples: [] };
    s.right += r.right; s.wrong += r.wrong; s.unlabelled += r.unlabelled; s.examples.push(...r.examples);
    m.set(r.family, s);
  }
  return [...m.values()];
}

export const pct = (s: { right: number; wrong: number }) => (s.right + s.wrong ? (100 * s.right) / (s.right + s.wrong) : NaN);

if (process.argv[1]?.endsWith('score.ts')) {
  const file = process.argv[2];
  const by = process.argv.includes('--by') ? (process.argv[process.argv.indexOf('--by') + 1] as 'id' | 'family') : 'family';
  const rows = rollUp(scoreRun(JSON.parse(readFileSync(file, 'utf8')), { shownOnly: process.argv.includes('--shown') }), by)
    .sort((a, b) => pct(a) - pct(b) || b.right + b.wrong - (a.right + a.wrong));
  let R = 0, W = 0, U = 0;
  for (const r of rows) {
    R += r.right; W += r.wrong; U += r.unlabelled;
    console.log(`${r.id.padEnd(30)} ${String(Math.round(pct(r))).padStart(4)}%  ${r.right}/${r.right + r.wrong}${r.unlabelled ? `  (+${r.unlabelled} unlabelled)` : ''}`);
    if (process.argv.includes('--false')) r.examples.forEach((e) => console.log(`      ✗ ${e}`));
  }
  console.log(`${'ALL'.padEnd(30)} ${String(Math.round((100 * R) / (R + W))).padStart(4)}%  ${R}/${R + W}${U ? `  (+${U} unlabelled)` : ''}`);
}
