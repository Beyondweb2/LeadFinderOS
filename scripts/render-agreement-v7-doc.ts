/* Renders docs/agreement-v7.md from the LIVE v7 block in src/lib/clientAgreement.ts, so the solicitor reads exactly what
   clients sign. Every point Claude decided (not given by Paul) carries a [CHECK] note here, never in the live text.
   Run: npx tsx scripts/render-agreement-v7-doc.ts   (writes docs/agreement-v7.md) */
import { writeFileSync } from 'node:fs';
import { agreementVersion, V7_CHANGED_CLAUSES } from '../src/lib/clientAgreement.ts';
import { CLIENT_PAYMENT_PLANS, planAgreementWordsV7 } from '../src/lib/paymentPlans.ts';

/** The decisions Claude made, by clause. Paul gave: the two plans and prices, Complete's scope list, Complete's 12-month
 *  term, hosting while paying on Complete, the guarantee headline, refund = what the client has paid, and the timeline
 *  (baseline = day 0, results day 28, claim window day 28 to 35, first payment after the window). */
export const V7_CHECKS: Record<string, string> = {
  '1.5': '"each plan" replaces "the service" because Schedule 1 now has two columns.',
  '2.4': '"for your plan" added: something in the Complete column is outside the plan for an Essential client.',
  '2.6': 'Plan Period now names Complete (until the final payment clears, like Essential\'s monthly options).',
  '2.8': 'New. Complete\'s extras depend on access (7.1). Confirm the extras end with the Plan Period (Complete has no "after" service beyond 9A).',
  '2.9': 'New. Review replies: we reply "on your behalf". Is replying in the client\'s name acceptable, and does the client need to approve each reply? We gave the client a right to ask us not to reply to a particular review; we did NOT add an approval step. Clause 10.3 (no fake reviews) still applies. Note: until now the business treated review replies as NOT a deliverable; Complete makes them one.',
  '2.10': 'New. "Changes within reason": fair use, small edits not rebuilds, examples given, and a right to decline or quote. We did NOT set a number of changes or a turnaround time (not given by Paul). Is "well beyond what our clients typically ask for" clear enough to rely on, or should there be a cap (for example a number of edits a month)?',
  '2.11': 'New. Monthly audits are tracking only and never decide the guarantee.',
  '3.1': 'Complete added as (a); Essential\'s three options unchanged in price, relettered (b) to (d).',
  '3.2': 'Recurring payments now also apply to Complete.',
  '4.1': 'Complete\'s minimum term is 12 payments ("12 months of payments"). Confirm the wording "runs for 12 months of payments": the first payment is at sign-up and the second normally about day 36, so the 12th falls about 11 months after day 36, not 12 calendar months after sign-up.',
  '4.3': 'Pay in full renamed "Findable Essential paid in full".',
  '5.2': 'New defined term "Baseline Date" (day 0), the day the baseline is completed; we promise to tell the client the date. The baseline still starts on or after the Access Date (clause 5.1 unchanged), so a client who delays access delays day 0.',
  '5.3': 'Results are due on day 28 from the Baseline Date (v6: "about four weeks after the Access Date"). If we are late, the Results Date is the day we actually send them. Is a fixed day 28 too firm a promise, given 5.7 still lets us move it for client delay?',
  '5.4': 'Refund Window is 7 days after the Results Date (v6: 14). Headline is Paul\'s exact words. Refund = all payments made under the agreement. GUARANTEE WINDOW ON COMPLETE: on Complete the window closes before the first monthly payment, so in practice the refund is the £99 initial payment. Paul\'s brief mentioned "up to 12 months of payments": we did NOT extend the guarantee past the window. Confirm the intended maximum refund on Complete is what was paid when the claim is made (normally £99), not 12 months of payments.',
  '5.5': 'SITE-TAKEN-BACK LINE: on a valid claim the agreement ends, no ownership transfers, and on Essential paid in full the transfer is "reversed" and we may take the website down. Same concern as v6: can a transferred copyright be reversed this way? It now also applies to Complete (nothing has transferred, so only the licence ends).',
  '5.6': 'First monthly = the day after the Refund Window, normally day 36 from the Baseline Date; nothing scheduled before the baseline; moves back if the results are late. Paul said "about day 35": day 35 is the last day of the window, so the first charge is day 36. Confirm. The six-week fallback when the guarantee does not apply is kept from v6.',
  '5.7': 'BASELINE DELAYED BY THE CLIENT: added "If you cause delay before the baseline, the Baseline Date and every date counted from it move back with it." Combined with 5.8(a) (no access within 30 days of the initial payment = no guarantee, fallback payment start), is this fair and clear? What if the client never gives access: they have paid £99 (or £499) and no monthly is taken until the fallback date.',
  '9.2': 'Hosting is included on Complete while paying (Paul). Essential unchanged.',
};
const KEYPOINT_CHECK = 'Key points rewritten for two plans. The guarantee point starts with Paul\'s headline word for word and says 7 days and day 28. A new point lists Complete\'s extras.';
const SCHEDULE_CHECK = 'Schedule 1 now has two columns (Complete, Essential). New rows: Review replies, Changes within reason, Monthly audits, Payments. The re-measurement row says 28 days after the Baseline Date.';
const SERVICE_CHECK = 'The one-paragraph service description names both plans. The checkbox line reads "[X] Findable:" (one route, the plan is in Client Details).';

const v = agreementVersion('v7');
const out: string[] = [];
out.push('# Findable Client Service Agreement — version 7 (v7)');
out.push('');
out.push('Generated from `src/lib/clientAgreement.ts` (the text clients sign) by `scripts/render-agreement-v7-doc.ts`. **v7 is live** for new sign-ups on Findable Complete and Findable Essential (Paul, 2026-10-30). v6 is archived: the clients who signed it stay on it. The old staff-only £99 × 12 plan stays on v5.');
out.push('');
out.push('Every point Claude decided is marked **[CHECK]** with a note. Clauses not marked as changed are v6 word for word. The list for review is `docs/v7-review-for-solicitor.md`.');
out.push('');
out.push('## Intro'); out.push(''); out.push(v.intro); out.push('');
out.push('## Client details (filled in per client)'); out.push('');
for (const l of Object.values(v.clientDetailLabels)) out.push(`- ${l}`);
out.push(''); out.push('The "Payment plan" line prints one of:'); out.push('');
for (const p of CLIENT_PAYMENT_PLANS) out.push(`- ${planAgreementWordsV7(p)}`);
out.push(''); out.push('**[CHECK]** The plan (Complete / Essential) is printed first, then how it is paid. Part of the signed, fingerprinted text.'); out.push('');
out.push('## Your service'); out.push(''); out.push(`**${v.services.build.name}.** ${v.services.build.description}`); out.push(''); out.push(`**[CHECK]** ${SERVICE_CHECK}`); out.push('');
out.push(`## ${v.keyPoints!.title}`); out.push('');
for (const p of v.keyPoints!.points) out.push(`- ${p}`);
out.push(''); out.push(`**[CHECK]** ${KEYPOINT_CHECK}`); out.push('');
const replaced = new Set(V7_CHANGED_CLAUSES);
const added = new Set(['2.8', '2.9', '2.10', '2.11']);
for (const b of v.body) {
  if (b.kind === 'heading') { out.push(`## ${b.text}`); out.push(''); continue; }
  if (b.kind === 'clause') {
    const mark = added.has(b.num) ? ' *(new in v7)*' : replaced.has(b.num) ? ' *(changed from v6)*' : '';
    out.push(`**${b.num}** ${b.lead ? `**${b.lead}** ` : ''}${b.text}${mark}`);
    if (V7_CHECKS[b.num]) out.push('', `> **[CHECK]** ${V7_CHECKS[b.num]}`);
    out.push('');
    continue;
  }
  out.push(b.kind === 'bullet' ? `- ${b.text}` : b.kind === 'item' ? `${b.label} ${b.text}` : b.text); out.push('');
}
out.push(`## ${v.schedule.title}`); out.push('');
out.push(`| | ${v.schedule.columns.join(' | ')} |`); out.push(`|---|${v.schedule.columns.map(() => '---').join('|')}|`);
for (const [a, ...cells] of v.schedule.rows) out.push(`| ${a} | ${cells.join(' | ')} |`);
out.push(''); out.push(`**[CHECK]** ${SCHEDULE_CHECK}`); out.push('');
writeFileSync(new URL('../docs/agreement-v7.md', import.meta.url), out.join('\n'));
console.log('wrote docs/agreement-v7.md');
