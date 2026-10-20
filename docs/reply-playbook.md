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

Always the main pitch, unless they say no / stop / angry (the existing stop and opt-out), a wrong person (a short polite
reply, Needs you), or ask a direct question (answered with the matching line below). "Yes", "that's correct", "how can
I help", a name only, "hello?", "what's this about?", even "interested" all get the pitch.

```
[Hi Dom,]
I asked <worst engine> "<its question>" and it mentioned A, B and C.
AI is recommending your competitors instead. I looked into why this might be happening and <the site issues, or: I couldn't find a website for you, so Gemini and Google AI have nothing of yours to read.>
I specialise in helping local businesses get recommended by AI, so those customers come to you instead.
<website: Are you with an agency, or do you manage the website yourself? Either way I can send a quick voice note on what I found.>
<no website: Do you have a website I've missed?>
```

* The greeting uses a name **they gave in this reply** ("this is Dom", "Dom here", a name only), else a person the site's
  own crawl states as owner / founder, else none.
* A rival with (nearly) the lead's own name is never listed (`nearSameName`).
* "AI is recommending your competitors instead" stays under the one-third rule (`namedShareRule.ts`); above a third the
  same shape without that sentence.
* Never the money-back line in the pitch.

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

* Follow-ups write chatgpt, gemini, google ai and ai in lower case (`lowerBrands`), and never start a sentence with one
  (a checker warning). Sentences still start with a capital. The first pitch keeps its capitals.
* No "Perfect." / "Great." every time: the checker warns when a draft opens with the same word as one of our last two
  messages.
* Facts only from the fact sheet and agreement v5.

## 4. The lines

| Intent | When | Line |
|---|---|---|
| website_given | they send their website | Thanks, I'll take a proper look at that one. Do you manage it yourself, or is it with an agency? |
| no_website | "no, not got one" | That could be why ai has nothing to recommend. I can build you one that's set up for ai and google, and you'd own the domain. Quick call, or shall I send a voice note explaining it? |
| facebook_only | "just facebook" | I only found a facebook page, so there's very little of your own for ai to read. A proper website would fix that. Quick call, or shall I send a voice note? |
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
| what_we_do | "what do you do?" | I build you a new site that's set up for ai and google, sort your google business profile, and keep checking how you show up. Easiest to show you what I found. Quick call, or a voice note? |
| how_much | price (word for word) | It's £99 to start, and I'm confident enough in it that it's backed by a guarantee: we improve ai visibility or you get your money back. After your results it's £99 a month, 12 payments in total including the first, and that covers the new site, hosting, changes and regular checks. Quick call, or a voice note to go through it? |
| catch | "what's the catch?" (word for word) | No catch. You pay £99 to start and if we don't improve ai visibility you get that £99 back. We re-run the same questions after 4 weeks to check. The one thing to know is it's a 12 payment minimum, counting the first. |
| how_long | "how long?" (word for word) | The site build usually takes a few days. Then we re-check after 4 weeks to see the difference. |
| who_are_you | "who are you?" | I'm Paul, I run Findable. We help local businesses show up when people ask ai tools like chatgpt and gemini for a recommendation. Happy to jump on a quick call if you'd rather talk. |
| examples | "examples?", "results?" (word for word) | I've had success with all the clients I've worked with so far. Easiest to show you on a quick call. |
| definitely | "will I definitely be recommended?" (word for word) | I can't promise ai will recommend you, nobody honestly can. What I do promise is we improve ai visibility or you get your £99 back. |
| own_site | "do I own the site?" (word for word) | You always own your domain, and you own the site after the final payment. If you want, I can keep hosting it after that for £29.99 a month. |
| not_now | "not now", "later" | No problem. When would be a better time? I'll check back then. (a time named: "No problem, I'll check back then." + noted) |
| too_expensive | "too expensive" (word for word) | Fair. It's £99 to start and you get it back if we don't improve things, so the risk is small. Want a quick call so I can show you what I found first? |
| think_about_it | "I'll think about it" | Of course. Want me to send a voice note so you've got the details in front of you? |
| dont_need | "don't need more customers" | Good problem to have. I only got in touch because ai named your competitors and not you. Want a voice note so you can see for yourself? |
| does_ai_matter | "nobody uses ai" | Fair question. I only reached out because it named your competitors instead of you, and that's easy to check yourself. Want a voice note to show you? |
| is_bot | "is this a bot?" | I use ai to help write and check my messages, but I'm Paul from Findable and the results I found are real. Happy to jump on a call if you'd rather talk. |
| privacy | "how did you get my number?", "is this a scam?" | Fair question. I found your business on google and checked how ai recommends you. I won't message again if you'd rather not. Want me to send what I found so you can judge? |
| send_email | "send me an email" | Sure, what's the best email? Or I can send a voice note here in a minute if that's quicker. |
| not_owner | "I'm not the owner" | No worries. Who's the best person to speak to, and is there a good time? |
| busy | "busy, call later" | No problem. What day and time suits you? I'll call then. (their time → confirm; the call time agreed is a win) |
| number_sent | they send a number | Thanks, I'll give you a ring. Is there a good time today? |

* dont_need / does_ai_matter say "not you" / "instead" only under the one-third rule; otherwise a soft line with no claim.
* privacy says "online" instead of "on google" when the lead has no Google place id.

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
