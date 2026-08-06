/* ============================================================
   THE CROSS-REPO SEAM, CHECKED RATHER THAN COMMENTED.

   findable-site is a separate git repository and cannot import anything from this one, so a handful
   of values exist twice. Every one of them is customer-facing and at least one of them has already
   drifted in production.

   ⛔ WHY THIS IS A SCRIPT AND NOT A COMMENT. Both repos already carried comments asking for these to
   be kept in sync. The GUARANTEE drifted anyway and nobody noticed for weeks: this repo's copy ended
   at "We do not promise you will be named." while the site's carried a further sentence. Since
   findable-checkout imports FINDABLE_GUARANTEE straight into the Stripe line-item description, the
   sentence a customer AGREED TO was not the sentence on the page that sold it to them.
   A comment cannot fail a build. This can.

   ⛔ THE PRICE IS THE WORSE ONE. A wording drift is embarrassing; a price drift means the screen says
   one number and the card is charged another. There is no version of that which is survivable, and
   until now it was guarded by nothing at all.

   ⚠️ IT READS THE OTHER REPO OFF DISK, at a sibling path, because there is no shared package. If the
   sibling is not checked out the script EXITS 2 with a loud notice rather than passing — a silent
   skip would be the comment's failure one level deeper.

   🔴 THERE IS A THIRD COPY THIS SCRIPT CANNOT REACH: the Stripe PAYMENT LINK's own description, typed
   into Stripe's dashboard. The founder link (FOUNDER_OFFER_STRIPE_URL) currently reads "...We
   guarantee the audit, the work, and the re-measurement, or a full refund. We do not promise you
   will be named." — which is NOT this constant. It drops "at week eight with before-and-after
   evidence" and the whole "The engines decide that, and anyone who promises it is guessing" clause.
   No script can check it, because it lives in Stripe. It has to be edited there by hand whenever the
   constant changes, and it is currently out of date.

   Run: node scripts/check-cross-repo-sync.mjs
   ============================================================ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LFOS = path.join(HERE, '..', 'src', 'lib');
const SITE = path.join(HERE, '..', '..', 'findable-site', 'src', 'lib');

/* Each pair: what it is, and where each repo keeps it. `kind` decides how the value is parsed —
   a string built from concatenated literals, or a bare number. */
const PAIRS = [
  {
    what: 'the guarantee',
    kind: 'string',
    mine: { file: path.join(LFOS, 'findableOffer.ts'), name: 'FINDABLE_GUARANTEE' },
    theirs: { file: path.join(SITE, 'site.ts'), name: 'GUARANTEE' },
    why: 'This is the sentence the Stripe line item charges against.',
  },
  {
    what: 'the setup price',
    kind: 'number',
    mine: { file: path.join(LFOS, 'findableOffer.ts'), name: 'FINDABLE_SETUP_PRICE_GBP' },
    theirs: { file: path.join(SITE, 'site.ts'), name: 'SETUP_PRICE_GBP' },
    why: 'The site DISPLAYS this and findable-checkout CHARGES it. A mismatch means the screen says one number and the card is charged another.',
  },
];

function read(file, name, kind) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(new RegExp('export const ' + name + '\\s*=\\s*([\\s\\S]*?);'));
  if (!m) throw new Error(`${name} not found in ${file}`);
  const body = m[1];
  if (kind === 'number') {
    const n = body.trim().match(/^-?\d+(?:\.\d+)?$/);
    if (!n) throw new Error(`${name} in ${file} is not a bare number: ${body.trim()}`);
    return Number(n[0]);
  }
  const parts = body.match(/"(?:[^"\\]|\\.)*"/g);
  if (!parts) throw new Error(`${name} in ${file} is not a string literal`);
  return parts.map((p) => JSON.parse(p)).join('');
}

if (!fs.existsSync(SITE)) {
  console.error('SKIPPED: findable-site is not checked out at ' + SITE);
  console.error('Nothing was verified. This is NOT a pass.');
  process.exit(2);
}

let failed = 0;
for (const pair of PAIRS) {
  let mine, theirs;
  try {
    mine = read(pair.mine.file, pair.mine.name, pair.kind);
    theirs = read(pair.theirs.file, pair.theirs.name, pair.kind);
  } catch (e) {
    console.error(`ERROR reading ${pair.what}: ${e.message}`);
    failed++;
    continue;
  }

  if (mine === theirs) {
    const shown = pair.kind === 'string' ? `${String(mine).length} chars` : String(mine);
    console.log(`PASS  ${pair.what}: identical across both repos (${shown})`);
    continue;
  }

  failed++;
  console.error(`\nFAIL  ${pair.what} has drifted.`);
  console.error(`  LeadFinderOS  ${pair.mine.name}   = ${JSON.stringify(mine)}`);
  console.error(`  findable-site ${pair.theirs.name} = ${JSON.stringify(theirs)}`);
  if (pair.kind === 'string') {
    const n = Math.min(mine.length, theirs.length);
    let i = 0; while (i < n && mine[i] === theirs[i]) i++;
    console.error(`  first difference at character ${i}:`);
    console.error(`    ours   ...${JSON.stringify(mine.slice(i, i + 60))}`);
    console.error(`    theirs ...${JSON.stringify(theirs.slice(i, i + 60))}`);
  }
  console.error(`  ${pair.why}`);
  console.error('  Fix BOTH.');
}

if (failed) {
  console.error(`\n${failed} of ${PAIRS.length} cross-repo values have drifted.`);
  process.exit(1);
}
console.log(`\nAll ${PAIRS.length} cross-repo values are in sync.`);
