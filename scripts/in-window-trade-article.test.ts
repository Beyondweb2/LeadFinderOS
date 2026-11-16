/* In-window free text: the trade's article is fixed, not held (Paul, 2026-11-16).
   audit_reply / video_template / audit_reply_warm say "for a {{trade}}". As a PAID template (window closed) a vowel trade stays
   HELD — Meta's registered "a". Inside the open 24-hour window the words go as FREE TEXT, so "an electrician" is written instead.
   Also: the free-text words carry the normalised trade ("plumber"), never the typed "Plumbers". */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { bareTrade, normaliseTrade, withTradeArticle } from '../src/lib/templateVars.ts';
import { claimTemplatePayload, renderTemplateBody } from '../supabase/functions/_shared/whatsapp-send.ts';

let failures = 0;
const ok = (condition: boolean, label: string) => { if (!condition) failures++; console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); };
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

console.log('── the rules ──');
const n = normaliseTrade('Electricians');
ok(!n.ok && n.reason === 'trade_starts_with_vowel_sound', 'the paid-template rule still holds a vowel trade');
const b = bareTrade('Electricians');
ok(b.ok && b.value === 'electrician', 'bareTrade: same map and singular, no article rule');
ok(!bareTrade('').ok && !bareTrade('plumbing, heating, gas & more').ok, 'bareTrade keeps the other refusals');
ok(withTradeArticle('ask AI for a electrician in Leeds', 'Electricians') === 'ask AI for an electrician in Leeds', 'a electrician -> an electrician');
ok(withTradeArticle('ask AI for a accountant in Leeds', 'accountant') === 'ask AI for an accountant in Leeds', 'a accountant -> an accountant');
ok(withTradeArticle('ask AI for a plumber in Leeds', 'Plumbers') === 'ask AI for a plumber in Leeds', 'a consonant trade is unchanged');
ok(withTradeArticle('a electrician and a electrician', 'electrician') === 'an electrician and a electrician', 'only the first one');

console.log('\n── the three templates, built for free text ──');
for (const t of ['audit_reply', 'video_template', 'audit_reply_warm']) {
  let held = false;
  try { claimTemplatePayload(t, 'en', 'Spark Ltd', 'https://findable.live/r/AbC123', { trade: 'Electricians', town: 'Leeds', competitors: 'A, B and C', auditUrl: 'https://findable.live/r/AbC123' }); } catch (e) { held = String((e as Error).message).includes('trade_starts_with_vowel_sound'); }
  ok(held, `${t}: as a paid template the vowel trade is still HELD`);
  let built = false;
  try { built = !!claimTemplatePayload(t, 'en', 'Spark Ltd', 'https://findable.live/r/AbC123', { trade: 'Electricians', town: 'Leeds', competitors: 'A, B and C', auditUrl: 'https://findable.live/r/AbC123', freeTextOnly: true }); } catch { built = false; }
  ok(built, `${t}: with freeTextOnly the payload builds (it is only ever sent as text)`);
  const words = withTradeArticle(renderTemplateBody(t, 'Spark Ltd', 'https://findable.live/r/AbC123', 'electrician', 'A, B and C', undefined, 'Leeds'), 'Electricians');
  ok(/ an electrician in /.test(words) && !/ a electrician/.test(words), `${t}: the free-text words say "an electrician"`);
  const plumber = renderTemplateBody(t, 'Pipe Ltd', 'https://findable.live/r/AbC123', normaliseTrade('Plumbers').ok ? 'plumber' : 'x', 'A, B and C', undefined, 'Leeds');
  ok(/ a plumber in /.test(plumber), `${t}: a consonant trade reads "a plumber" (normalised, not "a Plumbers")`);
}

console.log('\n── the sender ──');
const fn = read('supabase/functions/send-whatsapp-message/index.ts');
ok(/const vowelFreeText = !!tradeCheck && !tradeCheck\.ok && tradeCheck\.reason === "trade_starts_with_vowel_sound" && freeWindow;/.test(fn), 'the fix applies ONLY while the 24-hour window is open');
ok(/vowelFreeText \? \{ \.\.\.auditExtra, freeTextOnly: true \} : auditExtra/.test(fn), 'freeTextOnly only for that case');
ok(/if \(vowelArticleFixed && shape\.as !== "text"\) return json\(\{ ok: false, error: "unsafe_template_var", reason: "trade_starts_with_vowel_sound"/.test(fn), 'if it would go as the paid template after all: the old hold');
ok(fn.indexOf('if (vowelArticleFixed && shape.as !== "text")') < fn.indexOf('payload = shape.videoUrl ? videoPayload'), '...checked before the payload is swapped or anything is sent');
ok(/renderTemplateBody\(templateName, a\.business, a\.link, bodyTrade,/.test(fn) && /storedBody = withTradeArticle\(storedBody, a\.trade\)/.test(fn), 'the words carry the normalised trade and the fixed article');

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nALL PASS');
