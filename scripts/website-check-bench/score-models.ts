// SCORE THE MODELS ON THE SERVICE QUESTION (2026-11-15, docs/WEBSITE_CHECK_ACCURACY.md).
// For every heading the crawl asked about, compares each model's "this is a service" with the hand labels
// (service-labels.json). A name called a service that is not one can become a false claim ("X has no page of its own"),
// so precision is what matters most; recall says how many real services it kept. Tokens are what each call reported.
//   node --import tsx scripts/website-check-bench/score-models.ts gpt-4o-mini gpt-5-mini …
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { modelKey, CACHE_DIR, BENCH_DIR } from './net.ts';

const questions = JSON.parse(readFileSync(path.join(CACHE_DIR, 'model-questions.json'), 'utf8')) as Record<string, any>;
const answers = JSON.parse(readFileSync(path.join(CACHE_DIR, 'model-answers.json'), 'utf8')) as Record<string, any>;
const labels = JSON.parse(readFileSync(path.join(BENCH_DIR, 'service-labels.json'), 'utf8')) as Record<string, { R: string[]; N: string[] }>;

export function scoreModel(model: string) {
  let tp = 0, fp = 0, fn = 0, tn = 0, inTok = 0, outTok = 0, calls = 0, ms = 0;
  const wrong: string[] = [];
  for (const [biz, body] of Object.entries(questions)) {
    const a = answers[modelKey({ ...body, model })];
    const l = labels[biz];
    if (!a || !l) continue;
    calls++; inTok += a.usage?.prompt_tokens ?? 0; outTok += a.usage?.completion_tokens ?? 0; ms += a.bench_ms ?? 0;
    let picked = new Set<string>();
    try { picked = new Set(JSON.parse(a.choices[0].message.content).services.map((s: { name: string }) => s.name)); } catch { /* unreadable = nothing picked */ }
    for (const n of l.R) if (picked.has(n)) tp++; else fn++;
    for (const n of l.N) if (picked.has(n)) { fp++; wrong.push(`${biz}: ${n}`); } else tn++;
  }
  return { model, calls, precision: tp / Math.max(1, tp + fp), recall: tp / Math.max(1, tp + fn), accuracy: (tp + tn) / Math.max(1, tp + tn + fp + fn), fp, fn, inTok, outTok, avgMs: Math.round(ms / Math.max(1, calls)), wrong };
}

if (process.argv[1]?.endsWith('score-models.ts')) {
  const models = process.argv.slice(2);
  for (const m of models) {
    const s = scoreModel(m);
    console.log(`${m.padEnd(14)} precision ${(s.precision * 100).toFixed(1)}%  recall ${(s.recall * 100).toFixed(1)}%  accuracy ${(s.accuracy * 100).toFixed(1)}%  wrong-yes ${s.fp}  missed ${s.fn}  tokens in ${s.inTok} out ${s.outTok} over ${s.calls} calls  avg ${s.avgMs} ms`);
    if (process.argv.includes('--wrong')) s.wrong.forEach((w) => console.log('    ', w));
  }
}
