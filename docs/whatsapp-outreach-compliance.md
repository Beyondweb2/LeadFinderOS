# WhatsApp outreach: compliance position (reviewed 2026-10-02, NON-BLOCKING)

Status: **reviewed by Paul and closed as a non-blocking engineering item.** Do not reopen it as an
urgent product bug unless one of the triggers at the end applies.

## What was raised

During the findable.live privacy audit (2026-10-02, findable-site branch `privacy-policy-proposal`, not
merged) two questions were flagged as needing a legal view rather than code:

1. PECR's rules on unsolicited electronic marketing treat individual subscribers (sole traders and
   partnerships, many of the tradespeople Findable contacts) differently from corporate subscribers
   (limited companies), and are generally treated as covering app messages. Whether a given cold
   WhatsApp message needs prior consent depends on who receives it and what it says.
2. The live cold openers ("Hi, is this {business}? Cheers" / "Hey, are you taking on more jobs atm?
   Cheers") do not identify Findable, give an opt-out route or point to the privacy notice.

These are **open legal/policy questions. Nothing in this repo or its docs should be read as saying all
cold WhatsApp outreach is lawful, nor as saying it is unlawful.** No legal advice has been taken yet.

## Paul's decision and the operating model (2026-10-02)

- WhatsApp is intended primarily as a **lightweight opener / follow-up channel**: occasionally a very
  short business-verification message ("Hey, is this [business name]?"). The full cold-sales
  conversation is **not** planned to run over WhatsApp routinely.
- **Live cold calling is intended to become the principal cold-outreach method.**
- If someone engages on WhatsApp, or asks for information there, the conversation continues
  appropriately.
- **Anyone who asks not to be contacted stays suppressed from all future outreach.**

## What this means for engineering (standing decision, do not re-ask)

Do **NOT** build, as part of this item:
- mandatory WhatsApp opt-in / consent fields;
- company-type (sole trader vs limited company) classification purely for WhatsApp;
- consent workflows;
- new blocking rules that stop the current outreach system;
- any other substantial WhatsApp compliance feature.

Do **NOT** change the live WhatsApp openers for this reason (they are Meta-registered bodies; any change
is its own decision).

**MUST be preserved (unchanged by this decision):** the opt-out and suppression behaviour, which is
already strict:
- opt-out phrases in ANY inbound message are detected (`src/lib/replyTriage.ts` `isOptOut`) and recorded
  (`_shared/suppression.ts` `recordOptOut`, via conversation-triage and the queues);
- `contact_suppressions` holds phone, email and lead (each unique);
- the suppression check FAILS CLOSED (an unreadable lookup is treated as suppressed);
- guards: `scripts/suppression.test.ts`, `suppression-index.test.ts`, `marketing-optout.test.ts`.
A change that weakens any of these is a real bug, whatever this record says.

## The privacy policy is a separate task

The privacy-policy gaps (prospect data, sources, processors, retention, the client-enquiry processor
role) are documented in findable-site `docs/privacy-policy-proposal-2026-10-02.md` on the unmerged branch
`privacy-policy-proposal`. They are a later legal/privacy task, not part of this item.

## Reopen ONLY if

- the outreach model materially changes (for example back to routine cold selling over WhatsApp);
- Findable begins substantial cold selling over WhatsApp;
- Meta / WhatsApp Business policy changes in a way that affects these messages;
- a complaint is received, or legal advice requires a change.
