/* ============================================================
   OPERATOR-ENTERED ONBOARDING IS SOURCE MATERIAL, NOT THE CLIENT'S WORD (2026-09-25, BS4 pilot).

   An onboarding row the operator typed (client_source 'manual') must not auto-verify anything:
   BS4's manual row carried 26 pasted crawl service strings and a disputed base town, and all of
   them showed as VERIFIED. A client-submitted form (even one an operator later edited) keeps the
   client's standing.

   Run: npx tsx scripts/operator-onboarding-facts.test.ts
   ============================================================ */
import { candidateFacts, mergeFacts, type FactsContext } from '../src/lib/buildFacts.ts';

let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

const ob = { business_name: 'BS4 Electrical Services Ltd', confirmed_location: 'Bristol', services_list: ['Rewiring', 'EICR Bristol'], areas_list: ['Bath', 'Keynsham'], contact_email: 'info@bs4electricalservices.co.uk', business_website: 'https://bs4electricalservices.co.uk/' };
const ctx = (onboarding: Record<string, unknown>): FactsContext => ({ lead: { business_name: 'BS4 Electrical Services Ltd', website: 'https://bs4electricalservices.co.uk/' }, onboarding, baseline_audit: null, discovery_audit: null, crawl: null });
const rows = (o: Record<string, unknown>) => mergeFacts(candidateFacts(ctx(o)), [], null);
const st = (o: Record<string, unknown>, k: string) => rows(o).find((r) => r.key === k);

{
  const manual = { ...ob, client_source: 'manual', operator_edited_at: '2026-09-23T11:41:48Z' };
  for (const k of ['business_name', 'primary_town', 'services', 'service_areas', 'email'])
    ok(st(manual, k)?.status === 'detected', `manual onboarding: ${k} starts NEEDS APPROVAL, not verified`);
  ok(/entered by operator/.test(st(manual, 'services')!.source) && /not submitted by the client/.test(st(manual, 'services')!.note), 'and says why');
  ok(!rows(manual).some((r) => r.status === 'verified'), 'nothing at all is verified from a manual onboarding');
}
{
  const client = { ...ob, client_source: 'onboarding' };
  ok(st(client, 'services')?.status === 'verified' && st(client, 'primary_town')?.status === 'verified', 'a client-submitted onboarding still verifies its answers');
  const edited = { ...client, operator_edited_at: '2026-09-23T11:41:48Z' };
  ok(st(edited, 'services')?.status === 'verified' && /entered by operator/.test(st(edited, 'services')!.source), 'a client form later edited by an operator keeps the client’s standing (labelled)');
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
