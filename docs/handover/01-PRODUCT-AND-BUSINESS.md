# 01 — Product and business

*Plain-English version, checked against `src/lib/findableOffer.ts` and the live database on 2026-10-05. Deeper history:
`docs/business-and-offer.md`. The words clients see live in constants — change the constant, never retype the words.*

## Findable

**Findable is AI visibility for local businesses** (UK first). Public site: **https://findable.live**. Contact address
for everything client-facing: **paul@findable.live** (never paul@move37.fun on a client surface).

**The goal:** make a business easier for search engines and AI systems to

- **DISCOVER** it,
- **CRAWL** its website,
- **UNDERSTAND** what it does and where,
- **VERIFY** that it is real and credible,
- **CITE** it as a source,
- **DESCRIBE** it accurately,
- and potentially **RECOMMEND** it when a customer asks "who's a good plumber in Halifax?"

**How (the only lever the evidence supports — `docs/findings.md`):** presence in the sources AI reads for that trade,
plus a clear, crawlable website with one genuine page per real service and place, accurate details and honest evidence.
ChatGPT leans on directories; Gemini leans on businesses' own websites — a business with no website cannot be named by
Gemini at all. Tested negative (never sell as levers): website "quality", schema markup alone, reviews, Bing Places.

**Never promise:**

- a guaranteed recommendation;
- a guaranteed citation;
- a #1 / top AI ranking;
- guaranteed inclusion in Google AI (Overviews or otherwise);
- an SEO score;
- review replies (not a Findable deliverable — Paul, 2026-09-28);
- anything about *how* an AI model decides ("AI reads that as…") — we see what is on a site, not why a model chose.

## LeadFinderOS

**LeadFinderOS is Findable's internal operator and sales app** — https://app.leadfinderos.com. It is not sold to anyone.
It does:

- **Find Leads** — Google Places searches for local businesses by trade + town, agency and Companies House checks.
- **CRM / Outreach** — the lead book (~5,550 leads), campaigns, statuses, Next Actions, call logging.
- **WhatsApp Inbox** — openers, replies, templates (Meta Business API, currently on the Move37 setup).
- **AI audits** — hook audits for prospects, Discovery, the formal baseline and the replay for clients.
- **Sales tools** — call scripts built from stored evidence, Quick Close (the payment link), commission and dashboards.
- **Client delivery** — Paid Clients, onboarding, Welcome Pack, Website Build, page generator, monthly updates.
- **Admin** — the control-centre dashboard, team management, API usage and security.

Two roles: **admin** (Paul) and **sales** (salespeople — currently two sales accounts, one of them a test account).

## Current commercial model (live since 2026-09-29)

Both routes: **£99 at sign-up, then £99/month starting 42 days (six weeks) later.** The sign-up £99 is payment 1.

| | **Findable Build** | **Findable Optimise** |
|---|---|---|
| For | businesses that need a new website (or have none) | businesses keeping their existing website |
| Sign-up | £99 | £99 |
| Monthly | £99/month from 42 days after sign-up | £99/month from 42 days after sign-up |
| Payments in total | **12** (`FINDABLE_BUILD_TOTAL_PAYMENTS`) | **6** (`FINDABLE_OPTIMISE_TOTAL_PAYMENTS`) |
| Minimum term | **12 months** | **6 months** |
| Website | Findable **builds, hosts and manages** the new site; it **transfers to the client after the final payment** | **the client always owns their existing site**; Findable never takes it offline |
| Nothing charged after | the 12th payment | the 6th payment |

- The route is stored as `onboarding_responses.plan_tier` (`new_site` = Build, `keep` = Optimise), read only through
  `serviceRouteFromRow`. An undecided route is refused at checkout (`route_undecided`) — never a default 12 or 6.
- Stripe: the sign-up checkout carries the route; the webhook creates a subscription that starts after the 42-day trial
  and ends after the route's recurring count (11 or 5). See `06-PAYMENTS-CLIENTS-DELIVERY.md`.
- Each term is a real minimum — never write "no commitment" or "cancel any time" beside it. Don't invent penalties or exit
  rights. Ownership / suspension / transfer wording applies to Build only.
- **What the monthly covers** (`monthlyCoversPhrase`): a new page each month, a monthly check of their AI visibility,
  adjustments as we learn, and (Build only) hosting the site we built. Say "check", never "audit"; never "every week".
- Pre-choice surfaces may name both routes; once the route is known, name only its count.
- The old £9.99 hosting add-on is retired (legacy rows only). Older prices (£19.99, £49.99) belong to historical clients.
- **The domain rule:** we only build / connect the standard new site where the client owns or controls the domain and can
  authorise the change (agency-managed is fine, agency-owned is not). Findable never takes a domain over.

The one-line summary (`FINDABLE_OFFER_SUMMARY`): "£99 to start, then £99 a month from six weeks after sign-up — 12 payments
in total if we build you a new website, 6 if we optimise the one you have."

## The guarantee

Headline (`GUARANTEE_HEADLINE` / `QUICK_CLOSE_PROMISE`): **"We improve AI visibility or you get your money back."**

The binding wording (`FINDABLE_GUARANTEE`, verbatim): "We measure how often AI names you before we start, then re-measure
after four weeks on the same questions and the same engines. If that number has not gone up, email us within 14 days of
your results and we'll refund your £99." Plus (`GUARANTEE_PAYMENT_TWO_SENTENCE`): "A valid claim also ends your monthly
payments: if the first one has not been taken yet, it never is, and if it has already been taken, we refund it as well."

**What the guarantee measurement IS:**

- 20 approved customer-style questions about their trade and towns (home town + approved service areas), frozen at approval.
- Asked 3 times each on ChatGPT and Gemini = 120 answers, before the work (baseline) and again four weeks later (replay),
  the same way.
- "The number" = how often the business is named, as a share of answered answers, pooled over all matched questions.
- "Gone up" = up by more than the 5-point noise band. Inside the band counts as not gone up → refund applies.
- Identical on Build and Optimise. `findable.live/refunds` is the customer-facing authority.

**What it is NOT:**

- not a ranking position, not a citation count, not a promise to be recommended for any particular question;
- not Google AI Overviews (not measured);
- not the SEO grade (a separate supporting website metric in the Welcome Pack — never the guarantee number);
- not judged on a single question — only on the overall measured number;
- not a refund of the monthly payments beyond payment 2 (a valid claim stops future ones).

⛔ **No hedge beside the guarantee** ("the engines decide", "anyone who promises is guessing") — a promise with a disclaimer
stapled on reads as walking it back.

## Sales team economics (for context)

- Salespeople earn commission on the **initial** payment by a monthly ladder (sales 1–12 in a London calendar month 30%,
  13–24 40%, 25+ 50%; not retrospective) plus **20% of the next 6 recurring payments** actually received. Stamped once by
  the database from the payment ledger (`docs/sales-page-monthly-commission.md`, CLAUDE.md §1).
- Live calling is the main cold channel; WhatsApp is a light opener / follow-up.

## Where things stand (2026-10-05)

- The certified pre-sales release, Sales workspace v2, the opener contact guard and the simple Website Build are all live.
- **No active paying client at the moment** — the historical ones are ended or refunded (`10-HISTORICAL-CLIENTS-AND-
  EXCEPTIONS.md`). The system is ready for salespeople to start selling once the manual actions in
  `12-OPEN-ACTIONS-AND-NEXT-PRIORITIES.md` are done (Apify cap first).
