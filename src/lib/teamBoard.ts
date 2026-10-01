/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SALES TEAM BOARD — the rules, in one place (2026-10-01, docs/sales-team-board.md).
   Paul → the team: information (announcement, targeting, template update, custom) and work (task,
   lead assignment). The data and every permission live in the database (migration
   20261001200000_sales_team_board.sql); this file only names, orders and derives.
   ⛔ OVERDUE IS DERIVED from an open task's due date (London days) — never stored.
   ⛔ A LEAD ASSIGNMENT'S DATE IS THE LEAD'S OWN NEXT ACTION — the board never keeps a second copy.
   Pure (no React, no Supabase); edge-safe (relative .ts imports) — adminMetrics reads it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { CONTACT_METHODS } from './contactMethods.ts';

export type TeamPostKind = 'announcement' | 'targeting' | 'template_update' | 'task' | 'lead_assignment' | 'custom';
export type TaskStatus = 'todo' | 'in_progress' | 'completed' | 'cancelled';
export type TeamPriority = 'low' | 'normal' | 'high';

/** The kinds Paul picks in the composer, in its order. Lead assignment has its own dialog but the same
 *  composer offers it (it runs assign_lead_with_brief). */
export const COMPOSER_KINDS: readonly TeamPostKind[] = ['announcement', 'targeting', 'template_update', 'task', 'lead_assignment', 'custom'];

export const KIND_LABEL: Record<TeamPostKind, string> = {
  announcement: 'Announcement',
  targeting: 'Targeting priority',
  template_update: 'Template update',
  task: 'Task',
  lead_assignment: 'Lead assigned',
  custom: 'Message',
};
export const KIND_HINT: Record<TeamPostKind, string> = {
  announcement: 'News, a change to how we work, a reminder. Read-only for them.',
  targeting: 'Which businesses or areas to focus on next.',
  template_update: 'Point them at a template or script to use. Nothing is sent or registered.',
  task: 'A to-do with instructions and an optional due date. They mark it in progress / done.',
  lead_assignment: 'Move a lead to them (the same move as the Inbox) with your instructions. It lands on their board.',
  custom: 'A plain message. Information only — not a task.',
};

export const isTaskKind = (k: string | null | undefined): boolean => k === 'task' || k === 'lead_assignment';

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };
export const PRIORITY_LABEL: Record<TeamPriority, string> = { low: 'Low', normal: 'Normal', high: 'High' };
export const CANCEL_REASON_LABEL: Record<string, string> = { reassigned: 'Lead moved to someone else', cancelled_by_admin: 'Cancelled by the admin' };

/** The channels a template or script is for — taken from THE contact-method list (contactMethods.ts),
 *  never a second copy of it. */
export type TemplateChannel = 'whatsapp' | 'linkedin' | 'email' | 'call';
const TEMPLATE_CHANNEL_VALUES: readonly TemplateChannel[] = ['whatsapp', 'linkedin', 'email', 'call'];
export const TEMPLATE_CHANNELS: readonly { value: TemplateChannel; label: string }[] = TEMPLATE_CHANNEL_VALUES.map((v) => {
  const m = CONTACT_METHODS.find((c) => c.value === v);
  return { value: v, label: v === 'call' ? 'Call script' : m?.short ?? v };
});

/** Where each channel's template is used — the recipient's "open" button. */
export const CHANNEL_LINK: Record<TemplateChannel, string> = { whatsapp: '/inbox', linkedin: '/outreach', email: '/outreach', call: '/outreach' };

export interface BoardLead { id: string | null; name: string | null; mine: boolean; next_action?: string | null; next_action_date?: string | null; next_action_time?: string | null; next_action_note?: string | null }
export interface BoardItem {
  id: string; kind: TeamPostKind; title: string; body: string | null; details: Record<string, unknown>; link: string | null;
  due_date: string | null; priority: TeamPriority | null; published_at: string; edited_at: string | null; author: string;
  read_at: string | null; task_status: TaskStatus | null; status_at: string | null; completed_at: string | null;
  cancelled_reason: string | null; lead: BoardLead | null;
}

/** A task's working date: its own due date — or, for a lead assignment, the LEAD's Next Action date. */
export function itemDueDate(i: Pick<BoardItem, 'kind' | 'due_date' | 'lead'>): string | null {
  if (i.kind === 'lead_assignment') {
    const na = i.lead?.next_action;
    return i.lead?.mine && na && na !== 'none' && i.lead.next_action_date ? i.lead.next_action_date.slice(0, 10) : null;
  }
  return i.due_date ? i.due_date.slice(0, 10) : null;
}

export const isOpenTask = (s: TaskStatus | null | undefined): boolean => s === 'todo' || s === 'in_progress';

/** Overdue: an OPEN task whose date is before today (London). Nothing else is ever overdue. */
export function isOverdue(i: Pick<BoardItem, 'kind' | 'due_date' | 'lead' | 'task_status'>, today: string): boolean {
  if (!isOpenTask(i.task_status)) return false;
  const d = itemDueDate(i);
  return !!d && d < today;
}

export type BoardTab = 'todo' | 'updates' | 'completed';
/** Which tab an item sits in. Cancelled work sits with Completed (done with, not to do). */
export function tabOf(i: Pick<BoardItem, 'kind' | 'task_status'>): BoardTab {
  if (!isTaskKind(i.kind)) return 'updates';
  return isOpenTask(i.task_status) ? 'todo' : 'completed';
}

const PRI: Record<string, number> = { high: 0, normal: 1, low: 2 };
/** To do: overdue first (oldest date first), then dated (soonest first), then undated (high priority,
 *  then newest). Updates: unread first, then newest. Completed: most recently finished first. */
export function sortBoard(items: readonly BoardItem[], tab: BoardTab, today: string): BoardItem[] {
  const out = [...items];
  if (tab === 'todo') {
    return out.sort((a, b) => {
      const da = itemDueDate(a); const db = itemDueDate(b);
      const oa = isOverdue(a, today) ? 0 : da ? 1 : 2; const ob = isOverdue(b, today) ? 0 : db ? 1 : 2;
      if (oa !== ob) return oa - ob;
      if (da && db && da !== db) return da < db ? -1 : 1;
      const pa = PRI[a.priority ?? 'normal'] ?? 1; const pb = PRI[b.priority ?? 'normal'] ?? 1;
      if (pa !== pb) return pa - pb;
      return b.published_at.localeCompare(a.published_at);
    });
  }
  if (tab === 'updates') return out.sort((a, b) => Number(!!a.read_at) - Number(!!b.read_at) || b.published_at.localeCompare(a.published_at));
  return out.sort((a, b) => (b.completed_at ?? b.status_at ?? '').localeCompare(a.completed_at ?? a.status_at ?? ''));
}

/** The unread count the board header shows: unread updates + open tasks never opened. */
export function unreadCount(items: readonly BoardItem[]): number {
  return items.filter((i) => !i.read_at && (tabOf(i) !== 'completed')).length;
}

/** Where the item's button goes: the lead (WhatsApp work → the Inbox thread; anything else → the
 *  lead's workspace), else the link Paul attached, else the template's channel. Only internal paths. */
export function itemTarget(i: Pick<BoardItem, 'kind' | 'link' | 'lead' | 'details'>): { path: string; label: string } | null {
  if (i.lead?.id && i.lead.mine) return { path: `/inbox?lead=${i.lead.id}`, label: 'Open conversation' };
  if (i.link && i.link.startsWith('/') && !i.link.startsWith('//')) return { path: i.link, label: 'Open' };
  if (i.kind === 'template_update') {
    const ch = String(i.details?.channel ?? '') as TemplateChannel;
    if (CHANNEL_LINK[ch]) return { path: CHANNEL_LINK[ch], label: ch === 'whatsapp' ? 'Open the Inbox' : 'Open Outreach' };
  }
  if (i.kind === 'targeting') return { path: '/find-leads', label: 'Find leads' };
  return null;
}

/** "Due Thu 2 Oct" / "Due today" / "Overdue · was Mon 29 Sep". */
export function dueText(date: string | null, today: string): string | null {
  if (!date) return null;
  const nice = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (date < today) return `Overdue · was ${nice}`;
  if (date === today) return 'Due today';
  return `Due ${nice}`;
}

/* ── Needs your attention → Assign ──────────────────────────────────────────────────────────────── */

/** Attention kinds that are ordinary sales follow-ups a salesperson can take. Money, client delivery,
 *  aggregates and system notices are NOT (a positive list: an unknown kind is never assignable). */
export const ASSIGNABLE_ATTENTION_KINDS: ReadonlySet<string> = new Set(['quote_quiet', 'signup_unpaid']);
/** Reply categories that stay Paul's whatever happens (adminMetrics NEVER_SETTLED): never delegated. */
export const NEVER_DELEGATED_REPLY_CATEGORIES: ReadonlySet<string> = new Set(['client_message', 'payment_issue', 'escalation', 'complaint', 'opt_out']);

export function attentionAssignable(i: { kind: string; leadId: string | null; group: string }): boolean {
  if (!i.leadId) return false;                       // an aggregate ("42 leads missing a trade") has no one lead
  if (i.group === 'urgent') return false;            // urgent stays on Paul's list, with Paul
  if (ASSIGNABLE_ATTENTION_KINDS.has(i.kind)) return true;
  if (i.kind.startsWith('reply_')) return !NEVER_DELEGATED_REPLY_CATEGORIES.has(i.kind.slice('reply_'.length));
  return false;
}

/** Plain words for the board's refusal codes (the server's, unchanged). */
export function boardRefusalText(code: string | null | undefined): string {
  switch (code) {
    case 'no_recipients': return 'Nobody to send to — pick at least one salesperson';
    case 'not_an_active_salesperson': return 'Only active salespeople can receive this';
    case 'not_an_active_member': return 'That person is not an active team member';
    case 'lead_not_theirs': return 'A task linked to a lead can go only to the person who holds that lead — use Lead assignment to move it first';
    case 'lead_not_found': return 'That lead no longer exists';
    case 'title_required': return 'Give it a title';
    case 'bad_link': return 'A link must be a page inside LeadFinderOS (starting with /)';
    case 'template_approval_required': return 'Say whether the template is approved or a draft';
    case 'not_a_draft': return 'That post was already sent — edit it instead';
    case 'already_published': return 'Already sent';
    case 'not_published': return 'Only a sent post can be edited this way';
    case 'not_your_task': return 'That is not your task';
    case 'task_cancelled': return 'That task was cancelled';
    case 'admin_only': return 'Only the admin can do that';
    case 'not_found': return 'That lead no longer exists';
    default: return code ? `Refused: ${code}` : 'Something went wrong';
  }
}
