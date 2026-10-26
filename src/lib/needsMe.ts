/* ═════════════════════════════════════════════════════════════════
   THE ADMIN HOME'S "WHAT NEEDS YOU" LIST (Concept A, Paul 2026-10-26). Pure. docs/design/admin-dashboard/README.md.
   One row per business, most urgent first, each with ONE next action and a time since.
   Sources (all existing facts, folded here; nothing about "who needs what" is stored):
   - questionnaires  → questionnaireStep (questionnaireStop.ts): the reason they stopped, due time, 24/48 h escalation
   - payments        → the server's attention items payment_failed / payment_dispute (adminMetrics)
   - interested      → starred (is_potential_work) and their message is the newest: waiting on us. A star, never a stage.
   - follow-ups      → the human-set Next Action, due today or overdue (nextActionView.ts — the existing behaviour)
   - new clients     → handoffClients + the handoff's next step (adminControl.ts)
   - other admin tasks the server already lists (client steps, no trade, attribution, quote quiet) keep their own line.
   ⛔ NO REPLIES OR DRAFTS (Paul, 2026-10-26: too many a day — they live in the Inbox). Triage items are dropped here.
   Marks (admin_home_marks): snooze hides until `until`; dismiss hides until the row changes (its time-since moves past
   the mark); archive hides until undone. Nothing is ever deleted.
   ═════════════════════════════════════════════════════════════════ */
import type { AttentionItem } from './adminMetrics';
import { handoffClients, type HandoffClient } from './adminControl';
import { nextActionViewOf } from './nextActionView';
import { prospectOnlyLead } from './prospectOnly';
import { questionnaireStep, questionnaireRowKey, type QuestionnaireFacts } from './questionnaireStop';
import type { NeedsTemplateKey } from './needsMeTemplates';

export type NeedsKind = 'questionnaire' | 'payment' | 'interested' | 'follow_up' | 'new_client' | 'client_step' | 'other';
export type NeedsGroup = 'urgent' | 'today' | 'waiting';
export type MarkAction = 'snooze' | 'dismiss' | 'archive';

export interface NeedsMark { id: string; item_key: string; action: MarkAction; until: string | null; created_at: string }
export interface InterestedFact { lead_id: string; business_name: string | null; phone: string | null; country: string | null; contact_name: string | null; last_in_at: string; last_out_at: string | null }
/** A due Next Action, READ only (it is human-set; nothing here writes it). */
export interface FollowupFact {
  lead_id: string; business_name: string | null; phone: string | null; country: string | null; contact_name: string | null;
  next_action: string;
  next_action_date: string | null;
  next_action_time: string | null; next_action_note: string | null; starred: boolean | null;
}
export interface QuestionnaireRowFact extends QuestionnaireFacts { lead_phone?: string | null; lead_country?: string | null; lead_contact_name?: string | null; lead_payment_date?: string | null; outcome_at?: string | null }

export interface NeedsFacts {
  questionnaires: QuestionnaireRowFact[];
  interested: InterestedFact[];
  followups: FollowupFact[];
  marks: NeedsMark[];
  approvals: string[];
  today: string;
}

export interface NeedsRow {
  key: string;
  kind: NeedsKind;
  kindLabel: string;
  group: NeedsGroup;
  leadId: string | null;
  business: string;
  why: string;
  /** The ONE next action. */
  action: string;
  template: NeedsTemplateKey | null;
  /** When it started needing you (time since is shown from here). */
  sinceIso: string | null;
  /** When the action is due, where there is one. */
  dueIso?: string | null;
  flag?: string | null;
  star?: boolean;
  phone?: string | null;
  country?: string | null;
  firstName?: string | null;
  prospectOnly?: boolean;
  alreadySent?: boolean;
  /** needs_from_you {{2}}: what the client still has to send. */
  neededItem?: string | null;
  /** Where the secondary button opens. */
  open: { kind: 'lead' | 'client' | 'attention'; attention?: AttentionItem };
  /** A questionnaire row's id, for "Record the outcome". */
  onboardingId?: string;
}

const RANK: Record<NeedsGroup, number> = { urgent: 0, today: 1, waiting: 2 };
const KIND_LABEL: Record<NeedsKind, string> = {
  questionnaire: 'Questionnaire', payment: 'Payment', interested: 'Interested', follow_up: 'Follow-up due',
  new_client: 'New client', client_step: 'Client step', other: 'Admin task',
};
/** Server attention kinds that are replies (the triage) or are replaced by a row kind above. */
const DROPPED_ATTENTION = new Set(['whatsapp', 'signup_unpaid', 'handoffs_ready']);
const PAYMENT_ATTENTION = new Set(['payment_failed', 'payment_dispute']);

const first = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || null;

/** Is this row hidden by a mark right now? */
export function hiddenByMark(row: Pick<NeedsRow, 'key' | 'sinceIso'>, marks: readonly NeedsMark[], nowMs: number): NeedsMark | null {
  for (const m of marks) {
    if (m.item_key !== row.key) continue;
    if (m.action === 'archive') return m;
    if (m.action === 'snooze' && m.until && Date.parse(m.until) > nowMs) return m;
    /* Dismiss: gone until something new happens on the row. */
    if (m.action === 'dismiss' && !(row.sinceIso && Date.parse(row.sinceIso) > Date.parse(m.created_at))) return m;
  }
  return null;
}

export function questionnaireRows(qs: readonly QuestionnaireRowFact[], nowMs: number): NeedsRow[] {
  const out: NeedsRow[] = [];
  for (const q of qs) {
    const s = questionnaireStep(q, nowMs);
    if (!s) continue;
    const group: NeedsGroup = s.escalation === 3 ? 'waiting' : s.escalation >= 1 || s.stop === 'payment' ? 'urgent' : s.action === 'Wait for their answer' ? 'waiting' : 'today';
    out.push({
      key: questionnaireRowKey(q.id), kind: 'questionnaire', kindLabel: KIND_LABEL.questionnaire, group,
      leadId: q.lead_id, business: q.business_name || 'Unnamed sign-up', why: s.why, action: s.action, template: s.template,
      sinceIso: q.created_at, dueIso: s.dueIso,
      flag: s.escalation === 1 ? 'Escalated · 24h' : s.escalation === 2 ? 'Escalated · 48h' : s.escalation === 3 ? 'Nudged, no answer' : null,
      phone: q.lead_phone ?? null, country: q.lead_country ?? null, firstName: first(q.lead_contact_name),
      prospectOnly: prospectOnlyLead({ country: q.lead_country ?? null }), alreadySent: !!q.followup_sent,
      open: { kind: 'lead' }, onboardingId: q.id,
    });
  }
  return out;
}

export function buildNeedsRows(input: { facts: NeedsFacts; attention: readonly AttentionItem[]; clients: readonly HandoffClient[]; nowMs: number }): NeedsRow[] {
  const { facts, attention, clients, nowMs } = input;
  const rows: NeedsRow[] = [...questionnaireRows(facts.questionnaires, nowMs)];

  for (const a of attention) {
    if (DROPPED_ATTENTION.has(a.kind) || a.triageId) continue;
    const payment = PAYMENT_ATTENTION.has(a.kind);
    const client = a.open === 'client';
    const kind: NeedsKind = payment ? 'payment' : client ? 'client_step' : 'other';
    rows.push({
      key: `attention:${a.key}`, kind, kindLabel: payment ? (a.kind === 'payment_dispute' ? 'Payment dispute' : 'Payment failed') : KIND_LABEL[kind],
      group: a.group === 'urgent' || payment ? 'urgent' : a.group === 'blocked' ? 'waiting' : 'today',
      leadId: a.leadId, business: a.business, why: a.why, action: a.action,
      /* Only a per-lead chase has a template: a quote gone quiet → the 24-hour nudge. A failed payment (payment_failed is
         not wired), a client delivery step (yours, not a message) and the aggregate list items have none: no button. */
      template: a.kind === 'quote_quiet' && a.leadId ? 'nudge_24h' : null, sinceIso: a.sinceIso,
      open: { kind: 'attention', attention: a },
    });
  }

  for (const i of facts.interested) {
    rows.push({
      key: `interested:${i.lead_id}`, kind: 'interested', kindLabel: KIND_LABEL.interested,
      group: nowMs - Date.parse(i.last_in_at) >= 24 * 3_600_000 ? 'urgent' : 'today',
      leadId: i.lead_id, business: i.business_name || 'Unnamed lead', why: 'Starred, and their message is the latest: waiting on you',
      action: 'Reply or send a follow-up', template: 'nudge_24h', sinceIso: i.last_in_at, star: true,
      phone: i.phone, country: i.country, firstName: first(i.contact_name), prospectOnly: prospectOnlyLead({ country: i.country }), open: { kind: 'lead' },
    });
  }

  for (const f of facts.followups) {
    const v = nextActionViewOf(f.next_action, f.next_action_date, f.next_action_note, facts.today, f.next_action_time, nowMs);
    if (!v || (v.bucket !== 'overdue' && v.bucket !== 'today')) continue;
    rows.push({
      key: `followup:${f.lead_id}`, kind: 'follow_up', kindLabel: KIND_LABEL.follow_up, group: v.bucket === 'overdue' ? 'urgent' : 'today',
      leadId: f.lead_id, business: f.business_name || 'Unnamed lead',
      why: `Next Action you set: ${v.label}${v.time ? ` at ${v.time}` : ''}${v.note ? ` · ${v.note}` : ''}`,
      action: v.label, template: 'nudge_24h', sinceIso: f.next_action_date ? `${f.next_action_date}T${v.time ?? '09:00'}:00` : null,
      flag: v.bucket === 'overdue' ? 'Overdue' : null, star: !!f.starred,
      phone: f.phone, country: f.country, firstName: first(f.contact_name), open: { kind: 'lead' },
    });
  }

  for (const c of handoffClients([...clients], nowMs)) {
    const next = c.handoff?.next;
    if (!next) continue;
    const missing = c.handoff?.missing ?? [];
    rows.push({
      key: `client:${c.id}`, kind: 'new_client', kindLabel: KIND_LABEL.new_client, group: next.action ? 'today' : 'waiting',
      leadId: c.id, business: c.business_name, why: `${c.handoff?.stage_label ?? 'Setup'}: ${next.label}${missing.length ? ` · missing ${missing.slice(0, 3).join(', ')}` : ''}`,
      action: next.label, template: missing.length ? 'needs_from_you' : null, neededItem: missing.length ? missing.join(', ') : null, sinceIso: c.payment_date ?? null, open: { kind: 'client' },
    });
  }

  /* One row per business: the most urgent wins (a lead with a questionnaire AND a star shows once). */
  const sorted = rows.sort((a, b) => RANK[a.group] - RANK[b.group] || String(a.sinceIso ?? '9').localeCompare(String(b.sinceIso ?? '9')));
  const seen = new Set<string>();
  return sorted.filter((r) => {
    const id = r.leadId ? `lead:${r.leadId}` : r.key;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** The visible rows and the hidden ones (for "Archived (n)" and undo). */
export function splitByMarks(rows: readonly NeedsRow[], marks: readonly NeedsMark[], nowMs: number): { visible: NeedsRow[]; hidden: { row: NeedsRow; mark: NeedsMark }[] } {
  const visible: NeedsRow[] = []; const hidden: { row: NeedsRow; mark: NeedsMark }[] = [];
  for (const r of rows) { const m = hiddenByMark(r, marks, nowMs); if (m) hidden.push({ row: r, mark: m }); else visible.push(r); }
  return { visible, hidden };
}

/** "26h", "3d", "41 min" since an instant. */
export function sinceLabel(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return '';
  const ms = nowMs - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  if (ms < 0) return `due in ${Math.max(1, Math.round(-ms / 3_600_000))}h`;
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

/** Lost reasons for "Record the outcome" (the onboarding_outcomes CHECK list). */
export const LOST_REASONS: { value: string; label: string }[] = [
  { value: 'price', label: 'Price' }, { value: 'domain_agency', label: 'Domain or agency' }, { value: 'timing', label: 'Timing' },
  { value: 'not_decision_maker', label: 'Not the decision maker' }, { value: 'went_quiet', label: 'Went quiet' }, { value: 'other', label: 'Other' },
];
