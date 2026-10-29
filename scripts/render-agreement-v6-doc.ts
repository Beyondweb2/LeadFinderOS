/* Renders docs/agreement-v6.md from the LIVE v6 block in src/lib/clientAgreement.ts, so the solicitor reads exactly what
   clients sign. Every point Claude decided (not given by Paul) carries a [CHECK] note here, never in the live text.
   Run: npx tsx scripts/render-agreement-v6-doc.ts   (writes docs/agreement-v6.md) */
import { writeFileSync } from 'node:fs';
import { agreementVersion, V6_CHANGED_CLAUSES } from '../src/lib/clientAgreement.ts';
import { CLIENT_PAYMENT_PLANS, planAgreementWords } from '../src/lib/paymentPlans.ts';

/** The decisions Claude made, by clause (Paul gave the plans, totals, 6 months' hosting, transfer on final payment,
 *  refund = what was paid, and "reuse v5 for payments stopping"). */
export const V6_CHECKS: Record<string, string> = {
  '1.3': 'Added "payment plan" to what we record. Straightforward, but confirm.',
  '2.6': 'New defined term "Plan Period". For Pay in full it runs until 6 months after the website first goes live, because Paul set 6 months of included hosting; the monthly review work is tied to the same period. Is it right that Pay-in-full clients get 6 months of ongoing work, and that it starts at go-live (not at sign-up)? What if the site never goes live because the client delays?',
  '3.1': 'Plan names and wording of the three options. The plan chosen is printed in Client Details, which is part of the agreed (hashed) text.',
  '3.2': 'States Pay in full has no recurring payments.',
  '3.7': '"The price of your payment plan is fixed for the plan" replaces "The £99 price is fixed for the minimum term".',
  '4.1': 'The "minimum term" is defined only for the 6- and 12-month plans. For Pay in full we say the one payment is the whole price. Confirm 4.2 (ending early) and 15.2 read correctly for Pay in full, where nothing further is owed.',
  '4.3': 'Ownership transfers once the final payment has CLEARED (not just been made). For Pay in full that is straight after sign-up, before the site is built.',
  '5.4': 'The refund is "all payments you have made under this agreement". On the monthly plans the monthly payments normally start only after the Refund Window, so in practice that is £99; on Pay in full it is £499. Confirm this is intended, and whether the optional £29.99 hosting (a separate service) is excluded, which this wording implies.',
  '5.5': 'For Pay in full, ownership has already transferred at the claim. We wrote that a valid claim reverses it (licence ends, site may be taken down). A solicitor should check a transferred copyright can be "reversed" this way, or whether transfer for Pay in full should instead happen after the Refund Window closes.',
  '5.6': 'Limited to the monthly plans; "recurring £99" became "recurring payment" (the 12-month plan\'s is £49.99).',
  '8.2': '"until your final payment has cleared" replaces "until the final minimum-term payment has been made".',
  '8.4': 'Added: work created later in the Plan Period is assigned as it is created (needed for Pay in full, where the payment clears before most of the work exists).',
  '8.6': 'Payments stopping: v5\'s wording kept, "final payment" now "final payment has cleared". v5 3.5 (pause and suspend after 14 days, payments still due) is unchanged.',
  '9.2': 'Hosting for Pay in full: 6 months from the date the website first goes live (Paul said 6 months; the start point is our choice).',
  '9A.1': 'Opt-in hosting now starts after the Plan Period (was "after the final minimum-term payment").',
  '9A.2': 'As 9A.1.',
  '9A.5': 'The reminder is "before the Plan Period ends". Today the app only sends the reminder for v5 Build (fn month12-reminder); a reminder for the 6-month plan and Pay in full is NOT built yet. Either build it before the first such client reaches the end, or soften this promise.',
  '15.1': 'The agreement ends at the end of the Plan Period.',
};
const KEYPOINT_CHECK = 'Key points rewritten for the three plans. The guarantee point starts with Paul\'s headline word for word.';
const SCHEDULE_CHECK = 'Schedule rows renamed to "during the Plan Period" / "After the Plan Period"; hosting row states the 6 months for Pay in full.';
const SERVICE_CHECK = 'The one-paragraph service description now lists all three plans.';

const v = agreementVersion('v6');
const out: string[] = [];
out.push('# Findable Client Service Agreement — version 6 (v6)');
out.push('');
out.push('Generated from `src/lib/clientAgreement.ts` (the text clients sign) by `scripts/render-agreement-v6-doc.ts`. **v6 is live** for new sign-ups on the three payment plans (Paul, 2026-10-29: "write it as if my solicitor has already approved it; she reviews later"). The old £99 × 12 plan and every existing client stay on v5.');
out.push('');
out.push('Every point Claude decided is marked **[CHECK]** with a note. Clauses not listed as changed are v5 word for word. The plain list of changes is `docs/v6-review-for-solicitor.md`.');
out.push('');
out.push('## Intro'); out.push(''); out.push(v.intro); out.push('');
out.push('## Client details (filled in per client)'); out.push('');
for (const l of Object.values(v.clientDetailLabels)) out.push(`- ${l}`);
out.push(''); out.push('The "Payment plan" line prints one of:'); out.push('');
for (const p of CLIENT_PAYMENT_PLANS) out.push(`- ${planAgreementWords(p)}`);
out.push(''); out.push('**[CHECK]** New "Payment plan" line in Client Details (part of the signed, fingerprinted text).'); out.push('');
out.push('## Your service'); out.push(''); out.push(`**${v.services.build.name}.** ${v.services.build.description}`); out.push(''); out.push(`**[CHECK]** ${SERVICE_CHECK}`); out.push('');
out.push(`## ${v.keyPoints!.title}`); out.push('');
for (const p of v.keyPoints!.points) out.push(`- ${p}`);
out.push(''); out.push(`**[CHECK]** ${KEYPOINT_CHECK}`); out.push('');
for (const b of v.body) {
  if (b.kind === 'heading') { out.push(`## ${b.text}`); out.push(''); continue; }
  if (b.kind === 'clause') {
    const changed = V6_CHANGED_CLAUSES.includes(b.num);
    out.push(`**${b.num}** ${b.lead ? `**${b.lead}** ` : ''}${b.text}${changed ? ' *(changed from v5)*' : ''}`);
    if (V6_CHECKS[b.num]) out.push('', `> **[CHECK]** ${V6_CHECKS[b.num]}`);
    out.push('');
    continue;
  }
  out.push(b.kind === 'bullet' ? `- ${b.text}` : b.kind === 'item' ? `${b.label} ${b.text}` : b.text); out.push('');
}
out.push(`## ${v.schedule.title}`); out.push('');
out.push(`| | ${v.schedule.columns.join(' | ')} |`); out.push(`|---|${v.schedule.columns.map(() => '---').join('|')}|`);
for (const [a, ...cells] of v.schedule.rows) out.push(`| ${a} | ${cells.join(' | ')} |`);
out.push(''); out.push(`**[CHECK]** ${SCHEDULE_CHECK}`); out.push('');
writeFileSync(new URL('../docs/agreement-v6.md', import.meta.url), out.join('\n'));
console.log('wrote docs/agreement-v6.md');
