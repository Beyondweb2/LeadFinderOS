/* ══ WHAT'S NEW (Sales Experience release 5, 2026-09-28; the full report, 2026-10-01) ══════════════
   A plain list in the code — not a CMS. Newest FIRST.
   ⛔ EVERY DEPLOY THAT CHANGES WHAT SOMEONE SEES OR WHAT THE APP DOES ADDS AN ENTRY (Paul, 2026-10-01:
   "everytime a new update is deployed it must say what it is here … a full report of what changed, what
   was removed and what was added and an explanation of what effect that actually has, keep it simple no
   fluff"). From WHATS_NEW_REPORT_FROM every entry carries `report` (scripts/sales-feedback.test.ts
   refuses one without it). Give it a new id (the drawer’s "new" dot compares against the newest id seen).
   `audience`: who it is written for ('all' shows to both roles). Plain words, short lines, no fluff. */
export interface WhatsNewReport {
  /** New things you can now see or do. */
  added: string[];
  /** Things that work differently now. */
  changed: string[];
  /** Things that are gone. */
  removed: string[];
  /** What this actually means for you, in one or two sentences. */
  effect: string;
}
export interface WhatsNewEntry { id: string; date: string; title: string; body: string; audience: 'all' | 'sales' | 'admin'; report?: WhatsNewReport }

/** Entries dated on/after this must carry a report (older ones were written before the rule). */
export const WHATS_NEW_REPORT_FROM = '2026-10-01';

export const WHATS_NEW: readonly WhatsNewEntry[] = [
  { id: '2026-10-06-quick-report-soft-redesign', date: '2026-10-06', title: 'The quick report has a softer design and shows both AI answers', audience: 'all',
    body: 'The six-answer quick report keeps its dark Findable header and footer, with softer rounded sections in between. The featured question now shows what ChatGPT said and what Google AI said, side by side.',
    report: {
      added: [
        'Both AI answers to the featured question, each marked Named or Not named. The business is highlighted in green where an answer names it, and competitors in yellow.',
        'A line under the header: 3 questions × 2 AI engines × 1 ask each, 6 answers total.',
      ],
      changed: [
        'The score sits in the dark header band: the overall % and a card for ChatGPT and for Google AI.',
        'Website issues and Why this matters sit side by side on a computer and stack on a phone.',
        'On a phone each AI answer is shortened with a fade so the page is quicker to scroll.',
      ],
      removed: [
        'The single-answer "Featured missed search" box and its side panel.',
      ],
      effect: 'A prospect sees at a glance what each AI said about their search and who it named. Scores, links, the Get started and Request a call buttons, and every other report are unchanged.',
    } },
  { id: '2026-10-06-quick-report-no-schema', date: '2026-10-06', title: 'Quick report no longer lists "no structured data" as a website issue', audience: 'all',
    body: 'The six-answer quick report now leaves out the generic "Your site doesn\'t label the basics" line. Our own testing found it made no difference to whether AI names a business.',
    report: {
      added: [],
      changed: [
        'Website issues on the quick report show only the stronger findings. A site whose only finding was missing structured data now shows "No technical faults found".',
      ],
      removed: [
        'The "Your site doesn\'t label the basics (no structured data)" issue, from the six-answer quick report only.',
      ],
      effect: 'Every issue on the quick report is one you can defend on a call. The Crawl button and full reports still show the structured-data check, and a misleading one (business details pointing at a different website) still appears on the quick report.',
    } },
  { id: '2026-10-06-quick-report-concept4', date: '2026-10-06', title: 'The Quick AI Visibility Check report has a new design', audience: 'all',
    body: 'The six-answer quick report now opens with the score, then shows the search the business was missed on with what the AI actually said, the names it gave instead, every question, the website issues and a short "why this matters".',
    report: {
      added: [
        'The AI\'s own answer to the featured missed search, cleaned of map pins, star ratings and other listing clutter, with the competitors it named highlighted.',
        'ChatGPT and Google AI marks beside their scores and answers.',
        'A "Why this matters" strip: how many answers missed them and how many other businesses were named instead.',
      ],
      changed: [
        'The score is the first thing on the page: the big %, "X of 6 answers named you", and ChatGPT and Google AI out of 3 in colour (red none, amber some, green half or more).',
        'Website issues show as High or Medium. No website and a clean website keep their existing wording.',
        'A business named in all 6 answers gets a green "Every answer named you" instead of a missed search.',
      ],
      removed: [
        'The old percentage hero and the names-only featured box on this one report type.',
      ],
      effect: 'When you send or open a quick report, the prospect sees the proof straight away: what was asked, what the AI said, and who it named instead. Report links, the Get started and Request a call buttons, and every other report are unchanged.',
    } },
  { id: '2026-10-06-one-click-checks-50', date: '2026-10-06', title: 'Check before calling starts in one click, and you get 50 checks a day', audience: 'all',
    body: 'Tick leads and press Check before calling: the checks start straight away, with no pop-up. Each person now gets 50 new checks a day instead of 30.',
    report: {
      added: [
        '"Daily check limit reached" on the check bar when you have none left today.',
      ],
      changed: [
        'Check before calling starts the checks the moment you press it. Progress shows on each row and on the one-line bar above the list.',
        'Checks left today now counts down from 50 instead of 30. A batch is still at most 20 leads.',
        'A lead checked in the last 14 days reuses that result automatically. It is free and does not use one of your 50.',
      ],
      removed: [
        'The "Check N leads before calling" pop-up and its second Check button.',
        'The "Check again even if checked recently" tick box.',
      ],
      effect: 'One press instead of two, and room for two full batches plus a half one each day. At 0 left you can still press it: recent results still come through, only new checks wait until tomorrow.',
    } },
  { id: '2026-10-06-sales-team-today', date: '2026-10-06', title: 'A Call screen you can use on the phone, and onboarding no longer blocks selling', audience: 'all',
    body: 'The AI result is at the top of the Call tab, in colour. The script starts with the reason for the call, then the real website reasons, then one question: do they manage the website or does an agency. The onboarding checklist no longer stops anyone selling.',
    report: {
      added: [
        'The AI result at the top of the Call tab: ChatGPT and Google AI scores in colour (green all named, amber some, red none), the overall % named, the best missed search and who was named instead.',
        'The first question is always "Do you manage the website yourself, or does an agency do it?" with two buttons. Agency opens the contract and cost questions, and a cheaper-angle line only when what they pay is more than ours.',
        'Optimise | Build switch on the offer: one plan open at a time, the right one picked from their website.',
        'Objections as buttons: tap one, its answer opens.',
      ],
      changed: [
        'The opener: "Hi mate, I was looking for a plumber in Rugby, so I asked Google AI and it mentioned …, but not you." Never "from Findable", never "I messaged you" or a day.',
        'Outreach rows say Google AI instead of Gemini, and the scores are coloured.',
        'The onboarding checklist (18+, right to work, bank details, VAT, company, start date, team guide) is now Paul\'s record on the Team page. It no longer blocks Find Leads, claiming, checks, calls, messages or Quick Close. A suspended, ended or disabled login is still stopped.',
      ],
      removed: [
        'The LinkedIn and Email scripts, the gatekeeper and voicemail lines, "if they\'d rather see it first", the research links, the "where does most of your work come from" question, and the second copy of the AI result lower down the Call tab.',
        'The "You are not Ready to Sell yet" banner.',
      ],
      effect: 'Scan the AI result, say the opener, ask the first question, log the call, Quick Close. Prices, the agreement and payments are unchanged.',
    } },
  { id: '2026-10-06-call-workspace-log', date: '2026-10-06', title: 'The Call tab: status at the top, one Log button', audience: 'all',
    body: 'Open a lead and its status and next action are at the top. Press Log, pick what happened, and only the outcomes that need a next step ask for one.',
    report: {
      added: [
        'A Log button at the top of every lead (and Log outcome under the script). It opens a small window: Interested, Not interested, Didn’t answer, Call back, Send onboarding, Wrong number, Left voicemail.',
        'After Call back it asks when to call. After Interested it asks what happens next: Send onboarding, Call back, Set follow-up or No next action. After Didn’t answer it offers a day to try again (Skip is fine).',
        'Send onboarding records Interested and opens the Close tab (Quick Close) — the same sign-up, agreement and payment page as before.',
      ],
      changed: [
        'The status pill and the next action sit at the top of the lead. Change the status from that pill; tap the next action to edit it.',
        'Calls are logged as Call automatically. "Logged as: Call · Change" switches channel when you need to. Spoke to owner and Meeting booked are under More outcomes.',
        'A note can still go with the outcome (Add note). The internal note stays on Details.',
        'Admin: Mark paid is now a small button on the Close tab, not a big green bar under every tab. Same button, same result.',
      ],
      removed: ['The Status, Log a contact and Next action cards at the bottom of the Call tab.', 'The green Mark Paid bar at the bottom of the lead.'],
      effect: 'While calling you see the script and one Log button, not a form. What you record and what it does to the lead are exactly the same as before.',
      } },
  { id: '2026-10-06-paid-client-tools', date: '2026-10-06', title: 'Page plan, page generator and review replies are inside Paid clients', audience: 'admin',
    body: 'The three tools are no longer separate menu items. They are in Paid clients: the switch at the top of the list (every client), and "Pages & reviews" on each client\'s page (that client only). Old links still work.',
    report: {
      added: [
        'Paid clients has a switch at the top: Clients · Page plan · Page generator · Review replies.',
        'Each client\'s page has a "Pages & reviews" section with the same three tools, already set to that client.',
        '"Build this page" on a client\'s page plan opens the generator right there, on that page.',
      ],
      changed: [
        'Old links to Review replies, Page generator and Page plan open the same tool inside Paid clients, with the same client and page.',
        'Paid clients is in the phone menu (More).',
      ],
      removed: ['Review replies, Page generator and Page plan from the side menu.'],
      effect: 'Everything about a paying client is in one place. Nothing the tools could do has gone.',
    } },
  { id: '2026-10-06-one-look', date: '2026-10-06', title: 'One look across the app', audience: 'all',
    body: 'Pop-ups, the Paid client pages, Team and the admin cards now use the same colours, icons and cards as the Sales dashboard.',
    report: {
      added: ['Coloured status chips, and a coloured edge on cards that need attention (amber), are done (teal) or are blocked (red).'],
      changed: [
        'Pop-ups have a clear header with an icon, rounder corners, and their buttons sit side by side on a phone instead of stacking.',
        'Tabs look like the Sales dashboard\'s switches.',
        'Fewer grey boxes inside grey boxes: sections inside a card are marked by a coloured line and a heading.',
      ],
      removed: [],
      effect: 'The whole app reads as one product. Nothing works differently.',
    } },
  { id: '2026-10-05-sales-small-fixes', date: '2026-10-05', title: 'Four small fixes: unsaved notes, start dates, clearer refusals, link expiry', audience: 'all',
    body: 'Escape no longer throws away a note you have not saved. A salesperson is Ready to Sell from their start date, not before. If your onboarding is not finished, the app now says so instead of "usage paused". The sign-up link says "about 30 days", not "715 hours".',
    report: {
      added: [
        'Leaving a lead with something typed but not saved (Escape, clicking outside, the X, Previous / Next) asks "Discard unsaved changes?". Keep editing is the default.',
      ],
      changed: [
        'With nothing typed, Escape and close work exactly as before. No extra question.',
        'A salesperson whose start date is still to come is not Ready to Sell yet. Their checklist says "Starts on …".',
        'When onboarding is not finished, Find Leads, adding or claiming a lead, campaigns, checks and CSV import say "Complete your onboarding before using …" and list what is still needed. A real pause or suspension still says so.',
        'Quick Close shows how long the sign-up link lasts in days ("about 30 days"). The link itself lasts as long as before.',
      ],
      removed: ['"Usage temporarily paused" shown to a salesperson whose only problem was unfinished onboarding.'],
      effect: 'You will not lose a note by pressing Escape, and when something is refused you are told the real reason.',
    } },
  { id: '2026-10-05-attribution-review', date: '2026-10-05', title: 'Attribution review: choose the seller from the evidence', audience: 'admin',
    body: 'A sale waiting for attribution is nobody’s revenue until you decide. It no longer lands on your row or on whoever holds the lead now. The review card shows the evidence, and you choose the seller, override with a reason, or mark it Not credited.',
    report: {
      added: [
        'Team page: the review card shows the payment, who made the paid sign-up, the claimed seller, the owner at payment and every sign-up link made for the client.',
        '"Who sold it?": a seller from that evidence, someone else with a written reason, or Not credited. Each decision is final and recorded.',
        'Under the team table: "£X awaiting attribution" and "£X not credited to a salesperson" when there is any.',
      ],
      changed: [
        'A sale under review counts in the business totals but in nobody’s sales, commission or "Sold by" until it is decided.',
        'Paid Clients and the client card never name the current owner as the seller.',
      ],
      removed: ['Crediting an undecided sale to the book owner (you) or to the lead’s current holder.'],
      effect: 'Business revenue stays complete, and nobody is credited for a sale until you have decided who made it.',
    } },
  { id: '2026-10-05-outreach-compact-checks', date: '2026-10-05', title: 'Outreach: the AI check sits on each row', audience: 'all',
    body: 'The big "Check before calling" results panel is gone. Each checked lead now shows ChatGPT and Gemini scores and a Call screen button on its own row. The detail is on the call screen.',
    report: {
      added: [
        'On every checked row: "ChatGPT 1/3 · Gemini 0/3" and a Call screen button that opens the lead on its Call tab, where "Full audit & website evidence" has the detail.',
        'One line above the list: how your check is going, checks left today, Stop, and "Open next ready", which opens the next ready lead in the list as you have it filtered.',
        'Retry on a failed check.',
      ],
      changed: [
        'Selecting leads and pressing "Check before calling" works as before: the same daily allowance, the same reuse of recent results.',
        'A recently reused result looks the same as a fresh one.',
      ],
      removed: ['The large results panel at the top of Outreach that listed the batch again.'],
      effect: 'The list stays a list. You see who is worth calling at a glance and open the call screen for the detail.',
    } },
  { id: '2026-10-05-prospect-full-audit', date: '2026-10-05', title: 'A full audit window for every prospect', audience: 'all',
    body: 'The AI check details and the website evidence now open in one large window you can read during a call — on a phone it fills the screen. The website crawl checks much more and groups repeated problems.',
    report: {
      added: [
        '"Full audit & website evidence" on the lead’s Call tab, "View full audit" on the AI check card, and "Full audit" on the Crawl check popup — all open the same window.',
        'For this call: are they showing up in AI, what is wrong with the website, and the strongest point to raise, each with the evidence behind it.',
        'ChatGPT and Google AI side by side: named or not for each question, who was named instead, the sources each answer cited, and the full answer.',
        'Website evidence grouped by topic and marked High / Medium / Low / Verified: crawler access (including ChatGPT’s search crawler), robots.txt and sitemap, noindex and canonical problems, broken pages, business name / town / phone / services, thin and copy-paste pages, customer questions answered, reviews and credentials, titles, phone layout and structured data.',
        'A repeated problem is one line with how many pages it affects, five examples and "Show all".',
      ],
      changed: [
        'A prospect crawl reads up to 500 pages. On a bigger site it says it was capped and how many pages were not read. Paying clients’ crawls still read every page.',
        'Pressing Crawl site within 7 days of the last full crawl opens the saved result instead of crawling the site again. It says it is saved.',
        'A crawl that fails says why: the site did not answer, a certificate error, the address does not exist, a redirect loop, or it blocked us.',
      ],
      removed: ['The small details overlay that scrolled inside the AI check card.'],
      effect: 'Before or during a call you can open one window and see whether AI names them, what is wrong with their site and what to say. Crawling never uses your AI checks.',
    } },
  { id: '2026-10-05-csv-import-admin', date: '2026-10-05', title: 'CSV import works again', audience: 'admin',
    body: 'Import on Outreach adds leads from a CSV again. It had been adding nothing while saying it had. Every row is checked first, and new leads are yours. Nobody is messaged.',
    report: {
      added: [
        'A column-matching step: business name, contact, phone, email, website, address, postcode, town, trade, notes and Google Maps link, each picked from your file.',
        'Check rows before importing. It shows rows found, valid, invalid, repeated in the file, already in the system, new, fill-in-blanks and skipped, with every problem row by its spreadsheet row number and the reason.',
        'A salesperson who is Ready to Sell can import too. Their new leads are theirs.',
      ],
      changed: [
        'The database decides everything: duplicates, the owner (always the person importing) and what is valid. A duplicate is the same Google Place ID, phone number or Google Maps listing as a lead already in the system — no second lead is made.',
        'The same business name alone is only a "possible match": the row is still added and flagged, because many businesses share a name across towns. The same website, or the same name and the same postcode or address, is held until you tick "import these too".',
        'A lead that is already yours only has its blank contact, email, website, address or trade filled in. Nothing is overwritten.',
        'Someone else’s lead, or an unassigned one, is skipped and listed. It is never taken over. Claim unassigned ones from Unassigned.',
        'Imported leads show "Source: CSV import" in their history.',
      ],
      removed: ['The old import, which wrote leads straight from the browser and was refused by the database every time.'],
      effect: 'You can bring in a list from a spreadsheet and see exactly what will happen before anything is saved. An import never messages, queues or changes the stage of anyone.',
    } },
  { id: '2026-10-05-csv-import-sales', date: '2026-10-05', title: 'Import leads from a CSV', audience: 'sales',
    body: 'Outreach has an Import button. Bring in a list of businesses from a spreadsheet; the new ones become your leads. Nobody is messaged.',
    report: {
      added: [
        'Import on Outreach: choose a CSV, match its columns, press Check rows to see what will happen, then Import.',
        'Every row that cannot be added is listed with the reason: no business name, phone or email not valid, repeated in the file, already your lead, or already belongs to another team member.',
      ],
      changed: [],
      removed: [],
      effect: 'New businesses from your list land in your leads, ready to work. Anything already owned by someone else is left alone.',
    } },
  { id: '2026-10-05-outreach-my-leads', date: '2026-10-05', title: 'Outreach opens on your own leads', audience: 'admin',
    body: 'Outreach now opens on My leads — only the leads you own. Unassigned leads, a salesperson’s leads or the whole team show only when you choose them, and queueing WhatsApp across several people’s leads asks you first. Leads you add from Find Leads are now yours from the start.',
    report: {
      added: [
        'A "Whose leads" choice on Outreach: My leads (you own them), Unassigned (nobody owns them), each salesperson by name, or All team (owned) — every lead someone owns, not the unassigned ones. A line under the count says what the view holds; anything other than My leads shows an amber tag.',
        'Claim for me, in the Unassigned view: tick the leads you want and they become yours (up to 200 a press). Nobody is messaged.',
        'When the ticked leads belong to more than one person, Queue WhatsApp says how many and whose, and needs a second press on "Queue across team". Cancel is the default.',
      ],
      changed: [
        'Outreach always opens on My leads. Picking a salesperson or All team lasts for that visit only.',
        'The count, Select all and every bulk action only ever cover the leads in the current view. Ticks are cleared when you switch whose leads you are looking at.',
        'Leads you add from Find Leads or Coverage are owned by you from the moment they are added (they used to land as unassigned). A salesperson’s adds are theirs.',
        'Launching a campaign only messages the leads owned by that campaign’s owner. Anyone else’s lead in it is listed as "owned by someone else", and an unassigned one as "owned by nobody yet — claim them first"; neither is messaged.',
        'Opening a salesperson’s lead from a link (the WhatsApp page, a notification) switches the view to that person’s leads so it can open.',
      ],
      removed: ['"Any owner" as the starting view.'],
      effect: 'You can no longer message another salesperson’s prospects by accident. Looking at the team’s leads is still one click, but it is always your choice.',
    } },
  { id: '2026-10-05-client-missing-info', date: '2026-10-05', title: 'Paid Clients: ask for missing information in one click', audience: 'admin',
    body: 'A paid client with missing setup details now shows one Missing information box with two actions: ask the salesperson who sold it, or contact the client.',
    report: {
      added: [
        'Missing information box on a paid client: what is missing and who can answer it.',
        'Find what we already have — shows what other forms they filled in, the website crawl, the salesperson’s handoff and the sales-call answers already hold, each source on its own. Press Use on the one you trust; website finds are marked as guesses to confirm.',
        'Ask salesperson — only when someone else sold it. They get a CLIENT INFO NEEDED notice that opens that client’s handoff. Pressing it again never sends a second request; “Remind again” appears after a day.',
        'Contact client — opens their WhatsApp conversation in the Inbox (or a new one under the usual template rules), else an email draft or their number.',
        'In the Inbox, an internal “Need from this client” note with Copy request / Put in reply box. It is never sent by itself.',
      ],
      changed: [
        'The Sales handoff box shows the salesperson, their last update and your request’s status.',
        'History records when you asked, when they answered, and when you opened the client’s contact (never as a message sent).',
      ],
      removed: [],
      effect: 'You can finish a client’s setup from their page instead of working out who to ask; the checklist updates by itself when the details arrive.',
    } },
  { id: '2026-10-05-client-info-needed', date: '2026-10-05', title: 'CLIENT INFO NEEDED: Paul may ask about your sale', audience: 'sales',
    body: 'If one of your paid clients is missing details, Paul can ask you for them. You see it on your Sales page and in your notifications.',
    report: {
      added: [
        'A CLIENT INFO NEEDED notice that opens that client’s handoff directly.',
        'On that screen: the missing details Paul asked for, and a short form for services, areas, the current website and who controls it.',
      ],
      changed: ['“Finish the handoff” lists a sale Paul has asked about first, with what he asked for.'],
      removed: [],
      effect: 'Add anything you collected during the sale and save — Paul is told and his setup checklist updates at once.',
    } },
  { id: '2026-10-04-qa-safety', date: '2026-10-04', title: 'Test accounts can never message a real business', audience: 'admin',
    body: 'Before salespeople get logins, test accounts and test leads are now fenced off from real WhatsApps, real payments and the business numbers.',
    report: {
      added: [
        'Test leads (marked as test, or on a 07700 900 number) are never sent to WhatsApp: the message is recorded as simulated and the lead moves on as if it had been sent.',
        'A safe way to test a £99 payment without money, used only on test leads.',
      ],
      changed: [
        'A real business held by a test account can no longer be messaged from anywhere; the sender is told why.',
        'Paid Clients drops a test client once its test is finished and archived.',
        'The whole-team sales performance view leaves out test accounts and test leads.',
        'Client emails about a test lead (the agreement link, the signed agreement copy) can only go to paul@move37.fun; any other address is refused and nothing is sent. Real clients are unchanged.',
      ],
      removed: [],
      effect: 'The pre-sales certification can run the real sales and payment flow end to end without contacting anyone real or touching the real numbers.',
    } },
  { id: '2026-10-03-campaigns-top-right-and-queue', date: '2026-10-03', title: 'Campaigns from the top right, and your own WhatsApp queue', audience: 'all',
    body: 'Campaigns opens from the top right of Find Leads and Outreach (not the menu). Salespeople now see their own WhatsApp queue on Outreach.',
    report: {
      added: [
        'A Campaigns button at the top right of Find Leads and Outreach, next to the campaign dropdown.',
        'For salespeople: a WhatsApp queue card on Outreach showing your queued leads in send order, whether the queue is sending, and a button to take a lead back out.',
      ],
      changed: [
        'New campaign… in the campaign dropdown asks only for a name, for everyone. Manage campaigns… opens the Campaigns page.',
        'The queue card updates straight away after you queue a lead, launch a campaign or stop one.',
      ],
      removed: ['Campaigns from the side menu and the phone menu.'],
      effect: 'Campaigns are where you already pick them, and a salesperson can see and manage exactly what they have waiting to send.',
    } },
  { id: '2026-10-03-campaigns-for-sales', date: '2026-10-03', title: 'Run your own campaigns', audience: 'sales',
    body: 'Campaigns is now in your menu. Name a campaign, pick your leads, check the first message and launch. Only you see your campaigns.',
    report: {
      added: [
        'A Campaigns page with your campaigns: status, leads, how many were messaged, replies and what to do next.',
        'New campaign in four steps: name, leads, message, review and launch. You can also save it as a draft.',
        'On each campaign: launch or send to new leads, stop sending, add leads, rename, and delete while it is empty.',
      ],
      changed: [
        'Every campaign name is unique. If a name is taken you are told so and pick another.',
        'You can only put your leads into your own campaigns.',
      ],
      removed: ['Campaign settings you never needed (type, trade, sale type, channel): set for you.'],
      effect: 'You can group your own leads and send them the first message in one go, without any settings, and nobody else sees your campaigns.',
    } },
  { id: '2026-10-03-campaigns-admin', date: '2026-10-03', title: 'Campaigns page: every campaign, and whose it is', audience: 'admin',
    body: 'A Campaigns page lists every campaign. Ones a salesperson created show their name in brackets; yours stay plain. Salespeople now see only their own.',
    report: {
      added: [
        'Campaigns in the menu: every campaign with status, leads, messaged, replies, and an Owner filter.',
        'Salespeople create and run their own campaigns; the old settings stay yours under Advanced settings.',
      ],
      changed: [
        'Campaign names are unique across LeadFinderOS (ignoring capitals and extra spaces).',
        'A salesperson no longer sees your campaigns or another salesperson’s anywhere (lists, dashboard, Quick Close).',
        'In campaign dropdowns, a salesperson’s campaign shows their name in brackets.',
      ],
      removed: [],
      effect: 'You can tell your campaigns from the team’s at a glance, and each salesperson works only in their own.',
    } },
  { id: '2026-10-03-client-completed-early', date: '2026-10-03', title: 'Paid clients can be marked Completed when they end early', audience: 'admin',
    body: 'A paid client who stops before their payments run out can now be marked Completed. Their payment and history stay; re-measure, monthly updates and delivery stop.',
    report: {
      added: [
        '“Mark completed (client ended early)…” on a paid client page, with a required note. It emails you to cancel any live subscription in Stripe; the app never charges or refunds.',
        'A Completed card at the top of an ended client’s page: nothing further to do, since when, and the note.',
      ],
      changed: [
        'An ended client shows COMPLETED (client ended early) or ENDED (dispute) on Paid Clients, with no setup count, no missing list and no next step.',
        'On an ended client’s page, Remeasure reads “not scheduled”, Monthly update reads “no monthly updates”, and the agreement reads “not needed” (no link to send).',
        'MCLocksmiths is marked Completed: Morgan went back to his previous website. The £99 he paid stays.',
      ],
      removed: [],
      effect: 'A client who has finished early no longer looks like unfinished work anywhere, and their payment history is unchanged.',
    } },
  { id: '2026-10-02-log-this-call', date: '2026-10-02', title: 'Log the call straight from the call script', audience: 'all',
    body: 'The call script now ends in “Log this call”. It opens the lead’s Work tab with Log a contact open, ready for the outcome and the Next Action.',
    report: {
      added: ['A “Log this call” button at the end of the call script, in the lead’s Scripts tab and in the script you open from an Outreach row.'],
      changed: ['When Log a contact opens for a call, it scrolls into view instead of sitting below the audit card.'],
      removed: [],
      effect: 'You can read the script, make the call and record what happened (and the next step) without hunting for the right tab.',
    } },
  { id: '2026-10-02-audit-report-copy-recorded', date: '2026-10-02', title: 'Copying a report link on the AI Audit page is now recorded', audience: 'admin',
    body: 'Copy report link on the AI Audit page now records the copy on the lead, the same as the copy button in the lead workspace.',
    report: {
      added: [],
      changed: ['Copy report link on the AI Audit page records the copy on the lead, so the lead shows the link was copied.'],
      removed: [],
      effect: 'The lead’s report-link history no longer misses links you copied from the AI Audit page.',
    } },
  { id: '2026-10-02-monthly-client-update', date: '2026-10-02', title: 'Prepare and record each client’s monthly update', audience: 'admin',
    body: 'Every paid client page now has “8. Monthly update”: pick the month, see that month’s AI visibility checks and recorded work, write what was done and what is next, copy it to the client, then mark it sent.',
    report: {
      added: [
        '“8. Monthly update” on every paid client page, one update per client per month.',
        'A “What we measured” paragraph written from that month’s stored AI visibility checks. It says so when there was no check, only one, or when the checks can’t be compared fairly.',
        'The pages marked live and the opportunities marked implemented that month, each with an Add button, so you choose what goes in.',
        'Save draft, Copy text, and Mark as sent (email, WhatsApp or another way). A sent update is kept exactly as sent.',
      ],
      changed: [],
      removed: [],
      effect: 'The monthly update findable.live promises now has a place to be written and a record that it went. Nothing is sent automatically; you still send it yourself.',
    } },
  { id: '2026-10-02-no-review-replies-stage', date: '2026-10-02', title: 'Review replies are no longer a delivery step', audience: 'admin',
    body: 'The paid client page no longer lists Review Replies among its delivery steps, because replying to reviews is not part of what Findable delivers.',
    report: {
      added: [],
      changed: ['The delivery steps on a paid client page are renumbered: 5. Remeasure, 6. Results, 7. Ongoing opportunities.'],
      removed: ['The "5. Review Replies" step and its button on the paid client page. The Review replies tool itself is still in the sidebar.'],
      effect: 'The client page now only lists work Findable actually delivers.',
    } },
  { id: '2026-10-02-lead-sync-gaps', date: '2026-10-02', title: 'A “Not interested” now clears the Next Action wherever you set it', audience: 'all',
    body: 'Setting Not interested from the status pill or the status menu now clears the lead’s Next Action, the same as logging it as a call outcome. Screens also stay in step more reliably.',
    report: {
      added: [],
      changed: [
        'Not interested chosen from the Inbox status pill or the Outreach status menu clears the lead’s Next Action (and any meeting), exactly as logging “Not interested” already did.',
        'The Sales dashboard updates within a couple of seconds of you changing a lead, instead of after up to a minute.',
        'Remove from inbox, and queueing an opener from the lead popup, now update every open screen and tab.',
      ],
      removed: [],
      effect: 'A lead that said no no longer keeps a call or meeting reminder on some screens, and what you see is the same in Inbox, Outreach, the lead popup and your dashboard.',
    } },
  { id: '2026-10-02-client-agreement', date: '2026-10-02', title: 'Clients now accept the Client Service Agreement online', audience: 'admin',
    body: 'Every client accepts the agreement at checkout, and signs it on their own agreement page from the Welcome Pack. Each acceptance is kept as a permanent record.',
    report: {
      added: [
        'A required tick on the Stripe payment page: "I agree to the Findable Client Service Agreement, including the minimum term", linked to the client’s own agreement.',
        'An agreement page for each client at findable.live/agree/…: the full agreement with their business and service filled in, their details, and an "I agree and sign" button.',
        'A signed PDF of exactly what was agreed, emailed to the client and to paul@findable.live after each acceptance.',
        'A "Your agreement: the key points" page in the Welcome Pack, with a button and a QR code to the client’s agreement page, or "Agreement accepted on … by …" once signed.',
        'On the Paid Client screen: whether the agreement is accepted, when, by whom and how, a Build / Optimise selector, and Copy / Send agreement link.',
      ],
      changed: [
        'Re-measurement is four weeks for every new client. The eight weeks for a site on a brand-new domain is gone from the guarantee, the website, the payment receipt and the Welcome Pack. Clients with a recorded date keep it.',
        'The Welcome Pack contents list fits on one page with the new agreement section.',
      ],
      removed: [
        'The "eight weeks if we build your site on a brand-new domain" note, everywhere.',
      ],
      effect: 'Every new client has a binding, dated record of the agreement they accepted, with a PDF copy for both sides, and nobody can edit or delete it.',
    } },
  { id: '2026-10-02-my-activity-scope', date: '2026-10-02', title: '"My activity: hidden" now hides your outreach from Sales intelligence too', audience: 'admin',
    body: 'The same toggle at the top of the Admin dashboard now leaves your own outreach out of every sales figure, not just the team table.',
    report: {
      added: [],
      changed: [
        'With "My activity: hidden", your own WhatsApps, calls, replies, interested, not interested and meetings are left out of: Sales team performance, Why prospects say no, WhatsApp templates, Outreach channels, Niches and the bottleneck checks.',
        'Counts, reply rates and contacted → sale are worked out again on the server without your activity, so the percentages are correct, not just smaller.',
        'A salesperson\'s work on a lead you added, or a client you now deliver, still counts. Only what you did yourself is left out (including the automatic WhatsApps sent on leads you held).',
      ],
      removed: [],
      effect: 'Hidden shows how the sales team is really doing. Included shows the whole business as before. Money, clients, handoffs, What needs you, costs and the website never change with the toggle.',
    } },
  { id: '2026-10-02-welcome-pack-copy', date: '2026-10-02', title: 'The Welcome Pack is clearer, and in a better order', audience: 'all',
    body: 'The pack a new client receives is rewritten in plain English and now tells the story in order: what we do, why it works, where they stand, what happens next.',
    report: {
      added: [
        'A "What happens next" page: baseline locked, we do the work, first re-measure at four weeks, the before and after, then the monthly work.',
        'The baseline page explains the numbers: how many questions, asked how many times, what the percentage means ("roughly 1 in every 3 times a customer asks").',
        'It says what the monthly pays for: a new page each month, a monthly check of AI visibility, adjustments over time, and hosting and maintenance.',
      ],
      changed: [
        'New page order: Your plan, How it works, Where you stand today, What happens next, What we have on file, Get more reviews, then the report.',
        'No wording promises that AI will recommend or name the client. What ChatGPT and Gemini tend to read is described as what our measurements have often shown.',
        'The question list adds up: named every time + sometimes + never = all the questions; "only one AI tool" is a separate note.',
        'Every page of the pack fits on one printed page.',
      ],
      removed: [
        'The stray "&#39;" that printed in the guarantee on the plan page.',
        'The "be careful of anyone who promises" line.',
      ],
      effect: 'A new client can read the pack once and understand what they bought, where they stand today, and that the work carries on every month after week four.',
    } },
  { id: '2026-10-02-admin-control-centre', date: '2026-10-02', title: 'The Admin dashboard is now a sales control centre', audience: 'admin',
    body: 'The Admin dashboard is rebuilt around running the team: new sales and handoffs, your actions, one table of salespeople, and simple money.',
    report: {
      added: [
        'New sales & handoffs: every paid client still being handed over or set up, and anything sold in the last two weeks — who sold it, what was paid, Build or Optimise, setup progress, what is missing, and the one next step (from the same rules as Paid Clients). Tap a client to open their Paid Client record.',
        'Sales team performance: one salesperson per row — active / quiet / inactive and when they were last active, sales this month and their commission rate, WhatsApps, calls, replies, interested, not interested, meetings, sales, contacted → sale and overdue follow-ups.',
        '"My activity: hidden / included" at the top: hides your own outreach from the team table (hidden to start with). Money, clients and your actions always show.',
        'Business at a glance: revenue this month, new clients this month, how many things need you, commission due.',
      ],
      changed: [
        'What needs you: only your actions. New clients show as one line pointing at New sales & handoffs; client steps follow the Paid Clients workflow (no more "Start the baseline" before Discovery).',
        'A salesperson who leaves a handoff for two days or more becomes yours to chase, on that client\'s card.',
        'Money is one panel: collected, paying clients, refunds and disputes, commission added, after commission.',
        'Clients in delivery (folded) no longer repeats clients that are in New sales & handoffs.',
      ],
      removed: [
        'The Today tiles, Team comparison, the sales funnel and the calls panel — the team table holds their numbers once.',
        'The old Sales team board panel (what you sent the team). Send to sales team stays at the top, and Assign stays on Your actions.',
        'The separate Revenue, Money overview and Commission panels — one Money panel and the glance figures replace them. Commission by salesperson stays on the Sales dashboard (Everyone).',
      ],
      effect: 'You can see in one screen who on the team is doing well or falling behind, which new clients need you, and what to do next — without your own old outreach skewing the team numbers.',
    } },
  { id: '2026-10-02-dashboards-dark-cards', date: '2026-10-02', title: 'Dashboards: richer dark cards, money at a glance, tidier on a phone', audience: 'all',
    body: 'The Sales dashboard has a new dark look with your money beside your month, and both dashboards fit a phone better.',
    report: {
      added: [
        'Beside your month: three money cards — earned this month (with when it is paid), total earned to date, and expected over the next six months.',
        '"Show all" on What to do next: the six most urgent show first, the rest are one tap away.',
      ],
      changed: [
        'The "this month" card is a dark indigo card instead of solid green: the rate you are on glows amber, unlocked rates are teal and ticked, locked ones are muted.',
        'Money is shown in teal across both dashboards (it was green).',
        'Your next 6 months is its own chart, next to your recent wins.',
        'The order: your month and money, then what to do next and follow-ups, then your work numbers, then the next six months and recent wins.',
        '"How your commission works" is folded away at the bottom — the rates are on the month card.',
        'On a phone: the three work numbers sit in one row, the follow-up lists wrap instead of scrolling sideways.',
        'Admin: today\'s figures come first, then Needs your attention. On a phone, the Assign / Handled / Suppress buttons sit under each item instead of squeezing it, and "Write one now" has its own line.',
      ],
      removed: [
        'The money figures inside the six-month chart (they now sit once, beside your month).',
      ],
      effect: 'The things that matter — your month, your next rate and your money — are all on the first screen, in colours that are easy to read. Every number is the same as before.',
    } },
  { id: '2026-10-02-dashboards-redesign', date: '2026-10-02', title: 'A new Sales dashboard, and a cleaner Admin dashboard', audience: 'all',
    body: 'The Sales dashboard is redesigned and is now first in the sales menu. Both dashboards share one cleaner, more colourful look.',
    report: {
      added: [
        'A big green "this month" card at the top of the Sales dashboard: your sales, how many more to unlock the next rate, what your next sale earns, and what you have earned this month.',
        'The three rates (30% / 40% / 50%) now show as steps: ticked when unlocked, bright for the one you are on, locked for the ones to come.',
        '"Your earnings": total earned to date, this month, and what is expected over the next six months, with the six months drawn as one bar chart (collected solid green, expected pale purple). Tap a month to see the clients behind it.',
      ],
      changed: [
        'Sales: the page is called "Sales dashboard", it is first in your menu (then Outreach, WhatsApp, Find Leads) and it is where you land when you sign in.',
        'The order of the Sales dashboard: your month, your work numbers, what to do next, your earnings, then recent wins and how commission works.',
        '"How your commission works" is now a short list of the rules; the rates and money live in the cards above it.',
        'Admin: the page is called "Admin dashboard", with coloured section headings that say what each part is for. Traffic and System are one section, "Website & usage".',
        'Both dashboards share the same header, cards, figures, colours and buttons, so they look like one product.',
      ],
      removed: [
        '"This month, week by week" on the Sales dashboard — it counted the same sales the top card already shows.',
        'The repeat of your rate, the tiers and the totals inside "How your commission works".',
      ],
      effect: 'You can see in a few seconds how your month is going, what your next sale is worth and what is coming in — with less on the page to read. Every number is the same as before; only the layout changed.',
    } },
  { id: '2026-10-02-find-leads-age-agency-filter', date: '2026-10-02', title: 'Find Leads: business age works on every search, a sharper agency check', audience: 'all',
    body: 'Business age now runs on every new search, the agency check reads more of each site, and the Filter menu fits on your screen.',
    report: {
      added: [
        'Business age on every Find Leads search: each UK result with no website shows "Checking…" straight away, then its age from Companies House.',
      ],
      changed: [
        'Business age was not running on real searches (the results arrived without their address). It now runs on the first search and every new one, with no refresh.',
        'The agency check reads a little more of each site (a credits or privacy page, every footer) and finds more real "Website by …" credits. It takes a moment longer per site.',
        'The Filter menu never runs off the screen: it stays inside the window and scrolls inside itself when it is long.',
      ],
      removed: [],
      effect: 'You can sort and filter by business age on any search, and fewer agency-run sites slip through as "No agency evidence".',
    } },
  { id: '2026-10-02-commission-six-forecast', date: '2026-10-02', title: 'Monthly commission on six payments, and your next six months', audience: 'sales',
    body: 'You now earn 20% of the next six monthly payments from each client (it was three), and Sales shows what you have earned and what your clients are expected to pay you over the next six months.',
    report: {
      added: [
        '"Your next 6 months" on Sales: this month and the next five, each split into collected and expected. Tap a month to see which clients and payments are in it.',
        'Total earned to date, this month, and the total expected over the six months.',
        '"+ Set next action" in a WhatsApp conversation\'s header (or the action itself, like "Call · Tomorrow") — the same Next Action as everywhere else.',
      ],
      changed: [
        'Monthly commission: 20% of each of the next six successful monthly payments from a client (not the first payment). Payment seven onwards earns nothing. A failed, refunded or charged-back payment earns nothing.',
        'The ladder says where you are: "1 more sale to unlock 40%", then "40% unlocked · 12 more sales to unlock 50%". The 30% / 40% / 50% rates are unchanged.',
        'Monthly commission is earned while you work with Findable. If that ends, what you earned stays yours; payments after it earn no new commission.',
      ],
      removed: [
        'Find email in the WhatsApp header and on the lead popup. Email addresses already on a lead still show.',
      ],
      effect: 'Each client you sell can now pay you on seven payments instead of four, and you can see what is coming in before it lands. Expected is not earned until the client pays.',
    } },
  { id: '2026-10-01-paid-client-setup', date: '2026-10-01', title: 'Paid Clients: one checklist, one next step', audience: 'admin',
    body: 'A payment now lands as a Paid Client with its setup checklist worked out, one next step, and one "New Findable client" email to you.',
    report: {
      added: [
        'Every paid client shows where it is (Setup, Ready for delivery, Discovery, Baseline questions, Baseline, Build / optimise, Launched, Remeasure) and ONE next step.',
        'A setup checklist on each client: what is in, what is not needed for them (no Google profile, no website, your own sale), what is missing and who owes it — sales, the client or you.',
        'Filters on Paid Clients: Needs attention, Ready, In delivery, All.',
        'The sales handoff (what we are doing, the website situation, what they want, anything promised, why they bought, the decision maker, notes for you) — filled in by the salesperson, pre-filled from what we already know.',
        'Submit for delivery, Confirm GBP access, and Copy client setup link on the client page.',
        'History on the client page: payment, handoff, client details, ready for delivery, Discovery, questions frozen, baseline, build started, launched.',
      ],
      changed: [
        'The payment email is now "New Findable client: …" with the package, salesperson, website, site management, services found, the handoff, setup n/m, what you are waiting for, the next step and a link to the client. It is sent once per client, whatever Stripe retries.',
        'READY TO START / MISSING INFORMATION is now three states: WAITING FOR INFORMATION (something required is missing), READY TO SUBMIT (everything is in) and READY FOR DELIVERY (submitted). A client with no Google profile is no longer blocked.',
        "The client's post-payment form arrives with the services and towns we already have, for them to confirm.",
      ],
      removed: [
        'Payment no longer drafts baseline questions. Questions come after Discovery, which you still start yourself.',
      ],
      effect: 'Open Paid Clients and you can see who needs you, what is missing and the one thing to do next, without copying anything between pages.',
    } },
  { id: '2026-10-01-sales-handoff', date: '2026-10-01', title: 'The sales handoff', audience: 'sales',
    body: 'When you close a client, give Paul six quick answers so he never has to ask again.',
    report: {
      added: [
        'A "Handoff for Paul" section in Quick Close: what we are doing, the website situation, what they want, anything promised, why they bought, and the decision maker. What we already know is filled in for you.',
        'Your sales — finish the handoff, on your Sales page: your own paid clients that still need it. You can finish it after they pay, and submit it for delivery once everything is in.',
      ],
      changed: ['A client who pays before the handoff is done is still a client — the handoff just shows as missing until you finish it.'],
      removed: [],
      effect: 'Fill it in before you send the payment link if you can; if not, finish it from your Sales page after they pay.',
    } },
  { id: '2026-10-01-sales-page-monthly', date: '2026-10-01', title: 'One Sales page, a monthly commission ladder', audience: 'sales',
    body: 'Sales and Earnings are one page. Your commission rate now climbs over the calendar month: sales 1–12 earn 30%, 13–24 earn 40%, 25 onwards 50%.',
    report: {
      added: [
        'A monthly ladder at the top of Sales: one dot per sale, the rate your next sale earns, and how many more sales unlock the next rate. Tap a dot to see the client, the package and what it earned.',
        'Recent wins, one chart (this month week by week), and "How your commission works" with your own numbers.',
        'Previous / Next in the lead popup (or the ← → keys) to go through the list you opened it from, and the latest WhatsApp messages on the lead.',
        'Meetings and Warm lists in Sales → Follow-ups.',
      ],
      changed: [
        'Commission tiers count by the calendar month (UK time) instead of the week. Each sale keeps the rate it earned; the count starts again on the 1st.',
        'A refunded sale no longer counts towards the rate of the sales after it.',
        'Your menu is Outreach, WhatsApp, Find Leads and Sales. Coverage is under More.',
      ],
      removed: [
        'The separate Earnings page (old links open Sales).',
        'Focus Mode. Its useful parts are in the lead popup and on Sales.',
        'Repeated and decorative cards on the dashboard (Today, pipeline, warmth, health, feed, recap, targets, milestones, trends).',
      ],
      effect: 'One page tells you how you are doing, what you have earned and how close the next rate is. Monthly payments still earn 20% of the next three, as before.',
    } },
  { id: '2026-10-01-agency-check', date: '2026-10-01', title: 'See which websites an agency runs', audience: 'all',
    body: 'Find Leads now checks each business’s website for signs that an outside agency runs it, so you can skip the ones that would be a hassle.',
    report: {
      added: [
        'A Site management column in Find Leads: "Agency likely · 92%", "No agency evidence · 78%", "Checking…" or "Unknown". Tap it to see why.',
        'A Site management filter (No agency evidence, Agency likely, Unknown, No website).',
        'On an added lead: "Detected: Agency likely" with Confirm agency / Not agency.',
      ],
      changed: [
        'Sites an agency very likely runs sort to the bottom once the checks finish, and are left out of Select all and Add all shown. You can still add them one by one.',
      ],
      removed: [],
      effect: 'Less time on businesses whose website another agency controls. It is a machine check, not a certainty: "No agency evidence" does not mean they run it themselves.',
    } },
  { id: '2026-10-01-why-they-said-no', date: '2026-10-01', title: 'Record why they said no', audience: 'all',
    body: 'When you mark a lead Not interested, a short box asks why. Pick a reason, add a note if useful, Save. Or Skip.',
    report: {
      added: [
        'Marking a lead Not interested (the status pill on Outreach, the lead workspace or the Inbox, or the Not interested outcome on a call) asks "Why did they say no?" with nine reasons. Other needs a short note; every other note is optional.',
        'A Not interested lead shows "Why they said no" in its Work panel, with Change, or Add reason if none was recorded.',
        'History records each reason, who saved it and when. A correction keeps the old one ("was Too expensive").',
        'Admin dashboard: "Why prospects say no", the reasons for the period with counts and percentages, and how many said no with no reason recorded. Each row opens to the leads behind it.',
      ],
      changed: [],
      removed: [],
      effect: 'We learn what keeps losing prospects (price, an existing provider, timing, value) instead of guessing. Older Not interested leads show "Reason not recorded"; nothing was filled in for them.',
    } },
  { id: '2026-10-01-inbox-top-bar', date: '2026-10-01', title: 'A tidier Inbox top bar', audience: 'all',
    body: 'The WhatsApp Inbox header is two clean rows: the title with New (and Send now) on one, the filters on the other. Every control is the same size.',
    report: {
      added: [],
      changed: [
        'New (and Send now for admins) stay on the title line at every screen size. On a phone, Send now shows as its icon.',
        'The filters sit together as one group: two columns on a phone, one line on a wide screen. All of them use the same text size.',
        'A status or campaign filter you have set is highlighted in blue, like the other filters. The Sort button shows a short name ("Latest reply"); its menu keeps the full wording.',
        'The four list views (All, Unread, Waiting on us, Waiting on them) are a 2 by 2 grid, so none sits alone on a second line.',
      ],
      removed: [],
      effect: 'Same controls, same filters, nothing works differently. The top of the Inbox is easier to read and takes less room.',
    } },
  { id: '2026-10-01-hourly-reminders', date: '2026-10-01', title: 'Reminders at the right time', audience: 'all',
    body: 'Next Action reminders now arrive at their time, once, and Done or Clear starts the next action with a blank note.',
    report: {
      added: [],
      changed: [
        'Reminders run every hour instead of once a morning. A timed Next Action reminds you in the first hour after its UK time ("Send proposal at 16:00"); one without a time reminds you from 07:00 UK on its day.',
        'Each Next Action reminds you once. Moving it to a new day or time, or changing its type, counts as a new one.',
        'The reminder goes to whoever owns the lead when it is due, so a lead handed over beforehand reminds its new owner.',
        'Done and Clear also clear the Next Action\'s note, so the next one starts blank. History keeps the note that went with it.',
      ],
      removed: [],
      effect: 'You hear about each Next Action at its time, once, and an old note never carries over.',
    } },
  { id: '2026-10-01-one-next-action', date: '2026-10-01', title: 'One kind of Next Action', audience: 'all',
    body: 'A booked meeting and a call-back are now real Next Actions. The Next Action column shows "+ Set" or the action with its green tick, never both.',
    report: {
      added: [
        'Logging "Call back" sets the Next Action "Call · No date set". Add the day when you know it.',
        'Logging "Meeting booked" sets the Next Action "Meeting". Saving when it is puts the day and time on it.',
        'A green tick on every Next Action in Outreach: "Complete next action". It completes it and adds it to History.',
      ],
      changed: [
        'A meeting is booked, moved and completed as its Next Action, so the meeting time and the Next Action can never disagree.',
        'Completing, clearing or changing a Meeting ends the booking too. History keeps the meeting and says why it ended.',
        'Booked meetings and call-backs show in the Next Action filters (Due today, Tomorrow, Set no date, Meeting / callback).',
        'Three leads that had a call-back logged with nothing planned now show "Call · No date set".',
        'WhatsApp Inbox: the Next Action filters and Sort moved to the top bar, next to campaigns and statuses.',
      ],
      removed: [
        'The small grey line under "+ Set" ("Meeting · Fri 2 Oct 15:15", "Call back · no day set").',
        'The separate "Call booked for" time box on the Work tab. Use the Next Action instead.',
      ],
      effect: 'If something looks like a Next Action, it is one: you can edit it, filter by it and complete it.',
    } },
  { id: '2026-10-01-meeting-time-once', date: '2026-10-01', title: 'The meeting time shows once', audience: 'all',
    body: 'When a meeting is the Next Action, its day and time are in the Next Action bar only.',
    report: {
      added: [],
      changed: ['The folded "Call booked · website" line says "Booked" instead of repeating the time when that meeting is the Next Action. A booked meeting that is not the Next Action still shows its time there.'],
      removed: ['The repeated meeting time.'],
      effect: 'One place to read when the meeting is; the website and domain details are still on the line.',
    } },
  { id: '2026-10-01-work-tab-folds', date: '2026-10-01', title: 'A shorter Work tab', audience: 'all',
    body: 'Campaign, Call booked, the sign-up link and WhatsApp outreach fold to one line each that says where things stand. Tap a line to open it.',
    report: {
      added: ['A one-line summary on each folded section, for example "Campaign · Plumbers Leeds", "Sign-up link · Sent 1 Oct · opened", "WhatsApp outreach · Queued".'],
      changed: [
        'Campaign, Call booked · website, Sign-up link and WhatsApp outreach start folded. Log a contact uses the same look.',
        'Warnings still show while folded: a sign-up link that cannot start a baseline (no trade), a failed WhatsApp send, a paused queue.',
        'Folding keeps what you picked or typed inside.',
        'On a phone the sign-up link buttons wrap onto two lines instead of running off the card, and they are a little taller to tap.',
        'A client who has paid shows one line for the sign-up link ("Not needed"), nothing to open.',
        'A lead that cannot get WhatsApp, a landline, or one whose opener has gone shows WhatsApp outreach as one line.',
      ],
      removed: ['Nothing. Every control is inside its section.'],
      effect: 'The Work tab is about a third shorter, and you can read every section\'s state without opening it.',
    } },
  { id: '2026-10-01-next-action-time', date: '2026-10-01', title: 'Next Actions can have a time', audience: 'all',
    body: 'Every Next Action can now have an optional UK time, and there are two new types: Send proposal and Chase payment.',
    report: {
      added: [
        'An optional time on every Next Action, for example "Call · Tomorrow · 14:30". It is UK time, whatever clock your computer runs on.',
        'Two types: Send proposal and Chase payment, each with its own filter.',
        'A "No time" link to remove a time while keeping the day.',
      ],
      changed: [
        'A timed Next Action counts as overdue only once its UK time has passed. One without a time works exactly as before.',
        'History says what happened: Set, Rescheduled (with what it was), Changed (Call → Send proposal), Completed or Cleared.',
        'A Meeting\'s time and the booked meeting are one time. Booking or moving one moves the other.',
        'The daily reminder names the action in words, with its time.',
      ],
      removed: ['The "Meeting at 14:30" line added to a meeting\'s note. The time now shows by itself.'],
      effect: 'Every screen shows the same action, day and time, and nothing counts as overdue before its time.',
    } },
  { id: '2026-10-01-workspace-declutter', date: '2026-10-01', title: 'A calmer lead workspace', audience: 'all',
    body: 'The lead popup shows each thing once: the status, who owns it, the Next Action, the last contact. Everything else is one tap away.',
    report: {
      added: [
        'A Next Action bar at the top of the popup: what, when and the note, with Edit (or "Set one" when there is none). Red when overdue, amber when due today.',
        '"More tools" in the tools row: Crawl site, the welcome pack (before they have paid) and the preferred channel open in place.',
      ],
      changed: [
        'A booked meeting that is also the Next Action shows once, in the Next Action bar, with its time. The separate "Meeting booked" pill only shows when the meeting is not the Next Action.',
        'The status pill is the same one as the Outreach row and the WhatsApp Inbox. Interested is still the star.',
        'Log a contact is folded to one line until you open it. It opens by itself when you press Call on Outreach, and folds again after you log an outcome; what was recorded stays visible under it.',
        'The Next Action box on the Work tab opens only when you edit it (or after an outcome suggests one), and closes after Save. The bar at the top is the same Next Action.',
        'The AI visibility check takes one line until it has been run.',
        'The channel ("Contact" / Call / WhatsApp…) is no longer a pill beside the status. It is "Preferred channel" under More tools.',
        'Quick Close is an outline button, so it does not compete with the next step. It works the same.',
        'Admin: the big green Mark Paid button only shows when a price has been given, the deal is agreed or delivery is running. Otherwise it is a small "Mark paid" at the bottom. It does exactly the same.',
        'The internal note box is one line until you type.',
      ],
      removed: ['Nothing that does anything. Only repeated pills and always-open panels.'],
      effect: 'Open a lead and see in a second what state it is in, what to do next and how to do it, with every tool still there.',
    } },
  { id: '2026-10-01-next-action-one-flow', date: '2026-10-01', title: 'One Next Action form everywhere', audience: 'all',
    body: 'The Next Action column now opens the same form as the lead workspace, with the note, the day and a meeting time.',
    report: {
      added: [
        'In the Next Action column: the note, the quick days (Today, Tomorrow, In 3 days, Next week), a time for a Meeting, and Clear.',
        'A Meeting with a time books it, the same as "Meeting booked" in the workspace, and the column shows the time (for example "Meeting · Thu 2 Oct · 14:30").',
      ],
      changed: [
        'The column shows the type, the day and the note, not just the type.',
        'It saves when you press Save. It no longer saves on its own as soon as a type and a day were picked.',
        'Every Next Action save, from the column, the bulk menu, the workspace or the Inbox, goes through the same server function, so History records each one for Admin and salespeople alike.',
        'Paid clients shows the next action in the same words (it showed the raw value, including "none").',
        'Meeting times are typed in UK time everywhere (the Next Action form and the workspace\'s meeting boxes), the same time every screen shows. Before, they used your own computer\'s clock, so a meeting typed outside the UK was booked at the wrong UK time.',
      ],
      removed: ['The separate lighter Next Action popup in the Outreach table.'],
      effect: 'One way to set, edit, reschedule, complete or remove a Next Action, with the same types and fields on every screen.',
    } },
  { id: '2026-10-01-no-legacy-interested', date: '2026-10-01', title: 'The open conversation stays in the Inbox list', audience: 'all',
    body: 'The conversation you have open stays in the Inbox list even when no conversation matches your filters.',
    report: {
      added: [],
      changed: [
        'When nothing matches the Inbox filters, the conversation you have open still shows at the top, marked "Opened · outside your current filters". Before, the list showed "No conversations yet" instead, which mostly affected salespeople with few conversations.',
        'Behind the scenes, nothing can save the old "Interested" status any more. Any request for it just adds the gold star and keeps the real status.',
      ],
      removed: [],
      effect: 'Admin and salespeople see the same Inbox list, and the star stays the only sign of interest.',
    } },
  { id: '2026-10-01-revive-and-inbox-filters', date: '2026-10-01', title: 'Inbox filters match the status pill', audience: 'all',
    body: 'Inbox status filters now use the status each conversation shows, and a lead that said no then yes moves on normally.',
    report: {
      added: [],
      changed: [
        'Inbox status filters use the status the pill shows, the same rule as Outreach. A business reached by phone is under Contacted.',
        'A lead that said no and then yes (Interested or Meeting booked logged) goes back to its real status, Replied, You replied, Contacted or New, instead of a hidden old "Interested" status. A later reply now moves it to Replied.',
        'The Not interested block on the number is still lifted exactly as before. Wrong number and opt-out blocks are never lifted.',
      ],
      removed: [],
      effect: 'Every page shows and filters the same status for a lead, and a revived lead flows through Replied and You replied like any other.',
    } },
  { id: '2026-10-01-interested-is-the-star', date: '2026-10-01', title: 'Interested filters show every starred lead', audience: 'all',
    body: 'Every Interested filter now lists the leads with the gold star, whatever their status.',
    report: {
      added: [],
      changed: [
        'The status filter\'s "Interested ⭐" and the ⭐ Interested button list every starred lead. Before, the status filter only found the old stored Interested status.',
        'The Inbox\'s Interested filter lists starred leads only. "Price given" without a star is no longer included.',
        'Choosing Interested from any status menu adds the star in the same way as the star button, and History records it.',
        '24 older leads carrying the old Interested status now have the star, and their status shows what their WhatsApp messages prove (Replied or You replied). Each has a History note.',
      ],
      removed: ['The "No WhatsApp? Try SMS" tip, and every other suggestion to use SMS.'],
      effect: 'The star is the one sign of interest. Adding or removing it never changes the status pill.',
    } },
  { id: '2026-10-01-star-keeps-contacted', date: '2026-10-01', title: 'Starring a lead keeps it Contacted', audience: 'all',
    body: 'A lead you spoke to stays Contacted when you star it or log Interested or Meeting booked.',
    report: {
      added: [],
      changed: [
        'A lead reached by phone and then starred shows the Contacted pill and sits under the Contacted filter. Before, the star turned it back to New.',
        'The same applies when Interested or Meeting booked is logged on a call, since both add the star.',
        'A starred lead nobody has reached still shows New with its star.',
      ],
      removed: [],
      effect: 'The pill and the filter stay truthful about contact whatever star or meeting a lead has.',
    } },
  { id: '2026-10-01-contact-state-final', date: '2026-10-01', title: 'Status filter matches the status pill', audience: 'all',
    body: 'A lead reached by phone shows as Contacted in its pill, under the Contacted filter and in every label.',
    report: {
      added: [],
      changed: [
        'The Outreach status filter uses the status each row shows: a business reached by phone is under Contacted, not New.',
        'Needs your attention and the reply sorter describe a lead reached by phone as Contacted, not New.',
        'Opening the WhatsApp app from a lead records an attempt only. It no longer marks the lead Contacted.',
      ],
      removed: [],
      effect: 'Pills, filters and labels always agree, and nothing counts as contact unless a message really went or a conversation was logged.',
    } },
  { id: '2026-10-01-claim-no-whatsapp', date: '2026-10-01', title: 'No WhatsApp leads can be claimed to call', audience: 'all',
    body: 'A business that is not on WhatsApp can now be claimed and worked by phone, email or social.',
    report: {
      added: ['171 No WhatsApp businesses are back in the unowned pool for salespeople to claim from Find Leads.'],
      changed: [
        'Claiming depends only on sales facts: not owned by someone else, not archived, not a client, not opted out / not interested / a wrong number / suppressed, and no real contact yet. No WhatsApp, a landline or a bounced email never blocks it.',
        'A WhatsApp that Meta rejected is not a contact anywhere: claims, the funnels, rep numbers, follow-ups and the WhatsApp panel all agree.',
        'An automatic WhatsApp only gives the lead an owner once it is delivered.',
      ],
      removed: ['45 retired barber-campaign leads from the active list (archived — kept, searchable under Archived).'],
      effect: 'Reps can call the businesses WhatsApp could not reach. The No WhatsApp label stays, so they know to use another channel.',
    } },
  { id: '2026-10-01-outreach-workspace', date: '2026-10-01', title: 'Outreach is the full sales workspace', audience: 'all',
    body: 'Truthful contact status, honest WhatsApp labels, Next Actions in their own column, and the AI audit where you work the call.',
    report: {
      added: [
        'The AI visibility check on the lead’s Work tab: the score, who AI names instead, the report, "Run a new check", and a list of previous checks.',
        'If a lead has no trade or town, the check asks for them right there and saves them.',
        'A star in the lead workspace header to mark (or unmark) interested.',
        'A Google Maps link and the phone’s WhatsApp status ("Mobile number", "WhatsApp verified", "No WhatsApp") on the Prospect tab.',
      ],
      changed: [
        'A lead only counts as Contacted when a message really went, or a logged contact reached them (spoke to owner, call back, interested, a message sent…). A WhatsApp that Meta rejected, or a no-answer / voicemail call, is an attempt: it stays in History, not Contacted.',
        'The phone icon says only what is known: "Mobile number" until a message is delivered, "No WhatsApp" after Meta rejects one. The WhatsApp-capable filter leaves rejected numbers out.',
        'Tapping Call opens the dialler and the lead on its Work tab to log what happened. It no longer records a call by itself.',
        'A business reached by phone shows the solid Contacted pill even if its WhatsApp status still says New or No WhatsApp.',
        'The Status column shows only the status. The last contact is in its tooltip. A booked meeting, or a call-back with no day set, shows in the Next Action column.',
      ],
      removed: ['The grey "Call · Call back · 3 days ago" line under the status pill (it was history, not a next action).'],
      effect: 'You can work a lead start to finish from Outreach — check the business and its audit, call, log the outcome and set the Next Action — and the counts no longer include contact that never happened.',
    } },
  { id: '2026-10-01-grouped-replies', date: '2026-10-01', title: 'One card for new WhatsApp replies', audience: 'all',
    body: 'The bell shows "6 new replies from 4 businesses" instead of a card per reply.',
    report: {
      added: ['One card at the top of the bell with the number of unread replies and businesses. It opens the Inbox on Unread.'],
      changed: [
        'The count comes from the same unread state as the Inbox: it goes down as you open conversations and never shows a lead that is no longer yours.',
        'The bell number = unread conversations + other unread notifications.',
      ],
      removed: ['One notification card per WhatsApp reply.'],
      effect: 'A quieter bell that matches the Inbox. Payments, assignments, tasks and other notices still show on their own.',
    } },
  { id: '2026-10-01-trade-autofix', date: '2026-10-01', title: 'Missing trades, filled automatically', audience: 'admin',
    body: '"Fix automatically" on Needs your attention fills in missing trades from data we already hold.',
    report: {
      added: ['"Fix automatically" on the "No trade stored" line: it reads each lead’s audit, campaign and business name, saves the trade when the evidence is strong, and lists the rest for you.'],
      changed: [],
      removed: [],
      effect: 'Free (no AI, no Google, no website visits). Only the trade is written, recorded in History with its evidence; nothing is sent and no status, owner or Next Action changes.',
    } },
  { id: '2026-10-01-moved-history', date: '2026-10-01', title: 'Moving a lead no longer moves its past', audience: 'admin',
    body: 'Work is credited to whoever held the lead at the time. The 82 leads worked under the Test account are now yours, with their history kept as it was.',
    report: {
      added: ['A note on each of the 82 leads first worked under the Test account: a legacy test-account record, reassigned to Paul on 30 Sep, earlier activity kept as recorded.'],
      changed: [
        'An automatic send, a reply or an opt-out that names no person is credited to whoever held the lead WHEN it happened, not to whoever holds it now. This applies to the Admin dashboard and the Sales dashboard.',
        'The 82 leads are assigned to you. Their sends and replies before 30 Sep stay with the Test account (outside performance numbers); everything from the move on counts as yours.',
      ],
      removed: [],
      effect: 'Reassigning a lead never rewrites who did what. Your numbers show only your own work. "Added by" and the Test account’s logged calls are unchanged.',
    } },
  { id: '2026-10-01-status-pills', date: '2026-10-01', title: 'One status pill per lead', audience: 'all',
    body: 'Outreach and WhatsApp show one solid-colour status pill per lead, as before. Interested is the gold star.',
    report: {
      added: [],
      changed: [
        'Each lead row and the WhatsApp conversation header show ONE status pill: the solid pipeline pill (Replied, Queued, Contacted, Not Interested, Paid…), in the same colours as before.',
        'Hover the pill to see the sales stage too. Its menu is headed "Pipeline status", so it is clear what you are changing.',
        'Interested is only the gold star, never a pill.',
      ],
      removed: [
        'The second, paler pill that repeated the status beside it ("New · Opener queued" next to "Queued", "Replied" next to "Replied").',
        'The extra "Queued" chip in the WhatsApp header. It now shows only when the queue is paused ("Queue paused").',
      ],
      effect: 'Less to read on every row, and no pill says the same thing twice. Nothing stored on any lead changed, and the filters work as before.',
    } },
  { id: '2026-10-01-team-board', date: '2026-10-01', title: 'Your team board', audience: 'sales',
    body: 'Updates and tasks from Paul now appear at the top of your Sales dashboard, with a notification when something arrives.',
    report: {
      added: [
        '"Your team board" on the Sales dashboard: To do, Updates and Completed.',
        'Tasks from Paul with instructions, a due date and a button straight to the lead, conversation or page.',
        'Start and Mark done on each task, Mark read on each update. Paul sees where each one stands.',
        'A lead Paul gives you arrives as a task with his instructions, and the notification says what he wants.',
      ],
      changed: ['A lead given to you shows its own Next Action date on the task. Change it on the lead, not on the board.'],
      removed: [],
      effect: 'Priorities, new scripts and handed-over leads are in one place instead of WhatsApp. Marking a task done never changes the lead or sends anything.',
    } },
  { id: '2026-10-01-send-to-team', date: '2026-10-01', title: 'Send to sales team, and Assign from Needs your attention', audience: 'admin',
    body: 'Send the team announcements, focus areas, scripts and tasks from the Admin dashboard, and hand a follow-up to a salesperson in one step.',
    report: {
      added: [
        '"Send to sales team" at the top of the Admin dashboard: Announcement, Targeting priority, Template update, Task, Lead assignment, Message. A preview says who gets it and what it does before you send. Drafts can be saved.',
        '"Sales team board" under Team: everything you sent, who has read it, each task’s state and overdue work, with filters by person, status, type and date. Edit (marked "edited"), send a clarification, or cancel.',
        '"Assign" on ordinary follow-ups in Needs your attention (quote gone quiet, signed up not paid, replies to chase): pick a salesperson, add instructions, and optionally a Next Action date.',
      ],
      changed: [
        'Assigning one lead from the WhatsApp header or the lead popup also puts it on that salesperson’s board.',
        'A follow-up a salesperson holds as an open task leaves Needs your attention and is counted in one "with the team" line. It comes back if the task is closed and the problem is still there.',
        'Moving a lead to someone else cancels the previous person’s task for it (kept in the record).',
      ],
      removed: [],
      effect: 'You can delegate and check progress without messaging each person. Urgent, payment and client items never leave your list. "Everyone" leaves out the test accounts, so it reaches nobody until a real salesperson joins.',
    } },
  { id: '2026-10-01-three-rivals', date: '2026-10-01', title: 'Competitor follow-ups use three real names', audience: 'all',
    body: 'The audit follow-up that names three competitors now uses a search that actually named three.',
    report: {
      added: [],
      changed: [
        'An audit’s headline search now prefers a Google AI search that named at least three rivals. Before, a search with two names could win on its wording, and the three-competitor follow-up was refused (DM Roofing).',
        'The report’s headline search and the voice-note script follow the same pick, so they still match the message.',
      ],
      removed: [],
      effect: 'Fewer "could supply 2" refusals. Names are never made up or borrowed from another search: if no Google AI search named three, it still refuses.',
    } },
  { id: '2026-10-01-api-costs', date: '2026-10-01', title: 'API costs: only what Findable paid', audience: 'admin',
    body: 'Cost figures count only usage on your own accounts, from the day each one was switched over.',
    report: {
      added: ['A "Move37-funded (historical)" line for usage before each account switch (Apify 17 Sep, Google 18 Sep, OpenAI 21 Sep).'],
      changed: ['Cost totals, today / week / month and contribution count Findable-paid usage only, with Findable testing shown apart.'],
      removed: ['Usage paid by Move37 from Findable’s cost and contribution figures.'],
      effect: 'Your cost and profit numbers reflect what Findable actually paid. Older usage is still visible and labelled, just not counted.',
    } },
  { id: '2026-09-29-weekly-tiers', date: '2026-09-29', title: 'Weekly commission tiers', audience: 'sales',
    body: 'The first payment now earns more the more clients you close in a week: 30% for clients 1–3, 40% for clients 4–6 and 50% from client 7. Each client keeps the rate of their place in the week, and the count starts again every Monday. Your dashboard shows where you are this week.' },
  { id: '2026-09-28-feedback', date: '2026-09-28', title: 'Send feedback from anywhere', audience: 'all',
    body: 'Suggest a feature, report a bug or tell us something is confusing — the Feedback button is always in the menu. You will hear back when it is planned or done.' },
  { id: '2026-09-28-focus', date: '2026-09-28', title: 'Focus Mode and quick search', audience: 'all',
    body: 'Work one lead at a time in Focus Mode, with WhatsApp, call, LinkedIn, notes and Next Action on one screen. Press Ctrl+K (⌘K on a Mac) to find any lead or page.' },
  { id: '2026-09-28-notifications', date: '2026-09-28', title: 'Notifications', audience: 'all',
    body: 'New WhatsApp replies, sign-up page opens, finished audits, follow-ups due and payments arrive in the bell — bottom-right on a computer, top-right on a phone. Tap one to go straight there.' },
  { id: '2026-09-28-earnings', date: '2026-09-28', title: 'Earnings', audience: 'sales',
    body: 'See your commission from real client payments: earned, due at the next payout, and what future payments would add.' },
  { id: '2026-09-28-whatsapp', date: '2026-09-28', title: 'WhatsApp, easier to find', audience: 'all',
    body: 'WhatsApp is now its own menu item with an unread count, filters for Unread and Waiting on us, and a timer on every reply that is waiting for an answer.' },
];

export const whatsNewFor = (role: string | null | undefined) =>
  WHATS_NEW.filter((e) => e.audience === 'all' || e.audience === role);
