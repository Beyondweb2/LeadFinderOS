/* ============================================================
   WHAT THIS CUSTOMER PAYS.

   Run: npx tsx scripts/offer-price.test.ts

   🔴 REWRITTEN 2026-09-09, AND THE OLD SUITE IS WORTH A SENTENCE. It drove `offerPriceForLead`
   against a fake database: 153 lines exercising the founder-vs-full split, where a lead with a
   COMPLETED AUDIT that had not paid was charged £49.99 and everyone else £99. That function was
   deleted on 2026-09-03 when Paul moved to one flat price, so the suite had been importing a
   symbol that does not exist — it did not fail an assertion, it failed to LOAD, which is a
   different and quieter kind of broken. Nothing was verified for six days.

   ⛔ WHAT IS LEFT WORTH GUARDING, now the answer is a constant. Not the number — that is pinned
   across both repos and five files by scripts/check-cross-repo-sync.mjs. What THIS file guards is
   the two structural promises offer-price.ts makes about itself:

     1. THE PRICE SHOWN AND THE PRICE CHARGED COME FROM ONE CALL. offerPrice() survives despite
        returning a constant precisely so the plan card and the Stripe session cannot diverge.
        Before it existed, findable-site displayed SETUP_PRICE_GBP while findable-checkout charged
        FINDABLE_SETUP_PRICE_GBP — two constants in two repos, and they had already drifted once.
        So: both callers must call it, and neither may write a price literal of its own.

     2. THE BROWSER NEVER DECIDES MONEY. The function takes no arguments, so there is no parameter
        through which a discount could be requested — the same property findable-checkout enforces
        by reading the website add-on from the SAVED ROW rather than from the request body.

   ⚠️ ASSERTED ON THE REAL MODULE AND THE REAL CALLERS' SOURCE, never on a restatement.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { offerPrice } from '../supabase/functions/_shared/offer-price.ts';
import { FINDABLE_SETUP_PRICE_GBP } from '../src/lib/findableOffer.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/** Strip comments — every one of these files DISCUSSES the price at length, and a guard that
 *  trips on its own explanation gets deleted rather than fixed. */
const code = (rel: string) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

console.log('\n── THE PRICE COMES FROM THE SHARED CONSTANT ──');
const offer = offerPrice();
ok(offer.gbp === FINDABLE_SETUP_PRICE_GBP,
   `offerPrice().gbp is FINDABLE_SETUP_PRICE_GBP (${offer.gbp} vs ${FINDABLE_SETUP_PRICE_GBP})`);
ok(offer.label === `£${FINDABLE_SETUP_PRICE_GBP}`, `label renders the same constant (${offer.label})`);
ok(offer.reason === 'flat_price', `reason names the rule (${offer.reason})`);
/* Not a hand-typed 49.99: this asserts the two agree, so moving the constant moves both. A literal
   here would pass while the product charged something else entirely. */
ok(typeof offer.gbp === 'number' && offer.gbp > 0, 'the price is a positive number');

console.log('\n── THE BROWSER CANNOT ASK FOR A DIFFERENT PRICE ──');
ok(offerPrice.length === 0,
   `offerPrice takes NO arguments, so there is no channel for a caller-supplied price (arity ${offerPrice.length})`);

console.log('\n── BOTH CALLERS USE IT, AND NEITHER WRITES ITS OWN PRICE ──');
/* Named individually rather than discovered: adding a third payment path should be a visible
   change to this list, not something a wildcard silently absorbs. */
const CALLERS = [
  'supabase/functions/findable-checkout/index.ts',
  'supabase/functions/findable-onboarding/index.ts',
];
for (const rel of CALLERS) {
  const src = code(rel);
  ok(/offerPrice\s*\(\s*\)/.test(src), `${rel}: calls offerPrice()`);
  /* A decimal money literal in live code is the drift this file exists to prevent. The constant
     itself lives in findableOffer.ts and reaches these files by import, never by retyping. */
  const literals = src.match(/\b\d+\.\d{2}\b/g) ?? [];
  ok(literals.length === 0, `${rel}: no price literal in live code${literals.length ? ` (found ${literals.join(', ')})` : ''}`);
}

console.log('\n── THE PRICE IS NEVER READ FROM THE REQUEST BODY ──');
/* The standing rule on findable-checkout: the browser never decides money. The website add-on is
   read from the saved onboarding row for exactly this reason, so a price arriving in the body
   would be a regression of a rule that already has a documented incident behind it. */
{
  const src = code('supabase/functions/findable-checkout/index.ts');
  ok(!/body\s*\.\s*(price|amount|gbp|discount)/i.test(src),
     'findable-checkout reads no price/amount/discount from the request body');
}

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
if (f) throw new Error(`${f} failures`);
