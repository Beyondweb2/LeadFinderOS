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
/* ⛔ ONE CONSTANT AGAIN (2026-09-13). There used to be two — FINDABLE_GUARANTEE (contractual: the
   Stripe line item, the report, the client sheet) and FINDABLE_GUARANTEE_FULL (the site's copy, the
   contractual one plus a claim-window sentence), with the sync script asserting the short one was a
   strict prefix of the long one. Paul folded the claim window INTO the refund sentence and cut the
   tail ("we will show you both sets of numbers" — they already hold both sets; that is what the
   four-week results ARE), which left the two constants identical, so the split went. The site's
   GUARANTEE is byte-locked to THIS constant now, and the prefix assertion is gone from both scripts.
   ⛔ IT IS THE SENTENCE A CUSTOMER AGREES TO AT STRIPE CHECKOUT. Every rendering of the promise —
   the Stripe description, the report, the welcome pack, the site, /refunds — must say exactly this.
   A summary elsewhere may be SHORTER; it may never DIFFER. */
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
   it. check-cross-repo-sync.mjs asserts the number here matches FINDABLE_SETUP_PRICE_GBP.
   ⚠️ LENGTH: 236 characters (2026-09-13). Stripe documents no limit for the line-item description;
   the longest string PROVEN to render untruncated on the hosted page is 222 (2026-08-06, read off a
   real Checkout Session). This is 14 over that proof, so the first real Checkout Session after this
   change is what proves it — read the hosted page's text, not the HTML shell. */
export const FINDABLE_GUARANTEE =
  "We measure how often AI names you before we start, then re-measure after four weeks on the " +
  "same questions and the same engines. If that number has not gone up, email us within 14 days " +
  "of your four week results and we'll refund your £99.";

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
