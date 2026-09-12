/* ════════════════════════════════════════════════════════════════════════════════════════════════
   COLD vs WARM — the properties that make the comparison trustworthy.

   Run: npx tsx scripts/arm-comparison.test.ts

   ⛔ THE ONE THIS EXISTS FOR: a message sent between the arm and the click must not take the credit.
   That is the failure mode last-touch has and intent-to-treat does not, and it is the difference
   between deciding the A/B on the templates and deciding it on whatever follow-up happened to go
   out. audit_reply shows it at 5% of leads in real data.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  foldArmComparison, armFor, armRate, AB_ARMS, ARM_LABELS,
  type ArmLeadInput,
} from '../src/lib/armComparison.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const H = 'video_template', W = 'audit_reply_warm';
const T0 = Date.parse('2026-09-10T09:00:00Z');   // an arm send, comfortably after tracking start
const TRACK = Date.parse('2026-09-06T00:00:00Z');
const min = (n: number) => n * 60_000;

let seq = 0;
const lead = (o: Partial<ArmLeadInput> & { sends: ArmLeadInput['sends'] }): ArmLeadInput => ({
  leadId: `l${++seq}`, firstVisitAt: null, firstSignupAt: null, firstReportOpenAt: null, ...o,
});

console.log('── ARM ASSIGNMENT ──');
ok(armFor([]) === null, 'no sends means no arm');
ok(armFor([{ template: 'initial_contact', at: T0 }]) === null, 'a non-arm template assigns no arm');
{
  const a = armFor([{ template: 'initial_contact', at: T0 - min(60) }, { template: W, at: T0 }]);
  ok(a !== null && a !== 'both' && a.arm === W && a.at === T0, 'the arm send defines the arm and its clock');
}
{
  // The FIRST arm send wins, not the newest: a resend must not move the clock past events it caused.
  const a = armFor([{ template: H, at: T0 }, { template: H, at: T0 + min(600) }]);
  ok(a !== null && a !== 'both' && a.at === T0, 'a resend of the same arm keeps the FIRST timestamp');
}
ok(armFor([{ template: H, at: T0 }, { template: W, at: T0 + min(10) }]) === 'both',
  'a lead sent BOTH arms is "both", never quietly assigned to one');

console.log('\n── THE LEAK INTENT-TO-TREAT CLOSES ──');
{
  /* The exact shape last-touch gets wrong: warm goes out, THEN an onboarding follow-up, THEN the
     click. Last touch credits onboarding_followup and the warm arm shows nothing. */
  const rows = [lead({
    sends: [{ template: W, at: T0 }, { template: 'onboarding_followup', at: T0 + min(30) }],
    firstVisitAt: T0 + min(45), firstSignupAt: T0 + min(50),
  })];
  const c = foldArmComparison(rows, TRACK);
  ok(c.arms[W].siteVisits === 1, 'the warm arm keeps its click despite a follow-up in between');
  ok(c.arms[W].signups === 1, 'and its sign-up');
  ok(c.arms[H].leads === 0, 'and the cold arm is untouched');
}

console.log('\n── EVENTS BEFORE THE ARM DO NOT COUNT ──');
{
  const rows = [lead({ sends: [{ template: W, at: T0 }], firstVisitAt: T0 - min(120), firstSignupAt: T0 - min(90) })];
  const c = foldArmComparison(rows, TRACK);
  ok(c.arms[W].leads === 1, 'the lead is still in the arm');
  ok(c.arms[W].siteVisits === 0 && c.arms[W].signups === 0,
    'but a visit and a sign-up that PREDATE the arm send are not its doing');
}
{
  // The slack: an instant tap can record a few seconds before Meta's send receipt.
  const rows = [lead({ sends: [{ template: W, at: T0 }], firstVisitAt: T0 - 5_000 })];
  ok(foldArmComparison(rows, TRACK).arms[W].siteVisits === 1, 'a tap inside the 60s slack still counts');
}

console.log('\n── BOTH ARMS IS EXCLUDED AND VISIBLE ──');
{
  const rows = [
    lead({ sends: [{ template: H, at: T0 }, { template: W, at: T0 + min(5) }], firstVisitAt: T0 + min(10), firstSignupAt: T0 + min(11) }),
    lead({ sends: [{ template: H, at: T0 }], firstVisitAt: T0 + min(10) }),
  ];
  const c = foldArmComparison(rows, TRACK);
  ok(c.bothArms === 1, 'the dual-arm lead is counted as excluded');
  ok(c.arms[H].leads === 1 && c.arms[W].leads === 0,
    'and appears in NEITHER arm — putting it in the newer one would flatter the template being tested');
  ok(c.arms[H].siteVisits === 1, 'the clean cold lead still counts');
}

console.log('\n── THE TWO DENOMINATORS ──');
{
  /* An arm send BEFORE visit tracking began cannot have produced a recorded visit. It still counts
     for report opens and sign-ups, which have always been recorded. */
  const before = TRACK - min(60 * 24);
  const rows = [lead({ sends: [{ template: H, at: before }], firstReportOpenAt: before + min(5), firstSignupAt: before + min(9) })];
  const c = foldArmComparison(rows, TRACK);
  ok(c.arms[H].leads === 1, 'it counts in leads');
  ok(c.arms[H].leadsTracked === 0, 'but NOT in the visit denominator');
  ok(c.arms[H].reportOpened === 1 && c.arms[H].signups === 1, 'its open and sign-up still count');
  ok(c.arms[H].siteVisits === 0, 'and its visits cannot, so the rate is never divided by an untracked send');
}
{
  // numerator ⊆ denominator: a visit is only ever counted for a lead inside leadsTracked.
  const rows = [lead({ sends: [{ template: H, at: TRACK - min(1) }], firstVisitAt: TRACK + min(60) })];
  const c = foldArmComparison(rows, TRACK);
  ok(c.arms[H].leadsTracked === 0 && c.arms[H].siteVisits === 0,
    'a visit after tracking on a send from before it is excluded — the rate can never exceed 100%');
}

console.log('\n── RATES AND ABSENCES ──');
ok(armRate(0, 0) === null, 'no denominator gives null, never 0% for an unmeasured population');
ok(armRate(1, 4) === 25, 'and a real rate is a rate');
{
  const c = foldArmComparison([], TRACK);
  ok(!c.hasData, 'no leads means nothing to show');
  ok(AB_ARMS.every((k) => c.arms[k].leads === 0), 'every arm is present and zeroed rather than missing');
}
{
  const c = foldArmComparison([lead({ sends: [{ template: 'initial_contact', at: T0 }] })], TRACK);
  ok(!c.hasData, 'a campaign that has sent neither arm shows nothing at all');
}
ok(AB_ARMS.every((a) => typeof ARM_LABELS[a] === 'string' && ARM_LABELS[a].length > 0),
  'every arm has a human label, so the card can never print a raw slug');

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
