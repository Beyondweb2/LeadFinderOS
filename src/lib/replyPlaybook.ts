/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE REPLY PLAYBOOK (Paul, 2026-10-20) — what a draft says for each kind of reply. Record: docs/reply-playbook.md.

   CODE PICKS THE INTENT (replyMove.ts pickMove), the model writes it in Paul's voice using the line below as its guide
   (`factual` lines are copied word for word: they carry a price, a term or the guarantee). The rule-built fallback IS
   the line. Every figure comes from findableOffer.ts / offerFactSheet.ts and follows Client Service Agreement v5.

   ⛔ NOTHING HERE SENDS. ⛔ One question per message. ⛔ Never badmouth an agency. ⛔ Never deny being AI.
   ⛔ A tied-in prospect is never pushed: we ask the end date and NOTE it (the draft's "why"); the Next Action stays
      human-set (CLAUDE.md), so the person sets it when they send.
   Pure and edge-reachable: relative imports with .ts, no Deno, no DOM.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { FINDABLE_SETUP_PRICE_GBP, FINDABLE_MONTHLY_GBP, FINDABLE_BUILD_TOTAL_PAYMENTS, FINDABLE_CONTINUING_GBP, REMEASURE_WEEKS_STANDARD } from './findableOffer.ts';
import { GUARANTEE_LINE, ENGINE_WORDING } from './offerFactSheet.ts';

export type PlaybookIntent =
  | 'website_given' | 'no_website' | 'facebook_only' | 'agency' | 'in_contract' | 'tied_no_date' | 'free_to_leave'
  | 'self_managed' | 'friend_built' | 'not_sure_who' | 'voice_yes' | 'call_yes' | 'interested' | 'go_on'
  | 'what_we_do' | 'how_much' | 'catch' | 'how_long' | 'who_are_you' | 'examples' | 'definitely' | 'own_site'
  | 'not_now' | 'too_expensive' | 'think_about_it' | 'dont_need' | 'does_ai_matter' | 'is_bot' | 'privacy'
  | 'send_email' | 'not_owner' | 'busy' | 'number_sent' | 'which_tool'
  /* Reply recon 2026-10-20 §5b, Paul's wording 2026-10-21 (NEW_INTENTS below). */
  | 'thinks_customer' | 'straight_answer_then_pitch' | 'wrong_trade' | 'moved_area' | 'closed_retired' | 'fully_booked'
  | 'word_of_mouth' | 'already_show_up' | 'new_site_being_built' | 'proof_request' | 'explain_here' | 'pay_on_results'
  | 'ads_question' | 'do_it_myself' | 'where_based' | 'call_now' | 'sorry_wrong_day' | 'they_chased';

/** The 18 intents added from the reply recon (2026-10-21). scripts/reply-new-intents.test.ts has a case for each. */
export const NEW_INTENTS: readonly PlaybookIntent[] = ['thinks_customer', 'straight_answer_then_pitch', 'wrong_trade', 'moved_area', 'closed_retired',
  'fully_booked', 'word_of_mouth', 'already_show_up', 'new_site_being_built', 'proof_request', 'explain_here', 'pay_on_results', 'ads_question',
  'do_it_myself', 'where_based', 'call_now', 'sorry_wrong_day', 'they_chased'];
/** The new intents that are always Needs you (Paul, 2026-10-21): the line is only the suggested text a person may send. */
export const NEEDS_YOU_INTENTS: readonly PlaybookIntent[] = ['pay_on_results', 'call_now', 'wrong_trade'];

/** The only links a draft may carry (Paul, 2026-10-21): our own site and the site we built for a locksmith. Never a sign-up link. */
export const FINDABLE_SITE_WORDS = 'findable.live';
export const BUILT_SITE_EXAMPLE_URL = 'https://mclocksmiths-new.pages.dev/';
/** Paul's proof words (2026-10-21): no client name, no number, no percentage, no result claim. */
export const PROOF_WORDS = `I've had good reviews and great feedback from the businesses I've worked with, and I built this site for a locksmith recently: ${BUILT_SITE_EXAMPLE_URL}`;

const gbp = (n: number) => (Number.isInteger(n) ? `£${n}` : `£${n.toFixed(2)}`);
const P1 = gbp(FINDABLE_SETUP_PRICE_GBP);
const PM = gbp(FINDABLE_MONTHLY_GBP);
/** The sheet's guarantee words in the follow-up style ("ai" lower case), never reworded. */
const GUARANTEE_LOWER = GUARANTEE_LINE.charAt(0).toLowerCase() + GUARANTEE_LINE.slice(1).replace(/\bAI\b/g, 'ai');

export interface PlaybookEntry {
  /** Paul's wording. The last sentence ending "?" is the ONE question. */
  line: string;
  /** Copy word for word (a price, a term, the guarantee, the only allowed results line). */
  factual?: boolean;
  /** May state a price (the price family). */
  allowPrice?: boolean;
  /** The money-back confidence line is part of it (price, catch, guarantee only). */
  confidence?: boolean;
  /** Paul's own timing words ("Sending it now") are allowed here. */
  timingOk?: boolean;
  /** Code writes every word: no model call. */
  fixed?: boolean;
  /** May carry our own links (FINDABLE_SITE_WORDS, BUILT_SITE_EXAMPLE_URL) and nothing else. */
  linkOk?: boolean;
}

/** THE PLAYBOOK. docs/reply-playbook.md mirrors it (scripts/reply-playbook.test.ts checks every line is there). */
export const PLAYBOOK: Record<PlaybookIntent, PlaybookEntry> = {
  website_given: { line: "Thanks, I'll take a proper look at that one. Do you manage it yourself, or is it with an agency?" },
  no_website: { line: "That could be why ai has nothing to recommend. I can build you one that's set up for ai and google, and you'd own the domain. Quick call, or shall I send a voice note explaining it?" },
  facebook_only: { line: 'I only found a facebook page, so there\'s very little of your own for ai to read. A proper website would fix that. Quick call, or shall I send a voice note?' },
  agency: { line: "Good to know. Are you tied into a contract with them, or free to leave if it's not working?" },
  in_contract: { line: 'Thanks for being straight. I\'ll check back near then. Want me to send a voice note in the meantime so you can see what I found?' },
  tied_no_date: { line: "Thanks for being straight. When does the contract end? I'll check back near then." },
  free_to_leave: { line: "Good. Would you like a quick call, or shall I send a voice note to explain how we'd fix it?" },
  self_managed: { line: 'Good, that makes changes easy. Quick call, or shall I send a voice note explaining what I found?' },
  friend_built: { line: 'Nice. Would you be happy to change if it helped, or do you want to keep it with them?' },
  not_sure_who: { line: 'No worries. Do you pay anyone monthly for the site?', allowPrice: true },
  voice_yes: { line: "Sending it now. It's about a minute.", fixed: true, timingOk: true },
  call_yes: { line: "Great, what day and time suits you? Give me a UK time and I'll ring then." },
  interested: { line: "Happy to. Easiest is a quick call so I can show you what I found, or I can send a voice note if that's easier?" },
  /* "go on then" / "ok": the agency question, or the call / voice note once the agency answer is known (replyMove). */
  go_on: { line: 'Are you with an agency, or do you manage the website yourself?' },
  what_we_do: { line: "I build you a new site that's set up for ai and google, sort your google business profile, and keep checking how you show up. Easiest to show you what I found. Quick call, or a voice note?" },
  how_much: { factual: true, allowPrice: true, confidence: true,
    line: `It's ${P1} to start, and I'm confident enough in it that it's backed by a guarantee: ${GUARANTEE_LOWER} After your results it's ${PM} a month, ${FINDABLE_BUILD_TOTAL_PAYMENTS} payments in total including the first, and that covers the new site, hosting, changes and regular checks. Quick call, or a voice note to go through it?` },
  catch: { factual: true, allowPrice: true, confidence: true,
    line: `No catch. You pay ${P1} to start and if we don't improve ai visibility you get that ${P1} back. We re-run the same questions after ${REMEASURE_WEEKS_STANDARD} weeks to check. The one thing to know is it's a ${FINDABLE_BUILD_TOTAL_PAYMENTS} payment minimum, counting the first.` },
  how_long: { factual: true, line: `The site build usually takes a few days. Then we re-check after ${REMEASURE_WEEKS_STANDARD} weeks to see the difference.` },
  who_are_you: { line: "I'm Paul, I run Findable. We help local businesses show up when people ask ai tools for a recommendation. Happy to jump on a quick call if you'd rather talk." },
  /* ⛔ THE ONLY PAST-WORK WORDS (Paul, 2026-10-21): reviews, feedback and the one site we built. No numbers, no client names,
     no percentages, no "100%", no result claim. It offers their report (EXAMPLES_NO_AUDIT when there is none). */
  examples: { factual: true, fixed: true, linkOk: true, line: `${PROOF_WORDS} Happy to talk you through it on a call. Want me to send over the report I did for you too?` },
  definitely: { factual: true, allowPrice: true, line: `I can't promise ai will recommend you, nobody honestly can. What I do promise is we improve ai visibility or you get your ${P1} back.` },
  own_site: { factual: true, allowPrice: true, line: `You always own your domain, and you own the site after the final payment. If you want, I can keep hosting it after that for ${gbp(FINDABLE_CONTINUING_GBP)} a month.` },
  not_now: { line: "No problem. When would be a better time? I'll check back then." },
  too_expensive: { factual: true, allowPrice: true, line: `Fair. It's ${P1} to start and you get it back if we don't improve things, so the risk is small. Want a quick call so I can show you what I found first?` },
  think_about_it: { line: "Of course. Want me to send a voice note so you've got the details in front of you?" },
  /* The "not you" words only under the one-third rule (replyMove picks the soft line otherwise). */
  dont_need: { line: 'Good problem to have. I only got in touch because ai named your competitors and not you. Want a voice note so you can see for yourself?' },
  does_ai_matter: { line: "Fair question. I only reached out because it named your competitors instead of you, and that's easy to check yourself. Want a voice note to show you?" },
  is_bot: { line: "I use ai to help write and check my messages, but I'm Paul from Findable and the results I found are real. Happy to jump on a call if you'd rather talk." },
  privacy: { line: "Fair question. I found your business on google and checked how ai recommends you. I won't message again if you'd rather not. Want me to send what I found so you can judge?" },
  send_email: { line: "Sure, what's the best email? Or I can send a voice note here in a minute if that's quicker.", timingOk: true },
  not_owner: { line: "No worries. Who's the best person to speak to, and is there a good time?" },
  busy: { line: "No problem. What day and time suits you? I'll call then." },
  number_sent: { line: "Thanks, I'll give you a ring. Is there a good time today?", timingOk: true },
  /* ⛔ THE ONLY LINE THAT NAMES AN AI TOOL (Paul, 2026-10-21): they asked which one. replyMove.whichToolLine puts the
     missed search's own engine in front when it is known. */
  which_tool: { factual: true, line: `I check the same questions on ${ENGINE_WORDING}. Want a voice note showing what it said?` },

  /* ── the reply recon's 18 (Paul, 2026-10-21). ⛔ No AI brand ("ai tools"), "regular checks" never "monthly", never "free". ── */
  /* {thing} = "lessons" for a driving school, else "a <trade>"; {trades} in {town} from the lead (replyMove.thinksCustomerLine). */
  thinks_customer: { fixed: true, line: "Ha, sorry for the confusion, I'm not looking for {thing} myself. I'm Paul from Findable. I checked how ai tools recommend {trades} in {town} and wanted to show you what came back. Ok if I send it over?" },
  /* Code-built like the pitch (replyMove.straightAnswerPitch): this answer, then the pitch's lines and its one question. */
  straight_answer_then_pitch: { fixed: true, line: "Fair question, I'm Paul from Findable and yes, I'm offering a service. I only got in touch because of what I found:" },
  /* Needs you: fix the trade on the lead before any re-check. */
  wrong_trade: { line: "Sorry about that, my mistake. What is it you mainly do? I'll check it properly." },
  moved_area: { line: 'No worries, thanks for letting me know. Where are you working now? I can check how you show up there.' },
  closed_retired: { line: 'No worries, sorry to bother you. Best of luck with it.' },
  fully_booked: { line: "Good problem to have. I'll leave you to it, and if it ever goes quiet you know where I am." },
  word_of_mouth: { line: "Fair enough, that's the best kind of work. I'll leave you to it. If you ever want to see how ai tools recommend you, just say." },
  already_show_up: { line: "Fair enough, that's good to hear. It can come out differently depending on who asks and where, so I'd still like to show you what came back when I checked. Want a quick voice note?" },
  /* ⛔ Never "free" (Paul, 2026-10-21). The check back is NOTED on the draft, never written (Next Action is human-set). */
  new_site_being_built: { line: 'Good timing. Is it with an agency, or are you building it yourself?' },
  proof_request: { factual: true, fixed: true, linkOk: true, line: `Fair ask. I can send you the report with the exact searches I ran and what came back. ${PROOF_WORDS} Want me to send the report here?` },
  explain_here: { line: "Sure. Short version: I build you a new site that's set up for ai and google, sort your google business profile, and keep checking how you show up. Want me to send what I found here?" },
  /* Needs you (a commercial ask): the figures and the guarantee are how_much's, word for word. */
  pay_on_results: { factual: true, allowPrice: true,
    line: `I don't work pay-after-results, but you're covered: it's ${P1} to start, and ${GUARANTEE_LOWER} After your results it's ${PM} a month, ${FINDABLE_BUILD_TOTAL_PAYMENTS} payments in total including the first. Quick call to go through it?` },
  ads_question: { line: "No, I don't do ads. I only work on getting businesses recommended when people ask ai tools. Want a quick voice note on what I found for you?" },
  do_it_myself: { line: 'Fair enough, and good luck with it. If you want a second pair of eyes on what I found, just say.' },
  where_based: { fixed: true, linkOk: true, line: `Findable is a UK company, but we work with businesses worldwide. The site's ${FINDABLE_SITE_WORDS} if you want a look. Quick call, or shall I send a voice note?` },
  /* Needs you: only Paul knows if he is free. */
  call_now: { timingOk: true, line: "Yes, I'm free now. Ring me on this number, or give me a time and I'll ring you." },
  sorry_wrong_day: { fixed: true, line: "Fair enough, sorry for the message. I'll leave you in peace." },
  /* Code-built: this apology, then the pitch (replyMove.chasedPitch). */
  they_chased: { fixed: true, line: 'Sorry for the slow reply.' },
};

/** examples / proof_request when no search is on record: offer to run it, never "the report I did". */
export const EXAMPLES_NO_AUDIT = `${PROOF_WORDS} Happy to talk you through it on a call. Want me to run the same check on your business?`;
export const PROOF_NO_AUDIT = `Fair ask. I can run the check and send you the report with the exact searches and what came back. ${PROOF_WORDS} Want me to do that?`;
/** already_show_up when they really were named every time: concede it (recon: the only re-opened no's came from conceding). */
export const ALREADY_SHOW_UP_TRUE = "Fair enough, you're right, you came up every time I checked too. I'll leave you to it.";
/** already_show_up with no search on record. */
export const ALREADY_SHOW_UP_NO_AUDIT = 'Fair enough, that\'s good to hear. It can come out differently depending on who asks and where. Want me to run a quick check and show you what comes back?';
/** After they answer the new-site question (or said who builds it already). */
export const NEW_SITE_CHECK_BACK = `No problem. I'll check back in about ${REMEASURE_WEEKS_STANDARD} weeks once it's settled and re-run the same searches so you can compare.`;
/** A voice note from a prospect (Paul, 2026-10-21): we cannot listen to it on here. Needs you; this is the suggested text. */
export const VOICE_NOTE_FROM_THEM = "Sorry, I can't listen to voice notes on here. Can you type it, or shall I give you a quick call?";

/** The soft lines when AI did NOT name others in two thirds or more (namedShareRule): no "not you", no "instead". */
export const DONT_NEED_SOFT = 'Good problem to have. I only got in touch because when I checked, ai put other businesses forward too. Want a voice note so you can see for yourself?';
export const DOES_AI_MATTER_SOFT = "Fair question. I only reached out because of what ai said when I checked, and that's easy to check yourself. Want a voice note to show you?";
/** No search on record at all. */
export const DONT_NEED_NO_AUDIT = 'Good problem to have. I only got in touch to show you how ai recommends businesses like yours. Want a voice note so you can see for yourself?';
export const DOES_AI_MATTER_NO_AUDIT = "Fair question. More people ask ai tools for a recommendation now, and it's easy to check yourself. Want a voice note to show you?";
/** "No Google listing" honest answer to "how did you get my number". */
export const PRIVACY_NOT_GOOGLE = "Fair question. I found your business online and checked how ai recommends you. I won't message again if you'd rather not. Want me to send what I found so you can judge?";
/** After "go on then" once we already know who runs the site. */
export const GO_ON_KNOWN = "Great. Would you like a quick call, or shall I send a voice note to explain how we'd fix it?";
/** "Not now" with a time already named: no question, check back then. */
export const NOT_NOW_WITH_TIME = "No problem, I'll check back then.";
/** A website given once we already know who runs it. */
export const WEBSITE_GIVEN_KNOWN = "Thanks, I'll take a proper look at that one. Quick call, or shall I send a voice note on what I find?";

/** "Body. Question?" → the body and the ONE question (the last sentence ending "?"), or no question. */
export function splitQuestion(line: string): { body: string; question: string | null } {
  const m = line.match(/^(.*?)([^.?!]*\?)\s*([^?]*)$/s);
  if (!m) return { body: line.trim(), question: null };
  const question = m[2].trim();
  return { body: `${m[1]}${m[3] ? ` ${m[3]}` : ''}`.replace(/\s+/g, ' ').trim(), question };
}

/* ── reading their reply ──────────────────────────────────────────────────────────────────────── */

const norm = (t: string) => String(t ?? '').replace(/[’‘ʼ]/g, "'").replace(/\s+/g, ' ').trim();

/** A trade word in a "we're not a locksmith" / "we don't do pat testing" reply (wrong_trade). */
const TRADE_NOUN = "(?:locksmith\\w*|plumb\\w*|electric\\w*|driving(?:\\s+school)?|instructor\\w*|builder\\w*|roof\\w*|garage|mechanic\\w*|clean\\w*|accountan\\w*|barber\\w*|salon|tutor\\w*|language\\s+school|pat\\s+test\\w*|domestic|commercial|auto\\s+\\w+|gas\\s+\\w+|heating|boiler\\w*|key\\s+cutting|shoe\\s+repairs?)";

export const RE = {
  /** An email address (before a link: "gmail.com" is not their website). */
  emailAddr: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/,
  facebook: /\bfacebook\b|\bfb\b|facebook\.com|\bfb\.com\b/i,
  facebookOnly: /\b(only|just)\s+(?:(?:got|have|use|on)\s+)?(?:a\s+)?(facebook|fb)\b|\b(facebook|fb)\s+(page\s+)?only\b|\b(on|use)\s+(facebook|fb)\s+(instead|mostly)\b/i,
  phoneNumber: /(?:\+44\s?7\d{3}|\b07\d{3}|\b0\d{3,4})[\s-]?\d{3}[\s-]?\d{3,4}\b/,
  agency: /\b(agency|agencies|marketing\s+(company|firm)|web\s*(company|firm|team|design(er)?s?)|digital\s+(company|agency)|(a|my|our|the)\s+(designer|developer|web\s*(guy|person|man))|i\s+pay\s+(him|her|them|someone|a\s+(guy|company))|(got|have)\s+(someone|somebody|a\s+(guy|company|designer|developer))\s+(who|that|doing|on)|yell|bark|thomson\s+local|hibu|they\s+(do|look\s+after|manage)\s+(it|the\s+site|my\s+site|the\s+website))\b/i,
  friend: /\b(my|our|a)\s+(mate|friend|nephew|niece|son|daughter|brother|sister|cousin|wife|husband|partner|dad|mum|uncle|son[- ]in[- ]law|lad|pal)\b|\bfamily\s+(member|friend)\b|\bfriend\s+of\s+(mine|ours)\b/i,
  self: /^\W*(just\s+)?me(\s+mate)?\W*$|\b(myself|my\s+self|ourselves|i\s+do(\s+it)?|we\s+do(\s+it)?|i\s+manage|we\s+manage|i\s+look\s+after|we\s+look\s+after|in[- ]?house|i\s+built\s+it|i\s+made\s+it|diy|wix|squarespace|go\s*daddy)\b/i,
  notSure: /\b(not\s+sure|no\s+idea|don'?t\s+know|dunno|no\s+clue|can'?t\s+remember|unsure|not\s+a\s+clue|not\s+certain)\b/i,
  /** Tied in: "in a contract until March", "signed up for 12 months", "locked in". */
  tied: /\b(tied\s+in(to)?|locked\s+in|in\s+(a|the)\s+contract|on\s+(a|the)\s+contract|under\s+contract|contract\s+(until|till|til|runs|ends|for)|signed\s+(up\s+)?(for|until|till)|\d+\s*(month|year)\s+contract|(yes|yeah|yep)\b.{0,15}\b(tied|contract)|until\s+(the\s+)?(end\s+of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*)\b/i,
  /** Free: "no contract", "rolling", "monthly, can leave", "free to leave". */
  free: /\b(no\s+contract|not\s+(tied|in\s+a\s+contract|locked)|free\s+to\s+(leave|go)|can\s+(leave|cancel|go)\s+(any\s*time|whenever)|rolling|month[- ]to[- ]month|pay\s+as\s+(i|we)\s+go|contract('?s)?\s+(ended|finished|run\s+out|over)|out\s+of\s+contract|(we'?re|i'?m)\s+free|free\s+to\s+change)\b/i,
  voiceWord: /\bvoice\s*(note|message|memo)?\b|\bvn\b|\baudio\b/i,
  callWord: /\b(call|ring|phone|bell|chat\s+on\s+the\s+phone|speak\s+on\s+the\s+phone)\b/i,
  yesish: /^\W*(yes|yeah|yea|yep|yup|yh|ya|ye|aye|sure|ok(ay)?|ok\s+then|go\s+on(\s+then)?|go\s+ahead|please|yes\s+please|sounds\s+good|why\s+not|fine|alright|go\s+for\s+it|do\s+it|send\s+it(\s+over)?|that'?s\s+fine|that\s+works|perfect|great|cool)(\s+(mate|pal|bud|then|please|thanks|thank\s+you|send\s+it|go\s+on|that'?s\s+fine))*\W*$/i,
  goOn: /^\W*(ok(ay)?|ok\s+then|okay\s+then|go\s+on(\s+then)?|go\s+ahead|sure|sure\s+thing|alright|right|carry\s+on|fire\s+away|go\s+for\s+it|yeah\s+go\s+on|yes\s+go\s+on|i'?m\s+listening|and\??|so\??)(\s+(mate|pal|bud|then))?\W*$/i,
  interested: /\b(i'?m\s+interested|we'?re\s+interested|i\s+am\s+interested|interested|tell\s+me\s+more|more\s+info|more\s+details|sounds\s+(good|great|interesting)|keen|what\s+do\s+you\s+suggest)\b/i,
  whatWeDo: /\b(what\s+(do|would)\s+you\s+(do|offer)|what\s+is\s+it\s+you\s+do|what\s+does\s+findable\s+do|what'?s\s+findable|what\s+are\s+you\s+offering|what\s+do\s+you\s+actually\s+do|how\s+does\s+(it|this)\s+work|what\s+exactly)\b/i,
  /** "What's this about?" on the FIRST reply is answered by the pitch itself. */
  whatsThisAbout: /\b(what'?s\s+(this|it)\s+(about|regarding|for)|what\s+is\s+(this|it)\s+(about|regarding|for)|what\s+do\s+you\s+want|what'?s\s+up|how\s+(can|may|could)\s+(i|we)\s+(help|assist)|can\s+(i|we)\s+(help|assist)|what\s+(can|could|may)\s+(i|we)\s+(do|help|assist)(\s+(you\s+)?(for|with))?|is\s+there\s+anything\s+(i|we)\s+can\s+(help|do)|anything\s+(i|we)\s+can\s+(help|do|assist)|do\s+you\s+need\s+(any\s+)?help|what('?s|\s+is|\s+was)\s+(it|this)\s+(concerning|regarding|about)|how\s+(i|we)\s+can\s+(help|assist)|nature\s+of\s+(your|the)\s+(enquiry|inquiry|query|message)|what\s+do\s+you\s+need|what\s+brings\s+you|regarding\??)\b/i,
  howMuch: /\b(how\s+much|prices?|pricing|cost|costs|charge|fee|fees|what\s+do\s+you\s+charge|rates?)\b|£/i,
  catch: /\b(catch|what'?s\s+the\s+(snag|deal|small\s+print)|too\s+good\s+to\s+be\s+true|hidden\s+(fees|costs|charges))\b/i,
  howLong: /\b(how\s+long\s+(does\s+it|will\s+it|to|would\s+it)\s*(take|build)?|how\s+quick(ly)?|how\s+fast|when\s+would\s+it\s+be\s+(ready|live|done)|turnaround)\b/i,
  /** "Which AI?", "what tool did you use?", "was it chatgpt?": the one time a draft may name the tool. */
  whichTool: /\b(?:which|what)\s+(?:ai|a\.i\.?|tool|app|engine|chat\s?bot|search\s+engine|platform)(?:\s+tool)?\b(?!\s+(?:visibility|is\s+recommending))|\bwhat\s+did\s+(?:you|u)\s+(?:use|search\s+(?:on|with))\b|\b(?:was|is)\s+(?:it|that|this)\s+(?:on\s+)?(?:chat\s?gpt|gemini|google|copilot|perplexity)\b|\b(?:chat\s?gpt|gemini|copilot|perplexity)\s*\?/i,
  whoAreYou: /\b(who\s*'?s\s+(this|asking)|who\s+(are\s+(you|u)|is\s+this|asking|is\s+that|am\s+i\s+(speaking|talking)\s+(to|with))|what\s+company|which\s+company|who\s+do\s+you\s+(work|represent)|who\s+you\s+with)\b|^\W*who\W*$/i,
  examples: /\b(examples?|case\s+stud(y|ies)|proof|testimonials?|other\s+(clients|customers|businesses)\s+(you|you'?ve)|who\s+else\s+have\s+you|worked\s+with\s+(anyone|others|before)|any\s+results|show\s+me\s+results|results\s+(for|from)\s+(others|other|anyone)|track\s+record|done\s+this\s+before|has\s+it\s+worked)\b/i,
  definitely: /\b(definitely|will\s+(i|we)\s+(definitely\s+)?(be|get)\s+(recommended|found|on\s+(top|there)|first|more\s+(work|customers|jobs))|can\s+you\s+guarantee|do\s+you\s+guarantee|guarantee(d)?\s+(that\s+)?(i|we|it)'?ll|promise\s+(me|that)|for\s+sure)\b/i,
  ownSite: /\b(who\s+owns|do\s+i\s+own|will\s+i\s+own|would\s+i\s+own|own\s+the\s+(site|website|domain)|whose\s+(site|website)|keep\s+(the|my)\s+(site|website|domain)|my\s+domain|the\s+domain)\b/i,
  notNow: /^\W*(not\s+(right\s+)?now|not\s+at\s+the\s+moment|not\s+this\s+time|not\s+yet|maybe\s+later|later|another\s+time|bad\s+time|not\s+a\s+good\s+time|try\s+(me\s+)?(again\s+)?(later|another\s+time|next\s+\w+)|message\s+me\s+(later|next\s+\w+)|get\s+back\s+to\s+me\s+(later|in\s+\w+|next\s+\w+)|in\s+the\s+new\s+year|after\s+(christmas|xmas|easter|the\s+summer|the\s+holidays))\b|\b(maybe|possibly|perhaps)\s+(later|next\s+(week|month|year)|in\s+the\s+new\s+year|in\s+a\s+(few|couple)\s+(weeks|months))\b|\bget\s+back\s+to\s+me\s+(in|next|after)\b|\btry\s+(me\s+)?again\s+(in|next|after)\b/i,
  tooExpensive: /\b(too\s+(expensive|much|pricey|dear|steep)|can'?t\s+afford|out\s+of\s+(my|our)\s+budget|bit\s+(steep|pricey|much|expensive)|that'?s\s+(a\s+lot|loads|steep|expensive)|no\s+budget|money'?s\s+tight)\b/i,
  thinkAboutIt: /\b(think\s+about\s+it|have\s+a\s+think|let\s+me\s+think|i'?ll\s+think|need\s+to\s+think|mull\s+it\s+over|sleep\s+on\s+it|consider\s+it|let\s+you\s+know|get\s+back\s+to\s+you|talk\s+to\s+(my|the)\s+(wife|husband|partner|boss|business\s+partner))\b/i,
  dontNeed: /\b(don'?t|do\s+not|dont)\s+need\s+(any\s+)?(more\s+)?(customers|work|business|jobs|clients|leads|enquiries)|\b(busy|booked)\s+(enough|up|solid)|\b(plenty|enough|loads|lots)\s+of\s+(work|customers|jobs|business)|\b(fully|fully\s+)?booked\s+up\b|\bturning\s+work\s+away\b|\bwork\s+comes\s+from\s+(word\s+of\s+mouth|referrals)\b|\bword\s+of\s+mouth\b/i,
  doesAiMatter: /\b(nobody|no\s+one|noone|none\s+of\s+my\s+customers|my\s+customers\s+(don'?t|do\s+not))\s+(uses?|ask|asks)\s+(ai|chatgpt|gemini)|\bdoes\s+(ai|it|that)\s+(even\s+)?(matter|make\s+a\s+difference)|\bwho\s+uses\s+(ai|chatgpt|gemini)|\bai\s+(is\s+)?(rubbish|a\s+fad|nonsense|doesn'?t\s+matter)|\bwhy\s+would\s+(i|that)\s+(care|matter)\b|\bnot\s+bothered\s+about\s+ai\b/i,
  sendEmail: /\b(send|drop|pop|put)\s+(me\s+|it\s+|that\s+|the\s+details\s+|something\s+|some\s+info\s+)?(an?\s+|it\s+in\s+an?\s+|via\s+|by\s+|over\s+(by\s+|via\s+)?)?e-?mail\b|\be-?mail\s+(me|it|over|instead)\b|\bvia\s+e-?mail\b|\bby\s+e-?mail\b/i,
  notOwner: /\b(not\s+the\s+(owner|boss|manager|right\s+person|one\s+who\s+(deals|decides))|i\s+(just|only)\s+work\s+(here|for)|i'?m\s+(just\s+)?(the\s+)?(receptionist|admin|office\s+manager|staff|employee|apprentice)|you\s+(need|want)\s+to\s+speak\s+to|speak\s+to\s+(the\s+)?(owner|boss|manager|my\s+(boss|husband|wife|dad|partner))|(owner|boss|manager)\s+(is|isn'?t)\s+(away|out|not\s+here|in))\b/i,
  /** ⛔ Real "busy / call me later" phrases only (reply recon 2026-10-20): the bare word "driving" matched every driving school's
   *  name ("Hi yes this is Pass Me Driving" was answered "What day and time suits you?"). Driving counts only as "I'm driving". */
  busy: /\b(busy|on\s+a\s+job|at\s+work|in\s+a\s+meeting|with\s+a\s+customer|can'?t\s+talk|cant\s+talk|up\s+a\s+ladder|on\s+site|call\s+(me\s+)?(back\s+)?later|(i'?m|im|i\s+am|we'?re|am|currently|just|still)\s+(out\s+)?driving|driving\s+(at\s+the\s+moment|right\s+now|atm|currently|just\s+now|today))\b/i,
  /** Away / on leave / out of action, said as the reason they cannot talk ("I'm away until the 18th"). Parked, never pitched. */
  away: /\b(i'?m|im|i\s+am|we'?re|we\s+are|i'?ll\s+be|we'?ll\s+be)\s+(away|off|on\s+(annual\s+)?leave|on\s+holiday|out\s+of\s+action|unavailable|abroad)\b|\b(away|unavailable|out\s+of\s+action|off\s+work)\s+(until|till|til|for)\b|\bon\s+(annual\s+)?(leave|holiday)\b|\bout\s+of\s+action\b|\bannual\s+leave\b/i,
  /** A day / time they named. */
  namedTime: /\b(\d{1,2}(:\d{2})?\s*(am|pm)|\d{1,2}\s*o'?clock|after\s+\d|before\s+\d|around\s+\d|about\s+\d|at\s+\d|tomorrow|today|tonight|this\s+(morning|afternoon|evening)|(mon|tues|wednes|thurs|fri|satur|sun)day|lunch(time)?|later\s+today|in\s+(an?|\d+)\s*(hour|hours|mins?|minutes))\b/i,
  monthYear: /\b(next\s+(week|month|year)|in\s+(a|\d+|a\s+few|a\s+couple\s+of|two|three|four|six)\s+(weeks?|months?|years?)|(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*|end\s+of\s+(the\s+)?(year|month)|new\s+year|after\s+(christmas|xmas|easter|the\s+summer))\b/i,

  /* ── the reply recon's readers (2026-10-21, §5a / §5b). Real wordings from the book. ─────────────── */
  /** B7: who runs the site, the wider forms ("an seo guy", "a company who deal with it", "my business partner is in marketing"). */
  agencyStrong: /\b(?:a|an|my|our|the)\s+seo\s+(?:guy|man|bloke|person|company|firm|agency|expert|team)\b|\b(?:a|an|my|our|the)\s+(?:\w+\s+)?company\s+(?:who|that|which)\s+(?:deals?|does|looks?\s+after|handles?|manages?|sorts?|runs?)\b|\bin\s+marketing\b|\b(?:a|my|our|the)\s+marketing\s+(?:company|firm|guy|person|team|people|agency|partner)\b|\bsomeone\s+(?:who\s+)?(?:manages|looks\s+after|does)\s+(?:the|my|our)\s+(?:web)?site\b|\bmassive\s+marketing\b/i,
  /** They think WE are the customer ("are you looking for lessons?", "automatic or manual?", "do you need a locksmith?"). */
  thinksCustomer: /\b(?:are\s+(?:you|u)|r\s+u|you|u)\s+(?:looking\s+(?:for|to\s+(?:book|take))|wanting|after|want(?:ing)?\s+to\s+(?:take|book))\s+(?:some\s+|a\s+)?(?:driving\s+)?(?:lessons?|course)\b|\bif\s+you\s+are\s+wanting\s+(?:driving\s+)?lessons\b|\bautomatic\s+or\s+manual\b|\bany\s+previous\s+(?:driving\s+)?experience\b|\bdo\s+(?:you|u)\s+need\s+(?:a|an)\s+(?:electrician|plumber|locksmith|instructor|lesson|quote|engineer|builder|roofer|cleaner)\b|\bdid\s+(?:you|u)\s+still\s+want\s+(?:lessons|a\s+quote|the\s+job)\b|\btext\s+(?:me\s+|us\s+)?your\s+postcode\b|\bpractical\s+test\s+booked\b|\bwhat\s+(?:job|work)\s+(?:do\s+you\s+need|is\s+it)\b/i,
  /** "What are you selling?", "is this a sales / cold call?", "what do you want?", and a bare "Why" / "What?" (B4). */
  straightAsk: /\bwhat\s+(?:are|r)\s+(?:you|u)\s+selling\b|\b(?:going\s+to|gonna)\s+(?:try\s+(?:and|to)\s+)?sell\s+me\b|\btry(?:ing)?\s+(?:and|to)\s+sell\s+me\b|\b(?:a\s+)?(?:sales|cold)\s+call\b|\bwhat\s+do\s+(?:you|u)\s+want\b|\bwhat\s+is\s+it\s+you\s+want\b|^\W*(?:why|what|wot|wat|eh)\W*$/i,
  wrongTrade: new RegExp(['\\b(?:we|i)\\s+(?:don\'?t|do\\s+not|dont)\\s+(?:do|offer|operate|teach)\\s+(?:any\\s+)?(?:an?\\s+)?' + TRADE_NOUN,
    '\\b(?:we\'?re|we\\s+are|i\'?m|i\\s+am|im)\\s+not\\s+(?:an?\\s+)?' + TRADE_NOUN, '\\bi\'?m\\s+an?\\s+auto\\s+\\w+', '\\bthose\\s+are\\s+(?:all\\s+)?(?:domestic|commercial)\\b',
    '\\bwhy\\s+would\\b.{0,60}\\bbe\\s+under\\b', '\\bwrong\\s+(?:trade|business|category|type\\s+of\\s+business)\\b', '\\bnot\\s+the\\s+same\\s+thing\\b', '\\bwe\\s+don\'?t\\s+operate\\s+an?\\b'].join('|'), 'i'),
  movedArea: /\b(?:i'?m|we'?re|i\s+am|we\s+are|im)\s+not\s+(?:in|based\s+in|working\s+in)\s+[\w ]{2,30}?\s+any\s?more\b|\bno\s+longer\s+(?:live|work|based|cover|operate)\b.{0,25}\b(?:area|in|there)\b|\b(?:i'?ve|we'?ve|i\s+have|we\s+have)\s+moved\s+(?:away|to|out)\b|\bdon'?t\s+(?:cover|work\s+in)\s+that\s+area\s+any\s?more\b/i,
  closedRetired: /\bno\s+longer\s+trading\b|\b(?:i'?ve|i\s+have|i'?m|i\s+am|we'?ve|we\s+have|im)\s+(?:recently\s+|now\s+|just\s+)?retired\b|\bclos(?:ing|ed)\s+(?:the\s+|my\s+|our\s+)?(?:business|company|shop)\b|\bceased\s+trading\b|\bgone\s+out\s+of\s+business\b|\bwound\s+(?:the\s+business\s+)?up\b|\bstopped\s+trading\b/i,
  fullyBooked: /\bfully\s+booked\b|\bwaiting\s+list\b|\bdiary\s+is\s+(?:full|booked|rammed)\b|\b(?:booked|full)\s+(?:up\s+)?(?:for|until|till)\s+(?:months|weeks|the\s+foreseeable)\b|\bnot\s+taking\s+(?:on\s+)?(?:any\s+)?(?:more|new|further)\s+(?:work|enquiries|customers|pupils|students|clients|jobs)\b|\btoo\s+busy\s+(?:for|to\s+take)\b|\bstopped\s+(?:all\s+)?(?:kinds\s+of\s+)?advertising\b|\bturning\s+(?:work|people|customers|jobs)\s+away\b|\bcan\s*(?:not|'?t)\s+(?:handle|cope\s+with|take)\s+(?:any\s+)?more\b/i,
  wordOfMouth: /\bword\s+of\s+mouth\b|\b(?:busy|work|jobs)\b.{0,30}\b(?:recommendations|referrals)\b|\b(?:all|mostly|only)\s+(?:from\s+)?(?:recommendations|referrals)\b|\b\d+\s+years\s+in\s+the\s+(?:job|trade|business)\b/i,
  alreadyShowUp: /\bi\s+(?:already\s+|actually\s+|do\s+)*(?:show\s+up|come\s+up|appear|come\s+top|rank)\b.{0,40}\b(?:ai|chat\s?gpt|gemini|search|top)\b|\b(?:chat\s?gpt|ai|gemini)\s+(?:has\s+)?recommended\s+me\b|\bsaid\s+(?:chat\s?gpt|ai|gemini)\s+recommended\b|\bi\s+(?:actually\s+)?come\s+top\b|\byou\s+(?:still\s+)?found\s+me\b|\bcan'?t\s+be\s+that\s+hard\s+to\s+find\b/i,
  newSite: /\b(?:getting|having|got)\s+(?:a\s+)?new\s+(?:web)?site\s+(?:built|made|done|designed)\b|\bnew\s+(?:web)?site\s+(?:is\s+)?(?:being\s+)?(?:built|made|designed|in\s+progress|on\s+the\s+way|coming)\b|\b(?:it'?s|its|site'?s|website'?s|site\s+has|website\s+has)\s+(?:just\s+)?(?:been\s+)?(?:re-?built|re-?done|re-?designed|launched)\b|\bjust\s+(?:had|got)\s+(?:a\s+|the\s+|my\s+)?(?:web)?site\s+(?:re-?built|re-?done|re-?designed|built|made)\b|\bonly\s+just\s+launched\b|\bbeing\s+re-?built\b|\bin\s+(?:the\s+)?process\s+of\s+(?:getting|building|having)\s+(?:a\s+)?new\s+(?:web)?site\b/i,
  /** Evidence of THEIR result, or of our work ("send the evidence", "screenshots", "a demo", "references", "the full report"). */
  proofRequest: /\b(?:send|show)\s+(?:me\s+|us\s+)?(?:the\s+)?(?:specific\s+|exact\s+)?(?:evidence|screenshots?|proof|issues\s+you\s+found|exact\s+fixes)\b|\breview\s+the\s+evidence\b|\b(?:any\s+)?demo\b|\breferences?\b|\ba\s+website\s+(?:to\s+look\s+at|you'?ve\s+(?:done|built|made))\b|\b(?:see|send)\s+(?:me\s+)?the\s+full\s+report\b|\bexamples?\s+of\s+(?:your|the)\s+work\b/i,
  /** Proof we cannot send (Paul, 2026-10-21): a reference / client contact, a testimonial or case study. Needs you. */
  proofCantSend: /\breferences?\b|\btestimonials?\b|\bcase\s+stud(?:y|ies)\b|\b(?:speak|talk)\s+to\s+(?:one\s+of\s+)?(?:your\s+)?(?:clients|customers)\b|\bclient\s+(?:list|contacts?|details)\b/i,
  /** They asked for it in writing ("please explain here", "send me some details"): keep their channel. */
  explainHere: /\b(?:explain|tell\s+me)\s+(?:it\s+|me\s+)?(?:here|on\s+here|in\s+writing|by\s+text|over\s+text|via\s+(?:text|message|whatsapp))\b|\bplease\s+explain\b|\byou\s+can\s+explain\b|\bexplain\s+in\s+writing\b|\bsend\s+(?:me\s+)?(?:over\s+)?(?:some\s+)?(?:details|info|information|more\s+info)\b|\bput\s+it\s+in\s+writing\b/i,
  payOnResults: /\bpay(?:ment)?\s+(?:is\s+)?(?:made\s+)?(?:only\s+)?(?:after|on|once|when)\s+(?:we\s+|i\s+)?(?:see\s+|achieve\s+|get\s+)?(?:results|it\s+works)\b|\bonly\s+(?:pay|agree)\b.{0,60}\b(?:after|once|when)\b.{0,40}\bresults\b|\bfoc\b|\bfree\s+of\s+charge\b|\bshow\s+(?:us|me)\s+what\s+you\s+can\s+do\b.{0,30}\b(?:first|free|foc)\b|\bno\s+win\s+no\s+fee\b|\buntil\s+i\s+(?:saw|see)\s+(?:some\s+)?results\b|\bpay\s+on\s+results\b/i,
  ads: /\b(?:google\s+)?ads\b|\badwords\b|\bppc\b|\bpay\s+per\s+click\b|\b(?:tried|done|did)\s+seo\b|\bseo\s+(?:didn'?t|did\s+not|doesn'?t)\s+work\b/i,
  doItMyself: /\b(?:i'?ll|i\s+will|we'?ll|we\s+will|gonna|going\s+to)\s+(?:probably\s+)?(?:just\s+)?(?:learn|do|sort|fix|figure)\b.{0,60}\b(?:my\s*self|ourselves)\b|\bget\s+(?:claude|chat\s?gpt|ai|gemini)(?:\s+ai)?\s+to\s+(?:fix|sort|resolve|do)\b|\bi'?m\s+an?\s+(?:ai|seo)\s+(?:expert|developer|engineer)\b|\bi\s+know\s+(?:ai|seo)\b/i,
  whereBased: /\b(?:are\s+(?:you|u)|r\s+u)\s+(?:uk|u\.k\.|british)\s*(?:based)?\b|\bwhere\s+(?:are\s+(?:you|u)|r\s+u|is\s+(?:your\s+)?(?:company|business))\s+based\b|\bwhere\s+are\s+(?:you|u)\s+from\b|\bwhat'?s\s+(?:your|the)\s+(?:company|business)\s+(?:called|name)\b|\bname\s+of\s+(?:your|the)\s+company\b|\bwhat'?s\s+your\s+website\b|\bhave\s+(?:you|u)\s+got\s+a\s+website\b/i,
  /** They want to talk now / call us ("you free now?", "can I call you?", "are you free to call?"). */
  callNow: /\b(?:are\s+)?(?:you|u)\s+free\s+(?:now|to\s+(?:talk|call|chat|speak))\b|\bcan\s+i\s+(?:call|ring|phone)\s+(?:you|u)\b|\bshall\s+i\s+(?:call|ring)\s+(?:you|u)\b|\bcan\s+(?:you|u)\s+(?:talk|speak|call)\s+(?:now|right\s+now)\b|\bfree\s+for\s+a\s+(?:call|chat)\s+now\b/i,
  sorryWrongDay: /\b(?:it'?s|its)\s+(?:a\s+)?(?:sunday|saturday|bank\s+holiday|christmas|boxing\s+day)\b|\bhave\s+a\s+day\s+off\b|\bon\s+the\s+booze\b|\bat\s+this\s+time\s+of\s+(?:night|the\s+morning)\b|\bon\s+a\s+(?:sunday|saturday)\b.{0,20}\breally\b/i,
  /** They chased us after we did not answer ("just wanted to follow up", "??", "any update?"). */
  chase: /\b(?:just\s+)?(?:wanted\s+to\s+)?follow(?:ing)?\s+up\b|\bany\s+updates?\b|^\W*\?+\W*$|\bdid\s+(?:you|u)\s+get\s+my\s+(?:last\s+)?message\b|\bstill\s+there\b|\bhel+o+\s*\?|\bhel+o{3,}\b/i,
  /** Someone else's business or number given ("this is the number for Leon's locks", "I'll give you my son's details"). */
  thirdParty: /\bthis\s+is\s+the\s+number\s+for\b|\bgive\s+you\s+(?:my|his|her)\s+\w+'?s\s+(?:number|details)\b|\b(?:my|his|her)\s+(?:son|daughter|brother|dad|mate|friend|partner|wife|husband)'?s\s+(?:details|number|business)\b|\bmy\s+other\s+business\b/i,
  /** B9: a decline in their own words. A reason after it does not make it a conversation. */
  decline: /\b(?:thanks|thank\s+you)\s+(?:anyway|but\s+no)\b|\bi\s+am\s+(?:ok|fine|good|alright|sorted)\b|\b(?:i'?m|we'?re|im)\s+all\s+good\b|\bnot\s+(?:needed|required)\b|\bdon'?t\s+need\s+(?:your|any|the)\s+(?:services?|help)\b|\bnot\s+interested\b|\bno\s+thanks?\b|\bno\s+thank\s+you\b|\bnot\s+for\s+(?:me|us)\b/i,
  /** "How much to get to the top?": the honest no-promise answer, even inside a not-now (R078). */
  topAsk: /\bget\s+(?:me\s+|us\s+)?(?:to\s+)?(?:the\s+)?top\b|\bnumber\s+one\s+spot\b/i,
  /** "Can we start after the end of the month?": not now, with their timing noted. */
  startLater: /\b(?:can|could)\s+we\s+(?:start|do\s+(?:it|this)|begin|look\s+at\s+(?:it|this))\s+(?:this\s+)?(?:just\s+)?(?:after|in|next|from|at\s+the\s+(?:end|start))\b/i,
  /** B10: rude, underhand, attacks on the message. A complaint (no draft), never an opt-out on its own. */
  complaint: /\b(?:rude|underhand|out\s+of\s+order|cheeky|slop|your\s+rubbish|bad\s+manners|unprofessional|tactics)\b/i,
};

/* ── end dates: "until March", "another 6 months", "end of the year" → a check-back day ──────────── */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, 'a few': 3, 'a couple of': 2, couple: 2, few: 3 };
/** Check back this many days before the end they gave (never before tomorrow). */
export const CHECK_BACK_DAYS_BEFORE = 14;

export interface FollowUpNote {
  /** Their own words for when it ends. */
  said: string;
  /** The end, as a day (YYYY-MM-DD), read from their words. */
  endsOn: string;
  /** The day to set the Next Action for (a person sets it; nothing is written here). */
  checkBackOn: string;
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));

/** Their end date, or null when no date can be read. Never guessed: a bare "a while" is null. */
export function readEndDate(text: string, nowMs: number = Date.now()): FollowUpNote | null {
  const t = norm(text).toLowerCase();
  const now = new Date(nowMs);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let end: Date | null = null; let said = '';
  const rel = t.match(/\b(?:in|for|another|about|around|got|have|next)?\s*(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a\s+few|a\s+couple\s+of|couple|few|\d{1,2})\s+(weeks?|months?|years?)\b/);
  const day = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  const mon = t.match(/\b(?:end\s+of\s+|until\s+|till\s+|til\s+|in\s+|by\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+(20\d\d))?\b/);
  if (day) {
    const d = Number(day[1] ?? day[4]); const m = MONTHS.indexOf((day[2] ?? day[3]).slice(0, 3));
    let y = today.getUTCFullYear(); let c = new Date(Date.UTC(y, m, d));
    if (c < today) c = new Date(Date.UTC(++y, m, d));
    end = c; said = day[0];
  } else if (/\bend\s+of\s+(the\s+)?year\b/.test(t)) {
    end = new Date(Date.UTC(today.getUTCFullYear(), 11, 31)); said = 'the end of the year';
  } else if (/\bnew\s+year\b|\bnext\s+year\b/.test(t)) {
    end = new Date(Date.UTC(today.getUTCFullYear() + 1, 0, 1)); said = 'the new year';
  } else if (/\bend\s+of\s+(the\s+)?month\b/.test(t)) {
    end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)); said = 'the end of the month';
  } else if (/\bnext\s+month\b/.test(t)) {
    end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)); said = 'next month';
  } else if (mon && !/\bmay\s+(be|have|not|i|we|need)\b/.test(t)) {
    const m = MONTHS.indexOf(mon[1].slice(0, 3));
    let y = mon[2] ? Number(mon[2]) : today.getUTCFullYear();
    /* "until March" = the end of March; a month already past this year is next year's. */
    let c = new Date(Date.UTC(y, m + 1, 0));
    if (!mon[2] && c < today) c = new Date(Date.UTC(++y, m + 1, 0));
    end = c; said = mon[0].trim();
  } else if (rel) {
    const n = /^\d+$/.test(rel[1]) ? Number(rel[1]) : NUMBER_WORDS[rel[1].replace(/\s+/g, ' ')] ?? null;
    if (n && n > 0) {
      const unit = rel[2].replace(/s$/, '');
      end = unit === 'week' ? addDays(today, n * 7) : unit === 'month' ? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + n, today.getUTCDate())) : new Date(Date.UTC(today.getUTCFullYear() + n, today.getUTCMonth(), today.getUTCDate()));
      said = rel[0].trim();
    }
  }
  if (!end || end <= today) return null;
  const back = addDays(end, -CHECK_BACK_DAYS_BEFORE);
  const tomorrow = addDays(today, 1);
  return { said, endsOn: ymd(end), checkBackOn: ymd(back < tomorrow ? tomorrow : back) };
}

/* ── a name they gave us ("Dom here", "Yes, this is Dom") ───────────────────────────────────────── */

const NOT_A_NAME = new Set(['yes', 'yeah', 'yep', 'yup', 'yh', 'ye', 'ya', 'aye', 'no', 'nope', 'hi', 'hello', 'hey', 'hiya', 'speaking', 'correct',
  'right', 'sure', 'ok', 'okay', 'mate', 'pal', 'bud', 'buddy', 'here', 'me', 'him', 'her', 'he', 'she', 'us', 'we', 'it', 'this', 'that', 'the', 'owner',
  'boss', 'manager', 'sorry', 'thanks', 'cheers', 'morning', 'afternoon', 'evening', 'indeed', 'certainly', 'who', 'what', 'how', 'why', 'busy',
  'driving', 'working', 'just', 'still', 'not', 'is', 'am', 'are', 'was', 'good', 'fine', 'great', 'interested', 'help', 'possible', 'speak', 'talking',
  /* Reply recon 2026-10-20: the words that were greeted as names ("Hi Away,", "Hi About,"). */
  'away', 'on', 'out', 'off', 'about', 'fully', 'always', 'retired', 'my', 'there', 'one', 'our', 'all', 'so', 'actually', 'unavailable', 'probably',
  'urgent', 'free', 'currently', 'in', 'an', 'a', 'at', 'back', 'closed', 'open', 'abroad', 'leave', 'holiday', 'ues', 'yeas', 'yess', 'yea', 'also',
  'only', 'very', 'really', 'quite', 'now', 'today', 'sorry', 'apologies', 'unfortunately', 'thank', 'please', 'welcome', 'dear', 'sir', 'madam',
  'regards', 'kind', 'best', 'many', 'much', 'some', 'any', 'no', 'for', 'from', 'with', 'and', 'but', 'or', 'if', 'then', 'when', 'where', 'which',
  'driver', 'driving', 'school', 'electrical', 'plumbing', 'heating', 'locksmith', 'locksmiths', 'services', 'service', 'ltd', 'limited', 'group']);
/** Common UK first names: the only words accepted when a name is the WHOLE message ("Dom") or follows "yes". A name introduced by
 *  "my name is / this is / it's / I'm / X here" is checked against the stoplist instead. Not a mine of people; a guard. */
const FIRST_NAMES = new Set(('adam alan alex alexander alfie andrew andy anthony barry ben benjamin bill billy bob brian callum carl charlie chris christopher colin craig dan daniel danny darren dave david dean declan dennis derek dom dominic don donald doug duncan ed eddie edward elliot ewan frank fred gareth gary gavin geoff george gerald glen gordon graham grant greg harry henry ian jack jacob jake james jamie jason jay jeff jeremy jim jimmy joe joel john johnny jon jonathan joseph josh joshua keith ken kenny kevin kieran kyle lee leon leo lewis liam luke malcolm marc mark martin matt matthew mick mike mohammed muhammad nathan neil nick nigel noel oliver oscar owen pat patrick paul peter phil philip ray rhys richard rob robert robbie roger ron ross roy russell ryan sam samuel scott sean shane simon spencer stephen steve steven stuart ted terry thomas tim timothy toby tom tommy tony trevor vince wayne will william zak zach zac aaron abdul ahmed ali amir asif imran omar raj sanjay ravi amy angela anna anne beth becky bethany carol caroline charlotte chloe claire dawn debbie deborah diane donna eleanor ella ellie emily emma eve fiona gemma gill gillian hannah helen holly jackie jane janet jean jemma jenny jess jessica jill joanne jo julie karen kate katie kath kathy kay kim kirsty laura lauren leanne linda lisa lorraine louise lucy lynn margaret maria mary megan michelle mandy nicola nicole pam pamela patricia paula penny rachel rebecca rosie ruth sally sam sandra sarah sharon sheila sophie stacey susan suzanne tina tracy vicky victoria wendy zoe').split(/\s+/));
const asName = (w: string | undefined) => {
  const s = String(w ?? '').replace(/[^A-Za-z'-]/g, '');
  if (s.length < 2 || s.length > 15 || NOT_A_NAME.has(s.toLowerCase()) || !/^[A-Z][a-z'-]+$/.test(s)) return null; // Capitalised as typed; "UPC" and "im mark" are no name
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};
/** A first name they gave in this reply, or null. ⛔ Only clear forms (Paul, 2026-10-21; reply recon: 3 of 21 greetings were right):
 *  "my name is Dom", "this is Dom", "it's Dom", "I'm Dom", "Dom here / Dom speaking" (a surname after it is dropped), or the WHOLE message
 *  being a known first name ("Dom", "Yes Dom"). Typed with a capital. Never a stoplist word or a word of the business's name.
 *  "This is Pass Smart Driving School" (a capital word follows) and "this is Steve Bullimore the locksmith" give no name. Unsure = null. */
export function nameFromReply(text: string, businessName = ''): string | null {
  const t = norm(text).replace(/[!.?,]+$/g, '');
  const biz = norm(businessName).toLowerCase();
  const pick = (w: string | undefined, listed = false) => {
    const n = asName(w);
    if (!n || biz.split(/\W+/).includes(n.toLowerCase())) return null;
    return !listed || FIRST_NAMES.has(n.toLowerCase()) ? n : null;
  };
  /* An introduction: the next word must not start a business name ("this is Pass Smart Driving") unless it is "from / the / and / ,". */
  const intro = t.match(/(?:\b(?:[Tt]his\s+is|[Ii]t'?s|[Ii]ts|[Ii]'?m|[Ii]\s+am|[Mm]y\s+name'?s|[Mm]y\s+name\s+is|[Nn]ame'?s))\s+([A-Z][a-z'-]+)(?:\s+([A-Za-z][A-Za-z'-]*))?/);
  if (intro) {
    const follow = intro[2] ?? '';
    if (/^[A-Z]/.test(follow)) return null; // two capitalised words: a business or a full name, not a clear first name
    return pick(intro[1]);
  }
  const here = t.match(/^\W*(?:(?:[Yy]es|[Yy]eah|[Yy]ep|[Hh]i|[Hh]ello|[Hh]ey)\W+)?([A-Za-z][a-z'-]+)(?:\s+[A-Z][a-z'-]+)?\s+(?:here|speaking)\b/);
  /* A name typed in lower case ("dom here") counts only when it is a known first name. */
  if (here) return /^[a-z]/.test(here[1]) ? pick(here[1].charAt(0).toUpperCase() + here[1].slice(1), true) : pick(here[1]);
  const lone = t.match(/^\W*(?:(?:[Yy]es|[Yy]eah|[Yy]ep|[Yy]h)\W+(?:[Ii]t\s+is\W+)?)?([A-Z][a-z'-]+)\W*$/);
  return lone ? pick(lone[1], true) : null;
}

/* ── a rival with (nearly) the lead's own name is not a rival ──────────────────────────────────── */

const LEGAL = /\b(ltd|limited|llp|plc|inc|co|company|uk|the|and|&|services|service|group)\b/g;
const core = (s: string) => norm(s).toLowerCase().replace(/[^a-z0-9& ]+/g, ' ').replace(LEGAL, ' ').replace(/\s+/g, ' ').trim();
function editRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  const m = a.length; const n = b.length;
  const d: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= n; j++) { const tmp = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
  }
  return 1 - d[n] / Math.max(m, n);
}
/** "Smith Plumbing Ltd" vs "Smith Plumbing & Heating": the same business as far as a prospect can tell. */
export function nearSameName(a: string, b: string): boolean {
  const x = core(a); const y = core(b);
  if (!x || !y) return false;
  if (x === y || (x.length >= 5 && y.includes(x)) || (y.length >= 5 && x.includes(y))) return true;
  if (editRatio(x.replace(/\s/g, ''), y.replace(/\s/g, '')) >= 0.85) return true;
  const xs = new Set(x.split(' ')); const ys = new Set(y.split(' '));
  const shared = [...xs].filter((w) => ys.has(w)).length;
  return shared >= 2 && shared / Math.min(xs.size, ys.size) >= 0.8;
}
/** The rivals a draft may name: never one that is (nearly) the lead itself. */
export const rivalsExcludingSelf = (rivals: readonly string[], businessName: string): string[] => rivals.filter((r) => !nearSameName(r, businessName));

/* ── the follow-up style: chatgpt, gemini, google ai, ai in lower case (Paul, 2026-10-20) ─────────── */

/** Lower-cases the tool and brand words in a FOLLOW-UP (never the first pitch). Run after the sentence capitals. */
export function lowerBrands(text: string): string {
  return String(text ?? '')
    .replace(/\bchat\s?gpt\b/gi, 'chatgpt')
    .replace(/\bgoogle\s+ai\b/gi, 'google ai')
    .replace(/\bgemini\b/gi, 'gemini')
    .replace(/\bgoogle\b(?!\.)/gi, 'google')
    .replace(/\bfacebook\b(?!\.)/gi, 'facebook')
    .replace(/\bAI\b/g, 'ai');
}
/** A sentence that starts with a brand ("chatgpt said…"): a warning in a follow-up. */
export const startsWithBrand = (text: string) => /(^|[.!?]\s+|\n\s*)(chatgpt|gemini|google|ai|facebook)\b/i.test(String(text ?? '').trim());
