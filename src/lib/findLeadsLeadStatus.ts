/* ══ FIND LEADS: THE STATUS OF A BUSINESS ALREADY IN THE CRM (2026-11-16, v1-team-visibility) ══════════════════════
   lead_identity_lookup (migration 20261217090000) returns `lead_status`, a coarse key decided by the SERVER from the
   matched lead (any owner, archived included) — safety first: an opt-out / Do Not Contact wins over every other status.
   This is the ONE place the key becomes words, so the badge, its tooltip and the admin marker say the same thing.
   ⛔ An unknown or absent key shows NO status (never guessed as "not contacted"): an older server sends none. */

export type FindLeadsLeadStatus =
  | 'opted_out' | 'do_not_contact' | 'wrong_number' | 'client' | 'archived' | 'not_interested' | 'contacted' | 'not_contacted';

export const FIND_LEADS_STATUS_LABEL: Record<FindLeadsLeadStatus, string> = {
  opted_out: 'Opted out',
  do_not_contact: 'Do Not Contact',
  wrong_number: 'Wrong number',
  client: 'Client',
  archived: 'Archived',
  not_interested: 'Not interested',
  contacted: 'Contacted',
  not_contacted: 'Not contacted yet',
};

export function asFindLeadsStatus(v: unknown): FindLeadsLeadStatus | null {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(FIND_LEADS_STATUS_LABEL, v) ? (v as FindLeadsLeadStatus) : null;
}

export function findLeadsStatusLabel(v: unknown): string | null {
  const s = asFindLeadsStatus(v);
  return s ? FIND_LEADS_STATUS_LABEL[s] : null;
}

/** The statuses that mean "never contact this business" — shown in red so nobody mistakes them for a normal lead. */
export function isStopStatus(v: unknown): boolean {
  const s = asFindLeadsStatus(v);
  return s === 'opted_out' || s === 'do_not_contact' || s === 'wrong_number';
}

/** The one line: "Added by Paul · Opted out". No added-by on record → "Already added · <status>". A phone on the
 *  opt-out / DNC list with NO lead (no one added it) → just the status, e.g. "Do Not Contact". */
export function alreadyAddedLine(addedByName: string | null | undefined, status: unknown, ownerName?: string | null, hasLead = true): string {
  const label = findLeadsStatusLabel(status);
  if (!hasLead && label) return label;
  const head = addedByName ? `Added by ${addedByName}` : ownerName ? `Already added · ${ownerName}` : 'Already added';
  return label ? `${head} · ${label}` : head;
}
