/* ══ EVERYTHING FROM THE SALE, FOR PAUL (Paul, 2026-11-03, docs/commission-owed.md) ══════════════════════════════════════════════
   There is no handover form. What was typed on the prospect page and in Quick Close saves as it is typed, and when the client pays this
   gathers all of it for New paid clients, so he needs nothing else. Client's own answers rank above what Sales typed, the same rank as
   the setup checklist (handoffReadiness.ts). Lists are never merged.
   Pure. ⚠️ Edge-reachable: relative imports, explicit .ts. */
import { callNotesLines, effectiveAnswers, type QuickCloseAnswers } from './quickClose.ts';
import { handoffSummaryLines } from './salesHandoff.ts';

export interface PaidClientLine { label: string; value: string }
export interface PaidClientNote { at: string; text: string }
/** The signed Client Service Agreement, as the acceptance row records it (2026-11-10). The PDF is on the client's page. */
export interface PaidClientAgreement { version: string; signedBy: string | null; role: string | null; at: string }
export interface PaidClientRecord {
  contactName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  /** null = no acceptance on record for this client (a client marked paid by hand, or one from before agreements). */
  agreement: PaidClientAgreement | null;
  lines: PaidClientLine[];
  notes: PaidClientNote[];
}

/** "Agreement v7.1 signed by Sam Lee (Owner)" — the date is drawn by the screen in UK time. */
export function agreementWords(a: PaidClientAgreement): string {
  const who = a.signedBy ? ` by ${a.signedBy}${a.role ? ` (${a.role})` : ''}` : '';
  return `Agreement ${a.version} signed${who}`;
}

/** The activity kinds a person typed words into on the prospect page. */
export const TYPED_ACTIVITY_KINDS: readonly string[] = ['note', 'call_outcome', 'contact_logged'];

const WEBSITE_CONTROL_WORDS: Record<string, string> = {
  client_controls: 'The client', agency_controls: 'An agency', no_website: 'No website', unknown: 'Not sure',
};
/** The four facts a client may correct before paying (quickClose.ts CLIENT_CONFIRMABLE_KEYS), in words. */
const CLIENT_CORRECTION_WORDS: Record<string, string> = {
  manager: 'who looks after the website', agency_contract: 'the agency contract', domain: 'the domain', rights: 'rights to the website',
};
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const list = (v: unknown) => (Array.isArray(v) ? v.map(text).filter(Boolean) : []);

export function paidClientRecord(input: {
  lead: Record<string, unknown>;
  onboarding: Record<string, unknown> | null;
  activity: readonly { kind: string; body?: string | null; created_at: string }[];
  /** The newest acceptance row for this client, if any (client_agreement_acceptances). */
  agreement?: Record<string, unknown> | null;
}): PaidClientRecord {
  const { lead: L, onboarding: O } = input;
  const qc = (O?.quick_close ?? null) as { answers?: unknown; call?: unknown; client_confirmed?: { changed?: unknown } | null } | null;
  /* The client's own correction on their sign-up page ranks above what Sales typed (the header's rule): effectiveAnswers
     lays it over the four situation facts. It used to read the salesperson's answers alone (2026-11-10). */
  const answers: QuickCloseAnswers = effectiveAnswers(qc as never);
  const lines: PaidClientLine[] = [];
  const add = (label: string, value: string) => { if (value) lines.push({ label, value }); };

  /* What the site is FOR comes first: the trade and the town (2026-11-10; they were in the email only). */
  add('Trade', text(L.category) || text(L.search_keyword));
  add('Town', text(O?.confirmed_location) || text(L.search_location));
  add('Address', text(O?.business_address) || text(L.address));
  const services = list(O?.services_list).length ? list(O?.services_list) : list(L.services_included);
  add('Services', services.join(', '));
  const areas = list(O?.areas_list).length ? list(O?.areas_list) : list(L.service_areas);
  add('Areas', areas.join(', '));
  const control = text(L.website_control);
  add('Who controls the website', WEBSITE_CONTROL_WORDS[control] ?? control);
  add('Website detail', text(L.website_control_note));
  for (const l of callNotesLines(answers, qc?.call as never)) add(l.label, l.answer);
  const corrected = list(qc?.client_confirmed?.changed).map((k) => CLIENT_CORRECTION_WORDS[k]).filter(Boolean);
  add('Corrected by the client at sign-up', corrected.join(', '));
  /* A sale made before the form was removed keeps what its salesperson wrote. */
  for (const l of handoffSummaryLines(L.sales_handoff as never)) { const at = l.indexOf('? '); if (at > 0) add(l.slice(0, at + 1), l.slice(at + 2)); else add('From the salesperson', l); }

  const notes = input.activity
    .filter((a) => TYPED_ACTIVITY_KINDS.includes(a.kind) && text(a.body))
    .map((a) => ({ at: a.created_at, text: text(a.body) }))
    .sort((a, b) => b.at.localeCompare(a.at));

  const A = input.agreement ?? null;
  const agreement: PaidClientAgreement | null = A && text(A.agreement_version) && text(A.accepted_at)
    ? { version: text(A.agreement_version), signedBy: text(A.typed_name) || null, role: text(A.typed_role) || null, at: text(A.accepted_at) }
    : null;

  return {
    /* The name they typed to SIGN is a contact name too (2026-11-10): a sale used to read "Not recorded: contact name"
       beside an agreement signed in that person's full name. */
    contactName: text(O?.contact_name) || text(L.contact_name) || agreement?.signedBy || null,
    phone: text(O?.confirmed_phone) || text(L.phone) || null,
    email: text(O?.contact_email) || text(L.email) || null,
    website: text(O?.business_website) || text(L.website) || null,
    agreement,
    lines, notes,
  };
}
