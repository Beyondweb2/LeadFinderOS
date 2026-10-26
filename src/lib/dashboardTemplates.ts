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

export type DashboardTemplateName = keyof typeof DASHBOARD_TEMPLATES;

/** ⛔ META'S APPROVED WORDS, ONLY AS PAUL PASTED THEM from WhatsApp Manager — never a draft, never invented ({{1}}, {{2}} as at
 *  Meta). A template listed here shows its real words in the Inbox thread and the Last 3 peek (dashboardTranscriptView), for
 *  old sends too; one not listed shows a tidy "template sent" card instead. The sender's stored line is unchanged either way
 *  (the queued-send drain reads needs_from_you's item back from it). */
export const DASHBOARD_TEMPLATE_WORDING: Partial<Record<DashboardTemplateName, string>> = {
  pick_up_conversation: 'Hi {{1}}, thanks for getting back to me, and sorry for the slow reply. Are you still interested in showing up when people ask AI for a recommendation?',
};

/** {{1}} / {{2}} filled. */
export function fillDashboardWording(wording: string, v1: string, v2 = ''): string {
  return wording.split('{{1}}').join(v1).split('{{2}}').join(v2);
}

/** pick_up_conversation's registered words (Paul, 2026-10-26). {{1}} = business name. */
export const PICK_UP_CONVERSATION_BODY = (business: string): string =>
  fillDashboardWording(DASHBOARD_TEMPLATE_WORDING.pick_up_conversation!, business || 'there');
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

/** ⛔ ONE DASHBOARD TEMPLATE TO ONE LEAD AT A TIME (Paul, 2026-10-26). The same template to the same lead again inside this
 *  window — or while one is still queued for their send hours — is refused by the sender (send-whatsapp-message's dashboard
 *  branch, recentDashboardSend) and the row's button is off (dashboardSendState.ts). A double press, a second tab or a retry
 *  never sends twice. A failed send never counts: the button is usable again at once. */
export const DASHBOARD_RESEND_WINDOW_MS = 10 * 60_000;
/** Queued-send states that mean "it has not gone yet, and will": a second press must not queue another. */
export const DASHBOARD_PENDING_QUEUE_STATUSES = ['scheduled', 'held', 'sending'] as const;
/** The templates a "What needs you" row sends — the dashboard's own and re_engage_49 — and so the ones the guard covers. */
export const NO_DOUBLE_SEND_TEMPLATES: readonly string[] = [...Object.keys(DASHBOARD_TEMPLATES), 're_engage_49'];
export function noDoubleSendTemplate(name: string | null | undefined): boolean {
  return NO_DOUBLE_SEND_TEMPLATES.includes(String(name ?? ''));
}
export const RECENTLY_SENT_REASON = 'This template already went to them in the last few minutes (or is queued for their send hours), so it was not sent again.';

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

/** How the Inbox and the Last 3 peek show a dashboard template's stored line (Paul, 2026-10-26: it must not read like a
 *  sentence we wrote to them). `words` = Meta's approved text filled in, when DASHBOARD_TEMPLATE_WORDING has it; else null and
 *  the screen draws a "template sent" card from label / who / neededItem. null = not a dashboard template's stored line. */
export interface DashboardTranscriptView { name: DashboardTemplateName; label: string; who: string; neededItem: string | null; words: string | null }

export function dashboardTranscriptView(templateName: string | null | undefined, stored: string | null | undefined): DashboardTranscriptView | null {
  if (!isDashboardTemplate(templateName)) return null;
  const name = templateName;
  const label = DASHBOARD_TEMPLATES[name].label;
  const wording = DASHBOARD_TEMPLATE_WORDING[name];
  const s = String(stored ?? '').trim();
  const marker = ` (WhatsApp template "${name}", Meta's approved wording) sent to `;
  const at = s.indexOf(marker);
  if (at < 0) {
    /* Already the real words (pick_up_conversation's transcript): shown as stored. */
    return s ? null : { name, label, who: '', neededItem: null, words: null };
  }
  const neededItem = neededItemFromTranscript(s);
  let who = s.slice(at + marker.length);
  if (neededItem) who = who.slice(0, who.lastIndexOf('. Needed: '));
  else if (who.endsWith('.')) who = who.slice(0, -1);
  who = who.trim();
  return { name, label, who, neededItem, words: wording ? fillDashboardWording(wording, who, neededItem ?? '') : null };
}
