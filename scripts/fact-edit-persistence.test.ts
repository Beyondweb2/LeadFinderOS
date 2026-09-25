/* ============================================================
   F13 — A FACT EDIT IS SAVED, AND APPROVE APPROVES WHAT IS SHOWN (BS4 pilot, 2026-09-25).

   The pilot: Services held 26 operator-entered strings; the operator cut them to 11; the header said
   Saved; after a reload the 26 came back, and Approve then verified the stale 26. The edit lived only
   in the row's own React state — never in the saved Website Build state.

   PATH     edit → the stored fact (needs approval) → the server's save rule → reload → approve →
            save → reload → exactly the edited value, verified. Services (a list) and base town (a scalar).
   RULES    an edit is never a verification; editing a verified value un-verifies it; Undo restores it.
   QUEUE    one save at a time; "saved" only once the newest state is on the server; out-of-order
            completion cannot leave an older state saved; a failure keeps the edit and reports it.
   SOURCE   no fact editor keeps a local draft of a fact value again.

   Run: npx tsx scripts/fact-edit-persistence.test.ts
   ============================================================ */
import { readFileSync } from 'node:fs';
import { candidateFacts, decide, editFact, isPublishable, mergeFacts, storedFact, type FactRow, type FactsContext } from '../src/lib/buildFacts.ts';
import { normaliseWebsiteBuild, parseWebsiteBuild, type BuildFact, type WebsiteBuildState } from '../src/lib/websiteBuildState.ts';
import { createSaveQueue, type SaveStatus } from '../src/lib/saveQueue.ts';

let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

/* BS4-like fixture: a MANUAL (operator-entered) onboarding row with 26 service strings and a base town. */
const RAW_26 = ['Rewiring', 'Fuse board upgrades', 'EV charger installation', 'EICR reports', 'Lighting installation', 'Fault finding', 'Emergency callouts', 'Consumer Unit Upgrade', 'EICRs', 'EV Charger Installations', 'Rewiring Services', 'Additional Socket Installations', 'Lighting Installations', 'Commercial Electrical Services', 'Landlord Electrical Certificates', 'Emergency Electrician', 'Lighting Installations Bristol', 'Commercial Electrician Bristol', 'Smoke Alarm Installations', 'Consumer Unit Upgrades Bristol', 'EICR Bristol', 'EV Charger Installation Bristol', 'House Rewire Bristol', 'Electrical Fault Finding Bristol', 'Additional Sockets Bristol', 'Landlord EICR Bristol'];
const CLEAN_11 = 'Consumer unit upgrades, EICRs (electrical inspections), EV charger installation, Rewiring, Electrical fault finding, Additional sockets, Lighting installation, Commercial electrical services, Landlord electrical certificates, Emergency electrician, Smoke and CO alarm installation';
const ctx: FactsContext = {
  lead: { business_name: 'BS4 Electrical Services Ltd', website: 'https://bs4electricalservices.co.uk/' },
  onboarding: { business_name: 'BS4 Electrical Services Ltd', client_source: 'manual', confirmed_location: 'Bath', services_list: RAW_26, areas_list: ['Bath', 'Keynsham'] },
  baseline_audit: null, discovery_audit: null, crawl: null,
} as unknown as FactsContext;
const candidates = candidateFacts(ctx);
const rowsOf = (s: WebsiteBuildState) => mergeFacts(candidates, s.facts, null);
const row = (s: WebsiteBuildState, k: string) => rowsOf(s).find((r) => r.key === k)!;
/* The page's putFact: replace the stored fact by key. */
const put = (s: WebsiteBuildState, f: BuildFact): WebsiteBuildState => ({ ...s, facts: [...s.facts.filter((x) => x.key !== f.key), f] });
/* What a save + reload does: the server's save rule (shared with paid-client-hub), JSON, then the page's parse. */
const saveAndReload = (s: WebsiteBuildState) => parseWebsiteBuild(JSON.parse(JSON.stringify(normaliseWebsiteBuild(s))));
const split = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

console.log('\n── SERVICES: 26 → edit to 11 → save → reload → approve → save → reload ──');
{
  let s = parseWebsiteBuild({ version: 2 });
  ok(split(row(s, 'services').value).length === 26 && row(s, 'services').status === 'detected', 'fixture: 26 operator-entered services, needs approval');
  /* type it in pieces, the way an operator edits — each keystroke goes through the same path */
  for (const partial of ['Consumer unit upgrades', 'Consumer unit upgrades, EICRs (electrical inspections)', CLEAN_11]) s = put(s, editFact(row(s, 'services'), partial));
  ok(row(s, 'services').value === CLEAN_11, 'the edited value is in the saved state immediately (not only on screen)');
  ok(row(s, 'services').status === 'detected' && !isPublishable(row(s, 'services')), 'an edit is saved as NEEDS APPROVAL, never verified');
  s = saveAndReload(s);
  ok(row(s, 'services').value === CLEAN_11, 'after a save and a reload the 11 are still there — the 26 do not come back');
  s = put(s, decide(row(s, 'services'), 'verified'));
  s = saveAndReload(s);
  const v = row(s, 'services');
  ok(v.status === 'verified' && split(v.value).length === 11 && v.value === CLEAN_11, 'approve → save → reload: exactly the 11 services, verified');
  ok(!RAW_26.some((x) => /Bristol$/.test(x) && v.value.includes(x)), 'none of the stale raw strings was approved');
}

console.log('\n── APPROVE STRAIGHT AFTER THE EDIT (no reload) — one state carries both ──');
{
  let s = parseWebsiteBuild({ version: 2 });
  s = put(s, editFact(row(s, 'services'), CLEAN_11));
  s = put(s, decide(row(s, 'services'), 'verified'));      // Approve reads the row, which already holds the edit
  const once = saveAndReload(s);
  ok(row(once, 'services').status === 'verified' && row(once, 'services').value === CLEAN_11, 'edit + approval saved together: the approved value is the edited one');
}

console.log('\n── SCALAR: base town Bath → Bristol ──');
{
  let s = parseWebsiteBuild({ version: 2 });
  ok(row(s, 'primary_town').value === 'Bath', 'fixture: onboarding says Bath');
  s = put(s, editFact(row(s, 'primary_town'), 'Bristol'));
  s = saveAndReload(s);
  ok(row(s, 'primary_town').value === 'Bristol' && row(s, 'primary_town').status === 'detected', 'reload reproduces the edited town, still needs approval');
  s = saveAndReload(put(s, decide(row(s, 'primary_town'), 'verified')));
  ok(row(s, 'primary_town').value === 'Bristol' && row(s, 'primary_town').status === 'verified', 'approve → reload: Bristol verified');
  /* editing a VERIFIED value un-verifies it until approved again */
  s = put(s, editFact(row(s, 'primary_town'), 'Bristol (Knowle West)'));
  ok(row(s, 'primary_town').status === 'detected' && !isPublishable(row(s, 'primary_town')), 'editing a verified value makes it needs-approval — it can never reach the site unapproved');
}

console.log('\n── UNDO ──');
{
  let s = parseWebsiteBuild({ version: 2 });
  s = saveAndReload(put(s, decide(row(s, 'primary_town'), 'verified', 'Bristol')));
  const before: FactRow = row(s, 'primary_town');
  const snap = storedFact(before);
  s = put(s, editFact(before, 'Somewhere else'));
  s = put(s, snap);
  ok(row(s, 'primary_town').value === 'Bristol' && row(s, 'primary_town').status === 'verified', 'Undo edit puts back the stored decision exactly (value and status)');
  const untouched = parseWebsiteBuild({ version: 2 });
  const edited = put(untouched, editFact(row(untouched, 'services'), 'x'));
  const undone = { ...edited, facts: edited.facts.filter((f) => f.key !== 'services') };   // onReset for a row that had no decision
  ok(row(undone, 'services').value === RAW_26.join(', ') || split(row(undone, 'services').value).length === 26, 'Undo on an undecided row returns to the candidate value');
}

console.log('\n── SAVE QUEUE ──');
{
  /* out-of-order completion: save A is slow, the edit B made meanwhile must be what ends up stored */
  const db: string[] = [];
  const statuses: string[] = [];
  let releaseA: () => void = () => {};
  const send = (s: string) => new Promise<void>((res) => { if (s === 'A') releaseA = () => { db.push(s); res(); }; else { db.push(s); res(); } });
  const q = createSaveQueue<string>(send, (st: SaveStatus) => statuses.push(st + ':' + db.length));
  q.reset('loaded');
  statuses.length = 0;
  q.change('A');
  const p1 = q.flush();
  await Promise.resolve();
  q.change('B');                          // an edit while A is in flight
  const p2 = q.flush();                   // the debounce fires again — must WAIT for A, not race it
  ok(db.length === 0 && q.status() === 'saving', 'B is not sent while A is in flight');
  releaseA();
  await Promise.all([p1, p2]);
  ok(db.join(',') === 'A,B', 'saves run one at a time, in order — the database ends at the newest state');
  ok(q.status() === 'saved' && !q.pending(), 'Saved only once the newest state is stored');
  ok(!statuses.some((x) => x === 'saved:0' || x === 'saved:1') && statuses[statuses.length - 1] === 'saved:2', 'no Saved was reported until B was stored (' + statuses.join(' ') + ')');
}
{
  /* failure: the edit is kept, reported, and still pending; a retry sends it */
  let fail = true;
  const db: string[] = [];
  const q = createSaveQueue<string>(async (s) => { if (fail) throw new Error('network'); db.push(s); }, () => {});
  q.reset('loaded');
  q.change('EDIT');
  await q.flush();
  ok(q.status() === 'error' && q.pending(), 'a failed save reports error and keeps the edit pending (nothing rolled back)');
  fail = false;
  await q.flush();
  ok(db.join() === 'EDIT' && q.status() === 'saved', 'Retry sends the kept edit, then Saved');
}
{
  const q = createSaveQueue<string>(async () => { throw new Error('x'); }, () => {});
  q.reset('loaded');
  ok(q.status() === 'saved' && !q.pending(), 'a freshly loaded state is saved with nothing pending');
  q.change('E');
  ok(q.status() === 'dirty', 'an unsent change reads as unsaved, never Saved');
}

console.log('\n── SOURCE GUARD: no fact editor holds a fact value in a local draft ──');
{
  const src = readFileSync('src/pages/WebsiteBuild.tsx', 'utf8');
  const body = (name: string) => { const i = src.indexOf('function ' + name + '('); return src.slice(i, src.indexOf('\nfunction ', i + 10)); };
  const fre = body('FactRowEditor');
  ok(!/setDraft/.test(fre) && /onEdit\(r, v\)/.test(fre), 'FactRowEditor: no local draft; every edit goes through onEdit (saved)');
  const mfr = body('MappedFieldRow');
  ok(/if \(isProject\) setDraft\(e\.target\.value\); else if \(row\) onEdit\(row, e\.target\.value\)/.test(mfr), 'MappedFieldRow: a fact-backed field saves as typed; only the project field keeps a draft');
  ok(/createSaveQueue/.test(src) && !/latest\.current === s/.test(src), 'the page saves through the queue, not an ad-hoc in-flight check');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
