/* ═════════════════════════════════════════════════════════════════
   THE ADMIN DASHBOARD'S META TEMPLATES (Paul, 2026-10-26). Deno-free and import-free: the edge sender
   (send-whatsapp-message, _shared/whatsapp-send.ts) and the SPA (NeedsMeList) both read this, so the variables,
   and the transcript cannot drift.
   - questionnaire_domain_help  {{1}} business name
   - questionnaire_payment_help {{1}} business name
   - needs_from_you             {{1}} first name (else business name), {{2}} the item needed
   - agency_access              {{1}} first name (else business name)
   - agreement_next_steps       {{1}} first name (else business name)
   - nudge_24h                  {{1}} business name
   - pick_up_conversation       {{1}} business name — for a lead whose message is the latest (they replied last).
     Wording given by Paul (2026-10-26), so its transcript IS the message: PICK_UP_CONVERSATION_BODY.
   NOT wired (Paul): final_nudge, payment_failed.
   ⛔ META'S WORDING IS NOT COPIED HERE (except pick_up_conversation, which Paul gave word for word). The app cannot read it: the sending account's id is not known to the token
   (WHATSAPP_BUSINESS_ACCOUNT_ID unset, debug_token gives no ids; whatsapp_template_status holds only `no_waba`), and
   Paul cannot supply it (2026-10-26). Meta renders its own approved text to the prospect; the Inbox transcript says
   which template went and with what, never invented wording.
   ⛔ A MAPPED BUTTON IS ALWAYS PRESSABLE (Paul, 2026-10-26): Meta decides on the send; a refusal is the failed message in
   the lead's Inbox thread (with Meta's reason) and the message after the press. Nothing turns a button off.
   ═════════════════════════════════════════════════════════════════ */

export type DashboardTemplateVar = 'name' | 'greeting_name' | 'needed_item';

export const DASHBOARD_TEMPLATES = {
  questionnaire_domain_help: { label: 'Domain help', vars: ['name'] as DashboardTemplateVar[] },
  questionnaire_payment_help: { label: 'Payment help', vars: ['name'] as DashboardTemplateVar[] },
  needs_from_you: { label: 'What we need', vars: ['greeting_name', 'needed_item'] as DashboardTemplateVar[] },
  agency_access: { label: 'Agency access', vars: ['greeting_name'] as DashboardTemplateVar[] },
  agreement_next_steps: { label: 'Agreement & next steps', vars: ['greeting_name'] as DashboardTemplateVar[] },
  nudge_24h: { label: '24-hour nudge', vars: ['name'] as DashboardTemplateVar[] },
  pick_up_conversation: { label: 'Pick up the conversation', vars: ['name'] as DashboardTemplateVar[] },
} as const;

/** pick_up_conversation's registered words (Paul, 2026-10-26). {{1}} = business name. */
export const PICK_UP_CONVERSATION_BODY = (business: string): string =>
  `Hi ${business || 'there'}, thanks for getting back to me, and sorry for the slow reply. Are you still interested in showing up when people ask AI for a recommendation?`;

export type DashboardTemplateName = keyof typeof DASHBOARD_TEMPLATES;
export const DASHBOARD_TEMPLATE_NAMES = Object.keys(DASHBOARD_TEMPLATES) as DashboardTemplateName[];

/** Paul's own templates are all registered in plain English ("en"); a wrong language comes back from Meta as 132001
 *  and turns the button off with that reason. */
export const DASHBOARD_TEMPLATE_LANG = 'en';

export function isDashboardTemplate(name: string | null | undefined): name is DashboardTemplateName {
  return Object.prototype.hasOwnProperty.call(DASHBOARD_TEMPLATES, String(name ?? ''));
}

/** {{1}} for the first-name templates: the owner's first name, else the business name (Paul, 2026-10-26). */
export function dashboardGreeting(contactName: string | null | undefined, businessDisplayName: string): string {
  const first = (contactName ?? '').trim().split(/\s+/)[0] ?? '';
  return first || (businessDisplayName ?? '').trim();
}

export const NEEDED_ITEM_MAX = 200;
/** needs_from_you {{2}}: one line Meta will accept (no new line, tab or run of spaces), never blank, never long. */
export function cleanNeededItem(raw: unknown): { ok: true; value: string } | { ok: false; reason: string } {
  const v = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!v) return { ok: false, reason: 'no_needed_item' };
  if (v.length > NEEDED_ITEM_MAX) return { ok: false, reason: 'needed_item_too_long' };
  return { ok: true, value: v };
}

/** What the Inbox thread shows for a sent dashboard template (Meta renders the real words to the prospect). */
export function dashboardTemplateTranscript(name: DashboardTemplateName, v: { business: string; greeting?: string; neededItem?: string }): string {
  if (name === 'pick_up_conversation') return PICK_UP_CONVERSATION_BODY(v.business);
  const t = DASHBOARD_TEMPLATES[name];
  const who = (v.greeting || v.business || 'them').trim();
  return `${t.label} (WhatsApp template "${name}", Meta's approved wording) sent to ${who}${v.neededItem ? `. Needed: ${v.neededItem}` : ''}.`;
}

/** The exact inverse of dashboardTemplateTranscript's "Needed:" part. A send queued for the lead's send hours keeps only the
 *  template name and this stored line (inbox_scheduled_sends.body), so the drain reads {{2}} back from it; null = none. */
export function neededItemFromTranscript(text: string | null | undefined): string | null {
  const s = String(text ?? '');
  const at = s.lastIndexOf('. Needed: ');
  if (at < 0 || !s.endsWith('.')) return null;
  const v = s.slice(at + '. Needed: '.length, -1).trim();
  return v || null;
}
