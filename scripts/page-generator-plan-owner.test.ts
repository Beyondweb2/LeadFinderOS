/* ============================================================
   PAGE GENERATOR — the `plan` action's owner scope (regression, 2026-09-25).

   From 474b7625 (2026-09-18) the plan action read the stored action plan with
   `.eq("user_id", user.id)` — but the handler names the signed-in operator `userId`
   (`const userId = u.user.id`) and no `user` is in scope. Every plan request threw
   "user is not defined", was caught and answered 500: the Page Generator showed an error and the
   Page Plan Queue's "Build this" fell through to "Couldn't match this row to a page".

   Pins: the plan branch scopes by `userId`, the handler defines it from the verified JWT, and no
   bare `user.` identifier exists anywhere in the function. check-edge-undefined.mjs covers the
   general case; this names the one that shipped.

   Run: npx tsx scripts/page-generator-plan-owner.test.ts
   ============================================================ */
import { readFileSync } from 'node:fs';

let failures = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}

const src = readFileSync(new URL('../supabase/functions/page-generator/index.ts', import.meta.url), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

ok(/const userId = u\.user\.id;/.test(code), 'the operator id is derived once, from the verified JWT (u.user.id)');
ok(!/(^|[^.\w])user\.id\b/m.test(code), 'no bare `user.id` anywhere — the name that crashed the plan action');
ok(!/(^|[^.\w$])user\.(?!id)\w+/m.test(code), 'and no other bare `user.<field>` either');

const plan = code.slice(code.indexOf('if (action === "plan")'), code.indexOf('if (action !== "generate")'));
ok(plan.length > 200, 'the plan branch is found');
const scopes = [...plan.matchAll(/from\("client_pages"\)[\s\S]*?\.eq\("user_id", (\w+)\)/g)].map((m) => m[1]);
ok(scopes.length === 2 && scopes.every((s) => s === 'userId'), `both client_pages reads in the plan branch are scoped by userId (${scopes.join(', ')})`);
ok(/\.eq\("baseline_audit_id", audit\.id\)/.test(plan), 'and by the baseline audit the plan is for');

/* The audit the plan reads is itself the operator's (scoped by userId before the branch). */
const before = code.slice(0, code.indexOf('if (action === "plan")'));
ok(/const measured = await measuredSetForLead\(service, userId, leadId\)/.test(before), 'the audit feeding the plan comes from measuredSetForLead under the same owner (userId)');
ok(/\.from\("ai_audits"\)\.select\(MEASURED_COLS\)\.eq\("id", pointer\)\.eq\("user_id", userId\)/.test(code), 'which reads the baseline audit scoped by userId');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
