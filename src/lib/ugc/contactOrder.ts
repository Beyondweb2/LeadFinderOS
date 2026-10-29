/* WHO JESS CONTACTS, AND WHEN SHE FOLLOWS UP — pure (docs/ugc-brand-finder.md).
 *
 * Contact order (Jess): named person > partnerships@ / creators@ / collabs@ / influencers@ / press@ > marketing@ >
 * a generic inbox or an Instagram DM > a form. A generic inbox switches the pitch to her Generic inbox template.
 * WhatsApp is its own channel (a number Jess opens on her phone), offered beside these, never instead of the order.
 *
 * Follow-ups (paid brand track): +5 and +12 business days from the first contact, her Follow-up templates.
 * The local Chiang Mai track has NO follow-ups (5-day wait, then the next business in that category). */

import { primaryNamedContact, type NamedContact } from './normalize.ts';

export type ContactKind = 'named' | 'partnerships' | 'marketing' | 'generic' | 'instagram' | 'form' | 'none';
export interface ContactChoice {
  kind: ContactKind;
  rank: number;
  channel: 'email' | 'instagram' | 'form' | null;
  email: string | null;
  person: NamedContact | null;
  /** Which of her template variants this route needs. */
  variant: 'standard' | 'named_person' | 'generic_inbox' | 'ig_dm' | null;
  label: string;
}

const ROLE_INBOX = /^(partnerships?|partners|creators?|creator|collabs?|collaborations?|influencers?|influencer|ugc|press|pr|media)([._+-][^@]*)?@/i;
const MARKETING_INBOX = /^(marketing|brand|social|content|growth)([._+-][^@]*)?@/i;
const GENERIC_INBOX = /^(hello|hi|info|contact|support|help|care|customercare|customerservices?|service|team|enquiries|enquiry|sales|shop|orders|admin|office|mail)([._+-][^@]*)?@/i;

export function emailKind(email: string): 'partnerships' | 'marketing' | 'generic' | 'person' {
  if (ROLE_INBOX.test(email)) return 'partnerships';
  if (MARKETING_INBOX.test(email)) return 'marketing';
  if (GENERIC_INBOX.test(email)) return 'generic';
  return 'person';
}

export function contactOptions(b: { named_contacts?: readonly NamedContact[] | null; emails?: readonly string[] | null; instagram_url?: string | null; contact_form_url?: string | null }): ContactChoice[] {
  const out: ContactChoice[] = [];
  const named = primaryNamedContact(b.named_contacts);
  if (named) out.push({ kind: 'named', rank: 0, channel: 'email', email: named.email, person: named, variant: 'named_person', label: `${named.name} — ${named.title}` });
  const emails = [...new Set((b.emails ?? []).map((e) => e.toLowerCase()))];
  for (const e of emails.filter((x) => emailKind(x) === 'partnerships')) out.push({ kind: 'partnerships', rank: 1, channel: 'email', email: e, person: null, variant: 'standard', label: e });
  for (const e of emails.filter((x) => emailKind(x) === 'marketing')) out.push({ kind: 'marketing', rank: 2, channel: 'email', email: e, person: null, variant: 'standard', label: e });
  /* An address that is not a known inbox (e.g. jane@brand.com) is a person we could not name: it sits with marketing@. */
  for (const e of emails.filter((x) => emailKind(x) === 'person')) out.push({ kind: 'marketing', rank: 2, channel: 'email', email: e, person: null, variant: 'standard', label: e });
  for (const e of emails.filter((x) => emailKind(x) === 'generic')) out.push({ kind: 'generic', rank: 3, channel: 'email', email: e, person: null, variant: 'generic_inbox', label: e });
  if (b.instagram_url) out.push({ kind: 'instagram', rank: 3, channel: 'instagram', email: null, person: null, variant: 'ig_dm', label: 'Instagram DM' });
  if (b.contact_form_url) out.push({ kind: 'form', rank: 4, channel: 'form', email: null, person: null, variant: null, label: 'Contact form' });
  return out.sort((a, z) => a.rank - z.rank);
}

/** The best route, or a 'none' choice when we have nothing. */
export function bestContact(b: Parameters<typeof contactOptions>[0]): ContactChoice {
  return contactOptions(b)[0] ?? { kind: 'none', rank: 9, channel: null, email: null, person: null, variant: null, label: 'No contact yet' };
}

/* ── follow-ups ─────────────────────────────────────────────────────────────────────────────── */

export const FOLLOW_UP_BUSINESS_DAYS = [5, 12] as const;

/** Add n business days (Mon–Fri) to a date, in UTC. */
export function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

export interface FollowUpState { fu1: string | null; fu2: string | null; next: 'follow_up_1' | 'follow_up_2' | null; nextDue: string | null; overdue: boolean }

/** Due dates for the paid brand track. Absent first contact → nothing due (never a made-up date). */
export function followUps(b: { track?: string | null; first_contacted_at?: string | null; follow_ups_sent?: number | null; status?: string | null }, now: Date = new Date()): FollowUpState {
  const none: FollowUpState = { fu1: null, fu2: null, next: null, nextDue: null, overdue: false };
  if (b.track === 'local' || !b.first_contacted_at) return none;
  const t = Date.parse(b.first_contacted_at);
  if (!Number.isFinite(t)) return none;
  const start = new Date(t);
  const fu1 = addBusinessDays(start, FOLLOW_UP_BUSINESS_DAYS[0]).toISOString().slice(0, 10);
  const fu2 = addBusinessDays(start, FOLLOW_UP_BUSINESS_DAYS[1]).toISOString().slice(0, 10);
  /* A reply or a closed deal ends the follow-ups. */
  const live = b.status === 'contacted';
  const sent = b.follow_ups_sent ?? 0;
  const next = !live ? null : sent < 1 ? 'follow_up_1' : sent < 2 ? 'follow_up_2' : null;
  const nextDue = next === 'follow_up_1' ? fu1 : next === 'follow_up_2' ? fu2 : null;
  return { fu1, fu2, next, nextDue, overdue: !!nextDue && nextDue <= now.toISOString().slice(0, 10) };
}
