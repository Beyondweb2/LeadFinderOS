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
  actor: Actor;
  cost: 'free' | 'paid' | 'pay-per-lead' | 'membership' | 'n/a';
  /** Shown to the operator so they never waste time attempting a blocked one. */
  blockedReason?: string;
  /** Hand-written client-facing paragraph. Only needed for client-only sources. */
  clientParagraph?: string;
  /** Not a listing you can join (e.g. a statutory register) — never appears as a task. */
  notAListing?: boolean;
  notes?: string;
}

export const DIRECTORY_FACTS: DirectoryFact[] = [
  {
    host: 'checkatrade.com', label: 'Checkatrade',
    // /join-us redirects to a LOGIN page. join.checkatrade.com is the actual trade join page.
    signupUrl: 'https://join.checkatrade.com/', urlVerified: true,
    actor: 'client-only', cost: 'membership',
    blockedReason: 'Paid 12-month membership plus identity vetting — photo ID, selfie, address confirmation and a CCJ check. Confirmed by the operator, not inferrable from the site.',
    clientParagraph: `When someone asks ChatGPT or Gemini for a {trade} in {town}, the answer is very often built from Checkatrade. Across the businesses we have measured it came up more than any other source, by a wide margin.

We cannot sign you up, and we would not want to. Checkatrade verifies that you are who you say you are — photo ID, a selfie, your address and a credit check — and it is a paid annual membership. That verification is exactly why AI tools lean on it, so a listing someone else created on your behalf would be worth less even if it were possible.

What we need from you: apply at checkatrade.com, budget for the annual membership, and have your ID and any accreditations to hand. It usually takes a couple of weeks to come through.

What we will do once you are on: make sure the listing says the same thing as everywhere else — same business name, same trade wording, same phone number, same area covered — because consistency across sources is the part we can control.

We are not going to tell you this guarantees you will be named. We are telling you it is the source these tools read most often, you are not on it, and we cannot put you there.`,
  },
  {
    host: 'yell.com', label: 'Yell',
    signupUrl: 'https://www.yell.com/free-listing/', urlVerified: true,
    actor: 'operator-start', cost: 'free',
    notes: 'A free basic listing exists. Ownership verification normally sends a code to the business, so the client has to finish it.',
  },
  {
    host: 'mybuilder.com', label: 'MyBuilder',
    // Was /tradesmen/join, which is wrong.
    signupUrl: 'https://www.mybuilder.com/tradesperson/register', urlVerified: true,
    actor: 'client-only', cost: 'pay-per-lead',
    blockedReason: 'Pay-per-lead. Signing a business up commits them to spending money per enquiry — their commercial decision, not ours.',
    clientParagraph: `MyBuilder is the third most common source we see for {trade} work. It is a pay-per-lead site: listing is free but you pay for each enquiry you choose to respond to.

That makes it your decision rather than ours — we are not going to commit you to a per-lead cost. If you already use it, tell us and we will make sure the details match your other listings. If you do not, it is worth a look, but we would not push you onto it.`,
  },
  {
    host: 'trustatrader.com', label: 'TrustATrader',
    signupUrl: 'https://www.trustatrader.com/join-us', urlVerified: false,
    actor: 'client-only', cost: 'membership',
    blockedReason: 'Paid membership with vetting, same model as Checkatrade.',
    notes: 'URL unchecked — the site was down when the operator looked (2026-07-29). Client-only, so it appears in the client pack rather than as a link we click.',
    clientParagraph: `TrustATrader works the same way as Checkatrade — a paid membership with checks on who you are. We see it far less often than Checkatrade, so if you are only going to do one, do Checkatrade first.

Only you can apply. If you are already a member, let us know and we will line the details up with everywhere else.`,
  },
  {
    host: 'trustedtraders.which.co.uk', label: 'Which? Trusted Traders',
    signupUrl: 'https://trustedtraders.which.co.uk/businesses/', urlVerified: false,
    actor: 'client-only', cost: 'membership',
    blockedReason: 'Paid, with an assessment. Only the business can apply.',
    clientParagraph: `Which? Trusted Traders is a paid scheme with an assessment. We only see it cited by Gemini, and less often than the others — so treat it as a later step, not a first one.

Only you can apply.`,
  },
  {
    host: '192.com', label: '192.com',
    // Was www.192.com/addbusiness/, which is wrong — registration lives on the secure subdomain.
    signupUrl: 'https://secure.192.com/registration/', urlVerified: true,
    actor: 'operator', cost: 'free',
    notes: 'Free listing, URL confirmed. Whether it verifies ownership is still unconfirmed — if it does, this becomes operator-start.',
  },
  {
    host: 'cylex-uk.co.uk', label: 'Cylex UK',
    signupUrl: 'https://www.cylex-uk.co.uk/addcompany.html', urlVerified: false,
    actor: 'operator', cost: 'free',
    /* ⚠️ THE ONLY UNVERIFIED URL ON THE OPERATOR'S OWN DOABLE LIST. Everything else still unverified
       is client-only, so it is never a link clicked mid-task — this one is. Check the path before
       relying on it; if it is wrong you lose time inside the hour rather than in the client pack. */
    notes: '⚠ URL UNVERIFIED and this one is on YOUR list — check it before you rely on it. Free listing, appears on town subdomains. Verification method also unconfirmed.',
  },
  {
    host: 'icaew.com', label: 'ICAEW — Find a Chartered Accountant',
    signupUrl: 'https://find.icaew.com/', urlVerified: false,
    actor: 'client-only', cost: 'membership',
    blockedReason: 'Only ICAEW member firms are listed. Cannot be added by us, and cannot be added at all unless the practice is a member.',
    clientParagraph: `ICAEW's "Find a Chartered Accountant" directory comes up when AI tools are asked about accountants, and it is the only accountancy-specific source we see with any regularity.

It only lists ICAEW member firms, so this one depends entirely on whether you are a member. If you are, check your entry is present and correct — that is a five-minute job and we cannot do it for you. If you are not an ICAEW firm, this route is closed and there is no way around it.`,
  },
  {
    host: 'unbiased.co.uk', label: 'Unbiased',
    signupUrl: 'https://www.unbiased.co.uk/', urlVerified: false,
    actor: 'client-only', cost: 'paid',
    blockedReason: 'Paid adviser subscription. Inferred from how the site works, not confirmed — check before relying on it.',
    clientParagraph: `Unbiased is the one accountancy listing we see cited by BOTH ChatGPT and Gemini, which is unusual and makes it more interesting than its small numbers suggest.

It is a paid subscription for advisers, so it is your call and your signup. We would look at this second, after Yell.`,
  },
  {
    host: 'bark.com', label: 'Bark',
    signupUrl: 'https://www.bark.com/', urlVerified: false,
    actor: 'client-only', cost: 'pay-per-lead',
    blockedReason: 'Free to register but leads are paid for — a commercial commitment only the business should make.',
    clientParagraph: `Bark appears occasionally. Registering is free but you pay for leads, so it is your decision. We would not put it near the top of the list.`,
  },
  {
    host: 'thomsonlocal.com', label: 'Thomson Local',
    signupUrl: 'https://www.thomsonlocal.com/', urlVerified: false,
    actor: 'operator', cost: 'free',
    notes: 'Barely appears in our data — 3 citations. Listed for completeness only.',
  },
  {
    host: 'yelp.com', label: 'Yelp',
    signupUrl: 'https://biz.yelp.co.uk/', urlVerified: false,
    actor: 'operator-start', cost: 'free',
    notes: 'Business owner normally claims the page. Barely appears in our data.',
  },
  {
    host: 'uk.trustpilot.com', label: 'Trustpilot',
    signupUrl: 'https://uk.business.trustpilot.com/', urlVerified: false,
    actor: 'client-only', cost: 'free',
    blockedReason: 'The business claims its own profile and invites reviews. Nothing useful we can do on their behalf.',
    clientParagraph: `Trustpilot shows up rarely in what we measure, so this is optional. If you already collect reviews there, keep doing it; we would not start it just for AI visibility.`,
  },
  {
    host: 'threebestrated.co.uk', label: 'Three Best Rated',
    signupUrl: 'https://threebestrated.co.uk/', urlVerified: false,
    actor: 'client-only', cost: 'n/a',
    blockedReason: 'Editorially selected — you cannot apply to be listed.',
    clientParagraph: `Three Best Rated picks businesses itself; there is no way to apply. Mentioned only so you know we looked at it.`,
  },
  {
    host: 'ratedpeople.com', label: 'Rated People',
    signupUrl: 'https://www.ratedpeople.com/', urlVerified: false,
    actor: 'client-only', cost: 'pay-per-lead',
    blockedReason: 'Pay-per-lead — the business decides.',
    clientParagraph: `Rated People is another pay-per-lead site. Rare in our data. Your call, low priority.`,
  },
  // ── NOT LISTINGS. Present so nothing tries to turn them into a task. ─────────────────
  {
    host: 'find-and-update.company-information.service.gov.uk', label: 'Companies House',
    signupUrl: 'https://find-and-update.company-information.service.gov.uk/', urlVerified: false,
    actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'A statutory register, not a directory — you are on it automatically. Appeared in only ONE audit despite 32 citations, so it is one business cited repeatedly, not a pattern. Deliberately never a task.',
  },
  {
    host: 'findanifa.org', label: 'Find an IFA',
    signupUrl: 'https://www.findanifa.org/', urlVerified: false,
    actor: 'client-only', cost: 'membership', notAListing: true,
    notes: 'IFA register — wrong profession for an accountancy practice, and seen in only ONE audit. Excluded from tasks.',
  },
  {
    host: 'gov.uk', label: 'GOV.UK',
    signupUrl: '', urlVerified: false, actor: 'client-only', cost: 'n/a', notAListing: true,
    notes: 'Government guidance. The single biggest source for accountancy questions, and nothing anyone can act on — its presence means the QUESTION was about tax rules rather than hiring someone.',
  },
];

export const factFor = (host: string): DirectoryFact | undefined =>
  DIRECTORY_FACTS.find((f) => f.host === host);
