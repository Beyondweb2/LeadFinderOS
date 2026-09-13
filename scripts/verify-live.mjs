#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════════════════════════════
   IS IT ACTUALLY LIVE? — resolve the file first, THEN assert the string.

   🔴 WHY THIS EXISTS (2026-09-13). Three times in one evening I grepped a page's HTML for a string
   that lives in a JavaScript chunk, got zero, and reported "not deployed". Twice the thing was
   already live. A zero has two completely different meanings and the grep cannot tell them apart:
     (a) the marker is absent      — a real answer, the deploy has not landed
     (b) I read the wrong file     — no answer at all, dressed as answer (a)
   Every lazy route and every Astro island is case (b) waiting to happen: their code is NEVER in the
   HTML, only the name of the chunk that holds it.

   ⛔ SO THE RESOLUTION STEP IS MANDATORY AND ITS FAILURE IS ITS OWN RESULT. A target names how to
   FIND its file — follow the entry chunk, follow an island — and if that resolution fails the script
   says UNRESOLVED, never "absent". Only a marker checked against a file that was genuinely fetched
   can report a zero as absence.

   ⛔ IT ALSO FAILS ON AN UNEXPECTED PRESENCE. Half of tonight's changes were REMOVALS ("one-off",
   "You decide what happens next", the old #how button). A script that only looks for new strings
   calls a half-deployed build green, because the new copy and the old copy would both be there.

   ⚠️ NOT A HASH COMPARISON. §4: a local build hash and a live one legitimately differ across build
   environments — tonight's Dashboard was DOeDjlVE locally and DnyXNEHN live, both correct. The
   marker from the change itself is the only assertion that means anything.

   Usage:  node scripts/verify-live.mjs
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const SPA = 'https://leadfinderos.pages.dev';
const SITE = 'https://findable.live';

const get = async (url) => {
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
};

/* 🔴 WHITESPACE IS NORMALISED BEFORE MATCHING, AND THIS CAUGHT A VACUOUS PASS THE DAY IT WAS
   ADDED. Rendered prose wraps wherever the SOURCE wrapped: ProofSection's lead is written across
   two source lines, so the live HTML holds "that is the whole
        guarantee" and the
   contiguous string "that is the whole guarantee" appears NOWHERE in it. An `absent` check for
   that string therefore PASSED against a page still plainly showing the sentence — the exact
   false green this file exists to prevent, reproduced inside the file itself.
   ⛔ SO EVERY BODY IS COLLAPSED TO SINGLE SPACES BEFORE EITHER TEST. A marker is then robust to
   how the author happened to wrap the source, which is not a fact about the deploy. */
const flatten = (body) => body.replace(/\s+/g, ' ');

/* ── RESOLVERS. Each returns { url, body } or throws — and a throw is UNRESOLVED, never absent. ── */

/** The page itself. The only target for which HTML is the right file. */
const page = (url) => async () => ({ url, body: await get(url) });

/** A Vite entry chunk: named in the HTML. */
const spaEntry = () => async () => {
  const html = await get(`${SPA}/`);
  const m = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/);
  if (!m) throw new Error('no entry chunk named in the SPA HTML');
  return { url: `${SPA}/${m[0]}`, body: await get(`${SPA}/${m[0]}`) };
};

/** A lazily-imported route chunk: named in the ENTRY chunk, never in the HTML. This is the case
 *  that produced two false "not deployed" reports. */
const spaLazy = (name) => async () => {
  const { body: entry } = await (spaEntry())();
  const re = new RegExp(`${name}-[A-Za-z0-9_-]+\\.js`);
  const m = entry.match(re);
  if (!m) throw new Error(`no ${name} chunk referenced by the entry chunk`);
  return { url: `${SPA}/assets/${m[0]}`, body: await get(`${SPA}/assets/${m[0]}`) };
};

/** An Astro island: the page names its chunks; find the one that actually holds the component. */
const island = (pagePath, needle) => async () => {
  const html = await get(`${SITE}${pagePath}`);
  const paths = [...new Set([...html.matchAll(/\/_astro\/[A-Za-z0-9._-]+\.js/g)].map((m) => m[0]))];
  if (!paths.length) throw new Error(`no island chunks referenced by ${pagePath}`);
  for (const p of paths) {
    const body = await get(`${SITE}${p}`);
    if (body.includes(needle)) return { url: `${SITE}${p}`, body };
  }
  throw new Error(`none of the ${paths.length} island chunks on ${pagePath} contains ${JSON.stringify(needle)}`);
};

/* ── WHAT MUST BE TRUE. `present` must appear; `absent` must NOT (the removals). ─────────────── */
const TARGETS = [
  {
    name: 'SPA · review queue + refund (AppLayout, entry chunk)',
    resolve: spaEntry(),
    present: ['Records the refund. Moves no money.', 'Open the winnable questions',
              'review-tab-collapsed', 'review_dismissed', 'Review queue unavailable'],
  },
  {
    name: 'SPA · dashboard collapse (lazy route chunk)',
    resolve: spaLazy('Dashboard'),
    present: ['dashboard.section.', 'dashboard.pipeline.showAll', 'dashboard.campaign.',
              'Hide empty statuses', 'per-campaign funnels'],
  },
  {
    name: 'findable.live · hero + pricing card',
    resolve: page(`${SITE}/`),
    present: ['had my report', 'Your second payment is',
              'The monthly starts 14 days later unless you cancel'],
    /* The removals. Without these a half-deployed build reads green. */
    absent: ['one-off', 'You decide what happens next', 'Once your claim window closes',
             'href="#how" class="inline-flex items-center justify-center rounded-full border'],
  },
  {
    name: 'findable.live · proof section lead',
    resolve: page(`${SITE}/`),
    /* The rendered text wraps across a source line, so the marker is the tail of the sentence —
       the half that changed — not the whole thing. */
    present: ['so you can see the'],
    absent: ['that is the whole guarantee'],
  },
  {
    name: 'findable.live · FAQ + WhatWeDo wording',
    resolve: page(`${SITE}/`),
    present: ['fourteen days after you get your four week results',
              'taken fourteen days after you get your results'],
    absent: ['starting the day your claim window closes'],
  },
  {
    name: 'findable.live · onboarding island',
    resolve: island('/onboarding/', 'What you pay'),
    present: ['What you pay', '29.99', 'four week results', 'Cancel any time', 'confirmed_phone'],
  },
];

let failures = 0;
for (const t of TARGETS) {
  let resolved;
  try {
    resolved = await t.resolve();
  } catch (e) {
    failures += 1;
    console.log(`UNRESOLVED  ${t.name}`);
    console.log(`            ${e.message}`);
    console.log('            (this is NOT "absent" — nothing was checked)');
    continue;
  }
  const { url, body: raw } = resolved;
  const body = flatten(raw);
  console.log(`
${t.name}
  file: ${url} (${raw.length} bytes)`);
  for (const m of t.present ?? []) {
    const n = body.split(m).length - 1;
    if (n === 0) failures += 1;
    console.log(`  ${n > 0 ? 'PASS' : 'FAIL'}  present: ${JSON.stringify(m)}${n > 1 ? ` (x${n})` : ''}`);
  }
  for (const m of t.absent ?? []) {
    const n = body.split(m).length - 1;
    if (n !== 0) failures += 1;
    console.log(`  ${n === 0 ? 'PASS' : 'FAIL'}  absent:  ${JSON.stringify(m)}${n ? ` — STILL PRESENT x${n}` : ''}`);
  }
}

console.log(failures === 0 ? '\nEVERYTHING CHECKED IS LIVE' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
