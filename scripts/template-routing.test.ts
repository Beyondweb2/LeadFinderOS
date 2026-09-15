/* ════════════════════════════════════════════════════════════════════════════════════════════════
   EVERY REGISTERED TEMPLATE MUST LAND ON A BRANCH THAT CAN ANSWER EVERY VARIABLE IT DECLARES.

   🔴 WHAT THIS PINS (2026-09-15). `audit_followup` failed its first real send with a 500 and the
   operator was shown "Edge Function returned a non-2xx status code". Nothing was wrong with the
   lead, the audit, the trade, the town or the rivals: both senders asked "does this need the
   audit?" as `vars.includes("trade") || vars.includes("competitors")`, and audit_followup declares
   `trade_plural` and `rival_*`. It routed to the PLAIN opener branch, which supplies none of them,
   and the first resolver threw where no catch existed.

   ⛔ THE PROPERTY IS COVERAGE, NOT ROUTING. A test that only asserted "audit_followup routes to the
   audit branch" would pass the day someone adds a variable no branch resolves. This asks the
   question that actually decides whether a send can succeed: for the branch this template lands on,
   is every variable it declares one that branch can supply?

   ⚠️ IT READS THE REAL REGISTRY, imported (whatsapp-send.ts's Deno reads are lazy enough for tsx —
   verified), so a template added there is covered with no edit here.

   Run: npx tsx scripts/template-routing.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { WA_TEMPLATES } from '../supabase/functions/_shared/whatsapp-send.ts';
import { branchForVars, unsuppliedVars, buildsFromAudit, AUDIT_DERIVED_VARS } from '../src/lib/templateRouting.ts';
import { WHATSAPP_TEMPLATES } from '../src/types/outreach.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const names = Object.keys(WA_TEMPLATES);
ok(names.length > 10, `the registry imported (${names.length} templates)`);

console.log('\n-- every SENDABLE template can be built by the branch it routes to --');
/* ⛔ SCOPED TO THE PICKER, AND THE SCOPE IS THE POINT. These two senders' branch logic is what
   builds a payload for a template an operator or the drip chooses. A SERVER-ONLY template
   (free_check_result, payment_recieved) is posted by its own sender with its own variables and
   never reaches this routing at all — asserting over it would fail the build for a message that
   works. The one that matters is pinned separately below. */
const SENDABLE = new Set(WHATSAPP_TEMPLATES.map((t) => t.value));
for (const name of names.filter((n) => SENDABLE.has(n))) {
  const vars = WA_TEMPLATES[name].vars as readonly string[];
  const missing = unsuppliedVars(vars);
  ok(missing.length === 0,
     `${name.padEnd(24)} → ${branchForVars(vars).padEnd(12)} ${missing.length ? `CANNOT SUPPLY ${missing.join(', ')}` : `(${vars.join(', ') || 'no vars'})`}`);
}

console.log('\n-- the templates that failed, named individually --');
/* ⛔ NAMED SO A REGRESSION SAYS WHICH, not "a count moved". audit_followup is the one that failed
   in front of a prospect; competitor_hook had the identical shape and was one press behind it. */
for (const t of ['audit_followup', 'competitor_hook', 'audit_reply', 'audit_reply_warm', 'video_template']) {
  ok(buildsFromAudit(WA_TEMPLATES[t].vars as readonly string[]), `${t.padEnd(20)} needs the audit resolved first`);
}

console.log('\n-- and the ones that must NOT be sent down the audit branch --');
/* ⛔ onboarding_followup IS THE CASE THE ORDER EXISTS FOR. It declares trade_plural and town, both
   audit-shaped, but resolves them from the LEAD ROW — routing it to the audit branch would refuse
   every lead without a completed audit for a message that never needed one. */
ok(branchForVars(WA_TEMPLATES.onboarding_followup.vars as readonly string[]) === 'onboarding',
   'onboarding_followup routes to its own branch despite declaring trade_plural');
ok(branchForVars(WA_TEMPLATES.explain_offer.vars as readonly string[]) === 'onboarding',
   'explain_offer routes to onboarding — its link is the sign-up, not a report');
ok(branchForVars(WA_TEMPLATES.initial_contact.vars as readonly string[]) === 'plain',
   'initial_contact stays on the plain branch');
ok(branchForVars(WA_TEMPLATES.questionnaire_followup.vars as readonly string[]) === 'contact_name',
   'questionnaire_followup routes by its person-name variable');

console.log('\n-- THE OLD PREDICATE, KEPT AS THE REPRODUCTION --');
/* ⛔ THIS IS THE FAILING SEND, EXPRESSED AS AN ASSERTION. Both senders read exactly this, and it is
   still the right answer for four templates — which is why it survived review and why a diff that
   reinstates it looks harmless. The two it gets wrong are the two that 500'd. */
const OLD = (vars: readonly string[]) => vars.includes('trade') || vars.includes('competitors');
for (const t of ['audit_followup', 'competitor_hook']) {
  const vars = WA_TEMPLATES[t].vars as readonly string[];
  ok(!OLD(vars) && buildsFromAudit(vars),
     `${t.padEnd(18)} the old predicate said NO (→ plain branch → 500); the rule says YES`);
}
for (const t of ['audit_reply', 'audit_reply_warm', 'video_template']) {
  const vars = WA_TEMPLATES[t].vars as readonly string[];
  ok(OLD(vars) === buildsFromAudit(vars), `${t.padEnd(18)} old and new agree — nothing regressed for it`);
}

console.log('\n-- free_check_result carries its OWN sender, and must stay out of the picker --');
/* 🔴 FOUND BY THIS TEST, 2026-09-15, and it is a real latent fault rather than a curiosity. It
   declares BOTH `onboarding_url` and `audit_url`, so under the routing above it lands on the
   ONBOARDING branch — which cannot supply a report link. It works today only because nothing routes
   it: `_shared/free-check-result.ts` builds its payload itself, and it is server-only.
   ⛔ SO THE GUARD IS THAT IT IS NEVER OFFERED IN THE PICKER. Add it to WHATSAPP_TEMPLATES and the
   first press is a 500 — the exact failure audit_followup just had. */
ok(!SENDABLE.has('free_check_result'),
   'free_check_result is NOT sendable from the picker (its branch could not supply audit_url)');
ok(unsuppliedVars(WA_TEMPLATES.free_check_result.vars as readonly string[]).includes('audit_url'),
   '  and this is why: the onboarding branch cannot answer its report link');

console.log('\n-- the rule is about the VARIABLE, never the template name --');
/* A template registered tomorrow with a new audit-derived variable joins the right side the day
   the variable is added to the set — which is the failure mode this replaces. */
ok(!/audit_followup|competitor_hook|video_template/.test(
     [...AUDIT_DERIVED_VARS].join(' ')), 'AUDIT_DERIVED_VARS names no template');
ok(buildsFromAudit(['rival_1']), 'a lone rival variable is enough to need the audit');
ok(buildsFromAudit(['audit_url']), 'so is a report link');
ok(!buildsFromAudit(['name']), 'and a name alone is not');
ok(!buildsFromAudit([]), 'nor is a template with no variables at all');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
