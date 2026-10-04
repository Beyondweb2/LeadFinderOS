/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FIRST CONTACT AFTER PAYMENT IS PAUL'S (pre-sales certification fix 03, 2026-10-04; M-018 / B-07).

   🔴 WHY. After payment the client was told "we'll be in touch within two working days", the
   salesperson was told "your part is done, Paul takes it from here", and Paul's screen said WAITING FOR
   CLIENT — three people each believing somebody else was moving, while the guarantee clock ran.
   ⛔ THE OWNER IS FINDABLE (PAUL). Until he records that he has introduced himself and sent the setup
   link, the paid client's one next step is HIS: "Introduce yourself and send the setup link", due
   FIRST_CONTACT_WORKING_DAYS working days after the payment day (weekends and England & Wales bank
   holidays skipped — the same calendar commission payouts use). Never "waiting for client" before we
   have asked them for anything.
   ⛔ DERIVED, NEVER STORED (CLAUDE.md §6). The one stored act is the contact itself
   (outreach_leads.client_contacted_at, written once by paid-client-hub `record_first_contact`).
   ⛔ OLDER CLIENTS ARE NOT RE-OPENED. A client paid before FIRST_CONTACT_SINCE — or with no recorded
   payment day — reads "not recorded before this existed", never "overdue": Paul has long since spoken
   to them, and nothing is back-filled.
   Pure. ⚠️ Edge-reachable (stripe-webhook, paid-client-hub via deliveryStage): relative .ts imports.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { UK_BANK_HOLIDAYS } from './commission.ts';

/** Working days after the payment day by which Paul introduces himself — the client's "two working days". */
export const FIRST_CONTACT_WORKING_DAYS = 2;
/** The first payment day this rule applies to (the day it ships). Earlier clients: not recorded before. */
export const FIRST_CONTACT_SINCE = '2026-10-05';
/** The channels a first contact can be recorded as. */
export const FIRST_CONTACT_CHANNELS = ['phone', 'email', 'whatsapp', 'other'] as const;
export type FirstContactChannel = (typeof FIRST_CONTACT_CHANNELS)[number];
export function isFirstContactChannel(v: unknown): v is FirstContactChannel {
  return typeof v === 'string' && (FIRST_CONTACT_CHANNELS as readonly string[]).includes(v);
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isWorkingDay = (day: string) => {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6 && !UK_BANK_HOLIDAYS.has(day);
};
const nextDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** The day first contact is due: FIRST_CONTACT_WORKING_DAYS working days after the payment day.
 *  null for an unreadable day (never a guessed date). */
export function firstContactDueDay(paymentDay: string | null | undefined): string | null {
  const d = String(paymentDay ?? '').slice(0, 10);
  if (!DAY_RE.test(d) || Number.isNaN(Date.parse(`${d}T12:00:00Z`))) return null;
  let day = d; let left = FIRST_CONTACT_WORKING_DAYS;
  while (left > 0) { day = nextDay(day); if (isWorkingDay(day)) left -= 1; }
  return day;
}

/** "Wed 7 Oct" for a due day. */
export function firstContactDueLabel(day: string | null | undefined): string {
  if (!day || !DAY_RE.test(day)) return 'two working days after payment';
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export type FirstContactState = 'not_recorded_before' | 'done' | 'owed' | 'overdue';

export interface FirstContactLead {
  payment_date?: string | null;
  client_contacted_at?: string | null;
}

export interface FirstContactView {
  state: FirstContactState;
  /** YYYY-MM-DD, or null when it does not apply. */
  due: string | null;
  /** The one next-step line while it is owed. */
  label: string | null;
}

/** Where first contact stands for a paid client, today (YYYY-MM-DD, London). */
export function firstContact(lead: FirstContactLead | null | undefined, today: string): FirstContactView {
  if (lead?.client_contacted_at) return { state: 'done', due: null, label: null };
  const paid = String(lead?.payment_date ?? '').slice(0, 10);
  if (!DAY_RE.test(paid) || paid < FIRST_CONTACT_SINCE) return { state: 'not_recorded_before', due: null, label: null };
  const due = firstContactDueDay(paid);
  if (!due) return { state: 'not_recorded_before', due: null, label: null };
  const overdue = today > due;
  return {
    state: overdue ? 'overdue' : 'owed',
    due,
    label: overdue
      ? `Introduce yourself and send the setup link — overdue since ${firstContactDueLabel(due)}`
      : `Introduce yourself and send the setup link — by ${firstContactDueLabel(due)}`,
  };
}
