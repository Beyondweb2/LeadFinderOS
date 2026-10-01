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
  { id: '2026-10-02-revive-and-inbox-filters', date: '2026-10-02', title: 'Inbox filters match the status pill', audience: 'all',
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
