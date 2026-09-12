// THE FINDABLE OFFER — the one place the price and the guarantee wording live.
//
// Imported by BOTH the SPA and edge functions (findable-checkout, stripe-webhook),
// so this file must stay dependency-free and edge functions must import it with a
// RELATIVE path and an explicit .ts extension (like reportSlug.ts) — never the @/
// alias, which Deno's bundler rejects outright (see CLAUDE.md §4).
//
// ⚠️ CROSS-REPO SEAM: findable-site is a separate repo and cannot import this.
// Its copy lives in findable-site/src/lib/site.ts (GUARANTEE) and the price is
// displayed in its OnboardingFlow.tsx. Changing either value here means a matching
// pass there.
// ⛔ THE COMMENT USED TO SAY IT WAS "the only guard", AND IT FAILED. The guarantee
// drifted and nobody noticed for weeks. There is now a real check in each repo:
//   node scripts/check-guarantee-sync.mjs
// It reads the other repo off disk and exits non-zero on any byte difference. The
// PRICE is still guarded by nothing but this comment.

/** 🔴 THE ONE PRICE EVERYONE PAYS, in GBP. One-off, not recurring.
 *
 *  History: £49.99 → £99 (2026-08-04) → £49.99 flat (2026-09-03) → **£99 flat (2026-09-12)**.
 *
 *  ⛔ THERE IS NO SECOND PRICE. One flat figure, whether they arrive from their report, the
 *  homepage, or a cold link. The founder/full split was removed on 2026-09-03 and must not come
 *  back: the ?lead= tag decides IDENTITY, never money, which is what lets a lead-less visitor buy.
 *
 *  ⛔ £99 NOW INCLUDES THE WEBSITE BUILD (Paul, 2026-09-12). Until today a customer who ticked
 *  "build my site" was charged a SEPARATE £49.99 build line from a Stripe Price object. That line
 *  is gone from findable-checkout entirely — the tick now adds only the £9.99/month hosting
 *  subscription. So this number is the whole one-off charge in both shapes of the sale, which is
 *  exactly why it may not be quietly raised without pricing the build work into it.
 *
 *  ⚠️ THIS FIGURE APPEARS INSIDE THE GUARANTEE SENTENCE BELOW, as the amount refunded. Those two
 *  cannot be allowed to disagree, and a comment will not stop them — scripts/check-cross-repo-sync.mjs
 *  asserts that the guarantee text contains this number. Change one, the check fails until you
 *  change the other. */
export const FINDABLE_SETUP_PRICE_GBP = 99;

/* The guarantee, WORK-based: we promise the audit, the work and the re-measurement, never the
   outcome. Anywhere this sentence is shown to a client must render it from this constant, not a
   local copy — three hardcoded copies drifted apart once already.

   ⛔ BYTE-IDENTICAL TO findable-site's GUARANTEE, and asserted by scripts/check-guarantee-sync.mjs
   in BOTH repos. It is the sentence the Stripe line item charges against, the sentence the audit
   report prints, the sentence the client request sheet prints, and the sentence on the marketing
   site. A customer must not agree to one wording at checkout and read a different one on the page
   that sold it to them.
   ⚠️ THEY HAD DRIFTED. This copy ended at "We do not promise you will be named."; the site's carried
   a further sentence — "The engines decide that, and anyone who promises it is guessing" — which is
   the strongest line in it. Restored here 2026-08-06, longer version wins. */
/* ⛔ TWO CONSTANTS, AND THE SHORTER ONE IS A STRICT PREFIX OF THE LONGER. That property is the whole
   reason this is safe, and scripts/check-cross-repo-sync.mjs asserts it rather than trusting it.
   FINDABLE_GUARANTEE is CONTRACTUAL: the Stripe line item, the audit report, the client request
   sheet. FINDABLE_GUARANTEE_FULL adds one sentence and is what the marketing site carries.
   ⚠️ THE EXTRA SENTENCE ADDS NO OBLIGATION — it disclaims a promise that was never made — so the
   contractual version is shorter without owing the customer less. That is the only test that
   matters for a string somebody agrees to at checkout. A prefix can only ever be a shorter promise,
   never a different one; a "subset" could be neither.
   ⛔ NEVER MAKE THEM DIVERGE IN CONTENT. If the marketing line needs different words, the
   contractual one changes first and the marketing one extends it. The sync check fails otherwise. */
/* 🔴 THE PROMISE CHANGED SHAPE ON 2026-09-12, AND THIS IS THE ONE NOTE TO READ BEFORE EDITING IT.
   It used to guarantee the WORK — "the audit, the work, and the re-measurement ... or a full refund"
   — and explicitly disclaimed the outcome ("We do not promise you will be named. The engines decide
   that, and anyone who promises it is guessing").

   It is now conditional on the MEASUREMENT MOVING. Paul's instruction, confirmed on the record:
   if the number has not gone up at four weeks, the customer can claim the setup fee back. That is a
   change to what we OWE, not a change of wording, and it has three consequences somebody will
   otherwise rediscover the hard way:
     · The refund is now triggered by something we do not control, so the four-week re-measurement
       has to actually happen on the SAME questions and engines or the claim cannot be adjudicated.
       audit-baseline.ts's stored question set is what makes that checkable — do not loosen it.
     · Every hedge that used to sit beside this sentence was deleted in the same pass. Re-adding one
       ("we can't promise", "the engines decide") next to a conditional refund reads as walking it
       back, which is worse than either wording alone.
     · findable.live/refunds is the customer-facing statement of this and must not contradict it.
       If this sentence changes, that page changes in the same commit.
   ⚠️ £99 IS WRITTEN INTO THE TEXT because a customer reading a refund promise needs the amount in
   it. check-cross-repo-sync.mjs asserts the number here matches FINDABLE_SETUP_PRICE_GBP. */
export const FINDABLE_GUARANTEE =
  "We measure how often AI names you before we start, then re-measure after four weeks on the " +
  "same questions and the same engines. If that number has not gone up, you can claim your £99 back.";

/** The site's version: the contractual sentence plus the line that makes the point rather than the
 *  promise. Byte-identical to findable-site's GUARANTEE, asserted by the sync check. */
/* The site's version: the contractual sentence plus HOW to claim. Byte-identical to findable-site's
   GUARANTEE, asserted by the sync check.
   ⚠️ THE EXTRA SENTENCE NOW ADDS AN OBLIGATION, WHICH THE OLD ONE DID NOT. The previous tail merely
   disclaimed a promise, so the shorter contractual string could never owe less than the marketing
   one. This tail states a 14-day claim window — a LIMIT on the promise, so the prefix rule still
   holds in the safe direction (the contractual version, seen at Stripe, is the more generous one).
   ⛔ Keep it that way. If a future tail ever WIDENS the promise, it belongs in FINDABLE_GUARANTEE
   instead, or a customer agrees to one thing at checkout and reads a bigger one on the page. */
export const FINDABLE_GUARANTEE_FULL =
  "We measure how often AI names you before we start, then re-measure after four weeks on the " +
  "same questions and the same engines. If that number has not gone up, you can claim your £99 back. " +
  "Email us within 14 days of receiving your four week results and we will show you both sets of " +
  "numbers and refund you.";

/* ⛔ WHERE A PROSPECT'S REPORT LIVES. findable.live/report/<auditId> — a Cloudflare Pages Function in
   the findable-site repo (functions/report/[id].ts) that proxies the render-audit-report edge
   function and FORCES text/html, because the Supabase gateway serves that function as text/plain
   with nosniff and a sandbox CSP. The upstream function URL must never be given to a human.
   Deliberately NOT PUBLIC_SITE_ORIGIN: that is the barber product's yoursites.uk, and coupling the
   AI-visibility report to it is what left the share link pointing at a dead route.
   ⚠️ The edge functions cannot import this file's SPA-side siblings, so render-audit-report and
   _shared/audit-reply hold their own copy of this origin. Three places, one value — change together. */
export const REPORT_PUBLIC_ORIGIN = "https://findable.live";

/** The URL a prospect is given for their report. */
export const reportPublicUrl = (auditId: string) => `${REPORT_PUBLIC_ORIGIN}/report/${auditId}`;

/* ⛔ THE GOOGLE ACCOUNT A CLIENT ADDS AS A MANAGER. One value, and it is the OWNER-ADDS-US flow:
   they open their profile, Users, Add, type this address, choose Manager. Google then emails US the
   invite and we accept it.
   ⛔ NOT THE REQUEST-ACCESS FLOW, and the reason is the deciding one: Google's request-access path
   emails whoever claimed the profile — very often an old address at a web company nobody has spoken
   to in years — and runs a 3-7 day timer that can end in an ownership transfer nobody asked for.
   That is not something to build a week-one step on. Owner-adds-us lands in our inbox in seconds and
   we know it worked because we are the one accepting.
   ⚠️ IT MUST BE A GOOGLE ACCOUNT. Google will not accept a manager address that is not one.
   ⚠️ THE QUESTIONNAIRE (findable-site, separate repo) MUST SHOW THE SAME ADDRESS. Two documents
   describing one mechanism was the whole point of standardising; two documents naming different
   addresses would be worse than the inconsistency it replaced. */
export const GBP_MANAGER_EMAIL = "paul@move37.fun";

/** The three clicks, written once. Both documents render this rather than describing it twice. */
export const GBP_ADD_STEPS =
  `Open your Google Business Profile, go to Users, click Add, enter ${GBP_MANAGER_EMAIL}, and choose `
  + 'Manager. That is the whole job — you stay the owner, you never share a password, and you can '
  + 'remove us in two clicks at any time.';
