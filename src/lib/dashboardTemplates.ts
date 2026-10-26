/* ═════════════════════════════════════════════════════════════════
   THE ADMIN DASHBOARD'S SIX META TEMPLATES (Paul, 2026-10-26). Deno-free and import-free: the edge sender
   (send-whatsapp-message, _shared/whatsapp-send.ts) and the SPA (NeedsMeList) both read this, so the variables,
   the transcript and the on/off rule cannot drift.
   - questionnaire_domain_help  {{1}} business name
   - questionnaire_payment_help {{1}} business name
   - needs_from_you             {{1}} first name (else business name), {{2}} the item needed
   - agency_access              {{1}} first name (else business name)
   - agreement_next_steps       {{1}} first name (else business name)
   - nudge_24h                  {{1}} business name
   NOT wired (Paul): final_nudge, payment_failed.
   ⛔ META'S WORDING IS NOT COPIED HERE. The app cannot read it: the sending account's id is not known to the token
   (WHATSAPP_BUSINESS_ACCOUNT_ID unset, debug_token gives no ids; whatsapp_template_status holds only `no_waba`), and
   Paul cannot supply it (2026-10-26). Meta renders its own approved text to the prospect; the Inbox transcript says
   which template went and with what, never invented wording.
   ⛔ ON / OFF FOLLOWS META'S OWN ANSWER, never a manual flip: the last real send of each template. Meta refusing it as
   a template problem (not approved, paused, disabled, wrong language…) turns the button off with Meta's reason for
   RETRY_AFTER_MS, then it is live again so the next press asks Meta again; a template Meta accepted stays on. The two
   Paul reported "In review" on 26 Oct start off for IN_REVIEW_GRACE_MS, then try.
   ═════════════════════════════════════════════════════════════════ */

export type DashboardTemplateVar = 'name' | 'greeting_name' | 'needed_item';

export const DASHBOARD_TEMPLATES = {
  questionnaire_domain_help: { label: 'Domain help', vars: ['name'] as DashboardTemplateVar[] },
  questionnaire_payment_help: { label: 'Payment help', vars: ['name'] as DashboardTemplateVar[] },
  needs_from_you: { label: 'What we need', vars: ['greeting_name', 'needed_item'] as DashboardTemplateVar[] },
  agency_access: { label: 'Agency access', vars: ['greeting_name'] as DashboardTemplateVar[] },
  agreement_next_steps: { label: 'Agreement & next steps', vars: ['greeting_name'] as DashboardTemplateVar[] },
  nudge_24h: { label: '24-hour nudge', vars: ['name'] as DashboardTemplateVar[] },
} as const;

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

/* ── On / off from Meta's own answer ─────────────────────────────────────────────────────────────── */

/** Meta's error codes that mean "this TEMPLATE cannot go" (sendErrorMeaning.ts has the words). A failure for any other
 *  reason (the number, the 24-hour window, an opt-out) says nothing about the template and never turns the button off. */
export const TEMPLATE_REFUSAL_CODES: ReadonlySet<string> = new Set(['132000', '132001', '132005', '132007', '132012', '132015', '132016']);
export const RETRY_AFTER_MS = 6 * 3_600_000;
export const IN_REVIEW_GRACE_MS = 24 * 3_600_000;
/** Paul, 26 Oct 2026: these two were In review at Meta; the other four Active. */
export const IN_REVIEW_SINCE: Partial<Record<DashboardTemplateName, string>> = {
  agency_access: '2026-10-26T12:00:00Z',
  nudge_24h: '2026-10-26T12:00:00Z',
};

export interface TemplateSend { status: string | null; error_code: string | number | null; error_title?: string | null; created_at: string }

export interface DashboardTemplateState { ok: boolean; reason?: string }

/** The button's state from the template's LAST real send (newest first). */
export function dashboardTemplateState(name: DashboardTemplateName, lastSend: TemplateSend | null | undefined, nowMs: number, meaning?: (code: string) => string | null): DashboardTemplateState {
  if (lastSend) {
    const code = lastSend.error_code == null ? '' : String(lastSend.error_code);
    const refused = String(lastSend.status ?? '').startsWith('failed') && TEMPLATE_REFUSAL_CODES.has(code);
    if (refused) {
      const age = nowMs - Date.parse(lastSend.created_at);
      if (age >= 0 && age < RETRY_AFTER_MS) {
        const words = meaning?.(code) ?? lastSend.error_title ?? `Meta error ${code}`;
        return { ok: false, reason: `Meta refused it: ${words} Tries again ${Math.max(1, Math.ceil((RETRY_AFTER_MS - age) / 3_600_000))}h after.` };
      }
      return { ok: true };
    }
    return { ok: true };
  }
  const since = IN_REVIEW_SINCE[name];
  if (since && nowMs - Date.parse(since) < IN_REVIEW_GRACE_MS) return { ok: false, reason: 'In review at Meta' };
  return { ok: true };
}
