/* ============================================================
   DIRECTORY FACTS — hand-maintained, deliberately NOT derived from data.

   Two things are kept apart on purpose:
     1. EVIDENCE — which sources the engines actually cite, per trade. Derived live from
        ai_audit_queue citations (see buildPlaybook). It improves on its own as audits accumulate.
     2. FACTS — signup URL, cost, who is allowed to action it, vetting. This CANNOT be derived from
        citations and must be checked against each site by a human.

   Keeping them apart means growing evidence can never silently invent a signup URL.

   URL VERIFICATION STATUS — last checked 2026-07-29.

   VERIFIED (4). Yell, MyBuilder and 192.com were confirmed by the operator clicking them; the
   MyBuilder and 192 paths in the original file were WRONG and are corrected here. Checkatrade was
   verified by fetch: join.checkatrade.com returns 200 without redirecting and its title is "Join
   Checkatrade | Get More Leads & Grow Your Trade Business", with 153 occurrences of "join" and zero
   "login"/"sign in" — the opposite of the old /join-us path, which redirects to a login page.
   Verified means "this is the right page to start from", not "someone completed a signup".

   STILL UNVERIFIED (the rest). Two reasons this matters less than it looks:
     - Almost all of them are actor: 'client-only', so they never appear as a link the operator
       clicks mid-task. They land in the CLIENT pack as "apply here", where the client is going to
       navigate the site themselves anyway and a slightly wrong deep link costs nothing.
     - The DOMAINS are all evidenced from real citations. Only the signup PATHS are uncertain.
   ⚠️ THE ONE THAT DOES MATTER: cylex-uk.co.uk is the only UNVERIFIED entry on the operator's own
   doable list, so it is the only unverified URL anyone will actually click during the hour. Check it
   before relying on it — see the flag on that entry.

   trustatrader.com could not be checked at all: the site was down when the operator looked.
   ============================================================ */

/* TOWN PORTALS — A CATEGORY THE DERIVATION FOUND AND RESEARCH WOULD NOT HAVE.
   loughborough.org.uk is a town portal carrying a local business directory, cited in 10 of 58
   plumber audits. It is not a trades directory and no "best directories for plumbers" guide would
   ever list it — it was found only because the evidence layer reads what AI actually cites.

   So: for each client town, CHECK whether a <town>.org.uk or <town>.co.uk portal exists with a
   business directory. Wisbech, Kettering, Stamford, Chatteris and anywhere else clients operate.

   Deliberately NOT hardcoded. Adding towns that have never appeared in citations would be guesses
   dressed as evidence, and this file's whole job is to avoid exactly that. A portal earns an entry
   when it shows up in the data, not before.
   ══════════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════════
   GUARDRAIL — READ BEFORE ADDING A FIELD.

   NEVER add a `trade` (or `trades`) field to DirectoryFact.

   The moment a fact says "Checkatrade is for plumbers", this file becomes the hardcoded list the
   evidence layer exists to replace — and it would be wrong by construction: Checkatrade has 657
   citations across 57 of 58 plumber audits and appears ZERO times for accountants, which is a fact
   about the evidence, not about Checkatrade.

   WHICH hosts matter for a trade is decided ONLY by citations in ai_audit_queue, in
   buildPlaybook.ts. This file answers a different question: given that a host came up, what IS it
   and who can action it. Keyed by host, never by trade.
   ══════════════════════════════════════════════════════════════════════════════ */

/** What a cited host actually IS. Decides whether it can ever become a task.
 *
 *  This exists because most top-cited hosts are NOT directories. For plumbers, able-group.co.uk is
 *  cited in 58 of 58 audits and dyno.com in 50 — both national operators' own websites. A client
 *  cannot be listed on a competitor's site, so those must never become work; they are intelligence
 *  about who keeps getting named. */
export type HostKind =
  | 'directory'      // a listing site a business can appear on — the only kind that becomes a task
  | 'trade-body'     // register/scheme; joining needs qualifications or membership, not just signup
  | 'own-site'       // a business's OWN website (competitor or national operator) — never a task
  | 'editorial'      // press, magazines, blogs — earned coverage, not a listing
  | 'community'      // forums and social threads (Reddit) — never a client task
  | 'aggregator'     // auto-generated from public data; usually nothing to join
  | 'register';      // statutory (Companies House, GOV.UK) — listing is automatic

/** Who is actually able to complete this listing. */
export type Actor =
  | 'operator'        // you can do it start to finish
  | 'operator-start'  // you can submit, but the business must confirm ownership
  | 'client-only';    // paid and/or identity-vetted — only the business owner can

export interface DirectoryFact {
  /** Host as it appears in citations — the join key to the evidence. */
  host: string;
  label: string;
  signupUrl: string;
  /** false everywhere until a human has clicked it. See the warning above. */
  urlVerified: boolean;
  /** What this host IS. Absent means 'directory' — every entry predating this field is one.
   *  Anything that is NOT 'directory' or 'trade-body' can never become a task. */
  kind?: HostKind;
  actor: Actor;
  cost: 'free' | 'paid' | 'pay-per-lead' | 'membership' | 'n/a';
  /** Shown to the operator so they never waste time attempting a blocked one. */
  blockedReason?: string;
  /** Hand-written client-facing paragraph. Only needed for client-only sources. */
  clientParagraph?: string;
  /** Not a listing you can join (e.g. a statutory register) — never appears as a task. */
  notAListing?: boolean;
  /* ══════════════════════════════════════════════════════════════════════════
     HAND-WRITTEN SUB-STEPS for the printed document. Yell's steps are always Yell's steps: this is
     a property of the host, learned by looking at its signup flow, exactly like `signupUrl` and
     `blockedReason`. It is NOT the banned `trade` field and never decides which hosts surface.

     DELIBERATELY ABSENT ON MOST HOSTS, AND THERE IS NO GENERIC FALLBACK. Invented generic steps
     ("create an account, fill in your details, submit") are precisely what made the LLM document
     useless, so a host with no written steps prints an explicit "no written steps yet" line rather
     than filler or a silent gap. Only write these from a flow someone has actually looked at.
     ══════════════════════════════════════════════════════════════════════════ */
  steps?: string[];
  /* ══════════════════════════════════════════════════════════════════════════
     TOWN-SPECIFIC. The town this host's directory actually covers, when it covers only one.
     Set it and the host can only become a task for a business IN that town; anywhere else it
     becomes a prompt to go and find the local equivalent.

     WHY THIS IS NOT THE BANNED `trade` FIELD, which is a distinction worth being precise about:
     a `trade` field would answer "which hosts matter for plumbers" — the question the evidence
     layer exists to answer from citations, which is why hardcoding it is forbidden. `townOnly`
     answers "what IS this host", exactly like `kind`, `actor` and `signupUrl`: a property of the
     site that you can only learn by looking at it and that no amount of citation data can reveal.
     It never decides which hosts surface — citations still do that, unchanged. It only constrains
     a host the evidence has ALREADY surfaced.

     THE BUG THIS FIXES. loughborough.org.uk is cited across 10 plumber audits, so the trade
     derivation offered it to Macca-Gas Ltd — who are in KETTERING. You cannot list a Kettering
     business on Loughborough's local directory. Correct behaviour for Checkatrade, wrong for a
     town portal, and the evidence alone cannot tell the two apart.
     ══════════════════════════════════════════════════════════════════════════ */
  townOnly?: string;
  notes?: string;
}

export const DIRECTORY_FACTS: DirectoryFact[] = [
  {
    host: 'checkatrade.com', label: 'Checkatrade',
    // /join-us redirects to a LOGIN page. join.checkatrade.com is the actual trade join page.
    signupUrl: 'https://join.checkatrade.com/', urlVerified: true, kind: 'directory',
    actor: 'client-only', cost: 'membership',
    blockedReason: 'Paid 12-month membership plus identity vetting — photo ID, selfie, address confirmation and a CCJ check. Confirmed by the operator, not inferrable from the site.',
    /* CLIENT-ONLY, so these are instructions for the CLIENT PACK, not for the operator's hour.
       Written as what the client will be asked for, because the value of listing them is that the
       client can gather the documents before they start rather than abandoning it half way. */
    steps: [
      'THE CLIENT MUST DO THIS ONE — we cannot, and should not try. Everything below goes in the client pack.',
      'They start at the join URL below and choose their trade category.',
      'They will be asked for photo ID and a selfie to match it, so tell them to have a passport or driving licence to hand.',
      'They will be asked to confirm their address, and a credit/CCJ check is run as part of vetting.',
      'It is a PAID 12-month membership. Do not imply to the client that it is free, and do not commit them to the cost.',
      'Once they are live, ask them for the listing URL so it can be recorded against this business.',
    ],
    clientParagraph: `When someone asks ChatGPT or Gemini for a {trade} in {town}, the answer is very often built from Checkatrade. Across the businesses we have measured it came up more than any other source, by a wide margin.

We cannot sign you up, and we would not want to. Checkatrade verifies that you are who you say you are — photo ID, a selfie, your address and a credit check — and it is a paid annual membership. That verification is exactly why AI tools lean on it, so a listing someone else created on your behalf would be worth less even if it were possible.

What we need from you: apply at checkatrade.com, budget for the annual membership, and have your ID and any accreditations to hand. It usually takes a couple of weeks to come through.

What we will do once you are on: make sure the listing says the same thing as everywhere else — same business name, same trade wording, same phone number, same area covered — because consistency across sources is the part we can control.

We are not going to tell you this guarantees you will be named. We are telling you it is the source these tools read most often, you are not on it, and we cannot put you there.`,
  },
  {
    host: 'yell.com', label: 'Yell',
    signupUrl: 'https://www.yell.com/free-listing/', urlVerified: true, kind: 'directory',
    actor: 'operator-start', cost: 'free',
    notes: 'A free basic listing exists. Ownership verification normally sends a code to the business, so the client has to finish it.',
    steps: [
      'Open the free-listing URL below. It is the FREE listing form — do not follow any "advertise with us" upsell, which is a paid product.',
      'Paste the business name, trade, town, phone and address from the field list below, exactly as written. Same wording everywhere is the whole point.',
      'Set the category to the trade word from the field list, not a broader one. "Plumber" beats "Home services".',
      'Add the website if there is one. Leave it blank rather than putting a Facebook page in the website box.',
      'Submit. STOP HERE — the ownership check sends a code to the business, so you cannot finish it. Add it to the client pack with the code recipient named.',
    ],
  },
  {
    host: 'mybuilder.com', label: 'MyBuilder',
    // Was /tradesmen/join, which is wrong.
    signupUrl: 'https://www.mybuilder.com/tradesperson/register', urlVerified: true, kind: 'directory',
    actor: 'client-only', cost: 'pay-per-lead',
    blockedReason: 'Pay-per-lead. Signing a business up commits them to spending money per enquiry — their commercial decision, not ours.',
    steps: [
      'THE CLIENT MUST DO THIS ONE. Registering is free, but responding to an enquiry costs them money, so the decision is theirs to make.',
      'They register at the URL below as a tradesperson and pick their trade and working radius.',
      'Explain the model plainly before they sign up: the listing costs nothing, each lead they choose to answer is charged.',
      'They control their own spend from there — do not set a budget on their behalf.',
      'Once live, ask them for the profile URL so it can be recorded against this business.',
    ],
    clientParagraph: `MyBuilder is the third most common source we see for {trade} work. It is a pay-per-lead site: listing is free but you pay for each enquiry you choose to respond to.

That makes it your decision rather than ours — we are not going to commit you to a per-lead cost. If you already use it, tell us and we will make sure the details match your other listings. If you do not, it is worth a look, but we would not push you onto it.`,
  },
  {
    host: 'trustatrader.com', label: 'TrustATrader',
    signupUrl: 'https://www.trustatrader.com/join-us', urlVerified: false, kind: 'directory',
    actor: 'client-only', cost: 'membership',
    blockedReason: 'Paid membership with vetting, same model as Checkatrade.',
    notes: 'URL unchecked — the site was down when the operator looked (2026-07-29). Client-only, so it appears in the client pack rather than as a link we click.',
    clientParagraph: `TrustATrader works the same way as Checkatrade — a paid membership with checks on who you are. We see it far less often than Checkatrade, so if you are only going to do one, do Checkatrade first.

Only you can apply. If you are already a member, let us know and we will line the details up with everywhere else.`,
  },
  {
    host: 'trustedtraders.which.co.uk', label: 'Which? Trusted Traders',
    signupUrl: 'https://trustedtraders.which.co.uk/businesses/', urlVerified: false, kind: 'directory',
    actor: 'client-only', cost: 'membership',
    blockedReason: 'Paid, with an assessment. Only the business can apply.',
    clientParagraph: `Which? Trusted Traders is a paid scheme with an assessment. We only see it cited by Gemini, and less often than the others — so treat it as a later step, not a first one.

Only you can apply.`,
  },
  {
    host: '192.com', label: '192.com', signupUrl: 'https://secure.192.com/registration/', urlVerified: true,
    /* Researched: confirmed UK business directory; a registered user can add details to business
       listings, so this is operator-actionable start to finish. URL previously verified by hand. */
    kind: 'directory', actor: 'operator', cost: 'free',
    notes: 'Registered users can add details to business listings. Free.',
    steps: [
      'Register a user account at the URL below if there is not one already, then search 192.com for the business name and town first — a stub listing often already exists.',
      'If a listing exists, add the missing details to it rather than creating a duplicate. Two half-listings are worse than one complete one.',
      'If nothing exists, add the business and paste the name, trade, town, phone and address from the field list below.',
      'Save. This one completes start to finish without the client — no code is sent.',
    ],
  },
  {
    host: 'cylex-uk.co.uk', label: 'Cylex UK',
    signupUrl: 'https://www.cylex-uk.co.uk/addcompany.html', urlVerified: false, kind: 'directory',
    actor: 'operator', cost: 'free',
    /* ⚠️ THE ONLY UNVERIFIED URL ON THE OPERATOR'S OWN DOABLE LIST. Everything else still unverified
       is client-only, so it is never a link clicked mid-task — this one is. Check the path before
       relying on it; if it is wrong you lose time inside the hour rather than in the client pack. */
    notes: '⚠ URL UNVERIFIED and this one is on YOUR list — check it before you rely on it. Free listing, appears on town subdomains. Verification method also unconfirmed.',
    steps: [
      'CHECK THE URL FIRST. This is the only unverified link on the operator\'s own list — if the path has moved, find the "add company" page from the Cylex UK homepage before spending any more time.',
      'Add the company and paste the name, trade, town, phone and address from the field list below.',
      'Pick the town subdomain matching the business\'s town if it offers one.',
      'Save, then note whether a confirmation email or code was required — that step is unconfirmed in our notes, so record what actually happened.',
    ],
  },
  {
    host: 'icaew.com', label: 'ICAEW — Find a Chartered Accountant',
    signupUrl: 'https://find.icaew.com/', urlVerified: false, kind: 'directory',
    actor: 'client-only', cost: 'membership',
    blockedReason: 'Only ICAEW member firms are listed. Cannot be added by us, and cannot be added at all unless the practice is a member.',
    clientParagraph: `ICAEW's "Find a Chartered Accountant" directory comes up when AI tools are asked about accountants, and it is the only accountancy-specific source we see with any regularity.

It only lists ICAEW member firms, so this one depends entirely on whether you are a member. If you are, check your entry is present and correct — that is a five-minute job and we cannot do it for you. If you are not an ICAEW firm, this route is closed and there is no way around it.`,
  },
  {
    host: 'unbiased.co.uk', label: 'Unbiased',
    signupUrl: 'https://www.unbiased.co.uk/', urlVerified: false, kind: 'directory',
    actor: 'client-only', cost: 'paid',
    blockedReason: 'Paid adviser subscription. Inferred from how the site works, not confirmed — check before relying on it.',
    clientParagraph: `Unbiased is the one accountancy listing we see cited by BOTH ChatGPT and Gemini, which is unusual and makes it more interesting than its small numbers suggest.

It is a paid subscription for advisers, so it is your call and your signup. We would look at this second, after Yell.`,
  },
  {
    host: 'bark.com', label: 'Bark',
    signupUrl: 'https://www.bark.com/', urlVerified: false, kind: 'directory',
    actor: 'client-only', cost: 'pay-per-lead',
    blockedReason: 'Free to register but leads are paid for — a commercial commitment only the business should make.',
    clientParagraph: `Bark appears occasionally. Registering is free but you pay for leads, so it is your decision. We would not put it near the top of the list.`,
  },
  {
    host: 'thomsonlocal.com', label: 'Thomson Local',
    signupUrl: 'https://www.thomsonlocal.com/', urlVerified: false, kind: 'directory',
    actor: 'operator', cost: 'free',
    notes: 'Barely appears in our data — 3 citations. Listed for completeness only.',
    steps: [
      'LOWEST PRIORITY ON THE SHEET — 3 citations in all our data. Do the higher-cited ones first and only come back to this if the hour is not used up.',
      'The URL below is the homepage, not a verified signup path: find the "add your business" link from there.',
      'Paste the name, trade, town, phone and address from the field list below.',
      'Save. If it demands a phone or email confirmation, stop and note it rather than chasing it — this one is not worth a callback.',
    ],
  },
  {
    host: 'yelp.com', label: 'Yelp',
    signupUrl: 'https://biz.yelp.co.uk/', urlVerified: false, kind: 'directory',
    actor: 'operator-start', cost: 'free',
    notes: 'Business owner normally claims the page. Barely appears in our data.',
    steps: [
      'Search Yelp for the business and town first — Yelp auto-creates pages, so one may already exist and need claiming rather than adding.',
      'If a page exists, start the claim from it. If not, add the business from the URL below.',
      'Paste the name, trade, town, phone and address from the field list below.',
      'STOP BEFORE THE FINAL CLAIM — Yelp verifies the owner by phone call or code to the business, so the client finishes this. Add it to the client pack.',
    ],
  },
  {
    host: 'uk.trustpilot.com', label: 'Trustpilot',
    signupUrl: 'https://uk.business.trustpilot.com/', urlVerified: false, kind: 'directory',
    actor: 'client-only', cost: 'free',
    blockedReason: 'The business claims its own profile and invites reviews. Nothing useful we can do on their behalf.',
    clientParagraph: `Trustpilot shows up rarely in what we measure, so this is optional. If you already collect reviews there, keep doing it; we would not start it just for AI visibility.`,
  },
  {
    host: 'threebestrated.co.uk', label: 'Three Best Rated',
    signupUrl: 'https://threebestrated.co.uk/', urlVerified: false, kind: 'directory',
    actor: 'client-only', cost: 'n/a',
    blockedReason: 'Editorially selected — you cannot apply to be listed.',
    clientParagraph: `Three Best Rated picks businesses itself; there is no way to apply. Mentioned only so you know we looked at it.`,
  },
  {
    host: 'ratedpeople.com', label: 'Rated People',
    signupUrl: 'https://www.ratedpeople.com/', urlVerified: false, kind: 'directory',
    actor: 'client-only', cost: 'pay-per-lead',
    blockedReason: 'Pay-per-lead — the business decides.',
    clientParagraph: `Rated People is another pay-per-lead site. Rare in our data. Your call, low priority.`,
  },
  // ── NOT LISTINGS. Present so nothing tries to turn them into a task. ─────────────────
  {
    host: 'find-and-update.company-information.service.gov.uk', label: 'Companies House',
    signupUrl: 'https://find-and-update.company-information.service.gov.uk/', urlVerified: false, kind: 'register',
    actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'A statutory register, not a directory — you are on it automatically. Appeared in only ONE audit despite 32 citations, so it is one business cited repeatedly, not a pattern. Deliberately never a task.',
  },
  {
    host: 'findanifa.org', label: 'Find an IFA',
    signupUrl: 'https://www.findanifa.org/', urlVerified: false, kind: 'directory',
    actor: 'client-only', cost: 'membership', notAListing: true,
    notes: 'IFA register — wrong profession for an accountancy practice, and seen in only ONE audit. Excluded from tasks.',
  },
  {
    host: 'gov.uk', label: 'GOV.UK',
    signupUrl: '', urlVerified: false, kind: 'register', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'Government guidance. The single biggest source for accountancy questions, and nothing anyone can act on — its presence means the QUESTION was about tax rules rather than hiring someone.',
  },

  /* ────────────────────────────────────────────────────────────────────────────
     ADDED FROM THE FIRST FULL DERIVATION RUN. Every signupUrl below is UNVERIFIED —
     nobody has clicked one. `actor` and `cost` are a best read of each site's model and are
     flagged in `notes` where inferred; treat both as provisional until checked.

     Presence here is NOT a recommendation. It says "if this host shows up in citations, here is
     what it is". Whether it shows up, and for which trade, is the evidence layer's call. */

  // ── plumbing-side gaps (biggest first by audit breadth) ──
  {
    host: 'hamuch.com', label: 'Hamuch', signupUrl: 'https://www.hamuch.com/', urlVerified: false,
    /* Researched: UK trades directory built around pricing and quotes. Free profile, services and
       areas listed, links back to the business's own site. 18 of 58 plumber audits — the largest
       actionable gap in the evidence. Nature confirmed; the signup URL itself is still unclicked. */
    kind: 'directory', actor: 'operator', cost: 'free',
    notes: 'Free profile: list services and areas served, link back to their own site. Cited in 18 of 58 plumber audits.',
  },
  {
    host: 'myjobquote.co.uk', label: 'MyJobQuote', signupUrl: 'https://www.myjobquote.co.uk/tradesmen', urlVerified: false,
    kind: 'directory', actor: 'client-only', cost: 'pay-per-lead',
    blockedReason: 'Pay-per-lead: the business buys each enquiry, so only they can agree to the spend.',
    notes: 'Lead-generation rather than a listing. Model INFERRED from the sector norm.',
  },
  {
    host: 'top5trades.co.uk', label: 'Top5Trades', signupUrl: 'https://top5trades.co.uk/', urlVerified: false,
    kind: 'directory', actor: 'operator', cost: 'free', notes: 'Free/operator-actionable INFERRED.',
  },
  {
    host: 'ratingsnearme.com', label: 'Ratings Near Me', signupUrl: 'https://ratingsnearme.com/', urlVerified: false,
    kind: 'aggregator', actor: 'operator-start', cost: 'free',
    notes: 'Appears to auto-generate profiles from public data; claiming may be the only action. INFERRED.',
  },
  {
    host: 'angi.com', label: 'Angi', signupUrl: 'https://www.angi.com/', urlVerified: false,
    kind: 'directory', actor: 'client-only', cost: 'paid',
    blockedReason: 'US-run, paid pro membership with identity checks. UK coverage is thin.',
    notes: 'Only 6 citations across 3 audits — low priority even if it becomes actionable.',
  },
  {
    host: 'local-quotes.co.uk', label: 'Local Quotes', signupUrl: 'https://www.local-quotes.co.uk/', urlVerified: false,
    kind: 'directory', actor: 'client-only', cost: 'pay-per-lead',
    blockedReason: 'Lead-buying model — the business pays per enquiry.',
    notes: '16 citations but from ONE audit. Breadth, not volume: treat as noise until it recurs.',
  },
  {
    host: 'trustmark.org.uk', label: 'TrustMark', signupUrl: 'https://www.trustmark.org.uk/tradespeople', urlVerified: false,
    kind: 'trade-body', actor: 'client-only', cost: 'membership',
    blockedReason: 'Government-endorsed scheme: registration runs through an approved scheme provider and requires the business\'s own insurance and workmanship evidence.',
  },

  // ── accountancy-side gaps ──
  {
    host: 'handpickedaccountants.co.uk', label: 'Handpicked Accountants', signupUrl: 'https://www.handpickedaccountants.co.uk/', urlVerified: false,
    /* Researched: run by Begbies Traynor, 1,000+ UK accountants, with a "for accountants" signup.
       Firms APPLY and acceptance is not guaranteed, so this is operator-start rather than operator —
       we can submit, but being accepted is out of our hands. 5 of 12 accountant audits. */
    kind: 'directory', actor: 'operator-start', cost: 'free',
    notes: 'CURATED — we apply rather than simply list, and acceptance is not guaranteed. Run by Begbies Traynor.',
  },
  {
    host: 'legaldirectorate.co.uk', label: 'Legal Directorate', signupUrl: 'https://www.legaldirectorate.co.uk/', urlVerified: false,
    kind: 'directory', actor: 'operator', cost: 'free', notes: 'Free/operator-actionable INFERRED.',
  },
  {
    host: 'vouchedfor.co.uk', label: 'VouchedFor', signupUrl: 'https://www.vouchedfor.co.uk/', urlVerified: false,
    kind: 'directory', actor: 'client-only', cost: 'paid',
    blockedReason: 'Paid subscription, and reviews are collected from the firm\'s own verified clients — only the firm can sign up and run that.',
    notes: 'Researched: a genuine accountant and adviser directory. Paid model CONFIRMED as likely, subscription tier unchecked.',
  },
  {
    host: 'companiesup.co.uk', label: 'CompaniesUp', signupUrl: '', urlVerified: false,
    kind: 'aggregator', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'Mirrors Companies House data automatically. Nothing to join — the entry exists so it is never mistaken for a task.',
  },
  {
    host: 'accountantsup.co.uk', label: 'AccountantsUp', signupUrl: '', urlVerified: false,
    kind: 'aggregator', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'Same auto-generated pattern as CompaniesUp. INFERRED.',
  },
  {
    host: 'accountingfirms.co.uk', label: 'AccountingFirms', signupUrl: 'https://www.accountingfirms.co.uk/', urlVerified: false,
    kind: 'directory', actor: 'operator-start', cost: 'free', notes: 'Free listing with owner confirmation INFERRED.',
  },
  {
    host: 'clutch.co', label: 'Clutch', signupUrl: 'https://clutch.co/', urlVerified: false,
    kind: 'directory', actor: 'operator-start', cost: 'free',
    notes: 'B2B directory. Free profile; reviews are collected from clients directly, which only the business can arrange.',
  },
  {
    host: 'uk.linkedin.com', label: 'LinkedIn company page', signupUrl: 'https://www.linkedin.com/company/setup/new/', urlVerified: false,
    kind: 'directory', actor: 'operator-start', cost: 'free',
    notes: 'A company page needs an admin with a personal LinkedIn account, so the business must at minimum grant access.',
  },

  // ── electrical / locksmith ──
  {
    host: 'electricalsafetyfirst.org.uk', label: 'Electrical Safety First', signupUrl: 'https://www.electricalsafetyfirst.org.uk/', urlVerified: false,
    kind: 'trade-body', actor: 'client-only', cost: 'membership',
    blockedReason: 'Charity that lists registered competent-person-scheme electricians. Listing follows registration, which the business must hold.',
  },
  {
    host: 'locksmiths.co.uk', label: 'Locksmiths.co.uk', signupUrl: 'https://www.locksmiths.co.uk/', urlVerified: false,
    kind: 'directory', actor: 'operator', cost: 'free', notes: 'Free/operator-actionable INFERRED.',
  },
  {
    host: 'erahomesecurity.com', label: 'ERA approved installer', signupUrl: 'https://www.erahomesecurity.com/', urlVerified: false,
    kind: 'trade-body', actor: 'client-only', cost: 'membership',
    blockedReason: 'A lock manufacturer\'s approved-installer network — the business must be accepted as an installer.',
    notes: 'Cited in 5 of 5 locksmith audits. High breadth, entirely client-gated.',
  },

  // ── hospitality. ENTRIES ONLY. One audit is not a trade profile; whether any of
  //    these are recommended is the evidence layer\'s call, gated on audit count. ──
  {
    host: 'tripadvisor.com', label: 'Tripadvisor', signupUrl: 'https://www.tripadvisor.com/Owners', urlVerified: false,
    kind: 'directory', actor: 'operator-start', cost: 'free',
    notes: 'Free to claim; claiming requires an email at the venue\'s domain or a postcard, so the client is needed to finish.',
  },
  {
    host: 'wanderlog.com', label: 'Wanderlog', signupUrl: 'https://wanderlog.com/', urlVerified: false,
    kind: 'aggregator', actor: 'operator-start', cost: 'free',
    notes: 'Trip-planning app that pulls places from other sources. Whether a business can add or claim itself is UNCHECKED.',
  },
  {
    host: 'discoverkava.com', label: 'Discover Kava (coffee app)', signupUrl: '', urlVerified: false,
    /* CORRECTED. Previously classified directory/operator on the assumption that 26 citations in the
       kava audit meant a kava-venue directory. It is not one: it is a EUROPEAN SPECIALTY-COFFEE
       rating app, and AI cites it for "kava" because the brand name collides with the drink.
       A textbook reason the data cannot classify itself — it could say the host was cited, never
       what it is. actor is client-only + notAListing so it can never become a task. */
    kind: 'aggregator', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'NOT a kava directory. European specialty-coffee rating app; the brand name collides with the drink, which is why it is cited. Never a task.',
  },
  {
    host: 'restaurantguru.com', label: 'Restaurant Guru', signupUrl: 'https://restaurantguru.com/', urlVerified: false,
    kind: 'aggregator', actor: 'operator-start', cost: 'free', notes: 'Auto-generated profiles, claimable. INFERRED.',
  },
  {
    host: 'wongnai.com', label: 'Wongnai', signupUrl: 'https://www.wongnai.com/', urlVerified: false,
    kind: 'directory', actor: 'operator-start', cost: 'free', notes: 'Thai review platform. Claim process UNCHECKED.',
  },
  {
    host: 'cnxlocal.com', label: 'CNX Local', signupUrl: 'https://cnxlocal.com/', urlVerified: false,
    /* TOWN-SPECIFIC, the second of only two in this file. CNX is Chiang Mai's airport code and the
       site is a Chiang Mai listing site, so it is no more joinable from another city than
       Loughborough's portal is from Kettering. Flagged before it could bite. */
    kind: 'directory', actor: 'operator', cost: 'free', townOnly: 'Chiang Mai',
    notes: 'Chiang Mai local listing site. Everything INFERRED.',
  },
  {
    host: 'timeout.com', label: 'Time Out', signupUrl: '', urlVerified: false,
    kind: 'editorial', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'Editorial. You cannot list yourself — coverage is earned or pitched. Never a task.',
  },
  {
    host: 'facebook.com', label: 'Facebook Page', signupUrl: 'https://www.facebook.com/pages/create', urlVerified: false,
    kind: 'directory', actor: 'operator-start', cost: 'free',
    notes: 'A Page needs a personal account to administer it, so the business must own or delegate it.',
  },

  // ── community ──
  {
    host: 'reddit.com', label: 'Reddit', signupUrl: '', urlVerified: false,
    kind: 'community', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'NEVER A CLIENT TASK. Cited for plumbers (7 audits) and accountants (4), so it matters — but posting on behalf of a client is astroturfing, and Reddit punishes it. The operator posts only as himself, about his own business. Present here so it is classified rather than silently dropped.',
  },

  /* ────────────────────────────────────────────────────────────────────────────
     CLASSIFIED AFTER RESEARCH. These are NOT directories, so they can never be tasks. They are here
     purely so whoIsWinning labels them properly instead of showing 'unclassified'. */
  {
    host: 'draindoctor.co.uk', label: 'Drain Doctor', signupUrl: '', urlVerified: false,
    kind: 'own-site', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'National plumbing/drainage franchise, ~80 locations, owned by Neighborly. A competitor, not a listing.',
  },
  {
    host: 'rotorooter.com', label: 'Roto-Rooter', signupUrl: '', urlVerified: false,
    kind: 'own-site', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'US brand in the same franchise group as Drain Doctor. Intelligence only.',
  },
  {
    host: 'aspect.co.uk', label: 'Aspect', signupUrl: '', urlVerified: false,
    kind: 'own-site', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'National London property-services firm. A competitor, not a listing.',
  },
  {
    host: 'theguardian.com', label: 'The Guardian', signupUrl: '', urlVerified: false,
    /* EDITORIAL, not own-site. The own-site heuristic flagged it only because the string matched
       "guardian" — a good reminder that name-matching is a time-saver, not a classifier. */
    kind: 'editorial', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'National press. Coverage is earned or pitched, never listed. Cited in 5 of 5 locksmith audits.',
  },
  {
    host: 'accaglobal.com', label: 'ACCA member firm directory', signupUrl: 'https://www.accaglobal.com/', urlVerified: false,
    /* NOT PRESENT IN ANY CITATION DATA. Added because ABLM are ACCA members and the listing is free,
       so it is a free bet — NOT an evidenced lever. The evidence layer will never surface it until
       it actually appears in citations, which is the correct behaviour: this entry only says what it
       is, never that it matters. */
    kind: 'trade-body', actor: 'operator-start', cost: 'free',
    notes: 'DOES NOT APPEAR IN CITATION DATA — a free bet, not an evidenced lever. Free for member firms; the firm must hold ACCA membership, so they confirm.',
  },

  {
    host: 'loughborough.org.uk', label: 'Loughborough town portal', signupUrl: 'https://www.loughborough.org.uk/', urlVerified: false,
    /* A TOWN PORTAL, not a trades directory: "a Loughborough business directory including legal,
       financial and local services". Cited in 10 of 58 plumber audits. See the note at the top of
       this file — there is probably an equivalent for every town a client operates in, and this one
       surfaced only because the derivation reads real citations. */
    kind: 'directory', actor: 'operator', cost: 'free', townOnly: 'Loughborough',
    notes: 'TOWN PORTAL with a local business directory. Check for an equivalent in every client town.',
  },
  {
    host: 'moneyweek.com', label: 'MoneyWeek', signupUrl: '', urlVerified: false,
    kind: 'editorial', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'Personal-finance magazine. Coverage is earned, never listed.',
  },
  {
    host: 'fenpropertyservices.uk', label: 'fenpropertyservices.uk', signupUrl: '', urlVerified: false,
    kind: 'own-site', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'Classified as a single firm BY NAME PATTERN, not by visiting the site. If it turns out to be a directory the cost is nil — unknown hosts already route to whoIsWinning either way.',
  },
  {
    host: 'owardillservices.co.uk', label: 'owardillservices.co.uk', signupUrl: '', urlVerified: false,
    kind: 'own-site', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'Classified as a single firm BY NAME PATTERN, not by visiting the site. If it turns out to be a directory the cost is nil — unknown hosts already route to whoIsWinning either way.',
  },
  {
    host: 'normz.co.uk', label: 'normz.co.uk', signupUrl: '', urlVerified: false,
    kind: 'own-site', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'Classified as a single firm BY NAME PATTERN, not by visiting the site. If it turns out to be a directory the cost is nil — unknown hosts already route to whoIsWinning either way.',
  },
  {
    host: 'watertightpe.co.uk', label: 'watertightpe.co.uk', signupUrl: '', urlVerified: false,
    kind: 'own-site', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'Classified as a single firm BY NAME PATTERN, not by visiting the site. If it turns out to be a directory the cost is nil — unknown hosts already route to whoIsWinning either way.',
  },
  {
    host: 'no1phd.co.uk', label: 'no1phd.co.uk', signupUrl: '', urlVerified: false,
    kind: 'own-site', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'Classified as a single firm BY NAME PATTERN, not by visiting the site. If it turns out to be a directory the cost is nil — unknown hosts already route to whoIsWinning either way.',
  },
  {
    host: 'rkm247.co.uk', label: 'rkm247.co.uk', signupUrl: '', urlVerified: false,
    kind: 'own-site', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'Classified as a single firm BY NAME PATTERN, not by visiting the site. If it turns out to be a directory the cost is nil — unknown hosts already route to whoIsWinning either way.',
  },
  {
    host: 'jnsjetting.com', label: 'jnsjetting.com', signupUrl: '', urlVerified: false,
    kind: 'own-site', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'Classified as a single firm BY NAME PATTERN, not by visiting the site. If it turns out to be a directory the cost is nil — unknown hosts already route to whoIsWinning either way.',
  },
  {
    host: 'rjhitchcock.co.uk', label: 'rjhitchcock.co.uk', signupUrl: '', urlVerified: false,
    kind: 'own-site', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'Classified as a single firm BY NAME PATTERN, not by visiting the site. If it turns out to be a directory the cost is nil — unknown hosts already route to whoIsWinning either way.',
  },
  {
    host: 'midlandscoolingservices.co.uk', label: 'midlandscoolingservices.co.uk', signupUrl: '', urlVerified: false,
    kind: 'own-site', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'Classified as a single firm BY NAME PATTERN, not by visiting the site. If it turns out to be a directory the cost is nil — unknown hosts already route to whoIsWinning either way.',
  },
  {
    host: 'shearsphg.com', label: 'shearsphg.com', signupUrl: '', urlVerified: false,
    kind: 'own-site', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'Classified as a single firm BY NAME PATTERN, not by visiting the site. If it turns out to be a directory the cost is nil — unknown hosts already route to whoIsWinning either way.',
  },
  {
    host: 'tjgelec.co.uk', label: 'tjgelec.co.uk', signupUrl: '', urlVerified: false,
    kind: 'own-site', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'Classified as a single firm BY NAME PATTERN, not by visiting the site. If it turns out to be a directory the cost is nil — unknown hosts already route to whoIsWinning either way.',
  },
  {
    host: 'hsmps.co.uk', label: 'hsmps.co.uk', signupUrl: '', urlVerified: false,
    kind: 'own-site', actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'Classified as a single firm BY NAME PATTERN, not by visiting the site. If it turns out to be a directory the cost is nil — unknown hosts already route to whoIsWinning either way.',
  },
];

export const factFor = (host: string): DirectoryFact | undefined =>
  DIRECTORY_FACTS.find((f) => f.host === host);
