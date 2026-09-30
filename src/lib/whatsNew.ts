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
