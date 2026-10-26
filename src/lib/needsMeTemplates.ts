/* ═════════════════════════════════════════════════════════════════
   THE ADMIN HOME'S ONE-TAP TEMPLATES (Concept A, Paul 2026-10-26). Pure.
   The six Meta templates (src/lib/dashboardTemplates.ts). ⛔ A MAPPED BUTTON IS ALWAYS PRESSABLE (Paul, 2026-10-26): Meta
   decides on the send. A refusal shows in the lead's Inbox thread (the failed message carries Meta's reason) and in the
   message after the press; the button stays usable. The one hard stop kept here is the business rule that Australia is
   prospect-only (no sign-up or payment messages).
   ⛔ A button sends ONLY through sendWhatsAppRequest → send-whatsapp-message (its dashboard branch): send hours, opt-outs,
   the 24-hour rule, the QA hold and Meta's template rules all apply there; nothing here bypasses them.
   ═════════════════════════════════════════════════════════════════ */
import type { DashboardTemplateName } from './dashboardTemplates.ts';

export type NeedsTemplateKey = DashboardTemplateName;

export interface NeedsTemplate {
  key: NeedsTemplateKey;
  /** The button text. */
  label: string;
  /** Never to a prospect-only market (Australia): it talks about the questions, the agreement or payment. */
  ukOnly: boolean;
}

export const NEEDS_TEMPLATES: Readonly<Record<NeedsTemplateKey, NeedsTemplate>> = {
  questionnaire_domain_help: { key: 'questionnaire_domain_help', label: 'Send domain help', ukOnly: true },
  questionnaire_payment_help: { key: 'questionnaire_payment_help', label: 'Send payment help', ukOnly: true },
  needs_from_you: { key: 'needs_from_you', label: 'Send what we need', ukOnly: true },
  agency_access: { key: 'agency_access', label: 'Send agency access', ukOnly: true },
  agreement_next_steps: { key: 'agreement_next_steps', label: 'Send agreement & next steps', ukOnly: true },
  nudge_24h: { key: 'nudge_24h', label: 'Send 24h nudge', ukOnly: false },
};

/** The template a row's button sends. A prospect-only (Australian) lead never gets a sign-up / payment template: it gets
 *  the 24-hour nudge instead, so the button is never dead (Paul, 2026-10-26) and the Australia rule still holds. */
export function effectiveTemplate(key: NeedsTemplateKey | null | undefined, ctx: { prospectOnly: boolean }): NeedsTemplateKey | null {
  if (!key || !NEEDS_TEMPLATES[key]) return null;
  return NEEDS_TEMPLATES[key].ukOnly && ctx.prospectOnly ? 'nudge_24h' : key;
}
