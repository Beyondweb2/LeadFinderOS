/* ============================================================
   PER-TEMPLATE ATTRIBUTION — the properties, not the numbers.

   Run: npx tsx scripts/template-attribution.test.ts

   ⛔ WHAT THIS EXISTS TO STOP COMING BACK: the per-template "replied" that was removed from the
   campaign card, which meant "has this lead ever replied" and therefore printed the SAME replies
   under every template the lead was sent. The first test below is that exact shape — one reply, two
   templates — and it asserts only ONE of them is credited. If a future rewrite makes both rows
   claim it, this fails.

   ⚠️ AND THE ABSENT CASES ARE DRIVEN EXPLICITLY, because this is a fold over a sequence and the
   dangerous states are all "nothing there": no sends at all, a reply before any send, a failed
   send, an auto-responder, an open with no link.
   ============================================================ */
import {
  creditRepliesByTemplate,
  creditOpenToTemplate,
  type AttributableMsg,
} from '../src/lib/templateAttribution.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

/* ⚠️ ONE HOUR PER STEP, NOT ONE MINUTE, AND THAT IS NOT COSMETIC. At a 60-second spacing the
   sends sit exactly inside OPEN_ATTRIBUTION_SLACK_MS, so the second link legitimately claims an
   open that happened before it and the "newest link before the open" test fails on the harness's
   own clock rather than on the code. Real report links are hours or days apart. The boundary itself
   is pinned deliberately at the end of this file. */
const STEP_MS = 3_600_000;
let clock = 0;
/** Outbound templated send. `status` defaults to a real one. */
const out = (template: string, status = 'delivered'): AttributableMsg =>
  ({ direction: 'outbound', template_name: template, status, created_at: new Date(++clock * STEP_MS).toISOString(), body: null });
/** Inbound message. */
const inb = (body = 'yes please'): AttributableMsg =>
  ({ direction: 'inbound', template_name: null, status: null, created_at: new Date(++clock * STEP_MS).toISOString(), body });

const creditedTo = (msgs: AttributableMsg[]) => creditRepliesByTemplate(msgs).map((c) => c.template);

console.log('── THE BUG THAT CAUSED THE METRIC TO BE DELETED ──');
{
  // Opener, reply, pitch. The reply belongs to the OPENER and must not also credit the pitch.
  const credits = creditRepliesByTemplate([out('initial_contact'), inb(), out('audit_reply')]);
  ok(credits.length === 1, 'one reply credits exactly one template');
  ok(credits[0].template === 'initial_contact', 'the reply is credited to the send that preceded it');
  ok(credits[0].ambiguous === false, 'a single preceding template is not ambiguous');
}
{
  // The full auto-chain: opener, reply, pitch, reply. Two replies, one each.
  const credits = creditRepliesByTemplate([out('initial_contact'), inb(), out('audit_reply'), inb('interested')]);
  ok(credits.length === 2, 'two separate replies credit two templates');
  ok(credits.map((c) => c.template).join(',') === 'initial_contact,audit_reply', 'each reply goes to its own preceding send');
  ok(credits.every((c) => !c.ambiguous), 'an inbound between two sends clears the ambiguity');
}

console.log('\n── AMBIGUITY IS A FACT ABOUT THE SEQUENCE, NOT A GUESS ──');
{
  // The chase: opener, no answer, follow-up, THEN a reply. Nobody can know which it answers.
  const credits = creditRepliesByTemplate([out('initial_contact'), out('contact_followup'), inb()]);
  ok(credits.length === 1 && credits[0].template === 'contact_followup', 'last touch takes the credit');
  ok(credits[0].ambiguous === true, 'two different templates with no reply between them = ambiguous');
}
{
  // The SAME template twice is not ambiguous — there is only one candidate.
  const credits = creditRepliesByTemplate([out('initial_contact'), out('initial_contact'), inb()]);
  ok(credits[0].ambiguous === false, 'the same template sent twice is not ambiguous');
}
{
  const credits = creditRepliesByTemplate([out('a'), out('b'), out('c'), inb()]);
  ok(credits[0].template === 'c' && credits[0].ambiguous, 'a run of three credits the newest, flagged');
}

console.log('\n── ABSENT AND NON-QUALIFYING CASES ──');
ok(creditRepliesByTemplate([]).length === 0, 'no messages credits nothing');
ok(creditRepliesByTemplate([inb(), inb()]).length === 0, 'a reply with no send before it credits nothing');
ok(creditRepliesByTemplate([out('initial_contact')]).length === 0, 'a send with no reply credits nothing');
{
  // A send Meta REFUSED is not a send, so the reply cannot belong to it.
  ok(creditedTo([out('initial_contact', 'failed'), inb()]).length === 0, 'a failed send earns no reply');
  ok(creditedTo([out('initial_contact', 'simulated'), inb()]).length === 0, 'a simulated send earns no reply');
  ok(creditedTo([out('a', 'failed'), out('b'), inb()]).join() === 'b', 'a failed send does not even make it ambiguous');
}
{
  // An auto-responder is not an answer AND must not close the run.
  ok(creditedTo([out('initial_contact'), inb('Thanks for contacting us, we will get back to you')]).length === 0,
    'an auto-responder is not a reply');
  const credits = creditRepliesByTemplate([out('a'), inb('out of office'), out('b'), inb()]);
  ok(credits[0].template === 'b' && credits[0].ambiguous === true,
    'a bot reply does not clear the run, so the two sends stay ambiguous');
}
{
  // One lead answering the same template twice is ONE replier: every rate is per lead.
  const credits = creditRepliesByTemplate([out('initial_contact'), inb(), inb('and another thing')]);
  ok(credits.length === 1, 'a second reply to the same template does not double count');
}

console.log('\n── REPORT OPENS ──');
const REPORT = new Set(['audit_reply', 'video_template']);
{
  clock = 0;
  const a = out('audit_reply');
  const at = new Date(a.created_at).getTime();
  ok(creditOpenToTemplate([a], REPORT, at + 60_000) === 'audit_reply', 'an open after the link is credited to it');
  ok(creditOpenToTemplate([a], REPORT, at - 5_000) === 'audit_reply', 'a tap within the slack still counts');
  ok(creditOpenToTemplate([a], REPORT, at - 600_000) === null, 'an open long before the link is not credited');
  ok(creditOpenToTemplate([a], REPORT, null) === null, 'no open at all credits nothing');
  ok(creditOpenToTemplate([out('initial_contact')], REPORT, Date.now()) === null,
    'a template carrying no report link never earns an open');
  ok(creditOpenToTemplate([out('audit_reply', 'failed')], REPORT, Date.now()) === null,
    'a failed link send never earns an open');
}
{
  // Two links sent; the open goes to the newest one that preceded it, not the first.
  clock = 0;
  const first = out('video_template');
  const second = out('audit_reply');
  const afterBoth = new Date(second.created_at).getTime() + 10_000;
  const afterFirst = new Date(first.created_at).getTime() + 1_000;
  ok(creditOpenToTemplate([first, second], REPORT, afterBoth) === 'audit_reply', 'the newest qualifying link wins');
  ok(creditOpenToTemplate([first, second], REPORT, afterFirst) === 'video_template',
    'an open between the two links belongs to the first — a later send cannot claim an earlier open');
}

{
  /* ⚠️ THE STATED LIMIT OF THE SLACK, PINNED SO IT IS A DECISION RATHER THAN A SURPRISE. Two
     report links sent within OPEN_ATTRIBUTION_SLACK_MS of each other are not separable: the later
     one claims an open that happened between them. The slack exists because the send clock (Meta)
     and the open clock (our renderer) are different systems, and losing genuine instant taps is the
     worse error. In real data report links are hours apart, so this costs nothing — but it is a
     property, not an accident, and a future "tighten the slack" change should start here. */
  clock = 0;
  const first = out('video_template');
  const near = { ...out('audit_reply'), created_at: new Date(new Date(first.created_at).getTime() + 30_000).toISOString() };
  const between = new Date(first.created_at).getTime() + 5_000;
  ok(creditOpenToTemplate([first, near], REPORT, between) === 'audit_reply',
    'KNOWN LIMIT: two links inside the slack window are not separable — the later one takes it');
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
