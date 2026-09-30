/* ══ THE ONE CONTACT-METHOD SET (2026-09-28) ═════════════════════════════════════════════════════
   ⛔ Every screen that asks HOW someone was contacted reads this list: the workspace's "Log a contact"
   pills, the History wording, the Sales dashboard's channel table, and the "sent another way" pickers
   for sign-up and report links. The database mirrors it and a test holds them together:
     - lead_log_contact's channel allowlist  = LOGGED_CONTACT_METHODS (migration 20260930120000)
     - the link-event channel CHECK          ⊇ LINK_SEND_METHODS
     - lead_contact_attempt_at (the claim rule) counts EVERY logged contact and every link SENT, so any
       method here that is logged or sent makes a lead unclaimable — nothing can be selectable here and
       ignored there.
   WhatsApp is a method but is never logged by hand: the send itself is the record (whatsapp_messages),
   so a hand log could only double-count it. Voicemail is the call's "Left voicemail" outcome, not a
   second call method. Values are stored in lead_activity.data.channel — never rename one; add.
   Facebook and Instagram became their own methods on 2026-09-30 (social outreach); 'social' stays for
   older rows and any other network, labelled "Other social message". */

export interface ContactMethod {
  value: string;
  /** Full name (History, the dashboard). */
  label: string;
  /** Pill text. */
  short: string;
  /** How it is recorded: by hand (lead_log_contact) or by the WhatsApp send itself. */
  recordedBy: 'log' | 'send';
  /** Shown as a pill; the rest sit under "More". */
  primary: boolean;
  /** Under the one Social pill (Social outreach → platform → outcome), never a pill of its own. */
  social?: boolean;
  /** A call has call outcomes (no answer, voicemail); everything else has "Sent, no reply yet". */
  kind: 'call' | 'message' | 'meeting';
}

export const CONTACT_METHODS: readonly ContactMethod[] = [
  { value: 'call', label: 'Phone call', short: 'Call', recordedBy: 'log', primary: true, kind: 'call' },
  { value: 'whatsapp', label: 'WhatsApp', short: 'WhatsApp', recordedBy: 'send', primary: true, kind: 'message' },
  { value: 'email', label: 'Email', short: 'Email', recordedBy: 'log', primary: true, kind: 'message' },
  { value: 'linkedin', label: 'LinkedIn message', short: 'LinkedIn', recordedBy: 'log', primary: false, social: true, kind: 'message' },
  { value: 'facebook', label: 'Facebook message', short: 'Facebook', recordedBy: 'log', primary: false, social: true, kind: 'message' },
  { value: 'instagram', label: 'Instagram DM', short: 'Instagram', recordedBy: 'log', primary: false, social: true, kind: 'message' },
  { value: 'in_person', label: 'In person / networking', short: 'In person', recordedBy: 'log', primary: true, kind: 'meeting' },
  { value: 'linkedin_voice', label: 'LinkedIn voice note', short: 'LinkedIn voice note', recordedBy: 'log', primary: false, kind: 'message' },
  { value: 'social', label: 'Other social message', short: 'Other social', recordedBy: 'log', primary: false, kind: 'message' },
  { value: 'sms', label: 'Text message', short: 'Text message', recordedBy: 'log', primary: false, kind: 'message' },
  { value: 'referral', label: 'Referral', short: 'Referral', recordedBy: 'log', primary: false, kind: 'meeting' },
  { value: 'video', label: 'Video outreach', short: 'Video', recordedBy: 'log', primary: false, kind: 'message' },
  { value: 'other', label: 'Other', short: 'Other', recordedBy: 'log', primary: false, kind: 'message' },
];

/** The Social pill's choices, in order: LinkedIn, Facebook, Instagram. */
export const SOCIAL_CONTACT_METHODS = CONTACT_METHODS.filter((m) => m.social);

/** Every method a person logs by hand — lead_log_contact's allowlist, exactly. */
export const LOGGED_CONTACT_METHODS = CONTACT_METHODS.filter((m) => m.recordedBy === 'log');

/** Methods a sign-up or report link can be recorded as "sent another way" (the link events' CHECK). */
export const LINK_SEND_METHOD_VALUES = ['email', 'linkedin', 'sms', 'in_person', 'other'] as const;
export const LINK_SEND_METHODS = LINK_SEND_METHOD_VALUES.map((v) => ({ value: v, label: contactMethodLabel(v) }));

/** Full label for a stored channel value. An unknown (older or newer) value shows as itself, readably. */
export function contactMethodLabel(value: string | null | undefined): string {
  const v = String(value ?? '');
  return CONTACT_METHODS.find((m) => m.value === v)?.label ?? (v ? v.replace(/_/g, ' ') : 'Contact');
}
