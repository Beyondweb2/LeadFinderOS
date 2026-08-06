/* ============================================================
   WHAT WE ASK A PAYING CLIENT FOR — the delivery we actually run.

   ⛔ THIS FILE REPLACED A DIRECTORY SIGNUP LIST. The old Step two was derived from the citation
   evidence and asked the client to join Checkatrade, Yell and MyBuilder. We do not do directory
   work: the measurement says a listing does not get you named (ABLM sat on Yell's Wisbech page and
   was named zero times in 80 measurements). Asking a client to spend money and time on that was
   asking them to do work we do not support.

   WHAT WE DELIVER NOW, and therefore what we need from them:
     · a page for each service they offer, in each town they work
     · their Google Business Profile completed properly
     · their name, address, phone and services consistent everywhere an engine reads them
     · a review link
     · the week-eight re-measurement
   And if their site cannot take pages, we move it to our hosting or send the spec to whoever runs it.

   THE RULE FOR THIS LIST, unchanged from the document it replaces: an ask belongs here ONLY if we
   genuinely cannot do it ourselves — it needs their access, their identity, their property, or their
   decision. Anything we can do, we do. That is what makes the list short enough to be actioned.

   ⛔ THESE ARE FIXED, NOT EVIDENCE-DERIVED. The old asks came out of the per-trade citation fold,
   which is why the document had to be handed a Playbook. These do not vary by trade, so the document
   no longer needs the evidence at all — which also makes the old leak boundary structural rather
   than maintained: there is nothing here that could print a competitor list even by accident.
   ============================================================ */

export type AskCost = 'free' | 'paid' | 'n/a';

export interface DeliveryAsk {
  /** Short imperative label, the thing itself. */
  label: string;
  /** Why we are asking — always the delivery reason, never a vague "so we can help you". */
  why: string;
  /** What they actually have to do. Written for someone who has never heard the jargon. */
  how: string;
  cost: AskCost;
  /** True when the whole engagement stalls without it. Rendered first and marked. */
  blocking?: boolean;
  /** Optional, and the document says so — a blank must never look like a failure. */
  optional?: boolean;
}

/* ⚠️ ORDER IS THE ORDER THEY SHOULD DO THEM IN, and the two blocking ones come first. A client who
   only reads the top of the list must still hit the two that stop the work. */
export const DELIVERY_ASKS: DeliveryAsk[] = [
  {
    /* ⛔ NOTHING IN THIS SYSTEM SENDS THAT INVITE. It is a manual step Paul does in the Google
       Business Profile dashboard, and this sheet tells the client to accept something that does not
       exist until he has. That is fine while the sheet is printed and sent by hand — he sends the
       invite and the sheet in the same breath.
       ⚠️ IT STOPS BEING FINE THE MOMENT THIS SHEET IS SENT AUTOMATICALLY. A client whose first
       instruction is to accept an invite that never arrives will assume we have not started. If this
       document is ever wired to a trigger, the invite has to be sent first — either automate it or
       gate the send on the invite already existing. Do not ship the automation without solving it. */
    label: 'Accept the Google Business Profile invite',
    why:
      'Your Google Business Profile is one of the few things AI reads that you own outright, and it '
      + 'is usually the thickest source of facts about you. We cannot complete it from outside.',
    how:
      'You will get an email from Google saying Findable wants to manage your profile. Accept it. '
      + 'You stay the owner, you never share a password, and you can remove us in two clicks at any '
      + 'time.',
    cost: 'free',
    blocking: true,
  },
  {
    /* ⛔ THE ASK MOST LIKELY TO STOP A DELIVERY DEAD, and it is not the same question as "who can
       change your website". A site login does not move a domain. With small businesses the domain is
       very often registered to whoever built the site years ago, and a migration fails at the DNS
       step with everything else already done.
       OFFERED THE RIGHT WAY ROUND, deliberately: we do it if they hand over access, because most
       owners do not know what a registrar is and "you change your DNS records" is where they stop
       reading. Doing it for them removes the single biggest reason a move stalls. */
    label: 'Tell us who controls your domain name',
    why:
      'If we host your site for you, one setting has to change at whoever your domain is registered '
      + 'with. It is the step that most often holds a move up, and it is nearly always somewhere '
      + 'nobody has logged in to for years.',
    how:
      'Easiest for you: send us the login for wherever the domain was bought (GoDaddy, 123-Reg, '
      + 'Namecheap, or whoever) and we will make the change ourselves. If you would rather not hand '
      + 'that over, no problem — tell us who does have it and we will send them the exact record to '
      + 'change, with screenshots. If you have no idea, say so and we will work it out from the '
      + 'domain itself.',
    cost: 'free',
    blocking: true,
  },
  {
    label: 'Send us photos of real jobs',
    why:
      'Your service pages are competing with directory pages that have none. Photos of your actual '
      + 'work are the one thing on the page that nobody else can produce.',
    how:
      'Whatever is on your phone is fine — a finished job, a van, you at work. Six or eight is '
      + 'plenty. They do not need to be professional; they need to be yours.',
    cost: 'free',
  },
  {
    /* The facts that stop a service page being filler. A generic page is exactly what AI will not
       quote over a directory, which is the whole argument of the product. */
    label: 'Fill in the details for each service',
    why:
      'A page that says what you actually do, where, and roughly what it costs is the kind of thing '
      + 'AI quotes. A page that could describe any firm in the country is not.',
    how:
      'For each service on the list overleaf: what it involves in your own words, how far you will '
      + 'travel for it, whether you do it out of hours, and any guarantee or warranty you give.',
    cost: 'free',
  },
  {
    /* ⚠️ OPTIONAL AND SAID SO, TWICE — in the flag and in the copy. Plenty of trades will not give a
       price and a blank here must never read as a failure, or as something holding the work up. */
    label: 'A “from” price, if you are willing',
    why:
      'A from-price makes a page much more likely to be quoted, because it answers the question the '
      + 'customer actually asked.',
    how:
      'Give one if you can — “boiler service from £90” is enough. Leave it if you would rather not; '
      + 'plenty of trades do not publish prices and it does not hold anything up.',
    cost: 'n/a',
    optional: true,
  },
  {
    /* The one that costs a client rather than embarrassing us. Gas, electrical and accountancy all
       have claims that need the right registration behind them. */
    label: 'Tell us anything we must not say',
    why:
      'We write the pages, and some claims need a registration behind them. It is far cheaper to '
      + 'know now than to correct it after it is published.',
    how:
      'Anything you are not registered for, anything a trade body stops you claiming, or wording '
      + 'you have been told before not to use. If there is nothing, say so and we will get on with it.',
    cost: 'free',
  },
];

/** The blocking ones, for the summary line — a client should know before they read the list how many
 *  of these actually stop the work. */
export const BLOCKING_ASK_COUNT = DELIVERY_ASKS.filter((a) => a.blocking).length;
