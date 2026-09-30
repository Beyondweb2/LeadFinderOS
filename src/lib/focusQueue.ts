/* ══ FOCUS MODE'S QUEUE + THE SAVED VIEWS (Sales Experience release 4, 2026-09-28) ═══════════════════
   One lead at a time, in the order the dashboard already ranks them. A VIEW is a named slice of the
   same workspace fold (src/lib/salesWorkspace.ts) — the dashboard, the command palette and Focus Mode
   read the same lists, so "Follow up today" means one thing everywhere.
   ⛔ Nothing here writes. A view is a reading of stored facts; a person's Next Action is never changed. */
import type { PipeLead, SalesWorkspace, Warmth } from './salesWorkspace.ts';

export const FOCUS_VIEWS = [
  { key: 'next', label: 'Next best actions' },
  { key: 'meetings', label: 'Meetings booked' },
  { key: 'follow_up_today', label: 'Follow up today' },
  { key: 'overdue', label: 'Overdue follow-ups' },
  { key: 'replied', label: 'Replied, unanswered' },
  { key: 'interested', label: 'Interested' },
  { key: 'signup_sent', label: 'Signup sent' },
  { key: 'warm', label: 'Warm' },
  { key: 'going_cold', label: 'Going cold' },
] as const;
export type FocusView = typeof FOCUS_VIEWS[number]['key'];

export interface FocusItem { leadId: string; name: string; why: string }

const fromLeads = (ls: PipeLead[], why: (l: PipeLead) => string): FocusItem[] => ls.map((l) => ({ leadId: l.id, name: l.name, why: why(l) }));
const byWarmth = (w: SalesWorkspace, k: Warmth) => w.pipeline.flatMap((p) => p.leads).filter((l) => l.warmth === k);

/** The ordered, de-duplicated leads for a view. */
export function focusQueue(w: SalesWorkspace, view: FocusView | string): FocusItem[] {
  let items: FocusItem[];
  switch (view) {
    case 'follow_up_today': items = fromLeads([...w.followUps.overdue, ...w.followUps.dueToday], (l) => l.detail ?? 'Follow-up due'); break;
    case 'overdue': items = fromLeads(w.followUps.overdue, (l) => l.detail ?? 'Overdue'); break;
    case 'meetings': items = fromLeads(w.followUps.meetings ?? [], (l) => `Meeting · ${l.detail ?? ''}`); break;
    case 'replied': items = fromLeads(w.followUps.repliedUnanswered, () => 'Replied — waiting on you'); break;
    case 'interested': items = fromLeads(w.pipeline.find((p) => p.key === 'interested')?.leads ?? [], () => 'Interested'); break;
    case 'signup_sent': items = fromLeads(w.followUps.signupSent, (l) => l.detail ?? 'Signup sent'); break;
    case 'warm': items = fromLeads(byWarmth(w, 'warm'), () => 'Warm — replied in the last week'); break;
    case 'going_cold': items = fromLeads(w.followUps.goingCold, () => 'Going cold'); break;
    default: items = w.nextActions.map((a) => ({ leadId: a.leadId, name: a.name, why: `${a.title} · ${a.detail}` }));
  }
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.leadId) ? false : (seen.add(i.leadId), true)));
}

/** A LinkedIn people search for the business (a search link, never a scrape). */
export function linkedInSearchUrl(name: string | null | undefined, town?: string | null): string | null {
  const q = [name, town].filter((x) => x && String(x).trim()).join(' ').trim();
  return q ? `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(q)}` : null;
}
