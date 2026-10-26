# Which messages work: Meta templates vs AI-written (readout 2026-10-26)

*Read-only analysis. Nothing was sent, changed or deployed. Data: every real (non-test) WhatsApp message from 2026-10-12 13:29 to 2026-10-26 12:48 UTC (2,048 messages, about 880 leads), plus all-time template counts for trend. No phone numbers or personal data are in this file; business names are not used. Numbers are counts with 95% ranges (Wilson). "p" is a Fisher exact test, unadjusted for the several comparisons made, so treat anything near 0.05 as a lead, not proof.*

## 1. The plain-English answer

1. **The opener is not where you are losing.** About half of delivered openers get a human answer (short opener 225 of 450, original 68 of 113). Short vs original is not a proven difference (50% vs 60% answered, p = 0.06; real replies 9% vs 7%, p = 0.58). Keep the short opener as the default and test the original against it (section 7).
2. **The hook after the first reply is where it breaks.** Of 443 short-opener leads delivered and settled in the UK: 223 answered, 176 got a hook or pitch, 49 replied to it, and only about 1 showed interest or asked a price. Most replies to a hook are a polite no.
3. **Templates vs AI at the hook stage (same position: first pitch after they answered):**
   - **Volume of replies is the same.** Template hooks 18 of 70 delivered replied (26%, range 17-37%). AI hooks 45 of 142 (32%, range 25-40%). p = 0.43, no difference.
   - **What the replies say is different.** Of the template hook replies, 3 were a yes ("yes please", "yeah why not"). Of 142 AI hook sends, 0 were a yes within 48 hours. The AI hook was refused outright in 36 of 142 (25%) against 8 of 70 (11%) for templates (p = 0.02 for declines, p = 0.035 for yes). **Suggestive, not settled:** the two groups ran on different days (templates mostly 12-20 Oct, AI 20-24 Oct), on different lead mixes, and the sample of yeses is 3.
   - So: **templates are at least as good as AI at this stage and the AI version provokes more refusals.** I would not call AI worse on reply rate, I would call it worse on the kind of reply.
4. **Direct cold hooks do not work.** The video hook (video_template) got 2 replies from 106 delivered all-time (1.9%) and competitor_hook 3 from 73 (4.1%). Both were sent to people who had never replied. A cold opener gets about 48-50%. Hooks only work after a reply.
5. **Nobody has paid from any of this in 15 days.** The payment ledger has 0 rows in the window. 11 leads in the sample have a questionnaire row (9 answers saved, 2 submitted, all still flagged incomplete); most were opened by hand (quick close or free check) and cannot be tied to a message type. Conversion to payment is not measurable at this volume.
6. **Nobody wrote "bot" or "automated" at you.** Zero replies use those words. 12 replies ask "who is this?" (all but 1 to openers), 3 are hostile, 1 asks you to stop. What does show up is business auto-responders (111 replies, 16%) and people answering as if you were a customer ("how can I help?", 164 replies, 23%). The nearest thing to a "this is templated" tell is one reply to an AI hook: "would mention you by name but I don't have it" (the "Hi mate" greeting with no name).

## 2. How I measured (and what could be wrong)

- **Stages kept apart:** (A) cold openers: A1 original "Hi, is this X?" and A2 short "Hey, is this X?". (B) template hooks sent after a reply: audit_followup (report link, "want me to explain?"), audit_followup_call (no link, offers a call), audit_reply. (C) AI-written hook after the first reply (draft intent first_reply_pitch, sent as drafted, edited, or auto-sent). (D) other AI replies (answers to objections, price, etc.). (E) typed by hand with no AI draft. A cold opener is never compared with a hook.
- **Delivered** = status delivered or read. Failed sends are out of every rate. 11 sends stuck at "sent" are also left out. **Read** = read receipt.
- **Reply attribution:** an inbound counts for a send if it arrives within 48 hours and before the next message we sent.
- **Real reply** (openers) = anything beyond "yes it is" / "how can I help?" / auto-responder / sticker. Human answered = any human response including "yes it is". For hooks, a bare "yes" counts as a reply. **Not counted as real:** auto-responders, bots, stickers, "didn't catch that", bare "hi".
- **Settled window:** see section 3. **Pending** = sent in the last 48 hours; reported on its own.
- **Reply classes are a keyword classifier** I spot-checked against the raw wording; expect a few misfiles (for example a handful of real "thanks for your interest" declines are counted as auto). It will not change a conclusion here but treat any single count as plus or minus 3.
- **Not clean experiments.** Variants ran on different days and lead lists, so trade and timing are mixed in. Trade matters a lot: short opener answered 61% for driving instructors (n = 262) vs 27% for plumbers (n = 121).
- QA exclusions: 101 lead exclusions and 6 phone exclusions exist; none of the lead exclusions appear in this sample. Phone exclusions were not checked against message numbers (6 numbers, immaterial).

## 3. How long replies take, and what counts as settled

First inbound after a delivered opener (n = 439): median 9 min, 75% within 1 h, 90% within 3.4 h, 95% within 10 h, 99% within 27 h. Human answers alone have a median of 22-26 min. I set **settled = sent at least 48 hours before the last message in the data** (sent before 24 Oct 12:48 UTC). Everything newer is pending.

**Pending, not failures:**
- Sunday 25 Oct short opener batch: 112 sent, 104 delivered, 56 already answered (54%), 5 real replies. Already at the settled rate for answers; the rest will fill in.
- Today (26 Oct): 37 short openers sent, 30 delivered, 9 answered (30% so far), 7 failed (19%, higher than the 9-10% UK norm, worth a look). Today's hooks: AI 55 sent, template 10 sent; too early to read.

## 4. Results by stage (UK, settled, delivered only)

### A. Cold openers

| Variant | Sent | Failed | Delivered | Read | Human answered | Real reply | Bot reply | Thinks I'm a customer only | Who is this | Interested | Median to answer |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 original | 124 | 11 | 113 | 100 (88%) | 68 (60%, 51-69%) | 8 (7%, 4-13%) | 10 | 29 | 3 | 0 | 26 min (n=68) |
| A2 short | 505 | 50 | 450 | 372 (83%) | 225 (50%, 45-55%) | 41 (9%, 7-12%) | 40 | 82 | 5 | 1 | 22 min (n=225) |

Delivery failure UK: A1 9%, A2 10%. Real replies to openers are mostly declines (A2: 12 "no", 8 retired/closed, 5 "who is this", 1 interested). Ranges overlap on everything; the only gap near significance is "human answered", where A1 is higher (p = 0.06), and A1 ran earlier and on a different list.

**Australia (kept separate):** short opener 77 sent, **28 failed (36%)**, 46 delivered, 38 read, 20 answered (43%), 3 real replies, 1 interested. The failure rate is the finding. Malaysia: 31 sent, 4 failed, too few to read (answered 5 of 16 original, 7 of 9 short, 0 real replies). Singapore: 4 sent.

By trade (short opener, delivered): driving 159 of 262 answered (61%, 55-66%), language schools 11 of 14, locksmiths 15 of 30, accountants 8 of 22, plumbers 33 of 121 (27%, 20-36%). Time of day (before 10 / 10-13 / 13-17): 53% / 47% / 52%, no pattern. No openers went out at the weekend except the pending Sunday batch.

### B vs C. The hook after the first reply (the comparison that matters)

| Hook | Sent | Delivered | Read | Any non-bot reply | Non-decline reply | Yes | Declined | Hostile | Median to reply |
|---|---|---|---|---|---|---|---|---|---|
| audit_followup (template) | 51 | 48 | 46 (96%) | 15 | n/a | 3 | 6 | 1 | 22 min (n=15) |
| audit_followup_call (template) | 24 | 22 | 21 (95%) | 3 | n/a | 0 | 2 | 0 | 8 min (n=3) |
| **Templates pooled** | 75 | 70 | 67 (96%) | **18 (26%, 17-37%)** | 8 (11%) | **3 (4%)** | **8 (11%)** | 1 | 22 min |
| AI hook as drafted | 124 | 120 | 105 (88%) | 38 (32%) | n/a | 0 | 30 | 1 | 14 min (n=38) |
| AI hook auto-sent | 14 | 14 | 13 (93%) | 5 | n/a | 0 | 5 | 0 | 5 min (n=5) |
| AI hook edited by you | 8 | 8 | 8 | 2 | n/a | 0 | 2 | 0 | 28 min (n=2) |
| **AI hooks pooled** | 146 | 142 | 126 (89%) | **45 (32%, 25-40%)** | 13 (9%) | **0** | **36 (25%)** | 1 | 14 min |

(Row counts of declines can double-count a hostile reply; the pooled counts, 8 and 36, are the de-duplicated ones used in the tests.)

- "Non-decline" = a reply that is not a refusal, not retired/closed, not hostile and not just "how can I help". Pooled: templates 8 of 70 vs AI 13 of 142, p = 0.63. No difference.
- AI hooks to leads with **no website** got far more replies (24 of 47, 51%) than to leads with a website (21 of 95, 22%), but those replies were mostly "I don't need a website" (8 of 24 were not declines).
- AI hook last line: "Do you have a website I've missed?" 17 of 34 replied (50%), 12 declined. "Are you with an agency or manage the website yourself? ... voice note" 20 of 89 replied (22%), 17 declined. These ran on different leads (the agency line only goes to leads with a site) so the endings cannot be compared fairly.
- Sign-off: all 142 AI hooks in this window went out unsigned (10 of your 24 edits were adding "Paul"). Fixed since in commit dcf57f3f; no data yet on its effect.
- **audit_reply** (2 sent, 1 replied) and **audit_followup_fault** (36 delivered all-time, 5 replies, 14%) are too small to judge.

**All-time trend (any human-looking reply within 48 h, delivered):** original opener 991 of 2,078 (48%, flat across weeks at roughly 40-55%); short opener 255 of 505 (50%); audit_followup 32 of 120 (27%); audit_followup_call 98 of 275 (36%, mostly September); audit_followup_fault 5 of 36 (14%); audit_reply 182 of 557 (33%). Read rate is steady at roughly 75-80% for openers all-time. **Cold direct hooks: video_template 2 of 106 (2%), competitor_hook 3 of 73 (4%)**, all sent to leads who had never replied. Those September call-hook figures are not directly comparable to this window (different lead lists and a different measure), so I would not use them to rank audit_followup_call against audit_followup.

### D and E. Later messages (not comparable to hooks)

Other AI replies (human-approved, 33 delivered): 13 replied (39%). Typed by hand (41 delivered): 19 answered (46%). These sit deeper in a conversation, so they naturally reply more. Do not rank them against hooks.

## 5. What people actually say (all 706 inbound messages)

| Class | Total | After A1 | After A2 | After template hook | After AI hook | After other AI / typed |
|---|---|---|---|---|---|---|
| Bare yes / "hi" | 222 | 43 | 171 | 0 | 1 | 7 |
| Thinks I'm a customer ("how can I help?", "manual or automatic?") | 164 | 34 | 126 | 3 | 1 | 0 |
| Business auto-responder / bot | 111 | 15 | 87 | 2 | 3 | 2 |
| No / not interested | 70 | 1 | 4 | 8 | 40 | 14 |
| Other / unclear | 65 | 8 | 27 | 5 | 16 | 8 |
| Retired, closed, wrong trade | 19 | 0 | 8 | 3 | 8 | 0 |
| Interested | 12 | 0 | 2 | 4 | 1 | 4 |
| "Who is this?" | 12 | 3 | 7 | 0 | 1 | 1 |
| Other question | 9 | 2 | 3 | 1 | 2 | 0 |
| Sticker / image | 8 | 0 | 1 | 0 | 4 | 0 |
| Sent a link or their website | 6 | 1 | 1 | 0 | 4 | 0 |
| Price question | 4 | 0 | 0 | 0 | 1 | 2 |
| Hostile | 3 | 0 | 1 | 1 | 1 | 0 |
| Opt-out ("stop messaging me") | 1 | 0 | 0 | 0 | 0 | 1 |

(Rows do not all sum across because 12 replies followed other templates or media.) Interest is rare: 12 "interested" plus 4 price questions in 706 replies.

**Real phrases.**
- Interested: "Yes, please, I'm interested", "Yeah why not", "Ok send me more info about your work", "I manage it myself tbh ... how can I get up on the AI search?", "Yes always happy with more customers", "I think it's defo something I will consider but would be next year".
- Price: "How much you charge?", "Roughly what would the cost be?", "What's the cost for website rebuild and optimisation for AI".
- The big no-theme (AI hook replies): "I don't need a website, I just use Facebook", "My business runs on recommendations", "I'm fully booked / waiting list", "I'm retired / semi-retired". These are 40 of the 83 replies to AI hooks.
- Pushing back on the AI claim itself (3 of 83): "Absolute RUBBISH - do your homework", "fully booked until 2027 and AI tells me otherwise", "AI is right, they are a lot better instructors than me".
- Hostile to the sender or to cold messaging: "lol let me tell people about your rubbish", "all you marketing guys are destroying my communications" (to the opener).
- "Who is this?": "Who is this?", "And you are?", "Can I ask who is calling?", "Where did you get my number?" (to a typed message).
- Closest to a templated tell: "Hi would mention you by name but I don't have it" (reply to the "Hi mate" AI hook). Nothing says "bot", "automated", "spam" or "AI-generated". Counting "who is this" plus hostile plus pushback: openers 11 of about 690 delivered (2%), template hooks 1 of 70 (1%), AI hooks 4 of 142 (3%). Too few to compare; AI hooks are directionally higher.

Does "thinks I'm a customer" hurt the next message? The AI hook got a reply 18 of 55 (33%) from those people and 24 of 77 (31%) from people who just said "yes". No visible penalty.

## 6. AI drafts: what happened to them and what you changed

From the draft outcome log (15 days, 278 closed drafts; 39 rows backfilled):

| Outcome | Count | Share |
|---|---|---|
| Sent as drafted | 185 | 67% |
| Sent after your edit | 24 | 9% |
| Auto-sent | 15 | 5% |
| Regenerated | 22 | 8% |
| Discarded | 27 | 10% |
| Superseded (they replied again first) | 5 | 2% |

Of drafts that went out (224), 83% went as drafted, 11% edited, 7% auto-sent. 454 draft records in the window in all; 64 were "skipped" and 87 "needs you" (auto-responders, off-topic, do-not-contact, awaiting a person). The first-reply pitch is the dominant case: 187 sent unchanged, 18 edited, 18 regenerated, 13 auto-sent, 6 discarded.

**What you edited, and what it says the drafter gets wrong (27 edits including 3 backfilled; median 1 word changed):**
1. **No sign-off (10 edits):** you added "Paul". Fixed in dcf57f3f.
2. **"Hi mate," (3 edits):** you swapped it for the first name (Josh, Katie) or deleted it.
3. **Cut the closing line (3 edits):** "Either way I can send a quick voice note on what I found" removed twice, plus "About," and "for freelancers" trimmed. The drafter pads.
4. **Site claims it could not stand behind (2 edits):** "homepage does not mention London" deleted; "About," deleted. The check sometimes says something you would not repeat.
5. **Objection replies (7 edits, big rewrites of 26-114 words):** for "word of mouth", "friend built it", "website given", "not now", "dont need" and "rank" the drafter says "fair enough, I'll leave you to it" or asks whether they use an agency. You rewrote them to keep the pitch going with the report link and a concrete proof line. The drafter gives up too soon on a soft no, or asks a question where you add a fact. Only 7 of these, so the pattern is a lead, not a rule.

## 7. What drives replies (hooks, UK, delivered, settled; counts beside every rate)

Any non-bot reply, templates and AI hooks together (n = 214):

| Feature | With | Without | Read |
|---|---|---|---|
| Ends with a question | 45 of 125 (36%, 28-45%) | 19 of 89 (21%, 14-31%) | Looks real (gap about 15 points), but the question was mostly a "no" magnet; non-decline 14% vs 5%. |
| Lead has no website | 26 of 57 (46%) | 38 of 157 (24%) | Biggest gap. Mostly "I don't need one" replies, but non-decline is also higher (16% vs 8%). |
| Says "couldn't find a website for you" | 25 of 51 (49%) | 39 of 163 (24%) | Same effect as the line above (same leads). |
| Lists site findings ("found a few things") | 15 of 59 (25%) | 49 of 155 (32%) | Slightly worse and fewer non-declines (5% vs 12%). Ranges overlap; n = 59. |
| Opens "Hi mate" | 38 of 132 (29%) | 26 of 82 (32%) | No difference. |
| Names rivals | 62 of 208 (30%) | 2 of 6 | Every hook does it, nothing to compare. |
| Includes report link | 27 of 87 (31%) | 37 of 127 (29%) | No difference. |
| Length 76+ words vs 41-75 | 45 of 136 (33%) | 19 of 78 (24%) | Longer replied slightly more, ranges overlap. |
| Time of day (before 10 / 10-13 / 13-17) | 31% / 27% / 35% | | No pattern. |
| Weekday vs weekend | 30% (n = 209) | 0 of 5 | Too few weekend hooks to say anything. |

Trade for hooks: driving instructors 43 of 150 (29%), locksmiths 7 of 14, plumbers 6 of 27 (22%), accountants 3 of 7, roofers 1 of 7. Only driving has a usable sample. **Video:** no video hooks went out in this window; the all-time cold video hook was 2 of 106. **Country:** UK is the only market with usable numbers for hooks (Australia hooks 13 sent, 4 replied).

Nothing in this table is a clean test. The same leads get the same features together (no website, "couldn't find a website", question ending). Use it to choose what to test, not to decide.

## 8. What to do

### Send by default
- **Opener:** keep the short opener (A2) as the default. There is no proof it beats the original; there is no proof it loses either. Test them against each other (below).
- **Hook after the first reply:** use **audit_followup** (the "I asked ChatGPT ... here is your report ... want me to explain?" template) whenever the lead's audit is finished. It matched the AI hook on replies and brought the only yeses in this window with half the refusals. Keep the AI hook for leads with no finished audit and for later replies, until the A/B below says otherwise.
- **Everything after the hook** stays AI-drafted and approved by you: nothing here argues against it.

### What to change in the AI hook (proposed wording, all untested)
1. **Greeting:** first name where known, otherwise "Hi," not "Hi mate,". (Your edits ask for it; the reply-rate data says it costs nothing.)
2. **Drop the accusation sentence** "AI is recommending your competitors instead." and the paragraph that starts "I looked into why this might be happening and found a few things on your website". Both invite a defensive "no". Mention at most one site fact, and only one the check proves.
3. **Ask the easy yes, not the information question.** Replace "Do you have a website I've missed?" and "Are you with an agency, or do you manage the website yourself?" with "Want me to send it over?" or "Want me to explain?".
4. **Cut "Either way I can send a quick voice note on what I found."** (You remove it.)
5. **Sign "Paul"** (already done).
6. Proposed AI hook v2 (rivals, free report, one easy yes):

> Hi {first name},
>
> I asked ChatGPT for {a/the best trade} in {town} this morning and it came back with {rival 1}, {rival 2} and {rival 3}.
>
> I ran you a free report, here it is: {report link}
>
> I know how to get you showing up in those answers. Want me to explain?
>
> Paul

7. **Soft no replies** (word of mouth, not now, friend built it): keep the acknowledgement, then one proof line and the report link, no new question. Example for word of mouth: "Fair enough, that's the best kind of work. In case it's useful, here's what ChatGPT says when someone asks for a {trade} in {town}: {report link}. No reply needed." This copies what you did by hand; test it, do not switch it on for everyone.

### What to stop
- **Stop cold direct hooks** (video_template, competitor_hook): 2 of 106 and 3 of 73 replied. Not used in this window; keep it that way.
- **Stop audit_followup_call as a default hook.** 3 of 22 replied (14%) in this window vs 15 of 48 for audit_followup, and no yeses. The all-time numbers were better (36%, mostly September) so this is a "pause and retest", not a proven loser.
- **Pause Australian sending until the failures are explained.** 28 of 77 (36%) failed against 9-10% in the UK; failed errors come back without a code or text in the log, so I could not see why. The failure rate alone is the case.
- **Stop the AI hook's site-findings paragraph** until each claim is checked (it produced two edits and one "do your homework").
- **Do not read paid conversion from this volume.** There were no payments in the window.

## 9. A/B test plan (same stage, random split)

**Test 1: the hook (the one that matters).** Split every UK lead that has answered the opener and has a finished audit, at random, 50/50: **A = audit_followup template; B = AI hook v2** (above). Run both at the same time, same trades, same days, same hour windows. One hook per lead, no repeats.
- **Primary measure:** non-decline reply (a reply that is not a refusal). Today about 10%. To detect a doubling (10% to 20%) at the usual 5% and 80% power you need **about 200 delivered hooks per arm**. Plan **250 per arm (500 hooks)**. At the pace of the last week (about 20-65 hooks a day) that is roughly 8-12 working days.
- **Second measure:** declines (25% vs 12% today). 140 per arm would show it, so it comes free.
- **Yes / interested:** needs about 280 per arm to see 4% against 10%. At 250 you will see it only if the gap is large.
- **Not worth testing:** a small gap in any-reply (26% vs 32%) needs about 900 per arm.
- Check at 100 per arm, but decide only at 250. Stop early only for a clear harm (more than 3 hostile replies or opt-outs in one arm).
- Record the arm on the lead when it is sent, so the answer can be read straight from the data.

**Test 2: the opener.** Short vs original, random split on every lead, same trade mix. To see a 10-point gap in "human answered" (50% vs 60%) you need **about 390 delivered per arm**; use 450 (900 openers), about 3 days of sending. Judge on "real reply" as well, since "yes it is" is a poor stand-in for interest.

**Do not mix:** one test per stage at a time, no ending text changes while a test runs, and exclude Australia (fix the failures first) and the pending batches from the first read.

## 10. What this analysis cannot tell you

- Cause. Everything here is observed, not randomised.
- Payment. Zero payments in the window; questionnaire starts are mostly hand-opened.
- Why 28 Australian sends failed. The log carries no error code or text.
- The effect of the new "Paul" sign-off or of any wording proposed here.
- Anything for weekends. Only 5 weekend hooks and one pending Sunday opener batch.
