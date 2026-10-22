import { ownerInView, inboxMarketOf, countryInView, inboxIsReadOnly, VIEW_ME, VIEW_UNASSIGNED } from '../src/lib/inboxView.ts';

let failures = 0;
const ok = (condition: boolean, label: string) => { if (!condition) failures++; console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); };

ok(ownerInView(VIEW_ME, 'u1', 'u1'), 'Me shows my own lead');
ok(!ownerInView(VIEW_ME, 'u2', 'u1'), 'Me hides another person\'s lead');
ok(!ownerInView(VIEW_ME, null, 'u1'), 'Me hides an unassigned lead');
ok(!ownerInView(VIEW_ME, null, null), 'no signed-in user and no owner is never a match');
ok(ownerInView('u2', 'u2', 'u1'), 'a team member\'s view shows their lead');
ok(!ownerInView('u2', 'u1', 'u1'), 'a team member\'s view hides mine');
ok(ownerInView(VIEW_UNASSIGNED, null, 'u1') && ownerInView(VIEW_UNASSIGNED, undefined, 'u1'), 'Unassigned shows leads with no owner');
ok(!ownerInView(VIEW_UNASSIGNED, 'u1', 'u1'), 'Unassigned hides an owned lead');

ok(inboxMarketOf('UK', '441234') === 'UK', 'country UK -> UK');
ok(inboxMarketOf('Malaysia', null) === 'MY', 'country Malaysia -> MY');
ok(inboxMarketOf('Singapore', null) === 'SG', 'country Singapore -> SG');
ok(inboxMarketOf('Australia', null) === 'AU', 'country Australia -> AU');
ok(inboxMarketOf(null, '447700900123') === 'UK', 'blank country falls back to the +44 prefix');
ok(inboxMarketOf('', '60123456789') === 'MY', 'blank country falls back to the +60 prefix');
ok(inboxMarketOf('  ', '6591234567') === 'SG', 'whitespace country falls back to the +65 prefix');
ok(inboxMarketOf(null, '61412345678') === 'AU', 'blank country falls back to the +61 mobile prefix');
ok(inboxMarketOf('India', '447700900123') === null, 'a country we do not run is not overridden by the number');
ok(countryInView('all', 'India', null), 'All shows everything');
ok(countryInView('UK', 'UK', null) && !countryInView('UK', 'Malaysia', null), 'UK filter keeps UK only');

ok(inboxIsReadOnly('u2', false), 'someone else\'s inbox is read-only for a non-admin');
ok(inboxIsReadOnly(VIEW_UNASSIGNED, false), 'the unassigned inbox is read-only for a non-admin');
ok(!inboxIsReadOnly('u2', true), 'an admin can send from any inbox');
ok(!inboxIsReadOnly(VIEW_ME, false), 'my own inbox is never read-only');

if (failures) { console.error(`${failures} failed`); process.exit(1); }
