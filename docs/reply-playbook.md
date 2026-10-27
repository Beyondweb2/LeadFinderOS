# Reply playbook (Paul, 2026-10-20)

What the WhatsApp reply drafter (`ai-reply-drafts`, gpt-4o-mini) says for each kind of reply. **Drafts only. Nothing
sends** (Level 1): a person reads, edits and presses Approve & send.

* Code: `src/lib/replyPlaybook.ts` (the lines, the readers, the end-date reader), `src/lib/replyMove.ts` `pickMove`
  (which intent), `src/lib/aiReplyDraft.ts` (prompt, checker, fallback). Record of the whole drafter:
  `docs/ai-handles-replies.md`.
* **Code picks the intent; the model writes it in Paul's voice using the line as its guide.** Lines marked *word for
  word* carry a price, a term or the guarantee and are copied exactly. If the model is unavailable, the line itself is
  the draft. `scripts/reply-playbook.test.ts` checks every line below is quoted here.
* Figures come from `findableOffer.ts` / `offerFactSheet.ts` and follow Client Service Agreement v5.

## 1. The first reply to our opener

**Hook first (Paul, 2026-10-26).** While the pitch is owed, every first reply gets the hook below AS IT STANDS, unless it is
a no / soft no (the existing handling, unchanged), a stop / angry, a wrong person / wrong trade / moved area, another
language, a new site on the way, a website they sent when we have none on record, "is this a bot?" (always answered
honestly), a fact question the sheet marks for Paul, legal / complaint / payment, media, a sticker / reaction, a chatbot
or an auto-reply (their own rules). "Yes", "how can I help", "are you looking for manual lessons?", "manual or
automatic?", "yes who's this?", "what are you selling?", a price question, even "interested" all get the hook. No
apology, no "I'm not after lessons", no straight answer, no "sorry for the slow reply" on the first reply
(`replyMove.ts` `keepsOwnFirstReply`). Those lines still apply after the hook has gone. The report link line
("Here's the full report: <link>") comes before the one question; never for Australia; a draft with any link is never
auto-sent (`aiAutoSend.ts` `has_link`). Tests: `scripts/hook-first-replies.test.ts`.
⛔ **The FIRST automatic reply to the opener (out-of-office, a business greeting) still gets the hook** (Paul, 2026-10-26,
confirmed: do not re-ask). It stays labelled Auto-reply, so it is never sent by itself. A repeat auto-reply, an auto-reply
after a real reply, and a chatbot ("didn't quite catch that") get nothing.

**The voice-note hook (Paul, 2026-10-27).** Two shapes, every word code-built (`replyMove.ts` `firstReplyPitch`). Site found,
with real findings from the one website check:
```
Hi mate,
I asked chatgpt "<the missed question>" and it named A, B and C, not you.
I had a look at your site and a couple of things could be holding you back:
• <up to four real issues, plain words, worst first>
There's more in the full report: <link>
Can I send you a quick voice note explaining how you could get AI recommending you?
<sender name, added when it is sent>
```

No website on record, or a site with no solid finding (never says "website", never claims the site is missing):
```
Hi mate,
I asked googleAI "<the missed question>" and it named A, B and C, not you.
Here's the full result: <link>
Can I send you a quick voice note explaining how you could get AI recommending you?
<sender name>
```

* **Always "Hi mate,"** — never a name, even one they gave or the site states.
* The engine is written exactly `chatgpt` or `googleAI` (Gemini and Google's AI answers); "AI" when the engine is unknown
  or an earlier message named the other tool. `tidyCaps` keeps both spellings. Only the hook names an engine.
* "not you" only for the missed search (an answer that did not name them, `worstMiss.ts`). With no missed search on record
  the line says what AI named, and "not you" only under the one-third rule (`namedShareRule.ts`).
* Lead-in by count: one thing / a couple of things / a few things. Up to four bullets (`PITCH_MAX_LIST`), trimmed to two
  past `PITCH_MAX_WORDS`.
* "There's more in the full report: <link>" only when the check found more than are listed AND the report link exists;
  else "Here's the full result: <link>"; no ready link → no line. Australia: never a link, price, sign-up or guarantee.
* Gone (2026-10-27): "AI is recommending your competitors instead", "I specialise in…", the no-website paragraph, and the
  agency / website closing question. Old hooks already SENT keep their own next steps (the agency answers, and the
  site-shared reply after "I couldn't find one for you"). After the new hook a site they send is `website_given`
  (run Crawl site), because the new hook never says we couldn't find one.
* The one question is the voice-note offer, so a yes ("yes", "go on", "yeah sure") is `voice_yes`.
* A rival with (nearly) the lead's own name is never listed (`nearSameName`).
* Tests: `scripts/hook-voice-note.test.ts`, `hook-first-replies`, `hook-more-issues`, `hook-engine-name`.
* Never the money-back line in the pitch, and no wording that promises a result. The guarantee is said only on a price,
  catch or guarantee question (and "will I definitely be recommended?").

## 2. From then on

One question per message, short and human. Order: (a) are they with an agency; (b) if so, tied into a contract or free
to leave; (c) then "a quick call, or a voice note to explain how we'd fix this". Tied in: don't push, ask the end date,
note it. ⛔ Never badmouth an agency. ⛔ Never deny being AI.

**The end date is NOTED, never written.** The draft's "why" carries `followUp` (their words, the end day, a check-back
day 14 days before) and a note: "Set the Next Action for <day> when you send." CLAUDE.md: the Next Action is human-set
only, so the person sets it with the existing Next Action. No new tables, no migration.

**Loop guard win:** a sent draft that agreed a call time (`why.win = 'call_time_agreed'`) resets the three-AI-replies
guard, like a voice note sent or a booked call.

## 3. Style

* ⛔ **No AI brand in any prospect-facing draft (Paul, 2026-10-21).** Drafts say "AI" or "ai tools", never ChatGPT,
  Gemini or Google AI. The worst-engine pick still chooses the missed question underneath, and the engine shows in the
  "why" panel ("Missed on: Gemini · <question> (the draft says "AI")"). The checker warns on any brand name (`AI_BRAND`,
  `aiReplyDraft.ts`) **unless they asked which tool** (`RE.whichTool` → the `which_tool` line, `plan.brandsAllowed`).
  The measurement answer says "the main AI tools" unless they asked which.
* Follow-ups write ai in lower case (`lowerBrands`), and never start a sentence with it (a checker warning). Sentences
  still start with a capital. The first pitch keeps its capitals.
* No "Perfect." / "Great." every time: the checker warns when a draft opens with the same word as one of our last two
  messages.
* Facts only from the fact sheet and agreement v5.

## 4. The lines

| Intent | When | Line |
|---|---|---|
| website_given | they send their website | Thanks, I'll take a proper look at that one. Do you manage it yourself, or is it with an agency? |
| no_website | "no, not got one" | That could be why ai has nothing to recommend. I can build you one that's set up for ai and google, and you'd own the domain. Quick call, or shall I send a voice note explaining it? |
| facebook_only | "just facebook" | I only found a Facebook page, so there's very little of your own for AI to read. A proper website tends to help with that. Quick call, or shall I send a voice note? |
| agency | "an agency does it", "I pay someone" | Good to know. Are you tied into a contract with them, or free to leave if it's not working? |
| in_contract | "tied in until March" | Thanks for being straight. I'll check back near then. Want me to send a voice note in the meantime so you can see what I found? |
| tied_no_date | "yes, in a contract" (no date) | Thanks for being straight. When does the contract end? I'll check back near then. |
| free_to_leave | "no contract", "rolling", "happy to change" | Good. Would you like a quick call, or shall I send a voice note to explain how we'd fix it? |
| self_managed | "I do it myself" | Good, that makes changes easy. Quick call, or shall I send a voice note explaining what I found? |
| friend_built | "my nephew built it" | Nice. Would you be happy to change if it helped, or do you want to keep it with them? |
| not_sure_who | "not sure" | No worries. Do you pay anyone monthly for the site? |
| voice_yes | yes to the voice note | Sending it now. It's about a minute. (then the existing voice-note script) |
| call_yes | "call me" | Great, what day and time suits you? Give me a UK time and I'll ring then. |
| interested | "interested", "tell me more" | Happy to. Easiest is a quick call so I can show you what I found, or I can send a voice note if that's easier? |
| go_on | "go on then", "ok" | Are you with an agency, or do you manage the website yourself? (the call / voice note once that is known) |
| what_we_do | "what do you do?" | I build you a new site set up for AI and Google, sort your Google Business Profile, and keep checking how you show up. Quick call, or a voice note? |
| how_much | price (word for word) | It's £99 to start, and I'm confident enough in it that it's backed by a guarantee: we improve ai visibility or you get your money back. After your results it's £99 a month, 12 payments in total including the first, and that covers the new site, hosting, changes and regular checks. Quick call, or a voice note to go through it? |
| catch | "what's the catch?" (word for word) | No catch. You pay £99 to start and if we don't improve ai visibility you get that £99 back. We re-run the same questions after 4 weeks to check. The one thing to know is it's a 12 payment minimum, counting the first. |
| how_long | "how long?" (word for word) | The site build usually takes a few days. Then we re-check after 4 weeks to see the difference. |
| who_are_you | "who are you?" | I'm Paul, I run Findable. I help local businesses show up when people ask AI for a recommendation. Would a quick call be easier? |
| which_tool | "which ai?", "what tool?", "was it chatgpt?" (word for word) | I check the same questions on ChatGPT and Gemini. Want a voice note showing what it said? (with "That one was <the missed search's engine>." in front when it is known; the only draft that names a tool) |
| examples | "examples?", "results?" (word for word, code-built) | I've had good reviews and great feedback from the businesses I've worked with, and I built this site for a locksmith recently: https://mclocksmiths-new.pages.dev/ Happy to talk you through it on a call. Want me to send over the report I did for you too? (no search on record: "…Want me to run the same check on your business?") |
| definitely | "will I definitely be recommended?" (word for word) | I can't promise ai will recommend you, nobody honestly can. What I do promise is we improve ai visibility or you get your £99 back. |
| own_site | "do I own the site?" (word for word) | You always own your domain, and you own the site after the final payment. If you want, I can keep hosting it after that for £29.99 a month. |
| not_now | "not now", "later" | No problem. When would be a better time? I'll check back then. (a time named: "No problem, I'll check back then." + noted) |
| too_expensive | "too expensive" (word for word) | Fair. It's £99 to start and you get it back if we don't improve things, so the risk is small. Want a quick call so I can show you what I found first? |
| think_about_it | "I'll think about it" | Of course. Want me to send a voice note so you've got the details in front of you? |
| dont_need | "don't need more customers" | Good problem to have. I only got in touch because AI named your competitors and not you. Want a voice note so you can see for yourself? |
| does_ai_matter | "nobody uses ai" | Fair question. I only reached out because it named your competitors instead of you, and that's easy to check yourself. Want a voice note to show you? |
| is_bot | "is this a bot?" | I use AI to help write and check my messages, but I'm Paul from Findable and the results I found are real. Would a quick call be easier? |
| privacy | "how did you get my number?", "is this a scam?" | Fair question. I found your business on Google and checked how AI recommends you. I won't message again if you'd rather not. Want me to send what I found? |
| send_email | "send me an email" | Sure, what's the best email to send it to? |
| not_owner | "I'm not the owner" | No worries. Who's the best person to speak to? |
| busy | "busy, call later" | No problem. What day and time suits you? I'll call then. (their time → confirm; the call time agreed is a win) |
| number_sent | they send a number | Thanks, I'll give you a ring. Is there a good time today? |

* dont_need / does_ai_matter say "not you" / "instead" only under the one-third rule; otherwise a soft line with no claim.
* privacy says "online" instead of "on google" when the lead has no Google place id.

| site_shared | they send their website after we said we couldn't find one (*code*) | Ah thanks, I missed that one. Had a proper look and a few things could be holding you back with AI: <the check's issues, one per line>. Are you with an agency, or do you manage the website yourself? |
| how_to_get_named | "how can I get up on the AI search?", "what do I do?" after the issues list (*code*) | Good question. The main thing I work on is a website AI can read properly, with clear pages for what you do and where you do it. I build that for you, and check how often AI names you before and after. Easiest to explain properly. Voice note, or a quick call? |

## 5. No draft (Needs you, with a reason)

Stop, angry (both still opt out and cancel queued follow-ups), not interested, "keep it with them", legal / complaint /
payment, an email address given (send it yourself), a question the playbook cannot answer, anything off-topic or
unmatched. "Draft reply" and Regenerate refuse these too. A map pin, social or directory link stays "Sent a link: look
at it first".

## 5b. Live-bug fixes (2026-10-20, from the reply recon)

* **Merged turns:** prospect messages with nothing of ours between them and no more than five minutes apart are ONE turn (`mergeBursts`, `replyMove.ts`). "Yes" then "How can I help?" gets the pitch.
* **Busy is a phrase, never a word in a name:** "driving" counts only as "I'm driving / driving at the moment". "Hi yes this is Pass Me Driving" gets the pitch.
* **Names:** only from "my name is X", "this is X", "it's X", "I'm X", "X here / speaking", or the whole message being a known first name, typed with a capital (a stoplist and the business name never count). Unsure = no greeting.
* **Away / on leave / out of action** gets the not-now wording ("No problem, I'll check back then."), the date noted for the person to set. Never the pitch.
* **The "how can I help" family** ("how can I assist", "anything I can help with?", "what can I do for you", "what's it concerning?", "nature of your enquiry") and emoji-only replies get the pitch on a first reply.
* Tests: `scripts/reply-live-bugs.test.ts` (real cases from the recon).

## 5c. Hi mate, no brands, the new confidence line (Paul, 2026-10-21)

* No name found → "Hi mate,". A name (theirs, or the site's stated owner) still wins.
* No AI brand anywhere a prospect reads, except the which-tool answer (section 3). Evidence unchanged underneath.
* The confidence line is "I specialise in getting local businesses to show up in those results, so the customers go to
  you instead." (`PITCH_SPECIALISE_LINE`), replacing "…get recommended by AI…".
* The voice-note script is NOT part of this drafter: it lives in `src/lib/voiceNoteScript.ts` + fn `voice-note-script`
  (`docs/voice-note-script.md`). It went brand-free in section 5d.
* Tests: `scripts/reply-playbook.test.ts` section 5b (`--preview-pitch` prints four preview drafts).

## 5d. The reply recon's 18 intents and detection fixes (Paul, 2026-10-21)

From `reply-recon-2026-10-20.md` §5a / §5b, with Paul's wording changes. ⛔ No AI brand ("ai tools"). ⛔ "regular checks",
never "monthly". ⛔ new_site_being_built never says "free". ⛔ Proof words name no client, no number, no result claim.
Lines marked *code* are written by code word for word (no model call). Tests: `scripts/reply-new-intents.test.ts`
(`--preview` prints one draft per intent) and `scripts/reply-recon-regression.test.ts` (the 100-case set, §7b scoring,
hard gate: a stop / angry / complaint / not-interested / client thread never produces a draft).

| Intent | When | Line |
|---|---|---|
| thinks_customer | "are you looking for lessons?", "automatic or manual?", "do you need a plumber?" (code) | Ha, sorry for the confusion, I'm not after {thing} myself. I'm Paul from Findable. I checked how AI recommends {trades} in {town}. Ok if I send you what came back? ({thing} = "lessons" for a driving school, else "a plumber"; {trades} in {town} from the lead) |
| straight_answer_then_pitch | "what are you selling?", "is this a sales call?", "what do you want?", a bare "Why" / "What?" before the pitch went (code) | Fair question. I'm Paul from Findable, and yes, I offer a service. Here's why I got in touch: (then the pitch's lines and its one question, after "Hi <name>," / "Hi mate,") |
| wrong_trade | "we don't do locksmithing", "I'm an auto locksmith, those are all domestic" (**Needs you**) | Sorry about that, my mistake. What is it you mainly do? I'll check it properly. (note: fix the trade on the lead first) |
| moved_area | "I'm not in Sowerby Bridge anymore" | No worries, thanks for letting me know. Where are you working now? I can check how you show up there. |
| closed_retired | "no longer trading", "I've retired" | No worries, sorry to bother you. Best of luck with it. (note: mark the lead closed) |
| fully_booked | "fully booked", "waiting list", "too busy for advertising" | Good problem to have. I'll leave you to it, and if it ever goes quiet you know where I am. |
| word_of_mouth | "all word of mouth", "busy with recommendations" | Fair enough, that's the best kind of work. I'll leave you to it. If you ever want to see how AI recommends you, just say. |
| already_show_up | "I already show up on ai", "a caller said chatgpt recommended me", "you found me" | Fair enough, good to hear. It tends to come out differently depending on who asks and where. Want a quick voice note on what came back when I checked? (named every time: "Fair enough, you're right, you came up every time I checked too. I'll leave you to it.") |
| new_site_being_built | "getting a new website built", "just been rebuilt" | Good timing. Is it with an agency, or are you building it yourself? Then: "No problem. I'll check back in about 4 weeks once it's settled and re-run the same searches so you can compare." (the check back is NOTED on the draft, never written) |
| proof_request | "send the evidence / screenshots", "a demo" (code; references / testimonials / case studies we cannot send: **Needs you**) | Fair ask. I can send you the report with the exact searches I ran and what came back. I've had good reviews and great feedback from the businesses I've worked with, and I built this site for a locksmith recently: https://mclocksmiths-new.pages.dev/ Want me to send the report here? |
| explain_here | "please explain here", "send me some details" | Sure. Short version: I build you a new site set up for AI and Google, sort your Google Business Profile, and keep checking how you show up. Want me to send what I found here? |
| pay_on_results | "only pay after results", "show us FOC first" (**Needs you**, word for word) | I don't work pay-after-results, but you're covered: it's £99 to start, and we improve ai visibility or you get your money back. After your results it's £99 a month, 12 payments in total including the first. Quick call to go through it? |
| ads_question | "do you do google ads?", "tried SEO, didn't work" | No, I don't do ads. I only work on getting businesses recommended when people ask AI. Want a quick voice note on what I found? |
| do_it_myself | "I'll learn it and do it myself", "I'll get claude to fix it" | Fair enough, and good luck with it. If you want a second pair of eyes on what I found, just say. |
| where_based | "are you UK based?", "what's your company called / your website?" (code) | Findable is a UK company, but we work with businesses worldwide. The site's findable.live if you want a look. Quick call, or shall I send a voice note? |
| call_now | "you free now?", "can I call you?" (**Needs you**: only Paul knows) | Yes, I'm free now. Ring me on this number, or give me a time and I'll ring you. |
| sorry_wrong_day | "it's a Sunday, have a day off" (swearing is still a stop) (code) | Fair enough, sorry for the message. I'll leave you in peace. |
| they_chased | "just wanted to follow up", "??" after we did not answer (code) | Sorry for the slow reply. (then the pitch, same greeting rule; after the pitch went: Needs you) |
| acknowledge_wait | "Will ring later", "I'll give you a call tomorrow": they will call us (code, Paul 2026-10-21, R085) | No problem, speak soon. |

**Order** (`pickMove` 4b): pay on results and "how much to get to the top?" first, then a clear no (**B9**: a decline with a
reason after it is still a no, no draft), then the soft exits, then the rest, all before an answer to our last question.
A price question beside a proof ask is answered as the price.

**Detection fixes:** B4 bare "Why" / "What?" → straight_answer_then_pitch; "Who's this please?" → who_are_you. B6 call times:
"what time works", "can we do any earlier?", "are you free to call?" are our asks, and a bare hour ("Yes 6") after one is the
time; them asking "are you free to call?" is call_now. B7 agency: "an seo guy", "a company who deal with it", "in marketing",
"someone manages the website". B8 auto-replies with a form link or a consultation fee are read as auto-replies before the
link and price rules; an auto-reply then "Yeah" in the same burst is a real reply. B9 above. B10 rude / underhand / slop /
"your rubbish" = complaint, no draft ("spam" still stops, as strict as before). B11 a body that is only "[audio]" /
"[image]" is media. **A voice note from a prospect**: Needs you, suggested text "Sorry, I can't listen to voice notes on
here. Can you type it, or shall I give you a quick call?". Busy with no ask to call later ("Bit busy at the moment") is
not_now. "Yes this is the number for <them>" confirms them; "…the number for Leon's locks" is Needs you (run the check on
that one). contact_followup ("did you get my last message?") still owes the pitch.

**Where the regression set's expected value was overridden** (the code was not bent): R054 and R066 (B9, a no with a
reason), R075 (price first), R081 (set_call draft), R095 (where_based), R077 (references: Needs you); Paul agreed all six (2026-10-21). R085 "Will ring later" is acknowledge_wait ("No problem,
speak soon."), never the busy line.

**Voice-note script, brand-free:** the spoken script says "AI" ("i asked AI for a plumber in Leicester"), never ChatGPT,
Gemini or Google AI; the checker flags a brand. The engine stays in the stored evidence for the operator.
`VOICE_NOTE_GENERATOR_VERSION` 6.

## 5e. Lean first replies (Paul, 2026-10-23)

Approved before / after sheet: `C:\Users\paulj\Documents\Findable\lean-first-replies-2026-10-23.md` (version 2).

* **The pitch** (`firstReplyPitch`): no "Either way I can send a quick voice note" line (the voice note and call come next
  message); "I looked into why and a few things could be holding you back:" then up to **four** real issues as "• "
  lines; one issue is one sentence; none, the "why" part is dropped. **Length rule:** past 100 words the lowest issue goes,
  never below two (`PITCH_MAX_WORDS`, `PITCH_MIN_LIST`, `pitchIssueWords.ts`).
* **Plain issue words** (`src/lib/pitchIssueWords.ts`): keyed by the website check's issue ID, never its title. A town
  keeps its capital. An issue with no plain words (page code / schema, sitemaps, canonicals, FAQ mark-up, a second
  homepage copy) is **left out**, never said in jargon. "No named owner" (a minor finding) joins the address line. The
  operator screens and client report keep `plainIssueTitle`.
* **No website:** Paul's Option 2 words (`PITCH_NO_SITE_LINE`): "tends to", never how AI decides. The question is
  "Do you have a website I've missed, or is that something you'd want sorted?" (a bare "yes" still gets "What's the web
  address…").
* **Site shared** (`siteSharedReply`, intent `site_shared`): after we said we found no website, they send one. If the
  website check has run on THAT site: "Ah thanks, I missed that one. Had a proper look…" + up to four real issues +
  "Your Google listing doesn't link to your website" (true: our no-website pitch went because their Google listing had
  none). Not checked yet → **Needs you, no draft**: "Add it to the lead, press Crawl site, then Regenerate" (Paul: never an
  auto-crawl). A map pin or Facebook link beside it is fine.
* **How to get named** (`how_to_get_named`): "how can I get up on the AI search?" after the issues list: three lines, no
  price, "Voice note, or a quick call?". With "I manage it myself" in the same message it opens "Good, that makes it
  easier." (Quick Drive, 2026-10-22, got a reply that ignored the question.)
* **"AI" in capitals in every first reply** (`MovePlan.firstReply`, `isFollowUp`); later follow-ups keep "ai".
* **Australia** (`prospectOnlyPlan`, `prospectOnly.ts`): a plan that would say a price, the guarantee or a sign-up is
  **Needs you, no draft** ("prospect_only"); every other plan may not state a price. Judged on what the plan SAYS, not a
  list of intents.
* **Logged structure:** `why.structure` = pitch_list / pitch_sentence / pitch_plain / pitch_no_site / pitch_intro /
  site_shared_list / site_shared_sentence / site_shared_plain. The outcome log links to the draft (`draft_id`), so reply
  rates can be compared by structure with no database change.
* **The checker** counts a "• " line as part of the list, not a line of its own; the site-shared reply has the pitch's
  limits; a name the site calls itself ("it says Quick Drive Academy") is not flagged as a stranger.
* **Not done here (listed for Paul):** an "unsourced claims" check (ratings / pass rates with no source) does not exist and
  is a separate job. "Welcome, !" (an empty greeting) is not caught by the website check yet: the check lives in
  `contentTrust.ts`, which reaches 31 functions including send-whatsapp-message and process-whatsapp-queue, so it was
  not built in this change; the pitch already has words for it if the check ever quotes one.
* Tests: `scripts/reply-move.test.ts` §6 / §9b, `scripts/reply-new-intents.test.ts`, `scripts/lean-first-replies.test.ts`.
* **Deployed 2026-10-23** (main 320fc232): migration 20261124130000 applied and read back (3 nullable columns on
  voice_note_scripts); edge functions ai-reply-drafts, voice-note-script, inbox-scheduled-send, warm-lead-reply,
  conversation-triage, business-summary, admin-overview, twilio-webhook (the closure of replyMove / replyPlaybook /
  warmReply / voiceNoteScript / pitchIssueWords). Live markers: OPTIONS x-ai-reply-drafts 2026-10-23a-lean-first-replies,
  x-voice-note-script 2026-10-23a-next-thing-to-say; the SPA chunks carry voice-note-generated and the What's New id.
  Full gate: 450/451; the one red suite (warm-lead-research "a fresh crawl-check row is reused") fails the same on
  untouched origin/main 50460132 (a date-dependent fixture), not this change. Open drafts keep old wording until Regenerate.

## 5f. The first-reply pitch carries the report link (Paul, 2026-10-23)
* The pitch (Option A) keeps every word, line and its one question. When the lead's audit has a FINISHED run
  (`loadAuditContext`, `reportUrl` = `findable.live/r/<code>`), one line "Here's the full report: <link>" goes just before the
  question (`reportLinkLine` in `replyMove.ts`). No new finding is added.
* Audit not finished (or the link is not a well-formed report link): no link, the draft's `why.auditPending` is true and its
  note says "Audit pending: no report link in this draft". Never a sign-up link; the checker allows only the report-link shape.
* Australia (prospect-only): the link is allowed, the pitch has no price, guarantee or sign-up. Drafts only; Level 2 stays off.
* Test: `scripts/hook-report-link.test.ts`. Live marker: `x-ai-reply-drafts` 2026-10-23b-hook-report-link.

## 6. Where Paul's brief and v5 differ (v5 wins)

* **how much**: the brief said "covers the new site, hosting, changes and monthly audits". v5 2.6 / 2.7 only promise a
  regular review and that we *may* give monthly tracking, and the checker refuses "monthly audits". Line says "regular
  checks", and adds "12 payments in total including the first" (v5 4.1; the minimum is always named with the price).
* **catch**: the brief's line had no minimum term. Saying "No catch" without it would mislead, so the line adds "The one
  thing to know is it's a 12 payment minimum, counting the first."
* **what we do**: the brief said "track the results every month"; v5 2.7 says we *may*. Line: "keep checking how you
  show up".
* **website given**: the brief asked to re-run the crawl on the new URL "if the existing code supports it". It does not
  from here (a prospect crawl is pressed by a person; the internal crawl door is paid clients only). The draft's note says
  "Run Crawl site on it".
* **no website**: the brief said "That's probably why ai has nothing to recommend". The sales-style check refuses a
  website fact stated as the cause of an AI result (CLAUDE.md: never assert how an AI decides), so the line says "That could be why".
* **is this a bot**: one answer now, whatever the AI auto-reply switch says (Paul's line makes no "I send every one
  myself" claim, which stays a warning when the switch is on).

## 2026-10-26 — four detector fixes (Paul; source `docs/convo-review-2026-10-26.md`)

Branch `fix/reply-detectors`. Wording and moves unchanged; only what reads the reply. Tests: `scripts/reply-detectors.test.ts` (real phrasings).
- **Thinks we are the customer** (`RE.thinksCustomer`): up to two words before "lessons" ("manual driving lessons"), "looking to start lessons",
  "you need / do you want … lessons", and "manual or automatic" in either order. Before, 4 of 6 live phrasings went to Needs you "No playbook reply fits".
- **Chatbot** (`replyMove.ts` `CHATBOT`, read by `isAutoReply`): "didn't quite catch that", "please rephrase", "reply with a number" = automated.
  In the auto-reply branch a chatbot gets nothing (no pitch, no draft), even as the first reply. `RE.catch` no longer fires on "didn't catch that".
- **"No competition"** joins `RE.decline` (no draft, Needs you "Said no"). `CLEAR_YES` reads "I'm in" only at the end of a phrase
  ("I'm in no competition" had read as a yes).
- **Sticker / reaction** (as `[sticker]` / `[reaction]` or by message type) = ack, no draft (was the "can't play voice notes" line).
- **Alert email** (fn `notify-onboarding-submit`): the Domain line comes from `src/lib/domainEmailLine.ts` — "NOT ANSWERED — still blank: …" when a
  domain question is blank, else "Answered — DOMAIN READY / ISSUE". Kept out of `domainAuthority.ts` (byte-identical in findable-site).

## The service-question line (Paul, 2026-10-26)

A drafted reply to a question about the service (intents `what_we_do`, `who_are_you`, `how_much`, `examples`, `explain_here`,
and any reply to "is this legit / genuine / a scam?") carries `FINDABLE_SITE_LINE` once, just before its one question:
"You can see more about what we do at findable.live." (`replyMove.withSiteLine`, `siteLineDue`; the model's text gets it from
`aiReplyDraft.ensureSiteLine`, and the checker warns if it is missing or doubled).
- Checked 2026-10-26: findable.live shows a sample REPORT (before/after), not examples of sites we built, and has no
  /examples page, so the line never says "examples". If a real examples page ever exists, change the line and the record.
- Link: the bare homepage (the checker allows findable.live itself, never a path on it).
- Not for: the hook (first reply, its straight-answer / chased variants), a no, Australia (prospect-only), auto-replies,
  chatbots, stickers, reactions, media. linkOk is set on the PLAN only, so `autoSendable` (the Level-2 switch list) is unchanged,
  but a draft carrying the line is approve-to-send: `aiAutoSend` DRAFT_LINK counts a bare "findable.live" as a link (WhatsApp
  makes it one; Paul's 2026-10-26 rule: a draft with a link is never sent by itself). So who_are_you / what_we_do / explain_here
  drafts now wait for approval even when their switch is on.
- `scripts/service-question-link.test.ts` fences it with real phrasings.

## The hook is signed with the sender's name (Paul, 2026-10-26)

Only the hook (a first-reply pitch, or an auto-reply answered with the code-built pitch; `hookSignature.isHookDraft`) ends with
the sending person's own chosen name on its own last line, under the question (`signHook`: "…yourself?\n\nSam").
- The name is `profiles.message_name` ONLY (`hookSignatureName`, `_shared/sender-name.ts` `senderChosenName`), never the email
  fallback, the lead's owner, the assignee or "Paul".
- Inbox: the draft shows and sends with the VIEWER's name (the approver is the sender); no name → Approve opens the name box.
- Auto-send (ai-reply-drafts `maybeQueueAutoSend`): signed with the "send as" person's name; none → `no_sender_name`, not sent
  by itself. inbox-scheduled-send's last check accepts exactly `signHook(draft_text, queued_by's name)`, nothing looser.
- The stored draft text stays unsigned. The first-login name box is REQUIRED (MessageNameDialog: no skip, no close).
- `scripts/hook-signature.test.ts`.

## The hook says when there are more issues (Paul, 2026-10-26)

"It needs to be more clear that the issues mentioned aren't the only issues." The length rule is now `PITCH_MAX_WORDS` 115 (was
100) so up to four issues fit more often, and `replyMove.pitchMoreLine` adds, right after the issues, "That's just a couple /
a few / one of them." plus "The full report below has the rest." when the report link is in the message. ⛔ Only when
`site.found` (serious + minor issues of the ONE website check, set by ai-reply-drafts) is more than the pitch lists; no count,
no claim. The line is not counted by the length rule. Also: the checker no longer flags a rival with "&" in its name as
"not in the audit". `scripts/hook-more-issues.test.ts`.

## The hook names the engine, in lower case (Paul, 2026-10-26)

An exception to "no AI brand in a draft" (2026-10-21) and "never 'Google AI' for Gemini" (2026-10-13), for the HOOK only:
`askedPhrase(e, true)` writes "I asked chatgpt …" when the missed search was ChatGPT's and "I asked google ai …" when it was
Gemini's or the AI Overview's (`hookEngineWords`). Lower case on purpose (Paul): `tidyCaps` keeps exactly "I asked chatgpt" /
"I asked google ai" (case-sensitive, so a model's "i asked chatgpt" is still tidied). "AI" when the engine is unknown or the
conversation already named the other tool (`e.engineWords`: never two tools). The plan carries `hookEngine`; the checker allows
exactly that phrase and still warns on any other tool name. Every other draft (and `auditLine`) keeps "AI".
`scripts/hook-engine-name.test.ts`; six older tests that pinned "I asked AI" in the hook were updated.
