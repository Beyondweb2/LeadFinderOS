/* ═════════════════════════════════════════════════════════════════
   THE ADMIN HOME'S ONE-TAP TEMPLATES (Concept A, Paul 2026-10-26). Pure.
   The dashboard's Meta templates (src/lib/dashboardTemplates.ts) and re_engage_49. They replied last → pick_up_conversation;
   we wrote last and they went quiet → re_engage_49 (or nudge_24h for the questionnaire's own 24-hour chase). ⛔ A MAPPED BUTTON IS ALWAYS PRESSABLE (Paul, 2026-10-26): Meta
   decides on the send. A refusal shows in the lead's Inbox thread (the failed message carries Meta's reason) and in the
   message after the press; the button stays usable. The one hard stop kept here is the business rule that Australia is
   prospect-only (no sign-up or payment messages).
   ⛔ A button sends ONLY through sendWhatsAppRequest → send-whatsapp-message (its dashboard branch): send hours, opt-outs,
   the 24-hour rule, the QA hold and Meta's template rules all apply there; nothing here bypasses them.
   ═════════════════════════════════════════════════════════════════ */
import type { DashboardTemplateName, DashboardTemplateVar } from './dashboardTemplates.ts';

/** The dashboard's own templates, plus re_engage_49 (approved 2026-09-12, already in the sender: "Where did we get to with
 *  this? Happy to pick it back up…") — the fit for a lead WE wrote to last who went quiet (Paul, 2026-10-26). */
export type NeedsTemplateKey = DashboardTemplateName | 're_engage_49';

export interface NeedsTemplate {
  key: NeedsTemplateKey;
  /** The button text. */
  label: string;
  /** Never to a prospect-only market (Australia): it talks about the questions, the agreement or payment. */
  ukOnly: boolean;
  /** Its variables, in order (for the confirm preview). */
  vars: DashboardTemplateVar[];
}

export const NEEDS_TEMPLATES: Readonly<Record<NeedsTemplateKey, NeedsTemplate>> = {
  questionnaire_domain_help: { key: 'questionnaire_domain_help', label: 'Send domain help', ukOnly: true, vars: ['name'] },
  questionnaire_payment_help: { key: 'questionnaire_payment_help', label: 'Send payment help', ukOnly: true, vars: ['name'] },
  needs_from_you: { key: 'needs_from_you', label: 'Send what we need', ukOnly: true, vars: ['greeting_name', 'needed_item'] },
  agency_access: { key: 'agency_access', label: 'Send agency access', ukOnly: true, vars: ['greeting_name'] },
  agreement_next_steps: { key: 'agreement_next_steps', label: 'Send agreement & next steps', ukOnly: true, vars: ['greeting_name'] },
  nudge_24h: { key: 'nudge_24h', label: 'Send 24h nudge', ukOnly: false, vars: ['name'] },
  /* They replied last (their message is the newest). */
  pick_up_conversation: { key: 'pick_up_conversation', label: 'Send pick-up message', ukOnly: false, vars: ['name'] },
  /* We wrote last and they went quiet. */
  re_engage_49: { key: 're_engage_49', label: 'Send re-engage', ukOnly: false, vars: ['name'] },
};

/** The template a row's button sends. A prospect-only (Australian) lead never gets a sign-up / payment template: it gets
 *  the 24-hour nudge instead, so the button is never dead (Paul, 2026-10-26) and the Australia rule still holds. */
export function effectiveTemplate(key: NeedsTemplateKey | null | undefined, ctx: { prospectOnly: boolean }): NeedsTemplateKey | null {
  if (!key || !NEEDS_TEMPLATES[key]) return null;
  return NEEDS_TEMPLATES[key].ukOnly && ctx.prospectOnly ? 'nudge_24h' : key;
}
