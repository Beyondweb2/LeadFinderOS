/* "AI NAMED OTHERS INSTEAD" ONLY WHEN NAMED IN AT MOST A THIRD (2026-10-20, Paul) — src/lib/namedShareRule.ts.
   The template text is never edited; the rule decides who gets it, inside resolveAuditReplyVars (every audit-class door).
   The sweep: any readable template body that makes the claim must be in NAMED_INSTEAD_TEMPLATES. Pure. */
import { readFileSync } from 'node:fs';
import { NAMED_INSTEAD_TEMPLATES, mayClaimNamedInstead } from '../src/lib/namedShareRule.ts';
import { READABLE_TEMPLATE_BODIES } from '../src/lib/templateBodies.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

console.log('1. the rule');
ok(mayClaimNamedInstead(0, 6) && mayClaimNamedInstead(2, 6) && mayClaimNamedInstead(1, 3), 'named in a third or fewer → allowed');
ok(!mayClaimNamedInstead(3, 6) && !mayClaimNamedInstead(5, 6) && !mayClaimNamedInstead(6, 6) && !mayClaimNamedInstead(2, 5), 'named in more than a third → not allowed');
ok(!mayClaimNamedInstead(null, 6) && !mayClaimNamedInstead(0, 0) && !mayClaimNamedInstead(undefined, undefined), 'no counts on record → not allowed (absence never allows the claim)');

console.log('2. every door goes through it');
const AR = read('supabase/functions/_shared/audit-reply.ts');
ok(/opts\.templateName && NAMED_INSTEAD_TEMPLATES\.has\(opts\.templateName\) && !mayClaimNamedInstead\(hookScore\.named, hookScore\.valid\)/.test(AR), 'resolveAuditReplyVars refuses the claim templates above a third');
ok(/reason: `\$\{HOOK_NO_GAP_REASON\}: \$\{namedShareRefusal/.test(AR), '…with the no-gap prefix every caller already handles');
for (const fn of ['supabase/functions/send-whatsapp-message/index.ts', 'supabase/functions/process-whatsapp-queue/index.ts']) {
  const src = read(fn);
  const calls = src.match(/resolveAuditReplyVars\([^)]*\)/g) ?? [];
  ok(calls.length > 0 && calls.every((c) => /templateName/.test(c)), `${fn.split('/')[2]}: every call passes the template name`);
}

console.log('3. the sweep: a body that claims it is in the set');
const CLAIM = /\bnot\s+you\b|\bnaming\b[^.]{0,60}\b(not|instead)\b|\binstead\s+of\s+you\b|\bahead\s+of\s+you\b|\bit\s+mentioned\b|came\s+back\s+with\s+businesses/i;
for (const [name, fn] of Object.entries(READABLE_TEMPLATE_BODIES)) {
  const body = fn('ZZ Fixture Plumbing', 'https://findable.live/r/abc123', 'plumber', 'Rival A, Rival B', 'Sam', 'Leeds', 'a fault', 'a finding', '20%', 'Paul');
  if (CLAIM.test(body) && !/explain_offer|STALE/.test(name)) ok(NAMED_INSTEAD_TEMPLATES.has(name), `${name}: claims AI named others → in the set`);
}

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
