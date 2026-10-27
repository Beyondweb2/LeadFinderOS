/* GOOGLE AI: SCRAPE EVIDENCE + THE ONE-TIME RETRY, OFF BY DEFAULT (2026-10-27).
   A. scrapeEvidence tells "no results page" / "page, no AI block" / "block without text" / "block with text"
      apart, and records overview-like keys the scraper returned under a name we do not read.
   B. the switch fails closed: only `on` and a well-formed `sample:N@time` switch anything on.
   C. shouldRetryAio: only a recorded "not_shown", never nested, never while paid actions are paused, and a
      sample stops at its limit (this tick's own starts included).
   D. a retry can only ADD a Google AI answer: ChatGPT / Gemini / SERP stay the first run's; costs add up;
      a failed retry keeps the first result untouched.
   E. the queue wires it: reads the secret, records `_scrape`, and a failed/aged-out retry run restores the
      first result instead of failing or re-queueing the row. */
import { readFileSync } from 'node:fs';
import { normalizeAiSearch } from '../supabase/functions/_shared/enrichment/ai-search.ts';
import {
  keepFirstAfterRetry, mergeAioRetry, parseAioRetryMode, scrapeEvidence, shouldRetryAio,
} from '../supabase/functions/_shared/enrichment/google-ai-retry.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const organic = [{ position: 1, url: 'https://a.co.uk/', title: 'A' }, { position: 2, url: 'https://b.co.uk/', title: 'B' }];
const ev = (items: unknown[]) => scrapeEvidence(items, normalizeAiSearch(items, 'Acme Roofing'));

const none = ev([{}]);
ok(none.page === false && none.organic_n === null && !none.aio_block && !none.aio_text, 'A: no results page → page false');
const pageOnly = ev([{ organicResults: organic, chatGptSearchResult: { text: 'x' } }]);
ok(pageOnly.page && pageOnly.organic_n === 2 && !pageOnly.aio_block && !pageOnly.aio_text, 'A: page but no AI block → block false');
const emptyBlock = ev([{ organicResults: organic, aiOverview: { text: '   ' } }]);
ok(emptyBlock.aio_block && !emptyBlock.aio_text, 'A: AI block with empty text → block true, text false');
const full = ev([{ organicResults: organic, aiOverview: { text: 'Acme Roofing is well reviewed.' } }]);
ok(full.aio_block && full.aio_text, 'A: AI block with text → both true');
const odd = ev([{ organicResults: organic, aiOverviewV2: { text: 'hidden under a new key' }, title: 'x' }]);
ok(!odd.aio_block && odd.aio_keys.includes('aiOverviewV2'), 'A: an overview-like key we do not read is recorded');

ok(parseAioRetryMode(undefined).kind === 'off' && parseAioRetryMode('').kind === 'off', 'B: absent / empty = off');
for (const bad of ['ON', 'true', '1', 'sample', 'sample:0@2026-10-27T10:00:00Z', 'sample:20', 'sample:20@yesterday', 'sample:abc@2026-10-27T10:00:00Z']) {
  ok(parseAioRetryMode(bad).kind === 'off', `B: "${bad}" = off`);
}
ok(parseAioRetryMode('on').kind === 'on', 'B: on');
const sm = parseAioRetryMode('sample:20@2026-10-27T10:00:00Z');
ok(sm.kind === 'sample' && sm.limit === 20 && sm.since === '2026-10-27T10:00:00Z', 'B: sample parses');

const base = { stamp: 'not_shown', hasFirst: false, sampleUsed: 0, tickRunning: true };
ok(!shouldRetryAio({ ...base, mode: { kind: 'off' } }), 'C: off never retries');
ok(shouldRetryAio({ ...base, mode: { kind: 'on' } }), 'C: on retries a not_shown');
for (const s of ['shown', null, undefined, 'failed']) ok(!shouldRetryAio({ ...base, mode: { kind: 'on' }, stamp: s as string | null | undefined }), `C: stamp ${String(s)} never retries`);
ok(!shouldRetryAio({ ...base, mode: { kind: 'on' }, hasFirst: true }), 'C: a retry never nests');
ok(!shouldRetryAio({ ...base, mode: { kind: 'on' }, tickRunning: false }), 'C: not while paid actions are paused');
ok(shouldRetryAio({ ...base, mode: sm, sampleUsed: 19 }) && !shouldRetryAio({ ...base, mode: sm, sampleUsed: 20 }), 'C: a sample stops at its limit');

const first = { chatgpt: { named: false, answer_text: 'c' }, gemini: { named: false, answer_text: 'g' }, _google_serp: { count: 2 }, _ai_overview: 'not_shown', _cost_usd: 0.0125, _scrape: { v: 1, page: true } };
const gained = mergeAioRetry(first, { ai_overview: { named: false, answer_text: 'Rivals Ltd' }, chatgpt: { answer_text: 'DIFFERENT' }, _ai_overview: 'shown', _cost_usd: 0.0125, _scrape: { v: 1, page: true, aio_block: true } });
ok(gained._ai_overview === 'shown' && (gained.ai_overview as { answer_text: string }).answer_text === 'Rivals Ltd', 'D: a gained answer is taken from the retry');
ok((gained.chatgpt as { answer_text: string }).answer_text === 'c' && gained.gemini === first.gemini && gained._google_serp === first._google_serp, 'D: ChatGPT / Gemini / SERP stay the first run\'s');
ok(gained._aio_retry === 'gained' && Math.abs((gained._cost_usd as number) - 0.025) < 1e-9, 'D: outcome "gained" and the two costs add up');
ok((gained._scrape as { retry: { aio_block: boolean } }).retry.aio_block === true, 'D: the retry\'s scrape evidence is kept beside the first');
const noGain = mergeAioRetry(first, { _ai_overview: 'not_shown', _cost_usd: 0.0125, _scrape: { v: 1, page: true, aio_block: false } });
ok(noGain._aio_retry === 'no_gain' && noGain._ai_overview === 'not_shown' && noGain.ai_overview === undefined, 'D: no gain leaves it not shown');
const kept = keepFirstAfterRetry(first, 'failed');
ok(kept._aio_retry === 'failed' && kept.chatgpt === first.chatgpt && kept._ai_overview === 'not_shown', 'D: a failed retry keeps the first result');

const q = readFileSync(new URL('../supabase/functions/process-ai-audit-queue/index.ts', import.meta.url), 'utf8');
ok(/Deno\.env\.get\(GOOGLE_AI_RETRY_SECRET\)/.test(q) && /parseAioRetryMode/.test(q), 'E: the queue reads the switch');
ok(/result\[SCRAPE_META_KEY\] = scrapeEvidence\(/.test(q), 'E: the queue records the scrape evidence on every question');
const failAt = q.indexOf('const failAttempt');
const guard = q.indexOf('AIO_FIRST_META_KEY', failAt);
const giveUp = q.indexOf('const giveUp', failAt);
ok(failAt > 0 && guard > failAt && guard < giveUp, 'E: a failed/aged-out retry run restores the first result before the give-up logic');

console.log(f ? `\n${f} FAILED` : '\nall passed');
process.exit(f ? 1 : 0);
