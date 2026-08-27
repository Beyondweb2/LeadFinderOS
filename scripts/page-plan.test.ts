/* ============================================================
   PAGE PLAN — the overlap of (what the client wants) and (what we measured), driven with the two
   REAL paying clients' live shapes (re-derived from the DB 2026-08-19).

   ⛔ THE CASES THAT MUST HOLD:
     * RG: 12 real baseline questions -> exactly 10 pages; "best locksmiths in Huntingdon UK" is
       excluded WITH a reason (trade-level, homepage's job); the composite service "uPVC door and
       window locks" answers BOTH the upvc-door and window-locks queries with ONE page carrying
       two queries; the four never-measured areas are listed, never silently dropped.
     * Ronnie: the stale locksmith questions from his wrong-category first baseline can never
       produce a page (no matching service) — the overlap is the second guard behind the server's
       latest-runs rule; "watch repair shop" does NOT match "watch battery replacement" (one shared
       word is a different job); "shoe repair in Elland" DOES match "shoe repairs" (stemming).
     * The anti-stuffing check grades RG's measured failure (5.7% density doorway pages) as
       stuffed and natural copy as ok.
   ============================================================ */
import {
  buildPagePlan, serviceMatches, townMatches, stuffingCheck, slugFor,
  enforceCatchmentHonesty, FALSE_BASE_RE,
  MAX_TOWN_MENTIONS, MAX_SERVICE_PHRASE_REPEATS, MAX_SINGLE_WORD_PCT,
} from "../src/lib/pagePlan.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── RG LOCKSMITHS — the real baseline, verbatim ──");
{
  const plan = buildPagePlan({
    services: ['Emergency lockouts', 'Lock changes', 'uPVC door and window locks', 'Burglary repairs'],
    areas: ['St neots', 'Peterborough', 'Cambridge', 'St ives', 'Brampton', 'Godmanchester', 'Chatteris'],
    homeTown: 'Huntingdon',
    questions: [
      'window locks locksmiths in Huntingdon UK',
      'lock changes locksmiths in Peterborough UK',
      'lock changes locksmiths in Cambridge UK',
      'emergency lockouts locksmiths in Cambridge UK',
      'lock changes locksmiths in St neots UK',
      'best locksmiths in Huntingdon UK',
      'lock changes locksmiths in Huntingdon UK',
      'emergency lockouts locksmiths in St neots UK',
      'upvc door locksmiths in Huntingdon UK',
      'burglary repairs locksmiths in Huntingdon UK',
      'emergency lockouts locksmiths in Huntingdon UK',
      'emergency lockouts locksmiths in Peterborough UK',
    ],
  });
  ok(plan.pages.length === 10, `12 questions -> exactly 10 pages (got ${plan.pages.length})`);
  const upvc = plan.pages.find((p) => p.service === 'uPVC door and window locks' && p.town === 'Huntingdon');
  ok(!!upvc && upvc.queries.length === 2, 'the composite service folds upvc-door + window-locks into ONE page with 2 queries');
  ok(plan.excluded.length === 1 && plan.excluded[0].question === 'best locksmiths in Huntingdon UK',
    'the generic town query is excluded, alone');
  ok(/homepage/.test(plan.excluded[0]?.reason ?? ''), '  and the reason says the homepage covers it');
  ok(plan.unmeasuredAreas.join('|') === 'St ives|Brampton|Godmanchester|Chatteris',
    `wanted-but-never-measured areas listed, not dropped (got ${plan.unmeasuredAreas.join(', ')})`);
  const lockouts = plan.pages.filter((p) => p.service === 'Emergency lockouts');
  ok(lockouts.length === 4, 'Emergency lockouts gets 4 pages (Huntingdon, St neots, Cambridge, Peterborough)');
  ok(plan.pages[0].town === 'Huntingdon', 'home town pages sort first');
  ok(slugFor('uPVC door and window locks', 'St neots') === 'upvc-door-and-window-locks-st-neots', 'slugs are clean kebab');
}

console.log("\n── RONNIE — stale locksmith questions can never make a page ──");
{
  const plan = buildPagePlan({
    services: ['shoe repairs', 'watch battery replacement'],
    areas: ['Halifax', 'Brighouse', 'Huddersfield', 'Elland'],
    homeTown: 'Halifax',
    questions: [
      // the corrected set (sample of the real 12)
      'shoe repair in Halifax',
      'best shoe repair shop in Halifax',
      'shoe repair in Elland',
      'shoe repair in Huddersfield',
      'shoe repair in Brighouse',
      'watch battery replacement in Halifax',
      'watch battery replacement in Brighouse',
      'watch battery replacement in Huddersfield',
      'watch battery replacement in Elland',
      // real measured queries that are NOT his listed services — must exclude, never guess
      'watch repair shop in Halifax',
      'cobbler in Halifax',
      'key cutting near me Halifax',
      'heel repair in Halifax',
      // the stale wrong-category baseline questions (server drops these via latest-runs; the
      // overlap is the second guard and must also drop them)
      'top rated Locksmiths in Halifax UK',
      'best Locksmiths in Halifax UK',
    ],
  });
  ok(plan.pages.length === 8, `-> 8 pages: 2 services x 4 towns (got ${plan.pages.length})`);
  ok(!plan.pages.some((p) => /locksmith/i.test(p.service) || p.queries.some((q) => /locksmith/i.test(q))),
    'no locksmith question reaches any page (the stale-baseline guard)');
  const halifaxShoe = plan.pages.find((p) => p.service === 'shoe repairs' && p.town === 'Halifax');
  ok(!!halifaxShoe && halifaxShoe.queries.includes('shoe repair in Halifax') && halifaxShoe.queries.includes('best shoe repair shop in Halifax'),
    '"shoe repair" (stemmed) and "best shoe repair shop" both land on the shoe-repairs Halifax page');
  ok(!plan.pages.some((p) => p.queries.includes('watch repair shop in Halifax')),
    '"watch repair shop" does NOT match watch battery replacement — one shared word is a different job');
  const excludedQs = plan.excluded.map((e) => e.question);
  for (const q of ['watch repair shop in Halifax', 'cobbler in Halifax', 'key cutting near me Halifax', 'heel repair in Halifax', 'top rated Locksmiths in Halifax UK']) {
    ok(excludedQs.includes(q), `excluded with a reason: "${q}"`);
  }
  ok(plan.unmeasuredAreas.length === 0, 'all four of his areas are measured — nothing unmeasured');
}

console.log("\n── MATCHING EDGES ──");
ok(townMatches('lock changes locksmiths in St neots UK', 'St neots'), 'two-token town matches as a contiguous run');
ok(!townMatches('emergency lockouts in Cambridge UK', 'St neots'), 'a different town never matches');
ok(serviceMatches('upvc door locksmiths in Huntingdon UK', 'uPVC door and window locks'), 'composite sub-phrase matches');
ok(!serviceMatches('best locksmiths in Huntingdon UK', 'Lock changes'), '"locksmiths" alone never matches Lock changes');
ok(!serviceMatches('watch repair shop in Halifax', 'watch battery replacement'), 'single shared token is not a match');
ok(serviceMatches('where can I get keys cut in Halifax', 'key cutting') === false, 'inflection gap (keys cut vs key cutting) honestly does not match — precision over recall');

console.log("\n── ⛔ ABSENT VALUES NEVER PLAN A PAGE ──");
{
  const empty = buildPagePlan({ services: [], areas: [], homeTown: '', questions: ['lock changes in Huntingdon'] });
  ok(empty.pages.length === 0, 'no services/areas -> no pages, never a guess');
  const blankQ = buildPagePlan({ services: ['Lock changes'], areas: [], homeTown: 'Huntingdon', questions: ['', '   '] });
  ok(blankQ.pages.length === 0 && blankQ.excluded.length === 0, 'blank questions are ignored, not excluded rows');
}

console.log("\n── THE ANTI-STUFFING CHECK ──");
{
  /* The measured failure: RG's old agency doorway page — the town and trade hammered. */
  const stuffed = `<p>Locksmith Huntingdon. Our Huntingdon locksmiths are the best locksmiths in
    Huntingdon. Locksmith services Huntingdon: emergency locksmith Huntingdon, locksmiths near
    Huntingdon. Call your Huntingdon locksmith now for locksmith help in Huntingdon.</p>`;
  const v1 = stuffingCheck(stuffed, 'Emergency lockouts', 'Huntingdon');
  ok(v1.verdict === 'stuffed', `the doorway page grades stuffed (${v1.detail})`);
  ok(v1.townCount > MAX_TOWN_MENTIONS, '  town count alone trips it');

  const natural = `<h2>Locked out in a hurry?</h2><p>Getting locked out never happens at a convenient
    moment. We cover Huntingdon and the villages around it, usually the same day, and we will always
    tell you honestly whether a lock can be opened without damage before any work starts.</p>
    <h2>What we do when we arrive</h2><p>Most lockouts are opened without drilling. If a lock does
    need replacing, we carry common sizes in the van and fit them on the spot. You will get a clear
    price before we touch anything.</p><p>We are DBS checked and fully insured, and we also cover
    St Neots and Godmanchester.</p>`;
  const v2 = stuffingCheck(natural, 'Emergency lockouts', 'Huntingdon');
  ok(v2.verdict === 'ok', `de-stuffed copy grades ok (${v2.detail})`);

  const empty = stuffingCheck('', 'Emergency lockouts', 'Huntingdon');
  ok(empty.verdict === 'ok' && empty.wordCount === 0, 'empty input does not divide by zero or false-alarm');

  /* ⛔ THE FALSE-FLAG WE FIXED (2026-08-27): a natural "Lock changes" page uses "lock/locks" heavily
     but says the exact phrase once and the town once. The OLD raw-density metric flagged this at
     ~4-5%; the new metric must pass it silently. */
  const naturalLock = `<h1>Lock Changes in Huntingdon</h1><p>If you need new locks or want to upgrade
    the ones you have, we can help. We understand how much it matters to feel secure at home, so we
    fit reliable locks quickly. When you call us for a lock change we discuss what you need, then a
    locksmith visits to assess your locks and recommend the best replacement. Whether it is a worn
    lock or an upgrade to something more secure, we make sure the new locks work smoothly. Our team
    is DBS checked and fully insured. Get in touch for any lock-related work.</p>`;
  const v3 = stuffingCheck(naturalLock, 'Lock changes', 'Huntingdon');
  ok(v3.verdict === 'ok', `natural lock-changes copy grades ok despite heavy "lock" use (${v3.detail})`);
  ok(v3.topWordPct < MAX_SINGLE_WORD_PCT, `  natural "lock" use (${v3.topWordPct}%) stays under the ${MAX_SINGLE_WORD_PCT}% backstop`);

  /* Exact-phrase hammering trips the phrase cap even when the town is used sparingly. */
  const phraseHammer = `<p>Need lock changes? Our lock changes are fast. For lock changes, book lock
    changes today. Lock changes done right, lock changes you can trust. We do lock changes across the
    area.</p>`;
  const v4 = stuffingCheck(phraseHammer, 'Lock changes', 'Huntingdon');
  ok(v4.phraseCount > MAX_SERVICE_PHRASE_REPEATS, `  exact phrase repeated ${v4.phraseCount}x trips the phrase cap`);
  ok(v4.verdict === 'stuffed', `  phrase-hammered copy grades stuffed (${v4.detail})`);

  /* Bare-noun spam (one word hammered) trips the backstop even with no phrase repeats and a low town. */
  const nounSpam = `<p>Security security security. We are security first: security experts, security
    minded, security led. Security matters. Security here, security there, security everywhere for
    your peace of mind and total security.</p>`;
  const v5 = stuffingCheck(nounSpam, 'Lock changes', 'Huntingdon');
  ok(v5.topWordPct > MAX_SINGLE_WORD_PCT, `  bare-noun spam ("${v5.topWord}" ${v5.topWordPct}%) trips the backstop`);
  ok(v5.verdict === 'stuffed', `  bare-noun-spam copy grades stuffed (${v5.detail})`);
}

console.log("\n── ⛔ CATCHMENT HONESTY — no page may claim a base in a town the client only covers ──");
{
  ok(FALSE_BASE_RE.test('We are based here in town'), 'FALSE_BASE_RE catches "based here"');
  ok(FALSE_BASE_RE.test('visit our premises for a quote'), '  and premises-style claims');
  ok(!FALSE_BASE_RE.test('We cover Peterborough from our base in Huntingdon'), '  but "our base in <home town>" is honest and passes');
  ok(!FALSE_BASE_RE.test('our database of locks'), '  and "database" never false-positives');

  // The strip-manufactured case: "based in Huntingdon" -> town swapped for a neutral -> "based here".
  const manufactured = '<p>We are based here and cover the area.</p><p>Our team is locally based.</p>';
  const r = enforceCatchmentHonesty(manufactured);
  ok(r.fixed, 'the hard guarantee reports it fixed something');
  ok(!FALSE_BASE_RE.test(r.html.replace(/locally/g, '')), '  and the output carries no base claim');
  ok(r.html.includes('serving this area') && r.html.includes('nearby'), '  with readable substitutions');
  ok(r.html.startsWith('<p>'), '  HTML tags untouched (text nodes only)');

  const honest = '<p>We cover the town and travel to you.</p>';
  const r2 = enforceCatchmentHonesty(honest);
  ok(!r2.fixed && r2.html === honest, 'honest copy passes through byte-identical');
}

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILED`);
if (f > 0) process.exit(1);
