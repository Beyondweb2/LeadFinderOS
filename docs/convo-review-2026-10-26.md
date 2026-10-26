# Conversation review, 12–25 Oct 2026 (Paul, proposal only — nothing built)

Read-only. Nothing was sent, no setting or draft changed, no code changed. Source: `whatsapp_messages`, `ai_reply_drafts`,
`ai_reply_draft_outcomes`, `onboarding_responses`, `client_agreement_acceptances`, `whatsapp_outreach_state`, run 26 Oct.
QA / test leads (`metric_exclusions`, test mode) are out. No phone numbers or personal details in this file.
Wording below is a **proposal**; Paul approves it before anything is built.

## 0. How to read the numbers

- Window: 12 Oct 13:29 to 25 Oct 19:54 (UTC). **817 leads got an opener** (UK 714, Australia 77, Malaysia 25, Singapore 1).
- **WhatsApp only.** There was no SMS in the window (0 rows in `sms_messages`), so there is no WhatsApp-vs-SMS comparison to make.
- "Replied" = any message from them after our opener. "Substantive" = at least one reply that is not an auto-reply
  and not only "yes it is / how can I help". Types are read by regex (`scripts` in the scratchpad, not committed), so
  treat the type counts as ±10%.
- "Failed" is what the message row says. The row is known to stay `failed` even when Meta's receipt says delivered or read
  (the ratchet, `docs/ai-handles-replies.md`, Robina), so failed is an upper bound. The error text is blank on all 101 failed rows.
- Many days were one batch each (13, 19, 21, 22, 23, 25 Oct). Day-of-week and hour cuts are **batch effects**, not tested effects.
  The later batches also had less time to answer. They are shown for completeness only.

## 1. Funnel (14 days)

| Step | All | UK | Australia | Malaysia |
|---|---|---|---|---|
| Leads sent an opener | 817 | 714 | 77 | 25 |
| Delivered (or read) | 708 (87%) | 642 (90%) | 46 (60%) | 20 (80%) |
| Read | 587 (72%) | 533 (75%) | 38 (49%) | 16 (64%) |
| Failed, never delivered | 95 (12%) | 63 (9%) | 28 (36%) | 3 (12%) |
| Replied | 411 (50%) | 374 (52%) | 24 (31%) | 13 (52%) |
| — only automated | 35 | 31 | 4 | 0 |
| — only "yes it is / how can I help" | 122 | 111 | 11 | 0 |
| — substantive | 254 (31%) | 232 (32%) | 9 (12%) | 13 |
| Asked price (regex) | 15 | 14 | 0 | 1 |
| Asked for info / "tell me more" / said interested | 16 | 16 | 0 | 0 |
| Gold star (Interested) | 14 | 14 | 0 | 0 |
| Started the questionnaire | 7 rows, see §1.3 | 7 | 0 | 0 |
| Reached the agreement or Stripe | 0 | 0 | 0 | 0 |
| **Paid** | **0** | 0 | 0 | 0 |

Drops that matter: opener → substantive reply loses 69%; substantive reply → price or info question loses about 88%;
questions → questionnaire loses about 80%; questionnaire → agreement is 0 of 4 real starters.
Australia fails to deliver three times as often (36%, 17 of 49 on 22 Oct, 11 of 28 on 23 Oct) and gets almost no substantive replies.
Meta's number quality was **RED** (tier 2K) when read; sending is not paused.

### 1.1 By trade (leads / replied / substantive / starred / questionnaire)

| Trade | Leads | Replied | Substantive | Star | Questionnaire |
|---|---|---|---|---|---|
| Driving instructors | 574 | 314 (55%) | 194 (34%) | 11 | 7 |
| Plumbers | 126 | 39 (31%) | 16 (13%) | 1 | 0 |
| Locksmiths | 39 | 19 (49%) | 8 (21%) | 1 | 0 |
| Language schools | 27 | 18 (67%) | 18 (67%) | 1 | 0 |
| Accountants | 25 | 9 (36%) | 6 (24%) | 0 | 0 |
| Interior designers (Malaysia) | 24 | 12 (50%) | 12 (50%) | 0 | 0 |

Driving instructors are 70% of the volume and every questionnaire. Plumbers reply least (31%) and 23 of 39 plumber replies
were auto-replies or a bare "yes". Language schools reply most but the sample is small and several are "we don't need this".

### 1.2 What got replies

- **Opener.** `initial_contact_short` (698 leads): 49% replied, 27% substantive. `initial_contact` (119 leads): 57% replied,
  56% substantive. **Do not read that as the template winning.** The long opener ran mostly in the 13 Oct batch, which was
  worked by hand the same day (free-text answers in about 30 minutes). Not tested.
- **After a reply** (reply within 3 days, before our next send; template or message type):

| What we sent | Sent | Read | Any reply | Substantive |
|---|---|---|---|---|
| Free text typed by Paul | 195 | 164 | 68 (35%) | 67 (34%) |
| First-reply pitch (typed or approved draft) | 35 | 29 | 10 (29%) | 10 |
| `audit_followup` template | 56 | 49 | 16 (29%) | 15 |
| `audit_followup_call` template | 25 | 22 | 4 (16%) | 4 |
| Voice note | 7 | 7 | 2 (29%) | 2 |
| AI-written free text (auto or approved) | 15 | 14 | 6 (40%) | 5 |

  `audit_followup_call` is the weakest (16%). Free text from Paul and the AI drafts are the strongest. Voice notes: n=7, no conclusion.
  The first-reply pitch counts only those starting "I asked…"; the draft-outcome log has 157 sent unchanged, so the
  table undercounts it (the others went out by the ordinary Send with a changed opening).
- **Send time.** UK short opener, replied / substantive by London hour: before 9 45%/21%, 9–11 48%/25%, 11–13 50%/36%,
  13–15 56%/29%, 15+ 62%/18%. Flat; batch effects dominate.
- **Answer speed vs answered again** (all sent drafts, n=185, within 3 days): our reply under 10 min after theirs, 33% answered
  again; 10–60 min 36%; 1–4 h 26%; 4–24 h 25%. Faster than an hour looks better than slower than an hour; the sample
  is small and nothing here is a proven cause.

### 1.3 The people who started the questionnaire

Nine rows in the window; five are real prospects, four are Quick Close sessions on 14 Oct whose answers are keyboard
mashing (looks like practice). **Paid 0. Agreement signed 0. Stripe session 0** for all of them.

| Prospect (opener) | Where they stopped | Note |
|---|---|---|
| Ark roofing Preston (free check) | Submitted the free-check form; no questions | Not a build starter |
| Driving Ambition (13 Oct, long opener) | Chose "keep" route, **domain ownership unanswered**, "direct access" | Paul asked "can I answer any questions?" within 3 h; no reply |
| Best Drive / Selma (16 Oct, long opener, replied only "Yes") | Answered **every domain question as ready**; site run by a web company; **contract with them "not sure"** | Clause 1.6: a client tied into a provider is declined; "not sure" is unresolved. Whether this blocks the payment screen is **not verified** |
| Professor Plumb NI (23 Oct, no lead linked) | Chose new site, **domain question not answered**, DNS and materials unticked | Submitted at 23:03; no conversation on the lead |
| Ambition2drive (23 Oct, short opener) | Answered **everything**, domain ready, direct access | Objection ("recommendations") → Paul's reframe → asked price → price reply 19 h later → questionnaire next day after the `onboarding_followup` template. The only prospect who went opener → price → questions |

What they share: three of the four real starters are driving schools with their own site; two stopped at the
domain question unanswered (50%), and the two who finished the answers had a clean domain. Price is not the common stop:
only Ambition2drive asked it. **There is no record of who viewed the payment screen**, so "reached payment and stopped" is
inferred from "all answers saved, no agreement": the two who finished are Best Drive and Ambition2drive.

**The alert email contradiction is a code bug, not a data problem.** `notify-onboarding-submit` (about line 396) writes
"Answered — DOMAIN / AGENCY ISSUE (see NEEDS YOU)" whenever the domain rule applies and is not ready. The reasons list can
contain `domain_not_answered` ("Domain question not answered"), so the same email says "Answered" in the line and "not
answered" in the NEEDS YOU box. Fix: if `domain_not_answered` is among the reasons the line says "Not answered yet".

### 1.4 How long drafts sat

- Draft created to sent: median 15 min (25th 5 min, 75th 54 min, longest 22 h), n=185.
- Replies to us (inbound) to our answer: 22% within 10 min, 40% in 10–60 min, 12% in 1–4 h, 26% in 4–24 h.
- Open now: 13 drafts and 37 Needs-you rows pending; the oldest draft is from 21 Oct.
- 14 of 147 plain "yes it is / how can I help" first replies (19–23 Oct) were **never answered**; none was answered after 24 h.
- The price question from Ambition2drive was drafted at 16:57 on 23 Oct and approved at 11:55 on 24 Oct (19 h). The
  slower the reply, the fewer answers, but the sample is small.
- Before the drafter (13 Oct) the first answer to "who is this?" / "how can I help?" was the `audit_followup` template a
  median of **24 hours** later (1,436 min, n=50).

## 2. Where the AI drafter struggles

### 2.1 The settings (read, none changed)

| Setting (`whatsapp_outreach_state`) | Value now | What it does |
|---|---|---|
| `ai_reply_mode` | **manual** (last changed 25 Oct 16:02) | Manual = no draft for any reply. Needs-you flags still run (rules only, no spend). Draft for approval = every reply gets a draft that waits. Auto = a reply type that is switched on sends itself |
| `reply_audit_enabled` | on | Run the audit after a first reply; a pitch waits for the audit and website check (30 min then "Audit did not finish") |
| `ai_auto_send_intents` | `first_reply_pitch`, `go_on` | Which types **may** send themselves, only when mode is Auto. Not live while mode is Manual |
| `ai_auto_send_daily_cap` | 200 | Daily ceiling for Auto (default is 30) |
| `ai_handles_replies`, `auto_reply_enabled`, `first_reply_mode` | false / true / `audit_only` | Old columns kept in step by a trigger. "Audit and reply" is retired; the database only allows `audit_only` |
| `ai_handles_replies_since` | 22 Oct 10:29 | Replies from before this are never drafted |
| `paused` | false | Sending is not paused |
| `visible_rule` | both | Rule for the "Visible" flag |
| Meta quality / tier | RED / 2K | Read every 15 min; red pauses once |

**Cause of the "no draft" gaps: the mode.** In Manual the tick writes `skipped / awaiting_person` and no model call is made.
That happened to 94 replies (3 on 20 Oct, 1 on 22 Oct, 20 on 23 Oct, **70 on 25 Oct**). Drafting works when it is on: in the
window 80 drafts went by Approve & send and 110 more closed "resolved" (mostly the ordinary Send with the draft typed in); **141 of the 150 pitch drafts that went out were sent
unchanged**, and 8 of the 9 edited ones changed 1–13 words (mostly "Hi mate" → the real name). Auto sent 15 messages, all on 22 Oct.

### 2.2 Question: is "someone thinks I'm a customer" a missing move or a setting?

**Neither, exactly.** The move exists (`thinks_customer`, added 21 Oct) and its line is good:
"Ha, sorry for the confusion, I'm not after lessons myself. I'm Paul from Findable. I checked how AI recommends driving
instructors in <town>. Ok if I send you what came back?" Two things stop it:

1. **The detector misses most real wordings.** `RE.thinksCustomer` (`src/lib/replyPlaybook.ts:240`) was tested on live phrasings:

| Live reply | Matched? |
|---|---|
| "Are you looking for manual driving lessons?" | no |
| "Is it manual or Automatic you need and where do you live postcode wise?" | no |
| "Yes it is. You need driving lessons?" | no |
| "Are you looking to start lessons?" | no |
| "Are you looking for lessons?" | yes |
| "Automatic or manual" | yes |

   The misses fall to `unknown_question` → Needs you, "No playbook reply fits", no draft (3 of the 5 live cases).
2. **Manual mode** means even a matched reply gets no draft (§2.1).

Fix is code (widen the pattern, add tests) plus the mode, not a new move.

### 2.3 Reply types and how often (since 19 Oct, first message of each burst, regex-typed)

| Type | Total (14 d) | Since 19 Oct | Draft written | Needs you (no draft) | Skipped / no row | Answered by Paul <24 h with typed text |
|---|---|---|---|---|---|---|
| "Yes it is, how can I help" | 155 | 92 | 67 | 1 | 24 | 63 |
| Short "yes / hi / ok" | 136 | 90 | 61 | 1 | 28 | 66 |
| Auto-reply (first) | 84 | 45 | 8 | 2 | 35 | 17 |
| Other (names, odd answers) | 69 | 51 | 24 | 14 | 13 | 22 |
| "How can I help" bare | 18 | 9 | 6 | 0 | 3 | 4 |
| Fully booked / "I'm fine" | 15 | 12 | 1 | 9 | 2 | 3 |
| Not interested / no thanks | 14 | 11 | 0 | 9 | 2 | 1 |
| Word of mouth / Facebook / no website | 14 | 11 | 5 | 4 | 2 | 7 |
| Retired / closed | 11 | 8 | 2 | 4 | 2 | 1 |
| Price | 10 | 8 | 5 | 1 | 2 | 5 |
| Thinks I'm a customer | 8 | 5 | 2 | 3 | 0 | 2 |
| Wrong trade / wrong person | 8 | 4 | 0 | 3 | 1 | 1 |
| Who is this / where did you get my number | 7 | 5 | 2 | 2 | 1 | 1 |
| Already has an agency / new site coming | 5 | 4 | 2 | 2 | 0 | 4 |
| Image / sticker / link | 5 | 5 | 0 | 2 | 3 | 2 |
| How does it work / send info | 3 | 1 | 0 | 1 | 0 | 0 |
| Away / not now | 3 | 3 | 2 | 1 | 0 | 3 |
| "Are you a bot" | 0 | 0 | | | | |

### 2.4 AI draft vs what Paul sent (the edits and discards are the signal)

Non-pitch drafts that were **edited or discarded** (the pitch is fine, §2.1):

| Reply | Draft said | Paul sent | What it shows |
|---|---|---|---|
| "No website, just Facebook / word of mouth" (4 times) | "Fair enough… I'll leave you to it" or "A proper website would fix that" | The quick-report link + "if you want to be the one AI recommends, I can make that happen" | The draft gives up or tells them to get a website; Paul sends the report link. Drafts may not carry a link |
| "I have a website, here it is" (2) | "Do you manage it yourself or an agency?" | What the site check found + report link | Fixed in code 23 Oct (`site_shared`); not re-tested live |
| "Building a website with a friend" | "Would you be happy to change if it helped?" | Offer to help make it work for AI | Draft asks them to dump the friend |
| "Who is this?" (2) | "I'm Paul, I run Findable… Would a quick call be easier?" | The `audit_followup` template, 2 h later | Discarded both times; the line explains who, not why |
| "What is the nature of your enquiry?" | "That's a good question. I'd rather explain it properly…" | `audit_followup_call` template | Discarded |
| "I'm sorry I didn't quite catch that…" (a chatbot) | The price/guarantee line (`catch`) | nothing | Chatbot read as a person. Never send a price to a bot |
| "I'm in no competition thanks, let God's will be done" | The "interested" line | nothing | "no competition" read as interested |
| "Do it myself and I'm not offering rekeying" (locksmith) | "Good, that makes changes easy" | A question about being fully booked | Should be wrong trade |
| "Let me know how I can help and I'll get back to you" | "Sure thing. Want me to send a voice note?" | `audit_reply` template | Read as "think about it" |
| "No, but you can get them on <number>" | "I'll give you a ring" | nothing | A referral to a third party, not them |
| A sticker | "Sorry mate, I can't play voice notes" | nothing | A sticker is an acknowledgement |
| "Is it manual or automatic you need…" | Needs you, no draft | Paul wrote "no I'm not looking for lessons myself…" | §2.2 |
| Price asked, "website rebuild and optimisation for AI" | skipped (Manual) | Paul typed £99 a month for 12 months, **without the £99 start, the guarantee or "regular checks"** ("visibility audits") | Drift from the price line when the drafter is off |

**What Paul never answers (typed or draft), since 19 Oct:** plain no's 10 of 11; "fully booked" 9 of 12; retired 7 of 8;
auto-replies 28 of 45. Most are right to leave. The ones worth a reply are the soft no's (§3).

### 2.5 The types you asked about

| Type | State today | Verdict |
|---|---|---|
| Who is this / where did you get my number | `who_are_you`, `privacy` lines exist. 2 of 2 `who_are_you` discarded; compound "where's your base, are you UK, where did you get my number" went to Needs you | Line explains who, not why. Needs a version with the reason |
| Are you a bot | `is_bot` exists. Wording flips with the mode ("I read and send every one myself" only in Manual / Draft) | OK. 0 cases in 14 days |
| Price | `how_much`, `catch`, `too_expensive`, word for word. 5 of 8 drafted, 1 sent 19 h later | Fine when drafting is on |
| How does it work | `what_we_do`, `explain_here` exist | 3 cases. Say "regular checks" |
| Send me info | `send_email`. Asks for an email address | OK |
| I already have someone for SEO | `agencyStrong` catches "an SEO guy/company…"; "tried SEO" goes to the ads line | OK for the common ones |
| I'm with an agency | `agency`: 1 of 1 sent unchanged | Good |
| Is this legit | `privacy` (scam / number) | Fine; add who and why |
| Can I see the report | `proof_request` (word for word, link allowed) | Good; the long "total price and ongoing fees before agreeing" version has no move |
| Not interested | `close_politely`, Needs you, no draft | A one-line close would stop 10 silent no's |
| Bot or auto-reply first | `auto_reply`: pitch on the first one. 84 total, 22% of replies | Works; chatbots with "please rephrase" slip through |

## 3. Proposal (not built)

### Top 5 findings

1. **Drafting is off.** Mode is Manual, so 94 replies got no draft (70 on 25 Oct). Where drafting ran, 141 of 150 pitch drafts went out unchanged and the median answer was 15 minutes.
2. **The cliff is after the first reply, not before.** 87% delivered, 72% read, 50% replied, but 31% substantive and 0 paid. Soft no's and closes ("I get recommendations", "I just use Facebook", "fully booked", retired) are about 40 of the 254 substantive replies and are either left alone or get a draft that gives up.
3. **Paul's soft-no move has no draft.** The one prospect who went opener → price → questionnaire did it after a reframe plus the report link (n=1). Paul sent a report link in 53 conversations, 7 of them as the answer to a recommendations / Facebook / website reply; 30% got a reply, about the same as his other typed messages (35%), so **the link is not proven better, only unavailable to drafts** (they may not carry one).
4. **The detectors misread.** Customer-mistake misses 4 of 6 live phrasings; a chatbot got the price line; "no competition" read as interested; a sticker got a voice-note line; a third-party referral got "I'll give you a ring".
5. **The questionnaire loses people, and we cannot see where.** 0 of 4 real starters reached the agreement; 2 stopped at an unanswered domain question and the alert email says "Answered"; the payment screen has no view event; there is no chaser.

### Top 5 fixes, ranked by impact

1. **Set AI replies to Draft for approval** (a setting; reversible). Nothing sends itself. Recovers the 15-minute answers and stops first replies going unanswered (10% of "yes it is" replies were).
2. **Soft-no pack, approve-to-send, with the report link as an option Paul can strip** (§3.1 H, I, J). Replaces the three lines that give up. The link is the lead's own quick report short link (`findable.live/r/<code>`), never the operator copy. Never auto.
3. **Detector fixes** (code + tests): widen `thinksCustomer`; treat "please rephrase / didn't quite catch that / thanks for contacting" as a chatbot (no price, no pitch twice); "no competition" is not interest; a sticker or emoji is an acknowledgement; a number sent for someone else is Needs you, no "I'll ring you".
4. **Questionnaire stop-point: fix the alert wording, log a payment-screen view, one chaser.** See §3.3.
5. **Keep replies from waiting.** Show the minutes waiting on every Needs approval row, put price questions and "who is this" first in the list, and let a price answer go as soon as it is approved, even outside the send hours, if the lead is in the 24-hour window and Paul has pressed send (check `inbox-send-window.md` first; the 19 h wait on the price question looks like send hours).

### 3.1 Improved replies (drafted in Paul's voice; one question, short)

Rules applied: one question; plain English; no AI brand names (AI only); "regular checks"; price line word for word;
the only past-results line is the reviews line; the guarantee is only "We improve AI visibility or you get your money back.";
Australia is prospect-only, so **no price, no guarantee line and no sign-up line to an Australian lead** (they get the call or voice-note version).
`<trade>`, `<town>`, `<name>` come from the lead as today.

**A. Thinks I'm a customer** (keep the line; fix the detector)
> Ha, sorry for the confusion, I'm not after lessons myself. I'm Paul from Findable. I checked how AI recommends driving instructors in `<town>`. Ok if I send you what came back?

For other trades: "…I'm not after `<a plumber>` myself…". Works for Australia unchanged.

**B. Who is this / is this legit / where did you get my number** (one reply for the three)
> I'm Paul, I run Findable. I found your business on Google and checked how AI recommends `<trades>` in `<town>`, and I thought you'd want to see it. Ok if I send you what came back?

If they asked where we are: add before it "Yes, we're UK based." (still one question).

**C. Are you a bot** (keep)
> I use AI to help write and check my messages, but I'm Paul from Findable and the results I found are real. Would a quick call be easier?

With the mode on Auto the first words become "Some replies on here may be automated, but I'm Paul from Findable and the results I found are real."

**D. Price (UK)** (word for word, no change)
> It's £99 to start, and I'm confident enough in it that it's backed by a guarantee: we improve ai visibility or you get your money back. After your results it's £99 a month, 12 payments in total including the first, and that covers the new site, hosting, changes and regular checks. Quick call, or a voice note to go through it?

Australia: "Happy to go through that on a quick call rather than over text. What day suits you?"

**E. How does it work**
> Sure. Short version: I build you a new site set up for AI and Google, sort your Google Business Profile, and run regular checks on how you show up. Want me to send what I found here?

(Today's line says "keep checking how you show up"; "regular checks" is the approved wording.)

**F. Send me info** (keep)
> Sure, what's the best email to send it to?

**G. I already have someone for SEO / I'm with an agency**
> Good to know. Do they look after your website as well?

Then the existing next steps (contract, free to leave). The agency answer stays as it is: "Are you tied into a contract with them, or free to leave if it's not working?". Never badmouth an agency.

**H. Soft no: "I get plenty from recommendations / referrals"** (replaces "I'll leave you to it"; sent once, then close)
> Fair enough, word of mouth is the best kind of work. More people are asking AI who to call though, and I checked what it says for `<trades>` in `<town>`. Want me to send what came back?

If the lead is named in more than a third of answers the middle sentence is dropped (existing one-third rule).

**I. "I just use Facebook" / "no website"**
> That's fair, a lot of `<trades>` get work from Facebook. I only found a Facebook page, so there's very little of your own for AI to read. Want me to send the quick report I did?

(Paul's own wording said "AI doesn't crawl Facebook"; that is a claim about how AI works, which the rulebook forbids, so this says only what we found.)

**J. "Can I see the report" / the sceptic who wants everything before agreeing**
Short ask:
> Fair ask. I can send you the report with the exact searches I ran and what came back. I've had good reviews and great feedback from the businesses I've worked with. Want me to send the report here?

Long ask (report, fixes and price): the report link + the price line D, as one message Paul approves, never auto.

**K. Plain no: "no thanks / not interested"** (new, one line, Needs you keeps the flag; no promise to stop, which is Paul's decision)
> No problem at all, thanks for letting me know.

A stop or angry reply keeps today's flow (opt-out at once, nothing drafted).

**L. Fully booked / retired** (keep today's lines, but low priority in the list)
> Good problem to have. I'll leave you to it, and if it ever goes quiet you know where I am.
> No worries, sorry to bother you. Best of luck with it.

**M. Building a new site with someone** (replaces "would you be happy to change")
> Good luck with it. Ok if I check back in a few weeks and see how you show up once it's live?

**N. A chatbot or auto-reply first**
No new words: the pitch goes once to the first auto-reply as today. New detection: "please rephrase", "I didn't quite catch that", "type 1 for…" are automatic; a chatbot never gets the price line.

**O. Someone sent another person's number** — Needs you, no draft. Suggested note: "Sorry to have bothered you, thanks for the number." Paul decides whether to contact them.

**P. Sticker or emoji only** — no draft (acknowledgement).

**Q. Past-results line check.** The `examples` line today also names a locksmith site link and asks a second question
("Want me to send over the report I did for you too?"). Proposed trim, to match the rule (reviews line only, one question):
> I've had good reviews and great feedback from the businesses I've worked with. Want me to send over the report I did for you?

### 3.2 Settings I suggest (none changed)

| Change | Reason |
|---|---|
| `ai_reply_mode` Manual → **Draft for approval** | Restores drafts; nothing auto-sends; 141/150 pitch drafts went unchanged. Reversible in one click. Ask: was Manual deliberate on 25 Oct 16:02? |
| Leave Auto off; set `ai_auto_send_daily_cap` back near 30 before it is ever used | 200 is far above the default; Meta quality is RED |
| Keep `reply_audit_enabled` on | The pitch needs the audit and site check |
| Keep `ai_auto_send_intents` as they are but unused | They only act in Auto |
| Check Meta number quality and Australia | RED quality and 36% Australian fails; the failed-receipt ratchet in `whatsapp-status` is held (cutover plan), so the true rate is not knowable yet |

### 3.3 Payment-screen flow (reason in brackets)

1. **Alert email:** "Domain: Not answered yet" when `domain_not_answered` is a reason; "Answered — domain ready / issue" otherwise (two of four starters stopped here and the email reads as if they had answered).
2. **Log a "viewed agreement / payment screen" event** so the funnel can show who reached it (today it is inferred).
3. **A domain "not sure" path** inside the form: "Not sure? Pick this and Paul will check with you" (`domain_escalated_at` already exists) instead of leaving the box blank. Verify where the form currently lets people stall before building.
4. **Best Drive case:** an agency "not sure" answer is the clause 1.6 stop. Confirm whether the form blocks, and say why in plain words.
5. **One chaser, approve-to-send, 20–24 hours after the last save, never to an Australian lead:**
   - Domain unanswered: "Hi `<name>`, I saw you got most of the way through. Easier if I go through the website questions with you on a quick call?"
   - Everything answered, no agreement: "Hi `<name>`, I saw you finished the questions. Anything you'd like to ask before the next step?"

   No sign-up link in the chaser; the rep sends the one link as today.

## What matters

- The drafter is off (Manual). Turning it back to Draft for approval is the biggest, safest win.
- 0 paid, 0 agreements. Four real starters, two stopped at an unanswered domain question.
- The soft-no pack with the report link is the one new move worth building.

## What to ignore

- Day-of-week and send-hour differences (batches, not tests); long-vs-short opener (confounded); voice-note rate (n=7).
- The type counts to ±10%; "failed" is an upper bound.

## Decision needed from you

1. Move AI replies to Draft for approval (was Manual on purpose)?
2. Approve or change the §3.1 wording, especially H, I, J, K, M and the trimmed examples line Q.
3. OK to send report links in drafts (approve-to-send only, never auto, never to Australia)?
4. Build order: fixes 1–5 as ranked, or detector fixes (3) and the alert wording first as a small safe release?
