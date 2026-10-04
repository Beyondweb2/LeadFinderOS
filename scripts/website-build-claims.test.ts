/* CLAIM TRUTH GUARDRAILS (fix workstream 6, 2026-10-04; certification D-05 / D-20 / M-037).
     A. what the verified facts back (a verified fact must itself make the claim, un-negated)
     B. a planted "fully insured, 10 years, 24/7, 30-minute response…" FAILS; the client's own verified
        wording passes; negations ("no 24-hour call-outs") are never a claim
     C. ordinary sentences are not claims ("members of the public", "once you approve the quote")
     D. ONE ALGORITHM IN TWO PLACES: claimRules.ts and the standalone gate agree on every hit
     E. the gate's "claims" check: fails a planted claim, passes a clean site, SKIPS (never passes) without rules
     F. the page generator: scans every model field, regenerates, refuses what survives; Q&A refuses an
        excluded / unverified-24-hour question before spending */

import { readFileSync } from 'node:fs';
import { CLAIM_RULES, DO_NOT_INVENT_LINES, claimExpect, claimSupport, scanClaims } from '../src/lib/claimRules.ts';
import { excludedFromText, namesExcluded } from '../src/lib/siteScope.ts';
import { auditSite, scanClaims as gateScan } from './site-quality-gate.mjs';

let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

/* Session D's verified facts (VERIFIED only — the gate never sees anything else). */
const D1 = [
  { key: 'years_experience', value: 'Trading since 2019' },
  { key: 'insurance', value: 'Public liability insurance, £2 million cover' },
  { key: 'guarantee', value: '12-month guarantee on parts and labour for locks we supply and fit' },
  { key: 'availability', value: 'Within opening hours only (not 24/7)' },
  { key: 'opening_hours', value: 'Mon–Fri 7am–7pm, Sat 8am–4pm, closed Sunday' },
  { key: 'standout', value: 'TS007 3-star anti-snap cylinders as standard on every lock change; a fixed price before any work starts' },
];
const D2 = [
  { key: 'accreditations', value: 'Gas Safe registered' },
  { key: 'prices', value: '£85 annual gas boiler service' },
  { key: 'opening_hours', value: 'Mon–Fri 8am–6pm; no evening, weekend or 24-hour call-outs' },
  { key: 'standout', value: 'Same engineer every visit; dust sheets and shoe covers on every job; written quote before work starts' },
];
const unsupported = (text: string, facts: typeof D1) => scanClaims(text, claimSupport(facts)).filter((h) => !h.supported).map((h) => h.text.toLowerCase());
const supported = (text: string, facts: typeof D1) => scanClaims(text, claimSupport(facts)).filter((h) => h.supported).map((h) => h.text.toLowerCase());

console.log('\n── A. what the verified facts back ──');
{
  const s1 = claimSupport(D1).supported, s2 = claimSupport(D2).supported;
  ok(!!s1.insurance && !!s1.experience && !!s1.guarantee, 'A: D1 — insurance, years and the guarantee are backed');
  ok(!s1.availability_247, 'A: D1 — "Within opening hours only (not 24/7)" backs NO 24/7 claim (the negation is read)');
  ok(!!s2.credentials && !s2.insurance && !s2.experience && !s2.availability_247, 'A: D2 — Gas Safe is backed; insurance, years and 24/7 are not ("no … 24-hour call-outs" backs nothing)');
}

console.log('\n── B. planted claims fail; the verified wording passes ──');
{
  const planted = 'We are fully insured with 10 years’ experience, available 24/7 with a 30-minute response. Rated 4.9 out of 5 from 200 Google reviews. NICEIC approved, award-winning and the No.1 plumber in Brighouse — 500+ jobs done.';
  const u2 = unsupported(planted, D2);
  for (const w of ['fully insured', '10 years’ experience', '24/7', '30-minute response', 'rated 4.9', '200 google reviews', 'niceic', 'award-winning', 'no.1', '500+ jobs'])
    ok(u2.some((h) => h.includes(w)), 'B: D2 — planted "' + w + '" is UNSUPPORTED');
  const u1 = unsupported('Trading since 2019, with £2 million public liability insurance and a 12-month guarantee on parts and labour. TS007 3-star anti-snap cylinders as standard.', D1);
  ok(u1.length === 0, 'B: D1 — its own verified wording raises nothing (' + u1.join(', ') + ')');
  ok(supported('Trading since 2019 and fully insured.', D1).includes('trading since 2019') && supported('Trading since 2019 and fully insured.', D1).includes('fully insured'), 'B: …and is listed as backed (the inventory Paul reads)');
  ok(unsupported('Trading since 1985.', D1).includes('trading since 1985') && unsupported('Trading for 30 years.', D1).includes('trading for 30 years'), 'B: the YEAR is always part of the claim — "Trading since 1985" is not "since 2019"');
  ok(unsupported('Over 10 years of experience.', D1).length > 0, 'B: D1 — "10 years" is not "since 2019": a figure must be the verified one');
  ok(unsupported('Gas Safe registered engineers.', D2).length === 0 && unsupported('Gas Safe and NICEIC registered.', D2).includes('niceic'), 'B: D2 — Gas Safe passes; a NAMED body not in the facts (NICEIC) fails even beside it');
  for (const neg of ['No 24-hour call-outs.', 'We do not offer out-of-hours work.', 'We are not DBS checked.', 'Lockouts attended within opening hours only (not 24/7).', 'We can’t guarantee a time slot.'])
    ok(unsupported(neg, D2).length === 0 && unsupported(neg, D1).length === 0, 'B: a negation is never a claim: "' + neg + '"');
}

console.log('\n── C. ordinary sentences are not claims ──');
{
  for (const s of ['Members of the public can call us.', 'Once you have approved the quote we book the job.', 'A member of our team will reply.', 'Call the National Gas Emergency Service on 0800 111 999.', 'Within opening hours we answer the phone.', 'We fixed the lock in the morning.'])
    ok(unsupported(s, D1).length === 0 && unsupported(s, D2).length === 0, 'C: not a claim: "' + s + '"');
  ok(CLAIM_RULES.every((r) => { try { new RegExp(r.pattern, 'gi'); if (r.named) new RegExp(r.named, 'i'); return true; } catch { return false; } }), 'C: every rule pattern compiles');
}

console.log('\n── D. one algorithm in two places (claimRules.ts ↔ the standalone gate) ──');
{
  const corpus = [
    'We are fully insured with 10 years’ experience, available 24/7 with a 30-minute response.',
    'Trading since 2019, with £2 million public liability insurance and a 12-month guarantee. TS007 3-star cylinders.',
    'No 24-hour call-outs. Not DBS checked. Gas Safe registered. NICEIC approved. Rated 4.9 out of 5 from 120 reviews.',
    'Cheapest prices in town, the leading local company, award-winning, hundreds of happy customers, same-day visits.',
    'Members of the public; once approved; a member of our team; fixed price before work starts.',
  ];
  for (const facts of [D1, D2, []]) for (const text of corpus) {
    const a = scanClaims(text, claimSupport(facts)).map((h) => h.rule + '|' + h.text + '|' + h.supported).join(' ; ');
    const b = (gateScan(text, claimExpect(facts)) as Array<{ rule: string; text: string; supported: boolean }>).map((h) => h.rule + '|' + h.text + '|' + h.supported).join(' ; ');
    ok(a === b, 'D: same hits for "' + text.slice(0, 40) + '…" with ' + (facts === D1 ? 'D1' : facts === D2 ? 'D2' : 'no') + ' facts' + (a === b ? '' : ' — lib: ' + a + ' / gate: ' + b));
  }
  const gateSrc = readFileSync('scripts/site-quality-gate.mjs', 'utf8');
  ok(!/^import .*src\/lib/m.test(gateSrc), 'D: the gate stays standalone (it is copied into client repositories)');
}

console.log('\n── E. the gate’s "claims" check ──');
{
  const D = 'brookfootplumbing.example', O = 'https://' + D;
  const page = (p: string, body: string) => '<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width"><title>Page ' + p + ' | Brookfoot</title><meta name="description" content="Brookfoot ' + p + ' plain information for customers in Brighouse and nearby."><link rel="canonical" href="' + O + p + '"><script type="application/ld+json">' + JSON.stringify({ '@context': 'https://schema.org', '@type': 'Plumber', '@id': O + '/#business', name: 'Brookfoot', telephone: '01632 960482', url: O + '/', areaServed: ['Brighouse'] }) + '</script></head><body><header><nav><a href="/">Home</a> <a href="/about/">About</a></nav></header><main><h1>Heading ' + p + '</h1><p>' + body + '</p></main></body></html>';
  const site = (aboutBody: string) => ({ mode: 'dist', pages: new Map([['/', page('/', 'Gas Safe registered plumber in Brighouse.')], ['/about/', page('/about/', aboutBody)]]), files: new Set(), sizes: new Map(),
    sitemaps: new Map([['/sitemap.xml', '<urlset><url><loc>' + O + '/</loc></url><url><loc>' + O + '/about/</loc></url></urlset>']]), robots: 'User-agent: *\nAllow: /\nSitemap: ' + O + '/sitemap.xml\n', headers: '', redirects: '', llms: false, live: null });
  const expect = { domain: D, claims: claimExpect(D2) };
  const bad = auditSite(site('We are fully insured with 10 years experience and offer 24/7 call-outs.'), { domain: D, expect });
  const c = bad.checks.find((x: { id: string }) => x.id === 'claims') as { level: string; details: string[] };
  ok(c.level === 'fail' && c.details.some((d) => /fully insured/.test(d)) && c.details.some((d) => /24\/7/.test(d)) && c.details.some((d) => /10 years experience/.test(d)) && !bad.passed, 'E: a planted "fully insured, 10 years, 24/7" FAILS the gate (D-05) — so it cannot import as Preview Ready');
  const good = auditSite(site('Same engineer every visit. No 24-hour call-outs.'), { domain: D, expect });
  const g = good.checks.find((x: { id: string }) => x.id === 'claims') as { level: string; details: string[] };
  ok(g.level === 'pass' && g.details.some((d) => /backed by a verified fact: "gas safe"/.test(d)), 'E: a truthful site passes, with the backed claims listed for Paul’s read');
  const none = auditSite(site('Anything.'), { domain: D, expect: { domain: D } });
  ok((none.checks.find((x: { id: string }) => x.id === 'claims') as { level: string }).level === 'skip', 'E: no claims block → SKIP (said, never a pass)');
  ok(DO_NOT_INVENT_LINES.join(' ').includes('Paul still reads every page'), 'E: the builder is told the gate cannot prove every sentence — Paul’s read stays required');
}

console.log('\n── F. the page generator ──');
{
  const pg = readFileSync('supabase/functions/page-generator/index.ts', 'utf8');
  ok(/scanClaims\(\[o\.title, o\.meta, o\.h1, strip\(o\.bodyHtml\)\]/.test(pg), 'F: title, meta, H1 and body are all scanned (D-20: meta and H1 were returned raw)');
  ok(/unsupportedClaims\(out\)\.length\) && attempts < 3/.test(pg) && /error: "unsupported_claim"/.test(pg), 'F: a claim triggers regeneration, and one that survives the last attempt is REFUSED, never badged');
  ok(/NEVER claim 24\/7, 24-hour, round-the-clock, out-of-hours/.test(pg), 'F: the prompt forbids 24/7 / out-of-hours / arrival-time claims (missing before)');
  const qa = pg.slice(pg.indexOf('const heads = qaHeadings({ question, services: qaServices'));
  ok(qa.indexOf('namesExcluded(') > 0 && qa.indexOf('namesExcluded(') < qa.indexOf('api.openai.com'), 'F: Q&A checks the scope BEFORE anything is spent');
  const ex = excludedFromText('No car keys / auto locksmith. No safe opening. No 24-hour call-outs.');
  ok(namesExcluded('car key replacement Cambridge', { excluded: ex, outOfHoursVerified: false }).refused && namesExcluded('24 hour locksmith in Cambridge', { excluded: [], outOfHoursVerified: false }).refused, 'F: Q&A refuses an excluded service and an unverified 24-hour ask (D-21)');
  ok(!namesExcluded('how long does a lock change take', { excluded: ex, outOfHoursVerified: false }).refused, 'F: …but a genuine general question is allowed');
  const ui = readFileSync('src/pages/PageGenerator.tsx', 'utf8');
  ok(/unsupported_claim/.test(ui) && /unsupported_topic/.test(ui), 'F: the Page Generator screen says why, in words');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
if (failures) process.exit(1);
