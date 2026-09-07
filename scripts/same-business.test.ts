/* ════════════════════════════════════════════════════════════════════════════════════════════════
   IS THIS THE SAME BUSINESS? — driven with the REAL collisions, not invented ones.

   Run: npx tsx scripts/same-business.test.ts

   ⛔ EVERY GROUP BELOW IS A MEASURED SHAPE from the live lead table (2026-09-07). If a future change
   makes any of these match again, a real prospect gets attributed to a different business and their
   audit is skipped because a stranger was audited recently.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  pickSameBusiness, pickByPlaceId, townsAgree, normaliseTown, addressMentionsTown,
  type SameBusinessCandidate,
} from '../supabase/functions/_shared/same-business.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

let n = 0;
const L = (name: string, town: string | null, place: string | null, created = '2026-08-01'): SameBusinessCandidate =>
  ({ id: `lead-${++n}`, business_name: name, town, place_id: place, is_archived: false, created_at: created });

console.log('── TOWN NORMALISATION IS DELIBERATELY DUMB ──');
ok(townsAgree('Wisbech', 'wisbech'), 'case does not matter');
ok(townsAgree(' St. Neots ', 'st neots'), 'punctuation and padding do not matter');
ok(!townsAgree('Newcastle', 'newcastle upon tyne'), 'NO fuzzy/partial town matching — costs one fresh audit, never a wrong match');
ok(!townsAgree('', 'wisbech'), 'a missing submitted town is not agreement');
ok(!townsAgree('wisbech', null), 'a missing lead town is not agreement');
ok(!townsAgree(null, null), 'two absences are not agreement');
ok(normaliseTown(undefined) === '', 'undefined folds to empty rather than throwing');

console.log('\n── THE MEASURED NAME COLLISIONS ──');
{
  // "Timpson" — Blyth AND Wisbech, 2 place_ids. A Wisbech submission must not take the Blyth lead.
  const group = [L('Timpson', 'blyth', 'ChIJ6_owiA9zfk'), L('Timpson', 'wisbech', 'ChIJ-61COPsC2E')];
  const wis = pickSameBusiness(group, 'Wisbech', 'business name');
  ok(wis.kind === 'match' && wis.leadId === group[1].id, 'Timpson/Wisbech matches the WISBECH lead, not the Blyth one');
  const hull = pickSameBusiness(group, 'Hull', 'business name');
  ok(hull.kind === 'refused', 'Timpson/Hull matches neither — a new lead, not a chain collision');
  ok(hull.kind === 'refused' && /blyth|wisbech/.test(hull.reason), 'and the refusal names where they actually are');
}
{
  // "Fletcher Lock & Safe Co" — TWO different shops, BOTH in Sunderland. The town cannot split this.
  const group = [L('Fletcher Lock & Safe Co', 'sunderland', 'ChIJvyRjQGtmfk'),
                 L('Fletcher Lock & Safe Co', 'sunderland', 'ChIJFzQRPmtmfk')];
  const v = pickSameBusiness(group, 'Sunderland', 'business name');
  ok(v.kind === 'refused', 'two different shops of the same name in ONE town REFUSES — the town rule cannot solve it');
  ok(v.kind === 'refused' && /cannot be established/.test(v.reason), 'and says so plainly');
}
{
  // Ipswich holds FOUR "Timpson Locksmiths and Safe Engineers" leads across 3 place_ids.
  const group = [
    L('Timpson Locksmiths and Safe Engineers', 'ipswich', 'ChIJz691pSyg2U'),
    L('Timpson Locksmiths and Safe Engineers', 'ipswich', 'ChIJB4iUxCyg2U'),
    L('Timpson Locksmiths and Safe Engineers', 'ipswich', 'ChIJO7gCD-2g2U'),
    L('Timpson Locksmiths and Safe Engineers', 'poole', 'ChIJ05blNnqhc0'),
    L('Timpson Locksmiths and Safe Engineers', 'bournemouth', 'ChIJyTIBrGqfc0'),
  ];
  ok(pickSameBusiness(group, 'Ipswich', 'business name').kind === 'refused',
    'four same-name leads in Ipswich refuses rather than picking one at random');
  const poole = pickSameBusiness(group, 'Poole', 'business name');
  ok(poole.kind === 'match', 'Poole has exactly one, so it matches');
  ok(poole.kind === 'match' && /other lead/.test(poole.why), 'and the match records that the chain exists elsewhere');
}
{
  // "AC Leigh" — Ipswich AND Norwich.
  const group = [L('AC Leigh', 'ipswich', 'ChIJY38Ju5ih2U'), L('AC Leigh', 'norwich', 'ChIJNSCFB-Dj2U')];
  const v = pickSameBusiness(group, 'Norwich', 'business name');
  ok(v.kind === 'match' && v.leadId === group[1].id, 'AC Leigh/Norwich takes the Norwich lead');
}

console.log('\n── THE MEASURED PHONE COLLISIONS ──');
{
  /* 448000187187 is Timpson's NATIONAL SWITCHBOARD: 15 leads, 8+ towns. This is the single worst
     collision in the book and the reason the phone rung needed the same treatment as the name. */
  const group = [
    L('Timpson Security', 'ellesmere port', 'ChIJ0RvN6Pvd'),
    L('Timpson Mobile Locksmiths', 'liverpool', 'ChIJPwd214rX'),
    L('Timpson Locksmiths and Safe Engineers', 'bournemouth', 'ChIJyTIBrGqf'),
    L('Timpson Locksmith and Safe Engineers', 'hemel hempstead', 'ChIJ4x58f0FB'),
    L('Timpson Locksmiths & Safe Engineers', 'gosport', 'ChIJoxZYoXln'),
  ];
  ok(pickSameBusiness(group, 'Leeds', 'phone').kind === 'refused',
    'a submission from Leeds on the national switchboard gets a NEW lead, not a random branch');
  const gos = pickSameBusiness(group, 'Gosport', 'phone');
  ok(gos.kind === 'match' && gos.leadId === group[4].id, 'Gosport matches the one Gosport branch');
}
{
  // 447925057763 — Ali Barber and Silvan Barber, DIFFERENT businesses, SAME phone, SAME town.
  const group = [L('Ali Barber', 'wrexham', 'ChIJHwDbwHzH'), L('Silvan Barber', 'wrexham', 'ChIJ1UJfiCfH')];
  const v = pickSameBusiness(group, 'Wrexham', 'phone');
  ok(v.kind === 'refused', 'two different businesses sharing a phone in one town refuses');
}
{
  // 443303333303 — Toolstation March / Andover(Hampshire) / Bath.
  const group = [L('Toolstation March', 'march', 'ChIJLzuXSnAH'),
                 L('Toolstation Andover', 'hampshire', 'ChIJCykeQYf4'),
                 L('Toolstation Bath', 'bath', 'ChIJtTX3SMqG')];
  ok(pickSameBusiness(group, 'March', 'phone').kind === 'match', 'the March branch matches on town');
  ok(pickSameBusiness(group, 'Andover', 'phone').kind === 'refused',
    'a submission from Andover refuses, because that lead is filed under "hampshire" — strict beats wrong');
}

console.log('\n── ABSENCES ──');
ok(pickSameBusiness([], 'Wisbech', 'business name').kind === 'refused', 'no candidates refuses');
ok(pickSameBusiness([L('X', 'wisbech', null)], '', 'business name').kind === 'refused',
  'a submission with NO town cannot match on name or phone');
ok(pickSameBusiness([L('X', null, null)], 'Wisbech', 'business name').kind === 'refused',
  'a lead with no town on file can never satisfy the check — 138 real leads are in this state');
{
  const one = [L('Lonely Locksmith', 'wisbech', 'ChIJabc')];
  const v = pickSameBusiness(one, 'Wisbech', 'business name');
  ok(v.kind === 'match', 'the ordinary case still matches: one lead, same name, same town');
  ok(v.kind === 'match' && !/other lead/.test(v.why), 'and does not mention a chain that is not there');
}

console.log('\n── ALL THE TOWN EVIDENCE, NOT ONE COLUMN ──');
{
  /* The REAL case the first draft got wrong, caught by replaying live submissions rather than by
     reasoning: "sinners and saints" has derived_town "Muang" (the district Google returns) while
     search_location is "chiang mai" and the address reads "... Chang Wat Chiang Mai 50100,
     Thailand". A customer types Chiang Mai. Preferring derived_town forked a genuine repeat into a
     new lead and a second paid audit, every single time. */
  const real: SameBusinessCandidate = {
    id: 'sns', business_name: 'sinners and saints', town: 'Muang', searchLocation: 'chiang mai',
    address: '149 5 Soi Kamphaeng Din, Tambon Hai Ya, Muang, Chang Wat Chiang Mai 50100, Thailand',
    place_id: 'ChIJu6roGQ8x2jAR', is_archived: false, created_at: '2026-08-20',
  };
  ok(pickSameBusiness([real], 'Chiang Mai', 'business name').kind === 'match',
    'a real repeat matches on search_location though derived_town says "Muang"');
  ok(pickSameBusiness([{ ...real, searchLocation: null }], 'Chiang Mai', 'business name').kind === 'match',
    'and still matches on the ADDRESS alone when both town columns disagree');
  ok(pickSameBusiness([{ ...real, searchLocation: null, address: null }], 'Chiang Mai', 'business name').kind === 'refused',
    'with no supporting evidence at all it refuses');
}
{
  /* Widening the evidence must NOT let the chain collisions back in — the property that decides
     whether this change is safe. A Blyth Timpson says Blyth everywhere and Wisbech nowhere. */
  const blyth: SameBusinessCandidate = { id: 'b', business_name: 'Timpson', town: 'blyth',
    searchLocation: 'blyth', address: '12 Market St, Blyth NE24, UK', place_id: 'p1',
    is_archived: false, created_at: '2026-08-01' };
  const wis: SameBusinessCandidate = { id: 'w', business_name: 'Timpson', town: 'wisbech',
    searchLocation: 'wisbech', address: '3 High St, Wisbech PE13, UK', place_id: 'p2',
    is_archived: false, created_at: '2026-08-02' };
  const v = pickSameBusiness([blyth, wis], 'Wisbech', 'business name');
  ok(v.kind === 'match' && v.leadId === 'w', 'the widened evidence still picks the RIGHT Timpson');
  ok(pickSameBusiness([blyth], 'Wisbech', 'business name').kind === 'refused',
    'and the Blyth branch is still refused for a Wisbech submission');
}
{
  // The substring trap this project has been fooled by twice each ("bing" in plumbing, "acca" in Macca-Gas).
  ok(!addressMentionsTown('Ely', '42 Wembley Park Drive, Wembley HA9, UK'),
    'a town matches as a WHOLE TOKEN — "Ely" does not match inside "Wembley"');
  ok(addressMentionsTown('Wisbech', '3 High St, Wisbech PE13, UK'), 'and a real token run does match');
  ok(addressMentionsTown('chiang mai', 'Chang Wat Chiang Mai 50100, Thailand'), 'multi-word towns match as a run');
  ok(!addressMentionsTown('', 'anywhere'), 'an empty town matches nothing');
  ok(!addressMentionsTown('Wisbech', null), 'a missing address matches nothing');
}

console.log('\n── place_id IS IDENTITY AND IS EXEMPT FROM THE TOWN RULE ──');
{
  const one = [L('Whatever It Is Called Now', 'somewhere else', 'ChIJexact')];
  const v = pickByPlaceId(one);
  ok(v.kind === 'match', 'an exact place_id matches even when the town disagrees — it IS the business');
}
{
  /* Two leads on one place_id are duplicates of ONE shop. Oldest wins DETERMINISTICALLY: the bug
     being fixed is precisely that .limit(1) took whichever row came back first. */
  const dupes = [L('Shop', 'wisbech', 'ChIJsame', '2026-08-20'), L('Shop', 'wisbech', 'ChIJsame', '2026-07-01')];
  const v = pickByPlaceId(dupes);
  ok(v.kind === 'match' && v.leadId === dupes[1].id, 'duplicates on one place_id resolve to the OLDEST, never arbitrarily');
  ok(v.kind === 'match' && /oldest/.test(v.why), 'and the choice is recorded');
  const rev = pickByPlaceId([dupes[1], dupes[0]]);
  ok(rev.kind === 'match' && rev.leadId === dupes[1].id, 'and the answer does not depend on row order');
}
ok(pickByPlaceId([]).kind === 'refused', 'no place_id candidates refuses');

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
