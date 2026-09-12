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

   🔴 TWO COPIES EXIST THAT NO SCRIPT CAN REACH, both inside Stripe's dashboard, on the PAYMENT LINK
   kept for sending by hand on WhatsApp (FOUNDER_OFFER_STRIPE_URL):
     · its DESCRIPTION, which on 2026-08-06 read "...the audit, the work, and the re-measurement, or
       a full refund. We do not promise you will be named." — dropping "at week eight with
       before-and-after evidence". Out of date against the constant even in its shortened form.
     · its fixed £19.99 AMOUNT, which will drift the moment the founder price changes anywhere else.
   Neither can be read from here. Written down because they cannot be tested.

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
    /* ⛔ THE SITE CARRIES THE FULL VERSION. Its GUARANTEE must match FINDABLE_GUARANTEE_FULL, not the
       contractual FINDABLE_GUARANTEE — see the prefix assertion below, which is what keeps the two
       LeadFinderOS constants from becoming two different promises. */
    what: 'the guarantee (full / marketing)',
    kind: 'string',
    mine: { file: path.join(LFOS, 'findableOffer.ts'), name: 'FINDABLE_GUARANTEE_FULL' },
    theirs: { file: path.join(SITE, 'site.ts'), name: 'GUARANTEE' },
    why: 'This is the sentence the marketing site shows.',
  },
  {
    what: 'the setup price',
    kind: 'number',
    mine: { file: path.join(LFOS, 'findableOffer.ts'), name: 'FINDABLE_SETUP_PRICE_GBP' },
    theirs: { file: path.join(SITE, 'site.ts'), name: 'SETUP_PRICE_GBP' },
    why: 'The site DISPLAYS this and findable-checkout CHARGES it. A mismatch means the screen says one number and the card is charged another.',
  },
  {
    /* ⛔ THIS PAIR DRIFTED IN PRODUCTION FOR A FORTNIGHT (2026-08-03 → 2026-08-17). The server half
       (the FINDABLE_SITE_ORIGIN Supabase secret) moved to https://findable.live while the SPA's
       constant stayed on the raw pages.dev domain — so template-sent onboarding links went out
       branded and Inbox-copied ones went out looking like scam links, interleaved, to real
       prospects. The secret itself cannot be read from a script; findable-site's own SITE_URL is
       the same fact in checkable form, so the SPA constant is anchored to THAT. When the domain
       ever moves: change the secret, change site.ts, and this check forces the SPA constant along. */
    what: 'the onboarding link origin',
    kind: 'string',
    mine: { file: path.join(HERE, '..', 'src', 'config', 'findableSite.ts'), name: 'FINDABLE_SITE_ORIGIN' },
    theirs: { file: path.join(SITE, 'site.ts'), name: 'SITE_URL' },
    why: 'The Inbox copy button and the link card build onboarding URLs from the SPA constant; the site knows its own canonical origin. A mismatch sends prospects unbranded pages.dev links that read as scams.',
  },
];

function read(file, name, kind) {
  const src = fs.readFileSync(file, 'utf8');
  /* `export` is optional: the dashboard's copy of the founder price is a module-local const, and
     requiring the keyword would have silently found nothing there. */
  const m = src.match(new RegExp('(?:export )?const ' + name + '\\s*=\\s*([\\s\\S]*?);'));
  if (!m) throw new Error(`${name} not found in ${file}`);
  const body = m[1];
  if (kind === 'number') {
    const n = body.trim().match(/^-?\d+(?:\.\d+)?$/);
    if (!n) throw new Error(`${name} in ${file} is not a bare number: ${body.trim()}`);
    return Number(n[0]);
  }
  /* A duration written as arithmetic — `10 * 60 * 1000`. Compared by VALUE, because the same window
     can honestly be written `10 * 60 * 1000` in one file and `600_000` in another and a string
     comparison would call those a drift. Only digits, * and whitespace are evaluated; anything else
     throws rather than being run. */
  if (kind === 'expression') {
    const expr = body.trim();
    if (!/^[\d_\s*]+$/.test(expr)) throw new Error(`${name} in ${file} is not a simple arithmetic expression: ${expr}`);
    return expr.split('*').reduce((acc, part) => acc * Number(part.replace(/[_\s]/g, '')), 1);
  }
  /* A price written as a display label — "£19.99". Compared as a NUMBER, because "£19.99" and
     "£19.99 " and "19.99" are the same price and only one of them is a string match. */
  if (kind === 'money-label') {
    const parts = body.match(/"(?:[^"\\]|\\.)*"/g);
    if (!parts) throw new Error(`${name} in ${file} is not a string literal`);
    const text = parts.map((p) => JSON.parse(p)).join('');
    const n = text.match(/(\d+(?:\.\d+)?)/);
    if (!n) throw new Error(`${name} in ${file} has no number in it: ${JSON.stringify(text)}`);
    return Number(n[1]);
  }
  const parts = body.match(/"(?:[^"\\]|\\.)*"/g);
  if (!parts) throw new Error(`${name} in ${file} is not a string literal`);
  return parts.map((p) => JSON.parse(p)).join('');
}

/* ══ SAME-REPO GROUPS ═════════════════════════════════════════════════════════════════════════
   ⛔ THE ARGUMENT FOR THIS CHECK DOES NOT STOP AT A REPO BOUNDARY. The cross-repo half exists
   because a comment saying "keep these in sync" does not work — and a comment saying it inside one
   repository is the same comment. A same-repo drift is more visible, not prevented.

   The founder price lives in THREE places, each doing a different job:
     · offer-price.ts        what the customer is actually CHARGED   (the only one that decides)
     · founderOffer.ts       what the report SAYS, as a display label
     · useDashboardMetrics   what is COUNTED as a founder place
   Any two of them disagreeing is a real fault with no error: the report advertises one price and
   Stripe takes another, or the tile counts nothing because it is looking for an amount nobody was
   charged. None of that throws.

   ⚠️ CHECKED FROM BOTH REPOS, deliberately. Every constant here lives in LeadFinderOS, but the
   findable-site copy of this script reads it over the same sibling path it already uses for the
   guarantee — so whichever script someone happens to run, the drift is caught. */
/** LeadFinderOS's repo root. LFOS points at <repo>/src/lib. */
const LFOS_ROOT = path.join(LFOS, '..', '..');

const SAME_REPO_GROUPS = [
  {
    what: 'the one price',
    why: 'findable-checkout charges it and the dashboard counts customers by matching it exactly. Disagreement means a tile that counts nothing, or a price nobody is charged. Until 2026-09-03 this guarded a FOUNDER price against a separate full price; there is one price now.',
    /* LFOS is <repo>/src/lib, so the repo root is two up. The first attempt joined one level and
       looked for src/supabase/... — it failed loudly with ENOENT rather than quietly finding
       nothing, which is the behaviour a check like this has to have. */
    places: [
      /* offer-price.ts and founderOffer.ts no longer declare a price of their own: the first returns
         FINDABLE_SETUP_PRICE_GBP and the second is gone (now buyOffer.ts, which carries no money). So
         the remaining drift risk is the DASHBOARD's copy against the charged figure, and that is what
         this pins. The cross-repo pair above already pins the charged figure against findable-site.
         ⚠️ FOUNDER_PRICE_GBP keeps its NAME in useDashboardMetrics deliberately - CLAUDE.md 6h records
         that this parser reads it as a bare number and that moving it broke the guard once already. It
         now means "the price customers actually paid", with the historical list beside it. */
      { file: path.join(LFOS, 'findableOffer.ts'), name: 'FINDABLE_SETUP_PRICE_GBP', kind: 'number', role: 'CHARGED' },
      { file: path.join(LFOS_ROOT, 'src', 'hooks', 'useDashboardMetrics.ts'), name: 'FOUNDER_PRICE_GBP', kind: 'number', role: 'counted on the dashboard' },
    ],
  },
  {
    /* ⛔ THIS PAIR BROKE PRODUCTION ON 2026-08-06, WITH A COMMENT ON BOTH SIDES ASKING FOR IT.
       The measure button creates MARKET_AUDIT_MIN_AUDITS audits back to back, a second apart, for the
       same trade and town — sequentially on purpose, because the coverage directive needs the first
       audit's queue rows to exist before the second is generated. create-ai-audit's cooldown allows
       MARKET_COOLDOWN_ALLOWANCE per trade+town per window.
       If the allowance is BELOW the minimum, the button is structurally unable to finish: the guard
       refuses the flow's own second audit and the market is stranded on one — which is the exact
       "not enough measured yet" state the rebuild existed to prevent, caused by its own guard.
       Norwich got one audit that way. A comment on each naming the other did not stop it, and a
       comment is what is being replaced here. */
    what: 'the market audit count and the cooldown allowance',
    why: 'The measure button creates MARKET_AUDIT_MIN_AUDITS audits in a row; create-ai-audit refuses more than MARKET_COOLDOWN_ALLOWANCE per window. An allowance below the minimum makes the button unable to complete, silently, and strands the market on one audit.',
    places: [
      /* Moved to a zero-dep leaf 2026-08-19 so Coverage's "Measured" rung and the panel share one
         number; marketView.ts re-exports it, but this parser needs the DECLARATION site. */
      { file: path.join(LFOS_ROOT, 'src', 'lib', 'marketAuditThreshold.ts'), name: 'MARKET_AUDIT_MIN_AUDITS', kind: 'number', role: 'how many the button CREATES' },
      { file: path.join(LFOS_ROOT, 'supabase', 'functions', 'create-ai-audit', 'index.ts'), name: 'MARKET_COOLDOWN_ALLOWANCE', kind: 'number', role: 'how many the server ALLOWS' },
    ],
  },
  {
    /* ⛔ THIS PAIR HAD ALREADY DRIFTED WHEN THE CHECK WAS WRITTEN. marketView was re-measured to
       $0.0104 per question and sources.ts was left at $0.0125, so the app quoted the operator one
       price while the server reserved another against the spend cap — a 20% gap between the number
       on screen and the number being enforced, with nothing anywhere to notice it.
       Both are now named exports for the sole reason that this checker can only read a named const;
       the value in sources.ts used to be an object property and was therefore unguardable. */
    what: 'the per-question audit cost',
    why: 'marketView quotes this to the operator and sources.ts reserves against it in the cap pre-check. A mismatch means the estimate on screen is not the spend being enforced.',
    places: [
      { file: path.join(LFOS_ROOT, 'src', 'lib', 'marketView.ts'), name: 'AUDIT_EST_USD_PER_QUESTION', kind: 'number', role: 'QUOTED to the operator' },
      { file: path.join(LFOS_ROOT, 'supabase', 'functions', '_shared', 'enrichment', 'sources.ts'), name: 'AI_SEARCH_USD_PER_QUESTION', kind: 'number', role: 'RESERVED against the cap' },
    ],
  },
  {
    /* Same shape, same two files. The SEO figure matters more than it looks: it is the biggest single
       line in a batch estimate, so a drift here moves the total the operator approves. */
    what: 'the SEO scan cost',
    why: 'marketView shows this in the batch estimate and as the saving from skipping scans; sources.ts reserves against it and is the fallback written to enrichment_usage when Apify reports no figure. A mismatch mis-states both the estimate and the record.',
    places: [
      { file: path.join(LFOS_ROOT, 'src', 'lib', 'marketView.ts'), name: 'SEO_SCAN_USD', kind: 'number', role: 'SHOWN in the batch estimate' },
      { file: path.join(LFOS_ROOT, 'supabase', 'functions', '_shared', 'enrichment', 'sources.ts'), name: 'SEO_SCAN_USD_PER_SCAN', kind: 'number', role: 'RESERVED, and the usage fallback' },
    ],
  },
  {
    /* The window itself. Less dangerous than the allowance — a mismatch only makes the panel's
       message wrong about how long to wait — but it is the same two-copies-one-value shape, and it
       costs one entry to cover. */
    what: 'the market cooldown window',
    why: 'The panel states this to the operator and create-ai-audit enforces it. A mismatch means the refusal message names a wait that is not the real one.',
    places: [
      { file: path.join(LFOS_ROOT, 'src', 'lib', 'marketView.ts'), name: 'MARKET_COOLDOWN_MS', kind: 'expression', role: 'stated by the panel' },
      { file: path.join(LFOS_ROOT, 'supabase', 'functions', 'create-ai-audit', 'index.ts'), name: 'MARKET_COOLDOWN_MS', kind: 'expression', role: 'enforced by the server' },
    ],
  },
];

function checkGroups() {
  let bad = 0;
  for (const g of SAME_REPO_GROUPS) {
    let values;
    try {
      values = g.places.map((p) => ({ ...p, value: read(p.file, p.name, p.kind) }));
    } catch (e) {
      console.error(`ERROR reading ${g.what}: ${e.message}`);
      bad++;
      continue;
    }
    const distinct = [...new Set(values.map((v) => v.value))];
    if (distinct.length === 1) {
      console.log(`PASS  ${g.what}: all ${values.length} places agree (${distinct[0]})`);
      continue;
    }
    bad++;
    console.error(`\nFAIL  ${g.what} has drifted across ${values.length} places in LeadFinderOS.`);
    for (const v of values) {
      console.error(`  ${String(v.value).padStart(8)}  ${v.name}  (${v.role})`);
      console.error(`            ${path.relative(LFOS_ROOT, v.file)}`);
    }
    console.error(`  ${g.why}`);
    console.error('  Fix ALL of them.');
  }
  return bad;
}

if (!fs.existsSync(SITE)) {
  console.error('SKIPPED: findable-site is not checked out at ' + SITE);
  console.error('Nothing was verified. This is NOT a pass.');
  process.exit(2);
}


/* ⛔ THE PREFIX ASSERTION. Two guarantee constants are only honest if the contractual one is a strict
   PREFIX of the marketing one — the site then says everything the contract says plus a line that adds
   no obligation. A mere "subset" would allow the two to be different promises with words in common;
   a prefix cannot. This is the assertion that makes the split safe, and it is checked rather than
   intended, because "keep these in sync" as a comment is exactly what failed last time.
   It runs in BOTH repos even though both constants live in LeadFinderOS: the site's copy is the thing
   being anchored, so the check that guards it belongs wherever someone might edit either end. */
function checkPrefix() {
  const short = read(path.join(LFOS, 'findableOffer.ts'), 'FINDABLE_GUARANTEE', 'string');
  const full = read(path.join(LFOS, 'findableOffer.ts'), 'FINDABLE_GUARANTEE_FULL', 'string');
  if (!short || !full) {
    console.error('FAIL  one of the guarantee constants is empty.');
    return false;
  }
  if (!full.startsWith(short)) {
    console.error('\nFAIL  the contractual guarantee is not a prefix of the marketing one.');
    console.error(`  contractual (${short.length}): ${JSON.stringify(short)}`);
    console.error(`  marketing   (${full.length}): ${JSON.stringify(full)}`);
    let i = 0; while (i < short.length && short[i] === full[i]) i++;
    console.error(`  diverges at character ${i}: ${JSON.stringify(short.slice(i, i + 60))}`);
    console.error('  The contract must never promise something the site does not, or vice versa.');
    return false;
  }
  if (full.length <= short.length) {
    console.error('FAIL  the two guarantee constants are identical — one of them is pointless.');
    return false;
  }
  console.log(`PASS  the contractual guarantee is a strict prefix of the marketing one (${short.length} of ${full.length} chars)`);
  return true;
}

/* ⛔ THE REFUND AMOUNT IS WRITTEN INSIDE THE GUARANTEE SENTENCE, so the promise can now contradict
   the price without either constant being "wrong" on its own. Added 2026-09-12 with the move to a
   measured refund: the sentence says "you can claim your £99 back", and if FINDABLE_SETUP_PRICE_GBP
   is ever changed without the text, we would charge one amount and promise to refund another — in
   the one string a customer agrees to at Stripe checkout.
   ⚠️ IT CANNOT BE SOLVED BY INTERPOLATION. `read()` parses these constants as plain double-quoted
   string literals; a template literal building the price in would make the constant unreadable to
   this script and silently drop the cross-repo guarantee check with it. So the number is typed, and
   this is what stops it rotting.
   ⚠️ Matches the price as it would be WRITTEN (99, or 49.99) rather than any £ figure in the text,
   so a future sentence mentioning another amount does not accidentally satisfy it. */
function checkRefundAmount() {
  const price = read(path.join(LFOS, 'findableOffer.ts'), 'FINDABLE_SETUP_PRICE_GBP', 'number');
  const text = read(path.join(LFOS, 'findableOffer.ts'), 'FINDABLE_GUARANTEE', 'string');
  const wanted = `£${price}`;
  if (!text.includes(wanted)) {
    console.error(`\nFAIL  the guarantee does not name the price it promises to refund.`);
    console.error(`  FINDABLE_SETUP_PRICE_GBP = ${price}, so the guarantee should contain "${wanted}".`);
    console.error(`  guarantee: ${JSON.stringify(text)}`);
    console.error('  Charging one amount and promising to refund another is the worst version of this drift.');
    return false;
  }
  console.log(`PASS  the guarantee names the charged price (${wanted})`);
  return true;
}

let failed = 0;
if (!checkPrefix()) failed++;
if (!checkRefundAmount()) failed++;
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

failed += checkGroups();

// pairs + the guarantee prefix + the refund-amount check + the same-repo groups
const TOTAL = PAIRS.length + 2 + SAME_REPO_GROUPS.length;
if (failed) {
  console.error(`\n${failed} of ${TOTAL} checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${TOTAL} checks pass: ${PAIRS.length} cross-repo, ${SAME_REPO_GROUPS.length} same-repo, plus the guarantee prefix and the refund amount.`);
