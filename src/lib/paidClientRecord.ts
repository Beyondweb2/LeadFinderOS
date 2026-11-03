/* ══ EVERYTHING FROM THE SALE, FOR PAUL (Paul, 2026-11-03, docs/commission-owed.md) ══════════════════════════════════════════════
   There is no handover form. What was typed on the prospect page and in Quick Close saves as it is typed, and when the client pays this
   gathers all of it for New paid clients, so he needs nothing else. Client's own answers rank above what Sales typed, the same rank as
   the setup checklist (handoffReadiness.ts). Lists are never merged.
   Pure. ⚠️ Edge-reachable: relative imports, explicit .ts. */
import { callNotesLines, cleanAnswers, type QuickCloseAnswers } from './quickClose.ts';
import { handoffSummaryLines } from './salesHandoff.ts';

export interface PaidClientLine { label: string; value: string }
export interface PaidClientNote { at: string; text: string }
export interface PaidClientRecord {
  contactName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  lines: PaidClientLine[];
  notes: PaidClientNote[];
}

/** The activity kinds a person typed words into on the prospect page. */
export const TYPED_ACTIVITY_KINDS: readonly string[] = ['note', 'call_outcome', 'contact_logged'];

const WEBSITE_CONTROL_WORDS: Record<string, string> = {
  client_controls: 'The client', agency_controls: 'An agency', no_website: 'No website', unknown: 'Not sure',
};
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const list = (v: unknown) => (Array.isArray(v) ? v.map(text).filter(Boolean) : []);

export function paidClientRecord(input: {
  lead: Record<string, unknown>;
  onboarding: Record<string, unknown> | null;
  activity: readonly { kind: string; body?: string | null; created_at: string }[];
}): PaidClientRecord {
  const { lead: L, onboarding: O } = input;
  const qc = (O?.quick_close ?? null) as { answers?: unknown; call?: unknown } | null;
  const answers: QuickCloseAnswers = cleanAnswers(qc?.answers);
  const lines: PaidClientLine[] = [];
  const add = (label: string, value: string) => { if (value) lines.push({ label, value }); };

  add('Address', text(O?.business_address) || text(L.address));
  const services = list(O?.services_list).length ? list(O?.services_list) : list(L.services_included);
  add('Services', services.join(', '));
  const areas = list(O?.areas_list).length ? list(O?.areas_list) : list(L.service_areas);
  add('Areas', areas.join(', '));
  const control = text(L.website_control);
  add('Who controls the website', WEBSITE_CONTROL_WORDS[control] ?? control);
  add('Website detail', text(L.website_control_note));
  for (const l of callNotesLines(answers, qc?.call as never)) add(l.label, l.answer);
  /* A sale made before the form was removed keeps what its salesperson wrote. */
  for (const l of handoffSummaryLines(L.sales_handoff as never)) { const at = l.indexOf('? '); if (at > 0) add(l.slice(0, at + 1), l.slice(at + 2)); else add('From the salesperson', l); }

  const notes = input.activity
    .filter((a) => TYPED_ACTIVITY_KINDS.includes(a.kind) && text(a.body))
    .map((a) => ({ at: a.created_at, text: text(a.body) }))
    .sort((a, b) => b.at.localeCompare(a.at));

  return {
    contactName: text(O?.contact_name) || text(L.contact_name) || null,
    phone: text(O?.confirmed_phone) || text(L.phone) || null,
    email: text(O?.contact_email) || text(L.email) || null,
    website: text(O?.business_website) || text(L.website) || null,
    lines, notes,
  };
}
