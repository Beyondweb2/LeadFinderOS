// Throwaway (never staged): run answerExcerpt over the 120 real six-answer cells dumped to scratch.
import { readFileSync } from 'node:fs';
import { answerExcerpt } from '../src/lib/answerText.ts';
const cells = JSON.parse(readFileSync(process.argv[2], 'utf8')) as Array<{ engine: string; question: string; answer_text: string; named: string }>;
let nul = 0;
const show = new Set((process.argv[3] ?? '').split(',').filter(Boolean).map(Number));
cells.forEach((c, i) => {
  const ex = answerExcerpt(c.answer_text, 500);
  if (!ex) nul++;
  if (show.has(i) || (!ex && process.argv[4] === 'nulls')) {
    console.log(`#${i} ${c.engine} | ${c.question} | named=${c.named}`);
    console.log(ex ? ex.blocks.map((b) => `  [${b.kind}${b.depth ?? ""}] ${b.text}`).join('\n') + (ex.truncated ? '  …' : '') : '  (null) RAW: ' + JSON.stringify(c.answer_text.slice(0, 300)));
  }
});
const len = cells.map((c) => answerExcerpt(c.answer_text, 500)).filter(Boolean).map((e) => e!.blocks.reduce((t, b) => t + b.text.length, 0));
console.log(`total ${cells.length}, null ${nul}, excerpt len min ${Math.min(...len)} max ${Math.max(...len)} avg ${Math.round(len.reduce((a, b) => a + b, 0) / len.length)}`);
