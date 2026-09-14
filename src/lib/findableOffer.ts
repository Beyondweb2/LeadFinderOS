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

/** 🔴 THE MONTHLY. The offer is £99 to start AND £29.99 a month — one shape, not a one-off with
 *  something bolted on afterwards (Paul, 2026-09-14). Every surface that names the price names
 *  both figures now; a line that quotes only the setup fee understates what the customer pays.
 *
 *  It starts on the day the claim window closes: the four-week results plus 14 days, which is
 *  monthlyStartIso === claimWindowCloseIso in remeasureResults.ts — ONE function, so the charge
 *  cannot drift from the entitlement.
 *  ⛔ WHICH IS WHY BINDING COPY SAYS "14 days after you get your results" AND NEVER "week six".
 *  Week six is results + 14 days ONLY when the results land on day 28. They land later whenever
 *  the replay holds, and day 56 for RG by contract, whose second payment is therefore week ten.
 *  "From week 6" is allowed in the marketing TIMELINE, where day 28 is the stated case directly
 *  above it; terms, refunds, the pay screen, Stripe and the emails count from the results.
 *
 *  ⚠️ DECLARED HERE, ABOVE CARD_SAVED_NOTICE, AND THAT IS STRUCTURAL. That constant interpolates
 *  this one, and a const referenced before its declaration throws ReferenceError at module load —
 *  which in this file would take down the checkout, not a screen. It used to live at the bottom. */
export const FINDABLE_MONTHLY_GBP = 29.99;

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

/* 🔴 THIS CONSTANT HAD ZERO CONSUMERS UNTIL 2026-09-14, and its own comment said "Both documents
   render this rather than describing it twice". Neither document rendered it: the welcome pack
   described the profile work without ever naming the address, and the questionnaire asked for
   PERMISSION and never told anybody what to do. A customer agreed to something nobody then
   explained — Ronnie paid in August and it has still not happened.
   ⛔ THE WORDING IS THE ONE PAUL APPROVED ON 2026-09-14, and the path is Google's current one:
   "Users" has been "People and access" under Business Profile settings for some time, so the old
   text would have sent somebody hunting for a menu that no longer exists. */
/* ⚠️ ONE LITERAL, ON ONE LINE, NOT A CONCATENATION. check-cross-repo-sync parses a string
   constant and REFUSES anything it cannot read as a literal — which it did twice for these, first
   for being a concatenation and then for being SINGLE-quoted. Both refusals were correct: a guard
   that cannot parse its input must fail rather than quietly cover nothing. Double quotes, one
   line, matching FINDABLE_CONTACT_EMAIL beside it. */
export const GBP_ADD_STEPS = "Go to your profile → Business Profile settings → People and access → Add → paste that address → choose Manager → Invite.";

/** What they are asked to do, naming the address. */
export const GBP_ACCESS_ASK = `Add ${GBP_MANAGER_EMAIL} as a manager on your Google Business Profile.`;

/** Why it matters, and it stays low-key on purpose. */
export const GBP_ACCESS_REASSURANCE = "It takes about two minutes and you stay the owner.";

/* ⛔ IT SAYS WHAT THEY LOSE, NOT WHAT WE REFUSE (Paul's wording, 2026-09-14). Drafted as "we cannot
   complete your profile until it is done", which reads as a condition on the service — a threat to
   withhold work they have paid for. This states a fact about the work instead: the MEASUREMENT is
   unaffected, the fixing is what stalls. Same consequence, no ultimatum, and it is true. */
export const GBP_ACCESS_CONSEQUENCE = "Until that lands we can measure you, but we cannot fix what Google shows about you.";

/* ⛔ THE CLAIM SENTENCE, ON ITS OWN (2026-09-13). It is the second sentence of FINDABLE_GUARANTEE and
   the sentence /refunds states; the four-week results email and document say it verbatim when the
   number has not gone up. BYTE-LOCKED to findable-site's REFUND_CLAIM_SENTENCE by
   scripts/check-cross-repo-sync.mjs in both repos, and client-copy-claims.test.ts asserts the
   guarantee still ends with it — so the promise a client is measured against, the page that states
   the policy and the email that starts the 14-day clock cannot say three different things. */
/* ⛔ THE HUMAN'S NUMBER, NOT THE SENDING NUMBER. This is where a prospect or a client goes when a
   document invites them to start a conversation: the report's "WhatsApp me" button, and
   findable.live's founder contact block, which reads the same value as site.ts's WHATSAPP_NUMBER
   and is byte-locked to this one by scripts/check-cross-repo-sync.mjs in both repos.

   ⛔ IT IS NOT THE BUSINESS API NUMBER AND MUST NEVER BE SET TO ONE. Templates go out through the
   Business API and that is unchanged; this is the number a HUMAN answers. Until 2026-09-13 the
   report pointed at 447347041545, the Business API line, so every prospect who pressed the one
   button on the document asking them to talk to a person reached the automated sender instead.
   The site had always pointed at the personal number, so the two documents disagreed about how to
   reach the same company — and each held its own copy, which is why they could.

   E.164 digits only: wa.me rejects "+", spaces and dashes, so the digits ARE the link format.
   ⚠️ Anything that DISPLAYS the number to a person must format it; never print this string raw. */
/** The contact number as a person should SEE it: "+44 7943 262742". The stored constant is wa.me's
 *  format (digits only), which is unreadable on a printed page, and hand-formatting it at each call
 *  site is how a document ends up displaying one number and linking to another. UK mobiles only;
 *  anything else is returned with a "+" and left alone rather than mangled into a wrong shape. */
export function findableContactPhoneDisplay(): string {
  const d = FINDABLE_CONTACT_WHATSAPP;
  const m = /^44(7\d{3})(\d{6})$/.exec(d);
  return m ? `+44 ${m[1]} ${m[2]}` : `+${d}`;
}

/* ⛔ THE PAYMENT FAILED, AND THEY ARE STILL A CLIENT (2026-09-13, Paul's wording). Sent from
   invoice.payment_failed. Stripe is still retrying at this point — Smart Retries runs for days —
   so the one thing this must not do is read like a cancellation. "Nothing changes in the meantime"
   is the load-bearing sentence: without it, somebody whose card bounced assumes they have left and
   is then charged four days later when a retry succeeds. */
export function paymentFailedEmail(i: { payUrl: string | null }): { subject: string; paragraphs: string[] } {
  return {
    subject: "Your Findable payment didn't go through",
    paragraphs: [
      `Hi,`,
      `Your monthly payment of £${FINDABLE_MONTHLY_GBP} didn't go through — usually the card has expired or the bank wanted a check.`,
      `We'll try again over the next few days. Nothing changes in the meantime and you're still a client.`,
      i.payUrl
        ? `If it keeps failing you can update your card here: ${i.payUrl}`
        : `If it keeps failing, reply to this email and I'll send you a new payment link.`,
      `Paul, findable`,
    ],
  };
}

/* ⛔ AND WHEN IT FINALLY STOPS, THEY ARE TOLD. Paul's rule, 2026-09-13: nobody should find out they
   stopped being a customer by noticing that nothing happened.
   ⛔ TWO REASONS REACH THIS EVENT AND THEY ARE NOT THE SAME MESSAGE. `customer.subscription.deleted`
   fires both when the retries give up and when the client cancels on purpose. Telling someone who
   chose to leave that "your payments stopped working" is insulting; telling someone whose card died
   that "you asked to cancel" is a lie. Stripe says which in cancellation_details.reason. */
export function subscriptionEndedEmail(i: { becauseOfPayment: boolean }): { subject: string; paragraphs: string[] } {
  return i.becauseOfPayment
    ? {
      subject: "Your Findable monthly has stopped",
      paragraphs: [
        `Hi,`,
        `We tried your card a few times over the last week and it didn't go through, so your monthly has stopped and you won't be charged again.`,
        `Your pages stay exactly where they are and nothing has been taken down. What stops is the weekly work and the measuring.`,
        `If that wasn't what you wanted, reply to this email and we'll start it again — no need to explain anything.`,
        `Paul, findable`,
      ],
    }
    : {
      subject: "Your Findable monthly has been cancelled",
      paragraphs: [
        `Hi,`,
        `Your monthly is cancelled and you won't be charged again.`,
        `Your pages stay exactly where they are and nothing has been taken down. What stops is the weekly work and the measuring.`,
        `If you ever want it back, reply to this email and we'll pick it up where we left off.`,
        `Paul, findable`,
      ],
    };
}

/* ⛔ THE THREE-DAY NOTICE, AND WHY IT IS THE SECOND ONE AND NOT THE ONLY ONE (2026-09-13).
   Stripe's `customer.subscription.trial_will_end` fires exactly three days before and the interval
   cannot be changed. Three days' warning of a first charge forty-two days after paying is too
   late on its own — so the four-week results email carries the date and the amount fourteen days
   ahead, and this is the reminder, not the announcement.
   ⚠️ Rendered by the webhook. Plain, no selling, and the date and amount are in the first line. */
export function monthlyStartingSoonEmail(i: { businessName: string; startsOn: string; cancelUrl: string | null }): { subject: string; paragraphs: string[] } {
  return {
    subject: `Your Findable monthly starts on ${i.startsOn}`,
    paragraphs: [
      `Hi,`,
      `Your monthly payment of £${FINDABLE_MONTHLY_GBP} starts on ${i.startsOn}.`,
      `It covers the work we keep doing every week to add another way for people to find you: pages improved on what the newer data shows, new pages where there is something worth going after, and an eye on who else is being named.`,
      i.cancelUrl
        ? `If you would rather stop, you can cancel here before that date and nothing is taken: ${i.cancelUrl}`
        : `If you would rather stop, reply to this email before that date and nothing is taken.`,
      `Paul, findable`,
    ],
  };
}

/* ⛔ THE HUMAN'S INBOX, LOCKED THE SAME WAY AND FOR THE SAME REASON. findable.live's CONTACT_EMAIL
   held the same value with nothing enforcing it, one line above the WhatsApp number that had
   already drifted. Locked 2026-09-13 before it could.
   ⚠️ It is a personal address because findable.live has no mailbox yet. Swap it HERE and the site
   fails its own check until it is swapped there too, which is the point. */
/* ⛔ WHAT THE CUSTOMER IS TOLD ON THE PAGE WHERE THEY ENTER THEIR CARD (2026-09-13). The checkout
   retains the card so the monthly can start after the four-week results; saying so beside the card
   field is the condition on doing that at all. Rendered by Stripe as the submit message, and by
   findable.live on its own pre-pay screen, so the two cannot describe different arrangements.
   ⚠️ IT NAMES WHAT IS TAKEN TODAY AND WHAT IS NOT. "Nothing else is taken until after you have seen
   your four-week results" is the whole promise; a vaguer line ("we may charge you later") would be
   true and useless. ⛔ Do not add the word "maintain" to this or anything downstream of it. */
/* 🔴 IT NAMES BOTH FIGURES NOW (2026-09-14). It said "You pay £99 today" and then described the
   monthly without ever pricing it, on the one screen where somebody enters a card — so the only
   number in front of them at the moment they pay was the smaller half of what they owe. */
export const CARD_SAVED_NOTICE =
  `You pay £${FINDABLE_SETUP_PRICE_GBP} today and £${FINDABLE_MONTHLY_GBP} a month after that. We keep your card on file so the monthly can start later — nothing else is taken until after you have seen your four-week results, and you can cancel before it does.`;

export const FINDABLE_CONTACT_EMAIL = "paul@move37.fun";

export const FINDABLE_CONTACT_WHATSAPP = "447943262742";

export const REMEASURE_CLAIM_SENTENCE = "If that number has not gone up, email us within 14 days of your four week results and we'll refund your £99.";
