/* ============================================================
   WELCOME PACK READINESS — the rule that decides whether a paid client has a pack, and the one
   property the old button did not have: it resolves from the PAID BASELINE and nothing else.

   The bug this pins: WelcomePackButton.tsx resolved "the newest non-market audit with a completed
   run". MCLocksmiths has one baseline and two Discovery scans, and on 2026-09-22 the baseline was
   newest only by ordering. Run one more Discovery and that button would have built a client's
   welcome pack out of Discovery data with nothing on screen saying so.

   Run: npx tsx scripts/welcome-pack-readiness.test.ts
   ============================================================ */
import { welcomePackReadiness, welcomePackUrl } from '../src/lib/welcomePackData.ts';

let failures = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}

const BASELINE_ID = '50880751-87cc-4bb7-a642-d99e470379a3';
const DISCOVERY_ID = '50986aa3-57c6-401c-9fd7-5626bd705bef';
const completeBaseline = {
  id: BASELINE_ID, audit_purpose: 'baseline',
  baseline_completed_at: '2026-09-22T03:24:58.072Z', short_code: 'mqy2uf',
};

console.log('\n── 1. AN INCOMPLETE BASELINE IS WAITING, NEVER READY ──');
{
  const r = welcomePackReadiness({ baseline_audit_id: BASELINE_ID }, { ...completeBaseline, baseline_completed_at: null });
  ok(r.state === 'waiting', `running baseline → waiting (got ${r.state})`);
  ok(r.missing.includes('completed baseline'), 'it names what is missing');
}
{
  const r = welcomePackReadiness({ baseline_audit_id: null }, null);
  ok(r.state === 'waiting', `no baseline at all → waiting (got ${r.state})`);
  ok(r.auditId === null, 'and no audit id is invented');
}

console.log('\n── 2. A COMPLETED INITIAL PAID BASELINE IS READY ──');
{
  const r = welcomePackReadiness({ baseline_audit_id: BASELINE_ID }, completeBaseline);
  ok(r.state === 'ready', `completed baseline → ready (got ${r.state})`);
  ok(r.missing.length === 0, 'nothing is missing');
  ok(r.canShare === true, 'and it can be shared');
  ok(r.auditId === BASELINE_ID, 'the pack is keyed to the baseline audit id');
}

console.log('\n── 3. DISCOVERY ALONE NEVER MAKES IT READY (the whole point) ──');
{
  /* A Discovery scan that finished, on a lead whose baseline has not run. The lead does not claim
     it, so there is no baseline_audit_id — waiting, whatever Discovery did. */
  const r = welcomePackReadiness({ baseline_audit_id: null }, {
    id: DISCOVERY_ID, audit_purpose: 'discovery',
    baseline_completed_at: '2026-09-21T16:54:41.583Z', short_code: 'vwagdd',
  });
  ok(r.state === 'waiting', `completed Discovery, no baseline → waiting (got ${r.state})`);
  ok(r.auditId === null, 'the Discovery audit is not adopted as the pack source');
}
{
  /* And if a caller somehow hands the Discovery ROW through, the purpose assertion refuses it
     rather than trusting the claim trigger that set baseline_audit_id. */
  const r = welcomePackReadiness({ baseline_audit_id: DISCOVERY_ID }, {
    id: DISCOVERY_ID, audit_purpose: 'discovery',
    baseline_completed_at: '2026-09-21T16:54:41.583Z', short_code: 'vwagdd',
  });
  ok(r.state === 'error', `a discovery-purpose row is refused outright (got ${r.state})`);
  ok(/discovery/.test(r.reason), 'and the refusal says which kind it was');
}
{
  const r = welcomePackReadiness({ baseline_audit_id: BASELINE_ID }, {
    id: DISCOVERY_ID, audit_purpose: 'baseline', baseline_completed_at: '2026-09-21T00:00:00Z', short_code: 'vwagdd',
  });
  ok(r.state === 'error', 'an audit that is not the one the lead points at is refused');
}

console.log('\n── 4. THE PACK USES THE CORRECT BASELINE ──');
{
  const r = welcomePackReadiness({ baseline_audit_id: BASELINE_ID }, completeBaseline);
  ok(r.shortCode === 'mqy2uf', 'the share code is the BASELINE audit’s code, not any other audit’s');
}
{
  /* LEGACY: the three clients paid before audit_purpose existed carry NULL on the baseline row.
     The lead pointing at it IS the claim, so a NULL purpose is accepted. */
  const r = welcomePackReadiness({ baseline_audit_id: 'f64920ce-8bdc-44b3-b35a-a63a75ee4395' }, {
    id: 'f64920ce-8bdc-44b3-b35a-a63a75ee4395', audit_purpose: null,
    baseline_completed_at: '2026-08-11T15:26:28.878Z', short_code: '7fape7',
  });
  ok(r.state === 'ready', 'a legacy pre-audit_purpose baseline still produces a pack');
}

console.log('\n── 5. THE PUBLIC URL ──');
ok(welcomePackUrl('mqy2uf') === 'https://findable.live/w/mqy2uf',
  `findable.live/w/<code> (got ${welcomePackUrl('mqy2uf')})`);
{
  const r = welcomePackReadiness({ baseline_audit_id: BASELINE_ID }, { ...completeBaseline, short_code: null });
  ok(r.state === 'ready' && r.canShare === false, 'no short code → still downloadable, but not shareable');
  ok(r.missing.includes('public share link'), 'and it says exactly that, rather than failing silently');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
