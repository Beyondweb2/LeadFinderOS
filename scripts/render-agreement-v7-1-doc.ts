/* Renders docs/agreement-v7.1.md from the LIVE v7.1 block in src/lib/clientAgreement.ts, so the solicitor reads exactly what
   clients sign. Every point Claude decided (not given by Paul) carries a [CHECK] note here, never in the live text.
   findable.live's published copy is generated from this file (its scripts/generate-agreement-v7-1.mjs).
   Run: npx tsx scripts/render-agreement-v7-1-doc.ts   (writes docs/agreement-v7.1.md) */
import { writeFileSync } from 'node:fs';
import { agreementVersion, V7_1_CHANGED_CLAUSES } from '../src/lib/clientAgreement.ts';
import { CLIENT_PAYMENT_PLANS, planAgreementWordsV7 } from '../src/lib/paymentPlans.ts';

/** The decisions Claude made, by clause. Paul gave: £999 once, the same inclusions and guarantee as Complete, refund = what they
 *  paid, charged at sign-up with no monthly payments, hosting included for the 12 months, the site transfers at the end of the
 *  12 months. */
export const V7_1_CHECKS: Record<string, string> = {
  '2.6': 'WHEN THE 12 MONTHS START: Paul said "12 months" without a start date. We count from the date the payment cleared, because it is a fixed, provable date. The cost: a client who delays access or the baseline loses some of the 12 months of service. Should it count from the Baseline Date instead?',
  '3.1': 'Complete now has two options, (a) and (b); Essential\'s three are unchanged in price and relettered (c) to (e). The save-£189 figure is deliberately not in the agreement: it is sales copy, and £999 is the price.',
  '3.2': 'States there are no recurring payments on Complete paid up front.',
  '4.1': 'EARLY EXIT AND REFUNDS OUTSIDE THE GUARANTEE: the agreement is silent on whether any of the £999 comes back if the client leaves early. On the monthly plan a client who leaves still owes the rest (4.2), so "no refund" treats the two alike, but a client who has paid for 12 months and leaves in month 3, or who ends the agreement for OUR serious breach (15.3), has paid for service they did not get. 15.3 only lifts "further minimum-term payments", and an up-front client has none left to lift, so it gives them nothing. We did not write a refund or a pro-rata rule (Paul gave none). Should 15.3 give a pro-rata refund on Complete paid up front? This is the main point to check.',
  '4.3': 'Points to 8.4, so the transfer date is written once.',
  '5.6': 'States there is no Payment Start Date on the one-payment options. Otherwise v7 word for word, with "paid monthly" added.',
  '8.2': 'THE MISMATCH THIS VERSION HAS TO SOLVE: every other plan transfers ownership "once your final payment has cleared", but here the final payment clears on day 1 and Paul wants the site to transfer at the end of the 12 months. 8.2 and 8.4 say so. Until then we own the work and the client has the 8.3 licence.',
  '8.4': 'Assignment at the end of the Plan Period, "or when the agreement ends if it ends sooner, unless it ends under clause 5.5". WE CHOSE THIS: the client has paid the whole price, so ending early should not lose them the site they paid for, and taking it down would be a penalty Paul did not ask for. A valid guarantee claim is the exception, because then the money goes back (5.5). This includes us ending under 15.2 (for example abusive behaviour): the client still gets the site. Is that acceptable? Clause 8.6 is unchanged and does not bite here, as no payments remain unpaid.',
  '9.2': 'Hosting for the 12-month Plan Period (Paul). Note it runs from the payment date, so if the site goes live in month 2 the client gets about 10 months of hosting on the live site.',
};
const KEYPOINT_CHECK = 'Points 1, 3, 4 and 6 now name Complete paid up front. Points 2, 5 and 7 are v7 word for word.';
const SCHEDULE_CHECK = 'Only two Complete cells changed: Hosting during the Plan Period, and Payments. Essential\'s column is v7 word for word.';
const SERVICE_CHECK = 'The one-paragraph description names the up-front price, the transfer and the hosting.';

const v = agreementVersion('v7.1');
const out: string[] = [];
out.push('# Findable Client Service Agreement — version 7.1 (v7.1)');
out.push('');
out.push('Generated from `src/lib/clientAgreement.ts` (the text clients sign) by `scripts/render-agreement-v7-1-doc.ts`. **v7.1** adds one way to pay: Findable Complete paid up front. New sign-ups on Findable Complete and Findable Essential sign it. Clients who signed v7 stay on v7 (`docs/agreement-v7.md`).');
out.push('');
out.push('Every point Claude decided is marked **[CHECK]** with a note. Clauses not marked as changed are v7 word for word. The list for review is `docs/v7-review-for-solicitor.md`.');
out.push('');
out.push('## Intro'); out.push(''); out.push(v.intro); out.push('');
out.push('## Client details (filled in per client)'); out.push('');
for (const l of Object.values(v.clientDetailLabels)) out.push(`- ${l}`);
out.push(''); out.push('The "Payment plan" line prints one of:'); out.push('');
for (const p of CLIENT_PAYMENT_PLANS) out.push(`- ${planAgreementWordsV7(p)}`);
out.push(''); out.push('**[CHECK]** Part of the signed, fingerprinted text, as in v7.'); out.push('');
out.push('## Your service'); out.push(''); out.push(`**${v.services.build.name}.** ${v.services.build.description}`); out.push(''); out.push(`**[CHECK]** ${SERVICE_CHECK}`); out.push('');
out.push(`## ${v.keyPoints!.title}`); out.push('');
for (const p of v.keyPoints!.points) out.push(`- ${p}`);
out.push(''); out.push(`**[CHECK]** ${KEYPOINT_CHECK}`); out.push('');
const replaced = new Set(V7_1_CHANGED_CLAUSES);
for (const b of v.body) {
  if (b.kind === 'heading') { out.push(`## ${b.text}`); out.push(''); continue; }
  if (b.kind === 'clause') {
    const mark = replaced.has(b.num) ? ' *(changed from v7)*' : '';
    out.push(`**${b.num}** ${b.lead ? `**${b.lead}** ` : ''}${b.text}${mark}`);
    if (V7_1_CHECKS[b.num]) out.push('', `> **[CHECK]** ${V7_1_CHECKS[b.num]}`);
    out.push('');
    continue;
  }
  out.push(b.kind === 'bullet' ? `- ${b.text}` : b.kind === 'item' ? `${b.label} ${b.text}` : b.text); out.push('');
}
out.push(`## ${v.schedule.title}`); out.push('');
out.push(`| | ${v.schedule.columns.join(' | ')} |`); out.push(`|---|${v.schedule.columns.map(() => '---').join('|')}|`);
for (const [a, ...cells] of v.schedule.rows) out.push(`| ${a} | ${cells.join(' | ')} |`);
out.push(''); out.push(`**[CHECK]** ${SCHEDULE_CHECK}`); out.push('');
writeFileSync(new URL('../docs/agreement-v7.1.md', import.meta.url), out.join('\n'));
console.log('wrote docs/agreement-v7.1.md');
