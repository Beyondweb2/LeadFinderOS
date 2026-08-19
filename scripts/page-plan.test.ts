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
  MAX_TOWN_MENTIONS,
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
}

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILED`);
if (f > 0) process.exit(1);
